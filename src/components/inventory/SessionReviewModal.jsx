import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, btnGhost, thStyle, tdStyle } from '../../design'

// 실사 완료 후 관리자가 확인하는 신규등록 교차확인 화면 — "303-1에서 미확인 처리된 시약이
// 5층에서 신규등록됐다면, 사실 303-1 물건이 5층에 잘못 보관된 걸 수도 있다"를 판단하도록
// 도와줌. 진행 중인 실사 화면(라이브)이 아니라 완료된 회차를 나중에 검토하는 용도.
export default function SessionReviewModal({ session, onClose }) {
  const [rows, setRows] = useState(null) // null = 로딩중
  const [missingByName, setMissingByName] = useState(new Map())
  const [missingCount, setMissingCount] = useState(0)

  useEffect(() => {
    async function fetchData() {
      const [{ data: newRegs }, { data: missing }, { data: locs }] = await Promise.all([
        supabase.from('inventory_counts')
          .select('*, reagents(name), reagent_lots(lot_no, location_id)')
          .eq('session_id', session.id).eq('is_new_registration', true)
          .order('counted_at', { ascending: false }),
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
      setMissingCount((missing || []).length)
      setRows((newRegs || []).map(r => ({
        ...r,
        registeredLocationName: locById.get(r.reagent_lots?.location_id) || '-',
      })))
    }
    fetchData()
  }, [session.id])

  const matchedCount = rows ? rows.filter(r => missingByName.has(r.reagents?.name)).length : 0

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '760px', maxWidth: '95vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '4px', color: C.navy }}>🔍 {session.year}년 실사{session.label ? ` · ${session.label}` : ''} — 신규등록 교차확인</h3>
        <p style={{ margin: '0 0 16px', color: C.muted, fontSize: '12.5px' }}>
          이번 회차에 새로 등록된 시약 중, 다른 위치에서 미확인(분실) 처리된 시약과 이름이 같은
          항목을 표시합니다. 원래 있던 위치에 잘못 보관돼 있다가 다른 곳에서 새로 등록된 걸 수도 있어요.
        </p>
        {rows === null ? (
          <div style={{ padding: '30px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: C.muted }}>이번 실사에서 새로 등록된 시약이 없습니다.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12.5px', color: C.muted }}>
              <span>신규등록 <b style={{ color: C.navy }}>{rows.length}건</b></span>
              <span>매칭 의심 <b style={{ color: matchedCount > 0 ? C.danger : C.navy }}>{matchedCount}건</b></span>
              <span>미확인(분실) 처리 <b style={{ color: C.navy }}>{missingCount}건</b></span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명', 'Lot No.', '등록된 위치', '교차확인'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => {
                  const originalLoc = missingByName.get(r.reagents?.name)
                  return (
                    <tr key={r.id} style={{ background: originalLoc ? '#FDECEC' : 'transparent' }}>
                      <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.reagents?.name}</td>
                      <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.reagent_lots?.lot_no || '-'}</td>
                      <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.registeredLocationName}</td>
                      <td style={tdStyle}>
                        {originalLoc
                          ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12.5px' }}>⚠️ {originalLoc}에서 미확인됨</span>
                          : <span style={{ color: C.muted, fontSize: '12.5px' }}>-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ ...btnGhost, padding: '9px 18px' }}>닫기</button>
        </div>
      </div>
    </div>
  )
}
