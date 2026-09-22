import { C, inputStyle } from '../../design'
import CompanyPicker from '../CompanyPicker'
import { requestStatusLabel, DUPLICATE_PENDING_MESSAGE } from '../../lib/requestStatus'
import { MASTER_ROWS } from '../../lib/reagentMasterFields'

// 시약 기본정보(reagent 단위) 필드 그리드 — 영문 시약명(읽기전용) + MASTER_ROWS.
// ReagentDetail의 단일 편집과 MultiReagentEditQueue의 여러 시약 순차 편집이 같은 렌더링을 쓴다.
export default function ReagentMasterFieldsGrid({ reagent, isMobile, isEditing, draft, setDraftField, pendingChanges, isAdmin, idPrefix = 'master' }) {
  const cur = (k) => (reagent && reagent[k] != null ? String(reagent[k]) : '')
  const val = (k) => (draft[k] !== undefined ? draft[k] : cur(k))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px 20px' }}>
      <div>
        <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>영문 시약명{isEditing ? ' (변경 불가)' : ''}</div>
        <div style={{ fontSize: '13.5px', color: C.text, overflowWrap: 'anywhere' }}>{reagent.name}</div>
      </div>
      {MASTER_ROWS.map(row => {
        const keys = row.keys
        const pending = keys.map(k => (pendingChanges || []).find(p => p.field_name === k)).find(Boolean)
        const locked = !isAdmin && !!pending
        const sourceVal = row.source ? reagent[row.source] : null
        const viewValue = row.key === 'volume' ? (reagent.volume ? `${reagent.volume} ${reagent.unit || ''}` : '') : cur(row.key)
        const inputId = `${idPrefix}-${row.key}`
        return (
          <div key={row.key} style={{ background: pending ? '#FBF0DF' : 'transparent', borderRadius: '8px', padding: pending ? '8px 10px' : 0, margin: pending ? '-8px -10px' : 0 }}>
            {pending && (
              <div style={{ fontSize: '10.5px', color: '#8A5A16', marginBottom: '3px', fontWeight: '600' }}>
                {isAdmin ? `${pending.requested_by} · ${requestStatusLabel('change', 'pending', 'admin')}` : requestStatusLabel('change', 'pending')}
              </div>
            )}
            <label htmlFor={inputId} style={{ display: 'block', fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{row.label}</label>
            {isEditing ? (
              row.key === 'company' ? (
                <CompanyPicker value={val('company')} onChange={v => setDraftField('company', v)} disabled={locked} id={inputId}
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', background: locked ? C.bg : C.white }} />
              ) : row.key === 'volume' ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input id={inputId} type="number" min="0" step="any" inputMode="decimal" value={val('volume')} disabled={locked} placeholder="용량" aria-label="용량(숫자)"
                    onChange={e => setDraftField('volume', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', flex: 1, minWidth: 0 }} />
                  <input value={val('unit')} disabled={locked} placeholder="단위(mL, g …)" aria-label="단위"
                    onChange={e => setDraftField('unit', e.target.value)} style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', flex: 1, minWidth: 0 }} />
                </div>
              ) : (
                <input id={inputId} value={val(row.key)} disabled={locked} onChange={e => setDraftField(row.key, e.target.value)}
                  style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', background: locked ? C.bg : C.white }} />
              )
            ) : (
              <div style={{ fontSize: '13.5px', color: C.text, overflowWrap: 'anywhere' }}>
                {viewValue || '-'}
                {sourceVal === 'auto_ghs' && (
                  <span title="국가유해물질정보 자동조회로 채워졌어요" style={{ marginLeft: '6px', fontSize: '9.5px', color: C.muted, background: '#F3F4F6', padding: '1px 6px', borderRadius: '8px' }}>🔎 MSDS 자동조회</span>
                )}
                {pending && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#8A5A16' }}>→ {pending.new_value}</span>}
              </div>
            )}
            {isEditing && locked && <div style={{ fontSize: '11px', color: '#8A5A16', marginTop: 3 }}>{DUPLICATE_PENDING_MESSAGE.change}</div>}
          </div>
        )
      })}
    </div>
  )
}
