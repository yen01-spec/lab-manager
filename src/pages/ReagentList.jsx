import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, btnPrimary, thStyle, tdStyle } from '../design'

// ── GHS 위험성 이모지 매핑 ──────────────────────────────
const GHS_MAP = [
  { keywords: ['인화', '발화', '가연', 'flammable', 'flame'],        emoji: '🔥', label: '인화성' },
  { keywords: ['독성', '독극', 'toxic', 'poison', '독'],              emoji: '💀', label: '독성' },
  { keywords: ['부식', '산', '염기', 'corrosive', 'acid', 'base'],    emoji: '🧪', label: '부식성' },
  { keywords: ['폭발', 'explosi', '폭'],                              emoji: '💥', label: '폭발성' },
  { keywords: ['산화', 'oxidiz', 'oxidis'],                           emoji: '🔶', label: '산화성' },
  { keywords: ['가스', '고압', 'gas', 'pressure'],                    emoji: '🫧', label: '고압가스' },
  { keywords: ['자극', '경고', 'irritant', 'warning', '유해'],        emoji: '⚠️', label: '유해성' },
  { keywords: ['환경', '수생', 'environment', 'aquatic'],             emoji: '🌊', label: '환경유해' },
  { keywords: ['발암', '생식', '변이', 'carcinogen', 'mutagen'],      emoji: '☣️', label: '발암성' },
]

function getGhsEmojis(hazard) {
  if (!hazard) return []
  const lower = hazard.toLowerCase()
  return GHS_MAP.filter(g => g.keywords.some(k => lower.includes(k)))
}

