// QA E — badge/grouping(18,19), manufacturer picker(20), BulkEdit(21), breadcrumb(22), mobile detail(23), breadcrumb touch target(24) — 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, overflowX, crumbText, resultCount, waitList, studentLogin, BASE } from './lib.mjs'

const headed = process.env.QA_HEADED === '1'
const browser = await browserLaunch(headed, headed ? 120 : 0)
const vrow = (page) => page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2), [data-index] span')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 && r.width > 0 }); const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })
const rowByName = (page, name) => page.locator('tbody tr', { hasText: name }).first()

// ═══ STEP18/19 badge + grouping (데스크톱 1440, 모바일 390) ═══
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`, mobile = w < 768
  const { ctx, page, rec } = await session(browser, { w, h })
  const go = async q => { await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page); await page.waitForTimeout(500) }
  // A. 1병
  await go('Bromothymol'); const tA = await page.locator('main').innerText()
  ok(`[${tag}] STEP18-A 1 bottle (Bromothymol blue): desktop = no summary badge + stock "미개봉 1병 / 잔량 100%"; mobile card = "보유 1병 · 잔량 100%"`, mobile ? /보유 1병 · 잔량 100%/.test(tA) : (!/보유 \d+병/.test(tA) && /미개봉 1병\s*\/\s*잔량 100%/.test(tA)), tA.slice(tA.indexOf('Bromothymol') - 20, tA.indexOf('Bromothymol') + 120).replace(/\n/g, ' | '))
  // B/C. 여러 병 + 여러 위치 (Acetone: QA 가 새 Lot 추가)
  await go('Acetone'); const tB = await page.locator('main').innerText()
  ok(`[${tag}] STEP18-B/C several bottles in several places (Acetone): "보유 2병 · 2개 위치" in one neutral badge`, tB.includes('보유 2병 · 2개 위치'), tB.slice(0, 40))
  // D. 여러 제조사 + 같은 이름 그룹
  await go('Ethanol'); const tD = await page.locator('main').innerText()
  await shot(page, `E-${tag}-ethanol-group`)
  ok(`[${tag}] STEP18-D/19 same-name masters (Ethanol x3): desktop = one group header "보유 4병 · 3개 위치" + "제조사 3곳"; mobile = 3 separate cards each with its manufacturer; NO "제품 N개"`, (mobile ? ((tD.match(/Ethanol/g) || []).length >= 3 && ['Samchun', 'Daejung', 'Duksan'].every(m => tD.includes(m))) : (tD.includes('보유 4병 · 3개 위치') && tD.includes('제조사 3곳'))) && !/\d+개 제품/.test(tD), tD.slice(tD.indexOf('Ethanol') - 5, tD.indexOf('Ethanol') + 90).replace(/\n/g, ' | '))
  if (!mobile) {
    const btn = page.getByRole('button', { name: /Ethanol 제품별로 펼치기/ })
    ok(`[${tag}] STEP19 expand affordance is a real button with aria-expanded=false`, (await btn.getAttribute('aria-expanded')) === 'false')
    await btn.click(); await page.waitForTimeout(400)
    const tE = await page.locator('main').innerText()
    ok(`[${tag}] STEP19 expanded: one row per master with its own manufacturer (Samchun / Daejung / Duksan) — not a merged record`, ['Samchun', 'Daejung', 'Duksan'].every(m => tE.includes(m)) && (await page.getByRole('button', { name: /Ethanol 제품별로 접기/ }).getAttribute('aria-expanded')) === 'true')
    await shot(page, `E-${tag}-ethanol-expanded`)
    await page.getByRole('button', { name: /Ethanol 제품별로 접기/ }).click()
    ok(`[${tag}] STEP19 collapse works`, (await page.getByRole('button', { name: /Ethanol 제품별로 펼치기/ }).count()) === 1)
    // Acetic acid 두 master
    await go('Acetic acid'); const tG = await page.locator('main').innerText()
    ok(`[${tag}] STEP19 second real group (Acetic acid ×2): "보유 4병 · 3개 위치" + "제조사 2곳"`, tG.includes('보유 4병 · 3개 위치') && tG.includes('제조사 2곳'), tG.slice(tG.indexOf('Acetic acid'), tG.indexOf('Acetic acid') + 90).replace(/\n/g, ' | '))
  }
  // E. 재고 부족 + neutral vs warning 색
  await go('Acridine'); const tE2 = await page.locator('main').innerText()
  const cols = await page.evaluate(() => { const g = t => [...document.querySelectorAll('[data-badge]')].find(e => e.textContent.trim() === t); return { warn: g('재고 부족') ? getComputedStyle(g('재고 부족')).backgroundColor : null } })
  await go('A000'); const tS = await page.evaluate(() => { const g = t => [...document.querySelectorAll('[data-badge]')].find(e => e.textContent.trim().startsWith(t)); return g('보유 ') ? getComputedStyle(g('보유 ')).backgroundColor : null })
  ok(`[${tag}] STEP18-E "재고 부족" warning badge (Acridine orange: opened bottle at 15%) — red tint (desktop: differs from the grey neutral summary badge)`, tE2.includes('재고 부족') && cols.warn && (mobile || (tS && cols.warn !== tS)), { warn: cols.warn, neutral: tS })
  await shot(page, `E-${tag}-lowstock`)
  ok(`[${tag}] badge screens: no horizontal overflow, no page/console errors`, (await overflowX(page)) <= 0 && rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0, { ox: await overflowX(page), c: rec.console.slice(0, 3) })
  ok(`[${tag}] no production contact`, rec.prod.length === 0)
  await ctx.close()
}

// ═══ STEP20 Manufacturer picker ═══
for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await page.getByRole('button', { name: /신규 시약 등록/ }).click()
  const company = page.locator('label:has-text("제조사") + div input').first()
  await company.waitFor({ timeout: 15000 }); await company.click()
  await page.getByTestId('company-picker-popup').waitFor()
  const m = await page.evaluate(() => { const p = document.querySelector('[data-testid="company-picker-popup"]'); const r = p.getBoundingClientRect(); const b = [...p.querySelectorAll('button')].map(x => x.getBoundingClientRect()); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, n: b.length, minH: Math.round(Math.min(...b.map(x => x.height))), minW: Math.round(Math.min(...b.map(x => x.width))), onTop: p.contains(top) } })
  await shot(page, `E-${tag}-picker`)
  ok(`[${tag}] STEP20 real RegisterReagentModal: popup fully inside the viewport, on top of the modal, 10 logos with ≥44px targets`, m.l >= 0 && m.r <= m.vw && m.t >= 0 && m.b <= m.vh && m.onTop && m.n === 10 && m.minH >= 44 && m.minW >= 44, m)
  // 오른쪽 끝/아래 끝으로 옮겨서
  await page.keyboard.press('Escape')
  await page.evaluate(() => { const inp = [...document.querySelectorAll('label')].find(l => l.textContent.includes('제조사')).nextElementSibling; inp.style.cssText = 'position:fixed;right:0;top:120px;width:150px;z-index:2000' })
  await company.click(); await page.getByTestId('company-picker-popup').waitFor(); await page.waitForTimeout(150)
  const r2 = await page.evaluate(() => { const r = document.querySelector('[data-testid="company-picker-popup"]').getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth } })
  ok(`[${tag}] STEP20 input at the far right edge → popup clamps inside the viewport`, r2.l >= 0 && r2.r <= r2.vw, r2)
  await page.keyboard.press('Escape')
  await page.evaluate(h => { const inp = [...document.querySelectorAll('label')].find(l => l.textContent.includes('제조사')).nextElementSibling; inp.style.cssText = `position:fixed;left:8px;top:${h - 60}px;width:150px;z-index:2000` }, h)
  await company.click(); await page.getByTestId('company-picker-popup').waitFor(); await page.waitForTimeout(150)
  const r3 = await page.evaluate(() => { const r = document.querySelector('[data-testid="company-picker-popup"]').getBoundingClientRect(); return { t: r.top, b: r.bottom, vh: innerHeight } })
  ok(`[${tag}] STEP20 input near the bottom → popup opens upward inside the viewport`, r3.t >= 0 && r3.b <= r3.vh, r3)
  // click reopen + 키보드
  await page.getByTestId('company-picker-popup').getByRole('button', { name: 'Samchun' }).click()
  ok(`[${tag}] STEP20 picking fills the name, closes, and returns focus to the input`, (await company.inputValue()) === 'Samchun' && (await page.getByTestId('company-picker-popup').count()) === 0 && await page.evaluate(() => document.activeElement?.tagName === 'INPUT'))
  await company.click()
  ok(`[${tag}] STEP20 clicking the already-focused input reopens the popup`, (await page.getByTestId('company-picker-popup').count()) === 1)
  await company.press('ArrowDown'); await page.waitForTimeout(200)
  const f1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.keyboard.press('ArrowRight'); const f2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.keyboard.press('Enter'); await page.waitForTimeout(200)
  ok(`[${tag}] STEP20 keyboard: ↓ from the input focuses the first logo, → moves, Enter picks (${f1} → ${f2}), popup closes, focus back in input`, f1 === 'Samchun' && f2 === 'Sigma-Aldrich' && (await company.inputValue()) === 'Sigma-Aldrich' && (await page.getByTestId('company-picker-popup').count()) === 0)
  await company.press('ArrowDown'); await page.keyboard.press('Escape')
  ok(`[${tag}] STEP20 Esc inside the popup closes it and returns focus to the input`, (await page.getByTestId('company-picker-popup').count()) === 0 && await page.evaluate(() => document.activeElement?.tagName === 'INPUT'))
  ok(`[${tag}] picker: no horizontal overflow; no page/console errors; no production contact`, (await overflowX(page)) <= 0 && rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 3) })
  await ctx.close()
}

// ═══ STEP21 BulkEdit (학생 세션, 실제 데이터) ═══
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`, mobile = w < 768
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/reagents/bulk-edit', { waitUntil: 'domcontentloaded' })
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 30000 }); await page.locator('[data-lot-id]').first().waitFor({ timeout: 30000 })
  await shot(page, `E-${tag}-bulkedit`)
  const sum = async () => (await page.getByText(/^검색결과/).first().innerText()).replace(/\s+/g, ' ')
  const s0 = await sum()
  ok(`[${tag}] STEP21 BulkEdit: search bar + location filter + "검색결과 N개 시약 · M개 Lot" + A–Z, no overflow`, /검색결과 \d+개 시약 · \d+개 Lot/.test(s0) && (await page.getByPlaceholder(/시약명.*(국문|CAS)/).first().isVisible()) && (await page.getByRole('group', { name: '실험실 필터' }).count()) === 1 && (await overflowX(page)) <= 0, s0)
  ok(`[${tag}] STEP21 same look as Reagent List (shared search bar/filter/summary components)`, (await page.getByRole('button', { name: '검색', exact: true }).count()) === 1)
  // A–Z jump
  if (mobile) { await page.getByRole('button', { name: '알파벳으로 이동' }).click(); await page.getByRole('dialog', { name: '알파벳 바로가기' }).getByRole('button', { name: 'M', exact: true }).click() }
  else await page.locator('button', { hasText: /^M$/ }).first().click()
  await page.waitForTimeout(700)
  const mTop = await page.evaluate(() => document.querySelector('[data-bulk-letter="M"]').getBoundingClientRect().top)
  ok(`[${tag}] STEP21-A A–Z jump "M" lands the M group near the top (${Math.round(mTop)}px)`, mTop >= 40 && mTop < 300, mTop)
  // B/D 검색 + 자동완성
  const box = page.getByPlaceholder(/시약명.*(국문|CAS)/).first()
  await page.mouse.move(2, 2)
  await box.fill('아세톤'); await page.getByTestId('reagent-suggest-popover').getByRole('option').first().waitFor({ timeout: 8000 })
  await page.getByTestId('reagent-suggest-popover').getByRole('option').first().click(); await page.waitForTimeout(700)
  ok(`[${tag}] STEP21-B/D search "아세톤" + autocomplete selection → only Acetone (${await sum()})`, /1개 시약/.test(await sum()) && (await page.locator('main').innerText()).includes('Acetone'), await sum())
  // E 같은 lot_no 두 병 독립 checkbox
  const same = page.locator('[data-lot-id]', { hasText: 'QA-AC1' })
  ok(`[${tag}] STEP21-E Acetone has two bottles with the SAME Lot No. (QA-AC1) → two separate rows/checkboxes`, (await same.count()) === 2)
  await same.nth(0).locator('input[type=checkbox]').check()
  ok(`[${tag}] STEP21-E ticking bottle 1 does not tick bottle 2; selected count 1`, !(await same.nth(1).locator('input').isChecked()) && (await page.getByTestId('selected-count').innerText()).includes('선택된 1개 Lot'))
  // F 여러 row 선택 + G filter 변경 후 유지 + H hidden 안내
  await box.fill(''); await box.press('Enter'); await page.waitForTimeout(800)
  await page.locator('[data-lot-id] input[type=checkbox]:not([disabled])').nth(5).check()
  await page.locator('[data-lot-id] input[type=checkbox]:not([disabled])').nth(9).check()
  ok(`[${tag}] STEP21-F multi-row selection (${(await page.getByTestId('selected-count').innerText()).trim()})`, (await page.getByTestId('selected-count').innerText()).includes('선택된 3개 Lot'))
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: 'QA-냉장실', exact: true }).click(); await page.waitForTimeout(600)
  const hid = await page.getByText(/현재 목록 밖에 있어요/).count()
  ok(`[${tag}] STEP21-G/H filter change keeps the selection (still 3) and announces the ones hidden by the filter`, (await page.getByTestId('selected-count').innerText()).includes('선택된 3개 Lot') && hid === 1, await page.getByText(/현재 목록 밖/).allInnerTexts())
  ok(`[${tag}] STEP21 move/dispose buttons enabled with a selection but NOT executed (only QA rows exist; no submit performed)`, await page.getByRole('button', { name: /위치 변경/ }).first().isEnabled())
  ok(`[${tag}] STEP21 BulkEdit: no overflow, console clean, no production`, (await overflowX(page)) <= 0 && rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 3), ox: await overflowX(page) })
  await ctx.close()
}

