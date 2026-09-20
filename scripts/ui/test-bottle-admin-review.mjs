// 관리자 폐기/위치 이동 승인 화면 — "어느 병인지" 식별 정보(병 ID·Lot No.·제조사·현재 위치·개봉 여부)와 병 단위 문구 검증. 가짜 Supabase.
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }
const RID = 'r-0010', LOT = 'lot-10-0'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  await installMock(ctx, buildReagents(20))
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/disposal_requests\?/, r => reply(r, [{ id: 'd1', reagent_id: RID, lot_id: LOT, reagent_name: 'Ethanol', lot_no: 'ABC123', quantity: null, reason: '파손', requested_by: '학생', status: 'pending', created_at: new Date().toISOString() }]))
  await ctx.route(/\/rest\/v1\/location_requests\?/, r => reply(r, [{ id: 'l1', reagent_id: RID, lot_id: LOT, reagent_name: 'Ethanol', from_location_id: 'zz', from_location_name: 'A - 1', to_location_id: 'yy', to_location_name: 'B - 2', requested_by: '학생', status: 'pending', created_at: new Date().toISOString() }]))
  await ctx.route(/\/rest\/v1\/location_history/, r => reply(r, []))
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const tag = `[${w}]`
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /폐기/ }).first().waitFor({ timeout: 15000 })

  await page.getByRole('button', { name: /^🗑️ 폐기/ }).click()
  await page.waitForTimeout(700)
  const dt = await page.locator('main').innerText()
  ok(`${tag} disposal review shows 폐기 대상 병 + 병 ID + Lot + 제조사 + 현재 위치 + 개봉 여부`, ['폐기 대상 병', '병 ID', 'Lot No.', '제조사', '현재 위치', '개봉 여부'].every(k => dt.includes(k)), dt.slice(0, 400))
  ok(`${tag} disposal review has no quantity`, !dt.includes('수량'))
  ok(`${tag} disposal approve button is 병 단위 wording`, (await page.getByRole('button', { name: /승인 \(즉시 폐기 완료\)/ }).count()) === 1)

  await page.getByRole('button', { name: /^📍 위치 변경/ }).click()
  await page.waitForTimeout(700)
  const mt = await page.locator('main').innerText()
  ok(`${tag} location review shows 이 병의 위치 변경 + 병 ID + 현재 위치 + 기존→요청 위치`, ['이 병의 위치 변경', '병 ID', 'Lot No.', '현재 위치', 'A - 1', 'B - 2'].every(k => mt.includes(k)), mt.slice(0, 400))
  ok(`${tag} location review flags stale request (current location differs from request-time location)`, mt.includes('위치가 바뀌어 승인할 수 없습니다'))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  ok(`${tag} no horizontal overflow`, !overflow)
  ok(`${tag} no page errors`, errors.length === 0, errors)
  await ctx.close()
}
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
