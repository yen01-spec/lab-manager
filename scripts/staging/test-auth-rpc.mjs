// STAGING TEST ONLY — verifies the new student-auth RPCs (20260916090000_harden_student_auth.sql)
// behave correctly and that the students/app_settings sensitive columns are truly unreadable
// by anon anymore.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'

function loadEnvStagingLocal() {
  const text = readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnvStagingLocal()
const urlRef = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (urlRef === PRODUCTION_PROJECT_REF || urlRef !== STAGING_PROJECT_REF) {
  throw new Error(`[FATAL] ref(${urlRef})가 staging이 아닙니다.`)
}
console.log(`[guard] staging ref 확인됨: ${urlRef}`)

const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const results = []
async function test(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, status: 'PASS', detail: detail ?? null })
    console.log(`[PASS] ${name}`)
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e.message })
    console.log(`[FAIL] ${name}: ${e.message}`)
  }
}
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected=${JSON.stringify(b)} actual=${JSON.stringify(a)}`) }
function assertTrue(c, msg) { if (!c) throw new Error(msg) }

await test('anon cannot select birth_date column', async () => {
  const { error } = await anon.from('students').select('birth_date').eq('student_id', 'TEST-STU-0001')
  assertTrue(!!error, 'birth_date 컬럼 select가 차단되지 않음')
  return { errorMessage: error.message }
})

await test('anon cannot select password_hash column', async () => {
  const { error } = await anon.from('students').select('password_hash').eq('student_id', 'TEST-STU-0001')
  assertTrue(!!error, 'password_hash 컬럼 select가 차단되지 않음')
})

await test('anon can still select student_id,name (display use)', async () => {
  const { data, error } = await anon.from('students').select('student_id,name').eq('student_id', 'TEST-STU-0001')
  if (error) throw new Error(error.message)
  assertEq(data.length, 1, '1건 조회')
  return data[0]
})

await test('anon cannot insert into students directly', async () => {
  const { error } = await anon.from('students').insert({ student_id: 'TEST-DIRECT-INSERT', name: 'x', birth_date: '2000-01-01' })
  assertTrue(!!error, '직접 INSERT가 차단되지 않음')
})

await test('anon cannot update students directly', async () => {
  const { error } = await anon.from('students').update({ is_admin: true }).eq('student_id', 'TEST-STU-0001')
  assertTrue(!!error, '직접 UPDATE가 차단되지 않음(is_admin 자가승격 가능 상태!)')
})

await test('anon cannot select app_settings.admin_password', async () => {
  const { data, error } = await anon.from('app_settings').select('value').eq('key', 'admin_password')
  if (error) throw new Error(`쿼리 자체가 에러(예상과 다름): ${error.message}`)
  assertEq(data.length, 0, 'admin_password row가 조회되면 안 됨(RLS로 걸러져야 함)')
})

await test('student_check_login: not_found for unknown id', async () => {
  const { data, error } = await anon.rpc('student_check_login', { p_student_id: 'TEST-NOPE', p_name: 'x', p_birth_date: '2000-01-01' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'not_found', 'status')
})

await test('student_check_login: mismatch for wrong birth_date', async () => {
  const { data, error } = await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '1999-09-09' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'mismatch', 'status')
})

await test('student_check_login: ok for correct info, is_admin forced false', async () => {
  const { data, error } = await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'ok', 'status')
  assertEq(data.is_admin, false, 'is_admin은 항상 false로 시작')
  return data
})

await test('student_register: creates new student', async () => {
  const { data, error } = await anon.rpc('student_register', { p_student_id: 'TEST-STU-NEW', p_name: 'TEST New', p_birth_date: '2003-03-03' })
  if (error) throw new Error(error.message)
  assertEq(data.student_id, 'TEST-STU-NEW', 'student_id')
  assertEq(data.is_admin, false, 'is_admin')
  return data
})

await test('student_register: duplicate id rejected', async () => {
  const { error } = await anon.rpc('student_register', { p_student_id: 'TEST-STU-NEW', p_name: 'x', p_birth_date: '2000-01-01' })
  assertTrue(!!error, '중복 등록이 차단되지 않음')
})

await test('student_admin_login: wrong password before any password set', async () => {
  const { data, error } = await anon.rpc('student_admin_login', { p_student_id: 'TEST-STU-0002', p_name: 'TEST Student Two', p_birth_date: '2001-02-02', p_password: 'whatever' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'wrong_password', 'password_hash가 null인 상태에서도 안전하게 거부')
})

await test('student_admin_upgrade: wrong pin rejected', async () => {
  const { error } = await anon.rpc('student_admin_upgrade', { p_student_id: 'TEST-STU-0002', p_pin: 'WRONG-PIN' })
  assertTrue(!!error, '틀린 PIN이 차단되지 않음')
})

await test('student_admin_upgrade: correct pin promotes + sets password', async () => {
  const { data, error } = await anon.rpc('student_admin_upgrade', { p_student_id: 'TEST-STU-0002', p_pin: 'TEST-ADMIN-PIN-0001' })
  if (error) throw new Error(error.message)
  assertEq(data.is_admin, true, 'is_admin true')
  return data
})

await test('student_admin_login: now works with the PIN as password', async () => {
  const { data, error } = await anon.rpc('student_admin_login', { p_student_id: 'TEST-STU-0002', p_name: 'TEST Student Two', p_birth_date: '2001-02-02', p_password: 'TEST-ADMIN-PIN-0001' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'ok', 'status')
  assertEq(data.is_admin, true, 'is_admin')
})

await test('student_admin_login: wrong password still rejected after upgrade', async () => {
  const { data, error } = await anon.rpc('student_admin_login', { p_student_id: 'TEST-STU-0002', p_name: 'TEST Student Two', p_birth_date: '2001-02-02', p_password: 'totally-wrong' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'wrong_password', 'status')
})

await test('student_session_refresh: reflects current is_admin', async () => {
  const { data, error } = await anon.rpc('student_session_refresh', { p_student_id: 'TEST-STU-0002' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'ok', 'status')
  assertEq(data.is_admin, true, 'is_admin')
})

await test('admin_password_change: wrong current rejected', async () => {
  const { error } = await anon.rpc('admin_password_change', { p_current: 'WRONG', p_new: 'TEST-ADMIN-PIN-0002' })
  assertTrue(!!error, '틀린 현재값이 차단되지 않음')
})

await test('admin_password_change: correct current changes it, old pin then invalid', async () => {
  const { error } = await anon.rpc('admin_password_change', { p_current: 'TEST-ADMIN-PIN-0001', p_new: 'TEST-ADMIN-PIN-0002' })
  if (error) throw new Error(error.message)
  const { error: upgradeErr } = await anon.rpc('student_admin_upgrade', { p_student_id: 'TEST-STU-0001', p_pin: 'TEST-ADMIN-PIN-0001' })
  assertTrue(!!upgradeErr, '변경 전 PIN이 여전히 통하면 안 됨')
  const { data, error: upgrade2Err } = await anon.rpc('student_admin_upgrade', { p_student_id: 'TEST-STU-0001', p_pin: 'TEST-ADMIN-PIN-0002' })
  if (upgrade2Err) throw new Error(upgrade2Err.message)
  assertEq(data.is_admin, true, '새 PIN으로는 정상 동작')
})

console.log('\n=== RESULT SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => r.status === 'FAIL')
console.log(`\nTOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length > 0) process.exitCode = 1
