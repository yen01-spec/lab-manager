import { useEffect, useState } from 'react'
import { C, btnExcel } from '../../design'
import { supabase } from '../../supabase'
import { fetchAllPages } from '../../lib/fetchAllPages'
import * as XLSX from 'xlsx'

const GHS_PICTOGRAM_LABEL = {
  GHS01: '폭발성', GHS02: '인화성', GHS03: '산화성', GHS04: '고압가스', GHS05: '부식성',
  GHS06: '급성독성', GHS07: '유해성·자극성', GHS08: '건강유해성', GHS09: '환경유해성',
}
const STALE_DAYS = 180

// 화면 E — 유해인자 취급관리대장. "시약량 불일치" 지적사항 대응 — 대장에 별도로 보유수량
// 스냅샷을 저장하지 않고, 항상 시약 DB(재고) 데이터를 그 자리에서 조회해 보여준다.
// 구조적으로 대장과 실재고가 어긋날 수 없음(스펙 9-2). 대신 최근 확인일이 오래됐으면
// "재고 수치 자체가 오래된 정보일 수 있다"는 경고를 별도로 보여준다.
//
// 위험분석(H-code)은 스펙이 label_phrase_template 재사용을 제안했지만, 그건 14종
// 시드뿐이라 커버리지가 낮음 — 대신 이미 184개 시약에 채워져 있는
// reagents.hazard_classifications(KECO API, H코드 포함)를 재사용함(더 넓은 커버리지).
export default function HazardLedgerView() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [ppeByCas, setPpeByCas] = useState({})

  async function load() {
    setLoading(true)
    const reagents = await fetchAllPages((from, to) => supabase.from('reagents')
      .select('id, name, cas_no, hazard_classifications, ghs_pictograms, last_confirmed_at, reagent_lots(status, sealed_count, current_stock)')
      .neq('status', 'archived').range(from, to))

    const withStock = reagents.filter(r => (r.reagent_lots || []).some(l => l.status === 'active'))
    const casList = [...new Set(withStock.map(r => r.cas_no).filter(Boolean))]
    const [{ data: masters }, { data: notes }] = await Promise.all([
      casList.length > 0 ? supabase.from('school_chemical_master').select('cas_no, category_class').in('cas_no', casList) : Promise.resolve({ data: [] }),
      casList.length > 0 ? supabase.from('hazard_ledger_notes').select('*').in('cas_no', casList) : Promise.resolve({ data: [] }),
    ])
    const masterByCas = new Map((masters || []).map(m => [m.cas_no, m]))
    const ppeMap = Object.fromEntries((notes || []).map(n => [n.cas_no, n.required_ppe || '']))
    setPpeByCas(ppeMap)

    const built = withStock.map(r => {
      const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
      const totalSealed = activeLots.reduce((s, l) => s + (l.sealed_count || 0), 0)
      const avgStock = activeLots.length > 0 ? Math.round(activeLots.reduce((s, l) => s + (l.current_stock || 0), 0) / activeLots.length) : 0
      const pictograms = (r.ghs_pictograms || '').split('^').filter(Boolean)
      const isStale = !r.last_confirmed_at || (Date.now() - new Date(r.last_confirmed_at).getTime()) > STALE_DAYS * 86400000
      return {
        id: r.id, cas_no: r.cas_no || '-', name: r.name,
        stockText: `${totalSealed}병 · ${avgStock}%`,
        ghsLabels: pictograms.map(c => GHS_PICTOGRAM_LABEL[c] || c),
        categoryClass: r.cas_no ? (masterByCas.get(r.cas_no)?.category_class || '-') : '-',
        hCodes: (r.hazard_classifications || []).map(c => `${c.hCode || ''} ${c.name}`.trim()),
        lastConfirmedAt: r.last_confirmed_at,
        isStale,
      }
    })
    built.sort((a, b) => a.name.localeCompare(b.name))
    setRows(built)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function savePpe(cas_no, value) {
    setPpeByCas(prev => ({ ...prev, [cas_no]: value }))
    await supabase.from('hazard_ledger_notes').upsert({ cas_no, required_ppe: value, updated_at: new Date().toISOString() }, { onConflict: 'cas_no' })
  }

  function exportLedger() {
    const header = ['CAS No.', '물질명', '보유수량', 'GHS등급', '유별및성질', '위험분석(H-code)', '필요보호구', '최근확인일']
    const data = rows.map(r => [r.cas_no, r.name, r.stockText, r.ghsLabels.join(', '), r.categoryClass, r.hCodes.join(' / '), ppeByCas[r.cas_no] || '', r.lastConfirmedAt || '-'])
    const ws = XLSX.utils.aoa_to_sheet([header, ...data])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '유해인자취급관리대장')
    const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
    XLSX.writeFile(wb, `유해인자취급관리대장_${dateStr}.xlsx`)
  }

  return (
    <div>
      <div style={{
        fontFamily: 'monospace', fontSize: '12px', background: '#DCEAE5', color: '#1F6F5C',
        border: '1px solid #1F6F5C', padding: '8px 12px', display: 'inline-block', marginBottom: '18px', borderRadius: '6px',
      }}>✓ 시약 DB 실시간 연동 — 보유수량이 재고 데이터와 자동 일치 (수기 불일치 문제 원천 차단)</div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>현재 보유중(active lot)인 시약이 없습니다.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr>
                {['CAS No.', '물질명', '보유수량', 'GHS등급', '유별및성질', '위험분석(H-code)', '필요보호구'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: '11px', color: C.muted, borderBottom: `2px solid ${C.text}`, padding: '7px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ background: r.isStale ? '#FFF8E7' : undefined }}>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.cas_no}</td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px', fontWeight: '600' }}>{r.name}</td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px', whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#1F6F5C' }}>{r.stockText}</span>
                    {r.isStale && <div title="최근 확인일이 오래됐거나 없어요" style={{ fontSize: '10.5px', color: '#B7791F', marginTop: '2px' }}>⚠ 확인일 오래됨</div>}
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px', color: C.muted, whiteSpace: 'nowrap' }}>{r.ghsLabels.join(', ') || '-'}</td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px', color: C.muted, whiteSpace: 'nowrap' }}>{r.categoryClass}</td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px', fontSize: '11px', color: C.muted, minWidth: '220px' }}>
                    {r.hCodes.length > 0 ? r.hCodes.map((h, i) => <div key={i}>{h}</div>) : '자료없음'}
                  </td>
                  <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px 7px' }}>
                    <input defaultValue={ppeByCas[r.cas_no] || ''} onBlur={e => savePpe(r.cas_no, e.target.value)}
                      placeholder="예: 보안경, 보호장갑" style={{ width: '160px', padding: '5px 7px', border: `1px solid ${C.border}`, borderRadius: '5px', fontSize: '12px' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px' }}>
        <div style={{ fontSize: '11.5px', color: C.muted }}>⚠ 확인일 오래됨 표시는 최근 확인일이 {STALE_DAYS}일 이상 지났거나 아예 없는 경우입니다 — 재고실사로 갱신해주세요.</div>
        <button onClick={exportLedger} style={btnExcel}>📊 관리대장 내보내기 (XLSX)</button>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: C.muted, borderTop: `1px dashed ${C.border}`, paddingTop: '14px' }}>
        ※ 컬럼 구성은 강원대 위험분석보고서(별지 제2호서식)의 화학물질별 표 기준 · 유별및성질은 school_chemical_master, 위험분석(H-code)은
        reagents.hazard_classifications(KECO API, 184건 매칭) 재사용 — 그 외 시약은 "자료없음"으로 표시됩니다.
      </div>
    </div>
  )
}
