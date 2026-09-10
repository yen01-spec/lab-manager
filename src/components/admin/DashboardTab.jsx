import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  관리자 대시보드 — 처리 대기 요약 + 확인 필요(유통기한 임박 / 재고 부족)
//  (예전 "관리" 탭을 첫 화면 요약으로 흡수, 물품 재고 항목은 제거)
// ══════════════════════════════════════════════
export default function DashboardTab({ onGoTab }) {
  const [counts, setCounts] = useState({ change: 0, disposal: 0, location: 0, purchase: 0 })
  const [expiring, setExpiring] = useState([])
  const [lowReagents, setLowReagents] = useState([])
  const [days, setDays] = useState(30)

  async function fetchCounts() {
    const [{ count: change }, { count: disposal }, { count: location }, { count: purchase }] = await Promise.all([
      supabase.from('reagent_change_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('disposal_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('location_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('purchase_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    setCounts({ change: change || 0, disposal: disposal || 0, location: location || 0, purchase: purchase || 0 })
  }

  async function fetchLists() {
    const today = new Date().toISOString().split('T')[0]
    const soon = new Date(); soon.setDate(soon.getDate() + days)
    const soonStr = soon.toISOString().split('T')[0]
    const { data: exp } = await supabase.from('reagent_lots')
      .select('*, reagents(name), locations(room, detail)')
      .eq('status', 'active')
      .lte('expiry_date', soonStr).gte('expiry_date', today).order('expiry_date')
    if (exp) setExpiring(exp)
    const { data: rLow } = await supabase.from('reagent_lots')
      .select('*, reagents(name)').eq('status', 'active').eq('sealed_count', 0).lte('current_stock', 20)
    if (rLow) setLowReagents(rLow)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCounts() }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { fetchLists() }, [days])

  const pendingItems = [
    { key: 'change', label: '정보 변경 요청', value: counts.change, tab: 'req-change' },
    { key: 'disposal', label: '폐기 요청', value: counts.disposal, tab: 'req-disposal' },
    { key: 'location', label: '위치 이동 요청', value: counts.location, tab: 'req-move' },
    { key: 'purchase', label: '구매 요청', value: counts.purchase, tab: 'purchase' },
  ]
  const checkItems = [
    { label: '유통기한 임박 시약', value: expiring.length },
    { label: '재고 부족 시약', value: lowReagents.length },
  ]

  const box = { flex: 1, minWidth: 140, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      <Card title="⏳ 처리 대기">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {pendingItems.map(it => (
            <button key={it.key} onClick={() => onGoTab?.(it.tab)} style={{ ...box, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{it.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: it.value > 0 ? C.navy : '#B6BCC6' }}>{it.value}건</div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="🔎 확인 필요">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {checkItems.map(it => (
            <div key={it.label} style={box}>
              <div style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{it.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: it.value > 0 ? C.danger : '#B6BCC6' }}>{it.value}건</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={`⏰ 유통기한 임박 (${days}일 이내)`}
        extra={<div style={{ display: 'flex', gap: '6px' }}>
          {[14, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '3px 10px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontSize: '12px', background: days === d ? C.navy : C.bg, color: days === d ? '#fff' : C.text }}>{d}일</button>
          ))}
        </div>}>
        {expiring.length === 0 ? <p style={{ color: C.muted }}>해당 없음</p>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명', '위치', 'Lot No.', '유통기한', 'D-day'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
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
    </div>
  )
}
