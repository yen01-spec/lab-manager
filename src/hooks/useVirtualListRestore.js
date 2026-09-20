import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { loadViewSnapshot, saveViewSnapshot } from '../lib/reagentListView'

const HEADER_PX = 60 // 상단 고정 헤더(56px) 아래부터 "보이는" 행으로 친다

// 가상 스크롤 목록의 "보고 있던 위치"를 저장/복원한다. 행은 [data-index] 요소로 렌더된다고 가정.
//  - 저장: 스크롤(rAF 스로틀)·클릭 때 "헤더 바로 아래 첫 행"의 key와 그 행의 화면상 top을 ref에 기록해 두고,
//    목록이 사라질 때(상세 페이지로 이동 등)와 pagehide(새로고침)에 sessionStorage로 내보낸다.
//    픽셀 스크롤값(y)만 저장하면 재진입 시 행 높이가 "추정치"라 같은 y가 다른 행을 가리키므로 행 key를 기준점으로 삼는다.
//    (언마운트 시점엔 DOM이 이미 사라져 있어서 그때 측정할 수 없다 — 그래서 미리 기록.)
//  - 복원: 뒤로가기/앞으로가기/새로고침(POP)으로 들어왔고 저장된 스냅샷이 "같은 URL 쿼리"의 것일 때만,
//    목록이 처음 그려진 직후 1회 실행. 새 링크 클릭(PUSH)은 항상 맨 위에서 시작.
//  rows: [{ key }], ready: scrollMargin 측정이 끝나 오프셋 계산이 유효한지.
export function useVirtualListRestore(virtualizer, rows, ready) {
  const location = useLocation()
  const navType = useNavigationType()
  const [snap] = useState(() => (navType === 'POP' ? loadViewSnapshot(location.search) : null))
  const restoredRef = useRef(false)

  const latest = useRef({ rows, search: location.search })
  useEffect(() => { latest.current = { rows, search: location.search } })
  const anchorRef = useRef(null)

  useLayoutEffect(() => {
    if (restoredRef.current || !snap || !ready || rows.length === 0) return
    restoredRef.current = true
    const idx = snap.anchorKey == null ? -1 : rows.findIndex(r => r.key === snap.anchorKey)
    const target = idx >= 0 ? virtualizer.getOffsetForIndex(idx, 'start')?.[0] : undefined
    if (target == null) { if (snap.y) window.scrollTo(0, snap.y); return }
    window.scrollTo(0, target - (snap.top || 0))

    // 아직 측정되지 않은 위쪽 행들이 "추정 높이"로 계산돼 있어서, 실제 높이가 측정되며 목록이 조금씩 밀린다.
    // 그래서 첫 몇 프레임 동안 anchor 행이 저장 당시의 화면 위치(snap.top)에 오도록 계속 보정한다.
    // 사용자가 직접 스크롤/터치하면 즉시 중단.
    let cancelled = false, frames = 0, stable = 0, raf = 0
    const cancel = () => { cancelled = true }
    const events = ['wheel', 'touchstart', 'mousedown', 'keydown']
    events.forEach(e => window.addEventListener(e, cancel, { passive: true }))
    const step = () => {
      if (cancelled) return
      const el = document.querySelector(`[data-index="${idx}"]`)
      if (el) {
        const err = el.getBoundingClientRect().top - (snap.top || 0)
        if (Math.abs(err) > 1) { window.scrollBy(0, err); stable = 0 } else stable++
      }
      if (++frames < 45 && stable < 6) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelled = true; cancelAnimationFrame(raf); events.forEach(e => window.removeEventListener(e, cancel)) }
  }, [snap, ready, rows, virtualizer])

  useEffect(() => {
    let raf = 0
    const capture = () => {
      raf = 0
      for (const el of document.querySelectorAll('[data-index]')) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom > HEADER_PX) {
          const row = latest.current.rows[Number(el.getAttribute('data-index'))]
          if (row) anchorRef.current = { anchorKey: row.key, top: Math.round(rect.top), y: Math.round(window.scrollY) }
          return
        }
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(capture) }
    const flush = () => {
      if (anchorRef.current) saveViewSnapshot(latest.current.search, anchorRef.current)
    }
    raf = requestAnimationFrame(capture) // 스크롤 없이 바로 떠나는 경우도 맨 위 위치를 기록
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('click', capture, true) // 행 클릭 → 상세 이동 직전의 정확한 위치
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('click', capture, true)
      window.removeEventListener('pagehide', flush)
      if (raf) cancelAnimationFrame(raf)
      flush()
    }
  }, [])
}
