// STAGING TEST ONLY — 전체 시스템 백업(모드 B): DB(핵심+구매요청+공지+자료+허용 설정) + 실제 Storage 파일.
//   백업(JSON ZIP: manifest + tables/*.json + storage/<bucket>/<path>) → 변조/누락/경로 공격 검증 → dry-run → Storage/DB 장애 주입 →
//   빈 대상 복원(업로드→검증→DB) → 원본/복원본 비교. ⚠ DB 와 Storage 는 한 트랜잭션이 아니다 — 안전 순서 + 실패 시 정리를 검증한다.
// ⚠ 범위 테이블/Storage 테스트 객체를 비우고 채운다(staging 전용). 회귀의 마지막에 실행할 것.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import JSZip from 'jszip'
import { STAGING_PROJECT_REF, PRODUCTION_PROJECT_REF } from '../supabase-refs.mjs'
import { buildBackupZip, readBackupZip } from '../../src/lib/backupZip.js'
import { collectStorage, findUnreferenced } from '../../src/lib/storageBackup.js'
import { dryRunAll, executeRestore, cleanupInterruptedRestore, objectExists } from '../../src/lib/storageRestore.js'
import { storageBase } from '../../src/lib/storageBase.js'
import { validateStorageLocation } from '../../src/lib/storagePath.js'

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
const sha = (b) => createHash('sha256').update(b).digest('hex')
const clone = o => JSON.parse(JSON.stringify(o))

const CORE = ['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests', 'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history', 'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs']
const FULL = [...CORE, 'purchase_request_logs', 'purchase_request_reagent_items', 'purchase_request_goods_items', 'purchase_requests', 'notices', 'notice_files', 'resource_tabs', 'resource_articles', 'resource_files', 'app_settings']
const ALLOWED_KEYS = ['lab_name', 'lab_professor', 'lab_assistant', 'lab_phone', 'safety_dept_phone', 'emergency_contact', 'school_safety_system_url', 'kosha_label_url', 'quick_links']
const SECRET_KEYS = ['admin_password', 'super_password']
const suffix = randomBytes(4).toString('hex')
const ADMIN_EMAIL = `bkf-admin-${suffix}@example.test`, USER_EMAIL = `bkf-user-${suffix}@example.test`, PW = 'Tst!' + randomBytes(9).toString('hex')
const BUCKET = 'documents'
let adminC, userC, adminId, userId, base

const pkOf = t => (t === 'students' ? 'student_id' : t === 'app_settings' ? 'key' : 'id')
const countOf = async t => {
  if (t === 'app_settings') { const r = await service.from(t).select('key').in('key', ALLOWED_KEYS); if (r.error) throw new Error(r.error.message); return r.data.length }
  const r = await service.from(t).select('*', { count: 'exact', head: true }); if (r.error) throw new Error(t + ': ' + r.error.message); return r.count
}
const counts = async () => Object.fromEntries(await Promise.all(FULL.map(async t => [t, await countOf(t)])))
const allRows = async t => { let all = [], from = 0; for (;;) { const r = must(await service.from(t).select('*').range(from, from + 999), t); all = all.concat(r); if (r.length < 1000) break; from += 1000 } return all }
const insertBatch = async (t, rows) => { for (let i = 0; i < rows.length; i += 300) must(await service.from(t).insert(rows.slice(i, i + 300)), 'insert ' + t) }
const rpcA = (n, a) => adminC.rpc(n, a)

