import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary } from '../../design'

// ══════════════════════════════════════════════
//  변경 요청 탭
// ══════════════════════════════════════════════
export default function ChangeRequestTab({ student }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [adminName, setAdminName] = useState(() => student?.name || '')

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('reagent_change_requests')
      .select('*, reagents(name)')
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  async function approve(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagents?.name}"의 ${req.field_name}을 "${req.new_value}"로 변경하시겠습니까?`)) return

    const now = new Date().toISOString()
    await supabase.from('reagents').update({ [req.field_name]: req.new_value, last_confirmed_at: now, confirmed_by: student?.student_id ?? null }).eq('id', req.reagent_id)
    await supabase.from('reagent_change_requests').update({
      status: 'approved', approved_by: adminName, approved_by_student_id: student?.student_id ?? null, approved_at: now,
    }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '변경 요청 승인',
      target_type: 'reagent',
      description: `${req.reagents?.name} ${req.field_name}: "${req.old_value}" → "${req.new_value}"`,
    })
    fetchRequests()
  }

  async function reject(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm('변경 요청을 반려하시겠습니까?')) return
    await supabase.from('reagent_change_requests').update({ status: 'rejected', approved_by: adminName, approved_by_student_id: student?.student_id ?? null }).eq('id', req.id)
    fetchRequests()
  }

  const fieldLabels = { name: '시약명', volume: '용량', unit: '단위', category: '성상', hazard: '유해위험성', cas_no: 'CAS No.', company: '회사', manager: '담당자', msds_url: 'MSDS URL', notes: '비고' }
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })

  return (
    <Card title="📝 시약 정보 변경 요청" sub="Change Requests">
      <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>처리자 이름 *</label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {[['all', '전체'], ['pending', '대기중'], ['approved', '승인됨'], ['rejected', '반려']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === key ? C.navy : C.bg, color: filter === key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === key ? '700' : '400',
          }}>{label} <span style={{ opacity: 0.7 }}>({counts[key] ?? 0})</span></button>
        ))}
      </div>

      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px', color: C.muted, fontSize: '14px' }}>변경 요청이 없습니다.</div>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', padding: '16px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{
                background: req.status === 'pending' ? '#FFF3E0' : req.status === 'approved' ? '#E8F5E9' : '#FFEBEE',
                color: req.status === 'pending' ? '#E65100' : req.status === 'approved' ? '#2E7D32' : '#C62828',
                fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px',
              }}>{req.status === 'pending' ? '대기중' : req.status === 'approved' ? '승인됨' : '반려'}</span>
              <span style={{ fontWeight: '700', color: C.navy, fontSize: '14px' }}>{req.reagents?.name}</span>
              <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>
                요청자: {req.requested_by} · {new Date(req.created_at).toLocaleDateString()}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: '13px', marginBottom: '10px' }}>
              <div><span style={{ color: C.muted, fontSize: '11px' }}>변경 항목</span><br /><strong>{fieldLabels[req.field_name] || req.field_name}</strong></div>
              <div><span style={{ color: C.muted, fontSize: '11px' }}>현재 값</span><br /><span style={{ color: C.muted }}>{req.old_value || '(없음)'}</span></div>
              <div><span style={{ color: C.muted, fontSize: '11px' }}>변경할 값</span><br /><strong style={{ color: C.navy }}>{req.new_value}</strong></div>
            </div>
            {req.approved_by && (
              <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>
                처리자: {req.approved_by} · {req.approved_at ? new Date(req.approved_at).toLocaleDateString() : ''}
              </div>
            )}
            {req.status === 'pending' && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => approve(req)} style={{ ...btnPrimary, background: '#38A169', padding: '6px 14px', fontSize: '12px' }}>✓ 승인</button>
                <button onClick={() => reject(req)} style={{ ...btnPrimary, background: C.danger, padding: '6px 14px', fontSize: '12px' }}>✗ 반려</button>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}
