// STAGING TEST ONLY — Master Finish Phase 4/10: 시약·Lot 도메인 RPC + 내부관리번호(KNU-YYYYMMDD-NNN) 중앙 생성기.
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
const ADMIN_EMAIL = `dom-admin-${suffix}@example.test`, USER_EMAIL = `dom-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
const LOC1 = '62000000-0000-0000-0000-000000000001', LOC2 = '62000000-0000-0000-0000-000000000002'
const RX = '60000000-0000-0000-0000-000000000001'
const LX = '61000000-0000-0000-0000-000000000001'
let adminId, userId, adminC, userC, tok
const kstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '')
const PREFIX = `KNU-${kstDay}-`

async function wipe() {
  await service.from('stock_logs').delete().not('id', 'is', null)
  await service.from('location_history').delete().not('id', 'is', null)
  await service.from('admin_logs').delete().not('id', 'is', null)
  await service.from('reagent_lots').delete().or('lot_no.like.KNU-%,lot_no.like.DOM-%,lot_no.is.null')
  await service.from('reagents').delete().or('name.like.DOM-%')
  await service.from('internal_lot_counters').delete().not('day', 'is', null)
  await service.from('locations').delete().in('id', [LOC1, LOC2])
}

await test('setup: admin/non-admin users, student token, fixtures', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'DOM-TEST-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  tok = must(await anon.rpc('student_check_login', { p_student_id: 'TEST-STU-0001', p_name: 'TEST Student One', p_birth_date: '2000-01-01' }), 'login').session_token
  await wipe()
  must(await service.from('locations').insert([{ id: LOC1, room: 'DOM-ROOM-1', detail: 'A' }, { id: LOC2, room: 'DOM-ROOM-2', detail: null }]), 'locs')
  must(await service.from('reagents').upsert({ id: RX, name: 'DOM-Existing', reagent_type: 'purchased', status: 'active' }), 'reagent')
  must(await service.from('reagent_lots').insert({ id: LX, reagent_id: RX, lot_no: 'DOM-L1', sealed_count: 3, current_stock: 60, location_id: LOC1, status: 'active' }), 'lot')
})

// ── generator ─────────────────────────────────────────────────────────────
await test('generator: single number has KNU-YYYYMMDD-NNN (KST date) format; 3 sequential are consecutive', async () => {
  const one = must(await adminC.rpc('admin_next_internal_lot_nos', { p_count: 1 }), 'one')
  eq(one, [`${PREFIX}001`], '첫 번호')
  const a = must(await adminC.rpc('admin_next_internal_lot_nos', { p_count: 1 }), 'a')
  const b = must(await adminC.rpc('admin_next_internal_lot_nos', { p_count: 1 }), 'b')
  const c = must(await adminC.rpc('admin_next_internal_lot_nos', { p_count: 1 }), 'c')
  eq([a[0], b[0], c[0]], [`${PREFIX}002`, `${PREFIX}003`, `${PREFIX}004`], '순차')
})
await test('generator: batch of N is contiguous', async () => {
  const r = must(await adminC.rpc('admin_next_internal_lot_nos', { p_count: 5 }), 'batch')
  eq(r, [5, 6, 7, 8, 9].map(n => `${PREFIX}${String(n).padStart(3, '0')}`), '5개 연속')
})
await test('generator: CONCURRENT calls never return the same number', async () => {
  const rs = await Promise.all(Array.from({ length: 12 }, () => adminC.rpc('admin_next_internal_lot_nos', { p_count: 3 })))
  ok(rs.every(r => !r.error), 'all calls ok')
  const all = rs.flatMap(r => r.data)
  eq(all.length, 36, '총 개수'); eq(new Set(all).size, 36, '중복 없음')
  const nums = all.map(x => Number(x.slice(-3))).sort((x, y) => x - y)
  eq([nums[0], nums[35]], [10, 45], '연속 범위(gap 없음)')
})
await test('generator: continues after an already-existing higher number (collision avoidance)', async () => {
  must(await service.from('reagent_lots').insert({ reagent_id: RX, lot_no: `${PREFIX}200`, lot_source: 'generated:unmarked', location_id: LOC1, status: 'active' }), 'existing 200')
  const r = must(await adminC.rpc('admin_next_internal_lot_nos', { p_count: 2 }), 'after existing')
  eq(r, [`${PREFIX}201`, `${PREFIX}202`], '기존 최대값 다음부터')
})
await test('generator: unique index blocks a duplicate generated lot_no; count validated; anon/non-admin denied', async () => {
  const dup = await service.from('reagent_lots').insert({ reagent_id: RX, lot_no: `${PREFIX}200`, lot_source: 'generated:unmarked', location_id: LOC1, status: 'active' })
  ok(dup.error, '중복 자동번호가 들어감')
  const manual = await service.from('reagent_lots').insert([{ reagent_id: RX, lot_no: 'DOM-SAME', location_id: LOC1, status: 'active' }, { reagent_id: RX, lot_no: 'DOM-SAME', location_id: LOC1, status: 'active' }])
  ok(!manual.error, '제조사 Lot 번호는 중복 허용(기존 데이터 특성 유지)')
  await service.from('reagent_lots').delete().eq('lot_no', 'DOM-SAME')
  for (const n of [0, -1, 501]) denied(await adminC.rpc('admin_next_internal_lot_nos', { p_count: n }), `count ${n}`)
  denied(await anon.rpc('admin_next_internal_lot_nos', { p_count: 1 }), 'anon')
  denied(await userC.rpc('admin_next_internal_lot_nos', { p_count: 1 }), 'non-admin')
  denied(await anon.rpc('_next_internal_lot_nos', { p_count: 1 }), 'internal fn not exposed')
})

// ── student register / lot add / confirm ─────────────────────────────────────
await test('reagent_register(purchased): unconfirmed reagent+lot, registrant from token, server-generated internal lot no', async () => {
  const r = must(await anon.rpc('reagent_register', {
    p_session_token: tok, p_kind: 'purchased', p_reagent_id: null,
    p_reagent: { name: 'DOM-NewReagent', cas_no: '123-45-6', company: 'DOMCO', volume: '500', unit: 'mL', sort_letter: 'D' },
    p_lot: { location_id: LOC1, no_lot_reason: 'unmarked', cat_no: 'C-1', sealed_count: '2', current_stock: '90' },
  }), 'register')
  ok(r.lot_no.startsWith(PREFIX), '내부번호 형식')
  const lot = must(await service.from('reagent_lots').select('*').eq('id', r.lot_id).single(), 'lot')
  eq([lot.pending_confirm, lot.lot_source, lot.sealed_count, lot.current_stock, lot.location_id], [true, 'generated:unmarked', 2, 90, LOC1], 'Lot')
  const rg = must(await service.from('reagents').select('*').eq('id', r.reagent_id).single(), 'rg')
  eq([rg.pending_confirm, rg.registered_by, Number(rg.volume), rg.sort_letter], [true, 'TEST-STU-0001', 500, 'D'], '시약(등록자=세션)')
})
await test('reagent_register: reuse existing reagent (no duplicate master), manufacturer lot, self_made, validations', async () => {
  const r2 = must(await anon.rpc('reagent_register', { p_session_token: tok, p_kind: 'purchased', p_reagent_id: RX, p_reagent: null, p_lot: { location_id: LOC2, lot_no: ' DOM-MFR-1 ' } }), 'reuse')
  const lot = must(await service.from('reagent_lots').select('lot_no,lot_source,reagent_id').eq('id', r2.lot_id).single(), 'lot')
  eq([lot.lot_no, lot.lot_source, lot.reagent_id], ['DOM-MFR-1', 'manufacturer', RX], '기존 시약에 Lot만 추가')
  const r3 = must(await anon.rpc('reagent_register', { p_session_token: tok, p_kind: 'self_made', p_reagent_id: null, p_reagent: { name: 'DOM-SelfMade', volume: '100', unit: 'mL', made_date: '2026-09-20', made_purpose: '실험' }, p_lot: { location_id: LOC1 } }), 'self_made')
  const sm = must(await service.from('reagents').select('reagent_type,made_purpose,pending_confirm,location_id').eq('id', r3.reagent_id).single(), 'sm')
  eq([sm.reagent_type, sm.made_purpose, sm.pending_confirm, sm.location_id], ['self_made', '실험', true, LOC1], '직접제조')
  denied(await anon.rpc('reagent_register', { p_session_token: null, p_kind: 'purchased', p_reagent_id: null, p_reagent: { name: 'DOM-x' }, p_lot: { location_id: LOC1 } }), 'no token')
  denied(await anon.rpc('reagent_register', { p_session_token: tok, p_kind: 'purchased', p_reagent_id: null, p_reagent: { name: 'DOM-x' }, p_lot: { location_id: '00000000-0000-0000-0000-000000000000' } }), 'bad location')
  denied(await anon.rpc('reagent_register', { p_session_token: tok, p_kind: 'hax', p_reagent_id: null, p_reagent: { name: 'DOM-x' }, p_lot: { location_id: LOC1 } }), 'bad kind')
  denied(await anon.rpc('reagent_register', { p_session_token: tok, p_kind: 'purchased', p_reagent_id: null, p_reagent: { name: '  ' }, p_lot: { location_id: LOC1 } }), 'blank name')
  denied(await anon.rpc('reagent_register', { p_session_token: tok, p_kind: 'purchased', p_reagent_id: RX, p_reagent: null, p_lot: { location_id: LOC1, no_lot_reason: 'because' } }), 'bad reason')
  eq(must(await service.from('reagents').select('id').eq('name', 'DOM-x'), 'x').length, 0, '실패 시 시약 생성 없음(롤백)')
})
await test('lot_add: student adds a lot; stock_logs written by the SERVER with the student name; concurrent generated numbers unique', async () => {
  const r = must(await anon.rpc('lot_add', { p_session_token: tok, p_reagent_id: RX, p_lot: { location_id: LOC1, lot_no: 'DOM-ADD-1', sealed_count: '1', current_stock: '100', received_date: '2026-09-20', expiry_date: '2027-09-20' } }), 'lot_add')
  const lot = must(await service.from('reagent_lots').select('*').eq('id', r.lot_id).single(), 'lot')
  eq([lot.status, lot.lot_no, lot.expiry_date, lot.pending_confirm], ['active', 'DOM-ADD-1', '2027-09-20', false], 'Lot')
  const sl = must(await service.from('stock_logs').select('*').eq('lot_id', r.lot_id), 'sl')
  eq([sl.length, sl[0].user_name, sl[0].before_stock, sl[0].after_stock], [1, 'TEST Student One', 0, 100], '서버 생성 이력')
  const rs = await Promise.all(Array.from({ length: 6 }, () => anon.rpc('lot_add', { p_session_token: tok, p_reagent_id: RX, p_lot: { location_id: LOC1, no_lot_reason: 'unknown', sealed_count: '1', current_stock: '50' } })))
  ok(rs.every(x => !x.error), 'all ok')
  const nos = rs.map(x => x.data.lot_no); eq(new Set(nos).size, 6, '동시 6건 번호 유일')
  ok(nos.every(n => n.startsWith(PREFIX)), '형식')
  denied(await anon.rpc('lot_add', { p_session_token: tok, p_reagent_id: RX, p_lot: { location_id: LOC1, sealed_count: '-1' } }), 'negative sealed')
  denied(await anon.rpc('lot_add', { p_session_token: tok, p_reagent_id: RX, p_lot: { location_id: LOC1, current_stock: '101' } }), 'stock>100')
  denied(await anon.rpc('lot_add', { p_session_token: null, p_reagent_id: RX, p_lot: { location_id: LOC1 } }), 'no token')
  denied(await anon.rpc('lot_add', { p_session_token: tok, p_reagent_id: '00000000-0000-0000-0000-000000000000', p_lot: { location_id: LOC1 } }), 'unknown reagent')
})
await test('reagent_confirm: token identity; unknown reagent / bad token rejected', async () => {
  const r = must(await anon.rpc('reagent_confirm', { p_session_token: tok, p_reagent_id: RX }), 'confirm')
  eq(r.confirmed_by, 'TEST-STU-0001', 'confirmed_by')
  const rg = must(await service.from('reagents').select('confirmed_by,last_confirmed_at').eq('id', RX).single(), 'rg')
  eq(rg.confirmed_by, 'TEST-STU-0001', 'db'); ok(rg.last_confirmed_at, 'timestamp')
  denied(await anon.rpc('reagent_confirm', { p_session_token: 'bogus-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', p_reagent_id: RX }), 'bad token')
  denied(await anon.rpc('reagent_confirm', { p_session_token: tok, p_reagent_id: '00000000-0000-0000-0000-000000000000' }), 'unknown')
})
await test('reagent_enrich: fills empty columns only (never overwrites), whitelist enforced, jsonb supported', async () => {
  const e = must(await service.from('reagents').insert({ name: 'DOM-Enrich', reagent_type: 'purchased', status: 'active' }).select('id').single(), 'seed').id
  const r1 = must(await anon.rpc('reagent_enrich', { p_reagent_id: e, p_fields: { cas_no: '64-17-5', cas_source: 'auto_ghs', hazard: '인화성', hazard_source: 'auto_ghs', ghs_pictograms: 'GHS02', hazard_classifications: [{ name: '인화성 액체' }], is_yudok: 'Y' } }), 'enrich')
  ok(r1.applied.includes('cas_no') && r1.applied.includes('hazard_classifications'), 'applied ' + JSON.stringify(r1.applied))
  const r2 = must(await anon.rpc('reagent_enrich', { p_reagent_id: e, p_fields: { cas_no: '000-00-0', hazard: 'CHANGED' } }), 'enrich again')
  eq(r2.applied, [], '이미 값이 있으면 덮어쓰지 않음')
  const rg = must(await service.from('reagents').select('*').eq('id', e).single(), 'rg')
  eq([rg.cas_no, rg.cas_source, rg.hazard, rg.hazard_source, rg.ghs_pictograms, rg.is_yudok, rg.hazard_classifications[0].name], ['64-17-5', 'auto_ghs', '인화성', 'auto_ghs', 'GHS02', 'Y', '인화성 액체'], '값')
  for (const f of [{ name: 'HACK' }, { status: 'archived' }, { pending_confirm: false }, { registered_by: 'x' }]) denied(await anon.rpc('reagent_enrich', { p_reagent_id: e, p_fields: f }), `field ${Object.keys(f)[0]}`)
  denied(await anon.rpc('reagent_enrich', { p_reagent_id: '00000000-0000-0000-0000-000000000000', p_fields: { cas_no: '1-1-1' } }), 'unknown')
  eq(must(await service.from('reagents').select('name,status').eq('id', e).single(), 'rg2'), { name: 'DOM-Enrich', status: 'active' }, '다른 컬럼 불변')
})

// ── admin lot operations + audit trail is server-only ─────────────────────────
await test('admin_lot_update / set_status / move: authorization, validation, server-written audit rows', async () => {
  for (const [who, c] of [['anon', anon], ['user', userC]]) {
    denied(await c.rpc('admin_lot_update', { p_lot_id: LX, p_fields: { current_stock: 10 } }), `${who} update`)
    denied(await c.rpc('admin_lot_set_status', { p_lot_id: LX, p_status: 'missing' }), `${who} status`)
    denied(await c.rpc('admin_lot_move', { p_lot_id: LX, p_to_location_id: LOC2, p_notes: null }), `${who} move`)
  }
  must(await adminC.rpc('admin_lot_update', { p_lot_id: LX, p_fields: { current_stock: 25 } }), 'update')
  let lot = must(await service.from('reagent_lots').select('sealed_count,current_stock').eq('id', LX).single(), 'lot')
  eq([lot.sealed_count, lot.current_stock], [3, 25], '재고 조정(미개봉 유지)')
  let sl = must(await service.from('stock_logs').select('*').eq('lot_id', LX), 'sl')
  eq([sl.length, sl[0].user_name, sl[0].before_stock, sl[0].after_stock], [1, 'DOM-TEST-ADMIN', 60, 25], '이력=관리자 서버 확정')
  denied(await adminC.rpc('admin_lot_update', { p_lot_id: LX, p_fields: { current_stock: 101 } }), 'range')
  denied(await adminC.rpc('admin_lot_update', { p_lot_id: LX, p_fields: { status: 'disposed' } }), 'forbidden field')
  denied(await adminC.rpc('admin_lot_update', { p_lot_id: '00000000-0000-0000-0000-000000000000', p_fields: { current_stock: 1 } }), 'unknown lot')
  must(await adminC.rpc('admin_lot_move', { p_lot_id: LX, p_to_location_id: LOC2, p_notes: '이동 테스트' }), 'move')
  eq(must(await service.from('reagent_lots').select('location_id').eq('id', LX).single(), 'l').location_id, LOC2, '이동')
  const h = must(await service.from('location_history').select('*').eq('lot_id', LX), 'h')
  eq([h.length, h[0].moved_by, h[0].from_location_name, h[0].to_location_name, h[0].notes], [1, 'DOM-TEST-ADMIN', 'DOM-ROOM-1 - A', 'DOM-ROOM-2', '이동 테스트'], '이동 이력')
  denied(await adminC.rpc('admin_lot_move', { p_lot_id: LX, p_to_location_id: LOC2, p_notes: null }), 'same location')
  denied(await adminC.rpc('admin_lot_move', { p_lot_id: LX, p_to_location_id: '00000000-0000-0000-0000-000000000000', p_notes: null }), 'bad location')
  must(await adminC.rpc('admin_lot_set_status', { p_lot_id: LX, p_status: 'missing' }), 'missing')
  lot = must(await service.from('reagent_lots').select('status,sealed_count,current_stock').eq('id', LX).single(), 'lot2')
  eq([lot.status, lot.sealed_count, lot.current_stock], ['missing', 0, 0], '분실 처리')
  denied(await adminC.rpc('admin_lot_set_status', { p_lot_id: LX, p_status: 'disposed' }), 'status not allowed here')
  sl = must(await service.from('stock_logs').select('id').eq('lot_id', LX), 'sl2'); eq(sl.length, 2, '이력 2건')
})
await test('audit tables (stock_logs/location_history) have NO client write path — anon/user/admin JWT all denied', async () => {
  for (const [who, c] of [['anon', anon], ['user', userC], ['admin', adminC]]) {
    ok((await c.from('stock_logs').insert({ target_type: 'reagent', user_name: 'forged' })).error, `${who} INSERT stock_logs`)
    ok((await c.from('location_history').insert({ reagent_name: 'forged' })).error, `${who} INSERT location_history`)
    eq((await c.from('stock_logs').update({ user_name: 'forged' }).eq('lot_id', LX).select('id')).data?.length ?? 0, 0, `${who} UPDATE stock_logs`)
    eq((await c.from('stock_logs').delete().eq('lot_id', LX).select('id')).data?.length ?? 0, 0, `${who} DELETE stock_logs`)
  }
  ok(must(await anon.from('stock_logs').select('id').eq('lot_id', LX), 'read').length === 2, 'SELECT 유지')
})
await test('reagents / reagent_lots direct writes: anon & non-admin denied; admin JWT may insert/update but not delete', async () => {
  for (const [who, c] of [['anon', anon], ['user', userC]]) {
    ok((await c.from('reagents').insert({ name: 'DOM-hax', reagent_type: 'purchased' })).error, `${who} INSERT reagents`)
    eq((await c.from('reagents').update({ name: 'DOM-hax' }).eq('id', RX).select('id')).data?.length ?? 0, 0, `${who} UPDATE reagents`)
    eq((await c.from('reagents').delete().eq('id', RX).select('id')).data?.length ?? 0, 0, `${who} DELETE reagents`)
    ok((await c.from('reagent_lots').insert({ reagent_id: RX, location_id: LOC1 })).error, `${who} INSERT lots`)
    eq((await c.from('reagent_lots').update({ current_stock: 1 }).eq('id', LX).select('id')).data?.length ?? 0, 0, `${who} UPDATE lots`)
    eq((await c.from('reagent_lots').delete().eq('id', LX).select('id')).data?.length ?? 0, 0, `${who} DELETE lots`)
  }
  eq((await adminC.from('reagents').update({ notes: 'admin ok' }).eq('id', RX).select('id')).data?.length, 1, 'admin UPDATE reagents')
  eq((await adminC.from('reagents').delete().eq('id', RX).select('id')).data?.length ?? 0, 0, 'admin DELETE reagents blocked')
  eq(must(await service.from('reagents').select('name').eq('id', RX).single(), 'rg').name, 'DOM-Existing', '불변')
})

await wipe()
await service.from('student_sessions').delete().eq('student_id', 'TEST-STU-0001')
await service.from('admin_users').delete().eq('user_id', adminId)
for (const id of [adminId, userId]) if (id) await service.auth.admin.deleteUser(id)
console.log('\n=== RESULT SUMMARY ===')
const failed = results.filter(r => !r.ok)
console.log(`TOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length) process.exitCode = 1
