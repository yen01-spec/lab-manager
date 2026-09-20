import { useCallback, useEffect, useRef, useState } from 'react'

// 쓰기 동작(등록/신청/저장)의 중복 제출 방지 — 느린 네트워크에서 버튼을 두 번 눌러도 서버에는 한 번만 간다.
// run(...)은 이미 실행 중이면 조용히 무시한다. busy 는 버튼 비활성/표시용.
export function useBusyAction(fn) {
  const [busy, setBusy] = useState(false)
  const runningRef = useRef(false)
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn })
  const run = useCallback(async (...args) => {
    if (runningRef.current) return undefined
    runningRef.current = true
    setBusy(true)
    try { return await fnRef.current(...args) } finally { runningRef.current = false; setBusy(false) }
  }, [])
  return [run, busy]
}
