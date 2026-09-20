// 백업/복원 관리자 화면 — 두 모드(핵심 시약·재고 / 전체 시스템) 구분, 백업 내려받기(ZIP+Excel, Storage 파일 포함), 파일 검증,
// dry-run(Storage 충돌 포함), 실행 잠금, 안전 순서(업로드→검증→DB) 및 실패 시 정리. 가짜 Supabase(DB RPC + Storage API).
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
import { buildBackupZip } from '../../src/lib/backupZip.js'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }
const CORE = ['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests', 'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history', 'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs']
const FULL = [...CORE, 'purchase_request_logs', 'purchase_request_reagent_items', 'purchase_request_goods_items', 'purchase_requests', 'notices', 'notice_files', 'resource_files', 'app_settings']
const sha = b => createHash('sha256').update(b).digest('hex')
const FILE = Buffer.from('%PDF-1.4 fake notice attachment '.repeat(40))
const PATH = 'notices/attach_1.pdf'
const BASEURL = 'https://mockproj.supabase.co/storage/v1/object/public/'

function makeSnapshot(mode) {
  const order = mode === 'full' ? FULL : CORE
  const tables = Object.fromEntries(order.map(t => [t, []]))
  tables.reagents = [{ id: 'r1', name: 'Acetone', company: 'Daejung', msds_url: null }]
  tables.locations = [{ id: 'l1', room: '303호', detail: 'A' }]
  tables.reagent_lots = [{ id: 'b1', reagent_id: 'r1', lot_no: 'X', location_id: 'l1', status: 'active' }]
  if (mode === 'full') { tables.notices = [{ id: 'n1', title: '공지', file_url: null }]; tables.notice_files = [{ id: 'f1', notice_id: 'n1', file_url: `${BASEURL}documents/${PATH}`, file_name: 'attach.pdf', file_size: FILE.length }]; tables.app_settings = [{ key: 'lab_name', value: '연구실' }] }
  const snap = {
    backup_version: 1, backup_mode: mode, created_at: '2026-09-24T01:02:03.456789+00:00', schema_version: mode === 'full' ? 'v1-fullfullfull' : 'v1-corecorecore', table_order: order, tables,
    table_counts: Object.fromEntries(order.map(t => [t, tables[t].length])), table_digests: Object.fromEntries(order.map(t => [t, 'd'.repeat(32)])),
    table_columns: Object.fromEntries(order.map(t => [t, ['id']])),
  }
  if (mode === 'full') snap.storage_refs = [{ bucket: 'documents', path: PATH, refs: [{ table: 'notice_files', column: 'file_url', id: 'f1' }] }]
  return snap
}
const storageObj = { bucket: 'documents', path: PATH, size: FILE.length, sha256: sha(FILE), contentType: 'application/pdf', refs: [{ table: 'notice_files', column: 'file_url', id: 'f1' }], bytes: new Uint8Array(FILE) }
const coreZip = await buildBackupZip(makeSnapshot('core'), { appVersion: 'ui-test' })
const fullZip = await buildBackupZip(makeSnapshot('full'), { appVersion: 'ui-test', storage: { base: BASEURL, objects: [storageObj], missing: [], unreferenced: [{ bucket: 'documents', path: 'safety/orphan.pdf', size: 5 }] } })
const badZip = await (async () => { const z = await JSZip.loadAsync(fullZip); const p = `storage/documents/${PATH}`; const b = await z.file(p).async('uint8array'); b[0] ^= 1; z.file(p, b); return z.generateAsync({ type: 'uint8array' }) })()
const T = new URL('./_tmp/', import.meta.url)
try { rmSync(T, { recursive: true }) } catch { /* 없음 */ }
import { mkdirSync } from 'node:fs'
mkdirSync(T, { recursive: true })
const fp = n => new URL(n, T).pathname.replace(/^\/([A-Za-z]:)/, '$1')
writeFileSync(fp('core.zip'), coreZip); writeFileSync(fp('full.zip'), fullZip); writeFileSync(fp('bad.zip'), badZip)

