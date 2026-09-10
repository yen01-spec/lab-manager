import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  위치 이동 요청 처리 — 승인/반려만.
//  직접 위치를 옮기는 기능은 "시약 일괄정리"로 일원화됨(관리자 메뉴에서는 제거).
// ══════════════════════════════════════════════
export default function MoveTab({ locations }) {
  const [history, setHistory] = useState([])
  const [requests, setRequests] = useState([])
  const [reqFilter, setReqFilter] = useState('pending')
  const [adminName, setAdminName] = useState('')

  useEffect(() => { fetchHistory(); fetchRequests() }, [])

  async function fetchHistory() {
    const { data } = await supabase.from('location_history')
      .select('*').order('created_at', { ascending: false }).limit(30)
    if (data) setHistory(data)
  }

  async function fetchRequests() {
    const { data } = await supabase.from('location_requests')
      .select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  // Lot이 특정되지 않은 오래된 신청 처리용 — 해당 시약의 활성 Lot 전부를 새 위치로 이동
  async function moveAllActiveLots(r, toLocationId, toLocName, movedByName, notesText) {
    const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
    for (const lot of activeLots) {
      const fromLoc = locations.find(l => l.id === lot.location_id)
      const fromLocName = fromLoc ? `${fromLoc.room}${fromLoc.detail ? ' - ' + fromLoc.detail : ''}` : '미지정'
      await supabase.from('reagent_lots').update({ location_id: toLocationId }).eq('id', lot.id)
      await supabase.from('location_history').insert({
        reagent_id: r.id, lot_id: lot.id, reagent_name: r.name,
        from_location_id: lot.location_id, from_location_name: fromLocName,
        to_location_id: toLocationId, to_location_name: toLocName,
        moved_by: movedByName, notes: notesText,
      })
    }
  }

  async function approveRequest(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 위치 이동을 승인하시겠습니까?\n${req.from_location_name} → ${req.to_location_name}`)) return

    if (req.lot_id) {
      await supabase.from('reagent_lots').update({ location_id: req.to_location_id }).eq('id', req.lot_id)
      await supabase.from('location_history').insert({
        reagent_id: req.reagent_id, lot_id: req.lot_id, reagent_name: req.reagent_name,
        from_location_id: req.from_location_id, from_location_name: req.from_location_name,
        to_location_id: req.to_location_id, to_location_name: req.to_location_name,
        moved_by: adminName, notes: `신청자: ${req.requested_by}`,
      })
    } else {
      const { data: r } = await supabase.from('reagents').select('*, reagent_lots(*)').eq('id', req.reagent_id).single()
      if (r) await moveAllActiveLots(r, req.to_location_id, req.to_location_name, adminName, `신청자: ${req.requested_by}`)
    }
    await supabase.from('location_requests').update({
      status: 'approved', approved_by: adminName, approved_at: new Date().toISOString(),
    }).eq('id', req.id)
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '위치 이동 승인',
      target_type: 'reagent',
      description: `${req.reagent_name}: ${req.from_location_name} → ${req.to_location_name}`,
    })
    fetchRequests(); fetchHistory()
  }

  async function rejectRequest(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 위치 이동 신청을 반려하시겠습니까?`)) return
    await supabase.from('location_requests').update({ status: 'rejected' }).eq('id', req.id)
    fetchRequests()
  }

  const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)
  const reqCounts = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
  requests.forEach(r => { if (reqCounts[r.status] !== undefined) reqCounts[r.status]++ })
  const statusColor = { pending: '#E8A020', approved: '#38A169', rejected: C.danger }
  const statusLabel = { pending: '대기중', approved: '승인됨', rejected: '반려' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <Card title="📬 위치 이동 신청 목록" sub="학생 신청 승인/반려">
        <div style={{ marginBottom: '16px', padding: '12px 16px',
          background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
          <label style={labelStyle}>처리자 이름 *</label>
          <input value={adminName} onChange={e => setAdminName(e.target.value)}
            placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[['all', '전체'], ['pending', '대기중'], ['approved', '승인됨'], ['rejected', '반려']].map(([key, label]) => (
            <button key={key} onClick={() => setReqFilter(key)} style={{
              padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: reqFilter === key ? C.navy : C.bg,
              color: reqFilter === key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: reqFilter === key ? '700' : '400',
            }}>{label} <span style={{ opacity: 0.7 }}>({reqCounts[key] ?? 0})</span></button>
          ))}
        </div>
        {filteredReqs.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>신청 내역이 없습니다</div>
          : filteredReqs.map(req => (
            <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ background: statusColor[req.status] + '22', color: statusColor[req.status],
                  fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>
                  {statusLabel[req.status]}
                </span>
                <span style={{ fontWeight: '700', color: C.navy }}>{req.reagent_name}</span>
                <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{req.requested_by} · {new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '8px' }}>
                {req.from_location_name || '미지정'} → <strong style={{ color: '#276749' }}>{req.to_location_name}</strong>
                {req.notes && <span style={{ marginLeft: '8px' }}>({req.notes})</span>}
              </div>
              {req.status === 'pending' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => approveRequest(req)}
                    style={{ ...btnPrimary, background: '#38A169', padding: '5px 14px', fontSize: '12px' }}>✓ 승인</button>
                  <button onClick={() => rejectRequest(req)}
                    style={{ ...btnPrimary, background: C.danger, padding: '5px 14px', fontSize: '12px' }}>✗ 반려</button>
                </div>
              )}
              {req.approved_by && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>승인자: {req.approved_by}</div>}
            </div>
          ))}
      </Card>

      <Card title="📋 위치 이동 이력" noPadding>
        {history.length === 0
          ? <div style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>이동 이력이 없습니다</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['일시', '시약명', '이전 위치', '새 위치', '이동자', '메모'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={{ ...tdStyle, color: C.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{h.reagent_name}</td>
                    <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{h.from_location_name || '미지정'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}><span style={{ color: '#276749', fontWeight: '600' }}>{h.to_location_name}</span></td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{h.moved_by}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{h.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>
    </div>
  )
}
