// 백업/복원 관리자 화면 — 백업 내려받기(ZIP+Excel), 파일 검증, dry-run, 실행 잠금(비활성 환경/확인 문구/복원 전 백업). 가짜 Supabase.
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
import { buildBackupZip } from '../../src/lib/backupZip.js'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }
const ORDER = ['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests', 'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history', 'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs']

const snapshot = {
  backup_version: 1, created_at: '2026-09-23T01:02:03.456789+00:00', schema_version: 'v1-abcdef123456', table_order: ORDER,
  tables: Object.fromEntries(ORDER.map(t => [t, t === 'reagents' ? [{ id: 'r1', name: 'Acetone', company: 'Daejung' }] : t === 'locations' ? [{ id: 'l1', room: '303호', detail: 'A' }] : t === 'reagent_lots' ? [{ id: 'b1', reagent_id: 'r1', lot_no: 'X', location_id: 'l1', status: 'active' }] : []])),
}
snapshot.table_counts = Object.fromEntries(ORDER.map(t => [t, snapshot.tables[t].length]))
snapshot.table_digests = Object.fromEntries(ORDER.map(t => [t, 'd'.repeat(32)]))
snapshot.table_columns = { reagents: ['id', 'name', 'company'], locations: ['id', 'room', 'detail'], reagent_lots: ['id', 'reagent_id', 'lot_no', 'location_id', 'status'], ...Object.fromEntries(ORDER.filter(t => !['reagents', 'locations', 'reagent_lots'].includes(t)).map(t => [t, ['id']])) }
const zipBytes = await buildBackupZip(snapshot, { appVersion: 'ui-test' })
const tmp = new URL('./_tmp-backup.zip', import.meta.url)
import { writeFileSync, rmSync } from 'node:fs'
writeFileSync(tmp, zipBytes)

