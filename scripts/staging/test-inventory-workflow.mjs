// STAGING TEST ONLY — Master Finish Phase 2: 재고실사 4단계 workflow(임시저장 → 학생 완료 → 관리자 검토 → DB 최종 반영).
// 핵심 불변식: ④ 이전에는 reagents/reagent_lots 장부가 절대 바뀌지 않는다.
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
  try { const d = await fn(); results.push({ name, ok: true }); console.log(`[PASS] ${name}${d ? ' — ' + JSON.stringify(d) : ''}`) }
  catch (e) { results.push({ name, ok: false }); console.log(`[FAIL] ${name}: ${e.message}`) }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected=${JSON.stringify(b)} actual=${JSON.stringify(a)}`) }
const ok = (c, m) => { if (!c) throw new Error(m) }
const must = (r, m) => { if (r.error) throw new Error(`${m}: ${r.error.message}`); return r.data }
const denied = (r, m) => { ok(!!r.error, `${m}: 거부돼야 하는데 성공함`); return r.error.message }

const suffix = randomBytes(4).toString('hex')
const ADMIN_EMAIL = `inv-admin-${suffix}@example.test`, USER_EMAIL = `inv-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
const LOC1 = '52000000-0000-0000-0000-000000000001', LOC2 = '52000000-0000-0000-0000-000000000002', LOC3 = '52000000-0000-0000-0000-000000000003'
const R1 = '50000000-0000-0000-0000-000000000001', R2 = '50000000-0000-0000-0000-000000000002'
const LA = '51000000-0000-0000-0000-00000000000a', LB = '51000000-0000-0000-0000-00000000000b', LC = '51000000-0000-0000-0000-00000000000c'
let adminId, userId, adminC, userC, tokA, tokB, sid

async function wipe() {
  await service.from('inventory_counts').delete().not('id', 'is', null)
  await service.from('inventory_sessions').delete().not('id', 'is', null)
  await service.from('stock_logs').delete().not('id', 'is', null)
  await service.from('location_history').delete().not('id', 'is', null)
  await service.from('reagent_change_requests').delete().not('id', 'is', null)
  await service.from('admin_logs').delete().not('id', 'is', null)
  await service.from('reagent_lots').delete().or('lot_no.like.INV-%,lot_no.is.null,id.in.(' + [LA, LB, LC].join(',') + ')')
  await service.from('reagents').delete().or('name.like.INV-%,name.like.NEWREG-%')
  await service.from('locations').delete().in('id', [LOC1, LOC2, LOC3])
}
async function seedLedger() {
  must(await service.from('locations').insert([{ id: LOC1, room: 'INV-ROOM-1', detail: 'A' }, { id: LOC2, room: 'INV-ROOM-2', detail: null }, { id: LOC3, room: 'INV-ROOM-3', detail: null }]), 'locs')
  must(await service.from('reagents').upsert([
    { id: R1, name: 'INV-Reagent One', cas_no: '111-11-1', company: 'OLD-CO', volume: 500, unit: 'mL', category: 'liquid', reagent_type: 'purchased', status: 'active' },
    { id: R2, name: 'INV-Reagent Two', cas_no: '222-22-2', company: 'CO2', volume: 100, unit: 'g', category: 'solid', reagent_type: 'purchased', status: 'active' },
  ]), 'reagents')
  must(await service.from('reagent_lots').insert([
    { id: LA, reagent_id: R1, lot_no: 'INV-A', cat_no: 'CAT-A', sealed_count: 2, current_stock: 50, location_id: LOC1, status: 'active' },
    { id: LB, reagent_id: R1, lot_no: 'INV-B', cat_no: 'CAT-B', sealed_count: 1, current_stock: 30, location_id: LOC1, status: 'active' },
    { id: LC, reagent_id: R2, lot_no: 'INV-C', cat_no: 'CAT-C', sealed_count: 1, current_stock: 80, location_id: LOC2, status: 'active' },
  ]), 'lots')
}
const ledger = async () => JSON.stringify([
  must(await service.from('reagent_lots').select('id,sealed_count,current_stock,status,location_id,lot_no,cat_no,pending_confirm').in('id', [LA, LB, LC]).order('id'), 'lots'),
  must(await service.from('reagents').select('id,name,company,volume,cas_no,pending_confirm').in('id', [R1, R2]).order('id'), 'reagents'),
])
const counts = async (s = sid) => must(await service.from('inventory_counts').select('*').eq('session_id', s).order('id'), 'counts')
const countOf = async (lotId) => (await counts()).find(c => c.lot_id === lotId)
const logsN = async () => ({
  stock: must(await service.from('stock_logs').select('id'), 'sl').length,
  hist: must(await service.from('location_history').select('id'), 'lh').length,
  chg: must(await service.from('reagent_change_requests').select('id'), 'cr').length,
})

