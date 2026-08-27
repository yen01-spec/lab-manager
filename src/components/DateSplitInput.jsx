import { useState, useRef } from 'react'
import { inputStyle, C } from '../design'

// 연/월/일 분리 입력 — 4자리 다 채우면 자동으로 다음 칸 포커스, Backspace로 이전 칸 복귀.
// value/onChange는 <input type="date">와 동일하게 'YYYY-MM-DD' 문자열 계약을 유지한다.
// (LoginModal.jsx의 BirthDateInput과 동일한 패턴을 범용으로 뺀 것)
export default function DateSplitInput({ value, onChange }) {
  const initParts = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-') : ['', '', '']
  const [year, setYear] = useState(initParts[0])
  const [month, setMonth] = useState(initParts[1])
  const [day, setDay] = useState(initParts[2])
  const yearRef = useRef(null)
  const monthRef = useRef(null)
  const dayRef = useRef(null)

  function emit(y, m, d) {
    onChange(y.length === 4 && m.length === 2 && d.length === 2 ? `${y}-${m}-${d}` : '')
  }

  function handleYear(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setYear(v)
    emit(v, month, day)
    if (v.length === 4) monthRef.current?.focus()
  }
  function handleMonth(e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (v.length === 1 && Number(v) >= 2) v = '0' + v
    setMonth(v)
    emit(year, v, day)
    if (v.length === 2) dayRef.current?.focus()
  }
  function handleDay(e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (v.length === 1 && Number(v) >= 4) v = '0' + v
    setDay(v)
    emit(year, month, v)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input ref={yearRef} value={year} onChange={handleYear} placeholder="YYYY" inputMode="numeric"
        style={{ ...inputStyle, width: 72, textAlign: 'center' }} />
      <span style={{ color: C.muted }}>-</span>
      <input ref={monthRef} value={month} onChange={handleMonth}
        onKeyDown={e => { if (e.key === 'Backspace' && !month) yearRef.current?.focus() }}
        placeholder="MM" inputMode="numeric" style={{ ...inputStyle, width: 52, textAlign: 'center' }} />
      <span style={{ color: C.muted }}>-</span>
      <input ref={dayRef} value={day} onChange={handleDay}
        onKeyDown={e => { if (e.key === 'Backspace' && !day) monthRef.current?.focus() }}
        placeholder="DD" inputMode="numeric" style={{ ...inputStyle, width: 52, textAlign: 'center' }} />
    </div>
  )
}
