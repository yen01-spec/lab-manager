import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function ReagentLocations() {
  const [locations, setLocations] = useState([])

  useEffect(() => {
    supabase.from('locations').select('*').order('room').then(({ data }) => {
      if (data) setLocations(data)
    })
  }, [])

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>📍 실험실·시약장 위치</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
        {rooms.map(room => (
          <div key={room} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#1e3a5f', color: 'white', padding: '12px 16px', fontWeight: 'bold' }}>{room}</div>
            {locations.filter(l => l.room === room).map(loc => (
              <div key={loc.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', fontSize: '14px', color: '#4a5568' }}>
                {loc.detail || '(상세 위치 없음)'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ReagentLocations