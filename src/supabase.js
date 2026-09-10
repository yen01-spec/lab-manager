import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 앱 전역 클라이언트 — 이 앱의 로그인은 students + localStorage 라 Supabase Auth 세션은 안 씀.
export const supabase = createClient(supabaseUrl, supabaseKey)

// 관리자 자료관리 write 전용 클라이언트 — 여기서만 Supabase Auth 세션을 쓴다.
// 세션 저장소 key 를 분리(lm_admin_auth)해서 관리자 로그인이 전역 supabase 요청의
// JWT 를 바꾸지 않게 한다(읽기는 계속 anon, write 만 인증된 관리자).
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { storageKey: 'lm_admin_auth', persistSession: true, autoRefreshToken: true },
})
