import { useEffect, useState } from 'react'
import { C, inputStyle, btnExcel } from '../../design'
import {
  fetchActiveLotsSince, buildSchoolRegistrationRows,
  validateSchoolRegistrationRow, writeSchoolRegistrationExcel,
} from '../../lib/schoolRegistrationExport'

export default function SchoolRegistrationView() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function loadCandidates() {
    setLoading(true)
    const lots = await fetchActiveLotsSince(days)
    const built = await buildSchoolRegistrationRows(lots)
    setRows(built)
    setLoading(false)
  }

  useEffect(() => { loadCandidates() }, [days])

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const matchedCount = rows.filter(r => r.matched).length
  const unmatchedCount = rows.length - matchedCount

  function generateExcel() {
    const included = rows.filter(r => r.included)
    if (included.length === 0) { alert('포함할 항목을 선택해주세요.'); return }
    const invalid = included.map(r => ({ r, errors: validateSchoolRegistrationRow(r) })).filter(x => x.errors.length > 0)
    if (invalid.length > 0) {
      alert(`${invalid.length}건에 입력 오류가 있어요:\n` + invalid.slice(0, 5).map(x => `- ${x.r.name || x.r.cas_no}: ${x.errors.join(', ')}`).join('\n'))
      return
    }
    setGenerating(true)
    writeSchoolRegistrationExcel(included)
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
