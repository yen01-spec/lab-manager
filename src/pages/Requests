import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

function Requests() {
  const { isAdmin } = useOutletContext()
  const [requests, setRequests] = useState([])
  const [reagents, setReagents] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    user_name: '', target_type: 'reagent', target_id: '',
    target_name: '', quantity: '', reason: ''
  })

  useEffect(() => {
    fetchReagents()
    fetchItems()
    if (isAdmin) fetchRequests()
  }, [isAdmin])

  async function fetchRequests() {
    const { data } = await supabase
      .from('purchase_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  async function fetchReagents() {
    const { data } = await supabase.from('reagents').select('id, name')
    if (data) setReagents(data)
  }

  async function fetchItems() {
    const { data } = await supabase.from('items').select('id, name')
    if (data) setItems(data)
  }

  async function handleSubmit() {
    if (!form.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (form.target_type !== 'new' && !form.target_id) { alert('항목을 선택해주세요'); return }
    if (form.target_type === 'new' && !form.target_name.trim()) { alert('새 항목 이름을 입력해주세요'); return }
    if (!form.quantity.trim()) { alert('수량을 입력해주세요'); return }

    await supabase.from('purchase_requests').insert({
      user_name: form.user_name,
      target_type: form.target_type,
      target_id: form.target_type !== 'new' ? form.target_id : null,
      target_name: form.target_type === 'new' ? form.target_name : null,
      quantity: form.quantity,
      reason: form.reason
    })

    alert('구매 요청이 접수되었습니다!')
    setForm({ user_name: '', target_type: 'reagent', target_id: '', target_name: '', quantity: '', reason: '' })
    if (isAdmin) fetchRequests()
  }

  async function updateStatus(id, status) {
    await supabase.from('purchase_requests').update({ status }).eq('id', id)
    fetchRequests()
  }

  const statusLabel = { pending: '대기중', approved: '승인됨', done: '완료' }
  const statusColor = { pending: '#ed8936', approved: '#48bb78', done: '#a0aec0' }

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>🛒 구매 요청</h1>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', marginBottom: '32px' }}>
        <h2 style={{ marginTop: 0, color: '#1e3a5f' }}>새 구매 요청</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>이름 *</label>
            <input value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })}
              placeholder="본인 이름"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>종류 *</label>
            <select value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value, target_id: '', target_name: '' })}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
              <option value="reagent">기존 시약</option>
              <option value="item">기존 물품</option>
              <option value="new">신규 항목</option>
            </select>
          </div>
          {form.target_type === 'reagent' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>시약 선택 *</label>
              <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                <option value="">선택하세요</option>
                {reagents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {form.target_type === 'item' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>물품 선택 *</label>
              <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}>
                <option value="">선택하세요</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}
          {form.target_type === 'new' && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>항목 이름 *</label>
              <input value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })}
                placeholder="새로 구매할 시약/물품 이름"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>수량 *</label>
            <input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
              placeholder="예: 500mL 2개"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#666' }}>요청 사유</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="요청 사유를 입력하세요" rows={3}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box', resize: 'vertical' }} />
          </div>
        </div>
        <button onClick={handleSubmit} style={{
          marginTop: '16px', background: '#1e3a5f', color: 'white',
          border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px'
        }}>요청 제출</button>
      </div>

      {isAdmin && (
        <div>
          <h2 style={{ color: '#1e3a5f' }}>요청 목록</h2>
          {requests.length === 0 ? (
            <p style={{ color: '#999' }}>요청이 없습니다.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f7fafc' }}>
                  {['일시', '요청자', '종류', '항목', '수량', '사유', '상태', '처리'].map(h => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map(req => (
                  <tr key={req.id}>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                      {new Date(req.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>{req.user_name}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>
                      {req.target_type === 'reagent' ? '시약' : req.target_type === 'item' ? '물품' : '신규'}
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>{req.target_name || '-'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>{req.quantity}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0', color: '#666' }}>{req.reason || '-'}</td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>
                      <span style={{
                        background: statusColor[req.status], color: 'white',
                        padding: '2px 8px', borderRadius: '12px', fontSize: '12px'
                      }}>{statusLabel[req.status]}</span>
                    </td>
                    <td style={{ padding: '10px 8px', borderBottom: '1px solid #e2e8f0' }}>
                      {req.status === 'pending' && (
                        <button onClick={() => updateStatus(req.id, 'approved')} style={{
                          background: '#48bb78', color: 'white', border: 'none',
                          padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', marginRight: '4px'
                        }}>승인</button>
                      )}
                      {req.status === 'approved' && (
                        <button onClick={() => updateStatus(req.id, 'done')} style={{
                          background: '#a0aec0', color: 'white', border: 'none',
                          padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'
                        }}>완료</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default Requests