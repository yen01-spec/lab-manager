import { browserLaunch, session, shot, waitList, resultCount, BASE } from './lib.mjs'
const browser = await browserLaunch(false === true)
for (const [label, url, batch] of [['plain q', '/reagents/list?q=QA%20compound', false], ['no filter', '/reagents/list', false], ['batch', '/reagents/list', true]]) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page } = await session(browser, { w, h })
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await waitList(page)
    if (batch) { await page.getByRole('button', { name: /시약 일괄 검색/ }).first().click(); await page.getByRole('dialog').getByRole('textbox').fill('QA compound'); await page.getByRole('dialog').getByRole('button', { name: '조회' }).click(); await page.getByTestId('batch-bar').waitFor(); await page.waitForTimeout(800) }
    for (const target of [1200, 2200, 5000]) {
      await page.evaluate(y => window.scrollTo(0, y), target); await page.waitForTimeout(600)
      const y0 = await page.evaluate(() => window.scrollY)
      const anchor = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-index]')].find(e => e.getBoundingClientRect().bottom > 60); return el ? { idx: el.getAttribute('data-index'), top: Math.round(el.getBoundingClientRect().top) } : null })
      const pt = await page.evaluate(m => { const els = m ? [...document.querySelectorAll('[data-index] span')].filter(e => /QA compound/.test(e.textContent) && e.children.length === 0) : [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')]; const e = els.find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } }, w < 768)
      await page.mouse.click(pt.x, pt.y)
      await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.waitForTimeout(800)
      await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click()
      await waitList(page); await page.waitForTimeout(2000)
      const y1 = await page.evaluate(() => window.scrollY)
      const anchor2 = await page.evaluate(() => { const el = [...document.querySelectorAll('[data-index]')].find(e => e.getBoundingClientRect().bottom > 60); return el ? { idx: el.getAttribute('data-index'), top: Math.round(el.getBoundingClientRect().top) } : null })
      console.log(`${label} ${w}x${h} target=${target}: y0=${y0} → y1=${y1} (Δ${y1 - y0}); anchor ${JSON.stringify(anchor)} → ${JSON.stringify(anchor2)}`)
    }
    await ctx.close()
  }
}
await browser.close()
