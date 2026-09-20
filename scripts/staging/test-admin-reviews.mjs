// STAGING TEST ONLY — Master Finish Phase 1: 관리자 리뷰 RPC(request review + admin bulk) 검증.
// SUPABASE_SERVICE_ROLE_KEY는 커맨드라인 환경변수로만 전달(파일 저장 금지). staging ref만 허용.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'

function loadEnv() {
  const env = {}
  for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnv()
const ref = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]
if (ref === PRODUCTION_PROJECT_REF || ref !== STAGING_PROJECT_REF) throw new Error(`[FATAL] ref(${ref})가 staging이 아닙니다.`)
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) throw new Error('[FATAL] SUPABASE_SERVICE_ROLE_KEY 환경변수 필요(커맨드라인 전달 전용).')
console.log(`[guard] staging ref 확인됨: ${ref}`)

const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(URL_, SERVICE_KEY, opts)
const anon = createClient(URL_, ANON, opts)

const results = []
async function test(name, fn) {
  try { const d = await fn(); results.push({ name, ok: true }); console.log(`[PASS] ${name}${d ? ' — ' + JSON.stringify(d) : ''}`) }
  catch (e) { results.push({ name, ok: false }); console.log(`[FAIL] ${name}: ${e.message}`) }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected=${JSON.stringify(b)} actual=${JSON.stringify(a)}`) }
const ok = (c, m) => { if (!c) throw new Error(m) }
const must = (r, m) => { if (r.error) throw new Error(`${m}: ${r.error.message}`); return r.data }
const denied = (r, m) => { ok(!!r.error, `${m}: 거부돼야 하는데 성공함`); return r.error.message }

const RID = '40000000-0000-0000-0000-000000000001'
const L = { A: '41000000-0000-0000-0000-00000000000a', B: '41000000-0000-0000-0000-00000000000b', C: '41000000-0000-0000-0000-00000000000c', D: '41000000-0000-0000-0000-00000000000d', E: '41000000-0000-0000-0000-00000000000e' }
const LOC1 = '42000000-0000-0000-0000-000000000001', LOC2 = '42000000-0000-0000-0000-000000000002'
const suffix = randomBytes(4).toString('hex')
const ADMIN_EMAIL = `review-admin-${suffix}@example.test`, USER_EMAIL = `review-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')

let adminId, userId
async function reset() {
  await service.from('admin_logs').delete().like('action', '%').in('target_type', ['reagent', 'disposal'])
  await service.from('location_history').delete().not('id', 'is', null)
  await service.from('disposal_requests').delete().not('id', 'is', null)
  await service.from('reagent_change_requests').delete().not('id', 'is', null)
  await service.from('location_requests').delete().not('id', 'is', null)
  await service.from('reagent_lots').delete().in('id', Object.values(L))
  await service.from('locations').delete().in('id', [LOC1, LOC2])
  must(await service.from('locations').insert([{ id: LOC1, room: 'REV-ROOM-1', detail: 'shelf A' }, { id: LOC2, room: 'REV-ROOM-2', detail: null }]), 'loc insert')
  must(await service.from('reagents').upsert({ id: RID, name: 'TEST Batch1 Reagent', name_ko: 'TEST 배치1 시약', company: 'OLDCO', reagent_type: 'purchased', status: 'active', data_source: 'manual', last_confirmed_at: null }), 'reagent upsert')
  must(await service.from('reagent_lots').insert([
    { id: L.A, reagent_id: RID, lot_no: 'REV-A', sealed_count: 1, current_stock: 50, location_id: LOC1, status: 'active' },
    { id: L.B, reagent_id: RID, lot_no: 'REV-B', sealed_count: 1, current_stock: 0, location_id: LOC1, status: 'active' },
    { id: L.C, reagent_id: RID, lot_no: 'REV-C', sealed_count: 3, current_stock: 30, location_id: LOC1, status: 'active' },
    { id: L.D, reagent_id: RID, lot_no: 'REV-D', sealed_count: 1, current_stock: 10, location_id: LOC1, status: 'active' },
    { id: L.E, reagent_id: RID, lot_no: 'REV-E', sealed_count: 1, current_stock: 10, location_id: LOC1, status: 'active' },
  ]), 'lots insert')
}
const newChange = async (field, val, extra = {}) => (await service.from('reagent_change_requests').delete().eq('reagent_id', extra.reagent_id ?? RID).eq('field_name', field).eq('status', 'pending'), must(await service.from('reagent_change_requests').insert({ reagent_id: RID, requested_by: 'REQ', requested_by_student_id: 'TEST-STU-0001', field_name: field, old_value: 'x', new_value: val, ...extra }).select().single(), 'seed change'))
const newLoc = async (lotId, to, extra = {}) => (lotId && await service.from('location_requests').delete().eq('lot_id', lotId).eq('status', 'pending'), must(await service.from('location_requests').insert({ reagent_id: RID, lot_id: lotId, reagent_name: 'TEST Batch1 Reagent', from_location_id: LOC1, from_location_name: 'REV-ROOM-1 - shelf A', to_location_id: to, to_location_name: 'REV-ROOM-2', requested_by: 'REQ', ...extra }).select().single(), 'seed loc'))
const newDisp = async (lotId, qty, status = 'pending', extra = {}) => (status === 'pending' && await service.from('disposal_requests').delete().eq('lot_id', lotId).eq('status', 'pending'), must(await service.from('disposal_requests').insert({ reagent_id: RID, lot_id: lotId, reagent_name: 'TEST Batch1 Reagent', lot_no: 'x', quantity: qty, reason: 'why', requested_by: 'REQ', status, ...extra }).select().single(), 'seed disp'))
const lot = async (id) => must(await service.from('reagent_lots').select('*').eq('id', id).single(), 'lot')
const req = async (t, id) => must(await service.from(t).select('*').eq('id', id).single(), 'req')

// ── setup ────────────────────────────────────────────────────────────────
let adminC, userC
await test('setup: create staging admin + non-admin Auth users', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin user')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'plain user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'REV-TEST-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  await reset()
  const isA = must(await adminC.rpc('is_admin'), 'is_admin'); const isU = must(await userC.rpc('is_admin'), 'is_admin(user)')
  eq([isA, isU], [true, false], 'is_admin 판정')
})

