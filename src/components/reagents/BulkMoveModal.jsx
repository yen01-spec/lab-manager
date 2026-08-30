import { C, inputStyle } from '../../design'

// 다량 위치 이동 모달 — 편집모드에서 체크한 시약들의 활성 Lot을 한 번에 새 위치로 옮김.
// 실제 이동 로직(submitBulkMove)은 결과 목록/체크상태 등 페이지 상태를 많이 참조해서
// 부모(ReagentList)에 그대로 두고, 이 컴포넌트는 폼 UI만 담당한다.
export default function BulkMoveModal({
  checkedCount, locations, bulkMoveLocation, setBulkMoveLocation,
  bulkMovedBy, setBulkMovedBy, onClose, onSubmit,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(26,42,94,0.55)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px', padding: '28px',
        width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        <h3 style={{ margin: '0 0 4px', color: C.navy }}>📍 위치 이동</h3>
        <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{checkedCount}개 시약 선택됨</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이동할 위치 *</label>
            <select value={bulkMoveLocation} onChange={e => setBulkMoveLocation(e.target.value)} style={inputStyle}>
              <option value="">선택하세요</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이동자 이름 *</label>
            <input value={bulkMovedBy} onChange={e => setBulkMovedBy(e.target.value)} placeholder="본인 이름" style={inputStyle} />
          </div>
        </div>
        {bulkMoveLocation && (
          <div style={{ marginTop: '14px', padding: '10px 14px', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
            <strong style={{ color: '#276749' }}>이동 미리보기:</strong>
            <div style={{ marginTop: '4px', color: '#2D6A4F' }}>
              {checkedCount}개 시약 → {(() => { const l = locations.find(l => l.id === bulkMoveLocation); return l ? `${l.room}${l.detail ? ' - ' + l.detail : ''}` : '' })()}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: '6px',
            border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px',
          }}>취소</button>
          <button onClick={onSubmit} style={{
            flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
            background: '#667EEA', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
          }}>이동하기</button>
        </div>
      </div>
    </div>
  )
}
