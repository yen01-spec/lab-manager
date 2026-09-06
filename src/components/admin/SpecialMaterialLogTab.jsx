import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, btnGhost, btnPrimary, inputStyle, labelStyle, thStyle, tdStyle } from '../../design'
import { exportSpecialMaterialLogs } from '../../exportUtils'

// 특별관리물질 취급일지 전체 조회/확인/내보내기 — 산업안전보건기준에관한 규칙 제439조.
// 법정 보존기한 30년이라 삭제 기능은 두지 않는다.
export default function SpecialMaterialLogTab({ student }) {
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [labName, setLabName] = useState('')
  const [labDirector, setLabDirector] = useState('')

  useEffect(() => { fetchLogs() }, [])

  async function fetchLogs() {
    const { data } = await supabase.from('special_material_logs')
      .select('*').is('deleted_at', null).order('handling_date', { ascending: false }).limit(500)
    setLogs(data || [])
  }

  async function confirmLog(log) {
    if (!student) { alert('로그인 후 이용해주세요'); return }
    await supabase.from('special_material_logs').update({
      confirmed_by_student_id: student.student_id, confirmed_by_name: student.name,
      confirmed_at: new Date().toISOString(),
    }).eq('id', log.id)
    fetchLogs()
  }

  const filtered = logs.filter(l => !search.trim() || [l.substance_name, l.handler_name, l.cas_no].some(v => v?.toLowerCase().includes(search.trim().toLowerCase())))

  return (
    <Card title="🚨 특별관리물질 취급일지" sub="산업안전보건기준에관한 규칙 제439조 — 법정 보존 30년, 삭제 불가">
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="물질명/CAS/취급자 검색"
          style={{ ...inputStyle, width: '220px' }} />
        <div><label style={labelStyle}>연구실명</label>
          <input value={labName} onChange={e => setLabName(e.target.value)} style={{ ...inputStyle, width: '160px' }} /></div>
        <div><label style={labelStyle}>연구실 책임자명</label>
          <input value={labDirector} onChange={e => setLabDirector(e.target.value)} style={{ ...inputStyle, width: '140px' }} /></div>
        <button onClick={() => exportSpecialMaterialLogs(filtered, labName, labDirector)} style={btnPrimary}>📥 원본 양식으로 내보내기</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['취급일자', '물질명', 'CAS', '최초입고량', '취급량', '작업내용', '보호구', '사고내용', '취급자', '확인'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
        <tbody>
          {filtered.length === 0
            ? <tr><td colSpan={10} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>기록이 없습니다</td></tr>
            : filtered.map(l => (
              <tr key={l.id}>
                <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{l.handling_date}</td>
                <td style={{ ...tdStyle, fontWeight: '600' }}>{l.substance_name}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{l.cas_no || '-'}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{l.initial_amount || '-'}</td>
                <td style={tdStyle}>{l.amount || '-'}</td>
                <td style={{ ...tdStyle, maxWidth: '200px' }}>{l.work_description || '-'}</td>
                <td style={{ ...tdStyle, color: C.muted }}>{l.ppe_worn || '-'}</td>
                <td style={{ ...tdStyle, color: l.incident_details ? C.danger : C.muted }}>{l.incident_details || '-'}</td>
                <td style={tdStyle}>{l.handler_name}</td>
                <td style={tdStyle}>
                  {l.confirmed_by_name
                    ? <span style={{ color: '#00875A', fontSize: '12px', fontWeight: '600' }}>✓ {l.confirmed_by_name}</span>
                    : <button onClick={() => confirmLog(l)} style={{ ...btnGhost, padding: '4px 10px', fontSize: '11.5px' }}>확인하기</button>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  )
}