const RPCS = [
  ['reagent_change_request_review', (id) => ({ p_request_id: id, p_decision: 'approve' })],
  ['location_request_review', (id) => ({ p_request_id: id, p_decision: 'approve' })],
  ['disposal_request_review', (id) => ({ p_request_id: id, p_action: 'approve' })],
]

// ── change request ───────────────────────────────────────────────────────
await test('change: admin approve applies field + request + audit (approver = server-derived)', async () => {
  const r = await newChange('company', 'NEWCO')
  const out = must(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'approve')
  eq(out.status, 'approved', 'status')
  const rr = await req('reagent_change_requests', r.id)
  eq([rr.status, rr.approved_by, rr.approved_by_student_id], ['approved', 'REV-TEST-ADMIN', null], '요청 행')
  ok(rr.approved_at, 'approved_at')
  const reagent = must(await service.from('reagents').select('company,last_confirmed_at').eq('id', RID).single(), 'reagent')
  eq(reagent.company, 'NEWCO', '시약 변경')
  ok(reagent.last_confirmed_at, 'last_confirmed_at 갱신')
  const logs = must(await service.from('admin_logs').select('*').eq('action', '시약정보 수정 승인'), 'logs')
  ok(logs.length >= 1 && logs[0].admin_name === 'REV-TEST-ADMIN', 'admin_logs 기록')
})
await test('change: admin reject leaves reagent untouched', async () => {
  const r = await newChange('company', 'SHOULD-NOT-APPLY')
  const out = must(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'reject', p_reason: 'nope' }), 'reject')
  eq(out.status, 'rejected', 'status')
  eq((await req('reagent_change_requests', r.id)).status, 'rejected', 'status row')
  eq(must(await service.from('reagents').select('company').eq('id', RID).single(), 'r').company, 'NEWCO', '시약 불변')
})
await test('change: invalid/forbidden field rejected + full rollback (request stays pending)', async () => {
  const r = await newChange('status', 'archived')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'status 필드')
  eq((await req('reagent_change_requests', r.id)).status, 'pending', '롤백 후 pending')
  const r2 = await newChange('no_such_column', 'v')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r2.id, p_decision: 'approve' }), '없는 컬럼')
  eq((await req('reagent_change_requests', r2.id)).status, 'pending', '롤백 후 pending')
  const r3 = await newChange('company', 'X', { reagent_id: '00000000-0000-0000-0000-000000000000' })
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r3.id, p_decision: 'approve' }), '없는 시약')
  eq((await req('reagent_change_requests', r3.id)).status, 'pending', '롤백 후 pending')
})
await test('change: double approval — 2nd blocked; reprocess of rejected blocked', async () => {
  const r = await newChange('manager', 'M1')
  must(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'approve' }), '1st')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'approve' }), '2nd')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'reject' }), 'reject after approve')
})
await test('change: concurrent review — exactly one succeeds', async () => {
  const r = await newChange('notes', 'CONC')
  const rs = await Promise.all([1, 2, 3, 4].map(() => adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'approve' })))
  const okN = rs.filter(x => !x.error).length
  eq(okN, 1, '성공 횟수')
  const logs = must(await service.from('admin_logs').select('id').eq('action', '시약정보 수정 승인').like('description', '%CONC%'), 'logs')
  eq(logs.length, 1, 'audit 1건')
})
await test('change: invalid request id / invalid decision', async () => {
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: '00000000-0000-0000-0000-000000000000', p_decision: 'approve' }), 'no such id')
  const r = await newChange('notes', 'z')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'delete' }), 'bad decision')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: null }), 'null decision')
})

