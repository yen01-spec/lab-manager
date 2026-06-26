import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from '../design'
import { exportItems } from '../exportUtils'

export default function Items() {
  const { isAdmin } = useOutletContext?.() || {}
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [lots, setLots] = useState([])

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('item_locations').select('*').order('name')
    if (data) setLocations(data)
  }

  async function fetchItemsByLocation(locationId) {
    const { data } = await supabase.from('items')
      .select('*, item_lots(*), item_locations(*)')
      .eq('item_location_id', locationId)
    if (data) setItems(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function fetchAllItems() {
    const { data } = await supabase.from('items')
      .select('*, item_lots(*), item_locations(*)')
      .ilike('name', `%${search}%`)
    if (data) setItems(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function openItem(item) {
    const { data } = await supabase.from('items')
      .select('*, item_lots(*), item_locations(*)').eq('id', item.id).single()
    if (data) {
      setSelectedItem(data)
      setLots(data.item_lots || [])
    }
  }

  const currentData = items

  return (
    <div>
      <PageBanner
        title="물품 관리"
        sub="Supplies Management"
        breadcrumb={['홈', '물품 관리']}
      />

      <div style={{ padding: '28px 40px' }}>
        {/* 검색 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '480px' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchAllItems()}
            placeholder="물품 이름으로 검색..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={fetchAllItems} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '20px' }}>
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
            {locations.map(loc => (
              <div key={loc.id}
                onClick={() => { setSelectedLocation(loc); fetchItemsByLocation(loc.id); setSearch('') }}
                style={{
                  padding: '11px 16px', cursor: 'pointer', fontSize: '13px',
                  borderTop: `1px solid ${C.border}`,
                  background: selectedLocation?.id === loc.id ? '#EEF2FB' : C.white,
                  color: selectedLocation?.id === loc.id ? C.navy : C.text,
                  fontWeight: selectedLocation?.id === loc.id ? '700' : '400',
                  borderLeft: selectedLocation?.id === loc.id ? `3px solid ${C.gold}` : '3px solid transparent',
                }}>
                {loc.name}
              </div>
            ))}
          </div>

          {/* 물품 목록 */}
          <div>
            {currentData.length > 0 || selectedLocation ? (
              <Card
                title={selectedLocation ? selectedLocation.name : '검색 결과'}
                sub={`${currentData.length}개 물품`}
                extra={isAdmin && currentData.length > 0 && (
                  <button onClick={() => exportItems(currentData)} style={{
                    background: '#1D6F42', color: 'white', border: 'none',
                    padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '600',
                  }}>📥 엑셀</button>
                )}
                noPadding
              >
                {currentData.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                    이 위치에 물품이 없습니다.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['물품명', '종류', '위치', '미개봉 (개)', '잔량 (%)', '상태'].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map(item => {
                        const itemLots = item.item_lots || []
                        const isLow = itemLots.some(l => l.sealed_count === 0 && l.current_stock <= 20)
                        return (
                          <tr key={item.id}
                            onClick={() => openItem(item)}
                            style={{ background: isLow ? '#FFF8F8' : C.white, cursor: 'pointer', transition: 'background 0.1s' }}
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
                            <td style={{ ...tdStyle, color: C.muted }}>{item.item_locations?.name || '-'}</td>
                            <td style={tdStyle}>{itemLots.reduce((s, l) => s + l.sealed_count, 0)}</td>
                            <td style={tdStyle}>{itemLots[0]?.current_stock ?? '-'}%</td>
                            <td style={tdStyle}>
                              {isLow
                                ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
                                : <span style={{ color: '#00875A', fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
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
                <div style={{ fontSize: '14px' }}>왼쪽에서 위치를 선택하거나 검색하세요</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 물품 상세 모달 */}
      {selectedItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.45)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setSelectedItem(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '480px', maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>물품 상세</div>
                <h2 style={{ margin: 0, color: C.navy, fontSize: '20px', fontWeight: '800' }}>{selectedItem.name}</h2>
                <p style={{ margin: '4px 0 0', color: C.muted, fontSize: '13px' }}>{selectedItem.item_locations?.name || '-'}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} style={{ background: 'transparent', border: 'none', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#CBD5E0' }}>×</button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <tbody>
                {[
                  ['종류', selectedItem.category],
                  ['위치', selectedItem.item_locations?.name],
                  ['비고', selectedItem.notes],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: '9px 14px', background: C.bg, fontWeight: '700', fontSize: '11px', color: C.muted, width: '35%', borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase' }}>{label}</td>
                    <td style={{ padding: '9px 14px', fontSize: '13px', borderBottom: `1px solid ${C.border}` }}>{value || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: '12px', fontWeight: '700', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>재고 현황</div>
            {lots.map(lot => {
              const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
              return (
                <div key={lot.id} style={{ border: `1px solid ${isLow ? '#FFCDD2' : C.border}`, borderRadius: '8px', padding: '14px 16px', marginBottom: '8px', background: isLow ? '#FFF8F8' : C.white }}>
                  <div style={{ display: 'flex', gap: '20px', fontSize: '13px', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>미개봉</span>
                      <strong>{lot.sealed_count}개</strong>
                    </div>
                    <div>
                      <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>잔량</span>
                      <strong>{lot.current_stock}%</strong>
                    </div>
                    {isLow && <span style={{ color: C.danger, fontWeight: '700' }}>⚠ 재고 부족</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