await test('setup: admin/non-admin Auth users, student sessions, ledger fixture', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'INV-TEST-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  const la = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'login A')
  const lb = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0002', p_name: 'TEST Student Two', p_birth_date: '2001-02-02' }), 'login B')
  tokA = la.session_token; tokB = lb.session_token
  ok(tokA && tokB, 'student tokens')
  await wipe(); await seedLedger()
})

let before
await test('① start: only admin; scope by location; book snapshot; second open session refused', async () => {
  for (const [who, c] of [['anon', anon], ['user', userC]]) denied(await c.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-20', p_label: 'x', p_purpose: 'current_list', p_zones: null, p_location_ids: null }), `${who} start`)
  const out = must(await adminC.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-20', p_label: 'wf', p_purpose: 'current_list', p_zones: ['A'], p_location_ids: [LOC1] }), 'start')
  sid = out.session_id
  eq(out.lots, 2, '구역(LOC1) Lot 2개만')
  const s = must(await service.from('inventory_sessions').select('*').eq('id', sid).single(), 's')
  eq([s.status, s.created_by, s.zones], ['active', 'INV-TEST-ADMIN', ['A']], '세션(생성자=서버 확정)')
  const ca = await countOf(LA)
  eq([ca.book_sealed, ca.book_stock, ca.book_reagent_fields.name, ca.book_lot_fields.cat_no, ca.actual_stock], [2, 50, 'INV-Reagent One', 'CAT-A', null], 'book 스냅샷')
  denied(await adminC.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-21', p_label: null, p_purpose: 'current_list', p_zones: null, p_location_ids: null }), '2nd open session')
  before = await ledger()
})

await test('① student temp-save writes inventory_counts ONLY; identity from token; ledger untouched', async () => {
  const c = await countOf(LA)
  const r = must(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: { actual_stock: 40, actual_sealed: 2 } }), 'save')
  eq([r.actual_stock, r.counted_by, r.counted_by_student_id], [40, 'TEST Student One', 'TEST-STU-0001'], '서버가 확정한 신원')
  const r2 = must(await anon.rpc('inventory_count_save', { p_session_token: tokB, p_count_id: c.id, p_fields: { actual_stock: 45, actual_sealed: 2 } }), 'save by B')
  eq(r2.counted_by_student_id, 'TEST-STU-0002', '다른 학생 토큰이면 그 학생으로 기록')
  eq(await ledger(), before, '장부(reagents/reagent_lots) 불변')
})
await test('student save rejects: no/invalid token, forbidden fields, bad values, unknown row', async () => {
  const c = await countOf(LA)
  denied(await anon.rpc('inventory_count_save', { p_session_token: null, p_count_id: c.id, p_fields: { actual_stock: 1 } }), 'null token')
  denied(await anon.rpc('inventory_count_save', { p_session_token: 'bogus-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', p_count_id: c.id, p_fields: { actual_stock: 1 } }), 'bad token')
  for (const f of [{ book_stock: 1 }, { is_new_registration: true }, { session_id: 1 }, { counted_by: 'hacker' }, { lot_id: LB }])
    denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: f }), `field ${Object.keys(f)[0]}`)
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: { actual_stock: 101 } }), 'stock>100')
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: { actual_stock: -1 } }), 'stock<0')
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: { staged_reagent_fields: { id: 'x' } } }), 'bad reagent key')
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: { staged_lot_fields: { status: 'disposed' } } }), 'bad lot key')
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: c.id, p_fields: { staged_location_id: '00000000-0000-0000-0000-000000000000' } }), 'unknown location')
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: 999999999, p_fields: { actual_stock: 1 } }), 'unknown row')
  eq(await ledger(), before, '장부 불변')
})
await test('direct writes to inventory tables are closed for anon/user/admin JWT', async () => {
  const c = await countOf(LA)
  for (const [who, cl] of [['anon', anon], ['user', userC], ['admin', adminC]]) {
    eq((await cl.from('inventory_counts').update({ actual_stock: 1 }).eq('id', c.id).select('id')).data?.length ?? 0, 0, `${who} UPDATE counts`)
    ok((await cl.from('inventory_counts').insert({ session_id: sid, lot_id: LC })).error, `${who} INSERT counts`)
    eq((await cl.from('inventory_counts').delete().eq('id', c.id).select('id')).data?.length ?? 0, 0, `${who} DELETE counts`)
    eq((await cl.from('inventory_sessions').update({ status: 'completed' }).eq('id', sid).select('id')).data?.length ?? 0, 0, `${who} UPDATE session`)
    ok((await cl.from('inventory_sessions').insert({ year: 2026, start_date: '2026-01-01', created_by: 'x' })).error, `${who} INSERT session`)
  }
  ok((await anon.from('inventory_counts').select('id').eq('session_id', sid)).data.length === 2, 'SELECT 은 유지(진행률/목록 표시)')
})

