import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FIRE_CLASSES } from '../lib/hazardCategory'

// 시약 목록의 검색/필터 상태를 URL 쿼리에 둔다 — 상세 페이지에서 뒤로가기를 하면
// 같은 URL로 돌아오므로 검색어·필터가 그대로 복원되고, 링크 공유/새로고침도 같은 결과를 보여준다.
//   q=검색어  room=방  loc=세부위치id  hz=유해분류(반복)  fire=위험물유별(반복)  special=1  casmm=1
// preset(special|hazard|fire)은 자료 탭 딥링크용 1회성 입력 — 아래 effect가 실제 필터 파라미터로 바꿔치기한다.
// 필터 변경은 replace로 기록해 히스토리를 쌓지 않는다(뒤로가기 한 번 = 목록을 떠나기 전 화면).
const VALID_PRESETS = ['special', 'hazard', 'fire']

export function useReagentListParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  // 같은 핸들러 안에서 setRoomFilter → setDetailFilter처럼 연달아 부르면 react-router의 함수형
  // setSearchParams는 앞선 변경을 못 본다 — 최신 쿼리를 ref로 들고 있으면서 직접 합성한다.
  const paramsRef = useRef(searchParams)
  useEffect(() => { paramsRef.current = searchParams }, [searchParams])

  const update = useCallback((mutate) => {
    const next = new URLSearchParams(paramsRef.current)
    mutate(next)
    paramsRef.current = next
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  const search = searchParams.get('q') || ''
  const roomFilter = searchParams.get('room') || ''
  const detailFilter = searchParams.get('loc') || ''
  const hzKey = searchParams.getAll('hz').join('')
  const fireKey = searchParams.getAll('fire').join('')
  const hazardClassFilter = useMemo(() => new Set(hzKey ? hzKey.split('') : []), [hzKey])
  const fireClassFilter = useMemo(
    () => new Set((fireKey ? fireKey.split('') : []).filter(c => FIRE_CLASSES.includes(c))),
    [fireKey],
  )
  const specialOnly = searchParams.get('special') === '1'
  const casMismatchOnly = searchParams.get('casmm') === '1'
  const rawPreset = searchParams.get('preset')
  const preset = VALID_PRESETS.includes(rawPreset) ? rawPreset : null

  // preset=special/fire → 즉시 실제 필터 파라미터로 변환(이후 사용자가 자유롭게 해제 가능).
  // preset=hazard는 "존재하는 모든 유해분류"를 알아야 해서 결과 로드 뒤 applyHazardPreset에서 처리.
  useEffect(() => {
    if (preset === 'special') {
      update(p => { p.delete('preset'); p.set('special', '1') })
    } else if (preset === 'fire') {
      update(p => { p.delete('preset'); p.delete('fire'); FIRE_CLASSES.forEach(c => p.append('fire', c)) })
    }
  }, [preset, update])
  const hazardPresetPending = preset === 'hazard' && hazardClassFilter.size === 0

  const setSearch = useCallback((v) => update(p => { v ? p.set('q', v) : p.delete('q') }), [update])
  const setRoomFilter = useCallback((v) => update(p => {
    v ? p.set('room', v) : p.delete('room')
    p.delete('loc') // 방을 바꾸면 세부위치는 항상 초기화
  }), [update])
  const setDetailFilter = useCallback((v) => update(p => { v ? p.set('loc', v) : p.delete('loc') }), [update])

  // 함수형 updater가 "직전 값"을 정확히 보도록 최신 쿼리에서 Set을 다시 만든다.
  const setHazardClassFilter = useCallback((v) => update(p => {
    const cur = new Set(p.getAll('hz'))
    const next = typeof v === 'function' ? v(cur) : v
    p.delete('hz'); p.delete('preset')
    ;[...next].forEach(n => p.append('hz', n))
  }), [update])
  const setFireClassFilter = useCallback((v) => update(p => {
    const cur = new Set(p.getAll('fire'))
    const next = typeof v === 'function' ? v(cur) : v
    p.delete('fire')
    ;[...next].forEach(n => p.append('fire', n))
  }), [update])
  const setSpecialOnly = useCallback((v) => update(p => {
    const next = typeof v === 'function' ? v(p.get('special') === '1') : v
    next ? p.set('special', '1') : p.delete('special')
  }), [update])
  const setCasMismatchOnly = useCallback((v) => update(p => {
    const next = typeof v === 'function' ? v(p.get('casmm') === '1') : v
    next ? p.set('casmm', '1') : p.delete('casmm')
  }), [update])

  return {
    search, roomFilter, detailFilter, hazardClassFilter, fireClassFilter, specialOnly, casMismatchOnly,
    hazardPresetPending,
    setSearch, setRoomFilter, setDetailFilter, setHazardClassFilter, setFireClassFilter,
    setSpecialOnly, setCasMismatchOnly,
  }
}