async function open(browser, { enabled, unavailable = false, existingObject = false, dbFailsOnRun = false, removeFails = false }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  await installMock(ctx, buildReagents(10))
  const reply = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  const seq = []          // 호출 순서(RPC + Storage)
  const uploaded = new Map()
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/rpc\/admin_restore_status/, r => unavailable ? reply(r, { message: 'function not found' }, 404) : reply(r, { enabled, modes: {} }))
  await ctx.route(/\/rest\/v1\/rpc\/admin_backup_export/, r => { const body = JSON.parse(r.request().postData() || '{}'); seq.push(`rpc:export:${body.p_mode}`); reply(r, makeSnapshot(body.p_mode === 'full' ? 'full' : 'core')) })
  await ctx.route(/\/rest\/v1\/rpc\/admin_restore_full/, r => {
    const body = JSON.parse(r.request().postData() || '{}'); seq.push(`rpc:restore:${body.p_dry_run ? 'dry' : 'real'}:${body.p_payload?.backup_mode}`)
    if (body.p_dry_run) return reply(r, { ok: true, dry_run: true, committed: false, mode: body.p_payload.backup_mode, would_insert: body.p_payload.table_counts, digests_match: true, storage_refs: body.p_payload.backup_mode === 'full' ? [{ bucket: 'documents', path: PATH, refs: [] }] : [] })
    if (dbFailsOnRun) return reply(r, { message: 'injected db failure' }, 400)
    return reply(r, { ok: true, dry_run: false, committed: true, mode: body.p_payload.backup_mode, inserted: body.p_payload.table_counts, digests_match: true })
  })
  // Storage API (supabase-js storage-js)
  await ctx.route(/\/storage\/v1\/object\/list\/documents/, async r => {
    const body = JSON.parse(r.request().postData() || '{}'); seq.push(`storage:list:${body.prefix}|${body.search || ''}`)
    const full = body.prefix ? `${body.prefix}/${body.search || ''}` : (body.search || '')
    const exists = existingObject && full === PATH || uploaded.has(full)
    if (exists) return reply(r, [{ name: PATH.split('/').pop(), id: 'obj1', metadata: { size: FILE.length, mimetype: 'application/pdf' } }])
    if (!body.search) return reply(r, [])   // 전체 목록(고아 조회): 비어 있음
    return reply(r, [])
  })
  await ctx.route(/\/storage\/v1\/object\/documents\/.+/, async r => {
    const req = r.request(); const path = decodeURIComponent(new URL(req.url()).pathname.replace('/storage/v1/object/documents/', ''))
    if (req.method() === 'POST') { seq.push(`storage:upload:${path}`); uploaded.set(path, true); return reply(r, { Key: `documents/${path}` }) }
    if (req.method() === 'GET') { seq.push(`storage:download:${path}`); return r.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'access-control-allow-origin': '*' }, body: FILE }) }
    return reply(r, {})
  })
  await ctx.route(/\/storage\/v1\/object\/documents$/, async r => {
    if (r.request().method() === 'DELETE') { const body = JSON.parse(r.request().postData() || '{}'); seq.push(`storage:remove:${(body.prefixes || []).join(',')}`); if (removeFails) return reply(r, { message: 'injected remove failure' }, 500); for (const p of body.prefixes || []) uploaded.delete(p); return reply(r, []) }
    return reply(r, {})
  })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const writes = []
  page.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method()) && !/\/rpc\/admin_(restore_status|backup_export|restore_full)/.test(q.url())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  return { ctx, page, seq, errors, writes }
}
const dlOf = async (page, name, nth = 0) => { const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name }).nth(nth).click()]); return d }
const goTab = async page => { await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: /백업\/복원/ }).first().click(); await page.getByText('전체 시스템 백업').first().waitFor({ timeout: 15000 }) }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
{
  const { ctx, page, seq, errors, writes } = await open(browser, { enabled: false })
  await goTab(page)
  const txt = await page.locator('main').innerText()
  ok('UI: two clearly separated backup modes — "핵심 시약·재고 백업" and "전체 시스템 백업", each with its own scope text', txt.includes('핵심 시약·재고 백업') && txt.includes('전체 시스템 백업') && txt.includes('Storage 실제 파일') && txt.includes('모드 A') && txt.includes('모드 B'))
  ok('UI: PII notice (students 생년월일) kept for both modes', (txt.match(/생년월일이 있으니 백업 파일을 안전하게 보관/g) || []).length === 2)
  ok('UI: atomicity limit stated (DB single transaction ≠ Storage; upload → verify → DB; cleanup on failure) — never claims one transaction', (await page.getByTestId('atomicity-note').innerText()).includes('Storage 파일은 별개 시스템') && !/DB와 Storage가 한 트랜잭션/.test(txt))
  ok('UI: restore disabled notice in this environment', (await page.getByTestId('restore-status').innerText()).includes('비활성화'))

  const d1 = await dlOf(page, /핵심 복원용 백업 내려받기/)
  const z1 = await JSZip.loadAsync(readFileSync(await d1.path())); const m1 = JSON.parse(await z1.file('manifest.json').async('string'))
  ok('core backup download: mode=core, 16 tables, NO storage/ entries', m1.backup_mode === 'core' && Object.keys(m1.table_counts).length === 16 && !Object.keys(z1.files).some(n => n.startsWith('storage/')) && /^lab-core-backup_\d{8}_\d{4}\.zip$/.test(d1.suggestedFilename()), d1.suggestedFilename())
  const d2 = await dlOf(page, /전체 시스템 복원용 백업 내려받기/)
  const z2 = await JSZip.loadAsync(readFileSync(await d2.path())); const m2 = JSON.parse(await z2.file('manifest.json').async('string'))
  ok('full backup download: mode=full, 24 tables, storage/documents/<path> file + manifest.storage[bucket,path,size,sha256]', m2.backup_mode === 'full' && Object.keys(m2.table_counts).length === 24 && !!z2.file(`storage/documents/${PATH}`) && m2.storage.objects[0].sha256 === sha(FILE) && m2.storage.objects[0].size === FILE.length && /^lab-system-backup_/.test(d2.suggestedFilename()), m2.storage?.objects)
  ok('full backup: Storage file downloaded once (no N+1), server refs used', seq.filter(s => s.startsWith('storage:download:')).length === 1 && seq.includes('rpc:export:full'))
  const d3 = await dlOf(page, /조회용 Excel 내려받기/, 0)
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(readFileSync(await d3.path()))
  ok('core Excel viewing copy: 요약 + 16 sheets', wb.worksheets.length === 17 && /_조회용\.xlsx$/.test(d3.suggestedFilename()))
  ok('no DB write requests besides backup/restore RPCs; no page errors', writes.length === 0 && errors.length === 0, { writes, errors })
  ok('no restore RPC executed while browsing/backing up', !seq.some(s => s.startsWith('rpc:restore')))
  await ctx.close()
}
{
  // 복원 화면(비활성 환경): 핵심 ZIP / 전체 ZIP / 변조 ZIP
  const { ctx, page, seq } = await open(browser, { enabled: false })
  await goTab(page)
  await page.locator('input[type=file]').setInputFiles(fp('core.zip'))
  await page.getByTestId('restore-mode').waitFor({ timeout: 10000 })
  ok('restore(core ZIP): mode badge = 핵심 시약·재고 백업, no Storage summary', (await page.getByTestId('restore-mode').innerText()).includes('핵심 시약·재고 백업') && (await page.getByTestId('storage-summary').count()) === 0)
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click(); await page.getByTestId('dry-report').waitFor()
  ok('restore(core): dry-run ok, no Storage calls', (await page.getByTestId('dry-report').innerText()).includes('검증 통과') && !seq.some(s => s.startsWith('storage:')))
  await page.locator('input[type=file]').setInputFiles(fp('full.zip'))
  await page.getByText('Storage 파일 1개').waitFor({ timeout: 10000 })
  ok('restore(full ZIP): mode badge = 전체 시스템 백업 + Storage summary (files / missing / unreferenced)', (await page.getByTestId('restore-mode').innerText()).includes('전체 시스템 백업') && (await page.getByTestId('storage-summary').innerText()).includes('참조 없는 파일(백업 제외) 1개'))
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click(); await page.getByTestId('dry-report').waitFor()
  ok('restore(full): dry-run ok — includes Storage conflict check, zero uploads', (await page.getByTestId('dry-report').innerText()).includes('Storage 파일(경로·sha256·충돌)') && seq.some(s => s.startsWith('storage:list:')) && !seq.some(s => s.startsWith('storage:upload')) && !seq.some(s => s === 'rpc:restore:real:full'))
  ok('restore(full) in a disabled environment: execute button locked', await page.getByRole('button', { name: /③ 복원 실행/ }).isDisabled())
  await page.locator('input[type=file]').setInputFiles(fp('bad.zip'))
  await page.getByRole('alert').first().waitFor({ timeout: 10000 })
  ok('tampered Storage file in the ZIP → problem shown (sha256 불일치), dry-run button disabled', (await page.getByRole('alert').first().innerText()).includes('sha256 불일치') && await page.getByRole('button', { name: /검증\(dry-run\)/ }).isDisabled())
  await ctx.close()
}
{
  // Storage 충돌: 대상에 같은 경로 객체가 이미 있으면 dry-run 실패, 업로드 0
  const { ctx, page, seq } = await open(browser, { enabled: true, existingObject: true })
  await goTab(page)
  await page.locator('input[type=file]').setInputFiles(fp('full.zip')); await page.getByTestId('restore-mode').waitFor()
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click(); await page.getByTestId('dry-report').waitFor()
  const t = await page.getByTestId('dry-report').innerText()
  ok('Storage conflict: dry-run FAILS with the conflicting path (never overwrites), zero uploads/restores', t.includes('복원할 수 없습니다') && t.includes('이미 같은 경로의 객체') && !seq.some(s => s.startsWith('storage:upload') || s === 'rpc:restore:real:full'), t.slice(0, 200))
  await ctx.close()
}
{
  // 실행(허용 환경): 업로드 → 검증 → DB 순서
  const { ctx, page, seq, errors } = await open(browser, { enabled: true })
  page.on('dialog', d => d.accept())
  await goTab(page)
  await page.locator('input[type=file]').setInputFiles(fp('full.zip')); await page.getByTestId('restore-mode').waitFor()
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click(); await page.getByTestId('dry-report').waitFor()
  const run = page.getByRole('button', { name: /③ 복원 실행/ })
  ok('execute locked until pre-restore backup (same mode) + RESTORE', await run.isDisabled())
  await page.getByLabel('확인 문구').fill('RESTORE'); ok('RESTORE alone is not enough', await run.isDisabled())
  const pre = await dlOf(page, /② 복원 전 현재 상태 백업/); ok('pre-restore safety backup is a FULL-mode ZIP for a full restore', /^복원전_lab-system-backup_/.test(pre.suggestedFilename()))
  await page.waitForFunction(() => document.body.innerText.includes('✔'), null, { timeout: 15000 })
  seq.length = 0
  await run.click(); await page.getByTestId('restore-result').waitFor({ timeout: 15000 })
  const order = seq.filter(s => s.startsWith('storage:upload') || s.startsWith('storage:download') || s === 'rpc:restore:real:full' || s.startsWith('storage:remove'))
  const iUp = order.findIndex(s => s.startsWith('storage:upload')), iVer = order.findIndex((s, i) => i > iUp && s.startsWith('storage:download')), iDb = order.indexOf('rpc:restore:real:full')
  ok('SAFE ORDER: Storage upload → upload verification (download) → DB restore RPC; no cleanup on success', iUp >= 0 && iVer > iUp && iDb > iVer && !order.some(s => s.startsWith('storage:remove')), order)
  ok('result shows DB digest verified + Storage files uploaded and verified', (await page.getByTestId('restore-result').innerText()).includes('Storage 파일 1개 업로드·검증 완료'))
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}
{
  // DB 실패 → 업로드한 Storage 파일 정리
  const { ctx, page, seq } = await open(browser, { enabled: true, dbFailsOnRun: true })
  page.on('dialog', d => d.accept())
  await goTab(page)
  await page.locator('input[type=file]').setInputFiles(fp('full.zip')); await page.getByTestId('restore-mode').waitFor()
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click(); await page.getByTestId('dry-report').waitFor()
  await page.getByLabel('확인 문구').fill('RESTORE'); await dlOf(page, /② 복원 전 현재 상태 백업/)
  await page.waitForFunction(() => document.body.innerText.includes('✔'), null, { timeout: 15000 }); seq.length = 0
  await page.getByRole('button', { name: /③ 복원 실행/ }).click()
  await page.getByText(/복원 실패\(db\)/).waitFor({ timeout: 15000 })
  const t = await page.locator('main').innerText()
  ok('DB failure after upload: message says DB unchanged, uploaded file is deleted (remove call), cleanup result shown', seq.some(s => s.startsWith('storage:remove:')) && t.includes('DB 는 변경되지 않았습니다') && t.includes('삭제 1개'), seq.filter(s => s.startsWith('storage')))
  ok('no restore-committed result shown', (await page.getByTestId('restore-result').count()) === 0)
  await ctx.close()
}
{
  // 정리 실패 → 수동 정리 필요 + journal 유지 + 정리 버튼
  const { ctx, page } = await open(browser, { enabled: true, dbFailsOnRun: true, removeFails: true })
  page.on('dialog', d => d.accept())
  await goTab(page)
  await page.locator('input[type=file]').setInputFiles(fp('full.zip')); await page.getByTestId('restore-mode').waitFor()
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click(); await page.getByTestId('dry-report').waitFor()
  await page.getByLabel('확인 문구').fill('RESTORE'); await dlOf(page, /② 복원 전 현재 상태 백업/)
  await page.waitForFunction(() => document.body.innerText.includes('✔'), null, { timeout: 15000 })
  await page.getByRole('button', { name: /③ 복원 실행/ }).click()
  await page.getByText(/복원 실패\(db\)/).waitFor({ timeout: 15000 })
  const t = await page.locator('main').innerText()
  ok('cleanup failure is REPORTED with the leftover path (manual cleanup needed) and the interrupted-restore journal is kept', t.includes('삭제 실패 1개') && t.includes(PATH) && t.includes('이전 복원이 중간에 중단된 기록'), t.slice(0, 300))
  ok('interrupted-restore cleanup button offered (safe conditions explained)', (await page.getByTestId('cleanup-box').innerText()).includes('sha256이 같은 파일만 삭제') || (await page.getByTestId('cleanup-box').innerText()).includes('sha256'))
  await ctx.close()
}
{
  const { ctx, page } = await open(browser, { enabled: false, unavailable: true })
  await goTab(page).catch(() => {})
  await page.getByText('설치되어 있지 않습니다').waitFor({ timeout: 15000 })
  ok('environment without the RPCs (e.g. production before the migration): clear "not installed" message, no restore controls', (await page.locator('input[type=file]').count()) === 0)
  await ctx.close()
}
await browser.close()
try { rmSync(T, { recursive: true }) } catch { /* 무시 */ }
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