// ── Storage 테스트 객체 ───────────────────────────────────────────────────────
const OBJ = {
  a: { path: `notices/bk${suffix}_a.pdf`, bytes: randomBytes(300_000), type: 'application/pdf' },
  b: { path: `notices/bk${suffix}_b (1).bin`, bytes: randomBytes(40_000), type: 'application/octet-stream' },   // 공백/괄호
  c: { path: `notices/bk${suffix}_c.png`, bytes: randomBytes(2_000_000), type: 'image/png' },                 // 2MB
  legacy: { path: `notices/bk${suffix}_legacy.pdf`, bytes: randomBytes(90_000), type: 'application/pdf' },      // notices.file_url
  msds: { path: `msds/bk${suffix}_msds.pdf`, bytes: randomBytes(100_000), type: 'application/pdf' },            // reagents.msds_url
  res: { path: `resources/bk${suffix}/form.docx`, bytes: randomBytes(200_000), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  resOld: { path: `resources/bk${suffix}/old-version.docx`, bytes: randomBytes(50_000), type: 'application/octet-stream' },
  orphan: { path: `notices/bk${suffix}_orphan.bin`, bytes: randomBytes(10_000), type: 'application/octet-stream' },   // 참조 없음 → 백업 제외, manifest.unreferenced
}
const GONE = `notices/bk${suffix}_gone.pdf`                         // DB 행은 있지만 파일이 없는 링크
const pub = (p) => service.storage.from(BUCKET).getPublicUrl(p).data.publicUrl
const managed = () => Object.values(OBJ).map(o => o.path)
const upObj = async (o) => must(await service.storage.from(BUCKET).upload(o.path, o.bytes, { contentType: o.type, upsert: true }), 'upload ' + o.path)
const rmAllTestObjects = async () => { await service.storage.from(BUCKET).remove([...managed(), GONE]) }
const dl = async (c, p) => { const r = await c.storage.from(BUCKET).download(p); return r.error ? null : new Uint8Array(await r.data.arrayBuffer()) }

async function wipeAll() {
  await service.from('app_settings').delete().in('key', [...ALLOWED_KEYS, 'super_password', 'restore_enabled'])
  for (const t of [...FULL].reverse().filter(x => x !== 'app_settings')) {
    const r = await service.from(t).delete().not(pkOf(t), 'is', null); if (r.error) throw new Error('wipe ' + t + ': ' + r.error.message)
  }
  await rmAllTestObjects()
}

async function seed() {
  const S = (student_id, name, birth_date) => ({ student_id, name, birth_date, is_admin: false, is_super: false, password_hash: null })
  await insertBatch('students', [S('TEST-STU-0001', 'TEST Student One', '2000-01-01'), S('TEST-STU-0002', 'TEST Student Two', '2001-02-02'), S('BKF-STU-001', '홍길동 "따옴표"', '1999-12-31')])
  const locs = Array.from({ length: 6 }, (_, i) => ({ id: randomUUID(), room: `BKF-${i}호`, detail: i % 2 ? `${i}-시약장` : null }))
  await insertBatch('locations', locs)
  const reagents = Array.from({ length: 120 }, (_, i) => ({
    id: randomUUID(), name: `BKF Reagent ${String(i).padStart(3, '0')}`, name_ko: `시약 ${i}`, cas_no: `${2000 + i}-00-${i % 10}`, company: 'Daejung', reagent_type: 'purchased', status: 'active',
    data_source: 'manual', location_id: locs[i % 6].id, registered_by: 'BKF-STU-001', created_at: `2026-09-10T17:54:59.${String(100000 + i).slice(-6)}+00:00`,
    msds_url: i === 7 ? pub(OBJ.msds.path) : i === 8 ? 'https://example.com/external-msds.pdf' : null,      // 7: 우리 Storage / 8: 외부 URL
  }))
  await insertBatch('reagents', reagents)
  const lots = reagents.slice(0, 100).map((r, i) => ({ id: randomUUID(), reagent_id: r.id, lot_no: `LOT-${i}`, sealed_count: i % 9 === 0 ? 1 : 0, current_stock: i % 9 === 0 ? 0 : (i * 7) % 100, location_id: locs[i % 6].id, status: 'active' }))
  await insertBatch('reagent_lots', lots)
  await insertBatch('admin_logs', Array.from({ length: 8 }, (_, i) => ({ admin_name: 'BKF', action: `작업 ${i}`, target_type: 'reagent', description: i % 2 ? '설명 "따옴표"' : null })))
  // 구매요청(신): logs → reagent items / goods items
  const logs = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), requested_by: i % 2 ? 'BKF-STU-001' : 'TEST-STU-0001', note: `구매요청 ${i}`, status: ['pending', 'approved', 'ordered', 'delivered'][i] }))
  await insertBatch('purchase_request_logs', logs)
  await insertBatch('purchase_request_reagent_items', logs.flatMap((l, i) => [{ id: randomUUID(), request_id: l.id, reagent_id: reagents[i].id, name: reagents[i].name, company: 'Daejung', cas_no: reagents[i].cas_no, quantity: '2', purpose: '실험', note: null, cat_no: null, state: null, spec: '500mL', needed_amount: '1L', usage_place: '303호', purchase_reason: null, purity: '99%' }, { id: randomUUID(), request_id: l.id, reagent_id: null, name: '새 시약(자유입력)', company: null, cas_no: null, cat_no: null, state: null, spec: null, quantity: '1', purpose: null, note: null, needed_amount: null, usage_place: null, purchase_reason: null, purity: null }]))
  await insertBatch('purchase_request_goods_items', logs.map((l, i) => ({ id: randomUUID(), request_id: l.id, name: `비커 ${i}`, spec: '250mL', quantity: 3.5, unit_price: 1000.25, shipping_fee: 0, total_price: 3500.875, note: null, link: null, purpose: null, cat_no: null })))
  // legacy 구매요청(관리자 화면에서 보이는 purchase_requests)
  await insertBatch('purchase_requests', Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), user_name: `legacy-${i}`, target_type: 'new', target_id: null, target_name: `물품 ${i}`, quantity: '1', reason: '사유', status: ['pending', 'approved', 'done'][i % 3], product_name: 'p', total_price: '1000', notes: '메모 "따옴표"' })))
  // 공지 + 첨부(notice_files) + 자료(resource_files)
  const notices = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), title: `공지 ${i}`, content: `내용 ${i}\n둘째 줄 \\ 백슬래시`, type: i % 2 ? 'safety' : 'notice', views: i * 3,
    file_url: i === 3 ? pub(OBJ.legacy.path) : null, file_name: i === 3 ? 'legacy.pdf' : null }))
  await insertBatch('notices', notices)
  await insertBatch('notice_files', [
    { id: randomUUID(), notice_id: notices[0].id, file_url: pub(OBJ.a.path), file_name: '첨부 A.pdf', file_size: OBJ.a.bytes.length },
    { id: randomUUID(), notice_id: notices[0].id, file_url: pub(OBJ.b.path), file_name: 'b (1).bin', file_size: OBJ.b.bytes.length },
    { id: randomUUID(), notice_id: notices[1].id, file_url: pub(OBJ.c.path), file_name: 'c.png', file_size: OBJ.c.bytes.length },
    { id: randomUUID(), notice_id: notices[1].id, file_url: pub(GONE), file_name: '사라진 파일.pdf', file_size: 1234 },               // 링크만 있고 파일 없음
    { id: randomUUID(), notice_id: notices[2].id, file_url: 'https://example.com/external.pdf', file_name: '외부 링크.pdf', file_size: null },   // 외부 URL(참조 아님)
  ])
  // 자료실 CMS(resource_tabs → resource_articles → resource_files.article_id, FK restrict 순서)
  const tabs = [{ id: randomUUID(), name: `BKF 안전·폐기 ${suffix}`, sort_order: 0 }, { id: randomUUID(), name: `BKF 운영 ${suffix}`, sort_order: 1 }]
  await insertBatch('resource_tabs', tabs)
  const articles = [
    { id: randomUUID(), tab_id: tabs[0].id, title: '폐액 처리 안내', summary: '요약 "따옴표"', audience: '연구실책임자', timing: '정기 점검 시', steps: ['확인', '배출'], notice: '참고사항', link_label: '학교 시스템 열기', link_url: 'https://safety.kangwon.ac.kr/', sort_order: 0, legacy_category_key: 'waste', legacy_section_key: 'pickup' },
    { id: randomUUID(), tab_id: tabs[1].id, title: '학교 화학물질 등록', summary: null, audience: null, timing: null, steps: [], notice: null, link_label: null, link_url: null, sort_order: 0, legacy_category_key: null, legacy_section_key: null },
  ]
  await insertBatch('resource_articles', articles)
  await insertBatch('resource_files', [
    { id: randomUUID(), article_id: articles[0].id, category_key: 'waste', section_key: 'pickup', resource_key: 'k1', title: '수거 신청서', resource_type: 'form', is_current: true, storage_path: OBJ.res.path, file_url: pub(OBJ.res.path), original_filename: 'form.docx', mime_type: OBJ.res.type, sort_order: 1 },
    { id: randomUUID(), article_id: articles[0].id, category_key: 'waste', section_key: 'pickup', resource_key: 'k1', title: '수거 신청서(이전)', resource_type: 'form', is_current: false, storage_path: OBJ.resOld.path, file_url: null, original_filename: 'old.docx', mime_type: null, sort_order: 2 },
  ])
  // app_settings: allowlist 키 + 비밀 키(내보내면 안 됨) — admin_password 는 fixture 가 이미 넣어 둠
  await service.from('app_settings').upsert([
    { key: 'lab_name', value: '강원대 화학교육 연구실' }, { key: 'lab_phone', value: '033-000-0000' }, { key: 'lab_professor', value: '홍교수' },
    { key: 'quick_links', value: '[{"title":"링크","url":"https://example.com"}]' }, { key: 'kosha_label_url', value: 'https://msds.kosha.or.kr/' },
    { key: 'admin_password', value: 'TOPSECRET-ADMIN' }, { key: 'super_password', value: 'TOPSECRET-SUPER' },
  ])
}

