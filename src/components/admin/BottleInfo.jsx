import { C } from '../../design'
import { bottleState, locationText, shortLotId } from '../../lib/bottleInfo'

// 요청 대상 "병 1개"를 식별할 수 있는 정보 — 시약명/제조사/Lot No./병 ID/현재 위치/개봉 여부/잔량.
export default function BottleInfo({ lotId, lot, fallbackLotNo, label }) {
  const st = bottleState(lot)
  const cell = (k, v) => (
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><span style={{ fontWeight: 600 }}>{k}:</span> {v}</div>
  )
  return (
    <div data-testid="bottle-info" style={{ background: C.bg, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: C.muted, marginBottom: 10 }}>
      {label && <div style={{ fontWeight: 700, color: C.navy, marginBottom: 4 }}>{label}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px 12px' }}>
        {cell('병 ID', shortLotId(lotId))}
        {cell('Lot No.', lot?.lot_no || fallbackLotNo || '-')}
        {lot?.reagents && cell('제조사', lot.reagents.company || '-')}
        {lot?.reagents?.volume ? cell('규격', `${lot.reagents.volume}${lot.reagents.unit || ''}`) : null}
        {lot && cell('현재 위치', locationText(lot.locations))}
        {st && cell('개봉 여부', st.text)}
      </div>
      {!lot && <div style={{ marginTop: 4 }}>병 상세를 불러오지 못했습니다.</div>}
    </div>
  )
}
