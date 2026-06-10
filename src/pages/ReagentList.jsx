import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'

function AlphabetIndex({ availableLetters, onScroll }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const handleScroll = () => {
      setVisible(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 1500)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div style={{
      position: 'fixed', right: '12px', top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', gap: '2px',
      opacity: visible ? 0.85 : 0,
      transition: 'opacity 0.3s ease',
      zIndex: 50,
      background: 'rgba(255,255,255,0.7)',
      backdropFilter: 'blur(4px)',
      borderRadius: '8px',
      padding: '6px 4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
        <button key={letter}
          onClick={() => { onScroll(letter); setVisible(false) }}
          disabled={!availableLetters.has(letter)}
          style={{
            width: '22px', height: '22px', borderRadius: '4px', border: 'none',
            cursor: availableLetters.has(letter) ? 'pointer' : 'default',
            background: availableLetters.has(letter) ? '#1e3a5f' : 'transparent',
            color: availableLetters.has(letter) ? 'white' : '#ccc',
            fontSize: '11px', fontWeight: 'bold', padding: 0
          }}>{letter}</button>
      ))}
    </div>
  )
}

function ReagentList() {
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
    const { data } = await supabase
      .from('reagents')
      .select('*, reagent_lots(*)')
      .eq('location_id', locationId)
    if (data) setReagents(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleSearch() {
    if (!search.trim()) return
    const { data } = await supabase
      .from('reagents')
      .select('*, reagent_lots(*), locations(*)')
      .ilike('name', `%${search}%`)
    if (data) setSearchResults(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function openReagent(reagent) {
    const { data } = await supabase
      .from('reagents')
      .select('*, locations(*), reagent_lots(*)')
      .eq('id', reagent.id)
      .single()
    if (data) {
      setSelectedReagent(data)
      setLots(data.reagent_lots || [])
    }
  }

  async function updateStock(lot, field, value) {
    if (!userName.trim()) { alert('?¥Î¶Ñ???ÖÎ†•?¥Ï£º?∏Ïöî'); return }
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
  const toggleRoom = (room) => setOpenRooms(prev => ({ ...prev, [room]: !prev[room] }))

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
    if (el) {
      const offset = 80
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  const ReagentTable = ({ data }) => {
    const groups = getGroupedReagents(data)
    const letters = Object.keys(groups).sort()
    const availableLetters = new Set(letters)

    return (
      <div>
        <AlphabetIndex availableLetters={availableLetters} onScroll={scrollToLetter} />
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f7fafc' }}>
              {['?úÏïΩÎ™?, '?åÏÇ¨', '?©Îüâ', 'Lot ??, '?ÅÌÉú'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '13px', color: '#4a5568' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {letters.map(letter => (
              <>
                <tr key={letter} ref={el => alphabetRefs.current[letter] = el}>
                  <td colSpan={5} style={{
                    padding: '8px 12px', background: '#edf2f7',
                    fontWeight: 'bold', fontSize: '13px', color: '#4a5568',
                    borderBottom: '1px solid #e2e8f0'
                  }}>{letter}</td>
                </tr>
                {groups[letter].map(r => {
                  const lotList = r.reagent_lots || []
                  const isLow = lotList.some(l => l.sealed_count === 0 && l.current_stock <= 20)
                  return (
                    <tr key={r.id}
                      onClick={() => openReagent(r)}
                      style={{ background: isLow ? '#fff5f5' : 'white', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = isLow ? '#ffe4e4' : '#f7fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = isLow ? '#fff5f5' : 'white'}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', color: '#1e3a5f', fontSize: '14px', textAlign: 'left' }}>
                        {r.name}
                        {isLow && <span style={{ color: '#e53e3e', fontSize: '11px', marginLeft: '6px' }}>?†Ô∏èÎ∂ÄÏ°?/span>}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#666', fontSize: '13px', textAlign: 'left' }}>{r.company || '-'}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#666', fontSize: '13px', textAlign: 'left' }}>{r.volume}{r.unit}</td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', textAlign: 'left' }}>{lotList.length}Í∞?/td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px', textAlign: 'left' }}>
                        {isLow
                          ? <span style={{ color: '#e53e3e', fontWeight: 'bold' }}>?†Ô∏è Î∂ÄÏ°?/span>
                          : <span style={{ color: '#48bb78' }}>???ïÏÉÅ</span>}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ color: '#1e3a5f', margin: 0 }}>?úÏïΩ Î™©Î°ù</h1>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchResults([]) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="?úÏïΩ Í≤Ä??.."
            style={{ width: '180px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e0', fontSize: '13px' }}
          />
          <button onClick={handleSearch} style={{
            background: '#1e3a5f', color: 'white', border: 'none',
            padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
          }}>Í≤Ä??/button>
        </div>
      </div>

      {searchResults.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ color: '#1e3a5f', margin: 0 }}>Í≤Ä??Í≤∞Í≥º ({searchResults.length}Í∞?</h2>
            <button onClick={() => { setSearchResults([]); setSearch('') }}
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontSize: '13px' }}>
              ?´Í∏∞
            </button>
          </div>
          <ReagentTable data={searchResults} />
        </div>
      )}

      {searchResults.length === 0 && (
        <div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {rooms.map(room => (
              <div key={room} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', minWidth: '120px' }}>
                <div onClick={() => toggleRoom(room)} style={{
                  padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
                  background: openRooms[room] ? '#1e3a5f' : '#f7fafc',
                  color: openRooms[room] ? 'white' : '#2d3748',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px'
                }}>
                  <span>{room}</span>
                  <span style={{ fontSize: '11px' }}>{openRooms[room] ? '?? : '??}</span>
                </div>
                {openRooms[room] && (
                  <div style={{ background: 'white' }}>
                    {locations.filter(l => l.room === room).map(loc => (
                      <div key={loc.id}
                        onClick={() => { setSelectedLocation(loc); fetchReagentsByLocation(loc.id) }}
                        style={{
                          padding: '7px 16px', cursor: 'pointer', fontSize: '13px',
                          borderTop: '1px solid #f0f0f0',
                          background: selectedLocation?.id === loc.id ? '#ebf8ff' : 'white',
                          color: selectedLocation?.id === loc.id ? '#1e3a5f' : '#4a5568',
                          fontWeight: selectedLocation?.id === loc.id ? 'bold' : 'normal',
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
            <div>
              <h3 style={{ color: '#1e3a5f', marginBottom: '12px' }}>
                {selectedLocation.room}{selectedLocation.detail ? ' - ' + selectedLocation.detail : ''}
                <span style={{ color: '#999', fontWeight: 'normal', fontSize: '14px', marginLeft: '8px' }}>({reagents.length}Í∞?</span>
              </h3>
              {reagents.length === 0
                ? <p style={{ color: '#999' }}>???ÑÏπò???úÏïΩ???ÜÏäµ?àÎã§.</p>
                : <ReagentTable data={reagents} />}
            </div>
          ) : (
            <p style={{ color: '#999', marginTop: '40px' }}>?ÑÏóê???ÑÏπòÎ•??†ÌÉù?òÏÑ∏??/p>
          )}
        </div>
      )}

      {/* ?úÏïΩ ?ÅÏÑ∏ ?ùÏóÖ */}
      {selectedReagent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setSelectedReagent(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            width: '600px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e3a5f' }}>{selectedReagent.name}</h2>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                  {selectedReagent.locations?.room}{selectedReagent.locations?.detail && ' - ' + selectedReagent.locations.detail}
                </p>
              </div>
              <button onClick={() => setSelectedReagent(null)} style={{
                background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999'
              }}>??/button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <tbody>
                {[
                  ['CAS No.', selectedReagent.cas_no],
                  ['?åÏÇ¨', selectedReagent.company],
                  ['?†Î≥Ñ/?±Ïßà', selectedReagent.category],
                  ['?©Îüâ', selectedReagent.volume + ' ' + selectedReagent.unit],
                  ['?†Ìï¥¬∑?ÑÌóò??, selectedReagent.hazard],
                  ['ÎπÑÍ≥†', selectedReagent.notes],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: '10px 16px', background: '#f7fafc', fontWeight: 'bold', fontSize: '13px', color: '#4a5568', width: '35%', borderBottom: '1px solid #e2e8f0' }}>{label}</td>
                    <td style={{ padding: '10px 16px', fontSize: '14px', borderBottom: '1px solid #e2e8f0' }}>{value || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ color: '#1e3a5f', marginBottom: '12px' }}>?¨Í≥† ?ÑÌô© (LotÎ≥?</h3>
            {lots.map(lot => (
              <div key={lot.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                      Lot No. <strong>{lot.lot_no || '-'}</strong> | ?†ÌÜµÍ∏∞Ìïú: {lot.expiry_date || '-'}
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <span style={{ fontSize: '14px' }}>ÎØ∏Í∞úÎ¥?<strong>{lot.sealed_count}Î≥?/strong></span>
                      <span style={{ fontSize: '14px' }}>?îÎüâ <strong>{lot.current_stock}%</strong></span>
                      {lot.sealed_count === 0 && lot.current_stock <= 20 && (
                        <span style={{ color: '#e53e3e', fontWeight: 'bold', fontSize: '13px' }}>?†Ô∏è ?¨Í≥† Î∂ÄÏ°?/span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => { setEditingLot(lot); setEditValue(''); setEditType('') }} style={{
                    background: '#e2e8f0', border: 'none', borderRadius: '4px',
                    padding: '6px 12px', cursor: 'pointer', fontSize: '12px'
                  }}>?òÏ†ï</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ?¨Í≥† ?òÏ†ï ?ùÏóÖ */}
      {editingLot && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setEditingLot(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            width: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0, color: '#1e3a5f' }}>?¨Í≥† ?òÏ†ï</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>?¥Î¶Ñ (?ÑÏàò)</label>
              <input value={userName} onChange={e => setUserName(e.target.value)}
                placeholder="Î≥∏Ïù∏ ?¥Î¶Ñ"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#666' }}>?òÏ†ï ??™©</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditType('sealed')} style={{
                  flex: 1, padding: '8px', borderRadius: '4px', cursor: 'pointer', border: 'none',
                  background: editType === 'sealed' ? '#1e3a5f' : '#e2e8f0',
                  color: editType === 'sealed' ? 'white' : '#4a5568'
                }}>ÎØ∏Í∞úÎ¥?Î≥???/button>
                <button onClick={() => setEditType('stock')} style={{
                  flex: 1, padding: '8px', borderRadius: '4px', cursor: 'pointer', border: 'none',
                  background: editType === 'stock' ? '#1e3a5f' : '#e2e8f0',
                  color: editType === 'stock' ? 'white' : '#4a5568'
                }}>?îÎüâ (%)</button>
              </div>
            </div>
            {editType === 'sealed' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>ÎØ∏Í∞úÎ¥?Î≥???/label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button onClick={() => setEditValue(v => Math.max(0, Number(v === '' ? editingLot.sealed_count : v) - 1))}
                    style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #cbd5e0', cursor: 'pointer', fontSize: '18px', background: 'white' }}>-</button>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', minWidth: '32px', textAlign: 'center' }}>
                    {editValue === '' ? editingLot.sealed_count : editValue}
                  </span>
                  <button onClick={() => setEditValue(v => Number(v === '' ? editingLot.sealed_count : v) + 1)}
                    style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #cbd5e0', cursor: 'pointer', fontSize: '18px', background: 'white' }}>+</button>
                </div>
              </div>
            )}
            {editType === 'stock' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                  ?îÎüâ: {editValue === '' ? editingLot.current_stock : editValue}%
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                    <button key={v} onClick={() => setEditValue(v)} style={{
                      padding: '6px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px',
                      background: (editValue === '' ? editingLot.current_stock : editValue) === v ? '#1e3a5f' : '#e2e8f0',
                      color: (editValue === '' ? editingLot.current_stock : editValue) === v ? 'white' : '#4a5568',
                    }}>{v}%</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setEditingLot(null)} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e0', background: 'white', cursor: 'pointer'
              }}>Ï∑®ÏÜå</button>
              <button onClick={() => {
                if (!editType) { alert('?òÏ†ï ??™©???†ÌÉù?òÏÑ∏??); return }
                const field = editType === 'sealed' ? 'sealed_count' : 'current_stock'
                const value = editValue === '' ? editingLot[field] : Number(editValue)
                updateStock(editingLot, field, value)
              }} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: '#1e3a5f', color: 'white', cursor: 'pointer', fontWeight: 'bold'
              }}>?Ä??/button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReagentList
