import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary } from '../../design'

// ══════════════════════════════════════════════
//  폐기 관리
// ══════════════════════════════════════════════
export default function DisposalTab({ onCountChange, student }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const [adminName, setAdminName] = useState(() => student?.name || '')

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('disposal_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  async function approve(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 폐기를 승인하시겠습니까?`)) return
    await supabase.from('disposal_requests').update({
      status: 'approved', approved_by: adminName, approved_by_student_id: student?.student_id ?? null,
      approved_at: new Date().toISOString(),
    }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '폐기 승인',
      target_type: 'disposal',
      description: `폐기 승인: ${req.reagent_name}`,
    })
    fetchRequests()
  }

  async function complete(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 폐기를 완료 처리하시겠습니까?\n⚠️ 재고에서 차감됩니다.`)) return
    if (req.lot_id) {
      const { data: lot } = await supabase.from('reagent_lots').select('*').eq('id', req.lot_id).single()
      if (lot) {
        const newSealed = Math.max(0, lot.sealed_count - 1)
        // 그 Lot이 완전히 소진됐을 때만 disposed로 전환 — 마스터 자체는 절대 archived로 사라지지 않음(재구매 시 이력 단절 방지)
        const fullyGone = newSealed <= 0 && lot.current_stock <= 0
        await supabase.from('reagent_lots').update({
          sealed_count: newSealed,
          disposal_date: new Date().toISOString().split('T')[0],
          needs_review: false,
          ...(fullyGone ? { status: 'disposed', current_stock: 0 } : {}),
        }).eq('id', req.lot_id)
      }
    }
    await supabase.from('disposal_requests').update({ status: 'disposed', disposed_at: new Date().toISOString() }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '폐기 완료',
      target_type: 'disposal',
      description: `폐기 완료: ${req.reagent_name}`,
    })
    fetchRequests()
  }

  async function reject(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 폐기 신청을 반려하시겠습니까?`)) return
    await supabase.from('disposal_requests').update({
      status: 'rejected', approved_by: adminName, approved_by_student_id: student?.student_id ?? null,
    }).eq('id', req.id)
    fetchRequests()
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, disposed: 0, rejected: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
  const statusLabel = { pending: '대기중', approved: '승인됨', disposed: '폐기완료', rejected: '반려' }
  const statusColor = { pending: '#E8A020', approved: '#667EEA', disposed: '#A0AEC0', rejected: C.danger }

  return (
    <Card title="🗑️ 폐기 관리" sub="Disposal Management">
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>처리자 이름 *</label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['all','전체'],['pending','대기중'],['approved','승인됨'],['disposed','폐기완료'],['rejected','반려']].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === key ? C.navy : C.bg, color: filter === key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === key ? '700' : '400',
          }}>{label} <span style={{ opacity: 0.7 }}>({counts[key] ?? 0})</span></button>
        ))}
      </div>
      {filtered.length === 0
        ? <div style={{ textAlign: 'center', padding: '40px', color: C.muted }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗑️</div>
            <div>폐기 신청이 없습니다</div>
          </div>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', marginBottom: '10px' }}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <span style={{ background: statusColor[req.status] + '22', color: statusColor[req.status],
                  fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px' }}>
                  {statusLabel[req.status]}
                </span>
                <span style={{ fontWeight: '700', fontSize: '15px', color: C.navy }}>{req.reagent_name}</span>
                <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12px', color: C.muted, marginBottom: '10px' }}>
                <div><span style={{ fontWeight: '600' }}>신청자:</span> {req.requested_by}</div>
                <div><span style={{ fontWeight: '600' }}>수량:</span> {req.quantity}</div>
                <div><span style={{ fontWeight: '600' }}>Lot:</span> {req.lot_no || '-'}</div>
                <div><span style={{ fontWeight: '600' }}>사유:</span> {req.reason || '-'}</div>
                {req.approved_by && <div><span style={{ fontWeight: '600' }}>승인자:</span> {req.approved_by}</div>}
                {req.disposed_at && <div><span style={{ fontWeight: '600' }}>폐기일:</span> {new Date(req.disposed_at).toLocaleDateString()}</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {req.status === 'pending' && (<>
                  <button onClick={() => approve(req)} style={{ ...btnPrimary, background: '#38A169', padding: '6px 14px', fontSize: '12px' }}>✓ 승인</button>
                  <button onClick={() => reject(req)} style={{ ...btnPrimary, background: C.danger, padding: '6px 14px', fontSize: '12px' }}>✗ 반려</button>
                </>)}
                {req.status === 'approved' && (
                  <button onClick={() => complete(req)} style={{ ...btnPrimary, background: '#A0AEC0', padding: '6px 14px', fontSize: '12px' }}>🗑️ 폐기 완료</button>
                )}
              </div>
            </div>
          </div>
        ))}
    </Card>
  )
}
