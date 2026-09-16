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

// 캐시된 세션을 최신 상태로 다시 확인한다(RLS 보안 감사, 2026-09-16 — students 테이블에서
// birth_date/password_hash 컬럼 권한 자체를 회수했으므로 SECURITY DEFINER RPC로 조회).
// 학번이 사라졌으면 세션을 지우고, 아니면 이름/관리자 여부를 최신값으로 갱신한다.
export async function revalidateSession() {
  const cached = readSession()
  if (!cached) return null

  const { data, error } = await supabase.rpc('student_session_refresh', { p_student_id: cached.student_id })
  if (error || !data || data.status !== 'ok') {
    clearSession()
    return null
  }

  const fresh = { student_id: data.student_id, name: data.name, is_admin: data.is_admin }
  writeSession(fresh)
  return fresh
}

// 비밀번호 없는 "일반 로그인" 확인 — 존재하지 않으면 null(신규등록 단계로), 이름/생년월일이
// 다르면 throw, 일치하면 세션 후보 반환(is_admin은 항상 false로 시작 — 기존 동작 그대로).
export async function checkStudentLogin({ student_id, name, birth_date }) {
  const { data, error } = await supabase.rpc('student_check_login', {
    p_student_id: student_id, p_name: name, p_birth_date: birth_date,
  })
  if (error) throw new Error(error.message)
  if (data.status === 'not_found') return null
  if (data.status === 'mismatch') throw new Error('등록된 정보와 다릅니다. 본인이 맞다면 관리자에게 문의하세요')
  return { student_id: data.student_id, name: data.name, is_admin: false }
}

export async function registerStudent({ student_id, name, birth_date }) {
  const { data, error } = await supabase.rpc('student_register', {
    p_student_id: student_id, p_name: name, p_birth_date: birth_date,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function loginAdmin({ student_id, birth_date, name, password }) {
  const { data, error } = await supabase.rpc('student_admin_login', {
    p_student_id: student_id, p_name: name, p_birth_date: birth_date, p_password: password,
  })
  if (error) throw new Error(error.message)
  if (data.status === 'not_found') throw new Error('등록되지 않은 학번입니다')
  if (data.status === 'mismatch') throw new Error('등록된 정보와 다릅니다. 관리자에게 문의하세요')
  if (data.status === 'wrong_password') throw new Error('비밀번호가 틀렸습니다')
  return { student_id: data.student_id, name: data.name, is_admin: data.is_admin }
}

// 관리자 승격 — 공유 PIN을 입력하면 그 값이 그대로 본인 비밀번호가 된다(기존 동작 그대로).
// PIN 대조/해싱 전부 서버(student_admin_upgrade RPC)에서 처리.
export async function upgradeToAdmin({ student_id, pin }) {
  const { data, error } = await supabase.rpc('student_admin_upgrade', { p_student_id: student_id, p_pin: pin })
  if (error) throw new Error(error.message)
  return data
}

// 관리자 공유 PIN 변경(SettingsTab) — 현재값 대조도 서버에서 처리.
export async function changeAdminPassword({ current, next }) {
  const { data, error } = await supabase.rpc('admin_password_change', { p_current: current, p_new: next })
  if (error) throw new Error(error.message)
  return data
}
