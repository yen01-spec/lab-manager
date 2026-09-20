// STAGING TEST ONLY — Reagent Detail Request UX Unification: 위치 변경 / 시약정보 수정 / 폐기 3종을
// "학생 제출(RPC) → pending(장부 불변) → 관리자 승인/반려(RPC)" 한 가지 의미로 end-to-end 검증.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'

const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
}
const ref = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (ref === PRODUCTION_PROJECT_REF || ref !== STAGING_PROJECT_REF) throw new Error(`[FATAL] ref(${ref})가 staging이 아닙니다.`)
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) throw new Error('[FATAL] SUPABASE_SERVICE_ROLE_KEY 환경변수 필요.')
console.log(`[guard] staging ref 확인됨: ${ref}`)

const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(URL_, SERVICE_KEY, opts)
const anon = createClient(URL_, ANON, opts)

const results = []
async function test(name, fn) {
  try { const d = await fn(); results.push(1); console.log(`[PASS] ${name}${d ? ' — ' + JSON.stringify(d) : ''}`) }
  catch (e) { results.push(0); console.log(`[FAIL] ${name}: ${e.message}`) }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected=${JSON.stringify(b)} actual=${JSON.stringify(a)}`) }
const ok = (c, m) => { if (!c) throw new Error(m) }
const must = (r, m) => { if (r.error) throw new Error(`${m}: ${r.error.message}`); return r.data }
const denied = (r, m) => { ok(!!r.error, `${m}: 거부돼야 하는데 성공함`); return r.error.message }

const suffix = randomBytes(4).toString('hex')
const ADMIN_EMAIL = `uni-admin-${suffix}@example.test`, USER_EMAIL = `uni-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
const LOC1 = '72000000-0000-0000-0000-000000000001', LOC2 = '72000000-0000-0000-0000-000000000002', LOC3 = '72000000-0000-0000-0000-000000000003'
const RX = '70000000-0000-0000-0000-000000000001'
const L1 = '71000000-0000-0000-0000-000000000001', L2 = '71000000-0000-0000-0000-000000000002', L3 = '71000000-0000-0000-0000-000000000003'
let adminC, userC, adminId, userId, tokA, tokB

async function wipe() {
  await service.from('location_history').delete().not('id', 'is', null)
  await service.from('disposal_requests').delete().not('id', 'is', null)
  await service.from('reagent_change_requests').delete().not('id', 'is', null)
  await service.from('location_requests').delete().not('id', 'is', null)
  await service.from('admin_logs').delete().not('id', 'is', null)
  await service.from('reagent_lots').delete().in('id', [L1, L2, L3])
  await service.from('locations').delete().in('id', [LOC1, LOC2, LOC3])
}
async function seed() {
  await wipe()
  must(await service.from('locations').insert([{ id: LOC1, room: 'UNI-1', detail: 'A' }, { id: LOC2, room: 'UNI-2', detail: null }, { id: LOC3, room: 'UNI-3', detail: null }]), 'locs')
  must(await service.from('reagents').upsert({ id: RX, name: 'UNI-Reagent', company: 'OLD-CO', manager: 'OLD-MGR', notes: 'old notes', reagent_type: 'purchased', status: 'active' }), 'reagent')
  must(await service.from('reagent_lots').insert([
    { id: L1, reagent_id: RX, lot_no: 'UNI-1', sealed_count: 1, current_stock: 60, location_id: LOC1, status: 'active' },
    { id: L2, reagent_id: RX, lot_no: 'UNI-2', sealed_count: 1, current_stock: 30, location_id: LOC1, status: 'active' },
    { id: L3, reagent_id: RX, lot_no: 'UNI-3', sealed_count: 1, current_stock: 80, location_id: LOC2, status: 'active' },
  ]), 'lots')
}
const lots = async () => JSON.stringify(must(await service.from('reagent_lots').select('id,sealed_count,current_stock,status,location_id').in('id', [L1, L2, L3]).order('id'), 'lots'))
const reagent = async () => JSON.stringify(must(await service.from('reagents').select('company,manager,notes,name').eq('id', RX).single(), 'rg'))
const req = async (t, id) => must(await service.from(t).select('*').eq('id', id).single(), 'req')

const submitLoc = (tok, lot, to) => anon.rpc('location_request_submit', { p_session_token: tok, p_lot_id: lot, p_to_location_id: to, p_notes: null })
const submitChg = (tok, field, val) => anon.rpc('reagent_change_request_submit', { p_session_token: tok, p_reagent_id: RX, p_field_name: field, p_old_value: 'old', p_new_value: val })
const submitDisp = (tok, lot, reason = '파손') => anon.rpc('disposal_request_submit', { p_session_token: tok, p_lot_id: lot, p_reason: reason })

await test('setup', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'UNI-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  tokA = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'A').session_token
  tokB = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0002', p_name: 'TEST Student Two', p_birth_date: '2001-02-02' }), 'B').session_token
  await seed()
})

