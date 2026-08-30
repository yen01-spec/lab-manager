import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, StatusBadge, inputStyle, btnPrimary, thStyle, tdStyle } from '../design'

const FILTER_TABS = [
  { key: 'all', label: '전체' }, { key: 'pending', label: '대기중' }, { key: 'approved', label: '승인됨' },
  { key: 'ordered', label: '발주완료' }, { key: 'delivered', label: '배송완료' }, { key: 'done', label: '완료' }, { key: 'rejected', label: '반려' },
]

export default function PurchaseRequestList() {
  const { isAdmin, student } = useOutletContext?.() || {}
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [reagentItemsByLog, setReagentItemsByLog] = useState({})
  const [goodsItemsByLog, setGoodsItemsByLog] = useState({})
  const [nameById, setNameById] = useState({})
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [rejectNote, setRejectNote] = useState({})
  const [trackingInputs, setTrackingInputs] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: logData }, { data: reagentRows }, { data: goodsRows }, { data: students }] = await Promise.all([
      supabase.from('purchase_request_logs').select('*').order('created_at', { ascending: false }),
      supabase.from('purchase_request_reagent_items').select('*'),
      supabase.from('purchase_request_goods_items').select('*'),
      supabase.from('students').select('student_id, name'),
    ])
    setLogs(logData || [])
    const rMap = {}
    ;(reagentRows || []).forEach(it => { (rMap[it.request_id] ||= []).push(it) })
    setReagentItemsByLog(rMap)
    const gMap = {}
    ;(goodsRows || []).forEach(it => { (gMap[it.request_id] ||= []).push(it) })
    setGoodsItemsByLog(gMap)
    const nMap = {}
    ;(students || []).forEach(s => { nMap[s.student_id] = s.name })
    setNameById(nMap)
    setLoading(false)
  }

  async function updateStatus(id, status, note) {
    const tracking = trackingInputs[id] || {}
    await supabase.from('purchase_request_logs').update({
      status,
      ...(note ? { reject_note: note } : {}),
      approved_by: student?.name || null,
      ...(status === 'ordered' ? { ordered_at: new Date().toISOString(), tracking_number: tracking.tracking_number || null, estimated_arrival: tracking.estimated_arrival || null } : {}),
      ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    fetchAll()
  }

  async function saveTracking(id) {
    const tracking = trackingInputs[id] || {}
    await supabase.from('purchase_request_logs').update({
      tracking_number: tracking.tracking_number || null,
      estimated_arrival: tracking.estimated_arrival || null,
    }).eq('id', id)
    alert('저장되었습니다!')
    fetchAll()
  }

  function setTracking(id, field, value) {
    setTrackingInputs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const filtered = filter === 'all' ? logs : logs.filter(l => l.status === filter)
  const counts = { all: logs.length, pending: 0, approved: 0, ordered: 0, delivered: 0, rejected: 0, done: 0 }
  logs.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++ })

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>

  return (
    <div>
      <PageBanner title="구매요청 목록" sub="Purchase Request List" breadcrumb={['홈', '구매요청서', '목록']}
        extra={<button onClick={() => navigate('/purchase-request')} style={{ ...btnPrimary, padding: '9px 16px' }}>+ 새 요청 작성</button>} />
      <div style={{ padding: '20px 40px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {FILTER_TABS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: filter === f.key ? C.navy : C.bg, color: filter === f.key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: filter === f.key ? '700' : '400',
            }}>{f.label} <span style={{ opacity: 0.7 }}>({counts[f.key] ?? 0})</span></button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card><p style={{ color: C.muted, margin: 0 }}>해당하는 요청이 없습니다.</p></Card>
        ) : filtered.map(log => {
          const reagentItems = reagentItemsByLog[log.id] || []
          const goodsItems = goodsItemsByLog[log.id] || []
          const totalCount = reagentItems.length + goodsItems.length
          const isExpanded = expandedId === log.id
          return (
            <div key={log.id} style={{ border: `1px solid ${C.border}`, borderRadius: '10px', marginBottom: '10px', overflow: 'hidden', background: C.white }}>
              <div onClick={() => setExpandedId(isExpanded ? null : log.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', cursor: 'pointer' }}>
                <StatusBadge status={log.status} />
                <span style={{ fontWeight: '600', flex: 1 }}>
                  {nameById[log.requested_by] || log.requested_by || '알 수 없음'}님의 요청 · 시약 {reagentItems.length}건, 물품 {goodsItems.length}건
                </span>
                <span style={{ color: C.muted, fontSize: '12px' }}>{new Date(log.created_at).toLocaleDateString('ko-KR')}</span>
                <span style={{ color: C.muted, fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: '16px 18px', background: C.bg, borderTop: `1px solid ${C.border}` }}>
                  {totalCount === 0 && <p style={{ color: C.muted, fontSize: '13px' }}>담긴 항목이 없습니다.</p>}

                  {reagentItems.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: C.navy, marginBottom: '6px' }}>🧪 시약 항목</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: C.white }}>
                          <thead><tr>{['시약명', '순도', 'CAS No.', '성상', '필요용량', '사용처', '구매목적', '회사', 'Cat No.', '규격', '수량', '비고'].map(h => <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {reagentItems.map(it => (
                              <tr key={it.id}>
                                <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '600' }}>{it.name}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.purity || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.cas_no || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.state || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.needed_amount || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.usage_place || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.purchase_reason || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.company || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.cat_no || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.spec || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.quantity || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.note || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {goodsItems.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '700', color: C.navy, marginBottom: '6px' }}>📦 물품 항목</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: C.white }}>
                          <thead><tr>{['제품명', 'Cat No.', '규격', '수량', '단가', '배송비', '총가격', '용도', '비고', '링크'].map(h => <th key={h} style={{ ...thStyle, fontSize: '11px' }}>{h}</th>)}</tr></thead>
                          <tbody>
                            {goodsItems.map(it => (
                              <tr key={it.id}>
                                <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '600' }}>{it.name}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.cat_no || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.spec || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.quantity || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{Number(it.unit_price || 0).toLocaleString()}원</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{Number(it.shipping_fee || 0).toLocaleString()}원</td>
                                <td style={{ ...tdStyle, fontSize: '12px', fontWeight: '700' }}>{Number(it.total_price || 0).toLocaleString()}원</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.purpose || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.note || '-'}</td>
                                <td style={{ ...tdStyle, fontSize: '12px' }}>{it.link ? <a href={it.link} target="_blank" rel="noreferrer">링크</a> : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12px', color: C.muted, flexWrap: 'wrap' }}>
                    {log.reject_note && <span>반려 사유: {log.reject_note}</span>}
                    {log.approved_by && <span>처리자: {log.approved_by}</span>}
                    {log.ordered_at && <span>발주일: {new Date(log.ordered_at).toLocaleDateString('ko-KR')}</span>}
                    {log.tracking_number && <span>운송장: {log.tracking_number}</span>}
                    {log.estimated_arrival && <span>예상도착일: {log.estimated_arrival}</span>}
                    {log.delivered_at && <span>배송완료일: {new Date(log.delivered_at).toLocaleDateString('ko-KR')}</span>}
                  </div>

                  {isAdmin && (log.status === 'approved' || log.status === 'ordered') && (
                    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 14px', marginBottom: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '10px' }}>배송 정보 입력</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>운송장 번호</label>
                          <input placeholder={log.tracking_number || '예: 1234567890'}
                            value={trackingInputs[log.id]?.tracking_number ?? log.tracking_number ?? ''}
                            onChange={e => setTracking(log.id, 'tracking_number', e.target.value)}
                            style={{ ...inputStyle, fontSize: '13px' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>예상 도착일</label>
                          <input type="date"
                            value={trackingInputs[log.id]?.estimated_arrival ?? log.estimated_arrival ?? ''}
                            onChange={e => setTracking(log.id, 'estimated_arrival', e.target.value)}
                            style={{ ...inputStyle, fontSize: '13px' }} />
                        </div>
                      </div>
                      <button onClick={() => saveTracking(log.id)} style={{ marginTop: '8px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px', padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: C.text }}>저장</button>
                    </div>
                  )}

                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {log.status === 'pending' && (<>
                        <button onClick={() => updateStatus(log.id, 'approved')} style={{ ...btnPrimary, background: '#38A169' }}>✓ 승인</button>
                        <input placeholder="반려 사유" value={rejectNote[log.id] || ''}
                          onChange={e => setRejectNote({ ...rejectNote, [log.id]: e.target.value })}
                          style={{ ...inputStyle, width: '200px' }} />
                        <button onClick={() => updateStatus(log.id, 'rejected', rejectNote[log.id])} style={{ ...btnPrimary, background: C.danger }}>✗ 반려</button>
                      </>)}
                      {log.status === 'approved' && <button onClick={() => updateStatus(log.id, 'ordered')} style={{ ...btnPrimary, background: '#667EEA' }}>📦 발주 완료</button>}
                      {log.status === 'ordered' && <button onClick={() => updateStatus(log.id, 'delivered')} style={{ ...btnPrimary, background: '#38A169' }}>🚚 배송 완료</button>}
                      {log.status === 'delivered' && <button onClick={() => updateStatus(log.id, 'done')} style={{ ...btnPrimary, background: '#A0AEC0' }}>✓ 완료 처리</button>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
