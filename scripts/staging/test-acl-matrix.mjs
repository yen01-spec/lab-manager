// STAGING TEST ONLY — Master Finish Phase 3/4: 20260920100000_least_privilege_acl.sql 검증.
// anon / 일반 Auth 사용자 / 관리자(Auth+admin_users) 3종 클라이언트로 테이블별·연산별 허용/거부를 실측한다.
// SUPABASE_SERVICE_ROLE_KEY는 커맨드라인 환경변수로만 전달.
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

const suffix = randomBytes(4).toString('hex')
const ADMIN_EMAIL = `acl-admin-${suffix}@example.test`, USER_EMAIL = `acl-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
let adminId, userId, adminC, userC

// ── 매트릭스(migration cfg와 동일해야 한다) ────────────────────────────────
const ADM = ['insert', 'update', 'delete']
const M = [
  ...['lab_rules', 'safety_briefings', 'notice_files', 'calendar_events', 'label_phrase_template', 'label_size_rule', 'signage_master',
      'school_chemical_master', 'regulation_document', 'special_material_logs', 'items', 'item_lots', 'item_locations', 'receipts', 'stock_history', 'notices', 'locations']
    .map(t => ({ t, mode: 'pub_admin', ops: ADM })),
  { t: 'purchase_requests', mode: 'pub_admin', ops: ['update', 'delete'] },
  { t: 'purchase_request_logs', mode: 'pub_admin', ops: [] },
  { t: 'admin_logs', mode: 'admin_only', ops: ['insert'] },
  { t: 'reagent_import_history', mode: 'admin_only', ops: ADM },
  { t: 'reagents', mode: 'pub_admin', ops: ['insert', 'update'] },
  { t: 'stock_logs', mode: 'pub_admin', ops: [] },
  { t: 'location_history', mode: 'pub_admin', ops: [] },
  { t: 'inventory_sessions', mode: 'pub_admin', ops: [] },
  { t: 'hazard_ledger_notes', mode: 'open', ops: ['insert', 'update'] },
]
const PAYLOAD = {
  reagents: () => ({ name: 'ACL-TEST-' + randomBytes(3).toString('hex'), reagent_type: 'purchased', status: 'active' }),
  admin_logs: () => ({ admin_name: 'acl', action: 'acl-test', target_type: 'reagent', description: 'x' }),
  locations: () => ({ room: 'ACL-ROOM' }),
  location_history: () => ({ reagent_name: 'acl' }),
  notices: () => ({ title: 'acl', type: 'notice' }),
  purchase_request_logs: () => ({}),
  // production 구조와 같은 테이블(NOT NULL/FK 포함)이라 시드에도 실제 컬럼이 필요하다. stock_logs.lot_id 는 소프트 참조(FK 없음)이지만 NOT NULL.
  stock_logs: () => ({ target_type: 'reagent', lot_id: '00000000-0000-4000-8000-0000000ac100', user_name: 'acl' }),
  special_material_logs: () => ({ substance_name: 'acl', handling_date: '2026-01-01', handler_name: 'acl' }),
  stock_history: () => ({ action: 'acl', quantity: 1 }),
  reagent_import_history: () => ({ source: '수정이력', occurred_at: new Date().toISOString() }),
  inventory_sessions: () => ({ year: 2026, start_date: '2026-01-01', created_by: 'acl' }),
}
const payload = (t) => (PAYLOAD[t] ? PAYLOAD[t]() : { v: 'acl-' + randomBytes(3).toString('hex') })
const patch = (t) => (['reagents'].includes(t) ? { name: 'ACL-UPDATED' } : t === 'locations' ? { room: 'ACL-ROOM2' } : t === 'admin_logs' ? { description: 'u' } : t === 'notices' ? { title: 'u' } : t === 'location_history' ? { reagent_name: 'u' } : t === 'purchase_request_logs' ? { status: 'approved' } : t === 'inventory_sessions' ? { label: 'u' } : t === 'stock_logs' ? { notes: 'u' } : ['special_material_logs', 'stock_history'].includes(t) ? { notes: 'u' } : t === 'reagent_import_history' ? { note: 'u' } : { v: 'updated' })

const seeded = {}
async function seed(t) { return must(await service.from(t).insert(payload(t)).select('id').single(), `seed ${t}`).id }
async function cleanupTable(t) { for (const id of [seeded[t]].filter(Boolean)) await service.from(t).delete().eq('id', id) }

const canRead = (mode, who) => mode === 'admin_only' ? who === 'admin' : true
const canWrite = (mode, ops, op, who) => mode === 'open' ? ops.includes(op) : (who === 'admin' && ops.includes(op))

async function tryOp(client, t, op, id) {
  if (op === 'select') {
    const r = await client.from(t).select('id').eq('id', id)
    return !r.error && r.data.length > 0
  }
  if (op === 'insert') { const r = await client.from(t).insert(payload(t)).select('id'); return !r.error && (r.data?.length ?? 0) > 0 }
  if (op === 'update') { const r = await client.from(t).update(patch(t)).eq('id', id).select('id'); return !r.error && r.data.length > 0 }
  if (op === 'delete') { const r = await client.from(t).delete().eq('id', id).select('id'); return !r.error && r.data.length > 0 }
}

await test('setup: create staging admin + non-admin Auth users', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'ACL-TEST-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
})

for (const { t, mode, ops } of M) {
  await test(`ACL ${t} [${mode}: ${ops.join('/') || 'read-only'}]`, async () => {
    const id = seeded[t] = await seed(t)
    const problems = []
    for (const [who, client] of [['anon', anon], ['user', userC], ['admin', adminC]]) {
      for (const op of ['select', 'insert', 'update', 'delete']) {
        const expected = op === 'select' ? canRead(mode, who) : canWrite(mode, ops, op, who)
        // delete는 행을 지우므로 마지막에 하고, 성공하면 다시 seed
        const got = await tryOp(client, t, op, seeded[t])
        if (op === 'delete' && got) seeded[t] = await seed(t)
        if (got !== expected) problems.push(`${who}.${op}: expected ${expected ? 'ALLOW' : 'DENY'} got ${got ? 'ALLOW' : 'DENY'}`)
      }
    }
    await service.from(t).delete().eq('id', id)
    await cleanupTable(t)
    if (problems.length) throw new Error(problems.join('; '))
  })
}

await test('fcm_tokens: anon may register/update device token, only admin may delete', async () => {
  const id = await seed('fcm_tokens')
  ok((await anon.from('fcm_tokens').insert({ v: 'dev' }).select('id')).data?.length === 1, 'anon insert')
  ok((await anon.from('fcm_tokens').update({ v: 'dev2' }).eq('id', id).select('id')).data?.length === 1, 'anon update')
  eq((await anon.from('fcm_tokens').delete().eq('id', id).select('id')).data?.length ?? 0, 0, 'anon delete blocked')
  eq((await userC.from('fcm_tokens').delete().eq('id', id).select('id')).data?.length ?? 0, 0, 'user delete blocked')
  eq((await adminC.from('fcm_tokens').delete().eq('id', id).select('id')).data?.length, 1, 'admin delete')
  await service.from('fcm_tokens').delete().eq('v', 'dev')
})

await test('app_settings: admin can change normal keys, never admin_password; anon/user cannot write', async () => {
  must(await service.from('app_settings').upsert({ key: 'acl_test_key', value: 'v0' }), 'seed setting')
  eq((await adminC.from('app_settings').update({ value: 'v1' }).eq('key', 'acl_test_key').select('key')).data?.length, 1, 'admin update')
  eq((await anon.from('app_settings').update({ value: 'hack' }).eq('key', 'acl_test_key').select('key')).data?.length ?? 0, 0, 'anon update blocked')
  eq((await userC.from('app_settings').update({ value: 'hack' }).eq('key', 'acl_test_key').select('key')).data?.length ?? 0, 0, 'user update blocked')
  ok((await anon.from('app_settings').insert({ key: 'acl_evil', value: 'x' })).error, 'anon insert blocked')
  ok((await adminC.from('app_settings').insert({ key: 'admin_password', value: 'x' })).error, 'admin insert admin_password blocked')
  eq((await anon.from('app_settings').select('value').eq('key', 'admin_password')).data?.length ?? 0, 0, 'admin_password unreadable')
  await service.from('app_settings').delete().eq('key', 'acl_test_key')
})

await test('notice_increment_views: anyone can +1 (nothing else); direct UPDATE of views blocked', async () => {
  const n = must(await service.from('notices').insert({ title: 'views', type: 'notice', views: 5 }).select('id').single(), 'seed').id
  must(await anon.rpc('notice_increment_views', { p_id: n }), 'rpc anon')
  eq(must(await service.from('notices').select('views').eq('id', n).single(), 'v').views, 6, 'views+1')
  eq((await anon.from('notices').update({ views: 999 }).eq('id', n).select('id')).data?.length ?? 0, 0, 'direct update blocked')
  await service.from('notices').delete().eq('id', n)
})

// ── purchase request RPCs ─────────────────────────────────────────────────
await test('purchase_request_submit: anonymous(null actor) / valid session / invalid token / whitelist / rollback', async () => {
  must(await service.from('students').upsert({ student_id: 'ACL-STU-1', name: 'ACL Student', birth_date: '2000-01-01' }), 'seed student')
  const login = must(await anon.rpc('student_check_login', { p_student_id: 'ACL-STU-1', p_name: 'ACL Student', p_birth_date: '2000-01-01' }), 'login')
  const items = [{ name: 'Ethanol', cas_no: '64-17-5', needed_amount: '1L', quantity: '2', request_id: '00000000-0000-0000-0000-000000000000', id: '00000000-0000-0000-0000-0000000000aa' }]
  const goods = [{ name: 'Beaker', quantity: 3, unit_price: 1000, shipping_fee: 0, total_price: 3000, evil: 'x' }]
  const a = must(await anon.rpc('purchase_request_submit', { p_session_token: null, p_reagent_items: items, p_goods_items: goods }), 'anonymous')
  eq(a.requested_by, null, 'anonymous actor')
  const b = must(await anon.rpc('purchase_request_submit', { p_session_token: login.session_token, p_reagent_items: items, p_goods_items: [] }), 'session')
  eq(b.requested_by, 'ACL-STU-1', 'session actor (server-derived)')
  const ri = must(await service.from('purchase_request_reagent_items').select('*').eq('request_id', b.id), 'items')
  eq([ri.length, ri[0].name, ri[0].id === '00000000-0000-0000-0000-0000000000aa'], [1, 'Ethanol', false], '항목 저장 + 주입된 id/request_id 무시')
  const gi = must(await service.from('purchase_request_goods_items').select('*').eq('request_id', a.id), 'goods')
  eq([gi.length, Number(gi[0].total_price)], [1, 3000], 'goods 저장')
  const bad = await anon.rpc('purchase_request_submit', { p_session_token: 'bogus-token-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', p_reagent_items: items, p_goods_items: [] })
  ok(bad.error, '위조/만료 토큰은 거부(익명으로 조용히 다운그레이드하면 안 됨)')
  ok((await anon.rpc('purchase_request_submit', { p_session_token: null, p_reagent_items: [], p_goods_items: [] })).error, '빈 요청 거부')
  const before = must(await service.from('purchase_request_logs').select('id'), 'logs').length
  ok((await anon.rpc('purchase_request_submit', { p_session_token: null, p_reagent_items: [{ name: 'x', reagent_id: 'not-a-uuid' }], p_goods_items: [] })).error, '잘못된 항목 거부')
  eq(must(await service.from('purchase_request_logs').select('id'), 'logs').length, before, '실패 시 로그 행도 롤백')
})
await test('purchase tables: direct INSERT/UPDATE/DELETE blocked for anon/user/admin JWT (only RPCs write)', async () => {
  const log = must(await service.from('purchase_request_logs').insert({}).select('id').single(), 'seed').id
  for (const [who, c] of [['anon', anon], ['user', userC], ['admin', adminC]]) {
    ok((await c.from('purchase_request_logs').insert({})).error, `${who} INSERT logs`)
    eq((await c.from('purchase_request_logs').update({ status: 'approved' }).eq('id', log).select('id')).data?.length ?? 0, 0, `${who} UPDATE logs`)
    ok((await c.from('purchase_request_reagent_items').insert({ request_id: log, name: 'x' })).error, `${who} INSERT items`)
    ok((await c.from('purchase_request_goods_items').insert({ request_id: log, name: 'x' })).error, `${who} INSERT goods`)
    eq((await c.from('purchase_request_logs').delete().eq('id', log).select('id')).data?.length ?? 0, 0, `${who} DELETE logs`)
  }
  await service.from('purchase_request_logs').delete().eq('id', log)
})
await test('purchase_request_log_update: admin only, server-set approver/timestamps, validated status', async () => {
  const log = must(await service.from('purchase_request_logs').insert({}).select('id').single(), 'seed').id
  ok((await anon.rpc('purchase_request_log_update', { p_id: log, p_status: 'approved', p_note: null, p_tracking_number: null, p_estimated_arrival: null })).error, 'anon denied')
  ok((await userC.rpc('purchase_request_log_update', { p_id: log, p_status: 'approved', p_note: null, p_tracking_number: null, p_estimated_arrival: null })).error, 'non-admin denied')
  must(await adminC.rpc('purchase_request_log_update', { p_id: log, p_status: 'ordered', p_note: null, p_tracking_number: 'TRK1', p_estimated_arrival: '2026-10-01' }), 'ordered')
  let row = must(await service.from('purchase_request_logs').select('*').eq('id', log).single(), 'row')
  eq([row.status, row.approved_by, row.tracking_number, row.estimated_arrival], ['ordered', 'ACL-TEST-ADMIN', 'TRK1', '2026-10-01'], '주문 처리')
  ok(row.ordered_at, 'ordered_at')
  must(await adminC.rpc('purchase_request_log_update', { p_id: log, p_status: null, p_note: null, p_tracking_number: 'TRK2', p_estimated_arrival: '' }), 'tracking only')
  row = must(await service.from('purchase_request_logs').select('*').eq('id', log).single(), 'row')
  eq([row.status, row.tracking_number, row.estimated_arrival], ['ordered', 'TRK2', null], '배송정보만 갱신')
  ok((await adminC.rpc('purchase_request_log_update', { p_id: log, p_status: 'hacked', p_note: null, p_tracking_number: null, p_estimated_arrival: null })).error, 'invalid status')
  ok((await adminC.rpc('purchase_request_log_update', { p_id: '00000000-0000-0000-0000-000000000000', p_status: 'approved', p_note: null, p_tracking_number: null, p_estimated_arrival: null })).error, 'missing id')
  await service.from('purchase_request_logs').delete().eq('id', log)
})

// ── storage ───────────────────────────────────────────────────────────────
await test('storage documents: public read; only admin can upload/overwrite/delete', async () => {
  const b = await service.storage.getBucket('documents')
  if (b.error) must(await service.storage.createBucket('documents', { public: true }), 'create bucket')
  const path = `acl-test/${suffix}.txt`
  const file = new Blob(['acl'], { type: 'text/plain' })
  ok((await anon.storage.from('documents').upload(path, file)).error, 'anon upload blocked')
  ok((await userC.storage.from('documents').upload(path, file)).error, 'non-admin upload blocked')
  must(await adminC.storage.from('documents').upload(path, file), 'admin upload')
  const pub = anon.storage.from('documents').getPublicUrl(path).data.publicUrl
  eq((await fetch(pub)).status, 200, 'public read')
  const rm = await anon.storage.from('documents').remove([path])
  eq(rm.data?.length ?? 0, 0, 'anon delete blocked')
  const rm2 = await userC.storage.from('documents').remove([path])
  eq(rm2.data?.length ?? 0, 0, 'non-admin delete blocked')
  eq((await adminC.storage.from('documents').remove([path])).data?.length, 1, 'admin delete')
})

// ── catalog: 클라이언트 롤에 남은 권한 요약(TRUNCATE/REFERENCES/TRIGGER 없음) ─────
await test('catalog: no client role holds TRUNCATE/REFERENCES/TRIGGER on any public table', async () => {
  const { execFileSync } = await import('node:child_process')
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'json', '--file', 'scripts/staging/verify-acl-matrix2.sql'], { shell: true, encoding: 'utf8', cwd: new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') })
  const rows = JSON.parse(out.slice(out.indexOf('{'))).rows[0].result
  const bad = rows.grants.filter(g => ['TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(g.p))
  eq(bad, [], '남은 위험 권한')
  const allowAll = rows.policies.filter(p => p.p === 'allow all')
  eq(allowAll.length, 0, `allow all 정책 잔존 ${JSON.stringify(allowAll.map(p => p.t))}`)
})

// ── cleanup ───────────────────────────────────────────────────────────────
await service.from('purchase_request_logs').delete().not('id', 'is', null)
await service.from('student_sessions').delete().eq('student_id', 'ACL-STU-1')
await service.from('students').delete().eq('student_id', 'ACL-STU-1')
await service.from('admin_users').delete().eq('user_id', adminId)
for (const id of [adminId, userId]) if (id) await service.auth.admin.deleteUser(id)

console.log('\n=== RESULT SUMMARY ===')
const failed = results.filter(r => !r.ok)
console.log(`TOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
if (failed.length) process.exitCode = 1
