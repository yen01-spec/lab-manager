import { useEffect, useState, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

const COLOR = {
  navy: '#1e3a5f',
  navyLight: '#2a4f82',
  bg: '#f7fafc',
  border: '#e2e8f0',
  text: '#2d3748',
  muted: '#718096',
  danger: '#e53e3e',
  dangerBg: '#fff5f5',
  success: '#38a169',
  warning: '#d69e2e',
  warningBg: '#fffff0',
}

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: '6px',
  border: `1px solid ${COLOR.border}`, boxSizing: 'border-box',
  fontSize: '14px', color: COLOR.text,
}
const labelStyle = {
  display: 'block', marginBottom: '4px',
  color: COLOR.muted, fontSize: '13px', fontWeight: '500',
}
const btnPrimary = {
  background: COLOR.navy, color: 'white', border: 'none',
  padding: '9px 20px', borderRadius: '6px', cursor: 'pointer',
  fontSize: '14px', fontWeight: '600',
}
const btnGhost = {
  background: 'white', color: COLOR.text,
  border: `1px solid ${COLOR.border}`,
  padding: '9px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
}

// ?€?€?€ ??ëª©ë¡ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
const TABS = [
  { key: 'reagent',  label: '?œì•½ ì¶”ê?',      icon: '?§ª' },
  { key: 'item',     label: 'ë¬¼í’ˆ ì¶”ê?',      icon: '?“¦' },
  { key: 'notice',   label: 'ê³µì? / ?ˆì „?•ë³´', icon: '?“¢' },
  { key: 'purchase', label: 'êµ¬ë§¤ ê´€ë¦?,       icon: '?›’' },
  { key: 'receipt',  label: '?ìˆ˜ì¦?ê´€ë¦?,     icon: '?§¾' },
  { key: 'manage',   label: 'ê´€ë¦?,            icon: '? ï¸' },
  { key: 'log',      label: 'ë³€ê²?ë¡œê·¸',       icon: '?“‹' },
]

// ?€?€?€ ?íƒœ ë±ƒì? ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function StatusBadge({ status }) {
  const map = {
    pending:  { label: '?€ê¸°ì¤‘',  bg: '#ed8936' },
    approved: { label: '?¹ì¸??,  bg: '#38a169' },
    rejected: { label: 'ë°˜ë ¤??,  bg: COLOR.danger },
    done:     { label: '?„ë£Œ',    bg: '#a0aec0' },
    ordered:  { label: 'ë°œì£¼?„ë£Œ', bg: '#667eea' },
    delivered:{ label: 'ë°°ì†¡?„ë£Œ', bg: '#38a169' },
  }
  const s = map[status] || { label: status, bg: '#a0aec0' }
  return (
    <span style={{
      background: s.bg, color: 'white',
      padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
    }}>{s.label}</span>
  )
}

// ?€?€?€ ë©”ì¸ ì»´í¬?ŒíŠ¸ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function Admin() {
  const { isAdmin } = useOutletContext()
  const navigate = useNavigate()
  const [tab, setTab] = useState('reagent')
  const [locations, setLocations] = useState([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) { alert('ê´€ë¦¬ìë§??‘ê·¼ ê°€?¥í•©?ˆë‹¤'); navigate('/'); return }
    fetchLocations()
    fetchPendingCount()
  }, [isAdmin])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchPendingCount() {
    const { count } = await supabase
      .from('purchase_requests').select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  return (
    <div style={{ display: 'flex', gap: '24px', minHeight: 'calc(100vh - 96px)' }}>
      {/* ?œë¸Œ ?¬ì´?œë°” */}
      <div style={{
        width: '180px', flexShrink: 0,
        background: 'white', borderRadius: '10px',
        border: `1px solid ${COLOR.border}`,
        padding: '12px 0', height: 'fit-content',
        position: 'sticky', top: '24px',
      }}>
        <div style={{ padding: '8px 16px 12px', fontSize: '11px', fontWeight: '700',
          color: COLOR.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          ê´€ë¦¬ì ë©”ë‰´
        </div>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            width: '100%', padding: '9px 16px', border: 'none',
            background: tab === t.key ? '#ebf4ff' : 'transparent',
            color: tab === t.key ? COLOR.navy : COLOR.text,
            fontWeight: tab === t.key ? '700' : '400',
            fontSize: '13px', cursor: 'pointer', textAlign: 'left',
            borderLeft: tab === t.key ? `3px solid ${COLOR.navy}` : '3px solid transparent',
            position: 'relative',
          }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.key === 'purchase' && pendingCount > 0 && (
              <span style={{
                marginLeft: 'auto', background: COLOR.danger, color: 'white',
                fontSize: '10px', fontWeight: '700', borderRadius: '10px',
                padding: '1px 6px', minWidth: '18px', textAlign: 'center',
              }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ë³¸ë¬¸ */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {tab === 'reagent'  && <ReagentAddTab  locations={locations} />}
        {tab === 'item'     && <ItemAddTab     locations={locations} />}
        {tab === 'notice'   && <NoticeTab />}
        {tab === 'purchase' && <PurchaseTab    onCountChange={fetchPendingCount} />}
        {tab === 'receipt'  && <ReceiptTab />}
        {tab === 'manage'   && <ManageTab />}
        {tab === 'log'      && <LogTab />}
      </div>
    </div>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  ?œì•½ ì¶”ê?
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function ReagentAddTab({ locations }) {
  const initForm = {
    name: '', cas_no: '', company: '', hazard: '', category: '',
    volume: '', unit: '', location_id: '', notes: '',
    lot_no: '', expiry_date: '', received_date: '',
  }
  const [form, setForm] = useState(initForm)
  const [adminName, setAdminName] = useState('')

  async function addReagent() {
    if (!form.name.trim()) { alert('?œì•½ ?´ë¦„???…ë ¥?´ì£¼?¸ìš”'); return }
    if (!adminName.trim()) { alert('?‘ì—…???´ë¦„???…ë ¥?´ì£¼?¸ìš”'); return }

    const { data: r } = await supabase.from('reagents').insert({
      name: form.name, cas_no: form.cas_no, company: form.company,
      hazard: form.hazard, category: form.category,
      volume: form.volume || null, unit: form.unit,
      location_id: form.location_id || null, notes: form.notes,
    }).select().single()

    if (r) {
      await supabase.from('reagent_lots').insert({
        reagent_id: r.id, lot_no: form.lot_no,
        sealed_count: 0, current_stock: 100,
        expiry_date: form.expiry_date || null,
        received_date: form.received_date || null,
      })
      await supabase.from('admin_logs').insert({
        admin_name: adminName,
        action: '?œì•½ ì¶”ê?',
        target_type: 'reagent',
        target_id: r.id,
        description: `?œì•½ ì¶”ê?: ${form.name}`,
      })
      alert('?œì•½??ì¶”ê??˜ì—ˆ?µë‹ˆ??')
      setForm(initForm)
    }
  }

  const fields = [
    ['name', '?œì•½ëª?*', 'text', '?? Ethanol'],
    ['cas_no', 'CAS No.', 'text', '?? 64-17-5'],
    ['company', '?Œì‚¬ëª?, 'text', '?? Sigma-Aldrich'],
    ['hazard', '? í•´Â·?„í—˜??, 'text', '?? ?¸í™”???¡ì²´'],
    ['category', '? ë³„/?±ì§ˆ', 'text', '?? ?¡ì²´'],
    ['volume', '?©ëŸ‰', 'text', '?? 500'],
    ['unit', '?¨ìœ„', 'text', '?? mL'],
    ['lot_no', 'Lot No.', 'text', ''],
    ['expiry_date', '? í†µê¸°í•œ', 'date', ''],
    ['received_date', '?…ê³ ??, 'date', ''],
  ]

  return (
    <Card title="?§ª ?œì•½ ì¶”ê?">
      <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#f0f4ff', borderRadius: '8px', border: '1px solid #c3d0f5' }}>
        <label style={labelStyle}>?‘ì—…???´ë¦„ * <span style={{ color: '#999', fontWeight: '400' }}>(ë¡œê·¸??ê¸°ë¡?©ë‹ˆ??</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="ë³¸ì¸ ?´ë¦„" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {fields.map(([key, label, type, ph]) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input type={type} value={form[key]} placeholder={ph}
              onChange={e => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>?„ì¹˜</label>
          <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">? íƒ?˜ì„¸??/option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>ë¹„ê³ </label>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
        </div>
      </div>
      <button onClick={addReagent} style={{ ...btnPrimary, marginTop: '20px' }}>?œì•½ ì¶”ê?</button>
    </Card>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  ë¬¼í’ˆ ì¶”ê?
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function ItemAddTab({ locations }) {
  const initForm = { name: '', category: '', location_id: '', notes: '' }
  const [form, setForm] = useState(initForm)
  const [adminName, setAdminName] = useState('')

  async function addItem() {
    if (!form.name.trim()) { alert('ë¬¼í’ˆ ?´ë¦„???…ë ¥?´ì£¼?¸ìš”'); return }
    if (!adminName.trim()) { alert('?‘ì—…???´ë¦„???…ë ¥?´ì£¼?¸ìš”'); return }

    const { data: item } = await supabase.from('items').insert({
      name: form.name, category: form.category,
      location_id: form.location_id || null, notes: form.notes,
    }).select().single()

    if (item) {
      await supabase.from('item_lots').insert({ item_id: item.id, sealed_count: 0, current_stock: 100 })
      await supabase.from('admin_logs').insert({
        admin_name: adminName, action: 'ë¬¼í’ˆ ì¶”ê?',
        target_type: 'item', target_id: item.id,
        description: `ë¬¼í’ˆ ì¶”ê?: ${form.name}`,
      })
      alert('ë¬¼í’ˆ??ì¶”ê??˜ì—ˆ?µë‹ˆ??')
      setForm(initForm)
    }
  }

  return (
    <Card title="?“¦ ë¬¼í’ˆ ì¶”ê?">
      <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#f0f4ff', borderRadius: '8px', border: '1px solid #c3d0f5' }}>
        <label style={labelStyle}>?‘ì—…???´ë¦„ * <span style={{ color: '#999', fontWeight: '400' }}>(ë¡œê·¸??ê¸°ë¡?©ë‹ˆ??</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="ë³¸ì¸ ?´ë¦„" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {[['name', 'ë¬¼í’ˆëª?*'], ['category', 'ë¬¼í’ˆ ì¢…ë¥˜'], ['notes', 'ë¹„ê³ ']].map(([key, label]) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>?„ì¹˜</label>
          <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">? íƒ?˜ì„¸??/option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>
            ))}
          </select>
        </div>
      </div>
      <button onClick={addItem} style={{ ...btnPrimary, marginTop: '20px' }}>ë¬¼í’ˆ ì¶”ê?</button>
    </Card>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  ê³µì? / ?ˆì „?•ë³´
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function NoticeTab() {
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', type: 'notice' })
  const [notices, setNotices] = useState([])
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
    if (data) setNotices(data)
  }

  async function saveNotice() {
    if (!noticeForm.title.trim()) { alert('?œëª©???…ë ¥?´ì£¼?¸ìš”'); return }
    if (editTarget) {
      await supabase.from('notices').update({ title: noticeForm.title, content: noticeForm.content, type: noticeForm.type }).eq('id', editTarget)
    } else {
      await supabase.from('notices').insert(noticeForm)
    }
    setNoticeForm({ title: '', content: '', type: 'notice' })
    setEditTarget(null)
    fetchNotices()
  }

  async function deleteNotice(id) {
    if (!window.confirm('?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchNotices()
  }

  function startEdit(n) {
    setEditTarget(n.id)
    setNoticeForm({ title: n.title, content: n.content || '', type: n.type || 'notice' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={editTarget ? '?ï¸ ?˜ì • ì¤? : '?“¢ ??ê¸€ ?‘ì„±'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '16px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>?œëª© *</label>
            <input value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ë¶„ë¥˜</label>
            <select value={noticeForm.type} onChange={e => setNoticeForm({ ...noticeForm, type: e.target.value })} style={inputStyle}>
              <option value="notice">ê³µì??¬í•­</option>
              <option value="safety">?ˆì „ê´€ë¦?/option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>?´ìš©</label>
          <textarea value={noticeForm.content} rows={4}
            onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={saveNotice} style={btnPrimary}>{editTarget ? '?˜ì • ?€?? : '?±ë¡'}</button>
          {editTarget && <button onClick={() => { setEditTarget(null); setNoticeForm({ title: '', content: '', type: 'notice' }) }} style={btnGhost}>ì·¨ì†Œ</button>}
        </div>
      </Card>

      <Card title="?“‹ ?±ë¡??ê¸€ ëª©ë¡">
        {notices.length === 0
          ? <p style={{ color: COLOR.muted }}>?±ë¡??ê¸€???†ìŠµ?ˆë‹¤.</p>
          : notices.map(n => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '12px 0', borderBottom: `1px solid ${COLOR.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', background: n.type === 'safety' ? '#fef3c7' : '#ebf8ff',
                    color: n.type === 'safety' ? '#92400e' : '#1a56db', padding: '1px 8px', borderRadius: '10px', fontWeight: '600' }}>
                    {n.type === 'safety' ? '?ˆì „ê´€ë¦? : 'ê³µì?'}
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{n.title}</span>
                  <span style={{ color: COLOR.muted, fontSize: '12px' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                {n.content && <p style={{ margin: 0, color: COLOR.muted, fontSize: '13px' }}>{n.content}</p>}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                <button onClick={() => startEdit(n)} style={{ ...btnGhost, padding: '4px 10px', fontSize: '12px' }}>?˜ì •</button>
                <button onClick={() => deleteNotice(n.id)}
                  style={{ background: COLOR.dangerBg, color: COLOR.danger, border: `1px solid #fc8181`, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>?? œ</button>
              </div>
            </div>
          ))}
      </Card>
    </div>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  êµ¬ë§¤ ê´€ë¦?
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function PurchaseTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [rejectNote, setRejectNote] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase
      .from('purchase_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  async function updateStatus(id, status, note) {
    await supabase.from('purchase_requests').update({
      status,
      ...(note ? { reject_note: note } : {}),
      ...(status === 'ordered' ? { ordered_at: new Date().toISOString() } : {}),
      ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    fetchRequests()
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, ordered: 0, delivered: 0, rejected: 0, done: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })

  const filterTabs = [
    { key: 'all', label: '?„ì²´' },
    { key: 'pending', label: '?€ê¸°ì¤‘' },
    { key: 'approved', label: '?¹ì¸?? },
    { key: 'ordered', label: 'ë°œì£¼?„ë£Œ' },
    { key: 'delivered', label: 'ë°°ì†¡?„ë£Œ' },
    { key: 'done', label: '?„ë£Œ' },
    { key: 'rejected', label: 'ë°˜ë ¤' },
  ]

  return (
    <Card title="?›’ êµ¬ë§¤ ?”ì²­ ê´€ë¦?>
      {/* ?„í„° ??*/}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {filterTabs.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === f.key ? COLOR.navy : COLOR.bg,
            color: filter === f.key ? 'white' : COLOR.text,
            fontSize: '13px', fontWeight: filter === f.key ? '600' : '400',
          }}>
            {f.label} <span style={{ opacity: 0.7 }}>({counts[f.key] ?? 0})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <p style={{ color: COLOR.muted }}>?´ë‹¹?˜ëŠ” ?”ì²­???†ìŠµ?ˆë‹¤.</p>
        : filtered.map(req => (
          <div key={req.id} style={{
            border: `1px solid ${COLOR.border}`, borderRadius: '8px',
            marginBottom: '10px', overflow: 'hidden',
          }}>
            {/* ?”ì•½ ??*/}
            <div onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', cursor: 'pointer', background: 'white' }}>
              <StatusBadge status={req.status} />
              <span style={{ fontWeight: '600', flex: 1 }}>
                {req.target_name || `(ê¸°ì¡´ ??ª© ID: ${req.target_id})`}
              </span>
              <span style={{ color: COLOR.muted, fontSize: '13px' }}>{req.user_name}</span>
              <span style={{ color: COLOR.muted, fontSize: '12px' }}>
                {new Date(req.created_at).toLocaleDateString()}
              </span>
              <span style={{ color: COLOR.muted, fontSize: '12px' }}>{expandedId === req.id ? '?? : '??}</span>
            </div>

            {/* ?ì„¸ */}
            {expandedId === req.id && (
              <div style={{ padding: '16px', background: COLOR.bg, borderTop: `1px solid ${COLOR.border}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  <InfoRow label="ì¢…ë¥˜" value={req.target_type === 'reagent' ? '?œì•½' : req.target_type === 'item' ? 'ë¬¼í’ˆ' : '? ê·œ'} />
                  <InfoRow label="?˜ëŸ‰" value={req.quantity} />
                  <InfoRow label="?”ì²­ ?¬ìœ " value={req.reason || '-'} />
                  {req.reject_note && <InfoRow label="ë°˜ë ¤ ?¬ìœ " value={req.reject_note} />}
                  {req.ordered_at && <InfoRow label="ë°œì£¼?? value={new Date(req.ordered_at).toLocaleDateString()} />}
                  {req.delivered_at && <InfoRow label="ë°°ì†¡?„ë£Œ?? value={new Date(req.delivered_at).toLocaleDateString()} />}
                </div>

                {/* ?¡ì…˜ ë²„íŠ¼ */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {req.status === 'pending' && (<>
                    <button onClick={() => updateStatus(req.id, 'approved')}
                      style={{ ...btnPrimary, background: '#38a169' }}>???¹ì¸</button>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <input placeholder="ë°˜ë ¤ ?¬ìœ " value={rejectNote[req.id] || ''}
                        onChange={e => setRejectNote({ ...rejectNote, [req.id]: e.target.value })}
                        style={{ ...inputStyle, width: '200px' }} />
                      <button onClick={() => updateStatus(req.id, 'rejected', rejectNote[req.id])}
                        style={{ ...btnPrimary, background: COLOR.danger }}>??ë°˜ë ¤</button>
                    </div>
                  </>)}
                  {req.status === 'approved' && (
                    <button onClick={() => updateStatus(req.id, 'ordered')}
                      style={{ ...btnPrimary, background: '#667eea' }}>?“¦ ë°œì£¼ ?„ë£Œ ì²˜ë¦¬</button>
                  )}
                  {req.status === 'ordered' && (
                    <button onClick={() => updateStatus(req.id, 'delivered')}
                      style={{ ...btnPrimary, background: '#38a169' }}>?šš ë°°ì†¡ ?„ë£Œ ì²˜ë¦¬</button>
                  )}
                  {req.status === 'delivered' && (
                    <button onClick={() => updateStatus(req.id, 'done')}
                      style={{ ...btnPrimary, background: '#a0aec0' }}>???„ë£Œ ì²˜ë¦¬</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  ?ìˆ˜ì¦?ê´€ë¦?
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function ReceiptTab() {
  const [receipts, setReceipts] = useState([])
  const [form, setForm] = useState({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  useEffect(() => { fetchReceipts() }, [])

  async function fetchReceipts() {
    const { data } = await supabase.from('receipts').select('*').order('date', { ascending: false })
    if (data) setReceipts(data)
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setSelectedFile(file)
  }

  async function uploadReceipt() {
    if (!form.title.trim()) { alert('?œëª©???…ë ¥?´ì£¼?¸ìš”'); return }
    if (!form.date) { alert('? ì§œë¥??…ë ¥?´ì£¼?¸ìš”'); return }

    setUploading(true)
    let fileUrl = ''

    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()
      const fileName = `receipts/${Date.now()}.${ext}`
      const { data: uploadData, error } = await supabase.storage
        .from('documents').upload(fileName, selectedFile)
      if (error) { alert('?Œì¼ ?…ë¡œ???¤íŒ¨: ' + error.message); setUploading(false); return }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
      fileUrl = urlData?.publicUrl || ''
    }

    await supabase.from('receipts').insert({
      title: form.title, doc_type: form.doc_type,
      date: form.date, notes: form.notes,
      file_url: fileUrl || form.file_url || null,
    })

    alert('?±ë¡?˜ì—ˆ?µë‹ˆ??')
    setForm({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
    setSelectedFile(null)
    setUploading(false)
    fetchReceipts()
  }

  async function deleteReceipt(id) {
    if (!window.confirm('?? œ?˜ì‹œê² ìŠµ?ˆê¹Œ?')) return
    await supabase.from('receipts').delete().eq('id', id)
    fetchReceipts()
  }

  const typeLabel = { receipt: '?ìˆ˜ì¦?, estimate: 'ê²¬ì ??, statement: 'ê±°ë˜ëª…ì„¸??, other: 'ê¸°í?' }
  const typeColor = { receipt: '#48bb78', estimate: '#667eea', statement: '#ed8936', other: '#a0aec0' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="?§¾ ?œë¥˜ ?±ë¡">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>?œëª© *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="?? Ethanol êµ¬ë§¤ ?ìˆ˜ì¦? style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>?œë¥˜ ì¢…ë¥˜</label>
            <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} style={inputStyle}>
              <option value="receipt">?ìˆ˜ì¦?/option>
              <option value="estimate">ê²¬ì ??/option>
              <option value="statement">ê±°ë˜ëª…ì„¸??/option>
              <option value="other">ê¸°í?</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>? ì§œ *</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>ë¹„ê³ </label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>?Œì¼ ì²¨ë? (?´ë?ì§€/PDF)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange}
              style={{ ...inputStyle, padding: '6px' }} />
            {selectedFile && <p style={{ margin: '4px 0 0', fontSize: '12px', color: COLOR.muted }}>? íƒ?? {selectedFile.name}</p>}
            <div style={{ marginTop: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: '2px' }}>?ëŠ” URL ì§ì ‘ ?…ë ¥</label>
              <input value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })}
                placeholder="https://..." style={inputStyle} />
            </div>
          </div>
        </div>
        <button onClick={uploadReceipt} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '?…ë¡œ??ì¤?..' : '?±ë¡'}
        </button>
      </Card>

      <Card title="?“ ?œë¥˜ ëª©ë¡">
        {receipts.length === 0
          ? <p style={{ color: COLOR.muted }}>?±ë¡???œë¥˜ê°€ ?†ìŠµ?ˆë‹¤.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: COLOR.bg }}>
                  {['? ì§œ', 'ì¢…ë¥˜', '?œëª©', 'ë¹„ê³ ', '?Œì¼', '?? œ'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left',
                      borderBottom: `2px solid ${COLOR.border}`, fontSize: '12px', color: COLOR.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.date}</td>
                    <td style={tdStyle}>
                      <span style={{ background: typeColor[r.doc_type] + '22', color: typeColor[r.doc_type],
                        padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>
                        {typeLabel[r.doc_type]}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{r.title}</td>
                    <td style={{ ...tdStyle, color: COLOR.muted }}>{r.notes || '-'}</td>
                    <td style={tdStyle}>
                      {r.file_url
                        ? <a href={r.file_url} target="_blank" rel="noreferrer"
                          style={{ color: COLOR.navy, fontSize: '13px' }}>?“ ë³´ê¸°</a>
                        : <span style={{ color: COLOR.muted, fontSize: '12px' }}>?†ìŒ</span>}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => deleteReceipt(r.id)}
                        style={{ background: 'none', border: 'none', color: COLOR.danger, cursor: 'pointer', fontSize: '14px' }}>??/button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>
    </div>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  ê´€ë¦?(? í†µê¸°í•œ ?„ë°• / ?¬ê³  ë¶€ì¡?
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function ManageTab() {
  const [expiring, setExpiring] = useState([])
  const [lowReagents, setLowReagents] = useState([])
  const [lowItems, setLowItems] = useState([])
  const [days, setDays] = useState(30)

  useEffect(() => { fetchAll() }, [days])

  async function fetchAll() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + days)
    const soonStr = soon.toISOString().split('T')[0]

    const { data: exp } = await supabase.from('reagent_lots')
      .select('*, reagents(name, locations(room, detail))')
      .lte('expiry_date', soonStr).gte('expiry_date', today)
      .order('expiry_date')
    if (exp) setExpiring(exp)

    const { data: rLow } = await supabase.from('reagent_lots')
      .select('*, reagents(name)')
      .eq('sealed_count', 0).lte('current_stock', 20)
    if (rLow) setLowReagents(rLow)

    const { data: iLow } = await supabase.from('item_lots')
      .select('*, items(name)')
      .eq('sealed_count', 0).lte('current_stock', 20)
    if (iLow) setLowItems(iLow)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ? í†µê¸°í•œ ?„ë°• */}
      <Card title={`??? í†µê¸°í•œ ?„ë°• (${days}???´ë‚´)`} extra={
        <div style={{ display: 'flex', gap: '6px' }}>
          {[14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '12px',
              background: days === d ? COLOR.navy : COLOR.bg,
              color: days === d ? 'white' : COLOR.text,
            }}>{d}??/button>
          ))}
        </div>
      }>
        {expiring.length === 0
          ? <p style={{ color: COLOR.muted }}>?´ë‹¹ ?†ìŒ</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: COLOR.bg }}>
                {['?œì•½ëª?, '?„ì¹˜', 'Lot No.', '? í†µê¸°í•œ', 'D-day'].map(h => (
                  <th key={h} style={{ ...thStyle }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {expiring.map(lot => {
                  const dday = Math.ceil((new Date(lot.expiry_date) - new Date()) / 86400000)
                  return (
                    <tr key={lot.id}>
                      <td style={tdStyle}>{lot.reagents?.name}</td>
                      <td style={{ ...tdStyle, color: COLOR.muted }}>
                        {lot.reagents?.locations?.room}{lot.reagents?.locations?.detail ? ' - ' + lot.reagents.locations.detail : ''}
                      </td>
                      <td style={{ ...tdStyle, color: COLOR.muted }}>{lot.lot_no || '-'}</td>
                      <td style={tdStyle}>{lot.expiry_date}</td>
                      <td style={{ ...tdStyle, color: dday <= 7 ? COLOR.danger : COLOR.warning, fontWeight: '700' }}>
                        D-{dday}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </Card>

      {/* ?¬ê³  ë¶€ì¡??œì•½ */}
      <Card title="? ï¸ ?¬ê³  ë¶€ì¡??œì•½">
        {lowReagents.length === 0
          ? <p style={{ color: COLOR.muted }}>?¬ê³  ë¶€ì¡??œì•½ ?†ìŒ</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: COLOR.bg }}>
                {['?œì•½ëª?, 'Lot No.', 'ë¯¸ê°œë´?, '?”ëŸ‰'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lowReagents.map(lot => (
                  <tr key={lot.id} style={{ background: COLOR.dangerBg }}>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{lot.reagents?.name}</td>
                    <td style={{ ...tdStyle, color: COLOR.muted }}>{lot.lot_no || '-'}</td>
                    <td style={tdStyle}>{lot.sealed_count}ë³?/td>
                    <td style={{ ...tdStyle, color: COLOR.danger, fontWeight: '700' }}>{lot.current_stock}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      {/* ?¬ê³  ë¶€ì¡?ë¬¼í’ˆ */}
      <Card title="? ï¸ ?¬ê³  ë¶€ì¡?ë¬¼í’ˆ">
        {lowItems.length === 0
          ? <p style={{ color: COLOR.muted }}>?¬ê³  ë¶€ì¡?ë¬¼í’ˆ ?†ìŒ</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: COLOR.bg }}>
                {['ë¬¼í’ˆëª?, 'ë¯¸ê°œë´?, '?”ëŸ‰'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lowItems.map(lot => (
                  <tr key={lot.id} style={{ background: COLOR.dangerBg }}>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{lot.items?.name}</td>
                    <td style={tdStyle}>{lot.sealed_count}ê°?/td>
                    <td style={{ ...tdStyle, color: COLOR.danger, fontWeight: '700' }}>{lot.current_stock}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>
    </div>
  )
}

// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
//  ë³€ê²?ë¡œê·¸
// ?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•?â•
function LogTab() {
  const [logs, setLogs] = useState([])
  const [stockLogs, setStockLogs] = useState([])
  const [logTab, setLogTab] = useState('admin')

  useEffect(() => { fetchLogs() }, [logTab])

  async function fetchLogs() {
    if (logTab === 'admin') {
      const { data } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(100)
      if (data) setLogs(data)
    } else {
      const { data } = await supabase.from('stock_logs')
        .select('*, reagent_lots(lot_no, reagents(name))')
        .order('created_at', { ascending: false }).limit(100)
      if (data) setStockLogs(data)
    }
  }

  return (
    <Card title="?“‹ ë³€ê²?ë¡œê·¸">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['admin', 'ê´€ë¦¬ì ?‘ì—… ë¡œê·¸'], ['stock', '?¬ê³  ?˜ì • ë¡œê·¸']].map(([key, label]) => (
          <button key={key} onClick={() => setLogTab(key)} style={{
            ...btnGhost,
            background: logTab === key ? COLOR.navy : 'white',
            color: logTab === key ? 'white' : COLOR.text,
            border: `1px solid ${logTab === key ? COLOR.navy : COLOR.border}`,
          }}>{label}</button>
        ))}
      </div>

      {logTab === 'admin' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: COLOR.bg }}>
            {['?¼ì‹œ', '?‘ì—…??, '?‘ì—…', '?€??, '?´ìš©'].map(h => <th key={h} style={thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={5} style={{ padding: '20px', color: COLOR.muted, textAlign: 'center' }}>ë¡œê·¸ê°€ ?†ìŠµ?ˆë‹¤</td></tr>
              : logs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: COLOR.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.admin_name}</td>
                  <td style={tdStyle}><span style={{ background: '#ebf8ff', color: '#2b6cb0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{l.action}</span></td>
                  <td style={{ ...tdStyle, color: COLOR.muted }}>{l.target_type}</td>
                  <td style={tdStyle}>{l.description}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {logTab === 'stock' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: COLOR.bg }}>
            {['?¼ì‹œ', '?‘ì—…??, '?œì•½', 'Lot', 'ë¯¸ê°œë´?ë³€ê²?, '?”ëŸ‰ ë³€ê²?].map(h => <th key={h} style={thStyle}>{h}</th>)}
          </tr></thead>
          <tbody>
            {stockLogs.length === 0
              ? <tr><td colSpan={6} style={{ padding: '20px', color: COLOR.muted, textAlign: 'center' }}>ë¡œê·¸ê°€ ?†ìŠµ?ˆë‹¤</td></tr>
              : stockLogs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: COLOR.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.user_name}</td>
                  <td style={tdStyle}>{l.reagent_lots?.reagents?.name || '-'}</td>
                  <td style={{ ...tdStyle, color: COLOR.muted }}>{l.reagent_lots?.lot_no || '-'}</td>
                  <td style={tdStyle}>
                    {l.before_sealed} ??<strong>{l.after_sealed}</strong>
                  </td>
                  <td style={tdStyle}>
                    {l.before_stock}% ??<strong>{l.after_stock}%</strong>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

// ?€?€ ê³µí†µ ì»´í¬?ŒíŠ¸ ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function Card({ title, children, extra }) {
  return (
    <div style={{ background: 'white', border: `1px solid ${COLOR.border}`, borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', borderBottom: `1px solid ${COLOR.border}`, background: COLOR.bg }}>
        <h2 style={{ margin: 0, fontSize: '16px', color: COLOR.navy, fontWeight: '700' }}>{title}</h2>
        {extra}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <span style={{ fontSize: '12px', color: COLOR.muted, marginRight: '6px' }}>{label}:</span>
      <span style={{ fontSize: '13px', color: COLOR.text }}>{value}</span>
    </div>
  )
}

const thStyle = {
  padding: '10px 12px', textAlign: 'left',
  borderBottom: `2px solid ${COLOR.border}`, fontSize: '12px', color: COLOR.muted, fontWeight: '600',
}
const tdStyle = {
  padding: '10px 12px', borderBottom: `1px solid ${COLOR.border}`, fontSize: '13px',
}

export default Admin
