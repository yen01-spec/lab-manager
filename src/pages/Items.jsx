import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function Items() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').ilike('room', '%303%').order('room')
    if (data) setLocations(data)
  }

  async function fetchItemsByLocation(locationId) {
    const { data } = await supabase
      .from('items')
      .select('*, item_lots(*)')
      .eq('location_id', locationId)
    if (data) setItems(data)
  }

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>?î¨ Î¨ºÌíà Í¥ÄÎ¶?/h1>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px' }}>
        {/* ?ÑÏπò Î™©Î°ù (303?∏Îßå) */}
        <div>
          <div style={{ fontWeight: 'bold', color: '#4a5568', fontSize: '13px', marginBottom: '8px', padding: '0 8px' }}>303??/div>
          {locations.map(loc => (
            <div key={loc.id} onClick={() => { setSelectedLocation(loc); fetchItemsByLocation(loc.id) }}
              style={{
                padding: '7px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px',
                background: selectedLocation?.id === loc.id ? '#1e3a5f' : 'transparent',
                color: selectedLocation?.id === loc.id ? 'white' : '#4a5568',
              }}>
              {loc.detail || loc.room}
            </div>
          ))}
        </div>

        {/* Î¨ºÌíà Î¶¨Ïä§??*/}
        <div>
          {selectedLocation ? (
            items.length === 0 ? (
              <p style={{ color: '#999' }}>???ÑÏπò??Î¨ºÌíà???ÜÏäµ?àÎã§.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    {['Î¨ºÌíàÎ™?, 'Ï¢ÖÎ•ò', 'ÎØ∏Í∞úÎ¥?Í∞?', '?îÎüâ(%)'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '13px', color: '#4a5568' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const lots = item.item_lots || []
                    const isLow = lots.some(l => l.sealed_count === 0 && l.current_stock <= 20)
                    return (
                      <tr key={item.id} style={{ background: isLow ? '#fff5f5' : 'white' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', fontSize: '14px' }}>
                          {item.name}
                          {isLow && <span style={{ color: '#e53e3e', fontSize: '11px', marginLeft: '6px' }}>?†Ô∏èÎ∂ÄÏ°?/span>}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#666', fontSize: '13px' }}>{item.category || '-'}</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                          {lots.reduce((sum, l) => sum + l.sealed_count, 0)}
                        </td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>
                          {lots[0]?.current_stock ?? '-'}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          ) : (
            <p style={{ color: '#999', marginTop: '48px', textAlign: 'center' }}>?ºÏ™Ω?êÏÑú ?ÑÏπòÎ•??†ÌÉù?òÏÑ∏??/p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Items
