import { useEffect, useMemo, useRef, useState } from 'react'
import { C, inputStyle, btnPrimary } from '../../design'
import { BATCH_MAX_LINES, parseBatchLines } from '../../lib/reagentSearch'

// 시약 일괄검색 입력 모달 — 결과 표는 없다. 여러 줄을 붙여넣고 [조회]하면 모달이 닫히고
// 시약목록 화면 자체에 "일괄검색 필터"로 적용된다(ReagentList + useBatchFilter).
//  · onApply(text) → Promise<{ ok, reason }>. 성공하면 부모가 모달을 닫는다. 빈 입력/인덱스 로드 실패는 이 안에서 안내.
//  · 접근성: role=dialog + aria-modal, 열릴 때 textarea 포커스, Esc 로 닫기, Tab 은 모달 안에서만 순환, 닫히면 열었던 버튼으로 포커스 복귀(부모가 apply 성공 시엔 요약 영역으로 옮긴다).
export default function BulkLookupModal({ initialText = '', onApply, onClose }) {
  const [text, setText] = useState(initialText)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef(null)
  const areaRef = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    areaRef.current?.focus()
    return () => { if (opener && document.contains(opener) && opener !== document.body) opener.focus?.() }
  }, [])

  const parsed = useMemo(() => parseBatchLines(text), [text])

  async function run() {
    if (busy) return
    if (parsed.terms.length === 0) { setError('검색할 시약명을 한 줄에 하나씩 입력해주세요.'); areaRef.current?.focus(); return }
    setBusy(true); setError('')
    const r = await onApply(text)
    if (!r.ok) {
      setBusy(false)
      setError(r.reason === 'load' ? '시약 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' : '검색할 시약명을 한 줄에 하나씩 입력해주세요.')
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key === 'Tab') {
      const f = [...dialogRef.current.querySelectorAll('textarea, button:not([disabled])')]
      if (f.length === 0) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="batch-lookup-title" onKeyDown={onKeyDown} onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px', padding: '22px 20px', boxSizing: 'border-box',
        width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        <h3 id="batch-lookup-title" style={{ margin: '0 0 4px', color: C.navy }}>📋 시약 일괄 검색</h3>
        <p style={{ margin: '0 0 12px', color: C.muted, fontSize: '12.5px', lineHeight: 1.6 }}>
          시약명(국문·영문)이나 CAS No.를 한 줄에 하나씩 붙여넣고 [조회]를 누르면, 해당하는 시약만 시약목록에 걸러서 보여줍니다.
        </p>
        <textarea ref={areaRef} value={text} onChange={e => { setText(e.target.value); setError('') }}
          aria-label="검색할 시약명 목록 (한 줄에 하나)" aria-invalid={!!error} aria-describedby="batch-lookup-count"
          placeholder={'예)\nAcetone\n아세트산\n64-19-7'} rows={8}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: '16px', minHeight: 140 }} />
        <div id="batch-lookup-count" style={{ marginTop: 6, fontSize: 12, color: C.muted }}>
          입력 {parsed.terms.length.toLocaleString()}줄{parsed.duplicates > 0 ? ` · 중복 ${parsed.duplicates}줄 제외` : ''}
          {parsed.truncated > 0 ? <span style={{ color: '#C13B3F' }}> · 최대 {BATCH_MAX_LINES.toLocaleString()}줄까지 처리 — 초과 {parsed.truncated}줄은 제외됩니다</span> : null}
        </div>
        {error && <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: '#C13B3F' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}`, padding: '9px 18px', minHeight: 44 }}>닫기</button>
          <button onClick={run} disabled={busy} style={{ ...btnPrimary, padding: '9px 22px', minHeight: 44, opacity: busy ? 0.6 : 1 }}>{busy ? '조회 중...' : '조회'}</button>
        </div>
      </div>
    </div>
  )
}
