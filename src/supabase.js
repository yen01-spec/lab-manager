import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 네트워크가 멈췄을 때 화면이 영원히 '처리 중'에 머물지 않도록 요청 시간 제한(업로드/다운로드 제외).
// 시간 초과 시 사용자가 이해할 수 있는 문구로 실패시킨다(쓰기 재시도는 각 화면의 중복 제출 방지와 함께).
const REQUEST_TIMEOUT_MS = 30000
function fetchWithTimeout(input, init) {
  const url = typeof input === 'string' ? input : input.url
  if (url.includes('/storage/v1/')) return fetch(input, init)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  if (init?.signal) init.signal.addEventListener('abort', () => ctrl.abort())
  return fetch(input, { ...init, signal: ctrl.signal })
    .catch(err => {
      if (err?.name === 'AbortError') throw new TypeError('요청 시간이 초과되었습니다. 네트워크 상태를 확인하고 다시 시도해주세요.')
      throw err
    })
    .finally(() => clearTimeout(timer))
}

// 앱 전역 클라이언트 — 이 앱의 로그인은 students + localStorage 라 Supabase Auth 세션은 안 씀.
export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: fetchWithTimeout } })

// 관리자 자료관리 write 전용 클라이언트 — 여기서만 Supabase Auth 세션을 쓴다.
// 세션 저장소 key 를 분리(lm_admin_auth)해서 관리자 로그인이 전역 supabase 요청의
// JWT 를 바꾸지 않게 한다(읽기는 계속 anon, write 만 인증된 관리자).
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { storageKey: 'lm_admin_auth', persistSession: true, autoRefreshToken: true },
  global: { fetch: fetchWithTimeout },
})
