import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, btnPrimary, thStyle, tdStyle } from '../design'

export default function ReagentList() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [reagents, setReagents] = useState([])
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [editingLot, setEditingLot] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editType, setEditType] = useState('')
  const [userName, setUserName] = useState('')
  const [openRooms, setOpenRooms] = useState({})
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const alphabetRefs = useRef({})

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchReagentsByLocation(locationId) {
    const { data } = await supabase.from('reagents')
      .select('*, reagent_lots(*)').eq('location_id', locationId)
    if (data) setReagents(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleSearch() {
    if (!search.trim()) return
    const { data } = await supabase.from('reagents')
      .select('*, reagent_lots(*), locations(*)').ilike('name', `%${search}%`)
    if (data) setSearchResults(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function openReagent(reagent) {
    const { data } = await supabase.from('reagents')
      .select('*, locations(*), reagent_lots(*)').eq('id', reagent.id).single()
    if (data) { setSelectedReagent(data); setLots(data.reagent_lots || []) }
  }

  async function updateStock(lot, field, value) {
    if (!userName.trim()) { alert('이름을 입력해주세요'); return }
    await supabase.from('reagent_lots').update({ [field]: value }).eq('id', lot.id)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lot.id, user_name: userName,
      before_sealed: lot.sealed_count, after_sealed: field === 'sealed_count' ? value : lot.sealed_count,
      before_stock: lot.current_stock, after_stock: field === 'current_stock' ? value : lot.current_stock,
    })
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, [field]: value } : l))
    setEditingLot(null)
  }

  const rooms = [...new Set(locations.map(l => l.room))]
  const toggleRoom = (room) => setOpenRooms(prev => prev[room] ? {} : { [room]: true })

  const getGroupedReagents = (data) => {
    const groups = {}
    data.forEach(r => {
      const letter = r.name[0].toUpperCase()
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(r)
    })
    return groups
  }

  const scrollToLetter = (letter) => {
    const el = alphabetRefs.current[letter]
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }

  const ReagentTable = ({ data }) => {
    const groups = getGroupedReagents(data)
    const letters = Object.keys(groups).sort()
    const availableLetters = new Set(letters)

    return (
      <div style={{ position: 'relative' }}>
        {/* 알파벳 인덱스 */}
        <div style={{
          position: 'fixed', right: '16px', top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 50,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)',
          borderRadius: '8px', padding: '6px 4px',
          boxShadow: '0 2px 12px rgba(26,42,94,0.12)',
          border: `1px solid ${C.border}`,
        }}>
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
            <button key={letter} onClick={() => scrollToLetter(letter)}
              disabled={!availableLetters.has(letter)} style={{
                width: '20px', height: '20px', borderRadius: '4px', border: 'none',
                cursor: availableLetters.has(letter) ? 'pointer' : 'default',
                background: availableLetters.has(letter) ? C.navy : 'transparent',
                color: availableLetters.has(letter) ? C.white : '#ccc',
                fontSize: '10px', fontWeight: '700', padding: 0,
              }}>{letter}</button>
          ))}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['시약명', '회사', '용량', 'Lot 수', '상태'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {letters.map(letter => (
              <>
                <tr key={letter + '_header'} ref={el => alphabetRefs.current[letter] = el}>
                  <td colSpan={5} style={{
                    padding: '8px 14px',
                    background: `linear-gradient(90deg, ${C.navy}11, transparent)`,
                    fontWeight: '800', fontSize: '13px', color: C.navy,
                    borderBottom: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${C.gold}`,
                  }}>{letter}</td>
                </tr>
                {groups[letter].map(r => {
                  const lotList = r.reagent_lots || []
                  const isLow = lotList.some(l => l.sealed_count === 0 && l.current_stock <= 20)
                  return (
                    <tr key={r.id} onClick={() => openReagent(r)} style={{
                      background: isLow ? '#FFF8F8' : C.white, cursor: 'pointer',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = isLow ? '#FFEFEF' : C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = isLow ? '#FFF8F8' : C.white}
                    >
                      <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>
                        {r.name}
                        {isLow && <span style={{
                          marginLeft: '8px', fontSize: '10px', background: '#FFEBEE',
                          color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700',
                        }}>부족</span>}
                      </td>
                      <td style={{ ...tdStyle, color: C.muted }}>{r.company || '-'}</td>
                      <td style={{ ...tdStyle, color: C.muted }}>{r.volume}{r.unit}</td>
                      <td style={tdStyle}>{lotList.length}개</td>
                      <td style={tdStyle}>
                        {isLow
                          ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
                          : <span style={{ color: C.success, fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
                      </td>
                    </tr>
                  )
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <PageBanner
        title="시약 목록"
        sub="Reagent List"
        breadcrumb={['홈', '시약 관리', '시약 목록']}
      />

      <div style={{ padding: '28px 40px' }}>
        {/* 검색 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '480px' }}>
          <input value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults([]) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="시약 이름으로 검색..."
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleSearch} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>
            검색
          </button>
        </div>

        {/* 검색 결과 */}
        {searchResults.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>
                검색 결과 <span style={{ color: C.gold }}>{searchResults.length}개</span>
              </div>
              <button onClick={() => { setSearchResults([]); setSearch('') }} style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: '5px',
                padding: '4px 12px', cursor: 'pointer', fontSize: '12px', color: C.muted,
              }}>닫기</button>
            </div>
            <Card noPadding><ReagentTable data={searchResults} /></Card>
          </div>
        )}

        {/* 위치 버튼 (상단) */}
        {searchResults.length === 0 && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {rooms.map(room => (
                <div key={room} style={{
                  border: `1px solid ${C.border}`, borderRadius: '8px',
                  overflow: 'hidden', minWidth: '120px',
                  boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
                }}>
                  <div onClick={() => toggleRoom(room)} style={{
                    padding: '9px 16px', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
                    background: openRooms[room] ? C.navy : C.white,
                    color: openRooms[room] ? C.white : C.text,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                    borderLeft: openRooms[room] ? `3px solid ${C.gold}` : '3px solid transparent',
                  }}>
                    <span>{room}</span>
                    <span style={{ fontSize: '11px', opacity: 0.7 }}>{openRooms[room] ? '▲' : '▼'}</span>
                  </div>
                  {openRooms[room] && (
                    <div style={{ background: C.white }}>
                      {locations.filter(l => l.room === room).map(loc => (
                        <div key={loc.id}
                          onClick={() => { setSelectedLocation(loc); fetchReagentsByLocation(loc.id) }}
                          style={{
                            padding: '8px 16px 8px 20px', cursor: 'pointer', fontSize: '12px',
                            borderTop: `1px solid ${C.border}`,
                            background: selectedLocation?.id === loc.id ? '#EEF2FB' : C.bg,
                            color: selectedLocation?.id === loc.id ? C.navy : C.muted,
                            fontWeight: selectedLocation?.id === loc.id ? '700' : '400',
                            borderLeft: selectedLocation?.id === loc.id ? `3px solid ${C.gold}` : '3px solid transparent',
                          }}>
                          {loc.detail || loc.room}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 시약 테이블 (하단) */}
            {selectedLocation ? (
              <Card
                title={`${selectedLocation.room}${selectedLocation.detail ? ' — ' + selectedLocation.detail : ''}`}
                sub={`${reagents.length}개 시약`}
                noPadding
              >
                {reagents.length === 0
                  ? <div style={{ padding: '32px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                      이 위치에 시약이 없습니다.
                    </div>
                  : <ReagentTable data={reagents} />}
              </Card>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📍</div>
                <div style={{ fontSize: '14px' }}>위에서 위치를 선택하세요</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 시약 상세 모달 */}
      {selectedReagent && (
        <Modal onClose={() => setSelectedReagent(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>시약 상세</div>
              <h2 style={{ margin: 0, color: C.navy, fontSize: '20px', fontWeight: '800' }}>{selectedReagent.name}</h2>
              <p style={{ margin: '4px 0 0', color: C.muted, fontSize: '13px' }}>
                {selectedReagent.locations?.room}{selectedReagent.locations?.detail && ' — ' + selectedReagent.locations.detail}
              </p>
            </div>
            <button onClick={() => setSelectedReagent(null)} style={{
              background: C.bg, border: 'none', borderRadius: '6px',
              width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', color: C.muted,
            }}>✕</button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <tbody>
              {[
                ['CAS No.', selectedReagent.cas_no],
                ['회사', selectedReagent.company],
                ['유별/성질', selectedReagent.category],
                ['용량', `${selectedReagent.volume} ${selectedReagent.unit}`],
                ['유해·위험성', selectedReagent.hazard],
                ['비고', selectedReagent.notes],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: '9px 14px', background: C.bg, fontWeight: '700',
                    fontSize: '11px', color: C.muted, width: '35%', borderBottom: `1px solid ${C.border}`,
                    textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</td>
                  <td style={{ padding: '9px 14px', fontSize: '13px', borderBottom: `1px solid ${C.border}`, color: C.text }}>
                    {value || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: '12px', fontWeight: '700', color: C.muted,
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
            재고 현황 (Lot별)
          </div>
          {lots.map(lot => {
            const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
            return (
              <div key={lot.id} style={{
                border: `1px solid ${isLow ? '#FFCDD2' : C.border}`,
                borderRadius: '8px', padding: '14px 16px', marginBottom: '8px',
                background: isLow ? '#FFF8F8' : C.white,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: C.muted, marginBottom: '6px' }}>
                      Lot <strong style={{ color: C.text }}>{lot.lot_no || '-'}</strong>
                      &nbsp;·&nbsp; 유통기한 {lot.expiry_date || '-'}
                    </div>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '13px' }}>
                      <span>미개봉 <strong>{lot.sealed_count}병</strong></span>
                      <span>잔량 <strong>{lot.current_stock}%</strong></span>
                      {isLow && <span style={{ color: C.danger, fontWeight: '700' }}>⚠ 재고 부족</span>}
                    </div>
                  </div>
                  <button onClick={() => { setEditingLot(lot); setEditValue(''); setEditType('') }}
                    style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
                      padding: '6px 14px', cursor: 'pointer', fontSize: '12px', color: C.text }}>
                    수정
                  </button>
                </div>
              </div>
            )
          })}
        </Modal>
      )}

      {/* 재고 수정 모달 */}
      {editingLot && (
        <Modal onClose={() => setEditingLot(null)} small>
          <h3 style={{ marginTop: 0, color: C.navy, fontSize: '16px' }}>재고 수정</h3>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>이름 (필수)</label>
            <input value={userName} onChange={e => setUserName(e.target.value)}
              placeholder="본인 이름" style={{ width: '100%', padding: '9px 12px', borderRadius: '6px',
                border: `1px solid ${C.border}`, boxSizing: 'border-box', fontSize: '14px' }} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>수정 항목</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[['sealed', '미개봉 병 수'], ['stock', '잔량 (%)']].map(([key, label]) => (
                <button key={key} onClick={() => setEditType(key)} style={{
                  flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', border: 'none',
                  background: editType === key ? C.navy : C.bg,
                  color: editType === key ? C.white : C.text,
                  fontWeight: editType === key ? '700' : '400', fontSize: '13px',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {editType === 'sealed' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>미개봉 병 수</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'center' }}>
                <button onClick={() => setEditValue(v => Math.max(0, Number(v === '' ? editingLot.sealed_count : v) - 1))}
                  style={{ width: '36px', height: '36px', borderRadius: '6px', border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: '18px', background: C.white }}>−</button>
                <span style={{ fontSize: '24px', fontWeight: '800', color: C.navy, minWidth: '40px', textAlign: 'center' }}>
                  {editValue === '' ? editingLot.sealed_count : editValue}
                </span>
                <button onClick={() => setEditValue(v => Number(v === '' ? editingLot.sealed_count : v) + 1)}
                  style={{ width: '36px', height: '36px', borderRadius: '6px', border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: '18px', background: C.white }}>+</button>
              </div>
            </div>
          )}

          {editType === 'stock' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', color: C.muted, fontWeight: '700', textTransform: 'uppercase' }}>
                잔량: {editValue === '' ? editingLot.current_stock : editValue}%
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                  <button key={v} onClick={() => setEditValue(v)} style={{
                    padding: '6px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '12px',
                    background: (editValue === '' ? editingLot.current_stock : editValue) === v ? C.navy : C.bg,
                    color: (editValue === '' ? editingLot.current_stock : editValue) === v ? C.white : C.text,
                    fontWeight: '600',
                  }}>{v}%</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button onClick={() => setEditingLot(null)} style={{
              flex: 1, padding: '10px', borderRadius: '6px',
              border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px',
            }}>취소</button>
            <button onClick={() => {
              if (!editType) { alert('수정 항목을 선택하세요'); return }
              const field = editType === 'sealed' ? 'sealed_count' : 'current_stock'
              const value = editValue === '' ? editingLot[field] : Number(editValue)
              updateStock(editingLot, field, value)
            }} style={{
              flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
              background: C.navy, color: C.white, cursor: 'pointer', fontWeight: '700', fontSize: '13px',
            }}>저장</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ children, onClose, small }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(26,42,94,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px',
        padding: '28px', width: small ? '380px' : '640px',
        maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        {children}
      </div>
    </div>
  )
}