await test('② completed values staged (stock/missing/location/lot+reagent fields/note) — ledger still untouched', async () => {
  const a = await countOf(LA), b = await countOf(LB)
  must(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a.id, p_fields: { actual_stock: 40, actual_sealed: 1, staged_location_id: LOC3, staged_lot_fields: { cat_no: 'CAT-A2', lot_no: 'INV-A2' }, staged_reagent_fields: { company: 'NEW-CO', volume: '250', name: 'INV-Reagent One' }, abnormal_note: '  뚜껑 파손  ' } }), 'A')
  must(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: b.id, p_fields: { actual_stock: 10, actual_sealed: 0, reported_missing: true } }), 'B')
  const ca = await countOf(LA)
  eq([ca.actual_stock, ca.actual_sealed, ca.staged_location_id, ca.staged_lot_fields.lot_no, ca.abnormal_note], [40, 1, LOC3, 'INV-A2', '뚜껑 파손'], 'staged A')
  eq(await ledger(), before, '장부 불변')
})

await test('paused blocks student input; resume restores it', async () => {
  const a = await countOf(LA)
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'pause' }), 'pause')
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a.id, p_fields: { actual_stock: 41, actual_sealed: 1 } }), 'save while paused')
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'resume' }), 'resume')
  must(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a.id, p_fields: { actual_stock: 40, actual_sealed: 1 } }), 'save after resume')
})

await test('transition/finalize authorization: anon & non-admin denied', async () => {
  for (const [who, c] of [['anon', anon], ['user', userC]]) {
    for (const action of ['pause', 'resume', 'review', 'reopen', 'cancel']) denied(await c.rpc('inventory_session_transition', { p_session_id: sid, p_action: action }), `${who} ${action}`)
    denied(await c.rpc('inventory_session_finalize', { p_session_id: sid }), `${who} finalize`)
  }
  denied(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'explode' }), 'unknown action')
  eq((await service.from('inventory_sessions').select('status').eq('id', sid).single()).data.status, 'active', '상태 불변')
})

await test('④ before ③ is refused: finalize requires reviewed status', async () => {
  denied(await adminC.rpc('inventory_session_finalize', { p_session_id: sid }), 'finalize from active')
  eq(await ledger(), before, '장부 불변')
})

