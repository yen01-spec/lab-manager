import { useState, useRef } from 'react'
import { supabase } from '../supabase'
import { C } from '../design'

// 시약명 또는 CAS No. 앞부분 일치(prefix)로 실시간 후보를 보여주는 공용 자동완성 입력.
// 시약 목록 / 홈 / 구매요청서에서 동일한 검색·선택 방식을 쓰기 위해 분리.
function highlightPrefix(text, query) {
  if (!text) return text
  const q = query.trim()
  if (!q || !text.toLowerCase().startsWith(q.toLowerCase())) return text
  return (
    <>
      <b style={{ color: C.blue }}>{text.slice(0, q.length)}</b>
      {text.slice(q.length)}
    </>
  )
}

export default function ReagentAutocomplete({
  value, onChange, onSelect, onEnter, placeholder, inputStyle: inputStyleProp, inputRef, className,
}) {
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)

  function handleChange(v) {
    onChange(v)
    setHighlightIdx(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!v.trim()) { setOptions([]); setOpen(false); return }
    const myRequestId = ++requestIdRef.current
    debounceRef.current = setTimeout(async () => {
      const term = v.trim()
      const { data } = await supabase.from('reagents').select('id, name, company, cas_no')
        .or(`name.ilike.${term}%,cas_no.ilike.${term}%`)
        .neq('status', 'archived')
        .order('name').limit(10)
      if (requestIdRef.current === myRequestId) { setOptions(data || []); setOpen(true) }
    }, 200)
  }

  function select(r) {
    setOpen(false); setOptions([]); setHighlightIdx(-1)
    onSelect(r)
  }

  function handleKeyDown(e) {
    if (open && options.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, options.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Escape') { setOpen(false); return }
      if (e.key === 'Enter' && highlightIdx >= 0) { e.preventDefault(); select(options[highlightIdx]); return }
    }
    if (e.key === 'Enter' && onEnter) onEnter()
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        className={className}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (options.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={inputStyleProp}
      />
      {open && options.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '280px', overflowY: 'auto',
        }}>
          {options.map((r, i) => (
            <div key={r.id}
              onMouseDown={() => select(r)}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', borderBottom: `1px solid ${C.border}`, background: i === highlightIdx ? C.blueTint : C.white }}>
              <div style={{ fontWeight: '600', color: C.navy }}>{highlightPrefix(r.name, value)}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>{r.company || '-'} · {r.cas_no || '-'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
