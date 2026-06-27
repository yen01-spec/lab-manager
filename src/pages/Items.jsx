import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from '../design'

export default function Items() {
  const { isAdmin } = useOutletContext?.() || {}
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [lots, setLots] = useState([])

  // 모달들
  const [showStockModal, setShowStockModal] = useState(false)
  const [stockForm, setStockForm] = useState({ action: 'out', quantity: '', user_name: '' })
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveForm, setMoveForm] = useState({ to_location_id: '', requested_by: '', notes: '' })
  const [showLowStockModal, setShowLowStockModal] = useState(false)
  const [lowStockForm, setLowStockForm] = useState({ requested_by: '', notes: '' })

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

  async function handleSearch() {
    if (!search.trim()) return
    const { data } = await supabase.from('items')
      .select('*, item_lots(*), item_locations(*)')
      .ilike('name', `%${search}%`)
    if (data) setSearchResults(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function openItem(item) {
    const { data } = await supabase.from('items')
      .select('*, item_lots(*), item_locations(*)').eq('id', item.id).single()
    if (data) {
      setSelectedItem(data)
      setLots(data.item_lots || [])
      setMoveForm({ to_location_id: '', requested_by: '', notes: '' })
    }
  }

  async function refetchItem() {
    if (!selectedItem) return
    const { data } = await supabase.from('items')
      .select('*, item_lots(*), item_locations(*)').eq('id', selectedItem.id).single()
    if (data) { setSelectedItem(data); setLots(data.item_lots || []) }
    if (selectedLocation) fetchItemsByLocation(selectedLocation.id)
    else if (search) handleSearch()
  }

  async function submitStock() {
    if (!stockForm.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (!stockForm.quantity) { alert('수량을 입력해주세요'); return }
    const firstLot = lots[0]
    if (!firstLot) { alert('재고 정보가 없습니다'); return }
    const qty = Number(stockForm.quantity)
    let newSealed = firstLot.sealed_count
    let newOpened = firstLot.current_stock
    if (stockForm.action === 'in') newSealed = firstLot.sealed_count + qty
    else if (stockForm.action === 'open') {
      newSealed = Math.max(0, firstLot.sealed_count - qty)
      newOpened = firstLot.current_stock + qty
    } else if (stockForm.action === 'out') {
      newOpened = Math.max(0, firstLot.current_stock - qty)
    }
    await supabase.from('item_lots').update({ sealed_count: newSealed, current_stock: newOpened }).eq('id', firstLot.id)
    alert('기록되었습니다!')
    setShowStockModal(false)
    setStockForm({ action: 'out', quantity: '', user_name: '' })
    refetchItem()
  }

  async function submitMove() {
    if (!moveForm.requested_by.trim()) { alert('이름을 입력해주세요'); return }
    if (!moveForm.to_location_id) { alert('이동할 위치를 선택해주세요'); return }
    if (selectedItem.item_location_id === moveForm.to_location_id) { alert('현재 위치와 같습니다'); return }
    const toLoc = locations.find(l => l.id === moveForm.to_location_id)
    const fromLocName = selectedItem.item_locations?.name || '미지정'
    const toLocName = toLoc?.name || ''

    if (isAdmin) {
      await supabase.from('items').update({ item_location_id: moveForm.to_location_id }).eq('id', selectedItem.id)
      alert(`✅ 위치 이동 완료!\n${fromLocName} → ${toLocName}`)
      setShowMoveModal(false)
      refetchItem()
    } else {
      await supabase.from('location_requests').insert({
        reagent_id: selectedItem.id, reagent_name: selectedItem.name,
        from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        requested_by: moveForm.requested_by, notes: moveForm.notes, status: 'pending',
      })
      supabase.functions.invoke('send-notification', {
        body: {
          title: '📍 물품 위치 이동 신청',
          body: `${moveForm.requested_by}님이 ${selectedItem.name} 위치 이동을 신청했습니다.`,
          role: 'admin',
        }
      })
      alert('위치 이동 신청 완료! 관리자 승인 후 처리됩니다.')
      setShowMoveModal(false)
    }
  }

  async function submitLowStock() {
    if (!lowStockForm.requested_by.trim()) { alert('이름을 입력해주세요'); return }
    supabase.functions.invoke('send-notification', {
      body: {
        title: '⚠️ 물품 재고 부족 알림',
        body: `${lowStockForm.requested_by}님이 ${selectedItem.name} 재고 부족을 신고했습니다.${lowStockForm.notes ? ' (' + lowStockForm.notes + ')' : ''}`,
        role: 'admin',
      }
    }).then(() => {
      alert('재고 부족 알림을 관리자에게 전송했습니다!')
      setShowLowStockModal(false)
      setLowStockForm({ requested_by: '', notes: '' })
    })
  }

  const currentData = searchResults.length > 0 ? searchResults : items

  return (
    <div>
      <PageBanner title="물품 관리" sub="Supplies Management" breadcrumb={['홈', '물품 관리']} />

      <div style={{ padding: '28px 40px' }}>
        {/* 검색 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '480px' }}>
          <input value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults([]) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="물품 이름으로 검색..."
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleSearch} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
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
                onClick={() => { setSelectedLocation(loc); fetchItemsByLocation(loc.id); setSearch(''); setSearchResults([]) }}
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
            {searchResults.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>
                  검색 결과 <span style={{ color: C.gold }}>{searchResults.length}개</span>
                </div>
                <button onClick={() => { setSearchResults([]); setSearch('') }} style={{
                  background: 'none', border: `1px solid ${C.border}`, borderRadius: '5px',
                  padding: '4px 12px', cursor: 'pointer', fontSize: '12px', color: C.muted,
                }}>닫기</button>
              </div>
            )}

            {currentData.length > 0 || selectedLocation ? (
              <Card
                title={searchResults.length > 0 ? '검색 결과' : selectedLocation?.name || ''}
                sub={`${currentData.length}개 물품`}
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
                        {['물품명', '단위', '위치', '미개봉 수량', '개봉 수량', '비고'].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map(item => {
                        const itemLots = item.item_lots || []
                        const firstLot = itemLots[0]
                        const isLow = itemLots.some(l => l.sealed_count === 0)
                        return (
                          <tr key={item.id}
                            onClick={() => openItem(item)}
                            style={{ background: isLow ? '#FFF8F8' : C.white, cursor: 'pointer' }}
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
                            <td style={tdStyle}>{firstLot?.sealed_count ?? '-'}</td>
                            <td style={tdStyle}>{firstLot?.current_stock ?? '-'}</td>
                            <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{item.notes || '-'}</td>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.45)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setSelectedItem(null); setShowStockModal(false); setShowMoveModal(false); setShowLowStockModal(false) }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '560px', maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>물품 상세</div>
                <h2 style={{ margin: 0, color: C.navy, fontSize: '20px', fontWeight: '800' }}>{selectedItem.name}</h2>
                <p style={{ margin: '4px 0 0', color: C.muted, fontSize: '13px' }}>{selectedItem.item_locations?.name || '-'}</p>
              </div>
              <button onClick={() => setSelectedItem(null)} style={{ background: 'transparent', border: 'none', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#CBD5E0' }}>×</button>
            </div>

            {/* 액션 버튼 */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
              <button onClick={() => setShowStockModal(true)} style={{ background: '#EBF8FF', color: '#2B6CB0', border: '1px solid #90CDF4', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>📦 입출고</button>
              <button onClick={() => setShowMoveModal(true)} style={{ background: '#EEF2FB', color: '#667EEA', border: '1px solid #C3D0F5', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>📍 위치 이동{!isAdmin ? ' 신청' : ''}</button>
              <button onClick={() => setShowLowStockModal(true)} style={{ background: '#FFF5F5', color: C.danger, border: '1px solid #FC8181', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>⚠️ 재고 부족 알림</button>
            </div>

            {/* 기본 정보 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <tbody>
                {[
                  ['단위', selectedItem.category],
                  ['위치', selectedItem.item_locations?.name],
                  ['비고', selectedItem.notes],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: '9px 14px', background: C.bg, fontWeight: '700', fontSize: '11px', color: C.muted, width: '30%', borderBottom: `1px solid ${C.border}`, textTransform: 'uppercase' }}>{label}</td>
                    <td style={{ padding: '9px 14px', fontSize: '13px', borderBottom: `1px solid ${C.border}` }}>{value || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 재고 현황 */}
            <div style={{ fontSize: '12px', fontWeight: '700', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>재고 현황</div>
            {lots.map(lot => {
              const isLow = lot.sealed_count === 0
              return (
                <div key={lot.id} style={{ border: `1px solid ${isLow ? '#FFCDD2' : C.border}`, borderRadius: '8px', padding: '14px 16px', marginBottom: '8px', background: isLow ? '#FFF8F8' : C.white }}>
                  <div style={{ display: 'flex', gap: '24px', fontSize: '13px', alignItems: 'center' }}>
                    <div>
                      <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>미개봉 수량</span>
                      <strong>{lot.sealed_count}{selectedItem.category ? ' ' + selectedItem.category : ''}</strong>
                    </div>
                    <div>
                      <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>개봉 수량</span>
                      <strong>{lot.current_stock}{selectedItem.category ? ' ' + selectedItem.category : ''}</strong>
                    </div>
                    {isLow && <span style={{ color: C.danger, fontWeight: '700' }}>⚠ 재고 부족</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 입출고 모달 */}
      {showStockModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowStockModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📦 입출고 기록</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{selectedItem.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>구분 *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[['in','📥 입고'],['open','🔓 개봉'],['out','📤 사용/출고']].map(([val, label]) => (
                    <button key={val} onClick={() => setStockForm({ ...stockForm, action: val })} style={{
                      flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                      background: stockForm.action === val ? C.navy : C.bg,
                      color: stockForm.action === val ? '#fff' : C.text,
                      border: `1px solid ${stockForm.action === val ? C.navy : C.border}`,
                    }}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>수량 *</label>
                <input type="number" value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                  placeholder={`예: 1`} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이름 *</label>
                <input value={stockForm.user_name} onChange={e => setStockForm({ ...stockForm, user_name: e.target.value })} placeholder="본인 이름" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowStockModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={submitStock} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>기록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 위치 이동 모달 */}
      {showMoveModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowMoveModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📍 위치 이동{!isAdmin ? ' 신청' : ''}</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{selectedItem.name}</p>
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: C.bg, borderRadius: '8px', fontSize: '13px' }}>
              <span style={{ color: C.muted, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>현재 위치</span>
              <div style={{ marginTop: '4px', fontWeight: '600', color: C.navy }}>{selectedItem.item_locations?.name || '미지정'}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이동할 위치 *</label>
                <select value={moveForm.to_location_id} onChange={e => setMoveForm({ ...moveForm, to_location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>{isAdmin ? '이동자' : '신청자'} 이름 *</label>
                <input value={moveForm.requested_by} onChange={e => setMoveForm({ ...moveForm, requested_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>메모</label>
                <input value={moveForm.notes} onChange={e => setMoveForm({ ...moveForm, notes: e.target.value })} placeholder="선택사항" style={inputStyle} />
              </div>
            </div>
            {!isAdmin && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                ⚠️ 학생 신청은 관리자 승인 후 반영됩니다.
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowMoveModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={submitMove} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#667EEA', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>{isAdmin ? '📍 이동' : '📍 신청하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 재고 부족 알림 모달 */}
      {showLowStockModal && selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowLowStockModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>⚠️ 재고 부족 알림</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{selectedItem.name} 재고 부족을 관리자에게 알립니다.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이름 *</label>
                <input value={lowStockForm.requested_by} onChange={e => setLowStockForm({ ...lowStockForm, requested_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>메모</label>
                <input value={lowStockForm.notes} onChange={e => setLowStockForm({ ...lowStockForm, notes: e.target.value })} placeholder="예: 거의 다 떨어짐" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowLowStockModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={submitLowStock} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.danger, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>알림 보내기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