export default function ReagentList() {
  const { isAdmin } = useOutletContext?.() || {}
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [reagents, setReagents] = useState([])
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [openRooms, setOpenRooms] = useState({})
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const alphabetRefs = useRef({})

  // 인라인 편집 상태
  const [inlineEdit, setInlineEdit] = useState(null) // { lotId, reagentId, field, value }
  const [userName, setUserName] = useState(() => localStorage.getItem('stock_user_name') || '')
  const [showNameModal, setShowNameModal] = useState(false)
  const [pendingEdit, setPendingEdit] = useState(null)

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchReagentsByLocation(locationId) {
    const { data } = await supabase.from('reagents')
      .select('*, reagent_lots(*), locations(*)')
      .eq('location_id', locationId)
    if (data) setReagents(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function refetchReagents() {
    if (selectedLocation) await fetchReagentsByLocation(selectedLocation.id)
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

  // 인라인 편집 시작
  function startInlineEdit(lotId, reagentId, field, currentValue, e) {
    e.stopPropagation()
    if (!isAdmin) return
    if (!userName.trim()) {
      setPendingEdit({ lotId, reagentId, field, currentValue })
      setShowNameModal(true)
      return
    }
    setInlineEdit({ lotId, reagentId, field, value: currentValue })
  }

  // 인라인 편집 저장
  async function saveInlineEdit(lot) {
    if (!inlineEdit) return
    const { lotId, field, value } = inlineEdit
    const numVal = Number(value)
    if (isNaN(numVal)) { alert('숫자를 입력해주세요'); return }

    await supabase.from('reagent_lots').update({ [field]: numVal }).eq('id', lotId)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lotId, user_name: userName,
      before_sealed: lot.sealed_count,
      after_sealed: field === 'sealed_count' ? numVal : lot.sealed_count,
      before_stock: lot.current_stock,
      after_stock: field === 'current_stock' ? numVal : lot.current_stock,
    })
    setInlineEdit(null)
    refetchReagents()
    // 상세 모달도 열려있으면 갱신
    if (selectedReagent) {
      const { data } = await supabase.from('reagents')
        .select('*, locations(*), reagent_lots(*)').eq('id', selectedReagent.id).single()
      if (data) { setSelectedReagent(data); setLots(data.reagent_lots || []) }
    }
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

  const COLS = 9
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr>
                {['시약명', 'CAS No.', '회사', '용량', '성상', '위치', 'GHS', '재고', '상태'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {letters.map(letter => (
                <>
                  <tr key={letter + '_header'} ref={el => alphabetRefs.current[letter] = el}>
                    <td colSpan={COLS} style={{
                      padding: '8px 14px',
                      background: `linear-gradient(90deg, ${C.navy}11, transparent)`,
                      fontWeight: '800', fontSize: '13px', color: C.navy,
                      borderBottom: `1px solid ${C.border}`,
                      borderLeft: `3px solid ${C.gold}`,
                    }}>{letter}</td>
                  </tr>
                  {groups[letter].map(r => {
                    const lotList = r.reagent_lots || []
                    const totalSealed = lotList.reduce((s, l) => s + l.sealed_count, 0)
                    const avgStock = lotList.length > 0
                      ? Math.round(lotList.reduce((s, l) => s + l.current_stock, 0) / lotList.length)
                      : 0
                    const isLow = lotList.some(l => l.sealed_count === 0 && l.current_stock <= 20)
                    const ghsList = getGhsEmojis(r.hazard)
                    const loc = r.locations

                    // 인라인 편집 중인 lot
                    const editingThisSealed = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'sealed_count'
                    const editingThisStock = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'current_stock'
                    const firstLot = lotList[0]

                    return (
                      <tr key={r.id}
                        onClick={() => openReagent(r)}
                        style={{ background: isLow ? '#FFF8F8' : C.white, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = isLow ? '#FFEFEF' : C.bg}
                        onMouseLeave={e => e.currentTarget.style.background = isLow ? '#FFF8F8' : C.white}
                      >
                        {/* 시약명 */}
                        <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px' }}>
                          {r.name}
                          {isLow && <span style={{
                            marginLeft: '6px', fontSize: '10px', background: '#FFEBEE',
                            color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700',
                          }}>부족</span>}
                        </td>
                        {/* CAS No. */}
                        <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {r.cas_no || '-'}
                        </td>
                        {/* 회사 */}
                        <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.company || '-'}</td>
                        {/* 용량 */}
                        <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {r.volume ? `${r.volume}${r.unit}` : '-'}
                        </td>
                        {/* 성상 (category) */}
                        <td style={{ ...tdStyle, fontSize: '12px' }}>
                          {r.category
                            ? <span style={{
                                background: '#EEF2FB', color: C.navy,
                                padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                              }}>{r.category}</span>
                            : <span style={{ color: C.muted }}>-</span>}
                        </td>
                        {/* 위치 */}
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                          {loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}
                        </td>
                        {/* GHS */}
                        <td style={{ ...tdStyle, fontSize: '16px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          {ghsList.length > 0
                            ? <span title={ghsList.map(g => g.label).join(', ')}>{ghsList.map(g => g.emoji).join('')}</span>
                            : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
                        </td>
                        {/* 재고 (인라인 편집) */}
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          {firstLot ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {/* 미개봉 */}
                              {editingThisSealed ? (
                                <input
                                  autoFocus
                                  type="number" min="0"
                                  value={inlineEdit.value}
                                  onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveInlineEdit(firstLot)
                                    if (e.key === 'Escape') setInlineEdit(null)
                                  }}
                                  onBlur={() => saveInlineEdit(firstLot)}
                                  style={{ width: '52px', padding: '3px 6px', borderRadius: '4px',
                                    border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }}
                                />
                              ) : (
                                <span
                                  onClick={e => firstLot && startInlineEdit(firstLot.id, r.id, 'sealed_count', totalSealed, e)}
                                  title={isAdmin ? '클릭하여 수정' : ''}
                                  style={{
                                    cursor: isAdmin ? 'text' : 'default',
                                    padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                                    border: isAdmin ? `1px dashed ${C.border}` : 'none',
                                    minWidth: '32px', display: 'inline-block', textAlign: 'center',
                                  }}>{totalSealed}병</span>
                              )}
                              <span style={{ color: C.muted, fontSize: '11px' }}>/</span>
                              {/* 잔량 */}
                              {editingThisStock ? (
                                <input
                                  autoFocus
                                  type="number" min="0" max="100"
                                  value={inlineEdit.value}
                                  onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveInlineEdit(firstLot)
                                    if (e.key === 'Escape') setInlineEdit(null)
                                  }}
                                  onBlur={() => saveInlineEdit(firstLot)}
                                  style={{ width: '52px', padding: '3px 6px', borderRadius: '4px',
                                    border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }}
                                />
                              ) : (
                                <span
                                  onClick={e => firstLot && startInlineEdit(firstLot.id, r.id, 'current_stock', avgStock, e)}
                                  title={isAdmin ? '클릭하여 수정' : ''}
                                  style={{
                                    cursor: isAdmin ? 'text' : 'default',
                                    padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                                    border: isAdmin ? `1px dashed ${C.border}` : 'none',
                                    minWidth: '32px', display: 'inline-block', textAlign: 'center',
                                  }}>{avgStock}%</span>
                              )}
                            </div>
                          ) : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
                        </td>
                        {/* 상태 */}
                        <td style={tdStyle}>
                          {isLow
                            ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
                            : <span style={{ color: '#00875A', fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {/* 관리자 인라인 편집 안내 */}
        {isAdmin && (
          <div style={{ padding: '8px 14px', fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}` }}>
            💡 재고 숫자를 클릭하면 바로 수정할 수 있어요. (엔터로 저장, ESC로 취소)
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageBanner title="시약 목록" sub="Reagent List" breadcrumb={['홈', '시약 관리', '시약 목록']} />

      <div style={{ padding: '28px 40px' }}>
        {/* 검색 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '480px' }}>
          <input value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults([]) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="시약 이름으로 검색..."
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={handleSearch} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
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

        {/* 위치 버튼 + 시약 테이블 */}
        {searchResults.length === 0 && (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {rooms.map(room => (
                <div key={room} style={{ position: 'relative' }}>
                  <div onClick={() => toggleRoom(room)} style={{
                    padding: '9px 16px', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
                    background: openRooms[room] ? C.navy : C.white,
                    color: openRooms[room] ? C.white : C.text,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                    border: `1px solid ${C.border}`, borderRadius: '8px',
                    borderLeft: openRooms[room] ? `3px solid ${C.gold}` : `3px solid ${C.border}`,
                    boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
                    minWidth: '120px', userSelect: 'none',
                  }}>
                    <span>{room}</span>
                    <span style={{ fontSize: '11px', opacity: 0.7 }}>{openRooms[room] ? '▲' : '▼'}</span>
                  </div>
                  {openRooms[room] && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, zIndex: 100,
                      background: C.white, border: `1px solid ${C.border}`,
                      borderRadius: '8px', marginTop: '4px', minWidth: '140px',
                      boxShadow: '0 4px 16px rgba(26,42,94,0.12)', overflow: 'hidden',
                    }}>
                      {locations.filter(l => l.room === room).map(loc => (
                        <div key={loc.id}
                          onClick={() => { setSelectedLocation(loc); fetchReagentsByLocation(loc.id); setOpenRooms({}) }}
                          style={{
                            padding: '9px 16px', cursor: 'pointer', fontSize: '13px',
                            borderBottom: `1px solid ${C.border}`,
                            background: selectedLocation?.id === loc.id ? '#EEF2FB' : C.white,
                            color: selectedLocation?.id === loc.id ? C.navy : C.text,
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

          {/* GHS 표시 */}
          {selectedReagent.hazard && getGhsEmojis(selectedReagent.hazard).length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {getGhsEmojis(selectedReagent.hazard).map(g => (
                <span key={g.label} style={{
                  background: '#FFF8E7', border: '1px solid #F6C343',
                  borderRadius: '6px', padding: '4px 10px', fontSize: '13px',
                }}>{g.emoji} {g.label}</span>
              ))}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <tbody>
              {[
                ['CAS No.', selectedReagent.cas_no],
                ['회사', selectedReagent.company],
                ['유별/성질', selectedReagent.category],
                ['용량', `${selectedReagent.volume || ''} ${selectedReagent.unit || ''}`],
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
            const editingSealed = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'sealed_count'
            const editingStock = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'current_stock'
            return (
              <div key={lot.id} style={{
                border: `1px solid ${isLow ? '#FFCDD2' : C.border}`,
                borderRadius: '8px', padding: '14px 16px', marginBottom: '8px',
                background: isLow ? '#FFF8F8' : C.white,
              }}>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>
                  Lot <strong style={{ color: C.text }}>{lot.lot_no || '-'}</strong>
                  &nbsp;·&nbsp; 유통기한 {lot.expiry_date || '-'}
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '13px', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>미개봉</span>
                    {editingSealed ? (
                      <input autoFocus type="number" min="0"
                        value={inlineEdit.value}
                        onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                        onBlur={() => saveInlineEdit(lot)}
                        style={{ width: '60px', padding: '3px 6px', borderRadius: '4px',
                          border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                    ) : (
                      <strong
                        onClick={e => isAdmin && startInlineEdit(lot.id, selectedReagent.id, 'sealed_count', lot.sealed_count, e)}
                        style={{ cursor: isAdmin ? 'text' : 'default',
                          padding: '1px 6px', borderRadius: '4px',
                          border: isAdmin ? `1px dashed ${C.border}` : 'none' }}>
                        {lot.sealed_count}병
                      </strong>
                    )}
                  </div>
                  <div>
                    <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>잔량</span>
                    {editingStock ? (
                      <input autoFocus type="number" min="0" max="100"
                        value={inlineEdit.value}
                        onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                        onBlur={() => saveInlineEdit(lot)}
                        style={{ width: '60px', padding: '3px 6px', borderRadius: '4px',
                          border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                    ) : (
                      <strong
                        onClick={e => isAdmin && startInlineEdit(lot.id, selectedReagent.id, 'current_stock', lot.current_stock, e)}
                        style={{ cursor: isAdmin ? 'text' : 'default',
                          padding: '1px 6px', borderRadius: '4px',
                          border: isAdmin ? `1px dashed ${C.border}` : 'none' }}>
                        {lot.current_stock}%
                      </strong>
                    )}
                  </div>
                  {isLow && <span style={{ color: C.danger, fontWeight: '700' }}>⚠ 재고 부족</span>}
                </div>
              </div>
            )
          })}
        </Modal>
      )}

      {/* 이름 입력 모달 (인라인 편집 전) */}
      {showNameModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.45)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: C.white, borderRadius: '12px', padding: '24px',
            width: '320px', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ marginTop: 0, color: C.navy, fontSize: '15px' }}>이름 입력</h3>
            <p style={{ color: C.muted, fontSize: '13px', marginBottom: '12px' }}>
              수정 이력에 기록될 이름을 입력해주세요.
            </p>
            <input value={userName} onChange={e => setUserName(e.target.value)}
              placeholder="본인 이름" autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && userName.trim()) {
                  localStorage.setItem('stock_user_name', userName)
                  setShowNameModal(false)
                  if (pendingEdit) {
                    setInlineEdit({ ...pendingEdit, value: pendingEdit.currentValue })
                    setPendingEdit(null)
                  }
                }
              }}
              style={{ ...inputStyle, marginBottom: '14px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowNameModal(false); setPendingEdit(null) }}
                style={{ flex: 1, padding: '9px', borderRadius: '6px', border: `1px solid ${C.border}`,
                  background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={() => {
                if (!userName.trim()) return
                localStorage.setItem('stock_user_name', userName)
                setShowNameModal(false)
                if (pendingEdit) {
                  setInlineEdit({ ...pendingEdit, value: pendingEdit.currentValue })
                  setPendingEdit(null)
                }
              }} style={{ flex: 1, padding: '9px', borderRadius: '6px', border: 'none',
                background: C.navy, color: C.white, cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
                확인
              </button>
            </div>
          </div>
        </div>
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
