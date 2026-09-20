// 제조사 로고 선택 팝업 — 모든 viewport 에서 잘리지 않는지(포털 + viewport 충돌), 터치 타깃, 선택 동작. 가짜 Supabase.
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const rs = buildReagents(40)
const VIEWPORTS = [[1366, 768], [1440, 900], [1920, 1080], [320, 568], [360, 800], [390, 844], [430, 932]]
const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function measure(page) {
  return page.evaluate(() => {
    const pop = document.querySelector('[data-testid="company-picker-popup"]')
    if (!pop) return null
    const r = pop.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const btns = [...pop.querySelectorAll('button')]
    const bb = btns.map(b => { const x = b.getBoundingClientRect(); return { w: Math.round(x.width), h: Math.round(x.height) } })
    const cx = r.left + r.width / 2, cy = r.top + Math.min(40, r.height / 2)
    const top = document.elementFromPoint(cx, cy)
    return {
      inside: r.left >= 0 && r.right <= vw + 0.5 && r.top >= 0 && r.bottom <= vh + 0.5, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], vw, vh,
      buttons: btns.length, minW: Math.min(...bb.map(b => b.w)), minH: Math.min(...bb.map(b => b.h)),
      onTop: !!top && pop.contains(top), overflowY: getComputedStyle(pop).overflowY,
      docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}
const pinInput = (page, css) => page.evaluate((c) => {
  const inp = [...document.querySelectorAll('label')].find(l => l.textContent.includes('제조사'))?.nextElementSibling
  inp.style.cssText = c
}, css)

async function newPage(w, h) {
  const mobile = w < 768
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile })
  await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  await installMock(ctx, rs)
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }) }))
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  return { ctx, page, errors }
}

for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`
  const { ctx, page, errors } = await newPage(w, h)
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /신규 시약 등록/ }).click()
  const company = page.locator('label:has-text("제조사") + div input').first()
  await company.waitFor({ timeout: 15000 })
  await company.click()
  await page.getByTestId('company-picker-popup').waitFor({ timeout: 5000 })
  await page.waitForTimeout(150)
  const m = await measure(page)
  ok(`[${tag}] register modal: logo popup fully inside the viewport (portal, no clipping)`, m.inside && m.onTop, m)
  ok(`[${tag}] all 10 logo buttons present, touch targets >= 44px tall and >= 44px wide`, m.buttons === 10 && m.minH >= 44 && m.minW >= 44, { n: m.buttons, minW: m.minW, minH: m.minH })
  ok(`[${tag}] popup scrolls internally when space is short (overflow-y auto); page has no horizontal overflow`, m.overflowY === 'auto' && m.docOverflowX <= 0, m)

  await page.keyboard.press('Escape')
  await pinInput(page, 'position:fixed;right:0;top:120px;width:150px;z-index:2000')
  await company.click(); await page.getByTestId('company-picker-popup').waitFor(); await page.waitForTimeout(150)
  const m2 = await measure(page)
  ok(`[${tag}] input pinned to the right edge -> popup is clamped inside the viewport`, m2.inside && m2.onTop, m2)

  await page.keyboard.press('Escape')
  await pinInput(page, `position:fixed;left:8px;top:${h - 60}px;width:150px;z-index:2000`)
  await company.click(); await page.getByTestId('company-picker-popup').waitFor(); await page.waitForTimeout(150)
  const m3 = await measure(page)
  ok(`[${tag}] input near the bottom edge -> popup opens upward, still inside the viewport`, m3.inside && m3.onTop, m3)

  await page.getByTestId('company-picker-popup').getByRole('button', { name: 'Samchun' }).click()
  ok(`[${tag}] picking a logo fills the company name and closes the popup`, (await company.inputValue()) === 'Samchun' && (await page.getByTestId('company-picker-popup').count()) === 0)

  await company.click(); await page.getByTestId('company-picker-popup').waitFor()
  await page.getByTestId('company-picker-popup').getByText('제조사 로고를 클릭하면').click()
  ok(`[${tag}] click inside the popup (not on a logo) keeps it open`, (await page.getByTestId('company-picker-popup').count()) === 1)
  await page.mouse.click(2, 2); await page.waitForTimeout(100)
  ok(`[${tag}] outside click closes`, (await page.getByTestId('company-picker-popup').count()) === 0)
  ok(`[${tag}] no page errors`, errors.length === 0, errors)
  await ctx.close()
}

// 다른 사용처(구매요청서)도 같은 컴포넌트 — 데스크톱/모바일 샘플
for (const [w, h] of [[1366, 768], [320, 568]]) {
  const tag = `${w}x${h}`
  const { ctx, page } = await newPage(w, h)
  await page.goto(BASE + '/purchase-request', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.getByLabel(/원하는 제품이 있어요/).check().catch(() => {})
  await page.waitForTimeout(300)
  const inp = page.locator('label:has-text("제조사") ~ * input, label:has-text("제조사") + * input').first()
  if (await inp.count()) {
    await inp.click(); await page.getByTestId('company-picker-popup').waitFor({ timeout: 5000 })
    const m = await measure(page)
    ok(`[purchase-request ${tag}] popup inside the viewport`, m.inside && m.onTop, m)
  } else ok(`[purchase-request ${tag}] company field reachable`, false, 'field not found')
  await ctx.close()
}
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
