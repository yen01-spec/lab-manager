import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { C, PageBanner, Card } from './design'

export default function ReagentLocations() {
  const [locations, setLocations] = useState([])

  useEffect(() => {
    supabase.from('locations').select('*').order('room').then(({ data }) => {
      if (data) setLocations(data)
    })
  }, [])

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <PageBanner
        title="시약장 위치"
        sub="Storage Location"
        breadcrumb={['홈', '시약 관리', '시약장 위치']}
      />
      <div style={{ padding: '28px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {rooms.map(room => {
            const locs = locations.filter(l => l.room === room)
            return (
              <div key={room} style={{
                background: '#fff', border: `1px solid ${C.border}`,
                borderRadius: '10px', overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(26,42,94,0.06)',
              }}>
                {/* 룸 헤더 */}
                <div style={{
                  background: C.navy, padding: '12px 18px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <div style={{
                    width: '28px', height: '28px', background: C.gold,
                    borderRadius: '6px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '14px',
                  }}>📍</div>
                  <div>
                    <div style={{ color: C.white, fontWeight: '700', fontSize: '14px' }}>{room}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{locs.length}개 구역</div>
                  </div>
                </div>
                {/* 구역 목록 */}
                {locs.map((loc, i) => (
                  <div key={loc.id} style={{
                    padding: '11px 18px',
                    borderBottom: i < locs.length - 1 ? `1px solid ${C.border}` : 'none',
                    fontSize: '13px', color: C.text,
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ color: C.gold, fontSize: '10px' }}>◆</span>
                    {loc.detail || '(상세 위치 없음)'}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
