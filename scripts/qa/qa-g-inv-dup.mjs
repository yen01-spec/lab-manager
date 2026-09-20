// QA G2b — 재고 입력 저장 중복 호출 확인(Enter → blur 로 같은 값이 두 번 저장되던 문제의 수정 검증). A2 를 45 → 50 으로 되돌린다.
import { browserLaunch, session, ok, summary, studentLogin, BASE } from './lib.mjs'
const browser = await browserLaunch(false)
const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /실사 이어서 진행/ }).click()
await page.locator('input[placeholder="QA-INV-A2"]').waitFor({ timeout: 25000 }); await page.waitForTimeout(1200)
const stock = page.locator('tr', { has: page.locator('input[placeholder="QA-INV-A2"]') }).locator('input[type=number]')
const saves = () => rec.net.filter(r => r.m === 'POST' && /rpc\/inventory_count_save/.test(r.u)).length
let s0 = saves()
await stock.fill('45'); await stock.press('Enter'); await page.waitForTimeout(1800)
ok(`ONE Enter on a changed value → ${saves() - s0} inventory_count_save call (was 2: Enter + blur)`, saves() - s0 === 1, saves() - s0)
s0 = saves()
await stock.fill('50'); await stock.press('Enter'); await page.waitForTimeout(1800)
ok('restore A2 to the book value 50 (1 call)', saves() - s0 === 1 && (await stock.inputValue()) === '50', { calls: saves() - s0, v: await stock.inputValue() })
ok('no rapid-duplicate errors; console clean; no production', rec.errors.length === 0 && rec.console.filter(c => c.t === 'error').length === 0 && rec.prod.length === 0)
await ctx.close(); await browser.close(); summary()
