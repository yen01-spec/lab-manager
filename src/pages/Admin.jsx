import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, StatusBadge, inputStyle, labelStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../design'

const TABS = [
  { key: 'reagent',  label: '시약 추가',       icon: '🧪', sub: 'Add Reagent' },
  { key: 'item',     label: '물품 추가',        icon: '📦', sub: 'Add Item' },
  { key: 'notice',   label: '공지 / 안전정보',  icon: '📢', sub: 'Notice' },
  { key: 'purchase', label: '구매 관리',        icon: '🛒', sub: 'Purchase' },
  { key: 'receipt',  label: '영수증 관리',      icon: '🧾', sub: 'Receipt' },
  { key: 'manage',   label: '관리',             icon: '⚠️', sub: 'Manage' },
  { key: 'log',      label: '변경 로그',        icon: '📋', sub: 'Logs' },
]

export default function Admin() {
  const { isAdmin } = useOutletContext()
  const navigate = useNavigate()
  const [tab, setTab] = useState('reagent')
  const [locations, setLocations] = useState([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) { alert('관리자만 접근 가능합니다'); navigate('/'); return }
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
    <div>
      <PageBanner title="관리자 메뉴" sub="Admin Panel" breadcrumb={['홈', '관리자']} />

      <div style={{ padding: '28px 40px', display: 'flex', gap: '24px' }}>
        {/* 서브 사이드바 */}
        <div style={{
          width: '180px', flexShrink: 0,
          background: '#fff', borderRadius: '10px',
          border: `1px solid ${C.border}`,
          padding: '12px 0', height: 'fit-content',
          position: 'sticky', top: '80px',
          boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
        }}>
          <div style={{ padding: '8px 16px 12px', fontSize: '10px', fontWeight: '700',
            color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            관리자 메뉴
          </div>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              width: '100%', padding: '9px 16px', border: 'none',
              background: tab === t.key ? '#EEF2FB' : 'transparent',
              color: tab === t.key ? C.navy : C.text,
              fontWeight: tab === t.key ? '700' : '400',
              fontSize: '13px', cursor: 'pointer', textAlign: 'left',
              borderLeft: tab === t.key ? `3px solid ${C.gold}` : '3px solid transparent',
            }}>
              <span>{t.icon}</span>
              <div>
                <div>{t.label}</div>
                <div style={{ fontSize: '10px', color: C.muted }}>{t.sub}</div>
              </div>
              {t.key === 'purchase' && pendingCount > 0 && (
                <span style={{
                  marginLeft: 'auto', background: C.danger, color: '#fff',
                  fontSize: '10px', fontWeight: '700', borderRadius: '10px',
                  padding: '1px 6px',
                }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* 본문 */}
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
    </div>
  )
}

// ══════════════════════════════════════════════
//  시약 추가
// ══════════════════════════════════════════════
function ReagentAddTab({ locations }) {
  const init = { name: '', cas_no: '', company: '', hazard: '', category: '',
    volume: '', unit: '', location_id: '', notes: '', lot_no: '', expiry_date: '', received_date: '' }
  const [form, setForm] = useState(init)
  const [adminName, setAdminName] = useState('')

  async function addReagent() {
    if (!form.name.trim()) { alert('시약 이름을 입력해주세요'); return }
    if (!adminName.trim()) { alert('작업자 이름을 입력해주세요'); return }
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
        admin_name: adminName, action: '시약 추가',
        target_type: 'reagent', target_id: r.id,
        description: `시약 추가: ${form.name}`,
      })
      alert('시약이 추가되었습니다!')
      setForm(init)
    }
  }

  const fields = [
    ['name', '시약명 *', 'text', '예: Ethanol'],
    ['cas_no', 'CAS No.', 'text', '예: 64-17-5'],
    ['company', '회사명', 'text', '예: Sigma-Aldrich'],
    ['hazard', '유해·위험성', 'text', '예: 인화성 액체'],
    ['category', '유별/성질', 'text', '예: 액체'],
    ['volume', '용량', 'text', '예: 500'],
    ['unit', '단위', 'text', '예: mL'],
    ['lot_no', 'Lot No.', 'text', ''],
    ['expiry_date', '유통기한', 'date', ''],
    ['received_date', '입고일', 'date', ''],
  ]

  return (
    <Card title="🧪 시약 추가" sub="Add Reagent">
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: `1px solid #C3D0F5` }}>
        <label style={labelStyle}>작업자 이름 * <span style={{ color: C.muted, fontWeight: '400', textTransform: 'none' }}>(로그에 기록됩니다)</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
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
          <label style={labelStyle}>위치</label>
          <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">선택하세요</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>비고</label>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
        </div>
      </div>
      <button onClick={addReagent} style={{ ...btnPrimary, marginTop: '20px' }}>시약 추가</button>
    </Card>
  )
}

