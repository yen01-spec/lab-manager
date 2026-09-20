import { chromium, CHROME, BASE, buildReagents, installMock, results, eq, ok } from './harness.mjs'

const mode = process.argv[2] || 'desktop'
const VIEWPORTS = {
  desktop: [{ w: 1440, h: 900 }, { w: 1366, h: 768 }],
  mobile: [{ w: 390, h: 844 }, { w: 360, h: 800 }, { w: 430, h: 932 }],
}
const reagents = buildReagents(1300)
const { test, summary } = results()
const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function topRow(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-index]')]
    let best = null
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.bottom > 140 && el.querySelector('input[type=checkbox]') && (!best || r.top < best.top)) best = { idx: el.getAttribute('data-index'), top: Math.round(r.top), text: el.innerText.replace(/\s+/g, ' ').slice(0, 40) }
    }
    return best
  })
}
const domRows = (page) => page.evaluate(() => document.querySelectorAll('[data-index]').length)
async function waitList(page) { await page.waitForSelector('[data-index]', { timeout: 15000 }); await page.waitForTimeout(400) }
async function resultCount(page) { return page.evaluate(() => document.body.innerText.match(/검색결과\s*([\d,]+)개/)?.[1] || null) }
async function clickTopRow(page) {
  const t = await topRow(page)
  const sel = `[data-index="${t.idx}"]`
  const loc = mode === 'mobile' ? page.locator(sel).first().locator('div').nth(3) : page.locator(sel).first().locator('td').nth(3)
  await loc.click()
  return t
}
async function scrollTo(page, y) { await page.evaluate(yy => window.scrollTo(0, yy), y); await page.waitForTimeout(500) }

