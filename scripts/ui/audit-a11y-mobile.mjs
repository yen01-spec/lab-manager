import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock, LOCATIONS } from './harness.mjs'

const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')
const VP = {
  mobile: [[320, 568], [360, 800], [375, 667], [390, 844], [412, 915], [430, 932]],
  desktop: [[1366, 768], [1440, 900], [1920, 1080]],
}
const only = process.argv[2]   // e.g. "mobile" | "desktop"
const pageFilter = process.argv[3]
const reagents = buildReagents(300)

function fakeJwt(uid) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub: uid, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 36000 })}.sig`
}
const ADMIN_UID = '11111111-1111-1111-1111-111111111111'
const adminSession = () => ({
  access_token: fakeJwt(ADMIN_UID), refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000,
  user: { id: ADMIN_UID, email: 'admin@test.local', aud: 'authenticated', role: 'authenticated' },
})

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'reagent-list', path: '/reagents/list' },
  { name: 'reagent-detail', path: '/reagents/r-0010' },
  { name: 'inventory', path: '/inventory' },
  { name: 'bulk-edit', path: '/reagents/bulk-edit' },
  { name: 'purchase-request', path: '/purchase-request' },
  { name: 'resources', path: '/resources' },
  { name: 'notices', path: '/notices' },
  { name: 'admin-login-gate', path: '/admin' },
  { name: 'admin-requests', path: '/admin', admin: true },
]

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const rows = []
for (const kind of Object.keys(VP)) {
  if (only && only !== kind) continue
  for (const [w, h] of VP[kind]) {
    for (const pg of PAGES) {
      if (pageFilter && pageFilter !== pg.name) continue
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: kind === 'mobile', isMobile: kind === 'mobile' })
      if (pg.admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession())
      const stats = await installMock(ctx, reagents)
      // admin_users lookup succeeds for the fake admin
      await ctx.route(/\/rest\/v1\/admin_users/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify([{ user_id: ADMIN_UID }]) }))
      const page = await ctx.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      try {
        await page.goto(BASE + pg.path, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1200)
        if (pg.name === 'admin-requests') { await page.getByText('정보 변경').first().click().catch(() => {}); await page.waitForTimeout(500) }
        await page.evaluate(axeSrc)
        const m = await page.evaluate(async (isMobile) => {
          const vw = window.innerWidth
          const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight * 3 }
          const interactive = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')].filter(vis)
          const small = interactive.filter(el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height) < 44 && !(el.type === 'checkbox' || el.type === 'radio') })
          const smallInputs = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea')].filter(vis).filter(el => parseFloat(getComputedStyle(el).fontSize) < 16)
          const noName = [...document.querySelectorAll('button, [role=button], a[href]')].filter(vis).filter(el => !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img[alt]'))
          const wide = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed' }).slice(0, 5)
            .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 20)}`)
          const axe = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })
          const serious = axe.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}(${v.nodes.length})`)
          return {
            overflowX: document.documentElement.scrollWidth > vw + 1, docW: document.documentElement.scrollWidth,
            smallTargets: isMobile ? small.length : 0, smallSample: isMobile ? small.slice(0, 4).map(e => (e.innerText || e.getAttribute('aria-label') || e.tagName).toString().trim().slice(0, 14)) : [],
            smallInputs: smallInputs.length, noName: noName.length, wide, serious,
          }
        }, kind === 'mobile')
        rows.push({ kind, vp: `${w}x${h}`, page: pg.name, ...m, errors: errors.length })
      } catch (e) {
        rows.push({ kind, vp: `${w}x${h}`, page: pg.name, fatal: e.message.slice(0, 80) })
      }
      await ctx.close()
    }
  }
}
await browser.close()
for (const r of rows) {
  const flags = []
  if (r.fatal) flags.push('FATAL ' + r.fatal)
  if (r.overflowX) flags.push(`OVERFLOW(${r.docW})`)
  if (r.smallTargets) flags.push(`small-targets=${r.smallTargets}[${r.smallSample.join('|')}]`)
  if (r.smallInputs) flags.push(`input<16px=${r.smallInputs}`)
  if (r.noName) flags.push(`unnamed-btn=${r.noName}`)
  if (r.wide?.length) flags.push('wide:' + r.wide.join(','))
  if (r.serious?.length) flags.push('axe:' + r.serious.join(','))
  if (r.errors) flags.push(`pageerrors=${r.errors}`)
  console.log(`${r.vp.padEnd(9)} ${r.page.padEnd(17)} ${flags.length ? flags.join(' ; ') : 'OK'}`)
}
