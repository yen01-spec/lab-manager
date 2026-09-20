import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C, inputStyle as baseInputStyle } from '../design'
import { useReagentAutocomplete } from '../hooks/useReagentAutocomplete'
import { highlightParts } from '../lib/reagentSearch'
import { computePlacement } from '../lib/popoverPlacement'

// 앱 전체 "시약 찾기/선택" 검색창의 정본(자동추천 combobox).
//  · 영문명/국문명/CAS 검색(lib/reagentSearch 규칙), 최대 10개 추천, 빈 입력에서는 추천 숨김.
//  · 추천 클릭/Enter(하이라이트) → onSelect(item), Enter(하이라이트 없음) → onEnter(즉시, debounce 대기 없음),
//    Esc → 닫기, ↑↓ 이동, Tab → 닫고 자연스럽게 다음 칸.
//  · 추천창은 body 로 포털 렌더 + viewport 충돌 감지(아래 공간 부족하면 위로, 좌우 화면 밖 방지) →
//    부모의 overflow(모달/표/스크롤 영역)에 잘리지 않는다.
//  · items 를 주면 그 목록 안에서만 추천한다(재고실사 등 범위가 제한된 화면 — 범위를 넓히지 않는다).
export function ReagentOptionBody({ item, term }) {
  const hl = (text) => highlightParts(text, term).map((p, i) => (p.hit
    ? <mark key={i} style={{ background: 'transparent', color: C.blue, fontWeight: 800 }}>{p.text}</mark>
    : <span key={i}>{p.text}</span>))
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontWeight: 600, color: C.navy, overflowWrap: 'anywhere' }}>{hl(item.name)}</div>
      {item.name_ko && <div style={{ fontSize: 12, color: C.text, overflowWrap: 'anywhere' }}>{hl(item.name_ko)}</div>}
      <div style={{ fontSize: 11.5, color: C.muted, overflowWrap: 'anywhere' }}>
        {item.matchedLocation ? `📍 ${item.matchedLocation}` : <>{item.cas_no ? hl(item.cas_no) : 'CAS 없음'}{item.company ? ` · ${item.company}` : ''}</>}
      </div>
    </div>
  )
}

export default function ReagentSearchInput({
  value, onChange, onSelect, onEnter, placeholder = '시약명(국문·영문) 또는 CAS No.로 검색...', ariaLabel,
  items, getFields, renderOption, showLocation = false, disabled = false, autoFocus = false,
  inputStyle, inputRef, className, id, emptyAction, limit, onFocus, onKeyDownExtra,
}) {
  const uid = useId()
  const listId = `${uid}-list`
  const localRef = useRef(null)
  useImperativeHandle(inputRef, () => localRef.current, [])   // 부모에서 focus()/blur() 할 수 있게 input 요소를 노출
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [place, setPlace] = useState(null)
  const { term, options, loading, error } = useReagentAutocomplete({ value, items, getFields, showLocation, limit })

  const activeIdx = active < options.length ? active : options.length - 1   // 목록이 줄어들면 마지막 항목으로 보정
  const showPanel = open && !!term
  const noResult = showPanel && !loading && !error && options.length === 0
  const expanded = showPanel && options.length > 0

  useLayoutEffect(() => {
    if (!showPanel) return
    const update = () => { if (localRef.current) setPlace(computePlacement(localRef.current.getBoundingClientRect())) }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [showPanel, options.length, noResult])

  useEffect(() => {
    if (activeIdx < 0) return
    document.getElementById(`${uid}-opt-${activeIdx}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIdx, uid])

  function pick(item) {
    setOpen(false); setActive(-1)
    onSelect?.(item)
  }

  function handleKeyDown(e) {
    onKeyDownExtra?.(e)
    if (e.defaultPrevented) return
    if (e.nativeEvent?.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return
      e.preventDefault()
      if (!showPanel) { setOpen(true); setActive(e.key === 'ArrowDown' ? 0 : options.length - 1); return }
      setActive(i => (e.key === 'ArrowDown' ? Math.min(i + 1, options.length - 1) : Math.max(i - 1, 0)))
      return
    }
    if (e.key === 'Escape') { if (showPanel) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1) } return }
    if (e.key === 'Tab') { setOpen(false); return }
    if (e.key === 'Enter') {
      if (expanded && activeIdx >= 0 && options[activeIdx]) { e.preventDefault(); pick(options[activeIdx]); return }
      e.preventDefault()
      setOpen(false)
      onEnter?.()
    }
  }

  const activeId = expanded && activeIdx >= 0 ? `${uid}-opt-${activeIdx}` : undefined
  const status = showPanel ? (loading ? '추천을 불러오는 중' : error ? '추천을 불러오지 못했습니다' : options.length ? `추천 ${options.length}개` : '일치하는 시약이 없습니다.') : ''

  const popover = showPanel && place && createPortal(
    <div
      onMouseDown={e => e.preventDefault()}
      data-testid="reagent-suggest-popover" tabIndex={0}
      style={{
        position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight,
        zIndex: 3000, background: C.white, border: `1px solid ${C.border}`, borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflowY: 'auto', overscrollBehavior: 'contain', fontSize: 13,
      }}>
      {options.length > 0 && (
        <div role="listbox" id={listId} aria-label="시약 추천">
          {options.map((item, i) => (
            <div key={item.id ?? i} id={`${uid}-opt-${i}`} role="option" aria-selected={i === activeIdx}
              onClick={() => pick(item)} onMouseEnter={() => setActive(i)}
              style={{ padding: '10px 14px', minHeight: 44, boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: i < options.length - 1 ? `1px solid ${C.border}` : 'none', background: i === activeIdx ? C.blueTint : C.white }}>
              {renderOption ? renderOption(item, { term, active: i === activeIdx }) : <ReagentOptionBody item={item} term={term} />}
            </div>
          ))}
        </div>
      )}
      {loading && options.length === 0 && <div style={{ padding: '12px 14px', color: C.muted }}>불러오는 중…</div>}
      {error && <div style={{ padding: '12px 14px', color: '#C13B3F' }}>추천을 불러오지 못했습니다. Enter 로 검색할 수 있어요.</div>}
      {noResult && (emptyAction
        ? <div role="button" tabIndex={-1} onClick={() => { setOpen(false); emptyAction.onClick() }} style={{ padding: '12px 14px', minHeight: 44, boxSizing: 'border-box', cursor: 'pointer', color: '#92400E' }}>{emptyAction.label}</div>
        : <div style={{ padding: '12px 14px', color: C.muted }}>일치하는 시약이 없습니다.</div>)}
    </div>,
    document.body,
  )

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        ref={localRef} id={id} type="text" role="combobox" autoComplete="off" spellCheck={false} className={className}
        aria-label={ariaLabel || placeholder} aria-autocomplete="list" aria-expanded={expanded} aria-haspopup="listbox"
        aria-controls={expanded ? listId : undefined} aria-activedescendant={activeId}
        value={value} disabled={disabled} autoFocus={autoFocus} placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setActive(-1); setOpen(true) }}
        onFocus={e => { setOpen(true); onFocus?.(e) }}
        onBlur={() => { setOpen(false); setActive(-1) }}
        onKeyDown={handleKeyDown}
        style={{ ...baseInputStyle, width: '100%', boxSizing: 'border-box', ...inputStyle }}
      />
      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{status}</span>
      {popover}
    </div>
  )
}
