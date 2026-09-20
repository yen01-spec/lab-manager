import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { C } from '../design'
import { computePlacement } from '../lib/popoverPlacement'

// 실험실에서 자주 쓰는 제조사 10곳의 로고 — 로고를 클릭하면 정확한 철자로
// 회사명이 채워짐(그동안 회사명이 "ALDRICH"/"aldrich"/"Aldrich"/"AlDRICH"처럼
// 사람마다 제각각으로 입력돼 있던 문제를 새로 입력하는 것부터라도 줄이기 위함).
export const BRANDS = [
  { name: 'Samchun', file: 'samchun.jpg' },
  { name: 'Sigma-Aldrich', file: 'sigma-aldrich.jpg' },
  { name: 'Daejung', file: 'daejung.jpg' },
  { name: 'Duksan', file: 'duksan.jpg' },
  { name: 'TCI', file: 'tci.jpg' },
  { name: 'Junsei', file: 'junsei.jpg' },
  { name: 'Acros Organics', file: 'acros-organics.jpg' },
  { name: 'Kanto Chemical', file: 'kanto-chemical.jpg' },
  { name: 'Hayashi Pure Chemical', file: 'hayashi-pure-chemical.jpg' },
  { name: 'D.S.P.', file: 'dsp.jpg' },
]

// 기존 회사명 입력칸을 그대로 대체하는 용도 — value/onChange 계약은 평범한
// <input>과 동일해서 직접 타이핑도 계속 되고(목록에 없는 회사도 많으므로),
// 입력칸을 누르면(포커스하면) 바로 아래에 로고 드롭다운이 뜨고 로고를 클릭하면
// 그 값으로 채워짐 — 별도 버튼 없이, 다른 자동완성 입력칸들과 같은 방식.
// onBlur/onKeyDown은 "저장은 blur/Enter 때" 패턴을 쓰는 화면(재고실사 등)을 위한 통로 —
// 로고를 클릭했을 때도 그 화면들이 즉시 저장할 수 있도록 onPick으로 따로 알려줌
// (onChange만으로는 "타이핑 중"인지 "로고를 확정 선택"했는지 구분이 안 되기 때문).
//
// 로고 팝업은 body 로 포털 + position:fixed + viewport 충돌 계산(lib/popoverPlacement) —
// 예전엔 입력칸 안쪽에 absolute(width 300px)로 그려서, 입력칸이 화면 오른쪽 끝/모달·표의 overflow 영역 안에 있으면
// 팝업이 잘렸다. 좁은 화면(320px)에서는 화면 폭에 맞춰 줄어들고, 아래 공간이 모자라면 위로 열리며, 넘치면 내부 스크롤.
const POPUP_WIDTH = 320

export default function CompanyPicker({ value, onChange, onPick, onBlur, onKeyDown, inputRef, placeholder, style, disabled, ariaLabel = '제조사' }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState(null)
  const boxRef = useRef(null)
  const popRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const showPanel = open && !disabled
  useLayoutEffect(() => {
    if (!showPanel) return
    const update = () => { if (boxRef.current) setPlace(computePlacement(boxRef.current.getBoundingClientRect(), { width: POPUP_WIDTH })) }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [showPanel])

  const skipFocusOpen = useRef(false)   // 팝업을 닫고 입력칸으로 포커스를 돌려줄 때 onFocus 가 팝업을 다시 열지 않게
  const focusInput = () => { skipFocusOpen.current = true; boxRef.current?.querySelector('input')?.focus(); setTimeout(() => { skipFocusOpen.current = false }, 0) }
  function pick(name) {
    onChange(name)
    if (onPick) onPick(name)
    setOpen(false)
    focusInput()
  }
  // 키보드: 입력칸에서 ↓ → 첫 로고로 이동, 로고 사이는 ←→↑↓/Home/End, Enter/Space 선택, Esc/Tab → 닫고 입력칸으로 복귀.
  // (팝업이 body 포털이라 Tab 순서로는 닿지 않으므로 방향키 경로를 제공한다)
  const logoButtons = () => [...(popRef.current?.querySelectorAll('button') || [])]
  function onPopupKeyDown(e) {
    const btns = logoButtons(); const i = btns.indexOf(document.activeElement)
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); setOpen(false); focusInput(); return }
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (move !== undefined) { e.preventDefault(); if (i + move < 0) focusInput(); else btns[Math.min(btns.length - 1, i + move)]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); btns[0]?.focus() } else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1]?.focus() }
  }

  const popup = showPanel && place && createPortal(
    <div ref={popRef} role="group" aria-label="제조사 로고 선택" data-testid="company-picker-popup" onKeyDown={onPopupKeyDown} style={{
      position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight,
      zIndex: 3000, boxSizing: 'border-box', overflowY: 'auto', overscrollBehavior: 'contain',
      background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '10px',
    }}>
      <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>제조사 로고를 클릭하면 회사명이 입력돼요</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '6px' }}>
        {BRANDS.map(b => (
          <button key={b.file} type="button" onClick={() => pick(b.name)} title={b.name} aria-label={b.name}
            style={{
              border: `1px solid ${C.border}`, borderRadius: '6px', background: C.white,
              cursor: 'pointer', padding: '4px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
            <img src={`/brands/${b.file}`} alt="" style={{ maxWidth: '100%', maxHeight: '36px', objectFit: 'contain' }} />
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onFocus={() => { if (!skipFocusOpen.current) setOpen(true) }}
        onClick={() => setOpen(true)}
        onBlur={onBlur}
        aria-label={ariaLabel} aria-keyshortcuts="ArrowDown"
        onKeyDown={e => {
          if (e.key === 'Escape' && open) setOpen(false)
          if (e.key === 'ArrowDown' && !disabled) { e.preventDefault(); setOpen(true); setTimeout(() => logoButtons()[0]?.focus(), 30) }
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        style={{ ...style, width: style?.width ?? '100%' }}
      />
      {popup}
    </div>
  )
}