await test('③ admin review: session -> reviewed, student input locked, ledger STILL untouched', async () => {
  const out = must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'review' }), 'review')
  eq(out.status, 'reviewed', 'status')
  const a = await countOf(LA)
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a.id, p_fields: { actual_stock: 99, actual_sealed: 1 } }), 'save while reviewed')
  denied(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'review' }), 'double review')
  denied(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'pause' }), 'pause reviewed')
  eq(await ledger(), before, '장부 불변')
  eq(await logsN(), { stock: 0, hist: 0, chg: 0 }, '이력 없음')
})
await test('③ reopen (review undo) is trivial because nothing was applied; review again', async () => {
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'reopen' }), 'reopen')
  const a = await countOf(LA)
  must(await anon.rpc('inventory_count_save', { p_session_token: tokB, p_count_id: a.id, p_fields: { actual_stock: 40, actual_sealed: 1 } }), 'save again')
  eq(await ledger(), before, '장부 불변')
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'review' }), 'review again')
})

await test('④ atomicity: failure mid-way rolls EVERYTHING back (bad staged value)', async () => {
  const c = await countOf(LC)
  // LC는 이번 세션 범위 밖 — 범위 안 Lot(LB)의 staged 값을 일부러 깨뜨려 롤백 확인
  const b = await countOf(LB)
  must(await service.from('inventory_counts').update({ staged_reagent_fields: { volume: 'not-a-number' } }).eq('id', b.id), 'poison')
  denied(await adminC.rpc('inventory_session_finalize', { p_session_id: sid }), 'poisoned finalize')
  eq(await ledger(), before, '롤백 후 장부 불변')
  eq(await logsN(), { stock: 0, hist: 0, chg: 0 }, '롤백 후 이력 없음')
  eq((await service.from('inventory_sessions').select('status').eq('id', sid).single()).data.status, 'reviewed', '세션은 reviewed 유지')
  must(await service.from('inventory_counts').update({ staged_reagent_fields: null }).eq('id', b.id), 'unpoison')
  void c
})

await test('④ finalize: ledger changes + history + session completed, in one transaction', async () => {
  const out = must(await adminC.rpc('inventory_session_finalize', { p_session_id: sid }), 'finalize')
  eq([out.status, out.lots, out.moves], ['completed', 2, 1], '요약')
  const [lots, reagents] = JSON.parse(await ledger())
  const la = lots.find(l => l.id === LA), lb = lots.find(l => l.id === LB), lc = lots.find(l => l.id === LC)
  eq([la.sealed_count, la.current_stock, la.location_id, la.lot_no, la.cat_no, la.pending_confirm], [1, 40, LOC3, 'INV-A2', 'CAT-A2', false], 'Lot A 반영')
  eq([lb.status, lb.sealed_count, lb.current_stock], ['missing', 0, 10], 'Lot B 미확인 → missing')
  eq([lc.sealed_count, lc.current_stock, lc.status], [1, 80, 'active'], '범위 밖 Lot C 불변')
  const r1 = reagents.find(r => r.id === R1)
  eq([r1.company, Number(r1.volume), r1.pending_confirm], ['NEW-CO', 250, false], '시약정보 반영(numeric 캐스팅)')
  eq(reagents.find(r => r.id === R2).company, 'CO2', '다른 시약 불변')
  const n = await logsN()
  eq(n, { stock: 2, hist: 1, chg: 2 }, '이력(stock 2, 이동 1, 변경요청 2: company·volume)')
  const chg = must(await service.from('reagent_change_requests').select('*'), 'chg')
  ok(chg.every(x => x.status === 'approved' && x.approved_by === 'INV-TEST-ADMIN' && x.requested_by.startsWith('[실사]')), '변경요청 기록(승인자=서버 확정)')
  const sl = must(await service.from('stock_logs').select('*').eq('lot_id', LA), 'sl')
  eq([sl[0].before_sealed, sl[0].after_sealed, sl[0].before_stock, sl[0].after_stock], [2, 1, 50, 40], 'stock_logs before/after')
  const hist = must(await service.from('location_history').select('*'), 'hist')
  eq([hist[0].from_location_name, hist[0].to_location_name], ['INV-ROOM-1 - A', 'INV-ROOM-3'], 'location_history')
  const s = must(await service.from('inventory_sessions').select('*').eq('id', sid).single(), 's')
  eq(s.status, 'completed', 'session'); ok(s.completed_at, 'completed_at')
})
await test('④ double / concurrent finalize is impossible', async () => {
  denied(await adminC.rpc('inventory_session_finalize', { p_session_id: sid }), 'second finalize')
  eq((await logsN()).stock, 2, 'stock_logs 중복 없음')
})

