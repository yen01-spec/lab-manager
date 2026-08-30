import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, StatusBadge, inputStyle, btnPrimary } from '../../design'
import { exportPurchaseRequests } from '../../exportUtils'

// ══════════════════════════════════════════════
//  구매 관리
// ══════════════════════════════════════════════
export default function PurchaseTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [rejectNote, setRejectNote] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [trackingInputs, setTrackingInputs] = useState({})

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('purchase_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  async function updateStatus(id, status, note) {
    const tracking = trackingInputs[id] || {}
    await supabase.from('purchase_requests').update({
      status,
      ...(note ? { reject_note: note } : {}),
      ...(status === 'ordered' ? { ordered_at: new Date().toISOString(), tracking_number: tracking.tracking_number || null, estimated_arrival: tracking.estimated_arrival || null } : {}),
      ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    fetchRequests()
  }

  async function saveTracking(id) {
    const tracking = trackingInputs[id] || {}
    await supabase.from('purchase_requests').update({
      tracking_number: tracking.tracking_number || null,
      estimated_arrival: tracking.estimated_arrival || null,
    }).eq('id', id)
    alert('저장되었습니다!')
    fetchRequests()
  }

  function setTracking(id, field, value) {
    setTrackingInputs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, ordered: 0, delivered: 0, rejected: 0, done: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
  const filterTabs = [
    { key: 'all', label: '전체' }, { key: 'pending', label: '대기중' }, { key: 'approved', label: '승인됨' },
    { key: 'ordered', label: '발주완료' }, { key: 'delivered', label: '배송완료' }, { key: 'done', label: '완료' }, { key: 'rejected', label: '반려' },
  ]

  return (
    <Card title="🛒 구매 요청 관리" sub="Purchase Management"
      extra={requests.length > 0 && (
        <button onClick={() => exportPurchaseRequests(filtered)} style={{
          background: '#1D6F42', color: 'white', border: 'none',
          padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
        }}>📥 엑셀</button>
      )}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {filterTabs.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === f.key ? C.navy : C.bg, color: filter === f.key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === f.key ? '700' : '400',
          }}>{f.label} <span style={{ opacity: 0.7 }}>({counts[f.key] ?? 0})</span></button>
        ))}
      </div>
      {filtered.length === 0 ? <p style={{ color: C.muted }}>해당하는 요청이 없습니다.</p>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', marginBottom: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer', background: '#fff' }}>
              <StatusBadge status={req.status} />
              <span style={{ fontWeight: '600', flex: 1 }}>{req.target_name || `(ID: ${req.target_id})`}</span>
              <span style={{ color: C.muted, fontSize: '13px' }}>{req.user_name}</span>
              <span style={{ color: C.muted, fontSize: '12px' }}>{new Date(req.created_at).toLocaleDateString()}</span>
              <span style={{ color: C.muted, fontSize: '12px' }}>{expandedId === req.id ? '▲' : '▼'}</span>
            </div>
            {expandedId === req.id && (
              <div style={{ padding: '16px', background: C.bg, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  {[
                    ['종류', req.target_type === 'reagent' ? '시약' : req.target_type === 'item' ? '물품' : '신규'],
                    ['수량', req.quantity], ['요청 사유', req.reason || '-'],
                    req.reject_note && ['반려 사유', req.reject_note],
                    req.ordered_at && ['발주일', new Date(req.ordered_at).toLocaleDateString()],
                    req.tracking_number && ['운송장 번호', req.tracking_number],
                    req.estimated_arrival && ['예상 도착일', req.estimated_arrival],
                    req.delivered_at && ['배송완료일', new Date(req.delivered_at).toLocaleDateString()],
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label}>
                      <span style={{ fontSize: '11px', color: C.muted, marginRight: '6px' }}>{label}:</span>
                      <span style={{ fontSize: '13px' }}>{value}</span>
                    </div>
                  ))}
                </div>
                {(req.status === 'approved' || req.status === 'ordered') && (
                  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>배송 정보 입력</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>운송장 번호</label>
                        <input placeholder={req.tracking_number || '예: 1234567890'}
                          value={trackingInputs[req.id]?.tracking_number ?? req.tracking_number ?? ''}
                          onChange={e => setTracking(req.id, 'tracking_number', e.target.value)}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>예상 도착일</label>
                        <input type="date"
                          value={trackingInputs[req.id]?.estimated_arrival ?? req.estimated_arrival ?? ''}
                          onChange={e => setTracking(req.id, 'estimated_arrival', e.target.value)}
                          style={{ ...inputStyle, fontSize: '13px' }} />
                      </div>
                    </div>
                    <button onClick={() => saveTracking(req.id)} style={{ marginTop: '8px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: C.text }}>저장</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {req.status === 'pending' && (<>
                    <button onClick={() => updateStatus(req.id, 'approved')} style={{ ...btnPrimary, background: '#38A169' }}>✓ 승인</button>
                    <input placeholder="반려 사유" value={rejectNote[req.id] || ''}
                      onChange={e => setRejectNote({ ...rejectNote, [req.id]: e.target.value })}
                      style={{ ...inputStyle, width: '200px' }} />
                    <button onClick={() => updateStatus(req.id, 'rejected', rejectNote[req.id])} style={{ ...btnPrimary, background: C.danger }}>✗ 반려</button>
                  </>)}
                  {req.status === 'approved' && <button onClick={() => updateStatus(req.id, 'ordered')} style={{ ...btnPrimary, background: '#667EEA' }}>📦 발주 완료</button>}
                  {req.status === 'ordered' && <button onClick={() => updateStatus(req.id, 'delivered')} style={{ ...btnPrimary, background: '#38A169' }}>🚚 배송 완료</button>}
                  {req.status === 'delivered' && <button onClick={() => updateStatus(req.id, 'done')} style={{ ...btnPrimary, background: '#A0AEC0' }}>✓ 완료 처리</button>}
                </div>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}