const parsedOf = async (bytes) => { const p = await readBackupZip(bytes); return p }
const mutate = async (bytes, fn) => { const z = await JSZip.loadAsync(bytes); const mf = JSON.parse(await z.file('manifest.json').async('string')); await fn(z, mf); z.file('manifest.json', JSON.stringify(mf)); return z.generateAsync({ type: 'uint8array' }) }
const ctx = () => ({ client: adminC, rpc: rpcA, targetBase: base })
const noObjects = async () => { for (const p of managed()) if (await objectExists(service, BUCKET, p)) return false; return true }
const dbEmpty = async () => { const c = await counts(); return CORE.concat(FULL.slice(16)).filter(t => t !== 'app_settings').every(t => c[t] === 0) }

let snapshot, zipFull, parsed, originalRows, originalObjs
await test('setup: users, wipe (DB + Storage test objects), seed production-shaped data + Storage files', async () => {
  const a = must(await service.auth.admin.createUser({ email: ADMIN_EMAIL, password: PW, email_confirm: true }), 'admin')
  const u = must(await service.auth.admin.createUser({ email: USER_EMAIL, password: PW, email_confirm: true }), 'user')
  adminId = a.user.id; userId = u.user.id
  must(await service.from('admin_users').insert({ user_id: adminId, active: true, note: 'BKF-ADMIN' }), 'admin_users')
  adminC = createClient(URL_, ANON, opts); userC = createClient(URL_, ANON, opts)
  must(await adminC.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PW }), 'admin login')
  must(await userC.auth.signInWithPassword({ email: USER_EMAIL, password: PW }), 'user login')
  base = storageBase(adminC)
  ok(/\/storage\/v1\/object\/public\/$/.test(base), 'storage base: ' + base)
  await wipeAll()
  for (const o of Object.values(OBJ)) await upObj(o)
  await seed()
  const c = await counts()
  return { reagents: c.reagents, purchase: [c.purchase_request_logs, c.purchase_request_reagent_items, c.purchase_request_goods_items, c.purchase_requests], notices: c.notices, notice_files: c.notice_files, resource_files: c.resource_files, settings_allowlisted: c.app_settings }
})

