// STAGING TEST ONLY — 병 단위(reagent_lots.id 1행 = 실물 병 1개) 폐기 / 위치 이동 요청 검증.
// 같은 reagent_id + 같은 lot_no 를 가진 병 A/B 를 만들고, 한 병에 대한 요청·승인·반려가 다른 병에 영향을 주지 않는지 확인한다.
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
const ADMIN_EMAIL = `bottle-admin-${suffix}@example.test`, USER_EMAIL = `bottle-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
const LA = '74000000-0000-0000-0000-000000000001', LB = '74000000-0000-0000-0000-000000000002', LC = '74000000-0000-0000-0000-000000000003'
const RB = '73000000-0000-0000-0000-000000000001'
const BT = n => `75000000-0000-0000-0000-0000000000${n}`      // 병 ID
const [A, B, C, D, E, F, G, H] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].map(BT)
const ALL = [A, B, C, D, E, F, G, H]
let adminC, userC, adminId, userId, tokA

async function wipe() {
  await service.from('location_history').delete().in('lot_id', ALL)
  await service.from('disposal_requests').delete().in('lot_id', ALL)
  await service.from('location_requests').delete().in('lot_id', ALL)
  await service.from('admin_logs').delete().not('id', 'is', null)
  await service.from('reagent_lots').delete().in('id', ALL)
  await service.from('locations').delete().in('id', [LA, LB, LC])
}
async function seed() {
  await wipe()
  must(await service.from('locations').insert([{ id: LA, room: 'BT-1', detail: 'A' }, { id: LB, room: 'BT-2', detail: null }, { id: LC, room: 'BT-3', detail: null }]), 'locs')
  must(await service.from('reagents').upsert({ id: RB, name: 'BT-Reagent', company: 'BT-CO', reagent_type: 'purchased', status: 'active' }), 'reagent')
  // A/B: 같은 시약 + 같은 제조사 lot_no / C/D: 같은 시약 + 같은 lot_no / E,F,G: 교차 요청용
  must(await service.from('reagent_lots').insert([
    { id: A, reagent_id: RB, lot_no: 'SAME-LOT', sealed_count: 0, current_stock: 50, location_id: LA, status: 'active' },
    { id: B, reagent_id: RB, lot_no: 'SAME-LOT', sealed_count: 1, current_stock: 0, location_id: LA, status: 'active' },
    { id: C, reagent_id: RB, lot_no: 'SAME-LOT-2', sealed_count: 0, current_stock: 70, location_id: LA, status: 'active' },
    { id: D, reagent_id: RB, lot_no: 'SAME-LOT-2', sealed_count: 0, current_stock: 20, location_id: LA, status: 'active' },
    { id: E, reagent_id: RB, lot_no: 'SAME-LOT-3', sealed_count: 0, current_stock: 40, location_id: LA, status: 'active' },
    { id: F, reagent_id: RB, lot_no: 'SAME-LOT-3', sealed_count: 0, current_stock: 45, location_id: LA, status: 'active' },
    { id: G, reagent_id: RB, lot_no: 'SAME-LOT-3', sealed_count: 0, current_stock: 10, location_id: LA, status: 'active' },
    { id: H, reagent_id: RB, lot_no: 'GROUPED-LOT', sealed_count: 3, current_stock: 0, location_id: LA, status: 'active' },   // 묶음 행(비정상)
  ]), 'lots')
}
const lotRow = async id => must(await service.from('reagent_lots').select('id,lot_no,sealed_count,current_stock,status,location_id').eq('id', id).single(), 'lot')
const snap = async ids => JSON.stringify(await Promise.all(ids.map(lotRow)))
const req = async (t, id) => must(await service.from(t).select('*').eq('id', id).single(), 'req')
const hist = async id => must(await service.from('location_history').select('*').eq('lot_id', id), 'hist')
const logCount = async () => must(await service.from('admin_logs').select('id'), 'logs').length

const submitDisp = (tok, lot, reason = '파손') => anon.rpc('disposal_request_submit', { p_session_token: tok, p_lot_id: lot, p_reason: reason })
const submitLoc = (tok, lot, to) => anon.rpc('location_request_submit', { p_session_token: tok, p_lot_id: lot, p_to_location_id: to, p_notes: null })
const reviewDisp = (id, action, reason) => adminC.rpc('disposal_request_review', { p_request_id: id, p_action: action, p_reason: reason ?? null })
const reviewLoc = (id, decision, reason) => adminC.rpc('location_request_review', { p_request_id: id, p_decision: decision, p_reason: reason ?? null })

await test('setup', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'BT-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  tokA = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'A').session_token
  await seed()
  const rows = must(await service.from('reagent_lots').select('id').eq('reagent_id', RB).eq('lot_no', 'SAME-LOT'), 'same lot_no')
  eq(rows.length, 2, '같은 reagent_id + 같은 lot_no 병 2개(별도 행)')
})

// ══ 폐기 ═══════════════════════════════════════════════════════════════════
let dispA, dispB
await test('DISPOSAL: student submit for bottle A only -> pending row keyed by lot_id=A (server-derived), no quantity, lots untouched', async () => {
  const before = await snap([A, B])
  dispA = must(await submitDisp(tokA, A), 'submit A').id
  const r = await req('disposal_requests', dispA)
  eq([r.lot_id, r.reagent_id, r.lot_no, r.quantity, r.status, r.reagent_name], [A, RB, 'SAME-LOT', null, 'pending', 'BT-Reagent'], '요청 행(병 A 식별 + 서버 확정 값)')
  eq(await snap([A, B]), before, '승인 전 병 A/B 불변')
})
await test('DISPOSAL: duplicate pending on bottle A blocked; bottle B (same lot_no) can still be requested', async () => {
  denied(await submitDisp(tokA, A), 'dup A')
  dispB = must(await submitDisp(tokA, B), 'B ok').id
  const pend = must(await service.from('disposal_requests').select('lot_id').in('lot_id', [A, B]).eq('status', 'pending'), 'pending')
  eq(pend.map(x => x.lot_id).sort(), [A, B].sort(), 'A/B 각각 1건')
})
await test('DISPOSAL: submit validation — lot_id required / unknown lot / blank reason', async () => {
  denied(await anon.rpc('disposal_request_submit', { p_session_token: tokA, p_lot_id: null, p_reason: '파손' }), 'null lot')
  denied(await submitDisp(tokA, '00000000-0000-0000-0000-0000000000ff'), 'unknown lot')
  denied(await submitDisp(tokA, C, '   '), 'blank reason')
})
await test('DISPOSAL: approve A => ONLY bottle A disposed; bottle B (same reagent + same lot_no) untouched', async () => {
  const bBefore = await snap([B])
  const out = must(await reviewDisp(dispA, 'approve'), 'approve')
  eq([out.status, out.lot_id], ['disposed', A], '결과')
  const a = await lotRow(A)
  eq([a.status, a.sealed_count, a.current_stock], ['disposed', 0, 0], '병 A 폐기')
  eq(await snap([B]), bBefore, '병 B 불변')
  eq((await req('disposal_requests', dispB)).status, 'pending', 'B 요청은 그대로 pending')
  eq((await req('disposal_requests', dispA)).status, 'disposed', 'A 요청 disposed (1단계 완료)')
})
await test('DISPOSAL: re-approve an already processed request / an already disposed bottle fails; nothing changes', async () => {
  denied(await reviewDisp(dispA, 'approve'), 'double approve')
  await service.from('disposal_requests').delete().eq('id', dispB)
  // 이미 폐기된 병 A 를 가리키는 새 pending 요청(다른 경로로 만들어진 stale 요청)
  const stale = must(await service.from('disposal_requests').insert({ reagent_id: RB, lot_id: A, reagent_name: 'BT-Reagent', lot_no: 'SAME-LOT', reason: 'stale', requested_by: 'X', status: 'pending' }).select().single(), 'stale')
  const logs = await logCount()
  const msg = denied(await reviewDisp(stale.id, 'approve'), 'already disposed bottle')
  ok(msg.includes('이미 폐기'), msg)
  eq([(await req('disposal_requests', stale.id)).status, await logCount()], ['pending', logs], '롤백: pending 유지, 감사로그 추가 없음')
  await service.from('disposal_requests').delete().eq('id', stale.id)
})
await test('DISPOSAL: reject => zero bottle change, status rejected + review_note', async () => {
  const req1 = must(await submitDisp(tokA, B, '사유'), 'submit B')
  const before = await snap([A, B])
  must(await reviewDisp(req1.id, 'reject', '아직 사용 중'), 'reject')
  eq(await snap([A, B]), before, '병 변화 0')
  const r = await req('disposal_requests', req1.id)
  eq([r.status, r.review_note], ['rejected', '아직 사용 중'], '반려')
  must(await submitDisp(tokA, B, '재신청'), '반려 후 재신청 가능')
  await service.from('disposal_requests').delete().eq('lot_id', B)
})

// ══ 위치 이동 ═══════════════════════════════════════════════════════════════
let locC, locD
await test('LOCATION: student submit for bottle C only -> lot_id=C, from/to stored (server-derived), lots untouched', async () => {
  const before = await snap([C, D])
  locC = must(await submitLoc(tokA, C, LB), 'submit C').id
  const r = await req('location_requests', locC)
  eq([r.lot_id, r.reagent_id, r.from_location_id, r.to_location_id, r.status, r.reagent_name, r.from_location_name, r.to_location_name],
     [C, RB, LA, LB, 'pending', 'BT-Reagent', 'BT-1 - A', 'BT-2'], '요청 행')
  eq(await snap([C, D]), before, '승인 전 실제 위치 불변')
})
await test('LOCATION: duplicate pending on C blocked; D (same lot_no) can be requested; same-location / unknown lot / null lot blocked', async () => {
  denied(await submitLoc(tokA, C, LC), 'dup C')
  locD = must(await submitLoc(tokA, D, LC), 'D ok').id
  denied(await submitLoc(tokA, E, LA), '현재 위치와 같음')
  denied(await anon.rpc('location_request_submit', { p_session_token: tokA, p_lot_id: null, p_to_location_id: LB, p_notes: null }), 'null lot')
  denied(await submitLoc(tokA, '00000000-0000-0000-0000-0000000000ff', LB), 'unknown lot')
  denied(await submitLoc(tokA, E, '00000000-0000-0000-0000-0000000000ee'), 'unknown location')
})
await test('LOCATION: approve C => ONLY bottle C moved; D (same reagent + same lot_no) stays; location_history exactly 1 row for C, 0 for D', async () => {
  const dBefore = await snap([D])
  const out = must(await reviewLoc(locC, 'approve'), 'approve')
  eq([out.status, out.lots_moved], ['approved', 1], '결과')
  eq((await lotRow(C)).location_id, LB, 'C 이동')
  eq(await snap([D]), dBefore, 'D 불변')
  const h = await hist(C)
  eq([h.length, h[0].from_location_id, h[0].to_location_id, h[0].moved_by], [1, LA, LB, 'BT-ADMIN'], 'C 이력 1건')
  eq((await hist(D)).length, 0, 'D 이력 0건')
  eq(must(await service.from('location_history').select('id').in('lot_id', ALL.filter(x => x !== C)), 'others').length, 0, '다른 병 이력 0건')
})
await test('LOCATION: double approve blocked; reject D => zero location change + review_note', async () => {
  denied(await reviewLoc(locC, 'approve'), 'double approve')
  eq((await hist(C)).length, 1, '이력 중복 없음')
  const before = await snap([D])
  must(await reviewLoc(locD, 'reject', '위치 확인 필요'), 'reject')
  eq(await snap([D]), before, '위치 변화 0')
  const r = await req('location_requests', locD)
  eq([r.status, r.review_note], ['rejected', '위치 확인 필요'], '반려')
  eq((await hist(D)).length, 0, '이력 0')
})
await test('LOCATION: stale request (bottle moved elsewhere since) => clear error, no partial write', async () => {
  const r = must(await submitLoc(tokA, D, LB), 'submit D→LB')
  await service.from('reagent_lots').update({ location_id: LC }).eq('id', D)           // 요청 이후 다른 경로로 이동
  const logs = await logCount()
  const msg = denied(await reviewLoc(r.id, 'approve'), 'stale')
  ok(msg.includes('위치가 이미 바뀌었습니다'), msg)
  eq([(await req('location_requests', r.id)).status, (await lotRow(D)).location_id, (await hist(D)).length, await logCount()], ['pending', LC, 0, logs], '롤백')
  await service.from('location_requests').delete().eq('id', r.id)
})

// ══ 교차 요청 (같은 병에 폐기 pending + 위치 이동 pending) ═══════════════════
await test('CROSS: dispose + move pending on the same bottle are both allowed; dispose approved first => move approval fails safely', async () => {
  const d = must(await submitDisp(tokA, E), 'dispose E').id
  const l = must(await submitLoc(tokA, E, LB), 'move E').id
  const fBefore = await snap([F, G])
  must(await reviewDisp(d, 'approve'), 'approve dispose')
  eq((await lotRow(E)).status, 'disposed', 'E 폐기')
  const logs = await logCount()
  const msg = denied(await reviewLoc(l, 'approve'), 'move after dispose')
  ok(msg.includes('이미 폐기'), msg)
  eq([(await req('location_requests', l)).status, (await lotRow(E)).location_id, (await hist(E)).length, await logCount()], ['pending', LA, 0, logs], '위치 요청은 pending 유지, 이동/이력/로그 없음')
  eq(await snap([F, G]), fBefore, '다른 병 불변')
  must(await reviewLoc(l, 'reject', '폐기됨'), '반려로 정리')
})
await test('CROSS: move approved first => dispose request is re-validated against the current state and still succeeds', async () => {
  const d = must(await submitDisp(tokA, F), 'dispose F').id
  const l = must(await submitLoc(tokA, F, LB), 'move F').id
  must(await reviewLoc(l, 'approve'), 'approve move')
  eq([(await lotRow(F)).location_id, (await hist(F)).length], [LB, 1], 'F 이동 + 이력 1건')
  must(await reviewDisp(d, 'approve'), 'approve dispose after move')
  const f = await lotRow(F)
  eq([f.status, f.location_id], ['disposed', LB], 'F 폐기(이동된 상태 기준)')
  eq((await lotRow(G)).status, 'active', '같은 lot_no 의 G 는 여전히 active')
})

// ══ 권한 / 신뢰 경계 ═════════════════════════════════════════════════════════
await test('SECURITY: students / anon / plain authenticated cannot review; student cannot mutate reagent_lots directly', async () => {
  const d = must(await submitDisp(tokA, G), 'dispose G').id
  const l = must(await submitLoc(tokA, G, LB), 'move G').id
  for (const c of [anon, userC]) {
    denied(await c.rpc('disposal_request_review', { p_request_id: d, p_action: 'approve' }), 'review disposal')
    denied(await c.rpc('location_request_review', { p_request_id: l, p_decision: 'approve' }), 'review location')
  }
  const before = await snap([G])
  await anon.from('reagent_lots').update({ status: 'disposed', location_id: LC }).eq('id', G)
  await userC.from('reagent_lots').update({ status: 'disposed', location_id: LC }).eq('id', G)
  await anon.from('disposal_requests').update({ status: 'disposed' }).eq('id', d)
  await anon.from('location_requests').update({ status: 'approved' }).eq('id', l)
  eq(await snap([G]), before, '직접 UPDATE 는 병에 반영되지 않음')
  eq([(await req('disposal_requests', d)).status, (await req('location_requests', l)).status], ['pending', 'pending'], '요청 행도 직접 변경 불가')
})
await test('TRUST: review re-reads the target from the request row — a tampered request (reagent mismatch) is refused', async () => {
  const other = '73000000-0000-0000-0000-000000000009'
  must(await service.from('reagents').upsert({ id: other, name: 'BT-Other', reagent_type: 'purchased', status: 'active' }), 'other reagent')
  const rows = must(await service.from('disposal_requests').select('id').eq('lot_id', G).eq('status', 'pending'), 'g req')
  await service.from('disposal_requests').update({ reagent_id: other }).eq('id', rows[0].id)
  const before = await snap([G])
  const msg = denied(await reviewDisp(rows[0].id, 'approve'), 'mismatch')
  ok(msg.includes('일치하지 않습니다'), msg)
  eq(await snap([G]), before, '병 불변')
  await service.from('disposal_requests').update({ reagent_id: RB }).eq('id', rows[0].id)
  await service.from('reagents').delete().eq('id', other)
})
await test('TRUST: grouped row (sealed_count > 1) cannot be disposed as "1 bottle"', async () => {
  await service.from('reagent_lots').update({ sealed_count: 3 }).eq('id', G)
  const rows = must(await service.from('disposal_requests').select('id').eq('lot_id', G).eq('status', 'pending'), 'g req')
  const msg = denied(await reviewDisp(rows[0].id, 'approve'), 'grouped')
  ok(msg.includes('병 단위 작업을 할 수 없습니다'), msg)
  eq((await lotRow(G)).status, 'active', '불변')
})
await test('GUARD: grouped row (sealed_count > 1) is refused by EVERY bottle-unit operation (fail-closed, exact guidance, nothing changes)', async () => {
  const GUIDE = '여러 병이 하나의 Lot 행에 묶여 있어 병 단위 작업을 할 수 없습니다. 병별 Lot 행으로 분리 후 처리해주세요.'
  const before = await snap([H])
  const logs = await logCount()
  const chk = (r, what) => { const m = denied(r, what); ok(m.includes(GUIDE), what + ': ' + m); return m }
  chk(await submitDisp(tokA, H), 'student dispose submit')
  chk(await submitLoc(tokA, H, LB), 'student move submit')
  chk(await adminC.rpc('admin_move_lots', { p_lot_ids: [H, E], p_to_location_id: LB }), 'admin_move_lots (mixed batch is rejected as a whole)')
  chk(await adminC.rpc('admin_dispose_lots', { p_lot_ids: [H], p_reason: 'x' }), 'admin_dispose_lots')
  chk(await adminC.rpc('admin_lot_move', { p_lot_id: H, p_to_location_id: LB, p_notes: null }), 'admin_lot_move')
  chk(await adminC.rpc('admin_lot_set_status', { p_lot_id: H, p_status: 'used_up' }), 'admin_lot_set_status')
  // 이미 pending 으로 들어와 있던 요청(과거에 만들어졌거나 우회 경로)도 승인 시점에 거부
  const d = must(await service.from('disposal_requests').insert({ reagent_id: RB, lot_id: H, reagent_name: 'BT-Reagent', lot_no: 'GROUPED-LOT', reason: 'x', requested_by: 'X', status: 'pending' }).select().single(), 'seed d')
  const l = must(await service.from('location_requests').insert({ reagent_id: RB, lot_id: H, reagent_name: 'BT-Reagent', from_location_id: LA, from_location_name: 'BT-1 - A', to_location_id: LB, to_location_name: 'BT-2', requested_by: 'X', status: 'pending' }).select().single(), 'seed l')
  chk(await reviewDisp(d.id, 'approve'), 'disposal review approve')
  chk(await reviewLoc(l.id, 'approve'), 'location review approve')
  eq([await snap([H]), await logCount(), (await hist(H)).length], [before, logs, 0], 'H 불변 / 감사로그·이력 추가 없음')
  eq([(await req('disposal_requests', d.id)).status, (await req('location_requests', l.id)).status], ['pending', 'pending'], '요청은 pending 유지(관리자가 반려 가능)')
  must(await reviewDisp(d.id, 'reject', '묶음 행'), 'reject disposal is allowed'); must(await reviewLoc(l.id, 'reject', '묶음 행'), 'reject location is allowed')
})
await test('GUARD: the repair path stays open — admin_lot_update splits the row, after which bottle operations work', async () => {
  must(await adminC.rpc('admin_lot_update', { p_lot_id: H, p_fields: { sealed_count: 1 } }), 'split to 1')
  must(await adminC.rpc('admin_lot_move', { p_lot_id: H, p_to_location_id: LB, p_notes: null }), 'move after split')
  eq((await lotRow(H)).location_id, LB, '이동됨')
})
await test('no legacy leftovers: old signatures gone; quantity never written', async () => {
  const r = await anon.rpc('disposal_request_submit', { p_session_token: tokA, p_reagent_id: RB, p_lot_id: C, p_reagent_name: 'x', p_lot_no: 'x', p_quantity: '전체', p_reason: 'x' })
  ok(!!r.error, '옛 시그니처(수량 포함)는 호출되면 안 됨')
  const q = must(await service.from('disposal_requests').select('quantity').in('lot_id', ALL), 'q')
  ok(q.every(x => x.quantity === null), '수량 컬럼은 채워지지 않음')
})

await test('cleanup', async () => {
  await wipe()
  await service.from('reagents').delete().eq('id', RB)
  await service.from('admin_users').delete().eq('user_id', adminId)
  await service.auth.admin.deleteUser(adminId); await service.auth.admin.deleteUser(userId)
})

const pass = results.filter(Boolean).length
console.log(`\nTOTAL=${results.length} PASS=${pass} FAIL=${results.length - pass}`)
process.exitCode = pass === results.length ? 0 : 1
