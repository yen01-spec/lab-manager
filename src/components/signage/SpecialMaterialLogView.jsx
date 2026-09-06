import { useEffect, useState } from 'react'
import { C, inputStyle, labelStyle } from '../../design'
import { supabase } from '../../supabase'
import { fetchAllPages } from '../../lib/fetchAllPages'
import { getSpecialManagementInfo } from '../../lib/specialManagementSubstances'
import SpecialMaterialLogModal from '../reagents/SpecialMaterialLogModal'
import { exportSpecialMaterialLogs } from '../../exportUtils'

// 화면 D — 특별관리물질 취급일지. 산업안전보건기준에관한 규칙 제439조.
// 44종 CAS 매칭 기능을 재사용해 "기록 가능한 물질"을 특별관리물질로만 제한한다
// (일반 시약 오기록 방지). 기록은 수정 가능·삭제 불가(관리자 예외 시 사유 남기고 soft-delete).
export default function SpecialMaterialLogView({ student, isAdmin }) {
  const [labProfile, setLabProfile] = useState({ lab_name: '', lab_professor: '' })
  const [candidates, setCandidates] = useState([]) // 44종 매칭된 시약(드롭다운용, CAS 중복 제거)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [editingLog, setEditingLog] = useState(null)
  const [substanceFilter, setSubstanceFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  async function loadAll() {
    setLoading(true)
    const [{ data: settings }, reagents, { data: logRows }] = await Promise.all([
      supabase.from('app_settings').select('key, value').in('key', ['lab_name', 'lab_professor']),
      fetchAllPages((from, to) => supabase.from('reagents').select('id, name, cas_no').neq('status', 'archived').range(from, to)),
      supabase.from('special_material_logs').select('*').is('deleted_at', null).order('handling_date', { ascending: false }).limit(500),
    ])
    const settingsMap = Object.fromEntries((settings || []).map(s => [s.key, s.value]))
    setLabProfile({ lab_name: settingsMap.lab_name || '', lab_professor: settingsMap.lab_professor || '' })

    const seenCas = new Set()
    const matched = []
    reagents.forEach(r => {
      if (!r.cas_no || seenCas.has(r.cas_no)) return
      const info = getSpecialManagementInfo(r.name, r.cas_no)
      if (info?.status === 'confirmed') { seenCas.add(r.cas_no); matched.push(r) }
    })
    matched.sort((a, b) => a.name.localeCompare(b.name))
    setCandidates(matched)
    setLogs(logRows || [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  function openNew() {
    if (candidates.length === 0) { alert('현재 44종 특별관리물질로 확정 매칭된 시약이 없어요.'); return }
    setSelectedReagent(null)
    setEditingLog(null)
    setShowModal(true)
  }
  function openEdit(log) {
    setSelectedReagent(null)
    setEditingLog(log)
    setShowModal(true)
  }

  async function softDelete(log) {
    if (!isAdmin) return
    const reason = prompt('삭제 사유를 입력하세요 (법정 보존 대상이라 관리자만 예외적으로 삭제할 수 있어요):')
    if (!reason || !reason.trim()) return
    await supabase.from('special_material_logs').update({
      deleted_at: new Date().toISOString(), deleted_by_student_id: student?.student_id, deleted_by_name: student?.name, delete_reason: reason,
    }).eq('id', log.id)
    loadAll()
  }

  const filtered = logs.filter(l => {
    if (substanceFilter && l.substance_name !== substanceFilter) return false
    if (dateFilter && !l.handling_date?.startsWith(dateFilter)) return false
    return true
  })
  const substanceNames = [...new Set(logs.map(l => l.substance_name))].sort()

  return (
    <div>
      <div style={{ padding: '12px 16px', background: '#FDECEC', border: `1px solid ${C.danger}`, borderRadius: '8px', fontSize: '13px', color: C.text, marginBottom: '20px' }}>
        산업안전보건기준에 관한 규칙 <b>제439조</b> 대응 — 44종 특별관리물질에 해당하는 시약만 기록 대상으로 노출됩니다.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '28px' }}>
        <div style={{ border: `1px solid ${C.border}`, background: C.bg, padding: '20px', borderRadius: '10px' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '15px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px' }}>신규 기록</h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>연구실명 / 책임자명</label>
            <input value={`${labProfile.lab_name || '(미설정)'} / ${labProfile.lab_professor || '(미설정)'}`} disabled style={{ ...inputStyle, background: '#F3F4F6' }} />
            <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>app_settings의 lab_name/lab_professor 값 — 관리자가 DB에서 직접 설정</div>
          </div>
          <div style={{ fontSize: '12.5px', color: C.muted, marginBottom: '14px' }}>
            기록 가능한 물질: <b>{candidates.length}종</b>(현재 특별관리물질 확정 매칭)
          </div>
          <button onClick={openNew} style={{
            width: '100%', padding: '11px', borderRadius: '8px', border: 'none',
            background: C.navy, color: '#fff', fontWeight: '700', fontSize: '13.5px', cursor: 'pointer',
          }}>+ 새 취급 기록 작성</button>
          <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#1F6F5C', border: '1px solid #1F6F5C', background: '#DCEAE5', padding: '8px 10px', marginTop: '14px', borderRadius: '6px' }}>
            ⏱ 이 기록은 서류보존 30년 규정 대상 — 저장 후 수정은 가능하나 삭제는 관리자만 사유를 남기고 예외적으로 처리합니다.
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 14px', fontSize: '15px' }}>취급 기록 목록</h3>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <select value={substanceFilter} onChange={e => setSubstanceFilter(e.target.value)} style={{ ...inputStyle, width: '180px' }}>
              <option value="">전체 물질</option>
              {substanceNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input value={dateFilter} onChange={e => setDateFilter(e.target.value)} placeholder="기간 검색 (예: 2026-09)" style={{ ...inputStyle, width: '180px' }} />
          </div>

          {loading ? (
            <div style={{ padding: '30px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>기록이 없습니다.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    {['취급일자', '물질명', '최초입고량', '취급량', '작업내용', '취급자', '확인자', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: '11px', color: C.muted, borderBottom: `2px solid ${C.text}`, padding: '8px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id}>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px', whiteSpace: 'nowrap' }}>{l.handling_date}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px', fontWeight: '600' }}>{l.substance_name}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px', color: C.muted }}>{l.initial_amount || '-'}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px', color: C.muted }}>{l.amount || '-'}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px', maxWidth: '200px' }}>{l.work_description}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px' }}>{l.handler_name}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px' }}>{l.confirmed_by_name || '-'}</td>
                      <td style={{ borderBottom: `1px solid ${C.border}`, padding: '8px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEdit(l)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: '11.5px', marginRight: '8px' }}>수정</button>
                        {isAdmin && <button onClick={() => softDelete(l)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '11.5px' }}>삭제</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <div style={{ fontSize: '11.5px', color: C.muted }}>삭제는 관리자 권한으로만 가능하며, 삭제 시 사유가 함께 기록됩니다.</div>
            <button onClick={() => exportSpecialMaterialLogs(filtered, labProfile.lab_name, labProfile.lab_professor)} style={{
              padding: '8px 14px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, fontSize: '12.5px', fontWeight: '600', cursor: 'pointer',
            }}>📥 전체 내보내기 (XLSX)</button>
          </div>
        </div>
      </div>

      {showModal && (
        <SpecialMaterialLogModal
          reagent={selectedReagent} candidates={!editingLog ? candidates : undefined}
          student={student} existingLog={editingLog}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadAll() }}
        />
      )}

      <div style={{ marginTop: '20px', fontSize: '12px', color: C.muted, borderTop: `1px dashed ${C.border}`, paddingTop: '14px' }}>
        ※ 근거: 산업안전보건기준에 관한 규칙 제439조 · 서류보존 30년 · 대상 물질: 44종 특별관리물질(CMR) 매칭 결과 연동
      </div>
    </div>
  )
}