async function open(browser, { enabled, unavailable = false }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  await installMock(ctx, buildReagents(10))
  const reply = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  const rpcs = []
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/rpc\/admin_restore_status/, r => unavailable ? reply(r, { message: 'function not found' }, 404) : reply(r, { enabled, schema_version: snapshot.schema_version, tables: ORDER }))
  await ctx.route(/\/rest\/v1\/rpc\/admin_backup_export/, r => { rpcs.push({ name: 'admin_backup_export' }); reply(r, snapshot) })
  await ctx.route(/\/rest\/v1\/rpc\/admin_restore_full/, r => {
    const body = JSON.parse(r.request().postData() || '{}'); rpcs.push({ name: 'admin_restore_full', body })
    if (body.p_dry_run) return reply(r, { ok: true, dry_run: true, committed: false, would_insert: snapshot.table_counts, digests_match: true })
    return reply(r, { ok: true, dry_run: false, committed: true, inserted: snapshot.table_counts, digests_match: true })
  })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const writes = []
  page.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method()) && !/\/rpc\/admin_(restore_status|backup_export|restore_full)/.test(q.url())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  return { ctx, page, rpcs, errors, writes }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
{
  const { ctx, page, rpcs, errors, writes } = await open(browser, { enabled: false })
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /백업\/복원/ }).first().click()
  await page.getByText('전체 백업').first().waitFor({ timeout: 15000 })
  ok('status: restore execution shown as DISABLED in this environment (production default)', (await page.getByTestId('restore-status').innerText()).includes('비활성화'))

  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /복원용 백업 내려받기/ }).click()])
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /조회용 Excel 내려받기/ }).click()])
  const names = [d1.suggestedFilename(), d2.suggestedFilename()]
  ok('backup: separate roles — lab-backup_*.zip (restore) and *_조회용.xlsx (viewing), one download each', /^lab-backup_\d{8}_\d{4}\.zip$/.test(names[0]) && /_조회용\.xlsx$/.test(names[1]), names)
  const zipDl = d1
  const z = await JSZip.loadAsync(readFileSync(await zipDl.path()))
  const mf = JSON.parse(await z.file('manifest.json').async('string'))
  ok('backup zip: manifest has backup_version/created_at/app_version/schema_version/table_counts + 16 table files', mf.backup_version === 1 && mf.created_at && mf.app_version && mf.schema_version === snapshot.schema_version && Object.keys(mf.table_counts).length === 16 && ORDER.every(t => z.file(`tables/${t}.json`)))
  const xl = d2
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(readFileSync(await xl.path()))
  ok('backup excel: 요약 + 16 sheets', wb.worksheets.length === 17 && wb.worksheets[0].name === '요약')

  await page.locator('input[type=file]').setInputFiles(new URL('./_tmp-backup.zip', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).waitFor({ timeout: 10000 })
  ok('restore: file verified (manifest counts shown, no problems)', (await page.locator('main').innerText()).includes('reagent_lots') && (await page.getByRole('alert').count()) === 0)
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click()
  await page.getByTestId('dry-report').waitFor()
  const call = rpcs.find(r => r.name === 'admin_restore_full')
  ok('dry-run: RPC called with p_dry_run=true and the verified payload (tables + digests)', call?.body.p_dry_run === true && call.body.p_payload.table_digests && call.body.p_payload.tables.reagents.length === 1)
  ok('dry-run: report says 검증 통과 / 변경 없음', (await page.getByTestId('dry-report').innerText()).includes('검증 통과'))
  const runBtn = page.getByRole('button', { name: /전체 복원 실행/ })
  ok('execute is LOCKED in a disabled environment (button disabled, notice shown, no execute RPC)', (await runBtn.isDisabled()) && (await page.locator('main').innerText()).includes('이 환경에서는 실행할 수 없습니다') && !rpcs.some(r => r.body?.p_dry_run === false))
  ok('no DB write requests other than the backup/restore RPCs; no page errors', writes.length === 0 && errors.length === 0, { writes, errors })
  await ctx.close()
}
{
  const { ctx, page, rpcs, errors } = await open(browser, { enabled: true })
  page.on('dialog', d => d.accept())
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /백업\/복원/ }).first().click()
  await page.getByTestId('restore-status').waitFor({ timeout: 15000 })
  ok('status: enabled environment shows the permitted notice', (await page.getByTestId('restore-status').innerText()).includes('허용'))
  await page.locator('input[type=file]').setInputFiles(new URL('./_tmp-backup.zip', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  await page.getByRole('button', { name: /검증\(dry-run\)/ }).click()
  await page.getByTestId('dry-report').waitFor()
  const runBtn = page.getByRole('button', { name: /전체 복원 실행/ })
  ok('execute locked until BOTH the pre-restore backup is downloaded AND RESTORE is typed', await runBtn.isDisabled())
  await page.getByLabel('확인 문구').fill('RESTORE')
  ok('typing RESTORE alone is not enough (pre-restore backup required)', await runBtn.isDisabled())
  const dlp = page.waitForEvent('download')
  await page.getByRole('button', { name: /복원 전 현재 DB 백업/ }).click()
  await dlp
  await page.waitForFunction(() => document.body.innerText.includes('✔'), null, { timeout: 15000 })
  ok('after pre-restore backup + RESTORE the button is enabled', await runBtn.isEnabled())
  await runBtn.click()
  await page.getByTestId('restore-result').waitFor({ timeout: 10000 })
  const exec = rpcs.find(r => r.body?.p_dry_run === false)
  ok('execute RPC called with p_dry_run=false + p_confirm=RESTORE; result shown', exec?.body.p_confirm === 'RESTORE' && (await page.getByTestId('restore-result').innerText()).includes('복원 완료'))
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}
{
  const { ctx, page } = await open(browser, { enabled: false, unavailable: true })
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /백업\/복원/ }).first().click()
  await page.getByText('설치되어 있지 않습니다').waitFor({ timeout: 15000 })
  ok('environment without the RPCs (e.g. production before the migration): clear "not installed" message, no restore controls', (await page.locator('input[type=file]').count()) === 0)
  await ctx.close()
}
await browser.close()
rmSync(tmp)
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