// ── 새 세션: 동시 finalize, 신규 등록, 취소 ─────────────────────────────────
let sid2
await test('concurrent finalize: exactly one succeeds, history written once', async () => {
  await seedLedgerReset()
  const out = must(await adminC.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-21', p_label: 'conc', p_purpose: 'current_list', p_zones: null, p_location_ids: null }), 'start2')
  sid2 = out.session_id; sid = sid2
  const a = await countOf(LA)
  must(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a.id, p_fields: { actual_stock: 22, actual_sealed: 2 } }), 'save')
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid2, p_action: 'review' }), 'review')
  const rs = await Promise.all([1, 2, 3, 4].map(() => adminC.rpc('inventory_session_finalize', { p_session_id: sid2 })))
  eq(rs.filter(r => !r.error).length, 1, '성공 횟수')
  eq(must(await service.from('stock_logs').select('id').eq('lot_id', LA), 'sl').length, 1, 'stock_logs 1건')
})
async function seedLedgerReset() {
  await wipe(); await seedLedger()
}

await test('new registration: student RPC creates UNCONFIRMED reagent+lot+count; needs active session; cancel removes it', async () => {
  await seedLedgerReset()
  const out = must(await adminC.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-22', p_label: 'newreg', p_purpose: 'current_list', p_zones: null, p_location_ids: null }), 'start3')
  sid = out.session_id
  const reg = must(await anon.rpc('inventory_new_registration', {
    p_session_token: tokA, p_session_id: sid, p_reagent_id: null,
    p_reagent: { name: 'NEWREG-Compound', cas_no: '999-99-9', company: 'NEWCO', sort_letter: 'N' },
    p_lot: { location_id: LOC2, current_stock: '70', lot_no: 'NEWREG-LOT', cat_no: 'C1' }, p_abnormal_note: '박스 손상',
  }), 'register')
  const lot = must(await service.from('reagent_lots').select('*').eq('id', reg.lot_id).single(), 'lot')
  eq([lot.pending_confirm, lot.status, lot.current_stock, lot.sealed_count, lot.location_id], [true, 'active', 70, 1, LOC2], '미확정 표시로 생성')
  const rg = must(await service.from('reagents').select('*').eq('id', reg.reagent_id).single(), 'rg')
  eq([rg.pending_confirm, rg.registered_by, rg.status], [true, 'TEST-STU-0001', 'active'], '시약 미확정 + 등록자=세션 확정')
  const c = await countOf(reg.lot_id)
  eq([c.is_new_registration, c.actual_stock, c.counted_by_student_id, c.abnormal_note], [true, 70, 'TEST-STU-0001', '박스 손상'], '실사 항목')
  eq((await logsN()).stock, 0, '재고 이력은 ④에서 생성')
  const reg2 = must(await anon.rpc('inventory_new_registration', { p_session_token: tokB, p_session_id: sid, p_reagent_id: reg.reagent_id, p_reagent: null, p_lot: { location_id: LOC1, current_stock: '50' }, p_abnormal_note: null }), 'register 2nd lot on existing reagent')
  eq(reg2.reused_reagent, true, '기존 시약 재사용(시약 중복 생성 안 함)')
  denied(await anon.rpc('inventory_new_registration', { p_session_token: null, p_session_id: sid, p_reagent_id: null, p_reagent: { name: 'NEWREG-x' }, p_lot: { location_id: LOC1 }, p_abnormal_note: null }), 'no token')
  denied(await anon.rpc('inventory_new_registration', { p_session_token: tokA, p_session_id: sid, p_reagent_id: null, p_reagent: { name: 'NEWREG-x' }, p_lot: { location_id: '00000000-0000-0000-0000-000000000000' }, p_abnormal_note: null }), 'bad location')
  denied(await anon.rpc('inventory_new_registration', { p_session_token: tokA, p_session_id: sid, p_reagent_id: null, p_reagent: { name: 'NEWREG-x' }, p_lot: { location_id: LOC1, current_stock: '500' }, p_abnormal_note: null }), 'stock>100')
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'pause' }), 'pause')
  denied(await anon.rpc('inventory_new_registration', { p_session_token: tokA, p_session_id: sid, p_reagent_id: null, p_reagent: { name: 'NEWREG-y' }, p_lot: { location_id: LOC1 }, p_abnormal_note: null }), 'register while paused')
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'cancel' }), 'cancel')
  eq(must(await service.from('reagents').select('id').like('name', 'NEWREG-%'), 'rg').length, 0, '취소 시 미확정 신규 시약 삭제')
  eq(must(await service.from('reagent_lots').select('id').eq('id', reg.lot_id), 'l').length, 0, '취소 시 미확정 신규 Lot 삭제')
  eq(must(await service.from('inventory_sessions').select('status').eq('id', sid).single(), 's').status, 'closed', 'closed')
  eq(must(await service.from('reagent_lots').select('id').in('id', [LA, LB, LC]), 'l').length, 3, '기존 장부 Lot 유지')
})

