import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, btnPrimary } from '../../design'
import { requestStatusLabel, requestStatusColorFor } from '../../lib/requestStatus'
import { reviewDisposalRequest } from '../../lib/adminReview'
import { useAdminSession } from '../../hooks/useAdminSession'
import AdminAuthBanner from './AdminAuthBanner'

// ══════════════════════════════════════════════
//  폐기 관리
// ══════════════════════════════════════════════
export default function DisposalTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('pending')
  const session = useAdminSession()
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('disposal_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  // 폐기는 한 단계: 승인 = 즉시 폐기 완료(별도 "폐기 완료" 버튼 없음), 반려 = 실제 변화 0. 홈/시약 상세와 같은 review RPC.
  async function decide(req, action) {
    if (busy) return
    let reason = null
    if (action === 'reject') {
      reason = window.prompt('반려 사유 (선택 — 신청한 사람에게 보여요)', '')
      if (reason === null) return
    } else if (!window.confirm(`"${req.reagent_name}" 폐기를 승인하시겠습니까?\n승인하면 즉시 폐기 완료 처리되고 재고에서 빠집니다.`)) return
    setBusy(true)
    try { await reviewDisposalRequest(req.id, action, reason || null) } catch (e) { alert(e.message) }
    setBusy(false)
    fetchRequests()
  }
  const approve = req => decide(req, 'approve')
  const reject = req => decide(req, 'reject')

  const filtered = filter === 'all' ? requests : requests.filter(r => (r.status === 'approved' ? 'pending' : r.status) === filter)
  const counts = { all: requests.length, pending: 0, disposed: 0, rejected: 0 }
  // 'approved'(이전 2단계 방식의 잔재)는 아직 처리 전이므로 대기 목록에 함께 센다
  requests.forEach(r => { const k = r.status === 'approved' ? 'pending' : r.status; if (counts[k] !== undefined) counts[k]++ })

  return (
    <Card title="🗑️ 폐기 관리" sub="Disposal Management">
      <AdminAuthBanner session={session} purpose="폐기 신청을 처리" />
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[['all','전체'],['pending','폐기 요청 대기'],['disposed','폐기 완료'],['rejected','폐기 반려']].map(([key, label]) => (
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
                <span style={{ background: requestStatusColorFor('disposal', req.status).bg, color: requestStatusColorFor('disposal', req.status).fg,
                  fontSize: '11px', fontWeight: '700', padding: '2px 10px', borderRadius: '10px' }}>
                  {requestStatusLabel('disposal', req.status, 'admin')}
                </span>
                <span style={{ fontWeight: '700', fontSize: '15px', color: C.navy }}>{req.reagent_name}</span>
                <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '12px', color: C.muted, marginBottom: '10px' }}>
                <div><span style={{ fontWeight: '600' }}>신청자:</span> {req.requested_by}</div>
                <div><span style={{ fontWeight: '600' }}>수량:</span> {req.quantity}</div>
                <div><span style={{ fontWeight: '600' }}>Lot:</span> {req.lot_no || '-'}</div>
                <div><span style={{ fontWeight: '600' }}>사유:</span> {req.reason || '-'}</div>
                {req.approved_by && <div><span style={{ fontWeight: '600' }}>{req.status === 'rejected' ? '반려자' : '승인자'}:</span> {req.approved_by}</div>}
                {req.review_note && <div><span style={{ fontWeight: '600' }}>반려 사유:</span> {req.review_note}</div>}
                {req.disposed_at && <div><span style={{ fontWeight: '600' }}>폐기일:</span> {new Date(req.disposed_at).toLocaleDateString()}</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(req.status === 'pending' || req.status === 'approved') && (<>
                  <button disabled={!session.authed || busy} onClick={() => approve(req)} style={{ ...btnPrimary, background: '#38A169', padding: '6px 14px', fontSize: '12px' }}>✓ 승인 (즉시 폐기 완료)</button>
                  <button disabled={!session.authed || busy} onClick={() => reject(req)} style={{ ...btnPrimary, background: C.danger, padding: '6px 14px', fontSize: '12px' }}>✗ 반려</button>
                </>)}
              </div>
            </div>
          </div>
        ))}
    </Card>
  )
}
