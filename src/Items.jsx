import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, thStyle, tdStyle } from './design'

export default function Items() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchItemsByLocation(locationId) {
    const { data } = await supabase.from('items')
      .select('*, item_lots(*)').eq('location_id', locationId)
    if (data) setItems(data)
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <PageBanner
        title="물품 관리"
        sub="Supplies Management"
        breadcrumb={['홈', '물품 관리']}
      />

      <div style={{ padding: '28px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '20px' }}>
          {/* 위치 패널 */}
          <div style={{
            background: C.white, border: `1px solid ${C.border}`,
            borderRadius: '10px', overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
            height: 'fit-content', position: 'sticky', top: '80px',
          }}>
            <div style={{ padding: '12px 16px', background: C.bg, borderBottom: `1px solid ${C.border}`,
              fontSize: '11px', fontWeight: '700', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              위치 선택
            </div>
            {rooms.map(room => (
              <div key={room}>
                <div style={{ padding: '8px 16px', fontSize: '11px', fontWeight: '700',
                  color: C.muted, background: C.bg, letterSpacing: '0.05em' }}>{room}</div>
                {locations.filter(l => l.room === room).map(loc => (
                  <div key={loc.id} onClick={() => { setSelectedLocation(loc); fetchItemsByLocation(loc.id) }}
                    style={{
                      padding: '9px 16px 9px 24px', cursor: 'pointer', fontSize: '13px',
                      borderTop: `1px solid ${C.border}`,
                      background: selectedLocation?.id === loc.id ? '#EEF2FB' : C.white,
                      color: selectedLocation?.id === loc.id ? C.navy : C.text,
                      fontWeight: selectedLocation?.id === loc.id ? '700' : '400',
                      borderLeft: selectedLocation?.id === loc.id ? `3px solid ${C.gold}` : '3px solid transparent',
                    }}>
                    {loc.detail || loc.room}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* 물품 목록 */}
          <div>
            {selectedLocation ? (
              <Card
                title={`${selectedLocation.room}${selectedLocation.detail ? ' — ' + selectedLocation.detail : ''}`}
                sub={`${items.length}개 물품`}
                noPadding
              >
                {items.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                    이 위치에 물품이 없습니다.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['물품명', '종류', '미개봉 (개)', '잔량 (%)', '상태'].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const lots = item.item_lots || []
                        const isLow = lots.some(l => l.sealed_count === 0 && l.current_stock <= 20)
                        return (
                          <tr key={item.id} style={{ background: isLow ? '#FFF8F8' : C.white, transition: 'background 0.1s' }}
                            onMouseEnter={e => e.currentTarget.style.background = isLow ? '#FFEFEF' : C.bg}
                            onMouseLeave={e => e.currentTarget.style.background = isLow ? '#FFF8F8' : C.white}>
                            <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>
                              {item.name}
                              {isLow && <span style={{
                                marginLeft: '8px', fontSize: '10px', background: '#FFEBEE',
                                color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700',
                              }}>부족</span>}
                            </td>
                            <td style={{ ...tdStyle, color: C.muted }}>{item.category || '-'}</td>
                            <td style={tdStyle}>{lots.reduce((s, l) => s + l.sealed_count, 0)}</td>
                            <td style={tdStyle}>{lots[0]?.current_stock ?? '-'}%</td>
                            <td style={tdStyle}>
                              {isLow
                                ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
                                : <span style={{ color: C.success, fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
            ) : (
              <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                <div style={{ fontSize: '14px' }}>왼쪽에서 위치를 선택하세요</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
