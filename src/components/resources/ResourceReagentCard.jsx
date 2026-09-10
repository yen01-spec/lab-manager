import { C } from '../../design'
import { lotLabel } from '../../lib/lotNo'
import { getSpecialManagementInfo } from '../../lib/specialManagementSubstances'

// 여러 자료 섹션(특별관리물질·폐시약·사전유해인자)에서 같은 시약정보를 보여주는 공용 카드.
// section별로 필요한 필드만 fields / lotFields 로 전달한다.

const REAGENT_FIELDS = {
  nameKo: { label: '국문명', get: r => r.name_ko },
  casNo: { label: 'CAS No.', get: r => r.cas_no },
  company: { label: '제조사', get: r => r.company },
  catNo: { label: 'Cat.No.', get: r => r._catNo },
  volume: { label: '규격', get: r => (r.volume ? `${r.volume}${r.unit || ''}` : '') },
  purity: { label: '순도/등급', get: r => r.purity },
  hazard: { label: '유해·위험정보', get: r => r.hazard },
  lotCount: { label: '보유 Lot 수', get: r => `${(r._lots || []).length}개` },
}

const LOT_FIELDS = {
  lot: { label: 'Lot', get: lotLabel },
  location: { label: '보관 위치', get: (l) => l._locText || '-' },
  currentStock: { label: '현재 잔량', get: (l) => `${l.current_stock ?? 0}%` },
  sealedCount: { label: '미개봉', get: (l) => `${l.sealed_count ?? 0}병` },
  receivedDate: { label: '입고일', get: (l) => l.received_date || '-' },
  expiryDate: { label: '유효기간', get: (l) => l.expiry_date || '-' },
  disposalDate: { label: '폐기일', get: (l) => l.disposal_date || '-' },
}

export default function ResourceReagentCard({
  reagent, fields = ['casNo', 'company', 'volume'], lotFields = ['lot', 'location', 'currentStock'],
  checked, onToggleCheck, onOpenDetail,
}) {
  const r = reagent
  const lots = r._lots || []
  const special = getSpecialManagementInfo(r.name, r.cas_no)

  return (
    <div style={{ border: `1px solid ${checked ? C.navy : C.border}`, borderRadius: 10, padding: '12px 14px', background: checked ? '#EEF2FB' : C.white }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {onToggleCheck && (
          <input type="checkbox" checked={!!checked} onChange={() => onToggleCheck(r)} style={{ marginTop: 3, width: 16, height: 16, cursor: 'pointer' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{r.name}</span>
            {r.name_ko && <span style={{ fontSize: 12, color: C.muted }}>{r.name_ko}</span>}
            {special?.status === 'confirmed' && (
              <span style={{ fontSize: 10.5, fontWeight: 700, background: '#FFF3CD', color: '#8A5A16', padding: '2px 8px', borderRadius: 999 }}>🚨 특별관리물질</span>
            )}
            {special?.status === 'suspected' && (() => {
              const cond = (special.substance.threshold || '').match(/\(([^)]+)\)/)?.[1]
              return (
                <span title={`${special.reason}\n기준: ${special.substance.threshold}`}
                  style={{ fontSize: 10.5, fontWeight: 700, background: '#F3F4F6', color: '#586173', padding: '2px 8px', borderRadius: 999 }}>
                  ❓ 확인 필요{cond ? ` · ${cond}` : ''}
                </span>
              )
            })()}
          </div>

          {/* 시약(마스터) 레벨 필드 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 6, fontSize: 12, color: C.text }}>
            {fields.map(k => {
              const def = REAGENT_FIELDS[k]; if (!def) return null
              const v = def.get(r)
              return <span key={k}><span style={{ color: C.muted }}>{def.label}</span> {v || '-'}</span>
            })}
          </div>

          {/* Lot 레벨 */}
          {lotFields.length > 0 && lots.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lots.map(l => (
                <div key={l.id} style={{ fontSize: 11.5, color: C.muted, display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '4px 8px', background: C.bg, borderRadius: 6 }}>
                  {lotFields.map(k => {
                    const def = LOT_FIELDS[k]; if (!def) return null
                    return <span key={k}><span style={{ opacity: 0.7 }}>{def.label}</span> {def.get(l) || '-'}</span>
                  })}
                </div>
              ))}
            </div>
          )}

          {onOpenDetail && (
            <button onClick={() => onOpenDetail(r)} style={{ marginTop: 8, background: 'none', border: 'none', color: C.blue, fontSize: 11.5, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              시약 상세 페이지 열기 →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
