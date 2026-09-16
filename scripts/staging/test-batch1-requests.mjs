// STAGING TEST ONLY — Phase S-RLS3 Domain Batch 1: reagent_change_request_submit,
// location_request_submit. Verifies functional behavior + that client-supplied identity
// cannot override the session-derived actor.
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
const REAGENT_ID = '40000000-0000-0000-0000-000000000001'

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

async function login(studentId, name, birthDate) {
  const { data, error } = await anon.rpc('student_check_login', { p_student_id: studentId, p_name: name, p_birth_date: birthDate })
  if (error) throw new Error(error.message)
  assertEq(data.status, 'ok', `login(${studentId})`)
  return data.session_token
}

let tokenA, tokenB

await test('setup: login as TEST-STU-0001 and TEST-STU-0002', async () => {
  tokenA = await login('TEST-STU-0001', 'TEST Student One', '2000-01-01')
  tokenB = await login('TEST-STU-0002', 'TEST Student Two', '2001-02-02')
})

await test('reagent_change_request_submit: normal submission records real actor', async () => {
  const { data, error } = await anon.rpc('reagent_change_request_submit', {
    p_session_token: tokenA, p_reagent_id: REAGENT_ID, p_field_name: 'purity', p_old_value: '95%', p_new_value: '99%',
  })
  if (error) throw new Error(error.message)
  assertEq(data.requested_by_student_id, 'TEST-STU-0001', 'requested_by_student_id')
  assertEq(data.requested_by, 'TEST Student One', 'requested_by')
  return data
})

await test('reagent_change_request_submit: unknown reagent rejected', async () => {
  const { error } = await anon.rpc('reagent_change_request_submit', {
    p_session_token: tokenA, p_reagent_id: '00000000-0000-0000-0000-000000000000', p_field_name: 'purity', p_old_value: 'x', p_new_value: 'y',
  })
  assertTrue(!!error, '존재하지 않는 reagent_id가 차단되지 않음')
})

await test('reagent_change_request_submit: no token rejected', async () => {
  const { error } = await anon.rpc('reagent_change_request_submit', {
    p_session_token: 'bogus-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', p_reagent_id: REAGENT_ID, p_field_name: 'purity', p_old_value: 'x', p_new_value: 'y',
  })
  assertTrue(!!error, '유효하지 않은 토큰인데 통과됨')
})

await test('location_request_submit: normal submission records real actor name (no student_id column on this table)', async () => {
  const { data, error } = await anon.rpc('location_request_submit', {
    p_session_token: tokenB, p_reagent_id: REAGENT_ID, p_lot_id: null, p_reagent_name: 'TEST Batch1 Reagent',
    p_from_location_id: null, p_from_location_name: '미지정', p_to_location_id: '10000000-0000-0000-0000-000000000001',
    p_to_location_name: 'TEST-ROOM-A', p_notes: 'test move',
  })
  if (error) throw new Error(error.message)
  assertEq(data.requested_by, 'TEST Student Two', 'requested_by')
  return data
})

await test('location_request_submit: missing target location rejected', async () => {
  const { error } = await anon.rpc('location_request_submit', {
    p_session_token: tokenA, p_reagent_id: REAGENT_ID, p_lot_id: null, p_reagent_name: 'x',
    p_from_location_id: null, p_from_location_name: null, p_to_location_id: null, p_to_location_name: null, p_notes: null,
  })
  assertTrue(!!error, '목적지 위치 없는 요청이 차단되지 않음')
})

// ── identity spoofing: RPC 시그니처 자체가 student_id/name 파라미터를 안 받는다 --
// client가 이걸 "속일" 방법 자체가 없다(파라미터가 없으므로). 그 사실을 실측으로 재확인:
// 서로 다른 토큰으로 호출하면 반드시 그 토큰 소유자로 기록됨.
await test('identity spoof check: same call shape, different token -> different recorded actor', async () => {
  const { data: rA, error: eA } = await anon.rpc('reagent_change_request_submit', {
    p_session_token: tokenA, p_reagent_id: REAGENT_ID, p_field_name: 'company', p_old_value: 'X', p_new_value: 'Y',
  })
  if (eA) throw new Error(eA.message)
  const { data: rB, error: eB } = await anon.rpc('reagent_change_request_submit', {
    p_session_token: tokenB, p_reagent_id: REAGENT_ID, p_field_name: 'company', p_old_value: 'X', p_new_value: 'Z',
  })
  if (eB) throw new Error(eB.message)
  assertEq(rA.requested_by_student_id, 'TEST-STU-0001', 'A actor')
  assertEq(rB.requested_by_student_id, 'TEST-STU-0002', 'B actor')
  assertTrue(rA.requested_by_student_id !== rB.requested_by_student_id, '토큰이 다르면 actor도 반드시 달라야 함')
})

await test('§14 lock: direct INSERT on reagent_change_requests now blocked', async () => {
  const { error } = await anon.from('reagent_change_requests').insert({
    reagent_id: REAGENT_ID, field_name: 'x', new_value: 'y', requested_by: 'DIRECT-INSERT-TEST',
  })
  assertTrue(!!error, 'direct INSERT가 차단되지 않음(RLS lock 실패)')
})

await test('§14 lock: direct INSERT on location_requests now blocked', async () => {
  const { error } = await anon.from('location_requests').insert({
    reagent_id: REAGENT_ID, to_location_id: '10000000-0000-0000-0000-000000000001', requested_by: 'DIRECT-INSERT-TEST',
  })
  assertTrue(!!error, 'direct INSERT가 차단되지 않음(RLS lock 실패)')
})

await test('§15 SELECT still open (admin pending-list read unaffected)', async () => {
  const { data, error } = await anon.from('reagent_change_requests').select('id').limit(1)
  if (error) throw new Error(`SELECT가 막히면 안 됨: ${error.message}`)
  return { rows: data.length }
})

await test('§15 UPDATE still open (admin approve/reject flow unaffected, out of this batch scope)', async () => {
  const { data: rows } = await anon.from('reagent_change_requests').select('id').limit(1)
  if (!rows?.length) return { skipped: 'no row to test with' }
  const { error } = await anon.from('reagent_change_requests').update({ status: 'approved' }).eq('id', rows[0].id)
  if (error) throw new Error(`UPDATE가 막히면 안 됨(admin 승인 흐름 회귀): ${error.message}`)
})

await test('RPC still works after the lock (only path left)', async () => {
  const { data: rows } = await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' })
  const { data, error } = await anon.rpc('reagent_change_request_submit', {
    p_session_token: rows.session_token, p_reagent_id: REAGENT_ID, p_field_name: 'unit', p_old_value: 'mL', p_new_value: 'L',
  })
  if (error) throw new Error(`lock 이후에도 RPC 경로는 계속 동작해야 함: ${error.message}`)
  assertEq(data.requested_by_student_id, 'TEST-STU-0001', 'requested_by_student_id')
})

console.log('\n=== RESULT SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => r.status === 'FAIL')
console.log(`\nTOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length > 0) process.exitCode = 1
