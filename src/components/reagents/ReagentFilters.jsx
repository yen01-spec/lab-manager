import { useEffect, useRef, useState } from 'react'
import { C } from '../../design'

const COL_ITEMS = [
  ['casNo', 'CAS'], ['company', '제조사'], ['volume', '규격'], ['stock', '재고'],
  ['location', '위치'], ['lastConfirmed', '최근확인'],
]
const COL_ITEMS_EXTRA = [
  ['lot', 'Lot No.'], ['expiry', '유효기간'], ['category', '성상'], ['ghs', 'GHS'], ['status', '상태'],
]

// 위치 필터(방 탭 + 세부위치 알약) + 표시 열 선택 버튼(누르면 체크 목록이 드롭다운으로 열림).
export default function ReagentFilters({
  rooms, roomFilter, setRoomFilter, detailFilter, setDetailFilter, locations,
  visibleCols, setVisibleCols, onResetFilters,
}) {
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const visibleCount = Object.values(visibleCols).filter(Boolean).length

  return (
    <>
      {/* 위치 필터: 방(room) 밑줄 탭 + 세부위치가 있는 방이면 알약 버튼으로 한 단계 더 좁힘 */}
      <div style={{
        background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
        padding: '0 16px', boxShadow: '0 1px 3px rgba(16,24,40,.06)', marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
          {['', ...rooms].map(room => (
            <button key={room || '전체'} onClick={() => { setRoomFilter(room); setDetailFilter('') }} style={{
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: '13px', fontFamily: 'inherit', fontWeight: roomFilter === room ? 700 : 500,
              color: roomFilter === room ? C.blueDark : C.muted,
              borderBottom: roomFilter === room ? `2px solid ${C.blue}` : '2px solid transparent',
              marginBottom: '-1px', whiteSpace: 'nowrap',
            }}>{room || '전체'}</button>
          ))}
        </div>
        {roomFilter && locations.some(l => l.room === roomFilter && l.detail) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px 0' }}>
            <button onClick={() => setDetailFilter('')} style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              border: `1px solid ${!detailFilter ? C.navy : C.border}`,
              background: !detailFilter ? C.navy : C.white,
              color: !detailFilter ? '#fff' : C.text, fontWeight: !detailFilter ? '700' : '400',
            }}>전체 {roomFilter}</button>
            {locations.filter(l => l.room === roomFilter && l.detail).map(loc => (
              <button key={loc.id} onClick={() => setDetailFilter(loc.id)} style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                border: `1px solid ${detailFilter === loc.id ? C.navy : C.border}`,
                background: detailFilter === loc.id ? C.navy : C.white,
                color: detailFilter === loc.id ? '#fff' : C.text, fontWeight: detailFilter === loc.id ? '700' : '400',
              }}>{loc.detail}</button>
            ))}
          </div>
        )}
      </div>

      {/* 표시 열 선택 — 기본은 "시약명·순도(고정)"만 보이고, 버튼을 눌러야 나머지 체크 목록이 열림 */}
      <div ref={colMenuRef} style={{ position: 'relative', marginBottom: '12px' }}>
        <button onClick={() => setColMenuOpen(v => !v)} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: colMenuOpen ? C.bg : C.white, border: `1px solid ${C.border}`,
          borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
          fontSize: '12.5px', color: C.text, fontWeight: '600',
        }}>
          ⚙️ 표시 항목 <span style={{ color: C.muted, fontWeight: '400' }}>({visibleCount}개 표시 중)</span>
          <span style={{ fontSize: '10px', color: C.muted }}>{colMenuOpen ? '▲' : '▼'}</span>
        </button>
        {colMenuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
            background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '12px 14px', minWidth: '260px',
          }}>
            <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>시약명·순도는 항상 고정으로 표시돼요</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              {COL_ITEMS.map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: C.text, cursor: 'pointer', minWidth: '80px' }}>
                  <input type="checkbox" checked={visibleCols[key]} onChange={() => setVisibleCols(v => ({ ...v, [key]: !v[key] }))} />{label}
                </label>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
              {COL_ITEMS_EXTRA.map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: C.text, cursor: 'pointer', minWidth: '80px' }}>
                  <input type="checkbox" checked={visibleCols[key]} onChange={() => setVisibleCols(v => ({ ...v, [key]: !v[key] }))} />{label}
                </label>
              ))}
            </div>
            <button onClick={onResetFilters} style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px',
              padding: '4px 10px', cursor: 'pointer', fontSize: '11.5px', color: C.muted, width: '100%',
            }}>필터 초기화</button>
          </div>
        )}
      </div>
    </>
  )
}
