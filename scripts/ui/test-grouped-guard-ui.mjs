// 묶음 행(sealed_count > 1) 가드 UI — 병 단위 작업(위치 변경/폐기 신청, 일괄정리)이 화면에서도 막히고 안내가 보이는지. 가짜 Supabase.
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const rs = buildReagents(20)
// r-0002: 병 1개(k=0) sealed_count = 2 → 묶음 행 / r-0001: sealed_count = 1 → 정상
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
await installMock(ctx, rs)
const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => reply(r, { status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }))
const page = await ctx.newPage()
const errors = []; page.on('pageerror', e => errors.push(e.message))
const submits = []
page.on('request', q => { if (/rpc\/(disposal|location)_request_submit/.test(q.url())) submits.push(q.url()) })

const lot2 = rs[2].reagent_lots[0]; const lot1 = rs[1].reagent_lots[0]
ok('fixture: r-0002 lot is grouped (sealed 2), r-0001 lot is a single bottle (sealed 1)', lot2.sealed_count === 2 && lot1.sealed_count === 1, [lot2.sealed_count, lot1.sealed_count])

await page.goto(BASE + '/reagents/r-0002', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /위치 변경 신청/ }).first().waitFor({ timeout: 15000 })
ok('detail (grouped lot): 위치 변경 신청 button is disabled', await page.getByRole('button', { name: /위치 변경 신청/ }).first().isDisabled())
await page.getByRole('button', { name: /더보기/ }).click()
ok('detail (grouped lot): 폐기 신청 menu item is disabled', await page.getByRole('button', { name: /^🗑️ 폐기 신청/ }).isDisabled())
await page.keyboard.press('Escape')

await page.goto(BASE + '/reagents/r-0001', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /위치 변경 신청/ }).first().waitFor({ timeout: 15000 })
ok('detail (single-bottle lot): 위치 변경 신청 is enabled', await page.getByRole('button', { name: /위치 변경 신청/ }).first().isEnabled())

await page.goto(BASE + '/reagents/bulk-edit', { waitUntil: 'domcontentloaded' })
await page.getByText('시약 일괄정리').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(1500)
const txt = await page.locator('main').innerText()
ok('bulk-edit: grouped rows are flagged "묶음 행 … 병별 Lot 행으로 분리 필요"', txt.includes('묶음 행') && txt.includes('병별 Lot 행으로 분리 필요'))
const disabled = await page.locator('tbody input[type=checkbox][disabled]').count()
ok('bulk-edit: grouped rows cannot be selected (checkbox disabled)', disabled >= 1, disabled)
ok('no submit RPC was called; no page errors', submits.length === 0 && errors.length === 0, { submits, errors })
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
