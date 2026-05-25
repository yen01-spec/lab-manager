import { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function Admin() {
  const { isAdmin } = useOutletContext()
  const navigate = useNavigate()
  const [tab, setTab] = useState('reagent')
  const [locations, setLocations] = useState([])
  const [form, setForm] = useState({
    name: '', cas_no: '', company: '', hazard: '', category: '',
    volume: '', unit: '', location_id: '', notes: '',
    lot_no: '', expiry_date: '', received_date: ''
  })
  const [itemForm, setItemForm] = useState({
    name: '', category: '', location_id: '', notes: ''
  })
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '' })
  const [requests, setRequests] = useState([])

  useEffect(() => {
    if (!isAdmin) { alert('관리자만 접근 가능합니다'); navigate('/'); return }
    fetchLocations()
    fetchRequests()
  }, [isAdmin])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchRequests() {
    const { data } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  async function addReagent() {
    if (!form.name.trim()) { alert('시약 이름을 입력해주세요'); return }
    const { data: r } = await supabase.from('reagents').insert({
      name: form.name, cas_no: form.cas_no, company: form.company,
      hazard: form.hazard, category: form.category,
      volume: form.volume || null, unit: form.unit,
      location_id: form.location_id || null, notes: form.notes
    }).select().single()

    if (r) {
      await supabase.from('reagent_lots').insert({
        reagent_id: r.id, lot_no: form.lot_no,
        sealed_count: 0, current_stock: 100,
        expiry_date: form.expiry_date || null,
        received_date: form.received_date || null
      })
      alert('시약이 추가되었습니다!')
      setForm({ name: '', cas_no: '', company: '', hazard: '', category: '', volume: '', unit: '', location_id: '', notes: '', lot_no: '', expiry_date: '', received_date: '' })
    }
  }

  async function addItem() {
    if (!itemForm.name.trim()) { alert('물품 이름을 입력해주세요'); return }
    const { data: item } = await supabase.from('items').insert({
      name: itemForm.name, category: itemForm.category,
      location_id: itemForm.location_id || null, notes: itemForm.notes
    }).select().single()

    if (item) {
      await supabase.from('item_lots').insert({
        item_id: item.id, sealed_count: 0, current_stock: 100
      })
      alert('물품이 추가되었습니다!')
      setItemForm({ name: '', category: '', location_id: '', notes: '' })
    }
  }

  async function addNotice() {
    if (!noticeForm.title.trim()) { alert('제목을 입력해주세요'); return }
    await supabase.from('notices').insert(noticeForm)
    alert('공지사항이 등록되었습니다!')
    setNoticeForm({ title: '', content: '' })
  }

  const inputStyle = {
    width: '100%', padding: '8px', borderRadius: '4px',
    border: '1px solid #cbd5e0', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', marginBottom: '4px', color: '#666', fontSize: '14px' }

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '8px' }}>⚙️ 관리자 페이지</h1>

      {/* 미처리 구매 요청 알림 */}
      {requests.length > 0 && (
        <div style={{
          background: '#fed7d7', borderRadius: '8px', padding: '12px 16px',
          marginBottom: '24px', color: '#c53030'
        }}>
          ⚠️ 미처리 구매 요청이 <strong>{requests.length}건</strong> 있습니다.
          <button onClick={() => navigate('/requests')} style={{
            marginLeft: '12px', background: '#c53030', color: 'white',
            border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer'
          }}>확인하기</button>
        </div>
      )}

      {/* 탭 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {[['reagent', '시약 추가'], ['item', '물품 추가'], ['notice', '공지사항 작성']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: tab === key ? '#1e3a5f' : '#e2e8f0',
            color: tab === key ? 'white' : '#4a5568', fontWeight: 'bold'
          }}>{label}</button>
        ))}
      </div>

      {/* 시약 추가 */}
      {tab === 'reagent' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px' }}>
          <h2 style={{ marginTop: 0, color: '#1e3a5f' }}>시약 추가</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[
              ['name', '시약명 *', '예: Ethanol'],
              ['cas_no', 'CAS No.', '예: 64-17-5'],
              ['company', '회사명', '예: Sigma-Aldrich'],
              ['hazard', '유해·위험성', '예: 인화성 액체'],
              ['category', '유별/성질', '예: 액체'],
              ['volume', '용량', '예: 500'],
              ['unit', '단위', '예: mL'],
              ['lot_no', 'Lot No.', ''],
              ['expiry_date', '유통기한', ''],
              ['received_date', '입고일', ''],
            ].map(([key, label, placeholder]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={key.includes('date') ? 'date' : 'text'}
                  value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>위치</label>
              <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} style={inputStyle}>
                <option value="">선택하세요</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>비고</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inputStyle} />
            </div>
          </div>
          <button onClick={addReagent} style={{
            marginTop: '16px', background: '#1e3a5f', color: 'white',
            border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px'
          }}>시약 추가</button>
        </div>
      )}

      {/* 물품 추가 */}
      {tab === 'item' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px' }}>
          <h2 style={{ marginTop: 0, color: '#1e3a5f' }}>물품 추가</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {[['name', '물품명 *'], ['category', '물품 종류'], ['notes', '비고']].map(([key, label]) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input value={itemForm[key]} onChange={e => setItemForm({ ...itemForm, [key]: e.target.value })} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>위치</label>
              <select value={itemForm.location_id} onChange={e => setItemForm({ ...itemForm, location_id: e.target.value })} style={inputStyle}>
                <option value="">선택하세요</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={addItem} style={{
            marginTop: '16px', background: '#1e3a5f', color: 'white',
            border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px'
          }}>물품 추가</button>
        </div>
      )}

      {/* 공지사항 */}
      {tab === 'notice' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px' }}>
          <h2 style={{ marginTop: 0, color: '#1e3a5f' }}>공지사항 작성</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>제목 *</label>
              <input value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>내용</label>
              <textarea value={noticeForm.content} onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })}
                rows={5} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          <button onClick={addNotice} style={{
            marginTop: '16px', background: '#1e3a5f', color: 'white',
            border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px'
          }}>공지 등록</button>
        </div>
      )}
    </div>
  )
}

export default Admin
