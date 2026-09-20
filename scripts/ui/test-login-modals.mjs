import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
const b = await chromium.launch({ executablePath: CHROME, headless: true })
for (const [w, h] of [[320, 568], [375, 667], [430, 932]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true })
  await installMock(ctx, buildReagents(50))
  const page = await ctx.newPage()
  await page.goto(BASE + '/'); await page.waitForTimeout(800)
  const out = { vp: `${w}x${h}` }
  await page.getByRole('button', { name: '로그인', exact: true }).first().tap(); await page.waitForTimeout(400)
  const d = await page.getByRole('dialog').first().boundingBox()
  const submit = await page.getByRole('dialog').getByRole('button', { name: '로그인' }).last().boundingBox()
  out.login = { dialog: d && [Math.round(d.x), Math.round(d.y), Math.round(d.width), Math.round(d.height)], inViewport: d && d.x >= 0 && d.x + d.width <= w + 1, submitBottom: submit && Math.round(submit.y + submit.height) }
  await page.screenshot({ path: `login-${w}.png` })
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  out.escapeClosed = (await page.getByRole('dialog').count()) === 0
  // admin login via header drawer
  await page.getByRole('button', { name: '메뉴 열기' }).tap(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: '관리자 로그인' }).tap(); await page.waitForTimeout(400)
  const d2 = await page.getByRole('dialog').first().boundingBox()
  out.adminDialog = d2 && { w: Math.round(d2.width), inViewport: d2.x >= 0 && d2.x + d2.width <= w + 1 }
  const email = page.getByLabel('이메일'); const fs = await email.evaluate(e => getComputedStyle(e).fontSize); out.emailFont = fs
  await page.screenshot({ path: `adminlogin-${w}.png` })
  console.log(JSON.stringify(out))
  await ctx.close()
}
await b.close()
