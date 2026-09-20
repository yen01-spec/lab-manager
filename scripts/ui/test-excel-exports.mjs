// Excel 내보내기 회귀 — 관리자 세션(가짜 Auth)으로 각 화면의 다운로드를 실제로 받아 xlsx를 파싱해 확인한다.
// 모든 Supabase 요청은 harness가 가로채므로 실제 서버에 연결되지 않는다.
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const reagents = buildReagents(120)
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const session = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 36000 })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: UID, email: 'a@test.local' } }
const results = []
const test = async (name, fn) => { try { const d = await fn(); results.push(1); console.log(`[PASS] ${name}${d ? ' — ' + JSON.stringify(d) : ''}`) } catch (e) { results.push(0); console.log(`[FAIL] ${name}: ${e.message.slice(0, 200)}`) } }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), session)
await installMock(ctx, reagents)
await ctx.route(/\/rest\/v1\/admin_users/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ user_id: UID }]) }))
const page = await ctx.newPage()
page.on('dialog', d => d.accept())

async function grabDownload(clickFn) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), clickFn()])
  const path = await dl.path()
  const wb = XLSX.read(readFileSync(path), { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return { name: dl.suggestedFilename(), sheets: wb.SheetNames, rows: XLSX.utils.sheet_to_json(ws, { header: 1 }) }
}

await test('reagent list Excel export (admin toolbar button)', async () => {
  await page.goto(BASE + '/reagents/list'); await page.waitForSelector('[data-index]'); await page.waitForTimeout(600)
  const r = await grabDownload(() => page.getByRole('button', { name: /Excel로 내보내기/ }).click())
  if (r.rows.length < 100) throw new Error('rows=' + r.rows.length)
  return { file: r.name, rows: r.rows.length, header: r.rows[0].slice(0, 4) }
})
await test('bulk-add Excel template download', async () => {
  await page.goto(BASE + '/admin'); await page.waitForTimeout(800)
  await page.getByText('Excel 일괄 추가').first().click(); await page.waitForTimeout(400)
  const r = await grabDownload(() => page.getByRole('button', { name: /양식 다운로드/ }).click())
  if (!r.rows[0] || r.rows[0].length < 5) throw new Error('template header too short')
  return { file: r.name, header: r.rows[0].slice(0, 4) }
})
await test('inventory snapshot export + backup Excel (admin sync tab)', async () => {
  await page.goto(BASE + '/admin'); await page.waitForTimeout(800)
  await page.getByText('현재 재고 동기화').first().click(); await page.waitForTimeout(600)
  const exp = await grabDownload(() => page.getByRole('button', { name: /현재 재고 동기화용 Excel 다운로드/ }).click())
  if (exp.rows.length < 2) throw new Error('export rows=' + exp.rows.length)
  return { file: exp.name, rows: exp.rows.length }
})
await test('picked list -> school chemical registration Excel', async () => {
  await page.goto(BASE + '/reagents/list'); await page.waitForSelector('[data-index]'); await page.waitForTimeout(500)
  await page.locator('[data-index] input[type=checkbox]').nth(2).click()
  await page.getByRole('button', { name: '선택 목록 보기' }).click(); await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Excel 내보내기/ }).last().click(); await page.waitForTimeout(300)
  const r = await grabDownload(async () => { await page.getByText('학교 화학물질 등록 양식').first().click() })
  return { file: r.name, rows: r.rows.length }
})
await browser.close()
console.log(`\nTOTAL=${results.length} PASS=${results.filter(Boolean).length} FAIL=${results.filter(x => !x).length}`)
process.exitCode = results.every(Boolean) ? 0 : 1