// ══ 1. 백업 ═══════════════════════════════════════════════════════════════════
await test('BACKUP full: admin-only RPC; scope = core + purchase(4) + notices + notice_files + resource_files + allowlisted app_settings', async () => {
  denied(await anon.rpc('admin_backup_export', { p_mode: 'full' }), 'anon'); denied(await userC.rpc('admin_backup_export', { p_mode: 'full' }), 'non-admin')
  denied(await adminC.rpc('admin_backup_export', { p_mode: 'everything' }), 'unknown mode')
  snapshot = must(await rpcA('admin_backup_export', { p_mode: 'full' }), 'export full')
  eq(snapshot.backup_mode, 'full', 'mode'); eq(snapshot.table_order, FULL, '테이블 순서(FK 부모→자식)')
  const c = await counts()
  for (const t of FULL) eq(snapshot.table_counts[t], c[t], `행 수 ${t}`)
  const core = must(await rpcA('admin_backup_export', { p_mode: 'core' }), 'export core')
  eq(core.table_order, CORE, 'core 모드는 16개 그대로'); ok(!('storage_refs' in core), 'core 에는 Storage 참조 없음')
  ok(snapshot.schema_version !== core.schema_version, '모드별 schema_version 다름')
  return { full_tables: FULL.length, core_tables: CORE.length }
})
await test('BACKUP app_settings: ONLY the allowlist is exported — admin_password / super_password / restore_enabled never appear anywhere in the snapshot', async () => {
  const keys = snapshot.tables.app_settings.map(r => r.key).sort()
  eq(keys, [...ALLOWED_KEYS].filter(k => ['lab_name', 'lab_phone', 'lab_professor', 'quick_links', 'kosha_label_url'].includes(k)).sort(), '허용 키만')
  const blob = JSON.stringify(snapshot)
  ok(!blob.includes('TOPSECRET') && !blob.includes('admin_password') && !blob.includes('super_password'), '비밀 값/키 이름이 스냅샷에 없음')
})
await test('BACKUP storage refs (server-derived): notice_files / notices.file_url / resource_files(path+url) / reagents.msds_url → (bucket,path); external URL is not a ref', async () => {
  const paths = snapshot.storage_refs.map(r => r.path).sort()
  const expected = [OBJ.a, OBJ.b, OBJ.c, OBJ.legacy, OBJ.msds, OBJ.res, OBJ.resOld].map(o => o.path).concat([GONE]).sort()
  eq(paths, expected, '참조 경로(URL 디코딩된 원본 경로 — 공백/괄호 포함)')
  ok(snapshot.storage_refs.every(r => r.bucket === BUCKET), 'bucket')
  const res = snapshot.storage_refs.find(r => r.path === OBJ.res.path)
  eq(res.refs.map(r => `${r.table}.${r.column}`).sort(), ['resource_files.file_url', 'resource_files.storage_path'], '한 객체에 여러 참조 합침')
})
await test('BACKUP storage collect: files downloaded with size + sha256; missing link recorded; unreferenced object listed (not backed up)', async () => {
  const st = await collectStorage(adminC, snapshot.storage_refs, { base })
  eq(st.objects.length, 7, '내려받은 파일 수'); eq(st.missing.map(m => m.path), [GONE], '없는 파일')
  for (const o of st.objects) { const orig = Object.values(OBJ).find(x => x.path === o.path); eq([o.size, o.sha256], [orig.bytes.length, sha(orig.bytes)], o.path); eq(o.contentType, orig.type, 'content-type ' + o.path) }
  const unref = (await findUnreferenced(adminC, [BUCKET], snapshot.storage_refs)).filter(u => u.path.includes(suffix))
  eq(unref.map(u => u.path), [OBJ.orphan.path], '참조 없는 객체')
  originalObjs = { st, unref }
  zipFull = await buildBackupZip(snapshot, { appVersion: 'test', storage: { ...st, unreferenced: unref } })
  parsed = await parsedOf(zipFull)
  eq(parsed.problems, [], '정상 ZIP')
  return { zipMB: (zipFull.length / 1048576).toFixed(2) }
})
await test('BACKUP format: manifest has mode/version/created_at/app_version/schema_version/table_counts + storage[bucket,path,size,sha256]; ZIP has storage/<bucket>/<path>', async () => {
  const mf = parsed.manifest
  ok(mf.backup_version === 1 && mf.backup_mode === 'full' && mf.created_at && mf.app_version === 'test' && mf.schema_version === snapshot.schema_version, 'manifest 필드')
  ok(mf.storage.objects.length === 7 && mf.storage.objects.every(o => o.bucket === BUCKET && o.path && o.size > 0 && /^[0-9a-f]{64}$/.test(o.sha256)), 'storage 객체 메타')
  const z = await JSZip.loadAsync(zipFull)
  ok(mf.storage.objects.every(o => z.file(`storage/${o.bucket}/${o.path}`)), 'ZIP 내 storage/<bucket>/<path>')
  ok(!Object.keys(z.files).some(n => /admin_password|super_password/.test(n)), 'ZIP 항목에 비밀 없음')
  eq(mf.storage.missing.map(m => m.path), [GONE], 'manifest.missing'); eq(mf.storage.unreferenced.map(u => u.path), [OBJ.orphan.path], 'manifest.unreferenced')
  ok(mf.storage.base === base, 'manifest.storage.base = 원본 Storage 기준 주소')
})

// ══ 2. ZIP 변조 / 경로 공격 (DB·Storage 미접촉) ═════════════════════════════════
await test('ZIP integrity: tampered storage file (sha256), size, missing file, extra file, duplicate path, case-only duplicate, unexpected file — all detected', async () => {
  const first = parsed.manifest.storage.objects[0]
  let r = await readBackupZip(await mutate(zipFull, async z => { const p = `storage/${first.bucket}/${first.path}`; const b = await z.file(p).async('uint8array'); b[0] ^= 0xff; z.file(p, b) }))
  ok(r.problems.some(p => p.includes('sha256 불일치')), '변조: ' + r.problems.join('|'))
  r = await readBackupZip(await mutate(zipFull, async (z, mf) => { mf.storage.objects[0].size += 1 }))
  ok(r.problems.some(p => p.includes('크기가 manifest 와 다릅니다')), '크기')
  r = await readBackupZip(await mutate(zipFull, async z => { z.remove(`storage/${first.bucket}/${first.path}`) }))
  ok(r.problems.some(p => p.includes('manifest 에는 있지만 ZIP 에 없는')), '누락')
  r = await readBackupZip(await mutate(zipFull, async z => { z.file('storage/documents/notices/extra-not-in-manifest.bin', new Uint8Array([1, 2, 3])) }))
  ok(r.problems.some(p => p.includes('ZIP 에는 있지만 manifest 에 없는')), '초과')
  r = await readBackupZip(await mutate(zipFull, async (z, mf) => { mf.storage.objects.push(clone(mf.storage.objects[0])) }))
  ok(r.problems.some(p => p.includes('중복된 Storage 경로')), '중복')
  r = await readBackupZip(await mutate(zipFull, async (z, mf) => { const o = clone(mf.storage.objects[0]); o.path = o.path.toUpperCase(); mf.storage.objects.push(o); z.file(`storage/${o.bucket}/${o.path}`, new Uint8Array([9])) }))
  ok(r.problems.some(p => p.includes('대소문자만 다른')), '대소문자 중복')
  r = await readBackupZip(await mutate(zipFull, async z => { z.file('evil.sh', 'x') }))
  ok(r.problems.some(p => p.includes('예상하지 못한 파일')), '예상 밖 파일')
  r = await readBackupZip(await mutate(zipFull, async z => { const p = 'tables/notices.json'; const t = await z.file(p).async('string'); z.file(p, t.replace('공지 0', '공지 X')) }))
  ok(r.problems.some(p => p.includes('tables/notices.json') && p.includes('sha256')), '테이블 파일 변조')
  const core = await buildBackupZip(must(await rpcA('admin_backup_export', { p_mode: 'core' }), 'core'), { appVersion: 't' })
  r = await readBackupZip(await mutate(core, async z => { z.file('storage/documents/notices/x.bin', new Uint8Array([1])) }))
  ok(r.problems.some(p => p.includes('핵심 백업인데 storage/')), '핵심 ZIP 에 storage')
})
await test('ZIP path traversal / hostile paths are rejected (../, absolute, backslash, encoded, control char, empty segment, unknown bucket)', async () => {
  const bad = ['../../etc/passwd', 'notices/../../x', '/abs/path.bin', 'C:/win.bin', 'notices\\evil.bin', 'notices/%2e%2e/x', 'notices//double.bin', 'notices/trail/', 'notices/ctrl\u0001.bin', 'notices/./x', '']
  for (const p of bad) ok(validateStorageLocation(BUCKET, p) !== null, `거부돼야 함: ${JSON.stringify(p)}`)
  for (const p of ['notices/한글 파일.pdf', 'notices/emoji_😀.bin', 'notices/q?x.bin', 'notices/h#x.bin']) ok(validateStorageLocation(BUCKET, p) !== null, `Storage 가 거부할 문자: ${p}`)
  ok(validateStorageLocation('other-bucket', 'a.bin') !== null, '허용되지 않은 bucket'); ok(validateStorageLocation(BUCKET, `notices/bk${suffix}_b (1).bin`) === null, '정상 경로(공백/괄호)는 통과')
  const r = await readBackupZip(await mutate(zipFull, async (z, mf) => { mf.storage.objects[0].path = '../../outside.bin' }))
  ok(r.problems.some(p => p.includes('traversal')), 'manifest 경로 공격: ' + r.problems.join('|'))
  const r2 = await readBackupZip(await mutate(zipFull, async (z, mf) => { mf.storage.objects[0].bucket = 'private-bucket' }))
  ok(r2.problems.some(p => p.includes('허용되지 않은 bucket')), 'bucket')
})

