import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'
import { fetchAllPages } from '../lib/fetchAllPages'

export default function ReagentLocations() {
  const navigate = useNavigate()
  const [locations, setLocations] = useState([])
  const [lotsByLocation, setLotsByLocation] = useState(new Map())
  const [expandedIds, setExpandedIds] = useState(new Set())

  useEffect(() => {
    supabase.from('locations').select('*').order('room').then(({ data }) => {
      if (data) setLocations(data)
    })
    // 위치별로 실제 보유중인(active) Lot이 어떤 시약인지 모아서 보여줌
    // (활성 Lot이 1000개를 훌쩍 넘기 때문에 fetchAllPages로 전체를 끝까지 모아와야 함 — PostgREST 기본 1000행 제한)
    fetchAllPages((from, to) => supabase.from('reagent_lots')
      .select('id, location_id, sealed_count, current_stock, reagents(id, name)')
      .eq('status', 'active').range(from, to)).then(data => {
        const map = new Map()
        ;(data || []).forEach(lot => {
          if (!lot.location_id) return
          const list = map.get(lot.location_id) || []
          list.push(lot)
          map.set(lot.location_id, list)
        })
        setLotsByLocation(map)
      })
  }, [])

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <PageBanner
        title="시약장 위치"
        sub="Storage Location"
        breadcrumb={['홈', '시약 관리', '시약장 위치']}
      />
      <div style={{ padding: '28px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
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
                {locs.map((loc, i) => {
                  const lots = lotsByLocation.get(loc.id) || []
                  const isExpanded = expandedIds.has(loc.id)
                  return (
                    <div key={loc.id} style={{ borderBottom: i < locs.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <div onClick={() => lots.length > 0 && toggleExpand(loc.id)}
                        style={{
                          padding: '11px 18px', fontSize: '13px', color: C.text,
                          display: 'flex', alignItems: 'center', gap: '8px',
                          cursor: lots.length > 0 ? 'pointer' : 'default',
                        }}>
                        <span style={{ color: C.gold, fontSize: '10px' }}>◆</span>
                        <span style={{ flex: 1 }}>{loc.detail || '(상세 위치 없음)'}</span>
                        {lots.length > 0 && (
                          <span style={{ fontSize: '10.5px', color: C.muted, background: C.bg, padding: '2px 8px', borderRadius: '10px' }}>
                            {lots.length}병 {isExpanded ? '▾' : '▸'}
                          </span>
                        )}
                      </div>
                      {isExpanded && lots.length > 0 && (
                        <div style={{ padding: '0 18px 10px 34px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {lots.map(lot => (
                            <div key={lot.id} onClick={() => navigate(`/reagents/${lot.reagents?.id}`)}
                              style={{ fontSize: '12px', color: C.blue, cursor: 'pointer' }}>
                              {lot.reagents?.name || '(삭제된 시약)'} <span style={{ color: C.muted }}>· {lot.sealed_count}병/{lot.current_stock}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {locs.length === 0 && (
                  <div style={{ padding: '14px 18px', fontSize: '12.5px', color: C.muted }}>등록된 구역이 없습니다.</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
