import { useCallback, useContext, useEffect, useState } from 'react'
import { AdminSessionContext } from './adminSessionContext'
import { supabaseAdmin } from '../supabase'
import { isAuthedAdmin, getAdminAuthUser } from '../lib/adminAuth'

// Supabase Auth 관리자 세션(admin_users 등록 + active) 여부. 앱의 일반 로그인(students)과 별개 —
// 관리자 write 는 이 세션으로만 통과한다(DB의 public.is_admin()). 이 값은 UI 노출용일 뿐, 실제 권한은 DB가 결정한다.
// 조회 실패/예외는 항상 "관리자 아님(authed=false)"으로 확정한다(fail-closed).
const CHECK_TIMEOUT_MS = 5000

export function useAdminSessionState() {
  const [state, setState] = useState({ ready: false, authed: false, email: null })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      let next = { ready: true, authed: false, email: null }
      try {
        // 네트워크 재시도(supabase-js GET 재시도)로 무한 로딩되지 않도록 상한을 둔다. 시간 초과 = 관리자 아님.
        const check = (async () => {
          if (!(await isAuthedAdmin())) return null
          return (await getAdminAuthUser())?.email ?? ''
        })()
        const email = await Promise.race([check, new Promise(res => setTimeout(() => res(null), CHECK_TIMEOUT_MS))])
        if (email !== null) next = { ready: true, authed: true, email: email || null }
      } catch {
        // 네트워크/DB 오류 → 관리자 아님
      }
      if (alive) setState(next)
    })()
    return () => { alive = false }
  }, [tick])

  // 다른 탭/토큰 만료로 로그아웃되면 즉시 재판정
  useEffect(() => {
    const { data } = supabaseAdmin.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        setTimeout(refresh, 0)
      }
    })
    return () => data?.subscription?.unsubscribe()
  }, [refresh])

  return { ...state, refresh }
}

// Layout 이 판정한 단일 세션을 공유한다(화면마다 중복 조회하지 않음). Provider 밖이면 fail-closed 기본값.
const FALLBACK = { ready: true, authed: false, email: null, refresh: () => {} }
export function useAdminSession() {
  return useContext(AdminSessionContext) ?? FALLBACK
}
