import { useState } from 'react'
import { C, inputStyle, labelStyle, btnGhost } from '../../design'
import { supabase } from '../../supabase'

const PPE_OPTIONS = ['보안경', '장갑', '마스크', '방독마스크', '실험복']

// 특별관리물질 취급일지 — 산업안전보건기준에관한 규칙 제439조 법정 양식 기준.
// 30년 보존 요건이라 substance_name/cas_no를 기록 시점 값으로 스냅샷 저장한다
// (reagent가 나중에 이름 변경/삭제되어도 이 로그의 내용은 그대로 남아야 함).
// existingLog가 있으면 수정 모드(값 프리필 + PATCH), 없으면 신규 작성(INSERT).
export default function SpecialMaterialLogModal({ reagent, candidates, student, existingLog, onClose, onSaved }) {
  const [pickedReagent, setPickedReagent] = useState(reagent || candidates?.[0] || null)
  const [form, setForm] = useState({
    handling_date: existingLog?.handling_date || new Date().toISOString().split('T')[0],
    initial_amount: existingLog?.initial_amount || '',
    amount: existingLog?.amount || '',
    work_description: existingLog?.work_description || '',
    ppe: new Set(existingLog?.ppe_worn ? existingLog.ppe_worn.split(', ').filter(Boolean) : []),
    incident_details: existingLog?.incident_details || '',
    confirmed_by_name: existingLog?.confirmed_by_name || '',
    notes: existingLog?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  function togglePpe(item) {
    setForm(prev => {
      const next = new Set(prev.ppe)
      next.has(item) ? next.delete(item) : next.add(item)
      return { ...prev, ppe: next }
    })
  }

  async function submit() {
    if (!student) { alert('제출하려면 로그인이 필요해요. 로그인 후 다시 시도해주세요.'); return }
    if (!form.work_description.trim()) { alert('작업내용을 입력해주세요'); return }
    setSaving(true)
    const payload = {
      handling_date: form.handling_date, initial_amount: form.initial_amount || null,
      amount: form.amount || null, work_description: form.work_description,
      ppe_worn: [...form.ppe].join(', ') || null, incident_details: form.incident_details || null,
      confirmed_by_name: form.confirmed_by_name || null, notes: form.notes || null,
    }
    const { error } = existingLog
      ? await supabase.from('special_material_logs').update(payload).eq('id', existingLog.id)
      : await supabase.from('special_material_logs').insert({
          ...payload, reagent_id: pickedReagent.id, substance_name: pickedReagent.name, cas_no: pickedReagent.cas_no,
          handler_student_id: student.student_id, handler_name: student.name,
        })
    setSaving(false)
    if (error) { alert('저장에 실패했어요: ' + error.message); return }
    alert(existingLog ? '수정됐어요!' : '취급일지가 저장됐어요!')
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '480px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 4px', color: C.navy }}>🚨 특별관리물질 취급일지{existingLog ? ' 수정' : ''}</h3>
        {!existingLog && candidates ? (
          <p style={{ margin: '0 0 16px', color: C.muted, fontSize: '13px' }}>44종 매칭된 시약 중에서 골라주세요.</p>
        ) : (
          <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>
            {existingLog?.substance_name || reagent?.name} {(existingLog?.cas_no || reagent?.cas_no) ? `(CAS ${existingLog?.cas_no || reagent?.cas_no})` : ''}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {!existingLog && candidates && (
            <div><label style={labelStyle}>물질명 (CAS)</label>
              <select value={pickedReagent?.id || ''} onChange={e => setPickedReagent(candidates.find(c => c.id === e.target.value))} style={inputStyle}>
                {candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.cas_no})</option>)}
              </select></div>
          )}
          <div><label style={labelStyle}>취급일자</label>
            <input type="date" value={form.handling_date} onChange={e => setForm({ ...form, handling_date: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>최초입고량 (이 통을 처음 받았을 때 총량)</label>
            <input value={form.initial_amount} placeholder="예: 500mL" onChange={e => setForm({ ...form, initial_amount: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>취급량 (이번 취급분)</label>
            <input value={form.amount} placeholder="예: 5mL" onChange={e => setForm({ ...form, amount: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>작업내용 *</label>
            <textarea value={form.work_description} rows={2} onChange={e => setForm({ ...form, work_description: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <div><label style={labelStyle}>착용한 보호구</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
              {PPE_OPTIONS.map(item => (
                <label key={item} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: C.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.ppe.has(item)} onChange={() => togglePpe(item)} />{item}
                </label>
              ))}
            </div>
          </div>
          <div><label style={labelStyle}>사고 내용 및 조치사항 (누출·오염·흡입 등, 없으면 비워두세요)</label>
            <textarea value={form.incident_details} rows={2} onChange={e => setForm({ ...form, incident_details: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
          <div><label style={labelStyle}>확인자</label>
            <input value={form.confirmed_by_name} placeholder="확인한 책임자/조교 이름" onChange={e => setForm({ ...form, confirmed_by_name: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>비고</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
        </div>
        <div style={{ fontSize: '11.5px', color: student ? C.muted : '#C13B3F', marginTop: '10px' }}>
          {student ? `취급자: ${existingLog?.handler_name || student.name}` : '※ 제출하려면 로그인이 필요해요'}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>취소</button>
          <button onClick={submit} disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: saving ? 'default' : 'pointer', fontWeight: '700', opacity: saving ? 0.6 : 1 }}>
            {saving ? '저장 중...' : existingLog ? '수정 저장' : '기록하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
