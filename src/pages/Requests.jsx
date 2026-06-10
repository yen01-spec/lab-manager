import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const STATUS_MAP = {
  pending:   { label: '?€ê¸°ì¤‘',   bg: '#ed8936' },
  approved:  { label: '?¹ì¸??,   bg: '#38a169' },
  rejected:  { label: 'ë°˜ë ¤??,   bg: '#e53e3e' },
  ordered:   { label: 'ë°œì£¼?„ë£Œ', bg: '#667eea' },
  delivered: { label: 'ë°°ì†¡?„ë£Œ', bg: '#38a169' },
  done:      { label: '?„ë£Œ',     bg: '#a0aec0' },
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
  // ?™ìƒ?? ???”ì²­ ëª©ë¡
  const [myRequests, setMyRequests] = useState([])
  const [myRequestsLoaded, setMyRequestsLoaded] = useState(false)

  useEffect(() => {
    fetchReagents()
    fetchItems()
  }, [])

  // ?´ë¦„ ?…ë ¥ ??localStorage ?€??(?¸ì˜)
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
    if (!form.user_name.trim()) { alert('?´ë¦„???…ë ¥?´ì£¼?¸ìš”'); return }
    if (form.target_type !== 'new' && !form.target_id) { alert('??ª©??? íƒ?´ì£¼?¸ìš”'); return }
    if (form.target_type === 'new' && !form.target_name.trim()) { alert('????ª© ?´ë¦„???…ë ¥?´ì£¼?¸ìš”'); return }
    if (!form.quantity.trim()) { alert('?˜ëŸ‰???…ë ¥?´ì£¼?¸ìš”'); return }

    // target_name ?ë™ ì±„ìš°ê¸?
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

    alert('êµ¬ë§¤ ?”ì²­???‘ìˆ˜?˜ì—ˆ?µë‹ˆ??')
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
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>?›’ êµ¬ë§¤ ?”ì²­</h1>

      {/* ?€?€ ?”ì²­ ???€?€ */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', marginBottom: '32px', background: 'white' }}>
        <h2 style={{ marginTop: 0, color: '#1e3a5f', fontSize: '16px' }}>??êµ¬ë§¤ ?”ì²­</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>?´ë¦„ *</label>
            <input value={form.user_name} onChange={e => setForm({ ...form, user_name: e.target.value })}
              placeholder="ë³¸ì¸ ?´ë¦„" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ì¢…ë¥˜ *</label>
            <select value={form.target_type}
              onChange={e => setForm({ ...form, target_type: e.target.value, target_id: '', target_name: '' })}
              style={inputStyle}>
              <option value="reagent">ê¸°ì¡´ ?œì•½</option>
              <option value="item">ê¸°ì¡´ ë¬¼í’ˆ</option>
              <option value="new">? ê·œ ??ª©</option>
            </select>
          </div>

          {form.target_type === 'reagent' && (
            <div>
              <label style={labelStyle}>?œì•½ ? íƒ *</label>
              <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })} style={inputStyle}>
                <option value="">? íƒ?˜ì„¸??/option>
                {reagents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          {form.target_type === 'item' && (
            <div>
              <label style={labelStyle}>ë¬¼í’ˆ ? íƒ *</label>
              <select value={form.target_id} onChange={e => setForm({ ...form, target_id: e.target.value })} style={inputStyle}>
                <option value="">? íƒ?˜ì„¸??/option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}
          {form.target_type === 'new' && (
            <div>
              <label style={labelStyle}>??ª© ?´ë¦„ *</label>
              <input value={form.target_name} onChange={e => setForm({ ...form, target_name: e.target.value })}
                placeholder="?ˆë¡œ êµ¬ë§¤???œì•½/ë¬¼í’ˆ ?´ë¦„" style={inputStyle} />
            </div>
          )}

          <div>
            <label style={labelStyle}>?˜ëŸ‰ *</label>
            <input value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}
              placeholder="?? 500mL 2ê°? style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>?”ì²­ ?¬ìœ </label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="?”ì²­ ?¬ìœ ë¥??…ë ¥?˜ì„¸?? rows={3}
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>
        <button onClick={handleSubmit} style={{
          marginTop: '16px', background: '#1e3a5f', color: 'white',
          border: 'none', padding: '10px 24px', borderRadius: '6px',
          cursor: 'pointer', fontSize: '14px', fontWeight: '600',
        }}>?”ì²­ ?œì¶œ</button>
      </div>

      {/* ?€?€ ?™ìƒ: ???”ì²­ ?„í™© ?€?€ */}
      {!isAdmin && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: '16px' }}>?“¬ ???”ì²­ ?„í™©</h2>
            <button onClick={() => fetchMyRequests(form.user_name)} style={{
              background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
              padding: '6px 14px', cursor: 'pointer', fontSize: '13px',
            }}>ì¡°íšŒ</button>
          </div>

          {!myRequestsLoaded && (
            <p style={{ color: '#a0aec0', fontSize: '14px' }}>
              ?„ì— ?´ë¦„???…ë ¥?˜ê³  'ì¡°íšŒ'ë¥??ŒëŸ¬ ?”ì²­ ?„í™©???•ì¸?˜ì„¸??
            </p>
          )}

          {myRequestsLoaded && myRequests.length === 0 && (
            <p style={{ color: '#a0aec0' }}>?”ì²­ ?´ì—­???†ìŠµ?ˆë‹¤.</p>
          )}

          {myRequests.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f7fafc' }}>
                  {['?”ì²­??, '??ª©', '?˜ëŸ‰', '?íƒœ', 'ë¹„ê³ '].map(h => (
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
                        ({req.target_type === 'reagent' ? '?œì•½' : req.target_type === 'item' ? 'ë¬¼í’ˆ' : '? ê·œ'})
                      </span>
                    </td>
                    <td style={tdStyle}>{req.quantity}</td>
                    <td style={tdStyle}><StatusBadge status={req.status} /></td>
                    <td style={{ ...tdStyle, color: '#718096', fontSize: '12px' }}>
                      {req.status === 'rejected' && req.reject_note
                        ? <span style={{ color: '#e53e3e' }}>ë°˜ë ¤ ?¬ìœ : {req.reject_note}</span>
                        : req.status === 'ordered' && req.ordered_at
                        ? `ë°œì£¼?? ${new Date(req.ordered_at).toLocaleDateString()}`
                        : req.status === 'delivered' && req.delivered_at
                        ? `ë°°ì†¡?„ë£Œ: ${new Date(req.delivered_at).toLocaleDateString()}`
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