// ── location request ─────────────────────────────────────────────────────
await test('location: approve with lot moves lot + history + audit', async () => {
  const r = await newLoc(L.A, LOC2)
  const out = must(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'approve')
  eq([out.status, out.lots_moved], ['approved', 1], 'out')
  eq((await lot(L.A)).location_id, LOC2, 'Lot 이동')
  const h = must(await service.from('location_history').select('*').eq('lot_id', L.A), 'history')
  eq([h.length, h[0].moved_by, h[0].to_location_id], [1, 'REV-TEST-ADMIN', LOC2], 'history')
  eq((await req('location_requests', r.id)).approved_by, 'REV-TEST-ADMIN', 'approved_by')
})
await test('location: approve without lot_id is rejected — never moves other bottles of the reagent', async () => {
  await service.from('reagent_lots').update({ location_id: LOC1, status: 'active' }).in('id', [L.A, L.B, L.C, L.D, L.E])
  const r = await newLoc(null, LOC2)
  const msg = denied(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'no lot_id')
  ok(msg.includes('병(Lot)'), '명확한 오류: ' + msg)
  eq((await req('location_requests', r.id)).status, 'pending', 'pending 유지')
  const moved = must(await service.from('reagent_lots').select('id').eq('location_id', LOC2).in('id', [L.A, L.B, L.C, L.D, L.E]), 'moved')
  eq(moved.length, 0, '어떤 병도 이동 안 됨')
})
await test('location: stale request (lot moved since request) fails with a clear error and changes nothing', async () => {
  await service.from('reagent_lots').update({ location_id: LOC1 }).eq('id', L.D)
  const r = await newLoc(L.D, LOC2)                                   // from = LOC1
  await service.from('reagent_lots').update({ location_id: LOC2 }).eq('id', L.D)   // 그 사이 다른 경로로 이동 → 이미 목적지
  const msg = denied(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'already there')
  ok(msg.includes('이미'), msg)
  await service.from('reagent_lots').update({ location_id: LOC1 }).eq('id', L.D)
  const r2 = await newLoc(L.D, LOC2)
  await service.from('location_requests').update({ from_location_id: LOC2 }).eq('id', r2.id) // 요청 시점 위치 전제가 현재(LOC1)와 다름
  const msg2 = denied(await adminC.rpc('location_request_review', { p_request_id: r2.id, p_decision: 'approve' }), 'stale from')
  ok(msg2.includes('위치가 이미 바뀌었습니다'), msg2)
  eq([(await req('location_requests', r2.id)).status, (await lot(L.D)).location_id], ['pending', LOC1], '롤백: pending 유지 + 위치 불변')
  await service.from('location_requests').delete().in('id', [r.id, r2.id])
})
await test('location: nonexistent target => error + rollback', async () => {
  const r = await newLoc(L.B, '00000000-0000-0000-0000-000000000000')
  denied(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'bad target')
  eq((await req('location_requests', r.id)).status, 'pending', 'pending 유지')
  eq((await lot(L.B)).location_id, LOC1, 'Lot 불변')
  const r2 = await newLoc('00000000-0000-0000-0000-0000000000ff', LOC2)
  denied(await adminC.rpc('location_request_review', { p_request_id: r2.id, p_decision: 'approve' }), 'missing lot')
  eq((await req('location_requests', r2.id)).status, 'pending', 'pending 유지')
})
await test('location: reject + double review blocked', async () => {
  const r = await newLoc(L.B, LOC2)
  must(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'reject' }), 'reject')
  eq((await lot(L.B)).location_id, LOC1, 'Lot 불변')
  denied(await adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' }), 'approve after reject')
})
await test('location: concurrent approve — exactly one succeeds, one history row', async () => {
  await service.from('location_history').delete().eq('lot_id', L.C)
  await service.from('reagent_lots').update({ location_id: LOC1 }).eq('id', L.C)
  const r = await newLoc(L.C, LOC2)
  const rs = await Promise.all([1, 2, 3].map(() => adminC.rpc('location_request_review', { p_request_id: r.id, p_decision: 'approve' })))
  eq(rs.filter(x => !x.error).length, 1, '성공 횟수')
  eq(must(await service.from('location_history').select('id').eq('lot_id', L.C), 'h').length, 1, 'history 1건')
})