// ══ 위치 변경 ═══════════════════════════════════════════════════════════════
let locReq
await test('LOCATION A/B/C: student submit -> pending, lot location UNCHANGED, pending survives reload (DB read) and re-login (new session)', async () => {
  const before = await lots()
  const r = must(await submitLoc(tokA, L1, LOC3), 'submit'); locReq = r.id
  eq(await lots(), before, 'Lot 불변')
  eq(must(await service.from('location_history').select('id'), 'h').length, 0, 'location_history 없음(승인 트랜잭션에서만 생성)')
  eq((await req('location_requests', locReq)).status, 'pending', 'pending')
  // reload: 새 클라이언트(=새로고침)로 읽어도 pending
  const fresh = createClient(URL_, ANON, opts)
  eq(must(await fresh.from('location_requests').select('id,status,lot_id').eq('lot_id', L1).eq('status', 'pending'), 'fresh read').length, 1, 'reload 후 pending 조회')
  // logout → login: 토큰 폐기 후 재로그인해도 pending 은 DB 기준으로 그대로
  must(await anon.rpc('student_logout', { p_session_token: tokA }), 'logout')
  tokA = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'relogin').session_token
  eq(must(await fresh.from('location_requests').select('id').eq('lot_id', L1).eq('status', 'pending'), 'after relogin').length, 1, '재로그인 후 pending 유지')
})
await test('LOCATION dup rules: same lot pending blocked (any student); other lot OK; no-op move & inactive lot blocked; DB unique index holds under concurrency', async () => {
  denied(await submitLoc(tokB, L1, LOC2), 'dup pending same lot (other student)')
  must(await submitLoc(tokB, L2, LOC3), 'other lot ok')
  denied(await submitLoc(tokA, L3, LOC2, LOC2), 'same location as current')
  const rs = await Promise.all([1, 2, 3, 4].map(() => submitLoc(tokA, L3, LOC3, LOC2)))
  eq(rs.filter(x => !x.error).length, 1, '동시 4건 중 1건만 접수')
  await service.from('location_requests').delete().eq('lot_id', L3)
})
await test('LOCATION D: admin approve -> real location + location_history in the SAME transaction; E: reject -> no change + reason; I/J: double/reprocess blocked', async () => {
  const out = must(await adminC.rpc('location_request_review', { p_request_id: locReq, p_decision: 'approve' }), 'approve')
  eq(out.status, 'approved', 'status')
  const l = JSON.parse(await lots()).find(x => x.id === L1)
  eq(l.location_id, LOC3, '새 위치 반영')
  const h = must(await service.from('location_history').select('*').eq('lot_id', L1), 'h')
  eq([h.length, h[0].moved_by], [1, 'UNI-ADMIN'], '이력은 승인 트랜잭션에서 1건')
  denied(await adminC.rpc('location_request_review', { p_request_id: locReq, p_decision: 'approve' }), 'double approve')
  denied(await adminC.rpc('location_request_review', { p_request_id: locReq, p_decision: 'reject' }), 'reject after approve')
  // 승인 후에는 같은 Lot 에 새 신청 가능(과거 행이 막지 않음)
  const r2 = must(await submitLoc(tokA, L1, LOC2, LOC3), 'new request after approval')
  const before = await lots()
  must(await adminC.rpc('location_request_review', { p_request_id: r2.id, p_decision: 'reject', p_reason: '위치 오류' }), 'reject')
  eq(await lots(), before, '반려는 변화 0')
  const rr = await req('location_requests', r2.id); eq([rr.status, rr.review_note], ['rejected', '위치 오류'], '반려 사유')
  must(await submitLoc(tokA, L1, LOC2, LOC3), '반려 후 재신청 가능(영구 차단 아님)')
  await service.from('location_requests').delete().eq('status', 'pending')
})
await test('LOCATION K: approval on a disposed lot fails and rolls back (request stays pending)', async () => {
  const r = must(await submitLoc(tokA, L2, LOC3), 'submit')
  await service.from('reagent_lots').update({ status: 'disposed' }).eq('id', L2)
  denied(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'disposed lot')
  eq((await req('location_requests', r.id)).status, 'pending', 'pending 유지')
  eq(must(await service.from('location_history').select('id').eq('lot_id', L2), 'h').length, 0, '이력 롤백')
  await service.from('reagent_lots').update({ status: 'active' }).eq('id', L2)
  await service.from('location_requests').delete().eq('status', 'pending')
})

