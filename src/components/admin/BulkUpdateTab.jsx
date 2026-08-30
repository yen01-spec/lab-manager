import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, btnPrimary, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  정보 일괄 갱신
// ══════════════════════════════════════════════
export default function BulkUpdateTab() {
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, done: false })
  const [results, setResults] = useState([])
  const [filter, setFilter] = useState('all') // all, empty

const GHS_KEY = import.meta.env.VITE_GHS_API_KEY

useEffect(() => { fetchReagents() }, [filter])

  async function fetchReagents() {
  let query = supabase.from('reagents')
  .select('id, name, cas_no, hazard', { count: 'exact' })
  .order('name')
if (filter === 'empty') query = query.is('hazard', null)
query = query.range(0, 4999)
const { data, count } = await query
if (count > 4999) {
  alert(`⚠️ 시약이 ${count}개로 많아 일부만 표시됩니다.`)
}
if (data) setReagents(data)
}

  async function runBulkUpdate() {
  const targets = reagents.filter(r => r.cas_no || r.name)
  if (targets.length === 0) { alert('시약이 없습니다'); return }
  if (!window.confirm(`${targets.length}개 시약을 일괄 업데이트하시겠습니까?\n시간이 걸릴 수 있어요.`)) return

  setLoading(true)
  setProgress({ current: 0, total: targets.length, done: false })
  setResults([])

  const newResults = []
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i]
    setProgress({ current: i + 1, total: targets.length, done: false })
    try {
      let casNo = r.cas_no
      let foundByCas = false
      let foundByName = false

      // CAS 없으면 시약명으로 PubChem에서 CAS 조회
      if (!casNo && r.name) {
        try {
          const cidRes = await fetch(
            `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(r.name)}/property/IUPACName,MolecularFormula/JSON`
          )
          if (cidRes.ok) {
            // CAS 번호 조회
            const synRes = await fetch(
              `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(r.name)}/synonyms/JSON`
            )
            if (synRes.ok) {
              const synData = await synRes.json()
              const synonyms = synData?.InformationList?.Information?.[0]?.Synonym || []
              const casPattern = /^\d{2,7}-\d{2}-\d$/
              casNo = synonyms.find(s => casPattern.test(s)) || null
              if (casNo) foundByName = true
            }
          }
        } catch {}
      } else if (casNo) {
        foundByCas = true
      }

      // CAS 번호로 GHS API 조회
      if (casNo) {
        const ghsRes = await fetch(
          `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(casNo)}&pageNo=1&numOfRows=1&returnType=JSON`
        )
        if (ghsRes.ok) {
          const ghsData = await ghsRes.json()
          const items = ghsData?.body?.items
          const first = Array.isArray(items) ? items[0] : items
          if (first) {
            const korName = first.sbstnNmKor || ''
            const hazard = first.hrmflnList
              ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ')
              : ''
            const isYudok = first.sbstnTypeUnqno ? first.sbstnTypeUnqno.split('^')[0] : ''

            // DB 업데이트
            const updateData = {
              hazard: hazard || r.hazard,
              data_source: 'ghs_api',
            }
            if (!r.cas_no && casNo) updateData.cas_no = casNo
            if (!r.name && korName) updateData.name = korName

            await supabase.from('reagents').update(updateData).eq('id', r.id)

            newResults.push({
              name: r.name, cas_no: casNo, korName, hazard, isYudok,
              source: foundByName ? '시약명→CAS→GHS' : 'CAS→GHS',
              status: 'success'
            })
          } else {
            // GHS DB에 없지만 CAS는 찾음
            if (foundByName && casNo) {
              await supabase.from('reagents').update({
                cas_no: casNo, data_source: 'pubchem'
              }).eq('id', r.id)
            }
            newResults.push({ name: r.name, cas_no: casNo, status: 'notfound', source: foundByName ? '시약명→CAS' : 'CAS만' })
          }
        }
      } else {
        newResults.push({ name: r.name, cas_no: null, status: 'nocas', source: '-' })
      }
    } catch {
      newResults.push({ name: r.name, cas_no: r.cas_no, status: 'error', source: '-' })
    }
    setResults([...newResults])
    await new Promise(res => setTimeout(res, 500))
  }
  setProgress(prev => ({ ...prev, done: true }))
  setLoading(false)
}

  const successCount = results.filter(r => r.status === 'success').length
  const notFoundCount = results.filter(r => r.status === 'notfound').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="🔄 시약 정보 일괄 갱신" sub="Bulk Update">
        <div style={{ marginBottom: '16px', padding: '12px 16px',
          background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '13px' }}>
          ⚠️ CAS 번호가 등록된 시약의 <strong>유해성 정보</strong>를 한국환경공단 GHS API로 일괄 업데이트해요.
          API 제한으로 시약 1개당 0.5초 소요됩니다.
        </div>

        {/* 필터 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[['all','전체'], ['empty','유해성 없는 것만']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '6px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: filter === key ? C.navy : C.bg,
              color: filter === key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: filter === key ? '700' : '400',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ marginBottom: '16px', fontSize: '13px', color: C.muted }}>
          CAS 번호 있는 시약: <strong style={{ color: C.navy }}>{reagents.filter(r => r.cas_no).length}개</strong>
          {' / '}전체: {reagents.length}개
        </div>

        {/* 진행 상황 */}
        {loading && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
              <span>진행 중... ({progress.current}/{progress.total})</span>
              <span>{Math.round(progress.current / progress.total * 100)}%</span>
            </div>
            <div style={{ background: C.bg, borderRadius: '8px', height: '8px', overflow: 'hidden' }}>
              <div style={{
                background: C.navy, height: '100%', borderRadius: '8px',
                width: `${progress.current / progress.total * 100}%`,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        )}

        {progress.done && (
          <div style={{ marginBottom: '16px', padding: '12px 16px',
            background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
            ✅ 완료! 성공 <strong>{successCount}개</strong> / 미등록 <strong>{notFoundCount}개</strong>
          </div>
        )}

        <button onClick={runBulkUpdate} disabled={loading} style={{
          ...btnPrimary, background: '#667EEA',
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? `갱신 중... (${progress.current}/${progress.total})` : '🔄 일괄 갱신 시작'}
        </button>
      </Card>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <Card title="📋 갱신 결과" noPadding>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['시약명', 'CAS No.', '한글명', '유해성', '출처', '결과'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                  <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.cas_no}</td>
                  <td style={{ ...tdStyle, fontSize: '12px' }}>{r.korName || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.source || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', maxWidth: '200px' }}>{r.hazard || '-'}</td>
                  <td style={tdStyle}>
                    {r.status === 'success' && <span style={{ color: '#276749', fontWeight: '700', fontSize: '12px' }}>✅ 성공</span>}
                    {r.status === 'notfound' && <span style={{ color: C.muted, fontSize: '12px' }}>미등록</span>}
                    {r.status === 'error' && <span style={{ color: C.danger, fontSize: '12px' }}>❌ 오류</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
