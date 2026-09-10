import { C, inputStyle } from '../../design'

// 다량 폐기처리 모달 — 시약 일괄정리에서 체크한 시약들의 활성 Lot을 한 번에 폐기 처리.
// 관리자 전용 화면에서만 쓰여서(즉시 반영, 승인 대기 없음) BulkMoveModal과 같은 패턴.
export default function BulkDisposalModal({
  checkedCount, reason, setReason, disposedBy, setDisposedBy, onClose, onSubmit,
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
        <h3 style={{ margin: '0 0 4px', color: C.danger }}>🗑️ 폐기처리</h3>
        <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{checkedCount}개 시약(보유중인 Lot 전체) 폐기 처리됩니다</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>폐기 사유 *</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 유효기간 만료, 변질" style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>처리자 이름 *</label>
            <input value={disposedBy} onChange={e => setDisposedBy(e.target.value)} placeholder="본인 이름" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginTop: '14px', padding: '10px 14px', background: '#FDECEC', border: '1px solid #F3D6D6', borderRadius: '8px', fontSize: '12.5px', color: '#C13B3F' }}>
          ⚠️ 되돌릴 수 없어요. 선택한 시약의 모든 보유 Lot이 폐기 처리되고 재고가 0으로 바뀝니다.
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px', borderRadius: '6px',
            border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px',
          }}>취소</button>
          <button onClick={onSubmit} style={{
            flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
            background: C.danger, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
          }}>폐기 처리</button>
        </div>
      </div>
    </div>
  )
}
