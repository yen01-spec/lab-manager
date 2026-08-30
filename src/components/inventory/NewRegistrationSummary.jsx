import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C } from '../../design'

// 관리자용 — 이번 실사에서 새로 등록된 시약 모아보기(1단계 완료 처리 전 검토용)
// 신규 등록된 시약이, 이번 실사에서 다른 위치에 "미확인" 처리된 시약과 이름이 같으면
// "혹시 그게 잘못 보관돼서 여기서 새로 등록된 거 아닐까?"를 관리자가 알아챌 수 있게 표시.
export default function NewRegistrationSummary({ session }) {
  const [rows, setRows] = useState([])
  const [missingByName, setMissingByName] = useState(new Map()) // 시약명 -> 원래 있어야 했던 위치명
  async function fetchRows() {
    const { data } = await supabase.from('inventory_counts')
      .select('*, reagents(name), reagent_lots(lot_no)')
      .eq('session_id', session.id).eq('is_new_registration', true)
      .order('counted_at', { ascending: false })
    setRows(data || [])
  }
  async function fetchMissing() {
    const [{ data: missing }, { data: locs }] = await Promise.all([
      supabase.from('inventory_counts').select('reagents(name), book_location_id')
        .eq('session_id', session.id).eq('reported_missing', true),
      supabase.from('locations').select('id, room, detail'),
    ])
    const locById = new Map((locs || []).map(l => [l.id, `${l.room}${l.detail ? ' · ' + l.detail : ''}`]))
    const map = new Map()
    ;(missing || []).forEach(m => {
      if (m.reagents?.name) map.set(m.reagents.name, locById.get(m.book_location_id) || '다른 위치')
    })
    setMissingByName(map)
  }
  useEffect(() => { fetchRows(); fetchMissing() }, [session.id])
  if (rows.length === 0) return null
  return (
    <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E', marginBottom: '6px' }}>🆕 이번 실사에서 새로 등록된 시약 ({rows.length}건)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {rows.map(r => {
          const originalLoc = missingByName.get(r.reagents?.name)
          return (
            <span key={r.id} title={originalLoc ? `같은 이름의 시약이 "${originalLoc}"에서 미확인(분실) 처리됨 — 잘못 보관돼서 여기서 새로 등록된 걸 수도 있어요` : undefined}
              style={{ fontSize: '12px', background: C.white, border: `1px solid ${originalLoc ? C.danger : '#F0DBAE'}`, borderRadius: '20px', padding: '3px 10px', color: originalLoc ? C.danger : '#92400E', fontWeight: originalLoc ? '700' : '400' }}>
              {r.reagents?.name} (Lot {r.reagent_lots?.lot_no || '번호없음'}){originalLoc && ` ⚠️ ${originalLoc}에서 미확인됨`}
            </span>
          )
        })}
      </div>
    </div>
  )
}
