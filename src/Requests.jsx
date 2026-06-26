import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, StatusBadge, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from './design'

export default function Requests() {
  const { isAdmin } = useOutletContext()
  const [myName, setMyName] = useState(() => localStorage.getItem('req_user_name') || '')
  const [reagents, setReagents] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    user_name: myName, target_type: 'reagent', target_id: '', target_name: '', quantity: '', reason: '',
  })
  const [myRequests, setMyRequests] = useState([])
  const [myRequestsLoaded, setMyRequestsLoaded] = useState(false)

  useEffect(() => {
    fetchReagents(); fetchItems()
    if (form.user_name) fetchMyRequests(form.user_name)
  }, [])

  useEffect(() => {
    if (form.user_name) localStorage.setItem('req_user_name', form.user_name)
  }, [form.user_name])

  async function fetchReagents() {
    const { data } = await supabase.from('reagents').select('id, name')
    if (data) setReagents(data)
  }
  async function fetchItems() {
    const { data } = await supabase.from('items').select('id, name')
    if (data) setItems(data)
  }
  async function fetchMyRequests(name) {
    if (!name?.trim()) return
    const { data } = await supabase.from('purchase_requests').select('*')
      .eq('user_name', name.trim()).order('created_at', { ascending: false })
    if (data) { setMyRequests(data); setMyRequestsLoaded(true) }
  }

  async function handleSubmit() {
    if (!form.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (form.target_type !== 'new' && !form.target_id) { alert('항목을 선택해주세요'); return }
    if (form.target_type === 'new' && !form.target_name.trim()) { alert('새 항목 이름을 입력해주세요'); return }
    if (!form.quantity.trim()) { alert('수량을 입력해주세요'); return }

    let targetName = form.target_name
    if (form.target_type === 'reagent') targetName = reagents.find(r => String(r.id) === String(form.target_id))?.name || ''
    else if (form.target_type === 'item') targetName = items.find(i => String(i.id) === String(form.target_id))?.name || ''

    await supabase.from('purchase_requests').insert({
      user_name: form.user_name, target_type: form.target_type,
      target_id: form.target_type !== 'new' ? form.target_id : null,
      target_name: targetName, quantity: form.quantity, reason: form.reason,
    })

    // 관리자에게 FCM 알림 발송 (비동기, 실패해도 무시)
    supabase.functions.invoke('send-notification', {
      body: {
        title: '📦 새 구매 요청',
        body: `${form.user_name}님이 ${targetName} ${form.quantity} 구매를 요청했습니다.`,
        role: 'admin',
      }
    }).then(res => console.log('알림 발송 결과:', res))
      .catch(err => console.error('알림 발송 실패:', err))

    alert('구매 요청이 접수되었습니다!')
    const name = form.user_name
    setForm({ user_name: name, target_type: 'reagent', target_id: '', target_name: '', quantity: '', reason: '' })
    fetchMyRequests(name)
  }

  const iStyle = { ...inputStyle }
  const lStyle = { ...labelStyle }

  return (
    <div>
      <PageBanner title="구매 요청" sub="Purchase Request" breadcrumb={['홈', '구매 요청']} />

      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 요청 폼 */}
        <Card title="새 구매 요청" sub="New Purchase Request">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={lStyle}>이름 *</label>
              <input value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })}
                placeholder="본인 이름" style={iStyle} />
            </div>
            <div>
              <label style={lStyle}>종류 *</label>
              <select value={form.target_type}
                onChange={e => setForm({ ...form, target_type: e.target.value, target_id: '', target_name: '' })}
                style={iStyle}>
                <option value="reagent">기존 시약</option>
                <option value="item">기존 물품</option>
                <option value="new">신규 항목</option>
              </select>
            </div>
            {form.target_type === 'reagent' && (
              <div>
                <label style={lStyle}>시약 선택 *</label>
                <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })} style={iStyle}>
                  <option value="">선택하세요</option>
                  {reagents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            {form.target_type === 'item' && (
              <div>
                <label style={lStyle}>물품 선택 *</label>
                <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })} style={iStyle}>
                  <option value="">선택하세요</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
            )}
            {form.target_type === 'new' && (
              <div>
                <label style={lStyle}>항목 이름 *</label>
                <input value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })}
                  placeholder="새로 구매할 시약/물품 이름" style={iStyle} />
              </div>
            )}
            <div>
              <label style={lStyle}>수량 *</label>
              <input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
                placeholder="예: 500mL 2개" style={iStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lStyle}>요청 사유</label>
              <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="요청 사유를 입력하세요" rows={3}
                style={{ ...iStyle, resize: 'vertical' }} />
            </div>
          </div>
          <button onClick={handleSubmit} style={{ ...btnPrimary, marginTop: '16px' }}>요청 제출</button>
        </Card>

        {/* 내 요청 현황 (학생) */}
        {!isAdmin && (
          <Card title="내 요청 현황" sub="My Requests"
            extra={
              <button onClick={() => fetchMyRequests(form.user_name)} style={{
                background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
                padding: '5px 14px', cursor: 'pointer', fontSize: '12px', color: C.muted,
              }}>새로고침</button>
            }>
            {!myRequestsLoaded ? (
              <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>
                이름을 입력하고 새로고침을 눌러 요청 현황을 확인하세요.
              </div>
            ) : myRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>
                요청 내역이 없습니다.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>{['요청일', '항목', '수량', '상태', '비고'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {myRequests.map(req => (
                    <tr key={req.id}>
                      <td style={{ ...tdStyle, color: C.muted }}>{new Date(req.created_at).toLocaleDateString()}</td>
                      <td style={{ ...tdStyle, fontWeight: '600' }}>
                        {req.target_name || '-'}
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: C.muted }}>
                          ({req.target_type === 'reagent' ? '시약' : req.target_type === 'item' ? '물품' : '신규'})
                        </span>
                      </td>
                      <td style={tdStyle}>{req.quantity}</td>
                      <td style={tdStyle}><StatusBadge status={req.status} /></td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {req.status === 'rejected' && req.reject_note
                          ? <span style={{ color: C.danger }}>반려 사유: {req.reject_note}</span>
                          : req.status === 'ordered' && req.ordered_at
                          ? `발주일: ${new Date(req.ordered_at).toLocaleDateString()}`
                          : req.status === 'delivered' && req.delivered_at
                          ? `배송완료: ${new Date(req.delivered_at).toLocaleDateString()}`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
