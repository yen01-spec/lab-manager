import { C } from '../../design'

// 위치 필터(방 탭 + 세부위치 알약) + 표시 열 선택 체크박스 줄.
export default function ReagentFilters({
  rooms, roomFilter, setRoomFilter, detailFilter, setDetailFilter, locations,
  visibleCols, setVisibleCols, onResetFilters,
}) {
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

      {/* 표시 열 선택 (기본 열 + 선택 열) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '2px 4px 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11.5px', color: C.muted }}>시약명·순도(고정)</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.casNo} onChange={() => setVisibleCols(v => ({ ...v, casNo: !v.casNo }))} />CAS
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.company} onChange={() => setVisibleCols(v => ({ ...v, company: !v.company }))} />제조사
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.volume} onChange={() => setVisibleCols(v => ({ ...v, volume: !v.volume }))} />규격
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.stock} onChange={() => setVisibleCols(v => ({ ...v, stock: !v.stock }))} />재고
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.location} onChange={() => setVisibleCols(v => ({ ...v, location: !v.location }))} />위치
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.lastConfirmed} onChange={() => setVisibleCols(v => ({ ...v, lastConfirmed: !v.lastConfirmed }))} />최근확인
        </label>
        <div style={{ width: '1px', alignSelf: 'stretch', background: C.border }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.lot} onChange={() => setVisibleCols(v => ({ ...v, lot: !v.lot }))} />Lot No.
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.expiry} onChange={() => setVisibleCols(v => ({ ...v, expiry: !v.expiry }))} />유효기간
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.category} onChange={() => setVisibleCols(v => ({ ...v, category: !v.category }))} />성상
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.ghs} onChange={() => setVisibleCols(v => ({ ...v, ghs: !v.ghs }))} />GHS
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={visibleCols.status} onChange={() => setVisibleCols(v => ({ ...v, status: !v.status }))} />상태
        </label>
        <button onClick={onResetFilters} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px',
          padding: '4px 10px', cursor: 'pointer', fontSize: '11.5px', color: C.muted,
        }}>필터 초기화</button>
      </div>
    </>
  )
}