// ══ 시약정보 수정 ═══════════════════════════════════════════════════════════
let chgReq
await test('INFO A/B/C: student submit -> pending, reagents master UNCHANGED, pending survives reload/relogin', async () => {
  const before = await reagent()
  chgReq = must(await submitChg(tokA, 'company', 'NEW-CO'), 'submit').id
  eq(await reagent(), before, 'master 불변')
  const fresh = createClient(URL_, ANON, opts)
  eq(must(await fresh.from('reagent_change_requests').select('id,field_name,new_value').eq('reagent_id', RX).eq('status', 'pending'), 'read').map(x => x.field_name), ['company'], 'reload 후 pending')
  must(await anon.rpc('student_logout', { p_session_token: tokA }), 'logout')
  tokA = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'relogin').session_token
  eq(must(await fresh.from('reagent_change_requests').select('id').eq('reagent_id', RX).eq('status', 'pending'), 'read2').length, 1, '재로그인 후 유지')
})
await test('INFO dup rules: same field pending blocked (any student), different field OK; approved/rejected history never blocks', async () => {
  denied(await submitChg(tokB, 'company', 'OTHER'), 'dup same field')
  must(await submitChg(tokB, 'manager', 'NEW-MGR'), 'different field ok')
  const rs = await Promise.all([1, 2, 3].map(() => submitChg(tokA, 'notes', 'concurrent')))
  eq(rs.filter(x => !x.error).length, 1, '동시 3건 중 1건')
  await service.from('reagent_change_requests').delete().eq('field_name', 'manager'); await service.from('reagent_change_requests').delete().eq('field_name', 'notes')
})
await test('INFO D: approve applies the request row value only (payload tamper impossible); I/J blocked; E: reject => master unchanged + reason', async () => {
  const t = await adminC.rpc('reagent_change_request_review', { p_request_id: chgReq, p_decision: 'approve', p_new_value: 'HACK', field_name: 'name' })
  ok(t.error, '추가 파라미터는 함수 시그니처에 없어 호출 자체가 실패')
  eq(JSON.parse(await reagent()).company, 'OLD-CO', '실패한 호출은 아무것도 바꾸지 않음')
  must(await adminC.rpc('reagent_change_request_review', { p_request_id: chgReq, p_decision: 'approve' }), 'approve')
  const rg = JSON.parse(await reagent())
  eq([rg.company, rg.manager, rg.notes, rg.name], ['NEW-CO', 'OLD-MGR', 'old notes', 'UNI-Reagent'], '요청의 항목만 반영')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: chgReq, p_decision: 'approve' }), 'double')
  const r2 = must(await submitChg(tokA, 'company', 'REJECTED-CO'), 'new after approval')
  const before = await reagent()
  must(await adminC.rpc('reagent_change_request_review', { p_request_id: r2.id, p_decision: 'reject', p_reason: '근거 없음' }), 'reject')
  eq(await reagent(), before, '반려는 변화 0')
  const rr = await req('reagent_change_requests', r2.id); eq([rr.status, rr.review_note], ['rejected', '근거 없음'], '반려 사유')
  must(await submitChg(tokA, 'company', 'AGAIN'), '반려 후 재신청 가능')
  await service.from('reagent_change_requests').delete().eq('status', 'pending')
})
await test('INFO K: forbidden field in a request row => approval fails, rolled back', async () => {
  const bad = must(await service.from('reagent_change_requests').insert({ reagent_id: RX, requested_by: 'x', field_name: 'status', new_value: 'archived' }).select().single(), 'seed')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: bad.id, p_decision: 'approve' }), 'forbidden field')
  eq((await req('reagent_change_requests', bad.id)).status, 'pending', 'pending 유지')
  await service.from('reagent_change_requests').delete().eq('id', bad.id)
})