// ══ 3. dry-run ═══════════════════════════════════════════════════════════════
await test('DRY-RUN on NON-empty target: blocked at the DB stage (target_not_empty); nothing changed', async () => {
  const before = await counts()
  const r = await dryRunAll({ ...ctx(), parsed })
  ok(!r.ok, '차단'); const codes = r.issues.map(i => i.code)
  ok(codes.includes('target_not_empty'), 'DB 비어 있지 않음'); ok(r.db && r.db.ok === false, 'DB 검증 단계에서 차단')
  eq(await counts(), before, '행 수 불변')
})
await test('WIPE (staging harness): keep originals in memory; empty DB + delete Storage test objects', async () => {
  originalRows = Object.fromEntries(await Promise.all(FULL.map(async t => [t, t === 'app_settings' ? (await allRows(t)).filter(r => ALLOWED_KEYS.includes(r.key)) : await allRows(t)])))
  await wipeAll()
  ok(await dbEmpty(), 'DB 비어 있음'); ok(await noObjects(), 'Storage 테스트 객체 없음')
})
await test('DRY-RUN on the empty target: ok — DB payload verified, Storage refs == manifest objects, no conflicts; ZERO writes (DB + Storage)', async () => {
  const r = await dryRunAll({ ...ctx(), parsed })
  ok(r.ok, JSON.stringify(r.issues)); eq(r.storageCount, 7, 'Storage 객체 수'); eq(r.missingRefs.length, 1, '링크만 있는 항목')
  ok(r.db.digests_match && r.db.dry_run && !r.db.committed, 'DB dry-run')
  ok(await dbEmpty() && await noObjects(), 'dry-run 후에도 DB/Storage 비어 있음')
})
await test('DRY-RUN failures (each without writes): app_settings secret key, settings conflict, purchase FK orphan, notice_files orphan, resource_files CHECK, ref-without-object, unreferenced manifest object', async () => {
  const P = () => clone(parsed)
  const run = async (name, mutatePayload) => { const p = P(); await mutatePayload(p); const r = await dryRunAll({ ...ctx(), parsed: p }); ok(!r.ok, `${name}: 실패해야 함`); ok(await dbEmpty() && await noObjects(), `${name}: 쓰기 발생`); return r }
  let r = await run('secret key', p => { p.payload.tables.app_settings.push({ key: 'admin_password', value: 'x' }); p.payload.table_counts.app_settings++ })
  ok(r.issues.some(i => i.code === 'settings_not_allowed' && i.keys.includes('admin_password')), 'settings_not_allowed: ' + JSON.stringify(r.issues).slice(0, 200))
  r = await run('non-allowlisted key', p => { p.payload.tables.app_settings.push({ key: 'random_key', value: 'x' }); p.payload.table_counts.app_settings++ })
  ok(r.issues.some(i => i.code === 'settings_not_allowed'), 'allowlist 밖 키')
  must(await service.from('app_settings').upsert({ key: 'lab_name', value: '다른 값' }), 'seed conflict')
  r = await run('settings conflict', () => {})
  ok(r.issues.some(i => i.code === 'settings_conflict' && i.keys.includes('lab_name')), 'settings_conflict(덮어쓰지 않음)')
  await service.from('app_settings').delete().eq('key', 'lab_name')
  r = await run('purchase item orphan', p => { p.payload.tables.purchase_request_reagent_items[0].request_id = randomUUID() })
  ok(r.issues.some(i => i.code === 'fk_orphan' && i.table === 'purchase_request_reagent_items'), 'purchase FK')
  r = await run('purchase log → unknown student', p => { p.payload.tables.purchase_request_logs[0].requested_by = 'NO-SUCH' })
  ok(r.issues.some(i => i.code === 'fk_orphan' && i.table === 'purchase_request_logs'), 'purchase → students FK')
  r = await run('notice_files orphan', p => { p.payload.tables.notice_files[0].notice_id = randomUUID() })
  ok(r.issues.some(i => i.code === 'fk_orphan' && i.table === 'notice_files'), 'notice_files → notices FK')
  r = await run('resource_files bad type', p => { p.payload.tables.resource_files[0].resource_type = 'bogus' })
  ok(JSON.stringify(r.issues).includes('resource_type') || JSON.stringify(r.db || {}).includes('resource'), 'resource_files CHECK: ' + JSON.stringify(r.issues).slice(0, 200))
  r = await run('ref without object', p => { const o = p.manifest.storage.objects.find(x => x.path === OBJ.c.path); p.manifest.storage.objects = p.manifest.storage.objects.filter(x => x !== o); p.storageObjects = p.storageObjects.filter(x => x.path !== OBJ.c.path) })
  ok(r.issues.some(i => i.code === 'storage_ref_without_object'), 'DB 가 가리키는 파일이 manifest 에 없음')
  r = await run('unreferenced manifest object', p => { const extra = { bucket: BUCKET, path: `notices/bk${suffix}_extra.bin`, size: 3, sha256: sha(Buffer.from([1, 2, 3])), content_type: null, refs: [] }; p.manifest.storage.objects.push(extra); p.storageObjects.push({ ...extra, bytes: new Uint8Array([1, 2, 3]) }) })
  ok(r.issues.some(i => i.code === 'storage_object_unreferenced'), 'manifest 에는 있지만 참조 없음')
})
await test('DRY-RUN storage conflict: an existing object at a manifest path fails the dry-run; it is NEVER overwritten', async () => {
  const pre = Buffer.from('PRE-EXISTING-CONTENT'); must(await service.storage.from(BUCKET).upload(OBJ.a.path, pre, { upsert: true, contentType: 'text/plain' }), 'pre-create')
  const r = await dryRunAll({ ...ctx(), parsed })
  ok(!r.ok && r.issues.some(i => i.code === 'storage_conflict' && i.message.includes(OBJ.a.path)), '충돌 감지: ' + JSON.stringify(r.issues).slice(0, 200))
  eq(sha(Buffer.from(await dl(service, OBJ.a.path))), sha(pre), '기존 객체 내용 보존'); ok(await dbEmpty(), 'DB 쓰기 없음')
  await service.storage.from(BUCKET).remove([OBJ.a.path])
})

