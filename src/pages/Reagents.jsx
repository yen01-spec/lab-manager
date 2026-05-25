import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

function Reagents() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [reagents, setReagents] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const navigate = useNavigate()

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
    if (data) setReagents(data)
  }

  async function handleSearch() {
    if (!search.trim()) return
    const { data } = await supabase
      .from('reagents')
      .select('*, reagent_lots(*), locations(*)')
      .ilike('name', `%${search}%`)
    if (data) setSearchResults(data)
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>시약 관리</h1>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setSearchResults([]) }}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="시약 이름 검색..."
          style={{
            flex: 1, padding: '10px 16px', borderRadius: '6px',
            border: '1px solid #cbd5e0', fontSize: '16px'
          }}
        />
        <button onClick={handleSearch} style={{
          background: '#1e3a5f', color: 'white', border: 'none',
          padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '16px'
        }}>검색</button>
      </div>

      {searchResults.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ color: '#1e3a5f' }}>검색 결과 ({searchResults.length}개)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {searchResults.map(r => (
              <ReagentCard key={r.id} reagent={r} onClick={() => navigate('/reagents/' + r.id)} />
            ))}
          </div>
        </div>
      )}

      {searchResults.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '24px' }}>
          <div>
            <h2 style={{ color: '#1e3a5f', marginBottom: '12px' }}>위치</h2>
            {rooms.map(room => (
              <div key={room} style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 'bold', color: '#4a5568', marginBottom: '4px' }}>{room}</div>
                {locations.filter(l => l.room === room).map(loc => (
                  <div
                    key={loc.id}
                    onClick={() => { setSelectedLocation(loc); fetchReagentsByLocation(loc.id) }}
                    style={{
                      padding: '6px 12px', cursor: 'pointer', borderRadius: '4px',
                      background: selectedLocation && selectedLocation.id === loc.id ? '#1e3a5f' : 'transparent',
                      color: selectedLocation && selectedLocation.id === loc.id ? 'white' : '#4a5568',
                      fontSize: '14px'
                    }}
                  >
                    {loc.detail ? loc.detail : loc.room}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div>
            {selectedLocation ? (
              <div>
                <h2 style={{ color: '#1e3a5f', marginBottom: '16px' }}>
                  {selectedLocation.room}{selectedLocation.detail ? ' - ' + selectedLocation.detail : ''}
                </h2>
                {reagents.length === 0 ? (
                  <p style={{ color: '#999' }}>이 위치에 시약이 없습니다.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {reagents.map(r => (
                      <ReagentCard key={r.id} reagent={r} onClick={() => navigate('/reagents/' + r.id)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#999', marginTop: '48px', textAlign: 'center' }}>
                왼쪽에서 위치를 선택하세요
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ReagentCard({ reagent, onClick }) {
  const lots = reagent.reagent_lots || []
  const totalSealed = lots.reduce((sum, l) => sum + l.sealed_count, 0)
  const isLow = lots.some(l => l.sealed_count === 0 && l.current_stock <= 20)

  return (
    <div onClick={onClick} style={{
      border: '1px solid ' + (isLow ? '#fc8181' : '#e2e8f0'),
      borderRadius: '8px', padding: '16px', cursor: 'pointer',
      background: isLow ? '#fff5f5' : 'white'
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '4px' }}>{reagent.name}</div>
      <div style={{ color: '#666', fontSize: '13px', marginBottom: '8px' }}>
        {reagent.company} | {reagent.volume}{reagent.unit}
      </div>
      <div style={{ fontSize: '13px' }}>
        미개봉 <strong>{totalSealed}병</strong>
        {isLow && <span style={{ color: '#e53e3e', marginLeft: '8px' }}>재고 부족</span>}
      </div>
    </div>
  )
}

export default Reagents
