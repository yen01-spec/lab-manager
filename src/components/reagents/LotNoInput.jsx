import { C, inputStyle, labelStyle } from '../../design'
import { NO_LOT_REASONS, internalLotPrefix } from '../../lib/lotNo'

// 제조사 Lot No. 입력칸 + "표기 없음 / 확인 불가" 선택.
// value: { lotNo: string, noLotReason: '' | 'unmarked' | 'unknown' }
// 체크박스를 켜면 입력칸이 비활성화되고, 저장 시 내부 관리번호(KNU-날짜-순번)가 자동 부여된다.
export default function LotNoInput({ value, onChange, label = '제조사 Lot No.', compact = false }) {
  const { lotNo = '', noLotReason = '' } = value || {}
  const toggleReason = (key) => onChange({ lotNo: '', noLotReason: noLotReason === key ? '' : key })

  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <input
        value={noLotReason ? '' : lotNo}
        disabled={!!noLotReason}
        onChange={e => onChange({ lotNo: e.target.value, noLotReason: '' })}
        placeholder={noLotReason ? '저장 시 자동 부여 (KNU-날짜-순번)' : '제품 라벨의 Lot / Batch 번호'}
        style={{ ...inputStyle, background: noLotReason ? '#F0F2F6' : undefined, color: noLotReason ? C.muted : undefined }}
      />
      <div style={{ display: 'flex', gap: '14px', marginTop: '6px', flexWrap: 'wrap' }}>
        {NO_LOT_REASONS.map(r => (
          <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: compact ? '11.5px' : '12px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={noLotReason === r.key} onChange={() => toggleReason(r.key)} />
            {r.label}
          </label>
        ))}
      </div>
      {noLotReason && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: C.muted }}>
          저장하면 내부 관리번호 <b>{internalLotPrefix()}###</b> 이(가) 자동으로 부여됩니다.
        </div>
      )}
    </div>
  )
}
