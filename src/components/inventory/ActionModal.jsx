import { C, btnGhost, btnPrimary, inputStyle } from '../../design'
import { smallBtnStyle } from '../../lib/inventoryUtils'

const DISPOSAL_REASONS = ['변색', '침전', '용기손상', '유효기간 경과']

// "기타조치" 모달 — 데스크톱 표 하단과 모바일 입력 화면 둘 다에서 씀(같은 상태로 열림/닫힘).
// 폐기신청/위치 내 시약 미확인을 한 곳에서 고르게 함.
export default function ActionModal({
  actionModalLot, reportedMissing, disposalInfo, actionStep, setActionStep,
  disposalReasonInput, setDisposalReasonInput,
  onClose, onSubmitDisposal, onSelectMissing, onCancelMissing,
}) {
  if (!actionModalLot) return null
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '24px', width: '360px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '4px', color: C.navy, fontSize: '16px' }}>기타조치</h3>
        <p style={{ margin: '0 0 16px', fontSize: '12.5px', color: C.muted }}>{actionModalLot.reagents?.name}{actionModalLot.lot_no ? ` · Lot ${actionModalLot.lot_no}` : ''}</p>

        {reportedMissing ? (
          <div>
            <div style={{ padding: '10px 12px', background: '#FFF3E0', border: '1px solid #FFCC80', borderRadius: '8px', fontSize: '13px', color: '#92400E', marginBottom: '16px' }}>
              현재 "위치 내 시약 미확인"으로 표시돼 있어요.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onClose} style={{ ...btnGhost, flex: 1 }}>닫기</button>
              <button onClick={onCancelMissing} style={{ ...btnPrimary, flex: 1, background: '#E65100' }}>미확인 해제</button>
            </div>
          </div>
        ) : disposalInfo ? (
          <div>
            <div style={{ padding: '10px 12px', background: C.dangerTint, border: '1px solid #F3D6D6', borderRadius: '8px', fontSize: '13px', color: C.dangerDark, marginBottom: '16px' }}>
              이미 폐기신청됨 (사유: {disposalInfo.reason})<br />
              <span style={{ fontSize: '11px', color: C.muted }}>관리자 승인 대기 중 — 여기서 취소할 수 없어요.</span>
            </div>
            <button onClick={onClose} style={{ ...btnGhost, width: '100%' }}>닫기</button>
          </div>
        ) : actionStep === 'choose' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button onClick={() => setActionStep('disposal')} style={{ ...btnGhost, textAlign: 'left', padding: '12px 14px' }}>🗑️ 폐기신청</button>
            <button onClick={onSelectMissing} style={{ ...btnGhost, textAlign: 'left', padding: '12px 14px' }}>❓ 위치 내 시약 미확인</button>
            <button onClick={onClose} style={{ ...btnGhost, marginTop: '8px' }}>취소</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>폐기 사유를 고르거나 직접 입력하세요.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {DISPOSAL_REASONS.map(reason => (
                <button key={reason} onClick={() => setDisposalReasonInput(reason)} style={{
                  ...smallBtnStyle(disposalReasonInput === reason, C.dangerDark, C.dangerTint), whiteSpace: 'nowrap',
                }}>{reason}</button>
              ))}
            </div>
            <input value={disposalReasonInput} onChange={e => setDisposalReasonInput(e.target.value)}
              placeholder="사유 직접 입력도 가능해요" style={inputStyle} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setActionStep('choose')} style={{ ...btnGhost, flex: 1 }}>뒤로</button>
              <button onClick={onSubmitDisposal} disabled={!disposalReasonInput.trim()}
                style={{ ...btnPrimary, flex: 1, opacity: disposalReasonInput.trim() ? 1 : 0.5, cursor: disposalReasonInput.trim() ? 'pointer' : 'default' }}>신청</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
