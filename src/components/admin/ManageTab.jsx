import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  관리 탭
// ══════════════════════════════════════════════
export default function ManageTab() {
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
      .select('*, reagents(name), locations(room, detail)')
      .eq('status', 'active')
      .lte('expiry_date', soonStr).gte('expiry_date', today).order('expiry_date')
    if (exp) setExpiring(exp)
    const { data: rLow } = await supabase.from('reagent_lots').select('*, reagents(name)').eq('status', 'active').eq('sealed_count', 0).lte('current_stock', 20)
    if (rLow) setLowReagents(rLow)
    const { data: iLow } = await supabase.from('item_lots').select('*, items(name)').eq('sealed_count', 0).lte('current_stock', 20)
    if (iLow) setLowItems(iLow)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={`⏰ 유통기한 임박 (${days}일 이내)`}
        extra={<div style={{ display: 'flex', gap: '6px' }}>
          {[14,30,60,90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '12px', background: days === d ? C.navy : C.bg, color: days === d ? '#fff' : C.text }}>{d}일</button>
          ))}
        </div>}>
        {expiring.length === 0 ? <p style={{ color: C.muted }}>해당 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명','위치','Lot No.','유통기한','D-day'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>{expiring.map(lot => {
                const dday = Math.ceil((new Date(lot.expiry_date) - new Date()) / 86400000)
                return <tr key={lot.id}>
                  <td style={tdStyle}>{lot.reagents?.name}</td>
                  <td style={{ ...tdStyle, color: C.muted }}>{lot.locations?.room}{lot.locations?.detail ? ' - ' + lot.locations.detail : ''}</td>
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
              <thead><tr>{['시약명','Lot No.','미개봉','잔량'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
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
              <thead><tr>{['물품명','미개봉','잔량'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
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
