import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
const b = await chromium.launch({ executablePath: CHROME, headless: true })
const reagents = buildReagents(200)
for (const vp of [{ w: 1440, h: 900, m: false }, { w: 390, h: 844, m: true }]) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.m, isMobile: vp.m })
  const stats = { requests: [], reagentQueries: 0, session: { id: 1, status: 'reviewed', label: '가을', year: 2026 },
    counts: [
      { lot_id: 'lot-0-0', reagent_id: 'r-0000', actual_sealed: 1, actual_stock: 33, reported_missing: false, staged_location_id: 'loc-c1', staged_reagent_fields: { company: 'CHANGED-CO' }, staged_lot_fields: null },
      { lot_id: 'lot-1-0', reagent_id: 'r-0001', actual_sealed: 0, actual_stock: 5, reported_missing: true, staged_location_id: null, staged_reagent_fields: null, staged_lot_fields: null },
    ] }
  await installMock(ctx, reagents, stats)
  const page = await ctx.newPage()
  await page.goto(`${BASE}/reagents/list`); await page.waitForSelector('[data-index]'); await page.waitForTimeout(600)
  const banner = await page.locator('[role=status]').first().innerText().catch(() => null)
  const info = await page.evaluate(() => {
    const tinted = [...document.querySelectorAll('td, span')].filter(e => getComputedStyle(e).backgroundColor === 'rgb(221, 235, 255)')
    return { tintedCount: tinted.length, sample: tinted.slice(0, 4).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 30)) }
  })
  console.log(vp.w, 'banner:', banner && banner.slice(0, 80), JSON.stringify(info))
  await page.screenshot({ path: `overlay-${vp.w}.png` })
  await ctx.close()
}
await b.close()