const only = process.argv[3]
for (const vp of VIEWPORTS[mode].filter(v => !only || `${v.w}x${v.h}` === only)) {
  const label = `${mode} ${vp.w}x${vp.h}`
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: mode === 'mobile', isMobile: mode === 'mobile' })
  const stats = await installMock(context, reagents)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const isMobile = mode === 'mobile'
  const detailBack = async (how) => {
    if (how === 'button') await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click()
    else await page.goBack()
  }
  const roundTrip = async (name, how, y, extraCheck) => test(`${label} | ${name} | back=${how}`, async () => {
    await scrollTo(page, y)
    const urlBefore = new URL(page.url()).search
    const cnt = await resultCount(page)
    const before = await clickTopRow(page)
    await page.waitForURL(/\/reagents\/r-/, { timeout: 8000 })
    await page.waitForSelector('text=← 시약 목록', { timeout: 10000 })
    await detailBack(how)
    await page.waitForURL(/\/reagents\/list/, { timeout: 8000 })
    await waitList(page)
    const after = await topRow(page)
    eq(new URL(page.url()).search, urlBefore, 'URL 쿼리 복원')
    eq(await resultCount(page), cnt, '결과 개수')
    eq(after.idx, before.idx, `첫 보이는 행 index (before=${before.text} / after=${after.text})`)
    ok(Math.abs(after.top - before.top) <= 6, `행 오프셋 차이 ${after.top - before.top}px`)
    if (extraCheck) await extraCheck()
    return { url: urlBefore || '(none)', y, row: before.text, offsetDiff: after.top - before.top }
  })

  await page.goto(`${BASE}/reagents/list`)
  await waitList(page)

  await test(`${label} | virtualization: DOM rows vs total`, async () => {
    const dom = await domRows(page)
    const total = await resultCount(page)
    ok(dom < 120, `DOM 행이 너무 많음: ${dom}`)
    const trs = await page.evaluate(() => document.querySelectorAll('tbody tr, [data-index]').length)
    return { domVirtualRows: dom, allTrOrItems: trs, resultCount: total, reagentFetches: stats.reagentQueries }
  })

  await roundTrip('scroll only', 'button', 20000)
  await roundTrip('scroll only', 'browser', 14000)

  // English search
  await test(`${label} | English search + scroll + Back`, async () => {
    await page.fill('input[role="combobox"][placeholder*="시약명"]', 'chloride')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.search.includes('q=chloride'))
    await page.waitForTimeout(700)
    await waitList(page)
    return { count: await resultCount(page), url: new URL(page.url()).search }
  })
  await roundTrip('English search "chloride"', 'button', 3000, async () => {
    eq(await page.inputValue('input[role="combobox"][placeholder*="시약명"]'), 'chloride', '검색창 값 복원')
  })
  await roundTrip('English search "chloride"', 'browser', 2500)

  // Korean search
  await test(`${label} | Korean search`, async () => {
    await page.fill('input[role="combobox"][placeholder*="시약명"]', '아세트산염')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => decodeURIComponent(location.search).includes('q=아세트산염'))
    await page.waitForTimeout(700); await waitList(page)
    return { count: await resultCount(page) }
  })
  await roundTrip('Korean search', 'browser', 1500, async () => {
    eq(await page.inputValue('input[role="combobox"][placeholder*="시약명"]'), '아세트산염', '검색창 값 복원')
  })

  // CAS search
  await test(`${label} | CAS search`, async () => {
    await page.fill('input[role="combobox"][placeholder*="시약명"]', '71-43-2')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => location.search.includes('q=71-43-2'))
    await page.waitForTimeout(700); await waitList(page)
    eq(await resultCount(page), '1', 'CAS 검색 결과 수')
  })
  await test(`${label} | CAS result -> detail -> Back keeps query`, async () => {
    await page.keyboard.press('Escape'); await page.locator('h1, [role=heading]').first().click({ trial: true }).catch(() => {})
    await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(400)
    await clickTopRow(page)
    await page.waitForSelector('text=← 시약 목록')
    await page.goBack(); await waitList(page)
    eq(new URL(page.url()).search, '?q=71-43-2', 'URL')
    eq(await resultCount(page), '1', '결과 수')
  })

  // special preset
  await test(`${label} | preset=special -> URL conversion + detail + Back`, async () => {
    await page.goto(`${BASE}/reagents/list?preset=special`); await waitList(page)
    await page.waitForFunction(() => location.search.includes('special=1') && !location.search.includes('preset'))
    const c1 = await resultCount(page)
    await clickTopRow(page); await page.waitForSelector('text=← 시약 목록')
    await page.goBack(); await waitList(page)
    eq(await resultCount(page), c1, '결과 수')
    return { count: c1, url: new URL(page.url()).search }
  })

  // hazard preset
  await test(`${label} | preset=hazard -> filter URL + scroll + Back`, async () => {
    await page.goto(`${BASE}/reagents/list?preset=hazard`); await waitList(page)
    await page.waitForFunction(() => location.search.includes('hz=') && !location.search.includes('preset'))
    await page.waitForTimeout(500)
    return { count: await resultCount(page), hzParams: (new URL(page.url()).searchParams.getAll('hz')).length }
  })
  await roundTrip('hazard preset', 'button', 4000)

  // hazard preset + room filter + detail filter
  await test(`${label} | hazard + room + detail filter`, async () => {
    await page.getByRole('button', { name: '5호관 101' }).first().click()
    await page.waitForFunction(() => location.search.includes('room='))
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: '시약장 A' }).click()
    await page.waitForFunction(() => location.search.includes('loc='))
    await page.waitForTimeout(700); await waitList(page)
    const u = new URL(page.url())
    ok(u.searchParams.get('room') === '5호관 101' && u.searchParams.get('loc') === 'loc-a1', 'room/loc 반영: ' + u.search)
    return { count: await resultCount(page) }
  })
  await roundTrip('hazard+room+detail', 'browser', 300)

  // reload keeps state
  await test(`${label} | reload keeps URL state`, async () => {
    const before = await resultCount(page); const u = page.url()
    await page.reload(); await waitList(page)
    eq(page.url(), u, 'URL'); eq(await resultCount(page), before, '결과 수')
  })

  // fire filter + special + casmm via UI
  await test(`${label} | fire class + CAS mismatch toggles reflect in URL`, async () => {
    await page.goto(`${BASE}/reagents/list`); await waitList(page)
    await page.getByRole('button', { name: '제4류' }).click()
    await page.getByRole('button', { name: /CAS 확인필요만 보기/ }).click()
    await page.waitForFunction(() => location.search.includes('fire=') && location.search.includes('casmm=1'))
    await page.waitForTimeout(400)
    return { count: await resultCount(page), url: decodeURIComponent(new URL(page.url()).search) }
  })

  // alphabet
  await test(`${label} | alphabet jump then detail Back`, async () => {
    await page.goto(`${BASE}/reagents/list`); await waitList(page)
    if (isMobile) {
      await page.getByRole('button', { name: '알파벳으로 이동' }).click()
      const b = await page.getByRole('button', { name: 'M', exact: true }).boundingBox()
      ok(b.height >= 44 && b.width >= 44, `알파벳 터치 타겟 ${Math.round(b.width)}x${Math.round(b.height)} < 44`)
      await page.getByRole('button', { name: 'M', exact: true }).click()
    } else {
      const btn = page.locator('button', { hasText: /^M$/ }).first()
      await btn.click()
    }
    await page.waitForTimeout(900)
    const t = await topRow(page)
    ok(/^M|^ ?M/.test(t.text) || /M\d{4}/.test(t.text) || t.text.trim() === 'M', `M 구간으로 이동하지 않음: ${t.text}`)
    return { after: t.text }
  })
  await roundTrip('alphabet M', 'button', await page.evaluate(() => window.scrollY))

  // combined: search + filter + scroll
  await test(`${label} | combined search + room filter + scroll + Back`, async () => {
    await page.goto(`${BASE}/reagents/list?q=acid&room=${encodeURIComponent('5호관 101')}`); await waitList(page)
    await page.waitForTimeout(500)
    return { count: await resultCount(page) }
  })
  await roundTrip('combined', 'browser', 900)

  // fresh push (nav link click) must start at top — no restore on PUSH even though a snapshot exists
  await test(`${label} | fresh nav-link PUSH does NOT restore old scroll`, async () => {
    await page.goto(`${BASE}/reagents/list`); await waitList(page)
    await scrollTo(page, 9000)
    await clickTopRow(page); await page.waitForSelector('text=← 시약 목록')
    await page.locator('a[href="/reagents/list"]:visible').first().click()
    await waitList(page)
    const y = await page.evaluate(() => window.scrollY)
    ok(y < 50, `PUSH 진입인데 스크롤이 복원됨: y=${y}`)
    return { scrollY: y }
  })

  // direct detail URL fallback
  await test(`${label} | direct detail URL -> "← 시약 목록" falls back to /reagents/list`, async () => {
    await page.goto(`${BASE}/reagents/r-0010`)
    await page.waitForSelector('text=← 시약 목록', { timeout: 15000 })
    await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click()
    await page.waitForURL(/\/reagents\/list$/)
    await waitList(page)
  })

  await test(`${label} | no page errors`, async () => { eq(errors, [], 'pageerror') })
  await context.close()
}

const f = summary()
await browser.close()
process.exit(f ? 1 : 0)
