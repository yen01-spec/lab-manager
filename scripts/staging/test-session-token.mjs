// STAGING TEST ONLY — verifies the opaque session-token infra (20260916100000) and the
// disposal_request_submit proof-of-concept RPC actually resolve identity server-side,
// ignoring anything the client claims.
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

let tokenA, tokenB

await test('student_check_login issues a session_token', async () => {
  const { data, error } = await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'ok', 'status')
  assertTrue(typeof data.session_token === 'string' && data.session_token.length >= 32, 'session_token이 충분히 긴 랜덤 문자열이어야 함')
  tokenA = data.session_token
  return { tokenLength: data.session_token.length }
})

await test('a second login for a different student issues a different token', async () => {
  const { data, error } = await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0002', p_name: 'TEST Student Two', p_birth_date: '2001-02-02' })
  if (error) throw new Error(error.message)
  tokenB = data.session_token
  assertTrue(tokenB !== tokenA, '토큰이 서로 달라야 함')
})

await test('student_session_refresh works with a valid token', async () => {
  const { data, error } = await anon.rpc('student_session_refresh', { p_session_token: tokenA })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'ok', 'status')
  assertEq(data.student_id, 'TEST-STU-0001', 'student_id')
})

await test('student_session_refresh rejects a garbage token', async () => {
  const { data, error } = await anon.rpc('student_session_refresh', { p_session_token: 'not-a-real-token' })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'invalid_session', 'status')
})

await test('student_session_refresh rejects null token', async () => {
  const { data, error } = await anon.rpc('student_session_refresh', { p_session_token: null })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'invalid_session', 'status')
})

await test('disposal_request_submit: rejects request with no token', async () => {
  const { error } = await anon.rpc('disposal_request_submit', {
    p_session_token: 'bogus-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', p_lot_id: '40000000-0000-0000-0000-0000000000a1', p_reason: 'test',
  })
  assertTrue(!!error, '유효하지 않은 토큰인데 요청이 통과됨')
})

await test('disposal_request_submit: identity comes from token, NOT from any client-supplied field', async () => {
  // 이 RPC 시그니처 자체가 student_id를 파라미터로 안 받는다 -- 그게 핵심 방어.
  // tokenA(TEST-STU-0001)로 호출하면 반드시 TEST-STU-0001 이름으로 기록되어야 한다.
  const { data, error } = await anon.rpc('disposal_request_submit', {
    p_session_token: tokenA, p_lot_id: '40000000-0000-0000-0000-0000000000a1', p_reason: 'test disposal',
  })
  if (error) throw new Error(error.message)
  assertEq(data.requested_by_student_id, 'TEST-STU-0001', 'requested_by_student_id가 토큰 소유자와 일치해야 함')
  assertEq(data.requested_by, 'TEST Student One', 'requested_by 이름도 서버가 조회한 값이어야 함')
  return data
})

await test('disposal_request_submit: empty reason rejected', async () => {
  const { error } = await anon.rpc('disposal_request_submit', {
    p_session_token: tokenA, p_lot_id: '40000000-0000-0000-0000-0000000000a1', p_reason: '   ',
  })
  assertTrue(!!error, '빈 사유가 차단되지 않음')
})

await test('student_logout revokes the token', async () => {
  const { error } = await anon.rpc('student_logout', { p_session_token: tokenB })
  if (error) throw new Error(error.message)
  const { data } = await anon.rpc('student_session_refresh', { p_session_token: tokenB })
  assertEq(data.status, 'invalid_session', '로그아웃 후 토큰이 무효화되어야 함')
})

await test('logged-out token cannot submit a disposal request', async () => {
  const { error } = await anon.rpc('disposal_request_submit', {
    p_session_token: tokenB, p_lot_id: '40000000-0000-0000-0000-0000000000a1', p_reason: 'test',
  })
  assertTrue(!!error, '로그아웃된 토큰으로 제출이 통과됨')
})

await test('anon cannot read student_sessions table directly', async () => {
  const { data, error } = await anon.from('student_sessions').select('*')
  if (error) return { errorMessage: error.message }
  assertEq(data.length, 0, 'student_sessions row가 조회되면 안 됨')
})

console.log('\n=== RESULT SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => r.status === 'FAIL')
console.log(`\nTOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length > 0) process.exitCode = 1