// ══ 4. 실행 보호장치 + 장애 주입 (DB 와 Storage 는 한 트랜잭션이 아님) ═════════════════════════
const exec = (extra = {}) => executeRestore({ ...ctx(), parsed, confirm: 'RESTORE', ...extra })
await test('EXECUTE is disabled by default: refused BEFORE any upload (no Storage/DB change)', async () => {
  const r = await exec(); ok(!r.ok && r.stage === 'disabled', JSON.stringify(r).slice(0, 200))
  ok(await dbEmpty() && await noObjects(), '변경 없음')
})
await test('EXECUTE guards once enabled: missing/wrong confirmation refused before upload; non-admin refused', async () => {
  must(await service.from('app_settings').upsert({ key: 'restore_enabled', value: 'true' }), 'enable')
  let r = await executeRestore({ ...ctx(), parsed, confirm: 'restore' }); ok(!r.ok && r.stage === 'confirm', 'confirm')
  r = await executeRestore({ client: userC, rpc: (n, a) => userC.rpc(n, a), parsed, targetBase: base, confirm: 'RESTORE' }); ok(!r.ok, '일반 사용자 거부')
  ok(await dbEmpty() && await noObjects(), '변경 없음')
})
await test('FAILURE #1 storage upload fails on the 3rd object: uploaded ones are deleted, DB untouched, no leftovers', async () => {
  const r = await exec({ hooks: { beforeUpload: (i) => { if (i === 2) throw new Error('injected upload failure') } } })
  ok(!r.ok && r.stage === 'storage-upload' && r.dbChanged === false, JSON.stringify(r).slice(0, 250))
  eq(r.cleanup.failed, [], '정리 실패 없음'); eq(r.cleanup.removed.length, 2, '올린 2개 삭제')
  ok(await dbEmpty() && await noObjects(), 'DB/Storage 모두 원상')
})
await test('FAILURE #2 upload verification fails (sha256 check): everything uploaded is deleted, DB untouched', async () => {
  const r = await exec({ hooks: { afterUpload: () => { throw new Error('injected verify failure') } } })
  ok(!r.ok && r.stage === 'storage-verify', JSON.stringify(r).slice(0, 200)); eq(r.cleanup.removed.length, 7, '7개 정리')
  ok(await dbEmpty() && await noObjects(), '원상')
})
await test('FAILURE #3 the DB restore fails AFTER files were uploaded (race: someone writes to the target in between): DB rolled back, uploaded files deleted', async () => {
  const r = await exec({ hooks: { afterUpload: async () => { must(await service.from('students').insert({ student_id: 'RACE-STU', name: 'race', birth_date: '2000-01-01', is_admin: false, is_super: false }), 'race insert') } } })
  ok(!r.ok && r.stage === 'db' && r.dbChanged === false, JSON.stringify(r).slice(0, 250)); eq(r.cleanup.removed.length, 7, '올린 7개 정리'); eq(r.cleanup.failed, [], '정리 실패 없음')
  ok(await noObjects(), 'Storage 정리됨')
  const c = await counts(); eq(c.students, 1, 'DB 에는 경합으로 들어온 1행뿐(복원은 롤백)'); eq(c.reagents, 0, '복원 데이터 없음')
  await service.from('students').delete().eq('student_id', 'RACE-STU')
})
await test('FAILURE #4 cleanup itself fails (deletes denied) → leftovers are REPORTED and the journal is kept; cleanupInterruptedRestore then removes exactly our files (DB empty + same sha256)', async () => {
  const flaky = new Proxy(adminC, { get(t, k) { if (k !== 'storage') return t[k]; return { from: (b) => { const f = t.storage.from(b); return new Proxy(f, { get(ft, fk) { if (fk === 'remove') return async () => ({ data: null, error: { message: 'injected delete failure' } }); const v = ft[fk]; return typeof v === 'function' ? v.bind(ft) : v } }) } } } })
  const journalStore = {}; const journal = { save: v => { journalStore.v = v }, clear: () => { delete journalStore.v } }
  const r = await executeRestore({ client: flaky, rpc: rpcA, parsed, targetBase: base, confirm: 'RESTORE', journal, hooks: { beforeDb: () => { throw new Error('injected DB failure') } } })
  ok(!r.ok && r.stage === 'db' && r.cleanup.failed.length === 7, '정리 실패 7개 보고: ' + JSON.stringify(r.cleanup).slice(0, 200)); ok(journalStore.v && journalStore.v.objects.length === 7, 'journal 유지(복구용)')
  ok(await dbEmpty(), 'DB 는 그대로 비어 있음'); ok(!(await noObjects()), '객체가 남아 있음(정리 실패 상황 재현)')
  // 남은 객체 중 하나는 "우리 것이 아닌" 내용으로 바꿔 둔다 → 건드리지 않아야 함
  await service.storage.from(BUCKET).update(OBJ.b.path, Buffer.from('SOMEONE-ELSES-FILE'), { contentType: 'text/plain', upsert: true })
  const c = await cleanupInterruptedRestore({ client: adminC, rpc: rpcA, parsed })
  eq(c.kept, [`${BUCKET}/${OBJ.b.path}`], '내용이 다른 객체는 보존'); eq(c.removed.length, 6, 'sha256 같은 6개만 삭제'); eq(c.failed, [], '삭제 실패 없음')
  ok(await objectExists(service, BUCKET, OBJ.b.path), '남의 파일은 그대로'); await service.storage.from(BUCKET).remove([OBJ.b.path])
  ok(await noObjects(), '정리 후 없음')
})
await test('cleanupInterruptedRestore REFUSES when the DB is not empty (a restore may have committed) — never deletes files that live rows may reference', async () => {
  must(await service.from('students').insert({ student_id: 'LIVE-STU', name: 'live', birth_date: '2000-01-01', is_admin: false, is_super: false }), 'live row')
  for (const o of [OBJ.a]) await upObj(o)
  const c = await cleanupInterruptedRestore({ client: adminC, rpc: rpcA, parsed })
  ok(c.ok === false && /비어 있지 않아/.test(c.error), JSON.stringify(c)); ok(await objectExists(service, BUCKET, OBJ.a.path), '파일 그대로')
  await service.from('students').delete().eq('student_id', 'LIVE-STU'); await service.storage.from(BUCKET).remove([OBJ.a.path])
})