await test('new registration confirmed by finalize: flags cleared + initial stock log', async () => {
  await seedLedgerReset()
  const out = must(await adminC.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-23', p_label: 'newreg2', p_purpose: 'current_list', p_zones: null, p_location_ids: null }), 'start4')
  sid = out.session_id
  const reg = must(await anon.rpc('inventory_new_registration', { p_session_token: tokA, p_session_id: sid, p_reagent_id: null, p_reagent: { name: 'NEWREG-Final' }, p_lot: { location_id: LOC1, current_stock: '60' }, p_abnormal_note: null }), 'register')
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'review' }), 'review')
  must(await adminC.rpc('inventory_session_finalize', { p_session_id: sid }), 'finalize')
  const lot = must(await service.from('reagent_lots').select('pending_confirm,current_stock').eq('id', reg.lot_id).single(), 'lot')
  eq([lot.pending_confirm, lot.current_stock], [false, 60], '확정')
  eq(must(await service.from('reagents').select('pending_confirm').eq('id', reg.reagent_id).single(), 'rg').pending_confirm, false, '시약 확정')
  const sl = must(await service.from('stock_logs').select('*').eq('lot_id', reg.lot_id), 'sl')
  eq([sl.length, sl[0].before_stock, sl[0].after_stock], [1, 0, 60], '최초 재고 이력')
})

await test('cancel (no new registrations) leaves the ledger and history untouched', async () => {
  await seedLedgerReset()
  must(await adminC.rpc('inventory_session_start', { p_year: 2026, p_start_date: '2026-09-24', p_label: 'cancel', p_purpose: 'current_list', p_zones: null, p_location_ids: null }), 'start5')
  const s = must(await service.from('inventory_sessions').select('id').eq('label', 'cancel').single(), 's')
  sid = s.id
  const a = await countOf(LA)
  must(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a.id, p_fields: { actual_stock: 5, actual_sealed: 0 } }), 'save')
  const snap = await ledger()
  must(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'cancel' }), 'cancel')
  eq(await ledger(), snap, '장부 불변')
  eq(await logsN(), { stock: 0, hist: 0, chg: 0 }, '이력 없음')
  denied(await adminC.rpc('inventory_session_transition', { p_session_id: sid, p_action: 'cancel' }), 'double cancel')
  const a2 = await countOf(LA)
  denied(await anon.rpc('inventory_count_save', { p_session_token: tokA, p_count_id: a2.id, p_fields: { actual_stock: 6, actual_sealed: 0 } }), 'save after cancel')
})

// ── cleanup ──────────────────────────────────────────────────────────────
await wipe()
await service.from('student_sessions').delete().in('student_id', ['TEST-STU-0001', 'TEST-STU-0002'])
await service.from('admin_users').delete().eq('user_id', adminId)
for (const id of [adminId, userId]) if (id) await service.auth.admin.deleteUser(id)

console.log('\n=== RESULT SUMMARY ===')
const failed = results.filter(r => !r.ok)
console.log(`TOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length) process.exitCode = 1
