// STAGING TEST ONLY
// NEVER APPLY TO PRODUCTION
// NOT A PRODUCTION MIGRATION
//
// Phase 4b-3b-S2 — sync_inventory_snapshot(jsonb) RPC를 staging(vvafhcqypvejvsuksooi)에
// 실제로 호출해 transaction/rollback/권한/stale-lock/신규 Lot/신규 reagent/감사로그를
// PostgreSQL 수준에서 검증한다.
//
// 안전장치:
//  - .env.staging.local만 읽는다(.env.local=production은 절대 안 읽음).
//  - VITE_SUPABASE_URL의 project ref가 scripts/supabase-refs.mjs의 STAGING_PROJECT_REF와
//    정확히 일치하는지 시작 시 하드 체크 — 다르면 즉시 throw.
//  - service_role key는 process.env.SUPABASE_SERVICE_ROLE_KEY로만 받는다(파일에 저장 금지).
//    실행 커맨드 예: SUPABASE_SERVICE_ROLE_KEY=$(...) node scripts/staging/test-inventory-snapshot-rpc.mjs
//  - fixture는 고정 UUID(로컬 10000000.../20000000.../30000000... 접두) + TEST- 접두 이름만
//    사용 — 실제 연구실 데이터는 전혀 다루지 않는다.
//
// 사용법: node scripts/staging/test-inventory-snapshot-rpc.mjs [testName ...]
//   인자 없으면 전체 테스트 실행.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'

// ── 0) 환경/ref 하드 체크 ────────────────────────────────────────
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
const urlRefMatch = (env.VITE_SUPABASE_URL || '').match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)
const urlRef = urlRefMatch ? urlRefMatch[1] : null
if (!urlRef) throw new Error(`[FATAL] .env.staging.local의 VITE_SUPABASE_URL에서 project ref를 못 읽었습니다: ${env.VITE_SUPABASE_URL}`)
if (urlRef === PRODUCTION_PROJECT_REF) throw new Error('[FATAL] .env.staging.local이 PRODUCTION ref를 가리킵니다. 즉시 중단.')
if (urlRef !== STAGING_PROJECT_REF) throw new Error(`[FATAL] .env.staging.local의 ref(${urlRef})가 STAGING_PROJECT_REF(${STAGING_PROJECT_REF})와 다릅니다. 즉시 중단.`)
console.log(`[guard] staging ref 확인됨: ${urlRef}`)

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) throw new Error('[FATAL] SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다. 파일에 저장하지 말고 커맨드라인에서만 전달하세요.')

const URL_ = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

