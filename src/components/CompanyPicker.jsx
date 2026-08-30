import { useEffect, useRef, useState } from 'react'
import { C } from '../design'

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
// 옆의 로고 버튼을 누르면 그리드가 뜨고 로고를 클릭하면 그 값으로 채워짐.
// onBlur/onKeyDown은 "저장은 blur/Enter 때" 패턴을 쓰는 화면(재고실사 등)을 위한 통로 —
// 로고를 클릭했을 때도 그 화면들이 즉시 저장할 수 있도록 onPick으로 따로 알려줌
// (onChange만으로는 "타이핑 중"인지 "로고를 확정 선택"했는지 구분이 안 되기 때문).
export default function CompanyPicker({ value, onChange, onPick, onBlur, onKeyDown, inputRef, placeholder, style, disabled }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function pick(name) {
    onChange(name)
    if (onPick) onPick(name)
    setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'flex', gap: '4px', alignItems: 'center' }}>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{ ...style, flex: 1, minWidth: 0 }}
      />
      {!disabled && (
        <button type="button" onClick={() => setOpen(o => !o)} title="제조사 로고로 선택"
          style={{
            flexShrink: 0, width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer',
            border: `1px solid ${open ? C.blue : C.border}`, background: open ? '#EAF1FB' : C.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', padding: 0,
          }}>🏢</button>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 250,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '10px', width: '300px',
        }}>
          <div style={{ fontSize: '11px', color: C.muted, marginBottom: '8px' }}>제조사 로고를 클릭하면 회사명이 입력돼요</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
            {BRANDS.map(b => (
              <button key={b.file} type="button" onClick={() => pick(b.name)} title={b.name}
                style={{
                  border: `1px solid ${C.border}`, borderRadius: '6px', background: C.white,
                  cursor: 'pointer', padding: '4px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <img src={`/brands/${b.file}`} alt={b.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
