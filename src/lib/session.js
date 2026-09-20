import { supabase } from '../supabase'

const SESSION_KEY = 'lm_session'

export function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// 신원이 필요한 RPC(예: disposal_request_submit)에 넘길 토큰. 세션이 없으면 null —
// 호출부가 "로그인 필요" 안내로 처리해야 한다(client가 student_id를 대신 넘겨서
// 우회하지 않는다 — Phase S-RLS2 B안).
export function getSessionToken() {
  return readSession()?.session_token ?? null
}

// 캐시된 세션을 최신 상태로 다시 확인한다 — student_id가 아니라 session_token으로
// 서버에서 신원을 재확인한다(client가 보낸 student_id를 신뢰하지 않음, Phase S-RLS2).
// 토큰이 만료/무효화됐으면 세션을 지운다(재로그인 필요).
export async function revalidateSession() {
  const cached = readSession()
  if (!cached?.session_token) {
    clearSession()
    return null
  }

  const { data, error } = await supabase.rpc('student_session_refresh', { p_session_token: cached.session_token })
  if (error || !data || data.status !== 'ok') {
    clearSession()
    return null
  }

  const fresh = { student_id: data.student_id, name: data.name, session_token: data.session_token }
  writeSession(fresh)
  return fresh
}

// 비밀번호 없는 "일반 로그인" 확인 — 존재하지 않으면 null(신규등록 단계로), 이름/생년월일이
// 다르면 throw, 일치하면 세션 후보(+session_token) 반환. (관리자 권한은 이 세션과 무관 — Supabase Auth)
export async function checkStudentLogin({ student_id, name, birth_date }) {
  const { data, error } = await supabase.rpc('student_check_login', {
    p_student_id: student_id, p_name: name, p_birth_date: birth_date,
  })
  if (error) throw new Error(error.message)
  if (data.status === 'not_found') return null
  if (data.status === 'mismatch') throw new Error('등록된 정보와 다릅니다. 본인이 맞다면 관리자에게 문의하세요')
  return { student_id: data.student_id, name: data.name, session_token: data.session_token }
}

export async function registerStudent({ student_id, name, birth_date }) {
  const { data, error } = await supabase.rpc('student_register', {
    p_student_id: student_id, p_name: name, p_birth_date: birth_date,
  })
  if (error) throw new Error(error.message)
  return data // { student_id, name, session_token }
}

// 로그아웃 — 서버 세션도 명시적으로 폐기(Phase S-RLS2). localStorage clear만 하던
// 기존 동작에, 토큰이 있으면 revoke도 함께 수행.
export async function logoutSession() {
  const token = getSessionToken()
  clearSession()
  if (token) {
    try { await supabase.rpc('student_logout', { p_session_token: token }) } catch { /* best-effort */ }
  }
}