// ══ 5. 실제 복원 + 원본/복원본 비교 ═══════════════════════════════════════════════
let restoreOut
await test('FULL SYSTEM RESTORE (empty DB + empty Storage): uploaded → verified → DB single transaction; counts + digests verified in-DB', async () => {
  restoreOut = await exec()
  ok(restoreOut.ok && restoreOut.db.committed && restoreOut.db.digests_match, JSON.stringify(restoreOut).slice(0, 300))
  eq(restoreOut.storageUploaded, 7, 'Storage 업로드 수')
  for (const t of FULL.filter(x => x !== 'app_settings' && x !== 'admin_logs')) eq(restoreOut.db.inserted[t], snapshot.table_counts[t], `삽입 ${t}`)
  eq(restoreOut.db.inserted.app_settings, snapshot.table_counts.app_settings, 'app_settings 삽입(허용 키)')
})
await test('COMPARE DB: counts / ids / row digests equal for all tables (admin_logs +1 audit row); ids preserved (UUID/PK)', async () => {
  const c = await counts()
  for (const t of FULL) eq(c[t], t === 'admin_logs' ? snapshot.table_counts[t] + 1 : snapshot.table_counts[t], t)
  const s2 = must(await rpcA('admin_backup_export', { p_mode: 'full' }), 'export2')
  for (const t of FULL.filter(x => x !== 'admin_logs')) eq(s2.table_digests[t], snapshot.table_digests[t], `digest ${t}`)
  for (const t of FULL.filter(x => !['admin_logs', 'app_settings'].includes(x))) eq((await allRows(t)).map(r => r[pkOf(t)]).sort(), originalRows[t].map(r => r[pkOf(t)]).sort(), `id ${t}`)
  const now = new Map((await allRows('purchase_request_reagent_items')).map(r => [r.id, r]))
  ok(originalRows.purchase_request_reagent_items.every(r => JSON.stringify(now.get(r.id)) === JSON.stringify(r)), '구매요청 항목 전 컬럼 동일')
  const goods = await allRows('purchase_request_goods_items'); ok(goods.every(g => Number(g.total_price) === 3500.875 && Number(g.quantity) === 3.5), 'numeric 정밀도')
  const logs = await allRows('admin_logs'); ok(logs.filter(r => r.action === '전체 복원 실행' && /full/.test(r.description || '')).length === 1, '복원 감사 로그(모드 full)')
})
await test('COMPARE app_settings: allowlisted keys restored exactly; secrets NOT restored (super_password absent; admin_password stays the TARGET value, not from the backup)', async () => {
  const s = Object.fromEntries((await allRows('app_settings')).map(r => [r.key, r.value]))
  for (const k of ['lab_name', 'lab_phone', 'lab_professor', 'quick_links', 'kosha_label_url']) eq(s[k], originalRows.app_settings.find(r => r.key === k).value, k)
  ok(!('super_password' in s), 'super_password 복원되지 않음'); eq(s.admin_password, 'TOPSECRET-ADMIN', 'admin_password 는 대상 값 그대로(백업에 없음)'); ok(!('restore_enabled' in s) || s.restore_enabled === 'true', 'restore_enabled 는 백업에서 오지 않음(테스트가 켠 값)')
})
await test('COMPARE Storage: every object restored byte-for-byte (size + sha256 + content-type) at the SAME bucket/path; unreferenced + missing files were not created', async () => {
  for (const o of [OBJ.a, OBJ.b, OBJ.c, OBJ.legacy, OBJ.msds, OBJ.res, OBJ.resOld]) {
    const b = await dl(service, o.path); ok(b, '없음: ' + o.path); eq([b.length, sha(b)], [o.bytes.length, sha(o.bytes)], o.path)
    const dir = o.path.slice(0, o.path.lastIndexOf('/')); const name = o.path.slice(o.path.lastIndexOf('/') + 1)
    const meta = (await service.storage.from(BUCKET).list(dir, { search: name })).data.find(e => e.name === name)
    eq(meta.metadata.mimetype, o.type, 'content-type ' + o.path)
  }
  ok(!(await objectExists(service, BUCKET, OBJ.orphan.path)), '참조 없는 파일은 복원하지 않음'); ok(!(await objectExists(service, BUCKET, GONE)), '없던 파일은 만들지 않음')
})
await test('COMPARE links: restored DB URLs resolve to the restored files (public URL fetch == original bytes); external URL untouched; missing link kept as link only', async () => {
  const nf = await allRows('notice_files')
  const a = nf.find(r => r.file_name === '첨부 A.pdf'); const res = await fetch(a.file_url); ok(res.ok, 'fetch ' + a.file_url); eq(sha(Buffer.from(await res.arrayBuffer())), sha(OBJ.a.bytes), 'notice_files A')
  const bb = nf.find(r => r.file_name === 'b (1).bin'); const r2 = await fetch(bb.file_url); ok(r2.ok, '공백/괄호 경로 URL'); eq(sha(Buffer.from(await r2.arrayBuffer())), sha(OBJ.b.bytes), 'notice_files B')
  eq(nf.find(r => r.file_name === '외부 링크.pdf').file_url, 'https://example.com/external.pdf', '외부 URL 그대로'); ok(nf.find(r => r.file_name === '사라진 파일.pdf'), '링크만 있는 행도 복원')
  const msds = (await allRows('reagents')).find(r => r.msds_url && r.msds_url.includes(OBJ.msds.path.split('/')[1])); const r3 = await fetch(msds.msds_url); ok(r3.ok, 'MSDS URL'); eq(sha(Buffer.from(await r3.arrayBuffer())), sha(OBJ.msds.bytes), 'msds')
  const rf = (await allRows('resource_files')).find(r => r.is_current); eq(sha(Buffer.from(await dl(service, rf.storage_path))), sha(OBJ.res.bytes), 'resource_files.storage_path')
})
await test('RE-RUN safety: restoring again is refused at dry-run (targets not empty + every Storage path conflicts); nothing overwritten', async () => {
  const before = await counts(); const b = sha(Buffer.from(await dl(service, OBJ.a.path)))
  const r = await exec(); ok(!r.ok && r.stage === 'dry-run', JSON.stringify(r).slice(0, 200))
  eq(await counts(), before, '행 수 불변'); eq(sha(Buffer.from(await dl(service, OBJ.a.path))), b, '파일 불변')
})