// ══════════════════════════════════════════════
//  물품 추가
// ══════════════════════════════════════════════
function ItemAddTab({ locations }) {
  const init = { name: '', category: '', location_id: '', notes: '' }
  const [form, setForm] = useState(init)
  const [adminName, setAdminName] = useState('')

  async function addItem() {
    if (!form.name.trim()) { alert('물품 이름을 입력해주세요'); return }
    if (!adminName.trim()) { alert('작업자 이름을 입력해주세요'); return }
    const { data: item } = await supabase.from('items').insert({
      name: form.name, category: form.category,
      location_id: form.location_id || null, notes: form.notes,
    }).select().single()
    if (item) {
      await supabase.from('item_lots').insert({ item_id: item.id, sealed_count: 0, current_stock: 100 })
      await supabase.from('admin_logs').insert({
        admin_name: adminName, action: '물품 추가',
        target_type: 'item', target_id: item.id,
        description: `물품 추가: ${form.name}`,
      })
      alert('물품이 추가되었습니다!')
      setForm(init)
    }
  }

  return (
    <Card title="📦 물품 추가" sub="Add Item">
      <div style={{ marginBottom: '20px', padding: '12px 16px',
        background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
        <label style={labelStyle}>작업자 이름 * <span style={{ color: C.muted, fontWeight: '400', textTransform: 'none' }}>(로그에 기록됩니다)</span></label>
        <input value={adminName} onChange={e => setAdminName(e.target.value)}
          placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {[['name', '물품명 *'], ['category', '물품 종류'], ['notes', '비고']].map(([key, label]) => (
          <div key={key}>
            <label style={labelStyle}>{label}</label>
            <input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
          </div>
        ))}
        <div>
          <label style={labelStyle}>위치</label>
          <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
            <option value="">선택하세요</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
          </select>
        </div>
      </div>
      <button onClick={addItem} style={{ ...btnPrimary, marginTop: '20px' }}>물품 추가</button>
    </Card>
  )
}

// ══════════════════════════════════════════════
//  공지 / 안전정보
// ══════════════════════════════════════════════
function NoticeTab() {
  const [form, setForm] = useState({ title: '', content: '', type: 'notice' })
  const [notices, setNotices] = useState([])
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
    if (data) setNotices(data)
  }

  async function save() {
    if (!form.title.trim()) { alert('제목을 입력해주세요'); return }
    if (editTarget) {
      await supabase.from('notices').update({ title: form.title, content: form.content, type: form.type }).eq('id', editTarget)
    } else {
      await supabase.from('notices').insert(form)
    }
    setForm({ title: '', content: '', type: 'notice' })
    setEditTarget(null)
    fetchNotices()
  }

  async function del(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchNotices()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={editTarget ? '✏️ 수정 중' : '📢 새 글 작성'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '16px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>분류</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="notice">공지사항</option>
              <option value="safety">안전관리</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>내용</label>
          <textarea value={form.content} rows={4}
            onChange={e => setForm({ ...form, content: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} style={btnPrimary}>{editTarget ? '수정 저장' : '등록'}</button>
          {editTarget && <button onClick={() => { setEditTarget(null); setForm({ title: '', content: '', type: 'notice' }) }} style={btnGhost}>취소</button>}
        </div>
      </Card>

      <Card title="📋 등록된 글 목록">
        {notices.length === 0
          ? <p style={{ color: C.muted }}>등록된 글이 없습니다.</p>
          : notices.map(n => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px',
                    background: n.type === 'safety' ? '#FEF3C7' : '#EBF8FF',
                    color: n.type === 'safety' ? '#92400E' : '#1A56DB',
                    padding: '1px 8px', borderRadius: '10px', fontWeight: '700' }}>
                    {n.type === 'safety' ? '안전관리' : '공지'}
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{n.title}</span>
                  <span style={{ color: C.muted, fontSize: '12px' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                {n.content && <p style={{ margin: 0, color: C.muted, fontSize: '13px' }}>{n.content}</p>}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                <button onClick={() => { setEditTarget(n.id); setForm({ title: n.title, content: n.content || '', type: n.type || 'notice' }) }}
                  style={{ ...btnGhost, padding: '4px 10px', fontSize: '12px' }}>수정</button>
                <button onClick={() => del(n.id)} style={{
                  background: '#FFF5F5', color: C.danger, border: `1px solid #FC8181`,
                  padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
              </div>
            </div>
          ))}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  구매 관리
// ══════════════════════════════════════════════
function PurchaseTab({ onCountChange }) {
  const [requests, setRequests] = useState([])
  const [filter, setFilter] = useState('all')
  const [rejectNote, setRejectNote] = useState({})
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { fetchRequests() }, [])

  async function fetchRequests() {
    const { data } = await supabase.from('purchase_requests').select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
    onCountChange && onCountChange()
  }

  async function updateStatus(id, status, note) {
    await supabase.from('purchase_requests').update({
      status,
      ...(note ? { reject_note: note } : {}),
      ...(status === 'ordered'   ? { ordered_at:   new Date().toISOString() } : {}),
      ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
    }).eq('id', id)
    fetchRequests()
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const counts = { all: requests.length, pending: 0, approved: 0, ordered: 0, delivered: 0, rejected: 0, done: 0 }
  requests.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })

  const filterTabs = [
    { key: 'all', label: '전체' }, { key: 'pending', label: '대기중' },
    { key: 'approved', label: '승인됨' }, { key: 'ordered', label: '발주완료' },
    { key: 'delivered', label: '배송완료' }, { key: 'done', label: '완료' }, { key: 'rejected', label: '반려' },
  ]

  return (
    <Card title="🛒 구매 요청 관리" sub="Purchase Management">
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {filterTabs.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
            background: filter === f.key ? C.navy : C.bg,
            color: filter === f.key ? '#fff' : C.text,
            fontSize: '12px', fontWeight: filter === f.key ? '700' : '400',
          }}>
            {f.label} <span style={{ opacity: 0.7 }}>({counts[f.key] ?? 0})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0
        ? <p style={{ color: C.muted }}>해당하는 요청이 없습니다.</p>
        : filtered.map(req => (
          <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', marginBottom: '10px', overflow: 'hidden' }}>
            <div onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', cursor: 'pointer', background: '#fff' }}>
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
                    ['수량', req.quantity],
                    ['요청 사유', req.reason || '-'],
                    req.reject_note && ['반려 사유', req.reject_note],
                    req.ordered_at && ['발주일', new Date(req.ordered_at).toLocaleDateString()],
                    req.delivered_at && ['배송완료일', new Date(req.delivered_at).toLocaleDateString()],
                  ].filter(Boolean).map(([label, value]) => (
                    <div key={label}>
                      <span style={{ fontSize: '11px', color: C.muted, marginRight: '6px' }}>{label}:</span>
                      <span style={{ fontSize: '13px' }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {req.status === 'pending' && (<>
                    <button onClick={() => updateStatus(req.id, 'approved')}
                      style={{ ...btnPrimary, background: '#38A169' }}>✓ 승인</button>
                    <input placeholder="반려 사유" value={rejectNote[req.id] || ''}
                      onChange={e => setRejectNote({ ...rejectNote, [req.id]: e.target.value })}
                      style={{ ...inputStyle, width: '200px' }} />
                    <button onClick={() => updateStatus(req.id, 'rejected', rejectNote[req.id])}
                      style={{ ...btnPrimary, background: C.danger }}>✗ 반려</button>
                  </>)}
                  {req.status === 'approved' && (
                    <button onClick={() => updateStatus(req.id, 'ordered')}
                      style={{ ...btnPrimary, background: '#667EEA' }}>📦 발주 완료</button>
                  )}
                  {req.status === 'ordered' && (
                    <button onClick={() => updateStatus(req.id, 'delivered')}
                      style={{ ...btnPrimary, background: '#38A169' }}>🚚 배송 완료</button>
                  )}
                  {req.status === 'delivered' && (
                    <button onClick={() => updateStatus(req.id, 'done')}
                      style={{ ...btnPrimary, background: '#A0AEC0' }}>✓ 완료 처리</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}

// ══════════════════════════════════════════════
//  영수증 관리
// ══════════════════════════════════════════════
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

  async function upload() {
    if (!form.title.trim()) { alert('제목을 입력해주세요'); return }
    if (!form.date) { alert('날짜를 입력해주세요'); return }
    setUploading(true)
    let fileUrl = ''
    if (selectedFile) {
      const ext = selectedFile.name.split('.').pop()
      const fileName = `receipts/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(fileName, selectedFile)
      if (error) { alert('파일 업로드 실패: ' + error.message); setUploading(false); return }
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
      fileUrl = urlData?.publicUrl || ''
    }
    await supabase.from('receipts').insert({
      title: form.title, doc_type: form.doc_type,
      date: form.date, notes: form.notes,
      file_url: fileUrl || form.file_url || null,
    })
    alert('등록되었습니다!')
    setForm({ title: '', doc_type: 'receipt', date: '', notes: '', file_url: '' })
    setSelectedFile(null)
    setUploading(false)
    fetchReceipts()
  }

  async function del(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('receipts').delete().eq('id', id)
    fetchReceipts()
  }

  const typeLabel = { receipt: '영수증', estimate: '견적서', statement: '거래명세서', other: '기타' }
  const typeColor = { receipt: '#38A169', estimate: '#667EEA', statement: '#E8A020', other: '#A0AEC0' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title="🧾 서류 등록">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
          <div><label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="예: Ethanol 구매 영수증" style={inputStyle} /></div>
          <div><label style={labelStyle}>서류 종류</label>
            <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} style={inputStyle}>
              <option value="receipt">영수증</option>
              <option value="estimate">견적서</option>
              <option value="statement">거래명세서</option>
              <option value="other">기타</option>
            </select></div>
          <div><label style={labelStyle}>날짜 *</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>비고</label>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>파일 첨부 (이미지/PDF)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setSelectedFile(e.target.files[0])}
              style={{ ...inputStyle, padding: '6px' }} />
            {selectedFile && <p style={{ margin: '4px 0 0', fontSize: '12px', color: C.muted }}>선택됨: {selectedFile.name}</p>}
            <label style={{ ...labelStyle, marginTop: '8px' }}>또는 URL 직접 입력</label>
            <input value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })}
              placeholder="https://..." style={inputStyle} />
          </div>
        </div>
        <button onClick={upload} disabled={uploading} style={{ ...btnPrimary, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? '업로드 중...' : '등록'}
        </button>
      </Card>

      <Card title="📁 서류 목록" noPadding>
        {receipts.length === 0
          ? <p style={{ padding: '20px', color: C.muted }}>등록된 서류가 없습니다.</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['날짜', '종류', '제목', '비고', '파일', '삭제'].map(h =>
                <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.date}</td>
                    <td style={tdStyle}>
                      <span style={{ background: typeColor[r.doc_type] + '22', color: typeColor[r.doc_type],
                        padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>
                        {typeLabel[r.doc_type]}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: '600' }}>{r.title}</td>
                    <td style={{ ...tdStyle, color: C.muted }}>{r.notes || '-'}</td>
                    <td style={tdStyle}>{r.file_url
                      ? <a href={r.file_url} target="_blank" rel="noreferrer" style={{ color: C.navy, fontSize: '13px' }}>📎 보기</a>
                      : <span style={{ color: C.muted, fontSize: '12px' }}>없음</span>}</td>
                    <td style={tdStyle}>
                      <button onClick={() => del(r.id)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  관리 탭
// ══════════════════════════════════════════════
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
      .lte('expiry_date', soonStr).gte('expiry_date', today).order('expiry_date')
    if (exp) setExpiring(exp)
    const { data: rLow } = await supabase.from('reagent_lots')
      .select('*, reagents(name)').eq('sealed_count', 0).lte('current_stock', 20)
    if (rLow) setLowReagents(rLow)
    const { data: iLow } = await supabase.from('item_lots')
      .select('*, items(name)').eq('sealed_count', 0).lte('current_stock', 20)
    if (iLow) setLowItems(iLow)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={`⏰ 유통기한 임박 (${days}일 이내)`}
        extra={<div style={{ display: 'flex', gap: '6px' }}>
          {[14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '12px',
              background: days === d ? C.navy : C.bg, color: days === d ? '#fff' : C.text,
            }}>{d}일</button>
          ))}
        </div>}>
        {expiring.length === 0 ? <p style={{ color: C.muted }}>해당 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명', '위치', 'Lot No.', '유통기한', 'D-day'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{expiring.map(lot => {
                const dday = Math.ceil((new Date(lot.expiry_date) - new Date()) / 86400000)
                return <tr key={lot.id}>
                  <td style={tdStyle}>{lot.reagents?.name}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.reagents?.locations?.room}{lot.reagents?.locations?.detail ? ' - ' + lot.reagents.locations.detail : ''}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.lot_no || '-'}</td>
                  <td style={tdStyle}>{lot.expiry_date}</td>
                  <td style={{ ...tdStyle, color: dday <= 7 ? C.danger : C.warning, fontWeight: '700' }}>D-{dday}</td>
                </tr>
              })}</tbody>
            </table>}
      </Card>

      <Card title="⚠️ 재고 부족 시약">
        {lowReagents.length === 0 ? <p style={{ color: C.muted }}>재고 부족 시약 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명', 'Lot No.', '미개봉', '잔량'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{lowReagents.map(lot => (
                <tr key={lot.id} style={{ background: '#FFF8F8' }}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{lot.reagents?.name}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.lot_no || '-'}</td>
                  <td style={tdStyle}>{lot.sealed_count}병</td>
                  <td style={{ ...tdStyle, color: C.danger, fontWeight: '700' }}>{lot.current_stock}%</td>
                </tr>
              ))}</tbody>
            </table>}
      </Card>

      <Card title="⚠️ 재고 부족 물품">
        {lowItems.length === 0 ? <p style={{ color: C.muted }}>재고 부족 물품 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['물품명', '미개봉', '잔량'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{lowItems.map(lot => (
                <tr key={lot.id} style={{ background: '#FFF8F8' }}>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{lot.items?.name}</td>
                  <td style={tdStyle}>{lot.sealed_count}개</td>
                  <td style={{ ...tdStyle, color: C.danger, fontWeight: '700' }}>{lot.current_stock}%</td>
                </tr>
              ))}</tbody>
            </table>}
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════
//  로그
// ══════════════════════════════════════════════
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
        .select('*, reagent_lots(lot_no, reagents(name))').order('created_at', { ascending: false }).limit(100)
      if (data) setStockLogs(data)
    }
  }

  return (
    <Card title="📋 변경 로그" sub="Change Logs">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[['admin', '관리자 작업 로그'], ['stock', '재고 수정 로그']].map(([key, label]) => (
          <button key={key} onClick={() => setLogTab(key)} style={{
            ...btnGhost,
            background: logTab === key ? C.navy : '#fff',
            color: logTab === key ? '#fff' : C.text,
            border: `1px solid ${logTab === key ? C.navy : C.border}`,
          }}>{label}</button>
        ))}
      </div>

      {logTab === 'admin' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['일시', '작업자', '작업', '대상', '내용'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {logs.length === 0
              ? <tr><td colSpan={5} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>로그가 없습니다</td></tr>
              : logs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.admin_name}</td>
                  <td style={tdStyle}><span style={{ background: '#EBF8FF', color: '#2B6CB0', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{l.action}</span></td>
                  <td style={{ ...tdStyle, color: C.muted }}>{l.target_type}</td>
                  <td style={tdStyle}>{l.description}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {logTab === 'stock' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['일시', '작업자', '시약', 'Lot', '미개봉 변경', '잔량 변경'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {stockLogs.length === 0
              ? <tr><td colSpan={6} style={{ padding: '20px', color: C.muted, textAlign: 'center' }}>로그가 없습니다</td></tr>
              : stockLogs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...tdStyle, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, fontWeight: '600' }}>{l.user_name}</td>
                  <td style={tdStyle}>{l.reagent_lots?.reagents?.name || '-'}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{l.reagent_lots?.lot_no || '-'}</td>
                  <td style={tdStyle}>{l.before_sealed} → <strong>{l.after_sealed}</strong></td>
                  <td style={tdStyle}>{l.before_stock}% → <strong>{l.after_stock}%</strong></td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