// ── disposal request ─────────────────────────────────────────────────────
// 업무 규칙: 관리자 "승인" = 즉시 실제 폐기 완료(2단계 없음). 반려 = 실제 변화 0.
await test('disposal: approve = IMMEDIATE real disposal (full lot), single step', async () => {
  const r = await newDisp(L.A, null)
  const out = must(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'approve' }), 'approve')
  eq([out.status, out.lot_id], ['disposed', L.A], '승인 결과(대상 = 요청의 lot_id 1행)')
  const l = await lot(L.A)
  eq([l.status, l.sealed_count, l.current_stock], ['disposed', 0, 0], 'Lot 폐기')
  ok(l.disposal_date, 'disposal_date')
  const rr = await req('disposal_requests', r.id)
  eq([rr.status, rr.approved_by], ['disposed', 'REV-TEST-ADMIN'], '요청 행'); ok(rr.disposed_at && rr.approved_at, 'timestamps')
  denied(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'complete' }), '2차 complete 액션은 더 이상 없음')
})
await test('disposal: bottle rule — one request disposes exactly that lot row; grouped row (sealed>1) is refused', async () => {
  const r = await newDisp(L.C, null)                      // C: sealed 3 (여러 병이 한 행에 묶인 비정상 행)
  const msg = denied(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'approve' }), 'grouped row')
  ok(msg.includes('병 1개 단위'), msg)
  let l = await lot(L.C)
  eq([l.sealed_count, l.status], [3, 'active'], '묶음 행은 어떤 변경도 없음(롤백)')
  eq((await req('disposal_requests', r.id)).status, 'pending', 'pending 유지')
  const r2 = await newDisp(L.B, null)                     // B: sealed 1, stock 0
  must(await adminC.rpc('disposal_request_review', { p_request_id: r2.id, p_action: 'approve' }), 'single')
  l = await lot(L.B); eq([l.sealed_count, l.current_stock, l.status], [0, 0, 'disposed'], '병 1개 폐기')
  eq((await lot(L.C)).status, 'active', '다른 병 불변')
  await service.from('reagent_lots').update({ status: 'active', sealed_count: 0, current_stock: 55 }).eq('id', L.D)
  const r3 = await newDisp(L.D, null)                     // D: 개봉병(stock 55)
  must(await adminC.rpc('disposal_request_review', { p_request_id: r3.id, p_action: 'approve' }), 'opened')
  eq((await lot(L.D)).status, 'disposed', '개봉병도 승인 시 폐기 완료')
})
await test('disposal: reject = zero change to lot; reprocess / legacy action names blocked', async () => {
  await service.from('reagent_lots').update({ status: 'active', sealed_count: 2, current_stock: 40 }).eq('id', L.E)
  const r = await newDisp(L.E, '1')
  must(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'reject', p_reason: '사유 확인 필요' }), 'reject')
  const l = await lot(L.E)
  eq([l.status, l.sealed_count, l.current_stock], ['active', 2, 40], 'Lot 불변')
  const rr = await req('disposal_requests', r.id)
  eq([rr.status, rr.review_note], ['rejected', '사유 확인 필요'], '반려 + 사유 저장')
  denied(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'approve' }), 'approve after reject')
  for (const legacy of ['complete', 'approve_and_zero_lot', 'dispose_lot']) {
    const r2 = await newDisp(L.E, '1')
    denied(await adminC.rpc('disposal_request_review', { p_request_id: r2.id, p_action: legacy }), `legacy ${legacy}`)
    eq((await req('disposal_requests', r2.id)).status, 'pending', 'pending 유지')
    await service.from('disposal_requests').delete().eq('id', r2.id)
  }
})
await test('disposal: already-disposed lot => error + rollback; legacy approved row is finished by one approve; missing lot rolls back', async () => {
  const r = await newDisp(L.A, '1')                        // A 는 이미 disposed
  denied(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'approve' }), 'already disposed lot')
  eq((await req('disposal_requests', r.id)).status, 'pending', '롤백 후 pending')
  await service.from('reagent_lots').update({ status: 'active', sealed_count: 1, current_stock: 10 }).eq('id', L.E)
  const legacy = await newDisp(L.E, '전체', 'approved')
  must(await adminC.rpc('disposal_request_review', { p_request_id: legacy.id, p_action: 'approve' }), 'finish legacy')
  eq([(await req('disposal_requests', legacy.id)).status, (await lot(L.E)).status], ['disposed', 'disposed'], '잔재 마무리')
  const miss = await newDisp('00000000-0000-0000-0000-0000000000ff', '전체')
  denied(await adminC.rpc('disposal_request_review', { p_request_id: miss.id, p_action: 'approve' }), 'missing lot')
  eq((await req('disposal_requests', miss.id)).status, 'pending', '롤백 후 pending')
})
await test('disposal: concurrent approve => exactly one success, one decrement', async () => {
  await service.from('reagent_lots').update({ status: 'active', sealed_count: 1, current_stock: 50 }).eq('id', L.A)
  const r = await newDisp(L.A, null)
  const rs = await Promise.all([1, 2, 3, 4].map(() => adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'approve' })))
  eq(rs.filter(x => !x.error).length, 1, '성공 횟수')
  eq((await lot(L.A)).status, 'disposed', '폐기는 한 번만')
})
await test('disposal: unknown action rejected', async () => {
  const r = await newDisp(L.C, '1')
  denied(await adminC.rpc('disposal_request_review', { p_request_id: r.id, p_action: 'nuke' }), 'bad action')
})

