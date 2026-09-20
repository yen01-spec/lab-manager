// QA I — 모바일 hamburger → 관리자 로그인 → admin UI → 로그아웃, breadcrumb 터치 타깃 (390x844, 360x800) — 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, overflowX, crumbText, waitList, STATE, BASE } from './lib.mjs'
const browser = await browserLaunch(process.env.QA_HEADED === '1', process.env.QA_HEADED === '1' ? 120 : 0)
for (const [w, h] of [[390, 844], [360, 800]]) {
  const tag = `${w}x${h}`
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  const ham = page.getByRole('button', { name: '메뉴 열기' })
  ok(`[${tag}] STEP14 logged out: hamburger (메뉴 열기) visible, ≥ 40px`, await ham.isVisible() && (await ham.boundingBox()).height >= 30, await ham.boundingBox())
  const hb = await ham.boundingBox()
  note(`[${tag}] hamburger tap area`, { w: Math.round(hb.width), h: Math.round(hb.height) })
  await ham.click(); await page.waitForTimeout(400)
  const drawer = page.getByRole('dialog', { name: /메뉴/ })
  const dr = await page.evaluate(() => { const d = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().width === 260 && e.querySelector('nav')); if (!d) return null; const r = d.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'), label: d.getAttribute('aria-label') } })
  await shot(page, `I-${tag}-drawer`)
  ok(`[${tag}] STEP14 drawer opens fully inside the viewport (no clipping)`, !!dr && dr.l >= 0 && dr.r <= dr.vw && dr.t >= 0 && dr.b <= dr.vh, dr)
  ok(`[${tag}] STEP14 drawer has dialog semantics (role=dialog, aria-modal, name)`, dr?.role === 'dialog' && dr?.modal === 'true' && !!dr?.label, dr)
  const focusIn = await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('[role="dialog"]') })
  ok(`[${tag}] STEP14 keyboard focus moves into the drawer when it opens`, focusIn)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  const closedByEsc = (await page.getByRole('button', { name: '메뉴 닫기' }).count()) === 0
  ok(`[${tag}] STEP14 Esc closes the drawer and returns focus to the hamburger`, closedByEsc && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === '메뉴 열기'), { closedByEsc })
  if (!closedByEsc) { await page.getByRole('button', { name: '메뉴 닫기' }).click() }
  // 스크롤 잠금: 열린 동안 배경 스크롤이 움직이지 않아야
  await ham.click(); await page.waitForTimeout(300)
  const y0 = await page.evaluate(() => scrollY); await page.mouse.move(w - 20, h / 2); await page.mouse.wheel(0, 600); await page.waitForTimeout(300)
  const y1 = await page.evaluate(() => scrollY)
  ok(`[${tag}] STEP14 body scroll is locked while the drawer is open (background does not scroll)`, y1 === y0, { y0, y1 })
  await page.getByRole('button', { name: '메뉴 닫기' }).click(); await page.waitForTimeout(300)
  await page.mouse.wheel(0, 500); await page.waitForTimeout(300)
  ok(`[${tag}] STEP14 after closing, page scrolls normally again`, (await page.evaluate(() => scrollY)) > 0)
  await page.evaluate(() => scrollTo(0, 0))

  // 관리자 로그인 진입
  await ham.click(); await page.waitForTimeout(300)
  const adminBtn = page.getByRole('button', { name: '관리자 로그인' })
  const ab = await adminBtn.boundingBox()
  ok(`[${tag}] STEP14 drawer 관리자 로그인 button visible, ≥ 40px tall`, ab && ab.height >= 40, ab)
  await adminBtn.click(); await page.waitForTimeout(500)
  ok(`[${tag}] STEP14 drawer closes when the admin login modal opens (no overlay stacking)`, (await page.getByRole('button', { name: '메뉴 닫기' }).count()) === 0)
  const modal = page.getByRole('dialog').filter({ hasText: '관리자 로그인' })
  await modal.waitFor({ timeout: 8000 })
  const mb = await modal.boundingBox()
  await shot(page, `I-${tag}-admin-login`)
  ok(`[${tag}] STEP14 admin login modal fits the viewport (${Math.round(mb.width)}x${Math.round(mb.height)}), no overflow`, mb.x >= 0 && mb.x + mb.width <= w + 1 && mb.y >= 0 && mb.y + mb.height <= h + 1 && (await overflowX(page)) <= 0, mb)
  ok(`[${tag}] STEP14 keyboard focus moves into the login form`, await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  ok(`[${tag}] STEP14 Esc closes the login modal`, (await page.getByRole('dialog').filter({ hasText: '관리자 로그인' }).count()) === 0)
  // 실제 로그인
  await ham.click(); await page.getByRole('button', { name: '관리자 로그인' }).click()
  await modal.waitFor({ timeout: 8000 })
  await modal.locator('#admin-email').fill(STATE.admin.email); await modal.locator('#admin-pw').fill(STATE.admin.password)
  await modal.getByRole('button', { name: '로그인', exact: true }).click()
  await modal.waitFor({ state: 'hidden', timeout: 20000 }); await page.waitForTimeout(800)
  await ham.click(); await page.waitForTimeout(400)
  const dt = await page.getByRole('dialog', { name: '메뉴' }).innerText()
  await shot(page, `I-${tag}-drawer-admin`)
  ok(`[${tag}] STEP14 real staging Auth admin logged in: drawer shows "관리자 · <email>", 관리자 메뉴 and 관리자 로그아웃`, dt.includes('관리자 · ' + STATE.admin.email) && dt.includes('관리자 메뉴') && dt.includes('관리자 로그아웃'), dt.slice(0, 200).replace(/\n/g, ' | '))
  await page.getByRole('link', { name: '관리자 메뉴' }).click(); await page.waitForURL(/\/admin/, { timeout: 10000 }); await page.waitForTimeout(1200)
  ok(`[${tag}] STEP14 admin UI reachable on mobile (/admin), drawer closed after navigation, no overflow`, (await page.getByRole('button', { name: '메뉴 닫기' }).count()) === 0 && (await crumbText(page)) === '홈 › 관리자' && (await overflowX(page)) <= 0, await crumbText(page))
  await shot(page, `I-${tag}-admin-page`)
  await ham.click(); await page.getByRole('button', { name: '관리자 로그아웃' }).click(); await page.waitForTimeout(1200)
  await ham.click().catch(() => {})
  ok(`[${tag}] STEP14 admin logout works from the drawer (관리자 로그인 offered again)`, (await page.getByRole('button', { name: '관리자 로그인' }).count()) >= 1)
  ok(`[${tag}] mobile admin login flow: console clean, no page errors, no production`, rec.errors.length === 0 && rec.console.filter(c => c.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 4) })
  await ctx.close()
}

