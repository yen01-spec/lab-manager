// STAGING TEST ONLY — 전체 백업(JSON ZIP + Excel 사본) → restore dry-run → 빈 대상 single-transaction 전체 복원 → 원본/복원본 비교.
// ⚠ 이 스위트는 복원 범위 테이블을 비우고 합성 데이터로 채운다(staging 전용). 다른 스위트 뒤에 마지막으로 실행할 것.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'
import { buildBackupZip, readBackupZip } from '../../src/lib/backupZip.js'
import { buildBackupExcel } from '../../src/lib/backupExcel.js'

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

const ORDER = ['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests', 'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history', 'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs']
const suffix = randomBytes(4).toString('hex')
const ADMIN_EMAIL = `bk-admin-${suffix}@example.test`, USER_EMAIL = `bk-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
let adminC, userC, adminId, userId

const countOf = async t => { const r = await service.from(t).select('*', { count: 'exact', head: true }); if (r.error) throw new Error(t + ': ' + r.error.message); return r.count }
const counts = async () => Object.fromEntries(await Promise.all(ORDER.map(async t => [t, await countOf(t)])))
const allRows = async t => { let all = [], from = 0; for (;;) { const r = must(await service.from(t).select('*').range(from, from + 999), t); all = all.concat(r); if (r.length < 1000) break; from += 1000 } return all }
const insertBatch = async (t, rows) => { for (let i = 0; i < rows.length; i += 400) must(await service.from(t).insert(rows.slice(i, i + 400)), 'insert ' + t) }
// 범위 밖 테이블이 범위 안 테이블(students/reagents)을 FK 로 참조한다(구매요청 등) — 하네스는 그것들도 먼저 비운다(staging 전용).
const OUT_OF_SCOPE_CHILDREN = ['purchase_request_reagent_items', 'purchase_request_goods_items', 'purchase_request_logs']
const wipe = async () => { for (const t of OUT_OF_SCOPE_CHILDREN) await service.from(t).delete().not('id', 'is', null); for (const t of [...ORDER].reverse()) { const pk = t === 'students' ? 'student_id' : 'id'; const r = await service.from(t).delete().not(pk, 'is', null); if (r.error) throw new Error('wipe ' + t + ': ' + r.error.message) } }
const clone = o => JSON.parse(JSON.stringify(o))

// ── 합성 데이터(production 규모: 시약 1,323 / 병 1,524, 같은 lot_no 다행, 고아 stock_logs 2건, 미개봉 병, jsonb/배열/유니코드/개행) ──
async function seed() {
  const stu = ['TEST-STU-0001', 'TEST-STU-0002', 'BK-STU-001', 'BK-STU-002', 'BK-STU-003']
  const S = (student_id, name, birth_date) => ({ student_id, name, birth_date, is_admin: false, is_super: false, password_hash: null })   // 벌크 insert 는 키가 다르면 NULL 로 채우므로 전 컬럼 명시
  await insertBatch('students', [
    S('TEST-STU-0001', 'TEST Student One', '2000-01-01'), S('TEST-STU-0002', 'TEST Student Two', '2001-02-02'),
    S('BK-STU-001', '홍길동 "따옴표"', '1999-12-31'), S('BK-STU-002', "Kim, O'Neil", '1998-07-07'), S('BK-STU-003', '이' + String.fromCharCode(10) + '개행', '1997-03-03'),
  ])
  const locs = Array.from({ length: 14 }, (_, i) => ({ id: randomUUID(), room: `BK-${i % 5 + 1}호`, detail: i % 3 ? `${String.fromCharCode(65 + i)}-시약장` : null }))
  await insertBatch('locations', locs)
  const reagents = Array.from({ length: 1323 }, (_, i) => ({
    id: randomUUID(), name: `BK Reagent ${String(i).padStart(4, '0')} ${i % 7 === 0 ? 'ß·한글 "q" \\ backslash' : ''}`.trim(), name_ko: i % 4 ? `시약 ${i}` : null,
    cas_no: `${1000 + i}-${String(i % 100).padStart(2, '0')}-${i % 10}`, company: ['Daejung', 'Sigma-Aldrich', 'Junsei', 'Samchun'][i % 4], purity: i % 5 ? '99%' : null,
    volume: (i % 6 + 1) * 250.5, unit: 'mL', reagent_type: 'purchased', status: 'active', data_source: 'manual', category: i % 3 ? '무기' : '유기',
    hazard_classifications: i % 9 === 0 ? { flammable: true, list: [1, 2, 3], note: '메모' } : null, ghs_pictograms: i % 9 === 0 ? 'GHS02,GHS07' : null,
    sort_letter: String.fromCharCode(65 + (i % 26)), location_id: locs[i % 14].id, notes: i % 11 === 0 ? '줄1\n줄2 \t tab' : null,
    registered_by: stu[i % 5], confirmed_by: i % 13 === 0 ? stu[(i + 1) % 5] : null, pending_confirm: i % 50 === 0,
    created_at: `2026-09-10T17:54:59.${String(100000 + i).slice(-6)}+00:00`,
  }))
  await insertBatch('reagents', reagents)
  const lots = []
  reagents.forEach((r, i) => {
    const n = i < 132 ? 2 + (i % 2) : 1                                   // 일부 시약은 병이 여러 개(같은 lot_no 다행)
    for (let k = 0; k < n; k++) lots.push({
      id: randomUUID(), reagent_id: r.id, lot_no: i % 3 === 0 ? null : (k === 0 || i % 2 ? `LOT-${i}` : `LOT-${i}`), sealed_count: (i + k) % 10 === 0 ? 1 : 0,
      current_stock: (i + k) % 10 === 0 ? 0 : (i * 7 + k * 13) % 100, location_id: locs[(i + k) % 14].id,
      status: i % 40 === 0 ? 'disposed' : i % 55 === 0 ? 'used_up' : 'active', received_date: i % 10 ? null : '2025-03-04', expiry_date: '2027-01-31',
      needs_review: i % 17 === 0, pending_confirm: false, cat_no: `CAT-${i}`, shelf_position: null, review_note: null, created_at: `2026-09-11T00:00:00.${String(200000 + i).slice(-6)}+00:00`,
    })
  })
  const extra = 1524 - lots.length
  for (let i = 0; i < Math.max(0, extra); i++) lots.push({ ...clone(lots[i]), id: randomUUID() })
  await insertBatch('reagent_lots', lots)
  const active = lots.filter(l => l.status === 'active')
  const now = new Date().toISOString()
  await insertBatch('location_history', active.slice(0, 60).map((l, i) => ({ id: randomUUID(), reagent_id: l.reagent_id, lot_id: l.id, reagent_name: 'BK', from_location_id: locs[i % 14].id, from_location_name: `BK-${i % 14}`, to_location_id: locs[(i + 1) % 14].id, to_location_name: `BK-${(i + 1) % 14}`, moved_by: 'BK-ADMIN', notes: i % 2 ? '이동 메모' : null })))
  await insertBatch('location_requests', active.slice(100, 130).map((l, i) => ({ id: randomUUID(), reagent_id: l.reagent_id, lot_id: l.id, reagent_name: 'BK', from_location_id: l.location_id, from_location_name: 'from', to_location_id: locs[(i + 2) % 14].id, to_location_name: 'to', requested_by: 'BK', status: i % 3 ? 'pending' : 'approved', notes: null, review_note: i % 5 ? null : '사유' })))
  await insertBatch('disposal_requests', active.slice(200, 225).map((l, i) => ({ id: randomUUID(), reagent_id: l.reagent_id, lot_id: l.id, reagent_name: 'BK', lot_no: l.lot_no, quantity: null, reason: '파손', requested_by: 'BK', requested_by_student_id: stu[i % 5], status: i % 4 ? 'pending' : 'rejected', review_note: i % 4 ? null : '반려' })))
  await insertBatch('reagent_change_requests', reagents.slice(300, 320).map((r, i) => ({ id: randomUUID(), reagent_id: r.id, requested_by: 'BK', requested_by_student_id: stu[i % 5], field_name: 'company', old_value: 'a', new_value: 'b', status: 'pending' })))
  await insertBatch('stock_history', lots.slice(0, 15).map((l, i) => ({ id: randomUUID(), reagent_id: l.reagent_id, lot_id: l.id, reagent_name: 'BK', action: 'adjust', quantity: 1.5, unit: 'mL', before_stock: 50, after_stock: 49.5, user_name: 'BK', notes: null })))
  await insertBatch('stock_logs', [
    ...lots.slice(0, 18).map((l, i) => ({ id: randomUUID(), target_type: 'reagent', lot_id: l.id, user_name: 'BK', before_sealed: 1, after_sealed: 0, before_stock: 0, after_stock: 50 - i, notes: null })),
    { id: randomUUID(), target_type: 'reagent', lot_id: randomUUID(), user_name: 'ORPHAN-1', before_sealed: 0, after_sealed: 0, before_stock: 1, after_stock: 1 },   // 고아(소프트 참조) 2건 — production 에도 존재
    { id: randomUUID(), target_type: 'reagent', lot_id: randomUUID(), user_name: 'ORPHAN-2', before_sealed: 0, after_sealed: 0, before_stock: 1, after_stock: 1 },
  ])
  await insertBatch('reagent_import_history', reagents.slice(0, 20).map((r, i) => ({ id: randomUUID(), reagent_id: r.id, source: i % 2 ? '수정이력' : '검토의견', category: null, field_name: 'name', old_value: 'x', new_value: 'y', note: null, location_text: null, occurred_at: now })))
  await insertBatch('special_material_logs', reagents.slice(0, 5).map((r, i) => ({ id: randomUUID(), reagent_id: r.id, substance_name: 'S', cas_no: '1-1-1', handling_date: '2026-09-01', amount: '1g', handler_name: 'H', notes: null })))
  const sess = must(await service.from('inventory_sessions').insert([{ year: 2026, start_date: '2026-09-01', status: 'completed', created_by: 'BK', label: '2026-2 전수조사', purpose: 'full_census', zones: ['5층', '303호', '"quote"'] }, { year: 2027, start_date: '2027-03-01', status: 'open', created_by: 'BK', label: null, purpose: 'current_list', zones: [] }]).select(), 'sessions')
  await insertBatch('inventory_assignments', [{ session_id: sess[0].id, zone: '5층', assigned_to: 'BK', assigned_student_id: 'BK-STU-001', status: 'done' }, { session_id: sess[0].id, zone: '303호', assigned_to: 'BK2', assigned_student_id: null, status: 'pending' }])
  await insertBatch('inventory_counts', lots.slice(0, 40).map((l, i) => ({ session_id: sess[0].id, reagent_id: l.reagent_id, lot_id: l.id, book_sealed: 0, book_stock: 50, actual_sealed: 0, actual_stock: 50 - i, counted_by: 'BK', counted_by_student_id: 'BK-STU-001', is_locked: false, staged_reagent_fields: i % 5 === 0 ? { name: '변경', arr: [1, { a: null }] } : null, book_status: 'active', book_location_id: l.location_id })))
  await insertBatch('admin_logs', Array.from({ length: 35 }, (_, i) => ({ admin_name: 'BK-ADMIN', action: `작업 ${i}`, target_type: 'reagent', target_id: i % 3 ? null : i, description: i % 2 ? '설명 "따옴표" \\ 역슬래시' : null })))
  return { locs, reagents, lots }
}

let snapshot, zipBytes, parsed, data
await test('setup: admin/non-admin users, wipe scope tables, seed production-scale synthetic data', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'BK-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  await service.from('app_settings').delete().eq('key', 'restore_enabled')
  await wipe()
  data = await seed()
  const c = await counts()
  ok(c.reagents === 1323 && c.reagent_lots === 1524, JSON.stringify(c))
  return c
})

await test('schema parity: scope tables have the production FKs (children reference reagent_lots / reagents / students for real)', async () => {
  // FK 위반이 실제로 거부되는지로 확인한다(존재하지 않는 부모 참조 INSERT 는 실패해야 함).
  const bogus = randomUUID()
  denied(await service.from('reagent_lots').insert({ id: randomUUID(), reagent_id: bogus, sealed_count: 0, current_stock: 1, status: 'active' }), 'lot → reagents FK')
  denied(await service.from('location_history').insert({ id: randomUUID(), lot_id: bogus }), 'location_history → reagent_lots FK')
  denied(await service.from('disposal_requests').insert({ id: randomUUID(), lot_id: bogus, status: 'pending' }), 'disposal_requests → reagent_lots FK')
  denied(await service.from('reagents').insert({ id: randomUUID(), name: 'x', reagent_type: 'purchased', status: 'active', registered_by: 'NO-SUCH-STUDENT' }), 'reagents → students FK')
  ok((await service.from('stock_logs').insert({ id: randomUUID(), target_type: 'reagent', lot_id: bogus, user_name: 'soft-ref' })).error === null, 'stock_logs.lot_id 는 FK 없는 소프트 참조(production 과 동일)')
  await service.from('stock_logs').delete().eq('user_name', 'soft-ref')
})

// ══ 백업 ═══════════════════════════════════════════════════════════════════
await test('BACKUP: admin_backup_export — admin only; snapshot has manifest fields, counts == DB, digests present', async () => {
  denied(await anon.rpc('admin_backup_export'), 'anon'); denied(await userC.rpc('admin_backup_export'), 'non-admin')
  snapshot = must(await adminC.rpc('admin_backup_export'), 'export')
  const c = await counts()
  eq(snapshot.table_order, ORDER, '복원 순서(부모→자식)')
  for (const t of ORDER) eq(snapshot.table_counts[t], c[t], `스냅샷 행 수 == DB 행 수 (${t})`)
  ok(snapshot.backup_version === 1 && snapshot.created_at && /^v1-[0-9a-f]{12}$/.test(snapshot.schema_version), 'manifest 필드')
  ok(ORDER.every(t => /^[0-9a-f]{32}$/.test(snapshot.table_digests[t]) && Array.isArray(snapshot.table_columns[t]) && snapshot.tables[t].length === c[t]), 'digest/columns/rows')
  return { schema_version: snapshot.schema_version, total: Object.values(c).reduce((a, b) => a + b, 0) }
})
await test('BACKUP: JSON ZIP build → read back (sha256 + counts verified); tampering / corruption is detected', async () => {
  zipBytes = await buildBackupZip(snapshot, { appVersion: '0.0.0-test' })
  parsed = await readBackupZip(zipBytes)
  eq(parsed.problems, [], '정상 ZIP 문제 없음')
  const mf = parsed.manifest
  ok(mf.backup_version === 1 && mf.created_at && mf.app_version === '0.0.0-test' && mf.schema_version === snapshot.schema_version && JSON.stringify(mf.table_counts) === JSON.stringify(snapshot.table_counts), 'manifest: backup_version/created_at/app_version/schema_version/table_counts')
  ok(Object.keys(mf.files).length === ORDER.length && Object.values(mf.files).every(h => /^[0-9a-f]{64}$/.test(h)), '파일별 sha256')
  // 변조: reagents.json 한 글자 수정
  const z = await JSZip.loadAsync(zipBytes)
  const txt = await z.file('tables/reagents.json').async('string')
  z.file('tables/reagents.json', txt.replace('BK Reagent 0001', 'BK Reagent 9999'))
  const bad = await readBackupZip(await z.generateAsync({ type: 'uint8array' }))
  ok(bad.problems.some(p => p.includes('sha256')), 'sha256 불일치 감지: ' + bad.problems.join('|'))
  const z2 = await JSZip.loadAsync(zipBytes); z2.remove('manifest.json')
  ok((await readBackupZip(await z2.generateAsync({ type: 'uint8array' }))).problems[0].includes('manifest.json'), 'manifest 누락 감지')
  ok((await readBackupZip(new Uint8Array([1, 2, 3]))).problems[0].includes('ZIP'), 'ZIP 아님 감지')
  return { zipBytes: zipBytes.length }
})
await test('BACKUP: Excel viewing copy — 요약 + one sheet per table, rows == snapshot, reagent_lots has readable name columns', async () => {
  const wb = await buildBackupExcel(snapshot, { ExcelJSLib: ExcelJS, appVersion: '0.0.0-test' })
  const rb = new ExcelJS.Workbook(); await rb.xlsx.load(await wb.xlsx.writeBuffer())
  eq(rb.worksheets.map(w => w.name), ['요약', ...ORDER], '시트 구성')
  for (const t of ORDER) ok(rb.getWorksheet(t).rowCount === snapshot.table_counts[t] + 1, `${t} 행 수`)
  const lotsHead = rb.getWorksheet('reagent_lots').getRow(1).values.slice(1)
  ok(['시약명(참고)', '제조사(참고)', '위치명(참고)'].every(h => lotsHead.includes(h)), '병 시트에 이름 열')
  ok(String(rb.getWorksheet('요약').getRow(2).getCell(1).value).includes('복원에는 반드시 JSON ZIP'), 'Excel 은 복원용이 아님을 명시')
})

// ══ dry-run ═══════════════════════════════════════════════════════════════
const dry = (payload) => adminC.rpc('admin_restore_full', { p_payload: payload, p_dry_run: true, p_confirm: null })
await test('DRY-RUN on a NON-empty target: blocked with target_not_empty for every table, zero writes', async () => {
  const before = await counts()
  const r = must(await dry(parsed.payload), 'dry')
  ok(r.ok === false && r.committed === false, '차단')
  const flagged = r.issues.filter(i => i.code === 'target_not_empty').map(i => i.table)
  eq(flagged, ORDER, '모든 테이블 target_not_empty')
  eq(await counts(), before, '행 수 불변')
})
await test('DRY-RUN authorization: anon / non-admin denied', async () => {
  denied(await anon.rpc('admin_restore_full', { p_payload: parsed.payload, p_dry_run: true }), 'anon'); denied(await userC.rpc('admin_restore_full', { p_payload: parsed.payload, p_dry_run: true }), 'non-admin')
  denied(await anon.rpc('admin_restore_status'), 'status anon')
})

let originalIds, originalRows
await test('WIPE (staging harness): keep the originals in memory, empty every scope table', async () => {
  originalRows = Object.fromEntries(await Promise.all(ORDER.map(async t => [t, await allRows(t)])))
  originalIds = Object.fromEntries(ORDER.map(t => [t, originalRows[t].map(r => r.id ?? r.student_id).sort()]))
  await wipe()
  const c = await counts()
  ok(Object.values(c).every(n => n === 0), JSON.stringify(c))
})
await test('DRY-RUN on the empty target with the valid backup: ok, would_insert == manifest counts, digests verified, ZERO writes', async () => {
  const r = must(await dry(parsed.payload), 'dry')
  ok(r.ok === true && r.committed === false && r.digests_match === true && !r.error, JSON.stringify(r).slice(0, 300))
  eq(r.would_insert, snapshot.table_counts, '복원 예정 행 수')
  const c = await counts(); ok(Object.values(c).every(n => n === 0), 'dry-run 후에도 비어 있음: ' + JSON.stringify(c))
})
await test('DRY-RUN failures are reported without writing: duplicate PK / orphan FK / bad status / schema_version / backup_version / unknown table / count mismatch / tampered digest', async () => {
  const P = () => clone(parsed.payload)
  const check = async (name, mutate, expectCode, expectText) => {
    const p = P(); mutate(p)
    const r = must(await dry(p), name)
    ok(r.ok === false, `${name}: 실패해야 함`)
    const blob = JSON.stringify(r)
    ok((expectCode && r.issues?.some(i => i.code === expectCode)) || (expectText && blob.includes(expectText)), `${name}: ${blob.slice(0, 300)}`)
    const c = await counts(); ok(Object.values(c).every(n => n === 0), `${name}: 쓰기 발생 ${JSON.stringify(c)}`)
    return r
  }
  await check('duplicate PK', p => { p.tables.locations.push(clone(p.tables.locations[0])); p.table_counts.locations++ }, 'duplicate_pk')
  await check('orphan FK (lot → missing reagent)', p => { p.tables.reagent_lots[0].reagent_id = randomUUID() }, 'fk_orphan')
  await check('orphan FK (student)', p => { p.tables.reagents[0].registered_by = 'NO-SUCH-STUDENT' }, 'fk_orphan')
  await check('bad status enum (CHECK constraint)', p => { p.tables.reagent_lots[5].status = 'bogus' }, null, 'reagent_lots_status_check')
  await check('schema_version mismatch', p => { p.schema_version = 'v1-000000000000' }, 'schema_version')
  await check('backup_version unsupported', p => { p.backup_version = 2 }, 'backup_version')
  await check('unknown table in payload', p => { p.tables.auth_users = [] }, 'unknown_table')
  await check('count mismatch vs manifest', p => { p.table_counts.reagents += 1 }, 'count_mismatch')
  await check('columns changed', p => { p.table_columns.reagents = p.table_columns.reagents.slice(1) }, 'columns')
  await check('tampered row content (digest mismatch → whole dry-run rolled back)', p => { p.tables.reagents[3].name = 'TAMPERED' }, null, 'digest 불일치')
  await check('NOT NULL violation', p => { p.tables.reagent_lots[7].reagent_id = null }, null, 'null')
})

// ══ 실행 ═══════════════════════════════════════════════════════════════════
const run = (payload, confirm = 'RESTORE') => adminC.rpc('admin_restore_full', { p_payload: payload, p_dry_run: false, p_confirm: confirm })
await test('EXECUTE is disabled by default (restore_enabled not set): refused even for admin with the right confirmation; nothing written', async () => {
  const st = must(await adminC.rpc('admin_restore_status'), 'status'); eq(st.enabled, false, '기본 비활성')
  const m = denied(await run(parsed.payload), 'disabled'); ok(m.includes('비활성'), m)
  const c = await counts(); ok(Object.values(c).every(n => n === 0), '쓰기 없음')
})
await test('EXECUTE guards once enabled: wrong / missing confirmation refused; non-admin & anon refused', async () => {
  must(await service.from('app_settings').upsert({ key: 'restore_enabled', value: 'true' }), 'enable')
  eq(must(await adminC.rpc('admin_restore_status'), 'status').enabled, true, '활성')
  denied(await run(parsed.payload, 'restore'), 'wrong confirm'); denied(await run(parsed.payload, null), 'no confirm')
  denied(await userC.rpc('admin_restore_full', { p_payload: parsed.payload, p_dry_run: false, p_confirm: 'RESTORE' }), 'non-admin')
  denied(await anon.rpc('admin_restore_full', { p_payload: parsed.payload, p_dry_run: false, p_confirm: 'RESTORE' }), 'anon')
  const c = await counts(); ok(Object.values(c).every(n => n === 0), '쓰기 없음')
})
await test('SINGLE-TRANSACTION rollback: failure at the LAST table (digest mismatch) leaves every table empty (no partial restore)', async () => {
  const p = clone(parsed.payload); p.table_digests.admin_logs = '0'.repeat(32)
  const m = denied(await run(p), 'digest mismatch on last table'); ok(m.includes('digest 불일치'), m)
  const c = await counts(); ok(Object.values(c).every(n => n === 0), '부분 복원 없음: ' + JSON.stringify(c))
})
await test('SINGLE-TRANSACTION rollback: failure in a middle table (CHECK constraint) leaves every table empty', async () => {
  const p = clone(parsed.payload); p.tables.reagent_lots[9].status = 'bogus'
  const m = denied(await run(p), 'check violation'); ok(m.includes('reagent_lots_status_check') || m.includes('check'), m)
  const c = await counts(); ok(Object.values(c).every(n => n === 0), '부분 복원 없음')
})
let restoreOut
await test('FULL RESTORE (empty target, single transaction): committed, inserted == manifest counts, digests verified in-DB', async () => {
  restoreOut = must(await run(parsed.payload), 'restore')
  ok(restoreOut.ok && restoreOut.committed && restoreOut.digests_match, JSON.stringify(restoreOut))
  eq(restoreOut.inserted, snapshot.table_counts, '삽입 행 수')
})

// ══ 원본/복원본 비교 ═════════════════════════════════════════════════════════
await test('COMPARE: table counts — every table equals the original (admin_logs = original + the 1 restore audit row)', async () => {
  const c = await counts()
  for (const t of ORDER) eq(c[t], t === 'admin_logs' ? snapshot.table_counts[t] + 1 : snapshot.table_counts[t], t)
})
await test('COMPARE: UUID / PK preservation — the exact same id set per table (reagent_lots.id, reagents.id, requests, history …)', async () => {
  for (const t of ORDER.filter(x => x !== 'admin_logs')) {
    const now = (await allRows(t)).map(r => r.id ?? r.student_id).sort()
    eq(now, originalIds[t], `${t} id 집합`)
  }
})
await test('COMPARE: row-level hash — restored snapshot digests == original digests for every table (admin_logs excluded: +1 audit row)', async () => {
  const s2 = must(await adminC.rpc('admin_backup_export'), 'export2')
  for (const t of ORDER.filter(x => x !== 'admin_logs')) eq(s2.table_digests[t], snapshot.table_digests[t], `${t} digest`)
  const orig = new Set(originalRows.admin_logs.map(r => r.id)); const now = await allRows('admin_logs')
  ok(originalRows.admin_logs.every(r => now.some(x => x.id === r.id && JSON.stringify(x) === JSON.stringify(r))), 'admin_logs 원본 행은 그대로 존재')
  eq(now.filter(r => !orig.has(r.id)).map(r => r.action), ['전체 복원 실행'], '추가된 행은 복원 감사 로그 1건뿐')
  // 값 단위 스팟 체크(타입/정밀도/유니코드/개행/jsonb/배열)
  const cur = new Map((await allRows('reagents')).map(r => [r.id, r])); const orgR = originalRows.reagents
  ok(orgR.every(r => JSON.stringify(cur.get(r.id)) === JSON.stringify(r)), 'reagents 전 컬럼 값 동일(마이크로초 timestamp, jsonb, 개행, 백슬래시)')
  const sess = await allRows('inventory_sessions'); ok(sess.some(s => Array.isArray(s.zones) && s.zones.includes('"quote"')), 'text[] 보존')
})
await test('COMPARE: FK integrity — no orphans among restored tables; lot_no (manufacturer batch) groups preserved, lot identity stays reagent_lots.id', async () => {
  const lots = await allRows('reagent_lots'), reagents = new Set((await allRows('reagents')).map(r => r.id)), locs = new Set((await allRows('locations')).map(r => r.id)), stu = new Set((await allRows('students')).map(r => r.student_id))
  ok(lots.every(l => reagents.has(l.reagent_id) && (!l.location_id || locs.has(l.location_id))), 'lots → reagents/locations')
  const lotIds = new Set(lots.map(l => l.id))
  for (const t of ['location_history', 'location_requests', 'disposal_requests', 'stock_history', 'inventory_counts']) ok((await allRows(t)).every(r => !r.lot_id || lotIds.has(r.lot_id)), `${t}.lot_id`)
  for (const t of ['disposal_requests', 'reagent_change_requests']) ok((await allRows(t)).every(r => !r.requested_by_student_id || stu.has(r.requested_by_student_id)), `${t} → students`)
  const grp = a => Object.values(a.reduce((m, l) => { if (l.lot_no) { const k = l.reagent_id + '|' + l.lot_no; m[k] = (m[k] || 0) + 1 } return m }, {})).filter(n => n > 1).length
  eq(grp(lots), grp(originalRows.reagent_lots), '같은 reagent_id + lot_no 다행 그룹 수 보존')
  ok(lots.filter(l => l.lot_no === null).length === originalRows.reagent_lots.filter(l => l.lot_no === null).length, 'lot_no NULL 행 수')
  ok((await allRows('stock_logs')).filter(r => !lotIds.has(r.lot_id)).length === 2, '고아 stock_logs 2건(소프트 참조)도 그대로 복원')
})
await test('COMPARE: sequences advanced — new admin_logs / inventory_sessions ids do not collide after restore', async () => {
  const maxLog = Math.max(...originalRows.admin_logs.map(r => Number(r.id)))
  const r = must(await service.from('admin_logs').insert({ admin_name: 'after', action: 'seq-check' }).select().single(), 'new log')
  ok(Number(r.id) > maxLog, `시퀀스 ${r.id} > ${maxLog}`)
  const maxSess = Math.max(...originalRows.inventory_sessions.map(r => Number(r.id)))
  const s = must(await service.from('inventory_sessions').insert({ year: 2030, start_date: '2030-01-01', status: 'open', created_by: 'after' }).select().single(), 'new session')
  ok(Number(s.id) > maxSess, `세션 시퀀스 ${s.id} > ${maxSess}`)
  await service.from('admin_logs').delete().eq('id', r.id); await service.from('inventory_sessions').delete().eq('id', s.id)
})
await test('RE-RUN safety: restoring the same backup again is refused (targets no longer empty), nothing changes', async () => {
  const before = await counts()
  const m = must(await run(parsed.payload), 'rerun')
  ok(m.ok === false, '두 번째 실행 차단')
  eq(await counts(), before, '행 수 불변')
})
await test('cleanup: disable restore flag, drop test users', async () => {
  // 다른 스위트를 오염시키지 않도록 합성 데이터를 비우고 최소 테스트 신원만 남긴다(전체 재현은 reset-and-run-all.sh).
  await wipe()
  await service.from('students').insert([{ student_id: 'TEST-STU-0001', name: 'TEST Student One', birth_date: '2000-01-01', is_admin: false, is_super: false }, { student_id: 'TEST-STU-0002', name: 'TEST Student Two', birth_date: '2001-02-02', is_admin: false, is_super: false }])
  await service.from('app_settings').delete().eq('key', 'restore_enabled')
  await service.from('admin_users').delete().eq('user_id', adminId)
  await service.auth.admin.deleteUser(adminId); await service.auth.admin.deleteUser(userId)
  eq(must(await service.from('app_settings').select('key').eq('key', 'restore_enabled'), 'flag').length, 0, '복원 플래그 해제')
})

const pass = results.filter(Boolean).length
console.log(`\nTOTAL=${results.length} PASS=${pass} FAIL=${results.length - pass}`)
process.exitCode = pass === results.length ? 0 : 1