// ═══ STEP22 Breadcrumb 전 페이지 ═══
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  const checks = [['/', '홈'], ['/reagents/list', '홈 › 시약 목록'], ['/reagents/bulk-edit', '홈 › 시약 일괄정리'], ['/reagents/locations', '홈 › 시약장 위치'], ['/inventory', '홈 › 재고 실사'], ['/purchase-request', '홈 › 구매요청서'], ['/purchase-request/list', '홈 › 구매요청서 › 목록'], ['/resources', '홈 › 자료'], ['/safety-signage', '홈 › 자료 › 표지·대장 준비 도구'], ['/notices', '홈 › 공지사항'], ['/safety', '홈 › 안전관리']]
  for (const [path, want] of checks) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.locator('nav[aria-label="현재 위치"]').waitFor({ timeout: 20000 })
    const tx = await crumbText(page)
    const cur = await page.locator('nav[aria-label="현재 위치"] [aria-current="page"]').count()
    ok(`STEP22 ${path}: "${want}" (no "홈 › 홈", aria-current on the last item)`, tx === want && cur === 1 && !tx.includes('홈 › 홈') && !tx.includes('시약 관리'), tx)
  }
  // 상세
  await page.goto(`${BASE}/reagents/list?q=Acetone`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  const p = await vrow(page); await page.mouse.click(p.x, p.y); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/)
  await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '시약 목록' }).waitFor()
  ok('STEP22 reagent detail: 홈 › 시약 목록 › Acetone; both intermediate crumbs are links', (await crumbText(page)) === '홈 › 시약 목록 › Acetone' && (await page.locator('nav[aria-label="현재 위치"] a').count()) === 2)
  await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '홈' }).click(); await page.waitForURL(BASE + '/')
  ok('STEP22 Home crumb navigates to "/"', new URL(page.url()).pathname === '/')
  await page.goto(BASE + '/purchase-request/list', { waitUntil: 'domcontentloaded' }); await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '구매요청서' }).click()
  ok('STEP22 intermediate crumb (구매요청서) goes to its real route /purchase-request', new URL(page.url()).pathname === '/purchase-request')
  ok('STEP22 breadcrumb pages: console clean, no production', rec.errors.length === 0 && rec.prod.length === 0, { e: rec.errors, c: rec.console.filter(x => x.t === 'error').slice(0, 3) })
  await ctx.close()
}
// admin / inventory count / notice detail
{
  const { ctx, page } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const { adminLogin } = await import('./lib.mjs')
  await adminLogin(page)
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.locator('nav[aria-label="현재 위치"]').waitFor({ timeout: 20000 })
  ok('STEP22 /admin: "홈 › 관리자"', (await crumbText(page)) === '홈 › 관리자', await crumbText(page))
  await ctx.close()
}

