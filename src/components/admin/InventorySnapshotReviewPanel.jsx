import { C } from '../../design'
import { locationLabel } from '../../lib/inventorySnapshotMatch'

// "확인 필요" 행을 하나씩 보여주고 관리자가 후보를 직접 고르게 하는 패널 (Phase 4b-2 §17/§18).
// 행마다 큰 modal을 띄우지 않고 카드 목록으로 나열 — 후보 선택은 바로 반영되고(review_confirmed),
// 실제 DB 반영은 여기서 하지 않는다(§17: "DB에는 아직 반영하지 않음").
function reagentLabel(r) {
  if (!r) return ''
  return [r.name, r.name_ko, r.company, r.volume ? `${r.volume}${r.unit || ''}` : null].filter(Boolean).join(' / ')
}
function lotCandidateLabel(l, idx) {
  const loc = idx.locationsById.get(l.location_id)
  return `Lot ${l.lot_no || '(번호없음)'} · ${locationLabel(loc) || '위치 미지정'} · 잔량 ${l.current_stock}% · 미개봉 ${l.sealed_count}병`
}

function RadioRow({ name, checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12.5, color: C.text, cursor: 'pointer' }}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      {children}
    </label>
  )
}

export default function InventorySnapshotReviewPanel({ rows, idx, onResolve }) {
  if (rows.length === 0) {
    return <div style={{ padding: '18px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>확인이 필요한 행이 없습니다.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(row => {
        const needReagent = row.reagentMatch.status === 'review' && !row.reagentMatch.reviewResolved
        const needLot = row.lotMatch.status === 'review' && !row.lotMatch.reviewResolved
        const needCompany = row.companyReview && !row.companyReview.resolved
        return (
          <div key={row.rowNo} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', background: '#FFFBEB' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 11, color: C.muted }}>엑셀 {row.rowNo}행</span>{' '}
                <b style={{ fontSize: 13.5, color: C.navy }}>{row.nameEn || row.nameKo}</b>
              </div>
              <span style={{ fontSize: 11.5, color: C.muted }}>
                {row.casNo || 'CAS 없음'} · {row.company || '제조사 없음'} · {row.volume ? `${row.volume}${row.unit || ''}` : '규격 없음'}
              </span>
            </div>

            {needReagent && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A5A16', marginBottom: 4 }}>
                  시약 매칭 확인 필요 {row.reagentMatch.reason === 'id_not_found' && '(__reagent_id가 DB에 없음 — 추천 후보만 표시)'}
                  {row.reagentMatch.reason === 'cas_multi' && '(같은 CAS를 가진 시약이 여러 개)'}
                  {row.reagentMatch.reason === 'name_multi' && '(같은 이름의 시약이 여러 개)'}
                </div>
                {(row.reagentMatch.candidates || []).map(c => (
                  <RadioRow key={c.id} name={`reagent-${row.rowNo}`} checked={false} onChange={() => onResolve(row.rowNo, { reagent: c.id })}>
                    {reagentLabel(c)}
                  </RadioRow>
                ))}
                <RadioRow name={`reagent-${row.rowNo}`} checked={false} onChange={() => onResolve(row.rowNo, { reagent: 'NEW' })}>
                  <span style={{ color: C.navy, fontWeight: 600 }}>신규 시약으로 처리</span>
                </RadioRow>
              </div>
            )}

            {!needReagent && needLot && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A5A16', marginBottom: 4 }}>
                  Lot(병) 매칭 확인 필요 {row.lotMatch.reason === 'lotno_multi' && '(같은 시약 + 같은 Lot No.의 병이 여러 개 — 위치/잔량만으로 자동 확정하지 않음)'}
                  {row.lotMatch.reason === 'id_not_found' && '(__lot_id가 DB에 없음)'}
                </div>
                {(row.lotMatch.candidates || []).map(l => (
                  <RadioRow key={l.id} name={`lot-${row.rowNo}`} checked={false} onChange={() => onResolve(row.rowNo, { lot: l.id })}>
                    {lotCandidateLabel(l, idx)}
                  </RadioRow>
                ))}
                <RadioRow name={`lot-${row.rowNo}`} checked={false} onChange={() => onResolve(row.rowNo, { lot: 'NEW' })}>
                  <span style={{ color: C.navy, fontWeight: 600 }}>신규 Lot(병)으로 처리</span>
                </RadioRow>
              </div>
            )}

            {!needReagent && needCompany && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A5A16', marginBottom: 4 }}>
                  제조사 불일치{row.companyReview.kind === 'fillable' && ' (기존 정보 없음)'}
                </div>
                <div style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
                  기존 DB: <b>{row.companyReview.dbCompany || '(없음)'}</b> · 엑셀: <b>{row.companyReview.excelCompany}</b>
                </div>
                {row.companyReview.kind === 'mismatch' ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => onResolve(row.rowNo, { company: 'keep' })} style={btn()}>A. 기존 시약 유지(엑셀 제조사 무시)</button>
                    <button onClick={() => onResolve(row.rowNo, { company: 'treat_as_new' })} style={btn()}>B. 신규 시약으로 처리</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => onResolve(row.rowNo, { company: 'fill' })} style={btn()}>C. 제조사 정보 보완 승인</button>
                    <button onClick={() => onResolve(row.rowNo, { company: 'keep' })} style={btn()}>비워두기(무시)</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function btn() {
  return {
    padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white,
    cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: C.text, fontWeight: 600,
  }
}
