import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { C, inputStyle, btnExcel } from '../../design'
import { supabase } from '../../supabase'

const CAS_RE = /^\d{2,7}-\d{2}-\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function locLabel(loc) {
  if (!loc) return ''
  return `${loc.room}${loc.detail ? ' ' + loc.detail : ''}`
}

export default function SchoolRegistrationView() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function loadCandidates() {
    setLoading(true)
    const sinceDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
    const { data: lots } = await supabase.from('reagent_lots')
      .select('id, lot_no, sealed_count, received_date, expiry_date, location_id, reagents(id, name, cas_no)')
      .gte('received_date', sinceDate)
      .eq('status', 'active')
      .order('received_date', { ascending: false })
      .limit(500)
    const casList = [...new Set((lots || []).map(l => l.reagents?.cas_no).filter(Boolean))]
    const locIds = [...new Set((lots || []).map(l => l.location_id).filter(Boolean))]
    const [{ data: masters }, { data: locations }] = await Promise.all([
      casList.length > 0 ? supabase.from('school_chemical_master').select('*').in('cas_no', casList) : Promise.resolve({ data: [] }),
      locIds.length > 0 ? supabase.from('locations').select('id, room, detail').in('id', locIds) : Promise.resolve({ data: [] }),
    ])
    const masterByCas = new Map((masters || []).map(m => [m.cas_no, m]))
    const locById = new Map((locations || []).map(l => [l.id, l]))

    const built = (lots || []).filter(l => l.reagents).map(l => {
      const master = l.reagents.cas_no ? masterByCas.get(l.reagents.cas_no) : null
      return {
        id: l.id,
        included: !!master,
        matched: !!master,
        cas_no: l.reagents.cas_no || '',
        name: master?.name || l.reagents.name,
        unit: master?.unit || '',
        volume: '',
        quantity: String(l.sealed_count ?? ''),
        location: locLabel(locById.get(l.location_id)),
        received_date: l.received_date || '',
        expiry_date: l.expiry_date || '',
        category: master ? '화학' : '',
      }
    })
    setRows(built)
    setLoading(false)
  }

  useEffect(() => { loadCandidates() }, [days])

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const matchedCount = rows.filter(r => r.matched).length
  const unmatchedCount = rows.length - matchedCount

  function validate(r) {
    const errors = []
    if (!CAS_RE.test(r.cas_no)) errors.push('CAS 형식 오류')
    if (!r.name.trim()) errors.push('화학물질명 필요')
    if (!r.unit.trim()) errors.push('단위 필요')
    if (!r.volume.trim() || isNaN(Number(r.volume))) errors.push('용량 숫자 필요')
    if (!r.quantity.trim() || isNaN(Number(r.quantity))) errors.push('입고수량 숫자 필요')
    if (r.received_date && !DATE_RE.test(r.received_date)) errors.push('입고일 형식 오류(YYYY-MM-DD)')
    if (r.expiry_date && !DATE_RE.test(r.expiry_date)) errors.push('유효기간 형식 오류(YYYY-MM-DD)')
    if (r.category !== '화학' && r.category !== '가스') errors.push('분류는 화학/가스 중 하나')
    return errors
  }

  function generateExcel() {
    const included = rows.filter(r => r.included)
    if (included.length === 0) { alert('포함할 항목을 선택해주세요.'); return }
    const invalid = included.map(r => ({ r, errors: validate(r) })).filter(x => x.errors.length > 0)
    if (invalid.length > 0) {
      alert(`${invalid.length}건에 입력 오류가 있어요:\n` + invalid.slice(0, 5).map(x => `- ${x.r.name || x.r.cas_no}: ${x.errors.join(', ')}`).join('\n'))
      return
    }
    setGenerating(true)
    // 원본 RegChemicalSample.xlsx "화학물질등록" 시트와 동일한 구조(안내문 7줄 + 헤더 + 데이터)로 생성
    const aoa = [
      ['화학물질 등록'],
      ['※주의'],
      ['1. CAS No. 123456-12-1의 형식으로 입력하세요 예)10034-93-2'],
      ["2. 입고일/유효기간은 'YYYY-MM-DD'형식으로 입력하세요(선택입력) 예)2015-04-18"],
      ['3. 보관위치는 화학물질의 보관위치를 입력하세요(선택입력) 예)배기형시약장1'],
      ['4. 화학물질의 단위를 꼭 확인하세요. 위험물 지정수량 초과시 과태료 처분을 받을 수 있습니다. (위험물 및 지정수량 시트 참고)'],
      ['5.분류: 화학 또는 가스 필수 입력'],
      [],
      ['CAS No.', '화학물질명', '단위', '용량', '연구실입고수량', '보관위치', '입고일', '유효기간', '분류'],
      ...included.map(r => [r.cas_no, r.name, r.unit, Number(r.volume), Number(r.quantity), r.location, r.received_date, r.expiry_date, r.category]),
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '화학물질등록')
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
    XLSX.writeFile(wb, `화학물질등록_${dateStr}.xlsx`)
    setGenerating(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', color: C.muted }}>최근</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ ...inputStyle, width: '100px' }}>
          {[7, 30, 90, 365].map(d => <option key={d} value={d}>{d}일</option>)}
        </select>
        <label style={{ fontSize: '13px', color: C.muted }}>입고분 기준 · 시약 DB의 CAS를 학교 화학물질정보 마스터(17,485건)에 대조해 공식 명칭·단위를 자동으로 채웁니다.</label>
      </div>

      <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ flex: 1, padding: '14px 18px', borderRight: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: 'monospace', fontSize: '26px', fontWeight: '700', color: '#1F6F5C' }}>{matchedCount}</div>
          <div style={{ fontSize: '12px', color: C.muted }}>학교 DB 매칭 성공</div>
        </div>
        <div style={{ flex: 1, padding: '14px 18px', background: unmatchedCount > 0 ? '#FDECEC' : undefined }}>
          <div style={{ fontFamily: 'monospace', fontSize: '26px', fontWeight: '700', color: C.danger }}>{unmatchedCount}</div>
          <div style={{ fontSize: '12px', color: C.muted }}>학교 DB 미등록 — 수동 확인 필요</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>선택한 기간에 새로 입고된 시약이 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr>
                {['', '매칭', 'CAS No.', '화학물질명', '단위', '용량', '입고수량', '보관위치', '입고일', '유효기간', '분류'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '11px', color: C.muted, borderBottom: `2px solid ${C.text}`, padding: '8px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ background: !r.matched ? '#FDECEC' : undefined }}>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input type="checkbox" checked={r.included} onChange={e => updateRow(r.id, { included: e.target.checked })} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    {r.matched
                      ? <span style={{ fontFamily: 'monospace', fontSize: '10.5px', background: '#DCEAE5', color: '#1F6F5C', border: '1px solid #1F6F5C', padding: '2px 6px' }}>✓ 매칭</span>
                      : <span style={{ fontFamily: 'monospace', fontSize: '10.5px', background: '#FDECEC', color: C.danger, border: `1px solid ${C.danger}`, padding: '2px 6px' }}>⚠ 미등록</span>}
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.cas_no || '-'}</td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.name} disabled={r.matched} onChange={e => updateRow(r.id, { name: e.target.value })}
                      style={{ ...inputStyle, minWidth: '160px', background: r.matched ? '#F3F4F6' : C.white }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.unit} disabled={r.matched} onChange={e => updateRow(r.id, { unit: e.target.value })}
                      style={{ ...inputStyle, width: '60px', background: r.matched ? '#F3F4F6' : C.white }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.volume} onChange={e => updateRow(r.id, { volume: e.target.value })} placeholder="숫자" style={{ ...inputStyle, width: '70px' }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.quantity} onChange={e => updateRow(r.id, { quantity: e.target.value })} style={{ ...inputStyle, width: '60px' }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.location} onChange={e => updateRow(r.id, { location: e.target.value })} style={{ ...inputStyle, minWidth: '110px' }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.received_date} onChange={e => updateRow(r.id, { received_date: e.target.value })} placeholder="YYYY-MM-DD" style={{ ...inputStyle, width: '110px' }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    <input value={r.expiry_date} onChange={e => updateRow(r.id, { expiry_date: e.target.value })} placeholder="YYYY-MM-DD" style={{ ...inputStyle, width: '110px' }} />
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '6px 8px' }}>
                    {r.matched ? (
                      <input value={r.category} disabled style={{ ...inputStyle, width: '70px', background: '#F3F4F6' }} />
                    ) : (
                      <select value={r.category} onChange={e => updateRow(r.id, { category: e.target.value })} style={{ ...inputStyle, width: '80px' }}>
                        <option value="">선택</option>
                        <option value="화학">화학</option>
                        <option value="가스">가스</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
        <div style={{ fontSize: '12px', color: C.muted }}>체크된 항목만 엑셀에 포함됩니다. ⚠ 미등록 항목은 CAS·명칭 재확인 후 포함 여부를 결정하세요.</div>
        <button onClick={generateExcel} disabled={generating} style={{ ...btnExcel, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}>{generating ? '생성 중...' : '📊 화학물질등록 엑셀 생성 (.xlsx)'}</button>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: C.muted, borderTop: `1px dashed ${C.border}`, paddingTop: '14px' }}>
        ※ 생성 파일은 「화학물질등록」 시트 헤더(CAS No./화학물질명/단위/용량/연구실입고수량/보관위치/입고일/유효기간/분류)와 동일한 구조로 출력됩니다 ·
        분류는 학교 마스터에 화학/가스 구분이 없어 매칭된 항목은 일괄 "화학"으로 채워지니, 가스류라면 직접 확인해서 고쳐주세요 ·
        CAS 형식 <code>123456-12-1</code>, 날짜 <code>YYYY-MM-DD</code> 자동 검증
      </div>
    </div>
  )
}
