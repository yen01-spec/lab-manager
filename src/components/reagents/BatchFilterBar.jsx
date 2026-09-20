import { forwardRef, useId } from 'react'
import { C } from '../../design'

// 일괄검색 필터가 적용 중임을 보여주는 줄(칩 + 요약 + 미확인 입력 보기). 시약목록 위에 붙는다.
//  · 칩의 × = 일괄검색만 해제(다른 필터는 그대로).
//  · "미확인" = 공통 검색 규칙으로 어떤 시약도 찾지 못한 입력 — 연구실에 없다는 뜻이 아니다.
//  · 별도의 결과 표는 만들지 않는다: 일치한 시약은 아래 시약목록에 그대로 나온다.
const btn = { background: C.white, color: C.text, border: `1px solid ${C.border}`, padding: '6px 12px', minHeight: 36, borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }

const BatchFilterBar = forwardRef(function BatchFilterBar({ batch, shownLots, unmatchedOpen, onToggleUnmatched, onEdit, onClear, onDownloadMsds, canDownloadMsds, zippingMsds }, ref) {
  const panelId = useId()
  const unmatched = batch.unmatched
  return (
    <section ref={ref} tabIndex={-1} aria-label="일괄검색 적용 상태" data-testid="batch-bar" style={{
      background: '#F4F8FF', border: '1px solid #C9DAF5', borderRadius: '12px', padding: '10px 14px', marginBottom: '12px', outline: 'none', scrollMarginTop: 72,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.blue, color: '#fff', borderRadius: 999, padding: '3px 4px 3px 12px', fontSize: 12.5, fontWeight: 700 }}>
          일괄검색 · {batch.terms.length.toLocaleString()}개 입력
          <button onClick={onClear} aria-label="일괄검색 해제" title="일괄검색 해제"
            style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: 'rgba(255,255,255,.25)', color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </span>
        <span role="status" data-testid="batch-summary" style={{ fontSize: 13, color: C.text }}>
          입력 <b>{batch.terms.length.toLocaleString()}개</b> · 일치 시약 <b>{batch.matchedIds.length.toLocaleString()}개</b> · <b>{shownLots === null ? '…' : shownLots.toLocaleString()} Lot</b> 표시 · 미확인 <b>{unmatched.length.toLocaleString()}개</b>
        </span>
        <span style={{ flex: 1 }} />
        {unmatched.length > 0 && (
          <button onClick={onToggleUnmatched} aria-expanded={unmatchedOpen} aria-controls={panelId} style={btn}>
            {unmatchedOpen ? `미확인 ${unmatched.length}개 접기` : `미확인 ${unmatched.length}개 보기`}
          </button>
        )}
        <button onClick={onEdit} style={btn}>입력 수정</button>
        {canDownloadMsds && <button onClick={onDownloadMsds} disabled={zippingMsds} style={{ ...btn, opacity: zippingMsds ? 0.6 : 1 }}>{zippingMsds ? '압축 중...' : '📦 MSDS 일괄 다운로드'}</button>}
      </div>
      {batch.truncated > 0 && <div style={{ marginTop: 6, fontSize: 12, color: '#C13B3F' }}>입력이 많아 앞의 1,000줄만 처리했습니다(초과 {batch.truncated}줄 제외).</div>}
      {unmatchedOpen && unmatched.length > 0 && (
        <div id={panelId} data-testid="unmatched-panel" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #C9DAF5' }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>일치하는 시약을 찾지 못한 입력 — 이름/CAS 검색으로 찾지 못했다는 뜻입니다.</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unmatched.map(t => <li key={t} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '3px 10px', fontSize: 12.5, overflowWrap: 'anywhere', maxWidth: '100%' }}>{t}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
})

export default BatchFilterBar