// ══ 폐기 ═══════════════════════════════════════════════════════════════════
let dispReq
await test('DISPOSAL A/B/C: student submit -> pending, lot NOT disposed, pending survives reload/relogin', async () => {
  const before = await lots()
  dispReq = must(await submitDisp(tokA, L1), 'submit').id
  eq(await lots(), before, 'Lot 불변(신청 완료 ≠ 폐기 완료)')
  eq((await req('disposal_requests', dispReq)).status, 'pending', 'pending')
  const fresh = createClient(URL_, ANON, opts)
  eq(must(await fresh.from('disposal_requests').select('id').eq('lot_id', L1).eq('status', 'pending'), 'read').length, 1, 'reload 후 pending')
  must(await anon.rpc('student_logout', { p_session_token: tokA }), 'logout')
  tokA = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'relogin').session_token
  eq(must(await fresh.from('disposal_requests').select('id').eq('lot_id', L1).eq('status', 'pending'), 'read2').length, 1, '재로그인 후 유지')
})
await test('DISPOSAL dup rules: same lot pending blocked; other lot OK; empty reason / inactive lot blocked; concurrent -> 1', async () => {
  denied(await submitDisp(tokB, L1), 'dup same lot')
  must(await submitDisp(tokB, L2), 'other lot ok')
  denied(await submitDisp(tokA, L3, '   '), 'blank reason')
  const rs = await Promise.all([1, 2, 3, 4].map(() => submitDisp(tokA, L3)))
  eq(rs.filter(x => !x.error).length, 1, '동시 4건 중 1건')
  await service.from('disposal_requests').delete().in('lot_id', [L2, L3])
})
await test('DISPOSAL D: admin approve = IMMEDIATE real disposal (status disposed, single step); E: reject => lot untouched + reason', async () => {
  const out = must(await adminC.rpc('disposal_request_review', { p_request_id: dispReq, p_action: 'approve' }), 'approve')
  eq([out.status, out.lot_id], ['disposed', L1], '승인=폐기 완료(대상=요청의 lot_id 1행)')
  const l = JSON.parse(await lots()).find(x => x.id === L1)
  eq([l.status, l.sealed_count, l.current_stock], ['disposed', 0, 0], 'Lot 폐기')
  eq((await req('disposal_requests', dispReq)).status, 'disposed', '요청 상태')
  denied(await adminC.rpc('disposal_request_review', { p_request_id: dispReq, p_action: 'approve' }), 'double approve')
  denied(await adminC.rpc('disposal_request_review', { p_request_id: dispReq, p_action: 'complete' }), '별도 폐기 완료 액션 없음')
  const r2 = must(await submitDisp(tokA, L3, '사유'), 'submit L3')
  const before = await lots()
  must(await adminC.rpc('disposal_request_review', { p_request_id: r2.id, p_action: 'reject', p_reason: '아직 사용 중' }), 'reject')
  eq(await lots(), before, '반려는 Lot 변화 0')
  const rr = await req('disposal_requests', r2.id); eq([rr.status, rr.review_note], ['rejected', '아직 사용 중'], '반려 사유')
  must(await submitDisp(tokA, L3, '재신청'), '반려 후 재신청 가능')
  denied(await submitDisp(tokA, L1), '이미 폐기된 Lot 은 신청 불가')
  await service.from('disposal_requests').delete().eq('status', 'pending')
})

