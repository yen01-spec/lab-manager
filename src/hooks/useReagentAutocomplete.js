import { useEffect, useMemo, useRef, useState } from 'react'
import {
  SUGGEST_DEBOUNCE_MS, SUGGEST_LIMIT, loadReagentIndex, normalizeTerm, suggestByLocation, suggestFrom,
} from '../lib/reagentSearch'

const DEFAULT_FIELDS = (r) => r

// 시약 자동추천 데이터 훅.
//  · items 가 없으면 공용 시약 인덱스(1회 로드·메모리 검색)를 쓴다 — 키 입력마다 서버에 묻지 않는다.
//  · items 가 있으면 그 목록 "안에서만" 찾는다(재고실사처럼 권한/범위가 제한된 화면 — 범위를 넓히지 않는다).
//  · 입력 → 추천 반영은 debounce(SUGGEST_DEBOUNCE_MS). 빈 입력은 즉시 추천 숨김.
export function useReagentAutocomplete({ value, items, getFields = DEFAULT_FIELDS, showLocation = false, limit = SUGGEST_LIMIT, enabled = true }) {
  const term = normalizeTerm(value)
  const [debouncedRaw, setDebounced] = useState(term)
  useEffect(() => {
    if (!term) return
    const t = setTimeout(() => setDebounced(term), SUGGEST_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [term])
  const debounced = term ? debouncedRaw : ''   // 빈 입력은 대기 없이 즉시 추천 숨김

  const [index, setIndex] = useState(null)
  const [error, setError] = useState(false)
  const needIndex = enabled && !items && !!term
  useEffect(() => {
    if (!needIndex || index) return
    let alive = true
    loadReagentIndex().then(d => { if (alive) { setIndex(d); setError(false) } }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [needIndex, index])

  const source = items || index
  const base = useMemo(
    () => (enabled && source && debounced ? suggestFrom(source, debounced, getFields, limit) : []),
    [enabled, source, debounced, getFields, limit],
  )

  const [locOptions, setLocOptions] = useState({ term: '', list: [] })
  const reqRef = useRef(0)
  useEffect(() => {
    if (!showLocation || !enabled || !debounced) return
    const id = ++reqRef.current
    suggestByLocation(debounced, limit).then(list => { if (reqRef.current === id) setLocOptions({ term: debounced, list }) }).catch(() => {})
  }, [showLocation, enabled, debounced, limit])

  const options = useMemo(() => {
    if (!showLocation || locOptions.term !== debounced) return base
    const seen = new Set(base.map(r => r.id))
    return [...base, ...locOptions.list.filter(r => !seen.has(r.id))].slice(0, limit + 2)
  }, [base, locOptions, debounced, showLocation, limit])

  // pending: 아직 debounce 대기 중이거나(입력 ≠ 반영값) 인덱스 로딩 중 → "결과 없음"을 성급히 보여주지 않는다.
  const loading = !!term && (debounced !== term || (needIndex && !index && !error))
  return { term, options, loading, error }
}
