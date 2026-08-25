import bcrypt from 'bcryptjs'
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

// 캐시된 세션을 students 테이블 최신 상태로 다시 확인한다.
// 학번이 사라졌으면 세션을 지우고, 아니면 이름/관리자 여부를 최신값으로 갱신한다.
export async function revalidateSession() {
  const cached = readSession()
  if (!cached) return null

  const student = await lookupStudent(cached.student_id)
  if (!student) {
    clearSession()
    return null
  }

  const fresh = {
    student_id: student.student_id,
    name: student.name,
    is_admin: student.is_admin,
    is_super: student.is_super,
  }
  writeSession(fresh)
  return fresh
}

export async function lookupStudent(student_id) {
  const { data } = await supabase
    .from('students')
    .select('student_id, name, birth_date, is_admin, is_super, password_hash')
    .eq('student_id', student_id)
    .maybeSingle()
  return data || null
}

export async function registerStudent({ student_id, name, birth_date }) {
  const { data, error } = await supabase
    .from('students')
    .insert({ student_id, name, birth_date })
    .select('student_id, name, birth_date, is_admin, is_super')
    .single()
  if (error) throw error
  return data
}

// 기존 Layout.jsx의 PIN 비교 로직을 그대로 옮김 (관리자 승격에서 재사용)
export async function checkPinPassword(pw) {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['admin_password', 'super_password'])
  const s = {}
  data?.forEach(d => { s[d.key] = d.value })
  if (pw === s['super_password']) return { ok: true, isSuper: true }
  if (pw === s['admin_password']) return { ok: true, isSuper: false }
  return { ok: false, isSuper: false }
}

export async function hashPassword(pw) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(pw, salt)
}

export async function verifyPassword(pw, hash) {
  if (!hash) return false
  return bcrypt.compare(pw, hash)
}

export async function upgradeToAdmin({ student_id, pin }) {
  const { ok, isSuper } = await checkPinPassword(pin)
  if (!ok) throw new Error('비밀번호가 틀렸습니다')

  const password_hash = await hashPassword(pin)
  const { data, error } = await supabase
    .from('students')
    .update({ password_hash, is_admin: true, is_super: isSuper })
    .eq('student_id', student_id)
    .select('student_id, name, birth_date, is_admin, is_super')
    .single()
  if (error) throw error
  return data
}

export async function loginAdmin({ student_id, birth_date, name, password }) {
  const student = await lookupStudent(student_id)
  if (!student) throw new Error('등록되지 않은 학번입니다')
  if (student.name !== name || student.birth_date !== birth_date) {
    throw new Error('등록된 정보와 다릅니다. 관리자에게 문의하세요')
  }
  const valid = await verifyPassword(password, student.password_hash)
  if (!valid) throw new Error('비밀번호가 틀렸습니다')
  return {
    student_id: student.student_id,
    name: student.name,
    is_admin: student.is_admin,
    is_super: student.is_super,
  }
}