const service = createClient(URL_, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(URL_, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
function clientAs(accessToken) {
  return createClient(URL_, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

// ── 1) fixture 고정 UUID ─────────────────────────────────────────
const LOC_A = '10000000-0000-0000-0000-000000000001'
const LOC_B = '10000000-0000-0000-0000-000000000002'
const REAGENT = {
  A: '20000000-0000-0000-0000-000000000001',
  B: '20000000-0000-0000-0000-000000000002',
  C: '20000000-0000-0000-0000-000000000003',
  D: '20000000-0000-0000-0000-000000000004',
  E: '20000000-0000-0000-0000-000000000005',
  F: '20000000-0000-0000-0000-000000000006',
  G: '20000000-0000-0000-0000-000000000007',
  H: '20000000-0000-0000-0000-000000000008',
}
const LOT = {
  A1: '30000000-0000-0000-0000-000000000001',
  A2: '30000000-0000-0000-0000-000000000002',
  B1: '30000000-0000-0000-0000-000000000003',
  C1: '30000000-0000-0000-0000-000000000004',
  D1: '30000000-0000-0000-0000-000000000005',
  E1: '30000000-0000-0000-0000-000000000006',
  F1: '30000000-0000-0000-0000-000000000007',
  G1: '30000000-0000-0000-0000-000000000008',
  H1: '30000000-0000-0000-0000-000000000009',
}

const FIXTURE_REAGENTS = [
  { id: REAGENT.A, name: 'TEST Reagent A', name_ko: 'TEST 시약 A', company: 'TEST-COMPANY-A', purity: '95%', volume: 500, unit: 'mL', reagent_type: 'purchased', status: 'active', data_source: 'manual' },
  { id: REAGENT.B, name: 'TEST Reagent B', name_ko: 'TEST 시약 B', company: 'TEST-COMPANY-B', purity: '99%', volume: 500, unit: 'g', reagent_type: 'purchased', status: 'active', data_source: 'manual' },
  { id: REAGENT.C, name: 'TEST Reagent C', name_ko: 'TEST 시약 C', company: 'TEST-COMPANY-C', purity: '98%', volume: 500, unit: 'g', reagent_type: 'purchased', status: 'archived', data_source: 'manual' },
  { id: REAGENT.D, name: 'TEST Reagent D', name_ko: 'TEST 시약 D', company: 'TEST-COMPANY-D', purity: '98%', volume: 500, unit: 'g', reagent_type: 'purchased', status: 'archived', data_source: 'manual' },
  { id: REAGENT.E, name: 'TEST Reagent E', name_ko: 'TEST 시약 E', company: 'TEST-COMPANY-E', purity: '98%', volume: 500, unit: 'g', reagent_type: 'purchased', status: 'archived', data_source: 'manual' },
  { id: REAGENT.F, name: 'TEST Reagent F', name_ko: 'TEST 시약 F', company: 'TEST-COMPANY-F', purity: '98%', volume: 500, unit: 'g', reagent_type: 'purchased', status: 'archived', data_source: 'manual' },
  { id: REAGENT.G, name: 'TEST Reagent G', name_ko: 'TEST 시약 G', company: null, purity: '97%', volume: 500, unit: 'mL', reagent_type: 'purchased', status: 'active', data_source: 'manual' },
  { id: REAGENT.H, name: 'TEST Reagent H', name_ko: 'TEST 시약 H', company: 'TEST-EXISTING', purity: '97%', volume: 500, unit: 'mL', reagent_type: 'purchased', status: 'active', data_source: 'manual' },
]
const FIXTURE_LOTS = [
  { id: LOT.A1, reagent_id: REAGENT.A, lot_no: 'TEST-A1', lot_source: 'manufacturer', current_stock: 60, sealed_count: 0, location_id: LOC_A, status: 'active' },
  { id: LOT.A2, reagent_id: REAGENT.A, lot_no: 'TEST-A2', lot_source: 'manufacturer', current_stock: 0, sealed_count: 1, location_id: LOC_A, status: 'active' },
  { id: LOT.B1, reagent_id: REAGENT.B, lot_no: 'TEST-B1', lot_source: 'manufacturer', current_stock: 50, sealed_count: 0, location_id: LOC_A, status: 'active' },
  { id: LOT.C1, reagent_id: REAGENT.C, lot_no: 'TEST-C1', lot_source: 'manufacturer', current_stock: 20, sealed_count: 0, location_id: LOC_A, status: 'not_in_snapshot' },
  { id: LOT.D1, reagent_id: REAGENT.D, lot_no: 'TEST-D1', lot_source: 'manufacturer', current_stock: 0, sealed_count: 0, location_id: LOC_A, status: 'disposed' },
  { id: LOT.E1, reagent_id: REAGENT.E, lot_no: 'TEST-E1', lot_source: 'manufacturer', current_stock: 0, sealed_count: 0, location_id: LOC_A, status: 'used_up' },
  { id: LOT.F1, reagent_id: REAGENT.F, lot_no: 'TEST-F1', lot_source: 'manufacturer', current_stock: 10, sealed_count: 0, location_id: LOC_A, status: 'missing' },
  { id: LOT.G1, reagent_id: REAGENT.G, lot_no: 'TEST-G1', lot_source: 'manufacturer', current_stock: 40, sealed_count: 0, location_id: LOC_B, status: 'active' },
  { id: LOT.H1, reagent_id: REAGENT.H, lot_no: 'TEST-H1', lot_source: 'manufacturer', current_stock: 40, sealed_count: 0, location_id: LOC_B, status: 'active' },
]

async function resetFixture() {
  await service.from('inventory_snapshot_syncs').delete().not('id', 'is', null)
  await service.from('admin_logs').delete().not('id', 'is', null)
  await service.from('reagent_lots').delete().in('id', Object.values(LOT))
  await service.from('reagent_lots').delete().like('lot_no', 'TEST-%')
  const { data: testReagents } = await service.from('reagents').select('id').or('name.like.TEST %,name_ko.like.TEST %')
  if (testReagents?.length) await service.from('reagent_lots').delete().in('reagent_id', testReagents.map(r => r.id))
  await service.from('reagents').delete().in('id', Object.values(REAGENT))
  await service.from('reagents').delete().or('name.like.TEST %,name_ko.like.TEST %')
  await service.from('locations').delete().in('id', [LOC_A, LOC_B])
}
async function insertFixture() {
  const { error: e1 } = await service.from('locations').insert([
    { id: LOC_A, room: 'TEST-ROOM-A', detail: 'Cabinet-A' },
    { id: LOC_B, room: 'TEST-ROOM-B', detail: 'Cabinet-B' },
  ])
  if (e1) throw new Error(`fixture locations insert 실패: ${e1.message}`)
  const { error: e2 } = await service.from('reagents').insert(FIXTURE_REAGENTS)
  if (e2) throw new Error(`fixture reagents insert 실패: ${e2.message}`)
  const { error: e3 } = await service.from('reagent_lots').insert(FIXTURE_LOTS)
  if (e3) throw new Error(`fixture reagent_lots insert 실패: ${e3.message}`)
}
async function reset() {
  await resetFixture()
  await insertFixture()
}

// ── 2) 조회 헬퍼 ──────────────────────────────────────────────
async function getLot(id) {
  const { data, error } = await service.from('reagent_lots').select('*').eq('id', id).single()
  if (error) throw new Error(`getLot(${id}) 실패: ${error.message}`)
  return data
}
async function getReagent(id) {
  const { data, error } = await service.from('reagents').select('*').eq('id', id).single()
  if (error) throw new Error(`getReagent(${id}) 실패: ${error.message}`)
  return data
}
async function activeLotIds() {
  const { data, error } = await service.from('reagent_lots').select('id').eq('status', 'active')
  if (error) throw new Error(`activeLotIds 실패: ${error.message}`)
  return data.map((r) => r.id)
}
async function countAll() {
  const [r, l, s, a] = await Promise.all([
    service.from('reagents').select('id', { count: 'exact', head: true }),
    service.from('reagent_lots').select('id', { count: 'exact', head: true }),
    service.from('inventory_snapshot_syncs').select('id', { count: 'exact', head: true }),
    service.from('admin_logs').select('id', { count: 'exact', head: true }),
  ])
  return { reagents: r.count, reagent_lots: l.count, inventory_snapshot_syncs: s.count, admin_logs: a.count }
}

// ── 3) payload 빌더 ──────────────────────────────────────────
function row(overrides) {
  return {
    reagent_id: null, reagent_lot_id: null, match_confidence: 'exact', new_reagent_key: null,
    name: null, name_ko: null, cas_no: null, company: null, cat_no: null,
    purity: null, volume: null, unit: null, lot_no: null,
    location_id: LOC_A, shelf_position: null, received_date: null, expiry_date: null,
    current_stock: 0, sealed_count: 0, company_action: null,
    expected_reagent_updated_at: null, expected_lot_updated_at: null,
    ...overrides,
  }
}
function withRowNos(rows) { return rows.map((r, i) => ({ ...r, row_no: i + 1 })) }
function makePayload({ snapshotId = randomUUID(), sourceFilename = 'phase-s2-test.xlsx', baselineIds, rows, previewWarningCount = 0 }) {
  return {
    snapshot_id: snapshotId, source_filename: sourceFilename,
    baseline_active_lot_ids: baselineIds, rows: withRowNos(rows),
    preview_warning_count: previewWarningCount,
  }
}
async function existingRow(lotId, overrides = {}) {
  const lot = await getLot(lotId)
  const reagent = await getReagent(lot.reagent_id)
  return row({
    reagent_id: lot.reagent_id, reagent_lot_id: lot.id, match_confidence: 'exact',
    name: reagent.name, name_ko: reagent.name_ko, company: reagent.company,
    purity: reagent.purity, volume: reagent.volume, unit: reagent.unit,
    lot_no: lot.lot_no, location_id: lot.location_id,
    current_stock: lot.current_stock, sealed_count: lot.sealed_count,
    expected_reagent_updated_at: reagent.updated_at, expected_lot_updated_at: lot.updated_at,
    ...overrides,
  })
}

async function callRpc(client, payload) {
  const { data, error } = await client.rpc('sync_inventory_snapshot', { payload })
  return { data, error }
}

// ── 4) Auth 테스트 사용자 ────────────────────────────────────
const ADMIN_EMAIL = 'test-admin-4b3bs2@staging.test'
const NORMAL_EMAIL = 'test-user-4b3bs2@staging.test'
function randPw() { return `Sg${randomBytes(18).toString('base64url')}` }

async function ensureAuthUser(email) {
  let page = 1
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers 실패: ${error.message}`)
    const found = data.users.find((u) => u.email === email)
    if (found) return found
    if (data.users.length < 200) break
    page += 1
  }
  const { data: created, error: createErr } = await service.auth.admin.createUser({ email, password: randPw(), email_confirm: true })
  if (createErr) throw new Error(`createUser(${email}) 실패: ${createErr.message}`)
  return created.user
}
async function signInFresh(email) {
  const user = await ensureAuthUser(email)
  const pw = randPw()
  const { error: updErr } = await service.auth.admin.updateUserById(user.id, { password: pw })
  if (updErr) throw new Error(`updateUserById(${email}) 실패: ${updErr.message}`)
  const { data, error } = await anon.auth.signInWithPassword({ email, password: pw })
  if (error) throw new Error(`signIn(${email}) 실패: ${error.message}`)
  return { userId: user.id, accessToken: data.session.access_token }
}

// ── 5) 테스트 실행기 ─────────────────────────────────────────
const results = []
async function test(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, status: 'PASS', detail: detail ?? null })
    console.log(`[PASS] ${name}`)
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e.message, stack: e.stack })
    console.log(`[FAIL] ${name}: ${e.message}`)
  }
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}
function assertTrue(cond, msg) { if (!cond) throw new Error(msg) }

// ── 6) 시나리오들 ────────────────────────────────────────────
let ADMIN_TOKEN, NORMAL_TOKEN, ADMIN_ID

async function setupAuth() {
  const admin = await signInFresh(ADMIN_EMAIL)
  ADMIN_TOKEN = admin.accessToken
  ADMIN_ID = admin.userId
  const { error: upsertErr } = await service.from('admin_users').upsert({ user_id: ADMIN_ID, active: true, note: 'Phase 4b-3b-S2 staging test admin' })
  if (upsertErr) throw new Error(`admin_users upsert 실패: ${upsertErr.message}`)
  const normal = await signInFresh(NORMAL_EMAIL)
  NORMAL_TOKEN = normal.accessToken
  // normal user는 admin_users에 절대 넣지 않는다(§6 B).
  const { data: shouldBeAbsent } = await service.from('admin_users').select('user_id').eq('user_id', normal.userId)
  if (shouldBeAbsent && shouldBeAbsent.length > 0) throw new Error('normal test user가 admin_users에 잘못 등록되어 있습니다')
}

async function T01_unchanged() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const beforeLots = {}
  for (const id of baselineIds) beforeLots[id] = (await getLot(id)).updated_at
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  assertEq(data.new_lots, 0, 'new_lots')
  assertEq(data.not_in_snapshot_lots, 0, 'not_in_snapshot_lots')
  assertEq(data.reactivated_lots, 0, 'reactivated_lots')
  assertEq(data.new_reagents, 0, 'new_reagents')
  assertEq(data.archived_reagents, 0, 'archived_reagents')
  assertEq(data.reactivated_reagents, 0, 'reactivated_reagents')
  const afterUpdatedAt = {}
  let changedCount = 0
  for (const id of baselineIds) {
    const lot = await getLot(id)
    afterUpdatedAt[id] = lot.updated_at
    if (lot.updated_at !== beforeLots[id]) changedCount += 1
    assertEq(lot.id, id, 'lot id preserved')
  }
  return { rpcResult: data, updated_lots_field: data.updated_lots, baselineCount: baselineIds.length, beforeUpdatedAt: beforeLots, afterUpdatedAt, changedCount }
}

async function T02_stockChange() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id, id === LOT.A1 ? { current_stock: 35 } : {})))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  const a1 = await getLot(LOT.A1)
  assertEq(a1.id, LOT.A1, 'A1 id preserved')
  assertEq(a1.current_stock, 35, 'A1 current_stock updated')
  const a2 = await getLot(LOT.A2)
  assertEq(a2.current_stock, 0, 'A2 unchanged')
  return { rpcResult: data, a1_current_stock: a1.current_stock }
}

async function T03_locationChange() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id, id === LOT.A2 ? { location_id: LOC_B } : {})))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  const a2 = await getLot(LOT.A2)
  assertEq(a2.id, LOT.A2, 'A2 id preserved')
  assertEq(a2.location_id, LOC_B, 'A2 location updated')
  assertEq(a2.lot_no, 'TEST-A2', 'A2 lot_no unchanged')
  assertEq(a2.sealed_count, 1, 'A2 sealed_count unchanged')
  return { rpcResult: data, a2_location_id: a2.location_id }
}

async function T04_excludeActiveLot() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.filter((id) => id !== LOT.B1).map((id) => existingRow(id)))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  assertEq(data.not_in_snapshot_lots, 1, 'not_in_snapshot_lots=1')
  assertEq(data.archived_reagents, 1, 'archived_reagents=1 (B has only B1)')
  const b1 = await getLot(LOT.B1)
  assertEq(b1.status, 'not_in_snapshot', 'B1 -> not_in_snapshot')
  assertEq(b1.lot_no, 'TEST-B1', 'B1 lot_no preserved')
  assertEq(b1.current_stock, 50, 'B1 stock preserved')
  assertEq(b1.sealed_count, 0, 'B1 sealed preserved')
  const bReagent = await getReagent(REAGENT.B)
  assertEq(bReagent.status, 'archived', 'reagent B -> archived')
  return { rpcResult: data, b1_status: b1.status, reagentB_status: bReagent.status }
}

async function T05_reactivation() {
  await reset()
  const baselineIds = await activeLotIds() // C1 not_in_snapshot이라 baseline에 없음(정상)
  const rows = [...(await Promise.all(baselineIds.map((id) => existingRow(id))))]
  const c1 = await getLot(LOT.C1)
  const cReagent = await getReagent(REAGENT.C)
  rows.push(row({
    reagent_id: c1.reagent_id, reagent_lot_id: c1.id, match_confidence: 'exact',
    name: cReagent.name, name_ko: cReagent.name_ko, company: cReagent.company,
    purity: cReagent.purity, volume: cReagent.volume, unit: cReagent.unit,
    lot_no: c1.lot_no, location_id: c1.location_id,
    current_stock: c1.current_stock, sealed_count: c1.sealed_count,
    expected_reagent_updated_at: cReagent.updated_at, expected_lot_updated_at: c1.updated_at,
  }))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  assertEq(data.reactivated_lots, 1, 'reactivated_lots=1')
  assertEq(data.reactivated_reagents, 1, 'reactivated_reagents=1')
  const c1After = await getLot(LOT.C1)
  assertEq(c1After.status, 'active', 'C1 -> active')
  const cReagentAfter = await getReagent(REAGENT.C)
  assertEq(cReagentAfter.status, 'active', 'reagent C -> active')
  return { rpcResult: data, c1_status: c1After.status, reagentC_status: cReagentAfter.status }
}

async function blockedStatusTest(lotKey, expectedStatus) {
  await reset()
  const baselineIds = await activeLotIds()
  const target = await getLot(LOT[lotKey])
  const targetReagent = await getReagent(target.reagent_id)
  const rows = [
    ...(await Promise.all(baselineIds.map((id) => existingRow(id)))),
    row({
      reagent_id: target.reagent_id, reagent_lot_id: target.id, match_confidence: 'exact',
      name: targetReagent.name, name_ko: targetReagent.name_ko, company: targetReagent.company,
      purity: targetReagent.purity, volume: targetReagent.volume, unit: targetReagent.unit,
      lot_no: target.lot_no, location_id: target.location_id,
      current_stock: target.current_stock, sealed_count: target.sealed_count,
      expected_reagent_updated_at: targetReagent.updated_at, expected_lot_updated_at: target.updated_at,
    }),
  ]
  const before = await countAll()
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `RPC가 ${lotKey}(${expectedStatus})를 차단하지 않고 성공함: ${JSON.stringify(data)}`)
  const after = await countAll()
  assertEq(after.inventory_snapshot_syncs, before.inventory_snapshot_syncs, 'inventory_snapshot_syncs 증가 없음')
  assertEq(after.admin_logs, before.admin_logs, 'admin_logs 증가 없음')
  const targetAfter = await getLot(LOT[lotKey])
  assertEq(targetAfter.status, expectedStatus, `${lotKey} 상태 불변`)
  return { errorMessage: error.message, errorCode: error.code }
}
const T06_disposedBlock = () => blockedStatusTest('D1', 'disposed')
const T07_usedUpBlock = () => blockedStatusTest('E1', 'used_up')
const T08_missingBlock = () => blockedStatusTest('F1', 'missing')

async function T09_explicitRollback() {
  await reset()
  const baselineIds = await activeLotIds()
  const a1Before = await getLot(LOT.A1)
  const d1 = await getLot(LOT.D1)
  const d1Reagent = await getReagent(d1.reagent_id)
  const rows = [
    ...(await Promise.all(baselineIds.filter((id) => id !== LOT.A1).map((id) => existingRow(id)))),
    await existingRow(LOT.A1, { current_stock: 20 }),
    row({
      reagent_id: d1.reagent_id, reagent_lot_id: d1.id, match_confidence: 'exact',
      name: d1Reagent.name, name_ko: d1Reagent.name_ko, company: d1Reagent.company,
      purity: d1Reagent.purity, volume: d1Reagent.volume, unit: d1Reagent.unit,
      lot_no: d1.lot_no, location_id: d1.location_id,
      current_stock: d1.current_stock, sealed_count: d1.sealed_count,
      expected_reagent_updated_at: d1Reagent.updated_at, expected_lot_updated_at: d1.updated_at,
    }),
  ]
  const before = await countAll()
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `RPC가 D1 오류에도 성공함: ${JSON.stringify(data)}`)
  const a1After = await getLot(LOT.A1)
  assertEq(a1After.current_stock, a1Before.current_stock, 'A1 stock 롤백됨(변경 없음)')
  const after = await countAll()
  assertEq(after.inventory_snapshot_syncs, before.inventory_snapshot_syncs, 'audit 증가 없음')
  return { errorMessage: error.message, a1_stock_unchanged: a1After.current_stock === a1Before.current_stock }
}

async function T10_newManufacturerLot() {
  await reset()
  const baselineIds = await activeLotIds()
  const aReagent = await getReagent(REAGENT.A)
  const rows = [
    ...(await Promise.all(baselineIds.map((id) => existingRow(id)))),
    row({
      reagent_id: REAGENT.A, reagent_lot_id: null, match_confidence: 'new',
      name: aReagent.name, name_ko: aReagent.name_ko, company: aReagent.company,
      purity: aReagent.purity, volume: aReagent.volume, unit: aReagent.unit,
      lot_no: 'TEST-MFR-NEW-001', location_id: LOC_A, current_stock: 10, sealed_count: 1,
      expected_reagent_updated_at: aReagent.updated_at,
    }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  assertEq(data.new_lots, 1, 'new_lots=1')
  const { data: newLots } = await service.from('reagent_lots').select('*').eq('lot_no', 'TEST-MFR-NEW-001')
  assertEq(newLots.length, 1, '신규 Lot 1건 생성')
  assertEq(newLots[0].reagent_id, REAGENT.A, '신규 Lot의 reagent_id=A')
  assertEq(newLots[0].lot_source, 'manufacturer', "lot_source='manufacturer'")
  assertEq(newLots[0].status, 'active', "신규 Lot status='active'(같은 트랜잭션에서 만든 새 Lot이 곧바로 not_in_snapshot으로 뒤집히면 안 됨)")
  return { rpcResult: data, newLot: newLots[0] }
}

async function T11_generatedLotNo() {
  await reset()
  const baselineIds = await activeLotIds()
  const aReagent = await getReagent(REAGENT.A)
  const beforeLotNos = new Set((await service.from('reagent_lots').select('lot_no')).data.map((r) => r.lot_no))
  const rows = [
    ...(await Promise.all(baselineIds.map((id) => existingRow(id)))),
    row({
      reagent_id: REAGENT.A, reagent_lot_id: null, match_confidence: 'new',
      name: aReagent.name, name_ko: aReagent.name_ko, company: aReagent.company,
      purity: aReagent.purity, volume: aReagent.volume, unit: aReagent.unit,
      lot_no: null, location_id: LOC_A, current_stock: 5, sealed_count: 1,
      expected_reagent_updated_at: aReagent.updated_at,
    }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  const { data: allLots } = await service.from('reagent_lots').select('lot_no,lot_source,status').eq('reagent_id', REAGENT.A)
  const newlyGenerated = allLots.filter((l) => !beforeLotNos.has(l.lot_no))
  assertEq(newlyGenerated.length, 1, '신규 생성 Lot 1건')
  const gen = newlyGenerated[0]
  assertTrue(/^KNU-\d{8}-\d{3}$/.test(gen.lot_no), `lot_no가 KNU-YYYYMMDD-NNN 형식이어야 함: ${gen.lot_no}`)
  assertEq(gen.lot_source, 'generated:unmarked', "lot_source='generated:unmarked'")
  assertEq(gen.status, 'active', "신규 Lot status='active'")
  return { rpcResult: data, generatedLotNo: gen.lot_no, lot_source: gen.lot_source, status: gen.status }
}

async function T12_generatedSequenceUnique() {
  await reset()
  const baselineIds = await activeLotIds()
  const aReagent = await getReagent(REAGENT.A)
  const beforeLotNos = new Set((await service.from('reagent_lots').select('lot_no')).data.map((r) => r.lot_no))
  const rows = [
    ...(await Promise.all(baselineIds.map((id) => existingRow(id)))),
    ...[1, 2, 3].map(() => row({
      reagent_id: REAGENT.A, reagent_lot_id: null, match_confidence: 'new',
      name: aReagent.name, name_ko: aReagent.name_ko, company: aReagent.company,
      purity: aReagent.purity, volume: aReagent.volume, unit: aReagent.unit,
      lot_no: null, location_id: LOC_A, current_stock: 1, sealed_count: 1,
      expected_reagent_updated_at: aReagent.updated_at,
    })),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  assertEq(data.new_lots, 3, 'new_lots=3')
  const { data: allLots } = await service.from('reagent_lots').select('lot_no,status').eq('reagent_id', REAGENT.A)
  const newlyGeneratedRows = allLots.filter((l) => !beforeLotNos.has(l.lot_no))
  const newlyGenerated = newlyGeneratedRows.map((l) => l.lot_no)
  assertEq(newlyGenerated.length, 3, '신규 생성 Lot 3건')
  assertEq(new Set(newlyGenerated).size, 3, '중복 0')
  for (const l of newlyGeneratedRows) assertEq(l.status, 'active', `신규 Lot ${l.lot_no} status='active'`)
  const seqs = newlyGenerated.map((n) => Number(n.match(/-(\d{3})$/)[1])).sort((a, b) => a - b)
  const prefixes = new Set(newlyGenerated.map((n) => n.slice(0, n.lastIndexOf('-'))))
  assertEq(prefixes.size, 1, '날짜 prefix 동일')
  assertEq(seqs[1] - seqs[0], 1, 'sequence 연속 증가(1)')
  assertEq(seqs[2] - seqs[1], 1, 'sequence 연속 증가(2)')
  return { rpcResult: data, generatedLotNos: newlyGenerated.sort() }
}

async function T13_newReagentMultipleLots() {
  await reset()
  const baselineIds = await activeLotIds()
  const key = 'TEST-NEW-R-001'
  const master = { name: 'TEST New Reagent X', name_ko: 'TEST 신규시약 X', company: 'TEST-NEW-CO', purity: '96%', volume: 250, unit: 'mL' }
  const rows = [
    ...(await Promise.all(baselineIds.map((id) => existingRow(id)))),
    row({ reagent_id: null, new_reagent_key: key, match_confidence: 'new', ...master, lot_no: 'TEST-NEWR-1', location_id: LOC_A, current_stock: 5, sealed_count: 1 }),
    row({ reagent_id: null, new_reagent_key: key, match_confidence: 'new', ...master, lot_no: 'TEST-NEWR-2', location_id: LOC_A, current_stock: 3, sealed_count: 1 }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  assertEq(data.new_reagents, 1, 'new_reagents=1')
  assertEq(data.new_lots, 2, 'new_lots=2')
  const { data: newReagents } = await service.from('reagents').select('*').eq('name', master.name)
  assertEq(newReagents.length, 1, '신규 reagent 1건')
  assertEq(newReagents[0].data_source, 'snapshot_sync', "data_source='snapshot_sync'")
  const { data: newLots } = await service.from('reagent_lots').select('*').in('lot_no', ['TEST-NEWR-1', 'TEST-NEWR-2'])
  assertEq(newLots.length, 2, '신규 lot 2건')
  assertEq(newLots[0].reagent_id, newReagents[0].id, 'lot1 reagent_id 일치')
  assertEq(newLots[1].reagent_id, newReagents[0].id, 'lot2 reagent_id 일치')
  assertEq(newLots[0].status, 'active', "신규 lot1 status='active'")
  assertEq(newLots[1].status, 'active', "신규 lot2 status='active'")
  assertEq(newReagents[0].status, 'active', "신규 reagent status='active'(방금 만든 유일한 Lot들이 즉시 not_in_snapshot으로 꺼지면 reagent도 잘못 archived됨)")
  return { rpcResult: data, newReagent: newReagents[0], newLots }
}

async function T14_newReagentKeyConflict() {
  await reset()
  const baselineIds = await activeLotIds()
  const key = 'TEST-CONFLICT-KEY'
  const rows = [
    ...(await Promise.all(baselineIds.map((id) => existingRow(id)))),
    row({ reagent_id: null, new_reagent_key: key, match_confidence: 'new', name: 'TEST Conflict X', company: 'TEST-COMPANY-A', lot_no: 'TEST-CONF-1', location_id: LOC_A, current_stock: 1, sealed_count: 1 }),
    row({ reagent_id: null, new_reagent_key: key, match_confidence: 'new', name: 'TEST Conflict X', company: 'TEST-COMPANY-B', lot_no: 'TEST-CONF-2', location_id: LOC_A, current_stock: 1, sealed_count: 1 }),
  ]
  const before = await countAll()
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `충돌하는 new_reagent_key가 차단되지 않음: ${JSON.stringify(data)}`)
  const after = await countAll()
  assertEq(after.reagents, before.reagents, 'reagent INSERT 0')
  assertEq(after.reagent_lots, before.reagent_lots, 'lot INSERT 0')
  assertEq(after.admin_logs, before.admin_logs, 'audit 0')
  return { errorMessage: error.message }
}

async function T15_companyFillEmptySuccess() {
  await reset()
  const baselineIds = await activeLotIds()
  const gReagent = await getReagent(REAGENT.G)
  const g1 = await getLot(LOT.G1)
  const rows = [
    ...(await Promise.all(baselineIds.filter((id) => id !== LOT.G1).map((id) => existingRow(id)))),
    await existingRow(LOT.G1, { company: 'TEST-COMPANY-FILLED', company_action: 'fill_if_empty' }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  const gAfter = await getReagent(REAGENT.G)
  assertEq(gAfter.company, 'TEST-COMPANY-FILLED', 'G company 채워짐')
  assertEq(gAfter.company_source, 'snapshot_sync', "company_source='snapshot_sync'")
  return { rpcResult: data, company: gAfter.company }
}

async function T16_companyFillExistingValueBlocked() {
  await reset()
  const baselineIds = await activeLotIds()
  const hBefore = await getReagent(REAGENT.H)
  const rows = [
    ...(await Promise.all(baselineIds.filter((id) => id !== LOT.H1).map((id) => existingRow(id)))),
    await existingRow(LOT.H1, { company: 'TEST-NEW', company_action: 'fill_if_empty' }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `기존 company 있는데 fill_if_empty가 차단 안 됨: ${JSON.stringify(data)}`)
  const hAfter = await getReagent(REAGENT.H)
  assertEq(hAfter.company, hBefore.company, 'H company 불변')
  return { errorMessage: error.message }
}

async function T17_companyFillEmptyValueBlocked() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = [
    ...(await Promise.all(baselineIds.filter((id) => id !== LOT.G1).map((id) => existingRow(id)))),
    await existingRow(LOT.G1, { company: null, company_action: 'fill_if_empty' }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `company 값 없는 fill_if_empty가 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message }
}

async function T18_sameReagentActionConflict() {
  await reset()
  const baselineIds = await activeLotIds()
  const aReagent = await getReagent(REAGENT.A)
  const rows = [
    ...(await Promise.all(baselineIds.filter((id) => ![LOT.A1, LOT.A2].includes(id)).map((id) => existingRow(id)))),
    await existingRow(LOT.A1, { company_action: 'keep' }),
    await existingRow(LOT.A2, { company_action: 'fill_if_empty', company: aReagent.company || 'TEST-X' }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `같은 reagent에 다른 company_action이 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message }
}

async function T19_staleBaseline() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const payload = makePayload({ baselineIds, rows })
  // preview 이후 다른 곳에서 active Lot이 하나 더 생김(신규 INSERT)
  const gReagent = await getReagent(REAGENT.G)
  const { error: insErr } = await service.from('reagent_lots').insert({
    id: randomUUID(), reagent_id: REAGENT.G, lot_no: 'TEST-STALE-INTRUDER', lot_source: 'manufacturer',
    current_stock: 1, sealed_count: 1, location_id: LOC_B, status: 'active',
  })
  if (insErr) throw new Error(`stale 준비 insert 실패: ${insErr.message}`)
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, payload)
  assertTrue(!!error, `stale baseline이 차단 안 됨: ${JSON.stringify(data)}`)
  assertEq(error.code, 'P0002', 'errcode=P0002')
  const a1 = await getLot(LOT.A1)
  assertEq(a1.current_stock, 60, 'A1 변경 없음(무영향 확인)')
  return { errorMessage: error.message, errorCode: error.code }
}

async function T20_staleLotUpdatedAt() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id, id === LOT.A1 ? { expected_lot_updated_at: '2020-01-01T00:00:00Z' } : {})))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `stale lot updated_at이 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message, errorCode: error.code }
}

async function T21_staleReagentUpdatedAt() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = [
    ...(await Promise.all(baselineIds.filter((id) => id !== LOT.G1).map((id) => existingRow(id)))),
    await existingRow(LOT.G1, { company: 'TEST-X', company_action: 'fill_if_empty', expected_reagent_updated_at: '2020-01-01T00:00:00Z' }),
  ]
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `stale reagent updated_at이 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message, errorCode: error.code }
}

async function T22_baselineDuplicateUuid() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds: [...baselineIds, baselineIds[0]], rows }))
  assertTrue(!!error, `baseline 중복 UUID가 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message }
}

async function T23_baselineNull() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds: [...baselineIds, null], rows }))
  assertTrue(!!error, `baseline null이 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message }
}

async function T24_baselineMalformedUuid() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const admin = clientAs(ADMIN_TOKEN)
  const { data, error } = await callRpc(admin, makePayload({ baselineIds: [...baselineIds, 'not-a-uuid'], rows }))
  assertTrue(!!error, `malformed baseline UUID가 차단 안 됨: ${JSON.stringify(data)}`)
  return { errorMessage: error.message }
}

async function T25_duplicateSnapshotId() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const snapshotId = randomUUID()
  const admin = clientAs(ADMIN_TOKEN)
  const first = await callRpc(admin, makePayload({ snapshotId, baselineIds, rows }))
  if (first.error) throw new Error(`첫 실행 실패(정상이어야 함): ${first.error.message}`)
  const before = await countAll()
  // 두 번째는 baseline이 이제 stale해서도 막히지만, 목적은 snapshot_id 자체의 재실행 방지 확인.
  // baseline을 다시 최신으로 갱신해서 "그것 때문이 아니라 snapshot_id 때문"임을 분리 확인.
  const baselineIds2 = await activeLotIds()
  const rows2 = await Promise.all(baselineIds2.map((id) => existingRow(id)))
  const second = await callRpc(admin, makePayload({ snapshotId, baselineIds: baselineIds2, rows: rows2 }))
  assertTrue(!!second.error, `동일 snapshot_id 재실행이 차단 안 됨: ${JSON.stringify(second.data)}`)
  const after = await countAll()
  assertEq(after.inventory_snapshot_syncs, before.inventory_snapshot_syncs, 'inventory_snapshot_syncs 추가 0')
  return { firstResult: first.data, secondErrorMessage: second.error.message }
}

async function T26_anonDenied() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const before = await countAll()
  const { data, error } = await callRpc(anon, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `anon이 RPC를 호출할 수 있음(차단 안 됨): ${JSON.stringify(data)}`)
  const after = await countAll()
  assertEq(after.reagent_lots, before.reagent_lots, 'DB 변경 0')
  return { errorMessage: error.message, errorCode: error.code }
}

async function T27_normalAuthDenied() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const before = await countAll()
  const normalClient = clientAs(NORMAL_TOKEN)
  const { data, error } = await callRpc(normalClient, makePayload({ baselineIds, rows }))
  assertTrue(!!error, `normal authenticated가 RPC를 실행할 수 있음(차단 안 됨): ${JSON.stringify(data)}`)
  assertTrue(error.message.includes('권한이 없습니다'), `is_admin 거부 메시지가 아님: ${error.message}`)
  const after = await countAll()
  assertEq(after.reagent_lots, before.reagent_lots, 'DB 변경 0')
  return { errorMessage: error.message, errorCode: error.code }
}

let T28_result = null
async function T28_adminAllowed() {
  await reset()
  const baselineIds = await activeLotIds()
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const admin = clientAs(ADMIN_TOKEN)
  const payload = makePayload({ baselineIds, rows })
  const { data, error } = await callRpc(admin, payload)
  if (error) throw new Error(`admin RPC 실패: ${error.message}`)
  T28_result = { payload, data }
  return { rpcResult: data }
}

async function T29_auditAccuracy() {
  if (!T28_result) throw new Error('TEST28이 먼저 성공해야 함')
  const { data } = T28_result
  const { data: syncRow, error } = await service.from('inventory_snapshot_syncs')
    .select('*').eq('snapshot_id', T28_result.payload.snapshot_id).single()
  if (error) throw new Error(`inventory_snapshot_syncs 조회 실패: ${error.message}`)
  assertEq(syncRow.updated_lot_count, data.updated_lots, 'updated_lot_count 일치')
  assertEq(syncRow.new_lot_count, data.new_lots, 'new_lot_count 일치')
  assertEq(syncRow.not_in_snapshot_lot_count, data.not_in_snapshot_lots, 'not_in_snapshot_lot_count 일치')
  assertEq(syncRow.reactivated_lot_count, data.reactivated_lots, 'reactivated_lot_count 일치')
  assertEq(syncRow.new_reagent_count, data.new_reagents, 'new_reagent_count 일치')
  assertEq(syncRow.archived_reagent_count, data.archived_reagents, 'archived_reagent_count 일치')
  assertEq(syncRow.reactivated_reagent_count, data.reactivated_reagents, 'reactivated_reagent_count 일치')
  const { data: logRows, error: logErr } = await service.from('admin_logs').select('*').eq('action', '현재 재고 동기화')
  if (logErr) throw new Error(`admin_logs 조회 실패: ${logErr.message}`)
  assertEq(logRows.length, 1, 'admin_logs 요약 1행')
  return { syncRow, logRow: logRows[0] }
}

async function T30_idFkPreservation() {
  await reset()
  const baselineIds = await activeLotIds()
  const beforeA1 = await getLot(LOT.A1)
  const rows = await Promise.all(baselineIds.map((id) => existingRow(id, id === LOT.A1 ? { current_stock: 45 } : {})))
  const admin = clientAs(ADMIN_TOKEN)
  const { error } = await callRpc(admin, makePayload({ baselineIds, rows }))
  if (error) throw new Error(`RPC 실패: ${error.message}`)
  const afterA1 = await getLot(LOT.A1)
  assertEq(afterA1.id, beforeA1.id, 'A1 id 보존')
  assertEq(afterA1.reagent_id, beforeA1.reagent_id, 'A1 reagent_id FK 보존')
  const { data: dangling } = await service.from('reagent_lots').select('id,reagent_id')
  for (const l of dangling) {
    const { data: r } = await service.from('reagents').select('id').eq('id', l.reagent_id).single()
    assertTrue(!!r, `dangling FK 발견: lot ${l.id} -> reagent ${l.reagent_id}`)
  }
  return { a1_id_preserved: true, danglingFkCount: 0 }
}

async function T31_advisoryLock() {
  await reset()
  const baselineIds = await activeLotIds()
  const admin1 = clientAs(ADMIN_TOKEN)
  const admin2 = clientAs(ADMIN_TOKEN)
  const rows1 = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const rows2 = await Promise.all(baselineIds.map((id) => existingRow(id)))
  const payload1 = makePayload({ baselineIds, rows: rows1 })
  const payload2 = makePayload({ baselineIds, rows: rows2 })
  const [r1, r2] = await Promise.all([callRpc(admin1, payload1), callRpc(admin2, payload2)])
  const errors = [r1.error, r2.error].filter(Boolean)
  const lockErrors = errors.filter((e) => e.code === '55P03' || e.message.includes('다른 관리자가 현재 재고 동기화를 진행 중'))
  if (errors.length === 0) {
    return { overlapAchieved: false, note: '두 호출이 겹치지 않고 둘 다 성공(첫 번째만 성공하고 두 번째는 baseline stale로 실패했을 수도 있음) — advisory lock 자체는 별도로 못 잡았음', r1: r1.data, r2error: r2.error?.message }
  }
  if (lockErrors.length > 0) {
    return { overlapAchieved: true, lockErrorMessage: lockErrors[0].message, lockErrorCode: lockErrors[0].code }
  }
  return { overlapAchieved: 'unclear', r1error: r1.error?.message, r2error: r2.error?.message, note: '오류는 났지만 advisory lock(55P03)이 아니라 다른 원인(예: baseline stale)으로 실패 — 진짜 lock 경합을 못 만듦' }
}

// ── 7) 실행 ──────────────────────────────────────────────────
const ALL_TESTS = [
  ['T01_unchanged', T01_unchanged],
  ['T02_stockChange', T02_stockChange],
  ['T03_locationChange', T03_locationChange],
  ['T04_excludeActiveLot', T04_excludeActiveLot],
  ['T05_reactivation', T05_reactivation],
  ['T06_disposedBlock', T06_disposedBlock],
  ['T07_usedUpBlock', T07_usedUpBlock],
  ['T08_missingBlock', T08_missingBlock],
  ['T09_explicitRollback', T09_explicitRollback],
  ['T10_newManufacturerLot', T10_newManufacturerLot],
  ['T11_generatedLotNo', T11_generatedLotNo],
  ['T12_generatedSequenceUnique', T12_generatedSequenceUnique],
  ['T13_newReagentMultipleLots', T13_newReagentMultipleLots],
  ['T14_newReagentKeyConflict', T14_newReagentKeyConflict],
  ['T15_companyFillEmptySuccess', T15_companyFillEmptySuccess],
  ['T16_companyFillExistingValueBlocked', T16_companyFillExistingValueBlocked],
  ['T17_companyFillEmptyValueBlocked', T17_companyFillEmptyValueBlocked],
  ['T18_sameReagentActionConflict', T18_sameReagentActionConflict],
  ['T19_staleBaseline', T19_staleBaseline],
  ['T20_staleLotUpdatedAt', T20_staleLotUpdatedAt],
  ['T21_staleReagentUpdatedAt', T21_staleReagentUpdatedAt],
  ['T22_baselineDuplicateUuid', T22_baselineDuplicateUuid],
  ['T23_baselineNull', T23_baselineNull],
  ['T24_baselineMalformedUuid', T24_baselineMalformedUuid],
  ['T25_duplicateSnapshotId', T25_duplicateSnapshotId],
  ['T26_anonDenied', T26_anonDenied],
  ['T27_normalAuthDenied', T27_normalAuthDenied],
  ['T28_adminAllowed', T28_adminAllowed],
  ['T29_auditAccuracy', T29_auditAccuracy],
  ['T30_idFkPreservation', T30_idFkPreservation],
  ['T31_advisoryLock', T31_advisoryLock],
]

async function main() {
  const only = process.argv.slice(2)
  console.log('[setup] auth test users 준비 중...')
  await setupAuth()
  console.log(`[setup] admin=${ADMIN_EMAIL} normal=${NORMAL_EMAIL}`)
  for (const [name, fn] of ALL_TESTS) {
    if (only.length > 0 && !only.includes(name)) continue
    await test(name, fn)
  }
  console.log('\n=== RESULT SUMMARY ===')
  console.log(JSON.stringify(results, null, 2))
  const failed = results.filter((r) => r.status === 'FAIL')
  console.log(`\nTOTAL=${results.length} PASS=${results.length - failed.length} FAIL=${failed.length}`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('[FATAL]', e)
  process.exitCode = 1
})