// ── admin bulk RPCs ──────────────────────────────────────────────────────
await test('admin_move_lots: moves active lots, history + audit; empty/invalid rejected', async () => {
  await service.from('reagent_lots').update({ status: 'active', location_id: LOC1 }).in('id', [L.A, L.C])
  const out = must(await adminC.rpc('admin_move_lots', { p_lot_ids: [L.A, L.C], p_to_location_id: LOC2 }), 'move')
  eq(out.moved, 2, 'moved')
  eq([(await lot(L.A)).location_id, (await lot(L.C)).location_id], [LOC2, LOC2], '이동')
  denied(await adminC.rpc('admin_move_lots', { p_lot_ids: [], p_to_location_id: LOC2 }), 'empty')
  denied(await adminC.rpc('admin_move_lots', { p_lot_ids: [L.A], p_to_location_id: '00000000-0000-0000-0000-000000000000' }), 'bad loc')
})
await test('admin_dispose_lots: records disposal rows + disposes lots; reason required', async () => {
  await service.from('reagent_lots').update({ status: 'active', sealed_count: 1, current_stock: 10 }).in('id', [L.A, L.C])
  denied(await adminC.rpc('admin_dispose_lots', { p_lot_ids: [L.A], p_reason: '  ' }), 'blank reason')
  const out = must(await adminC.rpc('admin_dispose_lots', { p_lot_ids: [L.A, L.C], p_reason: 'bulk test' }), 'dispose')
  eq(out.disposed, 2, 'disposed')
  eq([(await lot(L.A)).status, (await lot(L.C)).status], ['disposed', 'disposed'], 'Lot 폐기')
  const rows = must(await service.from('disposal_requests').select('*').eq('reason', 'bulk test'), 'rows')
  eq([rows.length, rows[0].status, rows[0].requested_by], [2, 'disposed', 'REV-TEST-ADMIN'], '기록')
})