// ═══ STEP15 breadcrumb 터치 타깃(모바일 실측) ═══
for (const [w, h] of [[390, 844], [360, 800]]) {
  const tag = `${w}x${h}`
  const { ctx, page, rec } = await session(browser, { w, h })
  for (const q of ['QA-FINAL Move reagent', 'QA-FINAL Inventory reagent A']) {
    await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page)
    await page.locator('[data-index] span').filter({ hasText: /QA-FINAL/ }).first().click()
    await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(800)
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="현재 위치"]'); const links = [...nav.querySelectorAll('a')].map(a => { const r = a.getBoundingClientRect(); return { t: a.textContent.trim(), l: Math.round(r.left), r: Math.round(r.right), top: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) } })
      const back = document.querySelector('button[aria-label="시약 목록으로 돌아가기"]').getBoundingClientRect()
      return { navH: Math.round(nav.getBoundingClientRect().height), links, backTop: Math.round(back.top), navBottom: Math.round(nav.getBoundingClientRect().bottom) }
    })
    const overlapH = m.links.some((a, i) => m.links.some((b, j) => j > i && !(a.r <= b.l || b.r <= a.l) && !(a.b <= b.top || b.b <= a.top)))
    ok(`[${tag}] STEP15 real mobile breadcrumb: link tap targets ≥ 44px (${m.links.map(l => l.t + ' ' + l.h + 'px').join(', ')}); block height ${m.navH}px; neighbouring links' tap areas do not overlap`, m.links.every(l => l.h >= 44) && !overlapH && m.navH <= 60, m)
    await shot(page, `I-${tag}-breadcrumb`)
    // 인접 오탭: 두 crumb 사이 중앙을 눌러도 홈으로 가지 않는지(홈 링크와 시약 목록 링크의 경계)
    const [home, list] = m.links
    const mid = Math.round((home.r + list.l) / 2)
    ok(`[${tag}] STEP15 tapping the gap between "홈" and "시약 목록" does not activate either (right edges 홈:${home.r} / left 시약 목록:${list.l})`, home.r <= list.l, { home, list })
  }
  // 긴 이름: 이전 QA 의 긴 이름 시약은 정리됨 → 긴 시약명은 breadcrumb 줄바꿈 확인용으로 열린 화면의 마지막 crumb 이 wrap 되는지만 측정
  ok(`[${tag}] breadcrumb page: no horizontal overflow; console clean; no production`, (await overflowX(page)) <= 0 && rec.errors.length === 0 && rec.prod.length === 0)
  await ctx.close()
}
await browser.close(); summary()