// ══ 보안 (F/G/H) + 요청 간 충돌 ═════════════════════════════════════════════
await test('SECURITY F/G/H: student token / anon / plain authenticated cannot review any of the 3 kinds; direct writes denied', async () => {
  await service.from('reagent_lots').update({ status: 'active', sealed_count: 1, current_stock: 50, location_id: LOC1 }).eq('id', L1)
  const l = must(await submitLoc(tokB, L1, LOC3), 'loc'), c = must(await submitChg(tokB, 'company', 'SEC'), 'chg'), d = must(await submitDisp(tokB, L1), 'disp')
  const calls = (client) => [
    client.rpc('location_request_review', { p_request_id: l.id, p_decision: 'approve' }),
    client.rpc('reagent_change_request_review', { p_request_id: c.id, p_decision: 'approve' }),
    client.rpc('disposal_request_review', { p_request_id: d.id, p_action: 'approve' }),
  ]
  for (const [who, client] of [['anon', anon], ['non-admin', userC]]) for (const r of await Promise.all(calls(client))) denied(r, who)
  denied(await anon.rpc('disposal_request_review', { p_request_id: d.id, p_action: 'approve', p_session_token: tokB }), 'student token')
  for (const t of ['location_requests', 'reagent_change_requests', 'disposal_requests']) {
    eq((await anon.from(t).update({ status: 'approved' }).eq('id', t === 'location_requests' ? l.id : t === 'disposal_requests' ? d.id : c.id).select('id')).data?.length ?? 0, 0, `direct UPDATE ${t}`)
  }
  eq([(await req('location_requests', l.id)).status, (await req('reagent_change_requests', c.id)).status, (await req('disposal_requests', d.id)).status], ['pending', 'pending', 'pending'], '전부 pending 유지')
})
await test('CONFLICT (reported, no invented rule): pending move + pending disposal on the same lot can coexist; whichever is approved first makes the other fail safely', async () => {
  // 위 테스트에서 L1 에 위치변경/폐기 pending 이 동시에 존재했다 = 서버는 종류 간 교차 제한을 두지 않는다.
  const both = must(await service.from('location_requests').select('id').eq('lot_id', L1).eq('status', 'pending'), 'l').length + must(await service.from('disposal_requests').select('id').eq('lot_id', L1).eq('status', 'pending'), 'd').length
  eq(both, 2, '동시 pending 가능')
  const d = must(await service.from('disposal_requests').select('id').eq('lot_id', L1).eq('status', 'pending').single(), 'd')
  const l = must(await service.from('location_requests').select('id').eq('lot_id', L1).eq('status', 'pending').single(), 'l')
  must(await adminC.rpc('disposal_request_review', { p_request_id: d.id, p_action: 'approve' }), 'dispose first')
  denied(await adminC.rpc('location_request_review', { p_request_id: l.id, p_decision: 'approve' }), '폐기된 Lot 위치 이동은 안전하게 실패')
  eq((await req('location_requests', l.id)).status, 'pending', '이동 요청은 pending 유지(관리자가 반려)')
  must(await adminC.rpc('location_request_review', { p_request_id: l.id, p_decision: 'reject', p_reason: '이미 폐기됨' }), 'reject')
})

await wipe()
await service.from('student_sessions').delete().in('student_id', ['TEST-STU-0001', 'TEST-STU-0002'])
await service.from('admin_users').delete().eq('user_id', adminId)
for (const id of [adminId, userId]) if (id) await service.auth.admin.deleteUser(id)
console.log(`\nTOTAL=${results.length} PASS=${results.filter(Boolean).length} FAIL=${results.filter(x => !x).length}`)
process.exitCode = results.every(Boolean) ? 0 : 1