// ══ 6. 다른 프로젝트로 복원(Storage URL 기준 주소 재작성) ═════════════════════════════════
await test('CROSS-PROJECT restore: URL columns pointing at the SOURCE project are rewritten to this project; digests verified against the rewritten rows', async () => {
  const OLD = 'https://old-project-ref.supabase.co/storage/v1/object/public/'
  const alt = clone(snapshot)
  for (const [t, col] of [['notice_files', 'file_url'], ['notices', 'file_url'], ['resource_files', 'file_url'], ['reagents', 'msds_url']]) for (const r of alt.tables[t]) if (r[col] && r[col].startsWith(base)) r[col] = OLD + r[col].slice(base.length)
  alt.storage_refs = alt.storage_refs   // (경로 기준이라 동일)
  const zipAlt = await buildBackupZip(alt, { appVersion: 'test', storage: { ...originalObjs.st, base: OLD, unreferenced: originalObjs.unref } })
  const pAlt = await parsedOf(zipAlt); eq(pAlt.problems, [], 'alt ZIP')
  await service.from('app_settings').delete().eq('key', 'restore_enabled')
  // 초기화
  await wipeAll(); must(await service.from('app_settings').upsert({ key: 'restore_enabled', value: 'true' }), 'enable')
  const r = await executeRestore({ ...ctx(), parsed: pAlt, confirm: 'RESTORE' })
  ok(r.ok, JSON.stringify(r).slice(0, 300))
  const nf = await allRows('notice_files'); ok(nf.filter(x => x.file_url.startsWith(base)).length >= 4 && !nf.some(x => x.file_url.includes('old-project-ref')), 'notice_files URL 재작성')
  const reag = (await allRows('reagents')).find(x => x.msds_url && x.msds_url.includes('msds/')); ok(reag.msds_url.startsWith(base), 'reagents.msds_url 재작성')
  eq((await allRows('notice_files')).find(x => x.file_name === '외부 링크.pdf').file_url, 'https://example.com/external.pdf', '외부 URL 은 재작성 대상 아님')
  const a = nf.find(x => x.file_name === '첨부 A.pdf'); eq(sha(Buffer.from(await (await fetch(a.file_url)).arrayBuffer())), sha(OBJ.a.bytes), '재작성된 URL 로 파일 열림')
})
await test('app_settings default handling on restore: an EMPTY default (e.g. migration-seeded lab_name = "") is filled, never a non-empty different value', async () => {
  await wipeAll(); must(await service.from('app_settings').upsert([{ key: 'restore_enabled', value: 'true' }, { key: 'lab_name', value: '' }]), 'seed empty default')
  const r = await exec(); ok(r.ok, JSON.stringify(r).slice(0, 250))
  eq((await allRows('app_settings')).find(x => x.key === 'lab_name').value, '강원대 화학교육 연구실', '빈 기본값은 백업 값으로 채움')
})

await test('cleanup: remove test objects/rows, disable restore flag, drop users, leave minimal fixtures', async () => {
  await wipeAll()
  await service.from('students').insert([{ student_id: 'TEST-STU-0001', name: 'TEST Student One', birth_date: '2000-01-01', is_admin: false, is_super: false }, { student_id: 'TEST-STU-0002', name: 'TEST Student Two', birth_date: '2001-02-02', is_admin: false, is_super: false }])
  await service.from('app_settings').upsert({ key: 'admin_password', value: 'TEST-ADMIN-PIN-0001' })
  await service.from('admin_users').delete().eq('user_id', adminId); await service.auth.admin.deleteUser(adminId); await service.auth.admin.deleteUser(userId)
  ok(await noObjects(), 'Storage 정리'); eq((await service.from('app_settings').select('key').eq('key', 'restore_enabled')).data.length, 0, '복원 플래그 해제')
})

const pass = results.filter(Boolean).length
console.log(`\nTOTAL=${results.length} PASS=${pass} FAIL=${results.length - pass}`)
process.exitCode = pass === results.length ? 0 : 1