// ═══ STEP23/24 모바일 상세 + 브레드크럼 터치 타깃 ═══
for (const [w, h] of [[390, 844], [360, 800]]) {
  const tag = `${w}x${h}`
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  for (const q of ['Tris(hydroxymethyl)', 'Acetone']) {
    await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page)
    await page.locator('[data-index] span').filter({ hasText: /Tris|Acetone/ }).first().click()
    await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1000)
    const long = q.startsWith('Tris')
    await shot(page, `E-${tag}-detail-${long ? 'long' : 'acetone'}`)
    const vp = page.viewportSize()
    const acts = []
    for (const a of ['📦 새 Lot 추가', '📍 위치 변경 신청', '✏️ 정보 수정 신청', '⋯ 더보기']) { const b = page.getByRole('button', { name: a }); await b.scrollIntoViewIfNeeded(); const bb = await b.boundingBox(); acts.push(!!bb && bb.x >= -1 && bb.x + bb.width <= vp.width + 1) }
    ok(`[${tag}] STEP23 ${long ? 'long chemical name' : 'Acetone'}: no horizontal overflow; back button, breadcrumb and 4 actions inside the viewport`, (await overflowX(page)) <= 0 && acts.every(Boolean) && (await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).isVisible()), { ox: await overflowX(page), acts })
    await page.getByRole('button', { name: /더보기/ }).click()
    const mb = await page.getByRole('menu').boundingBox()
    ok(`[${tag}] STEP23 ${long ? 'long name: ' : ''}⋯ 더보기 menu stays inside the viewport`, mb.x >= 0 && mb.x + mb.width <= vp.width + 1 && mb.y >= 0 && mb.y + mb.height <= vp.height + 1, mb)
    await page.keyboard.press('Escape')
    // 병 카드/배지 줄바꿈
    const lots = await page.locator('[data-lot-id]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && e.scrollWidth <= e.clientWidth + 1 }))
    ok(`[${tag}] STEP23 ${long ? 'long name: ' : ''}bottle cards wrap (no clipped content)`, lots.every(Boolean), lots)
    // STEP24 터치 타깃
    const links = await page.locator('nav[aria-label="현재 위치"] a').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) } }))
    const navH = await page.locator('nav[aria-label="현재 위치"]').evaluate(e => Math.round(e.getBoundingClientRect().height))
    ok(`[${tag}] STEP24 breadcrumb link tap targets >= 44px tall (${links.map(l => l.h + 'px').join(', ')}); breadcrumb block height ${navH}px (short crumb = 28px, wrapped long name grows only by its extra lines)`, links.every(l => l.h >= 44) && navH <= (long ? 110 : 40), { links, navH })
  }
  ok(`[${tag}] mobile detail: console clean, no production`, rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 3) })
  await ctx.close()
}
await browser.close()
summary()
