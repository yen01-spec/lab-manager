import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary } from '../../design'

// ══════════════════════════════════════════════
//  물품 추가
// ══════════════════════════════════════════════
export default function ItemAddTab({ locations }) {
  const [itemLocations, setItemLocations] = useState([])

useEffect(() => {
  supabase.from('item_locations').select('*').order('name').then(({ data }) => {
    if (data) setItemLocations(data)
  })
}, [])
  const init = { name: '', category: '', item_location_id: '', notes: '' }
  const [form, setForm] = useState(init)
  const [adminName, setAdminName] = useState('')

  async function addItem() {
    if (!form.name.trim()) { alert('물품 이름을 입력해주세요'); return }
    if (!adminName.trim()) { alert('작업자 이름을 입력해주세요'); return }
    const { data: item } = await supabase.from('items').insert({
      name: form.name, category: form.category,
      item_location_id: form.item_location_id || null, notes: form.notes,
    }).select().single()
    if (item) {
      await supabase.from('item_lots').insert({ item_id: item.id, sealed_count: 0, current_stock: 100 })
      await supabase.from('admin_logs').insert({
        admin_name: adminName, action: '물품 추가',
        target_type: 'item',
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
        <div><label style={labelStyle}>위치</label>
          <select value={form.item_location_id} onChange={e => setForm({ ...form, item_location_id: e.target.value })} style={inputStyle}>
  <option value="">선택하세요</option>
  {itemLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
</select></div>
      </div>
      <button onClick={addItem} style={{ ...btnPrimary, marginTop: '20px' }}>물품 추가</button>
    </Card>
  )
}
