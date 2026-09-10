import { supabaseAdmin } from '../supabase'

// 자료관리 write 를 위한 Supabase Auth 관리자 인증. (Phase 5-h2 보안)
// 앱의 일반 로그인(students + localStorage lm_session)과는 완전히 별개다.
// write 는 반드시 supabaseAdmin 클라이언트로 수행해야 RLS(is_admin())를 통과한다.

export async function getAdminAuthUser() {
  const { data } = await supabaseAdmin.auth.getSession()
  return data.session?.user ?? null
}

// Auth 세션이 있고 admin_users 에 active 로 등록된 사용자인지.
export async function isAuthedAdmin() {
  const { data } = await supabaseAdmin.auth.getSession()
  const uid = data.session?.user?.id
  if (!uid) return false
  const { data: row } = await supabaseAdmin
    .from('admin_users').select('user_id').eq('user_id', uid).eq('active', true).maybeSingle()
  return !!row
}

export async function signInAdmin(email, password) {
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: (email || '').trim(), password })
  if (error) return { ok: false, error: error.message }
  // 로그인은 됐지만 관리자 명단에 없으면 즉시 로그아웃
  const { data: row } = await supabaseAdmin
    .from('admin_users').select('user_id').eq('user_id', data.user.id).eq('active', true).maybeSingle()
  if (!row) {
    await supabaseAdmin.auth.signOut()
    return { ok: false, error: '이 계정은 자료관리 관리자로 등록되어 있지 않습니다.' }
  }
  return { ok: true, user: data.user }
}

export async function signOutAdmin() {
  await supabaseAdmin.auth.signOut()
}
