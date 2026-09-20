import { C } from '../../design'

// 위치 필터: 방(room) 밑줄 탭 + 세부위치가 있는 방이면 알약 버튼으로 한 단계 더 좁힘.
// 시약목록(ReagentFilters)과 시약 일괄정리가 같은 컴포넌트를 쓴다. 선택 즉시 적용(별도 "적용" 버튼 없음).
export default function LocationFilter({ rooms, roomFilter, setRoomFilter, detailFilter, setDetailFilter, locations }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
      padding: '0 16px', boxShadow: '0 1px 3px rgba(16,24,40,.06)', marginBottom: '16px',
    }}>
      <div role="group" aria-label="실험실 필터" style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.border}`, overflowX: 'auto', overflowY: 'hidden' }}>
        {['', ...rooms].map(room => (
          <button key={room || '전체'} aria-pressed={roomFilter === room} onClick={() => { setRoomFilter(room); setDetailFilter('') }} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '13px', fontFamily: 'inherit', fontWeight: roomFilter === room ? 700 : 500,
            color: roomFilter === room ? C.blueDark : C.muted,
            borderBottom: roomFilter === room ? `2px solid ${C.blue}` : '2px solid transparent',
            marginBottom: '-1px', whiteSpace: 'nowrap', minHeight: '40px',
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
  )
}
