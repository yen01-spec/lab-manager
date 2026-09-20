// QA A — Reagent List / 검색 / A–Z / 일반 필터 (실제 staging 브라우저)
import { browserLaunch, session, ok, note, summary, shot, overflowX, crumbText, resultCount, waitList, BASE } from './lib.mjs'

const headed = process.env.QA_HEADED === '1'
const browser = await browserLaunch(headed, headed ? 150 : 0)
const SUGGEST = page => page.getByTestId('reagent-suggest-popover')
const box = page => page.getByPlaceholder(/시약명.*CAS/).first()

for (const [w, h] of [[1440, 900], [1366, 768], [390, 844], [360, 800]]) {
  const tag = `${w}x${h}`, mobile = w < 768
  const { ctx, page, rec } = await session(browser, { w, h })
  const t0 = Date.now()
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' })
  const sawLoading = await page.getByText('시약 목록을 불러오는 중').first().isVisible().catch(() => false)
  await waitList(page)
  const ms = Date.now() - t0
  await shot(page, `A-${tag}-list`)
  const total = await resultCount(page)
  ok(`[${tag}] STEP2 list loads from staging (loading → list); ${total} reagents in ${ms}ms`, total >= 300, { total, ms, sawLoading })
  const rowsInDom = await page.evaluate(() => document.querySelectorAll('tbody[data-index], [data-index]').length)
  ok(`[${tag}] virtualization: only ${rowsInDom} rows in the DOM for ${total}+ reagents`, rowsInDom > 0 && rowsInDom < 120, rowsInDom)
  ok(`[${tag}] breadcrumb "홈 › 시약 목록", search box, no horizontal overflow`, (await crumbText(page)) === '홈 › 시약 목록' && (await box(page).isVisible()) && (await overflowX(page)) <= 0, { crumb: await crumbText(page), ox: await overflowX(page) })
  if (!mobile) {
    const letters = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^[A-Z]$/.test(b.textContent.trim())).map(b => ({ l: b.textContent.trim(), d: b.disabled })))
    ok(`[${tag}] STEP4 A–Z index: A–Z always shown; letters present in data enabled`, letters.length >= 26 && letters.filter(x => !x.d).length >= 20, { enabled: letters.filter(x => !x.d).map(x => x.l).join('') })
    for (const L of ['A', 'M', 'S']) {
      await page.locator('button', { hasText: new RegExp(`^${L}$`) }).first().click(); await page.waitForTimeout(700)
      const top = await page.evaluate(l => { const td = [...document.querySelectorAll('td[colspan]')].find(t => t.textContent.trim() === l); return td ? Math.round(td.getBoundingClientRect().top) : null }, L)
      ok(`[${tag}] A–Z jump "${L}" → group header "${L}" is on screen near the top`, top !== null && top >= 40 && top < 400, top)
    }
    await shot(page, `A-${tag}-after-jump-S`)
  } else {
    await page.getByRole('button', { name: '알파벳으로 이동' }).click()
    const sheet = page.getByRole('dialog', { name: '알파벳 바로가기' })
    const enabled = await sheet.locator('button:not([disabled])').allInnerTexts()
    ok(`[${tag}] STEP4 mobile A–Z sheet opens; enabled letters = letters present in data`, enabled.filter(x => /^[A-Z]$/.test(x)).length >= 20, enabled.join(''))
    await shot(page, `A-${tag}-az-sheet`)
    await sheet.getByRole('button', { name: 'M', exact: true }).click(); await page.waitForTimeout(700)
    const top = await page.evaluate(() => { const d = [...document.querySelectorAll('[data-index] div')].find(t => t.textContent.trim() === 'M'); return d ? Math.round(d.getBoundingClientRect().top) : null })
    ok(`[${tag}] mobile A–Z "M" jumps to the M group`, top !== null && top >= 40 && top < 400, top)
  }

  // ── STEP3 검색 (영문/국문/CAS/하이픈 없는 CAS/부분/괄호) ──
  const cases = [['Acetic acid', 'Acetic acid'], ['아세트산', 'Acetic acid'], ['64-19-7', 'Acetic acid'], ['64197', 'Acetic acid'], ['acet', 'Acetone'], ['브로모티몰블루(BTB)', 'Bromothymol blue'], ['Iron(III) chloride', 'Iron(III) chloride'], ['ethanol', 'Ethanol']]
  for (const [q, want] of cases) {
    await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
    await page.mouse.move(2, 2)
    await box(page).fill(q)
    await SUGGEST(page).getByRole('option').first().waitFor({ timeout: 6000 }).catch(() => {})
    const opts = await SUGGEST(page).getByRole('option').allInnerTexts().catch(() => [])
    const hasOpt = opts.some(t => t.includes(want))
    ok(`[${tag}] STEP3 autocomplete "${q}" suggests ${want}`, hasOpt, opts.map(t => t.replace(/\s+/g, ' ').slice(0, 40)).slice(0, 4))
    await box(page).press('Enter'); await page.waitForTimeout(1200); await waitList(page)
    const n = await resultCount(page)
    const txt = await page.locator('main').innerText()
    ok(`[${tag}] STEP3 Enter search "${q}" → list shows ${want} (count ${n})`, txt.includes(want) && n > 0 && n < total, { n })
    if (q === '64197' && !hasOpt) note('hyphenless CAS Enter-search', 'server-side list search is ilike; suggestion is client-side')
  }
  // 키보드 이동 / Esc / mouse / 해제
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page); await page.mouse.move(2, 2)
  await box(page).fill('acet'); await page.waitForTimeout(600)
  await box(page).press('ArrowDown'); await box(page).press('ArrowDown')
  const active = await page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant'))
  ok(`[${tag}] suggestion keyboard: ArrowDown moves the active option (aria-activedescendant)`, !!active, active)
  await box(page).press('Escape')
  ok(`[${tag}] Escape closes the suggestion list`, (await SUGGEST(page).count()) === 0)
  await box(page).fill(''); await box(page).fill('acet'); await SUGGEST(page).getByRole('option').first().waitFor({ timeout: 6000 })
  await SUGGEST(page).getByRole('option').first().click()
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
  ok(`[${tag}] suggestion mouse click opens that reagent's detail`, /\/reagents\/[0-9a-f-]{36}/.test(page.url()), page.url().replace(BASE, ''))
  await page.goBack(); await waitList(page)
  // 검색 해제
  await page.goto(BASE + '/reagents/list?q=acet', { waitUntil: 'domcontentloaded' }); await waitList(page)
  const nq = await resultCount(page)
  await box(page).fill(''); await box(page).press('Enter'); await page.waitForTimeout(1200); await waitList(page)
  ok(`[${tag}] clearing the search restores the full list (${nq} → ${await resultCount(page)})`, (await resultCount(page)) === total && !new URL(page.url()).searchParams.has('q'))
  if (!mobile) {
    // A–Z 가 검색 결과에 맞춰 바뀌는지
    await page.goto(BASE + '/reagents/list?q=Thymol', { waitUntil: 'domcontentloaded' }); await waitList(page)
    const en = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^[A-Z]$/.test(b.textContent.trim()) && !b.disabled).map(b => b.textContent.trim()).join(''))
    ok(`[${tag}] A–Z enabled letters follow the search result ("Thymol" matches Bromothymol blue + Thymol blue + Thymolphthalein → B and T only)`, en === 'BT', en)
  }

  // ── STEP5 일반 필터 조합 ──
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  const roomBtn = page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: 'QA-5호관 101', exact: true })
  await roomBtn.click(); await page.waitForTimeout(1500); await waitList(page)
  const nRoom = await resultCount(page)
  ok(`[${tag}] STEP5 room filter (QA-5호관 101): fewer results (${nRoom}), URL room=`, nRoom > 0 && nRoom < total && new URL(page.url()).searchParams.get('room') === 'QA-5호관 101', nRoom)
  await page.getByRole('button', { name: '시약장 A', exact: true }).click(); await page.waitForTimeout(1500); await waitList(page)
  const nLoc = await resultCount(page)
  ok(`[${tag}] location (시약장 A) narrows further; URL loc=`, nLoc > 0 && nLoc <= nRoom && !!new URL(page.url()).searchParams.get('loc'), nLoc)
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.waitForTimeout(800)
  const nSp = await resultCount(page)
  ok(`[${tag}] special filter on top: Benzene only; URL special=1`, nSp === 1 && (await page.locator('main').innerText()).includes('Benzene') && new URL(page.url()).searchParams.get('special') === '1', nSp)
  await page.reload({ waitUntil: 'domcontentloaded' }); await waitList(page)
  ok(`[${tag}] reload keeps URL-based filters (room/loc/special) → same count`, (await resultCount(page)) === nSp && new URL(page.url()).searchParams.get('room') === 'QA-5호관 101', await resultCount(page))
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await box(page).fill('없는시약QQQ'); await box(page).press('Enter'); await page.waitForTimeout(1200); await waitList(page)
  const emptyTxt = await page.locator('main').innerText()
  ok(`[${tag}] empty state message for no match`, emptyTxt.includes('조건에 맞는 시약이 없습니다'), emptyTxt.slice(-80))
  ok(`[${tag}] no horizontal overflow after filters`, (await overflowX(page)) <= 0)

  ok(`[${tag}] console clean: no page errors; console errors=${rec.console.filter(c => c.t === 'error').length}`, rec.errors.length === 0, { errors: rec.errors, console: rec.console.slice(0, 5) })
  ok(`[${tag}] no production/Firebase request attempted`, rec.prod.length === 0, rec.prod)
  const bad = rec.net.filter(r => r.s >= 400)
  ok(`[${tag}] no unexpected 4xx/5xx from staging Supabase`, bad.length === 0, bad.slice(0, 5))
  await ctx.close()
}
await browser.close()
summary()
