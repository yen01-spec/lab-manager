import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const STATUS_MAP = {
  pending:   { label: '대기중',   bg: '#ed8936' },
  approved:  { label: '승인됨',   bg: '#38a169' },
  rejected:  { label: '반려됨',   bg: '#e53e3e' },
  ordered:   { label: '발주완료', bg: '#667eea' },
  delivered: { label: '배송완료', bg: '#38a169' },
  done:      { label: '완료',     bg: '#a0aec0' },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, bg: '#a0aec0' }
  return (
    <span style={{
      background: s.bg, color: 'white',
      padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
    }}>{s.label}</span>
  )
}

function Requests() {
  const { isAdmin } = useOutletContext()
  const [myName, setMyName] = useState(() => localStorage.getItem('req_user_name') || '')
  const [reagents, setReagents] = useState([])
  const [items, setItems] = useState([])
  const [form, setForm] = useState({
    user_name: myName, target_type: 'reagent', target_id: '',
    target_name: '', quantity: '', reason: '',
  })
  // 학생용: 내 요청 목록
  const [myRequests, setMyRequests] = useState([])
  const [myRequestsLoaded, setMyRequestsLoaded] = useState(false)

  useEffect(() => {
    fetchReagents()
    fetchItems()
  }, [])

  // 이름 입력 시 localStorage 저장 (편의)
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
    if (!name.trim()) return
    const { data } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('user_name', name.trim())
      .order('created_at', { ascending: false })
    if (data) { setMyRequests(data); setMyRequestsLoaded(true) }
  }

  async function handleSubmit() {
    if (!form.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (form.target_type !== 'new' && !form.target_id) { alert('항목을 선택해주세요'); return }
    if (form.target_type === 'new' && !form.target_name.trim()) { alert('새 항목 이름을 입력해주세요'); return }
    if (!form.quantity.trim()) { alert('수량을 입력해주세요'); return }

    // target_name 자동 채우기
    let targetName = form.target_name
    if (form.target_type === 'reagent') {
      targetName = reagents.find(r => String(r.id) === String(form.target_id))?.name || ''
    } else if (form.target_type === 'item') {
      targetName = items.find(i => String(i.id) === String(form.target_id))?.name || ''
    }

    await supabase.from('purchase_requests').insert({
      user_name: form.user_name,
      target_type: form.target_type,
      target_id: form.target_type !== 'new' ? form.target_id : null,
      target_name: targetName,
      quantity: form.quantity,
      reason: form.reason,
    })

    alert('구매 요청이 접수되었습니다!')
    const submitted_name = form.user_name
    setForm({ user_name: submitted_name, target_type: 'reagent', target_id: '', target_name: '', quantity: '', reason: '' })
    fetchMyRequests(submitted_name)
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: '1px solid #e2e8f0', boxSizing: 'border-box', fontSize: '14px',
  }
  const labelStyle = { display: 'block', marginBottom: '4px', color: '#718096', fontSize: '13px' }

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>🛒 구매 요청</h1>

      {/* ── 요청 폼 ── */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', marginBottom: '32px', background: 'white' }}>
        <h2 style={{ marginTop: 0, color: '#1e3a5f', fontSize: '16px' }}>새 구매 요청</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>이름 *</label>
            <input value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })}
              placeholder="본인 이름" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>종류 *</label>
            <select value={form.target_type}
              onChange={e => setForm({ ...form, target_type: e.target.value, target_id: '', target_name: '' })}
              style={inputStyle}>
              <option value="reagent">기존 시약</option>
              <option value="item">기존 물품</option>
              <option value="new">신규 항목</option>
            </select>
          </div>

          {form.target_type === 'reagent' && (
            <div>
              <label style={labelStyle}>시약 선택 *</label>
              <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })} style={inputStyle}>
                <option value="">선택하세요</option>
                {reagents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {form.target_type === 'item' && (
            <div>
              <label style={labelStyle}>물품 선택 *</label>
              <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })} style={inputStyle}>
                <option value="">선택하세요</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}
          {form.target_type === 'new' && (
            <div>
              <label style={labelStyle}>항목 이름 *</label>
              <input value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })}
                placeholder="새로 구매할 시약/물품 이름" style={inputStyle} />
            </div>
          )}

          <div>
            <label style={labelStyle}>수량 *</label>
            <input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
              placeholder="예: 500mL 2개" style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>요청 사유</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="요청 사유를 입력하세요" rows={3}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>
        <button onClick={handleSubmit} style={{
          marginTop: '16px', background: '#1e3a5f', color: 'white',
          border: 'none', padding: '10px 24px', borderRadius: '6px',
          cursor: 'pointer', fontSize: '14px', fontWeight: '600',
        }}>요청 제출</button>
      </div>

      {/* ── 학생: 내 요청 현황 ── */}
      {!isAdmin && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: '16px' }}>📬 내 요청 현황</h2>
            <button onClick={() => fetchMyRequests(form.user_name)} style={{
              background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
              padding: '6px 14px', cursor: 'pointer', fontSize: '13px',
            }}>조회</button>
          </div>

          {!myRequestsLoaded && (
            <p style={{ color: '#a0aec0', fontSize: '14px' }}>
              위에 이름을 입력하고 '조회'를 눌러 요청 현황을 확인하세요.
            </p>
          )}

          {myRequestsLoaded && myRequests.length === 0 && (
            <p style={{ color: '#a0aec0' }}>요청 내역이 없습니다.</p>
          )}

          {myRequests.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f7fafc' }}>
                  {['요청일', '항목', '수량', '상태', '비고'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left',
                      borderBottom: '2px solid #e2e8f0', fontSize: '12px', color: '#718096' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myRequests.map(req => (
                  <tr key={req.id}>
                    <td style={tdStyle}>{new Date(req.created_at).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>
                      {req.target_name || '-'}
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: '#a0aec0' }}>
                        ({req.target_type === 'reagent' ? '시약' : req.target_type === 'item' ? '물품' : '신규'})
                      </span>
                    </td>
                    <td style={tdStyle}>{req.quantity}</td>
                    <td style={tdStyle}><StatusBadge status={req.status} /></td>
                    <td style={{ ...tdStyle, color: '#718096', fontSize: '12px' }}>
                      {req.status === 'rejected' && req.reject_note
                        ? <span style={{ color: '#e53e3e' }}>반려 사유: {req.reject_note}</span>
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
        </div>
      )}
    </div>
  )
}

const tdStyle = {
  padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px',
}

export default Requests