// ── authorization matrix ─────────────────────────────────────────────────
await test('authz: anon denied on every review/admin RPC', async () => {
  const c = await newChange('notes', 'anon'), lr = await newLoc(L.B, LOC2), d = await newDisp(L.B, '1')
  const calls = [
    anon.rpc('reagent_change_request_review', { p_request_id: c.id, p_decision: 'approve' }),
    anon.rpc('location_request_review', { p_request_id: lr.id, p_decision: 'approve' }),
    anon.rpc('disposal_request_review', { p_request_id: d.id, p_action: 'approve' }),
    anon.rpc('admin_move_lots', { p_lot_ids: [L.B], p_to_location_id: LOC2 }),
    anon.rpc('admin_dispose_lots', { p_lot_ids: [L.B], p_reason: 'x' }),
  ]
  for (const r of await Promise.all(calls)) denied(r, 'anon')
  eq([(await req('reagent_change_requests', c.id)).status, (await req('location_requests', lr.id)).status, (await req('disposal_requests', d.id)).status], ['pending', 'pending', 'pending'], '상태 불변')
})
await test('authz: authenticated NON-admin denied on every RPC (JWT present but not in admin_users)', async () => {
  const c = await newChange('notes', 'plain'), lr = await newLoc(L.B, LOC2), d = await newDisp(L.B, '1')
  const calls = [
    userC.rpc('reagent_change_request_review', { p_request_id: c.id, p_decision: 'approve' }),
    userC.rpc('location_request_review', { p_request_id: lr.id, p_decision: 'approve' }),
    userC.rpc('disposal_request_review', { p_request_id: d.id, p_action: 'approve' }),
    userC.rpc('admin_move_lots', { p_lot_ids: [L.B], p_to_location_id: LOC2 }),
    userC.rpc('admin_dispose_lots', { p_lot_ids: [L.B], p_reason: 'x' }),
  ]
  for (const r of await Promise.all(calls)) denied(r, 'non-admin')
})
await test('authz: deactivated admin (active=false) denied', async () => {
  await service.from('admin_users').update({ active: false }).eq('user_id', adminId)
  const c = await newChange('notes', 'inactive')
  denied(await adminC.rpc('reagent_change_request_review', { p_request_id: c.id, p_decision: 'approve' }), 'inactive admin')
  await service.from('admin_users').update({ active: true }).eq('user_id', adminId)
})
await test('authz: internal helpers not callable by clients', async () => {
  denied(await adminC.rpc('_admin_actor'), '_admin_actor')
  denied(await anon.rpc('_location_label', { p_id: LOC1, p_sep: ' ' }), '_location_label')
})
await test('authz: student session token grants no review power (student login works, review still denied)', async () => {
  const login = await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' })
  if (login.error || login.data?.status !== 'ok') return { skipped: 'student fixture absent' }
  const c = await newChange('notes', 'student')
  denied(await anon.rpc('reagent_change_request_review', { p_request_id: c.id, p_decision: 'approve', p_session_token: login.data.session_token }), 'student token')
})
await test('direct table mutation denied for anon / non-admin / even admin JWT (only RPCs write)', async () => {
  const c = await newChange('notes', 'tamper'), lr = await newLoc(L.B, LOC2), d = await newDisp(L.B, '1')
  for (const [name, client] of [['anon', anon], ['user', userC], ['admin', adminC]]) {
    denied(await client.from('reagent_change_requests').update({ status: 'approved', new_value: 'HACK' }).eq('id', c.id), `${name} UPDATE change`)
    denied(await client.from('location_requests').update({ status: 'approved' }).eq('id', lr.id), `${name} UPDATE loc`)
    denied(await client.from('disposal_requests').update({ status: 'disposed' }).eq('id', d.id), `${name} UPDATE disp`)
    denied(await client.from('reagent_change_requests').delete().eq('id', c.id), `${name} DELETE change`)
    denied(await client.from('location_requests').delete().eq('id', lr.id), `${name} DELETE loc`)
    denied(await client.from('disposal_requests').delete().eq('id', d.id), `${name} DELETE disp`)
    denied(await client.from('disposal_requests').insert({ reagent_name: 'X', status: 'disposed' }), `${name} INSERT disp`)
    denied(await client.from('reagent_change_requests').insert({ requested_by: 'x', field_name: 'company', new_value: 'y' }), `${name} INSERT change`)
    denied(await client.from('location_requests').insert({ requested_by: 'x' }), `${name} INSERT loc`)
  }
  const after = [await req('reagent_change_requests', c.id), await req('location_requests', lr.id), await req('disposal_requests', d.id)]
  eq(after.map(x => x.status), ['pending', 'pending', 'pending'], '행 불변')
  eq(after[0].new_value, 'tamper', 'new_value 불변')
})
await test('payload tamper: approval applies the DB row, not anything client-supplied', async () => {
  const r = await newChange('company', 'ORIGINAL-VALUE')
  // 클라이언트가 확장 파라미터를 보내도(함수 시그니처에 없음) PostgREST가 거부/무시 — 값이 바뀌면 안 된다.
  await adminC.rpc('reagent_change_request_review', { p_request_id: r.id, p_decision: 'approve', p_new_value: 'HACKED', field_name: 'name' })
  const company = must(await service.from('reagents').select('company,name').eq('id', RID).single(), 'reagent')
  ok(company.company !== 'HACKED' && company.name === 'TEST Batch1 Reagent', '조작된 값이 반영됨')
})
await test('SELECT of request tables still open (admin/student lists keep working)', async () => {
  for (const t of ['reagent_change_requests', 'location_requests', 'disposal_requests']) must(await anon.from(t).select('id').limit(1), `SELECT ${t}`)
})

// ── cleanup ──────────────────────────────────────────────────────────────
await reset()
await service.from('location_history').delete().not('id', 'is', null)
await service.from('reagent_lots').delete().in('id', Object.values(L))
await service.from('locations').delete().in('id', [LOC1, LOC2])
await service.from('admin_users').delete().in('user_id', [adminId].filter(Boolean))
for (const id of [adminId, userId]) if (id) await service.auth.admin.deleteUser(id)

console.log('\n=== RESULT SUMMARY ===')
const failed = results.filter(r => !r.ok)
console.log(`TOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length) process.exitCode = 1
