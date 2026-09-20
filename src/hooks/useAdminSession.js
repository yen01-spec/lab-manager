import { useCallback, useEffect, useState } from 'react'
import { isAuthedAdmin, getAdminAuthUser } from '../lib/adminAuth'

// Supabase Auth 관리자 세션(admin_users 등록 + active) 여부. 앱의 일반 로그인(students)과 별개 —
// 관리자 write(요청 승인/반려 등)는 이 세션으로만 통과한다(DB의 public.is_admin()).
export function useAdminSession() {
  const [state, setState] = useState({ ready: false, authed: false, email: null })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const authed = await isAuthedAdmin()
      const user = authed ? await getAdminAuthUser() : null
      if (alive) setState({ ready: true, authed, email: user?.email ?? null })
    })()
    return () => { alive = false }
  }, [tick])
  return { ...state, refresh }
}
