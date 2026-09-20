// 라우트 감사 — 모든 라우트가 오류 없이 렌더링되고(빈 화면 아님), 옛 주소/없는 주소가 안전하게 처리되는지 확인.
import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8')
const declared = [...app.matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]).filter(p => p !== '*')
const concrete = declared.map(p => '/' + p.replace(':id', p.startsWith('reagents') ? 'r-0010' : '1'))
const paths = ['/', ...concrete, '/requests', '/definitely-not-a-page']
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await installMock(ctx, buildReagents(60))
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
let fail = 0
for (const p of paths) {
  errors.length = 0
  await page.goto(BASE + p, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900)
  const info = await page.evaluate(() => ({ url: location.pathname, text: (document.querySelector('main')?.innerText || '').trim().length }))
  const ok = errors.length === 0 && info.text > 20
  if (!ok) fail++
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${p.padEnd(28)} -> ${info.url.padEnd(24)} text=${info.text} errors=${errors.length}${errors[0] ? ' ' + errors[0].slice(0, 80) : ''}`)
}
await browser.close()
console.log(`\nROUTES=${paths.length} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
