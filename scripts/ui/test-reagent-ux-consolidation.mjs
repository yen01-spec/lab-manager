// 시약 UX 통합 — 상세 "← 시약 목록"/breadcrumb, 새 Lot 추가/정보 수정 action 구조, 기본정보 vs Lot 분리, 목록 badge 의미, 접근성, 7개 viewport. 가짜 Supabase.
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'

const rs = buildReagents(80)
const lot = (id, loc, sealed, stock, no) => ({ id, status: 'active', sealed_count: sealed, current_stock: stock, location_id: loc, lot_no: no, expiry_date: null, cat_no: 'CAT-1', received_date: '2026-01-02', opened_date: null, pending_confirm: false })
// 2병(미개봉 1 + 개봉 잔량 15%) · 2개 위치 → "보유 2병 · 2개 위치" + "재고 부족"
rs[6] = { ...rs[6], name: 'Acridine orange', name_ko: '아크리딘 오렌지', sort_letter: 'A', company: 'Sigma-Aldrich', purity: '95%', volume: 25, unit: 'g', category: '고체',
  reagent_lots: [lot('lt-6a', 'loc-a1', 1, 100, 'SAME-LOT'), lot('lt-6b', 'loc-c1', 0, 15, 'SAME-LOT')] }
// 같은 이름 두 제품(제조사 다름) → 그룹 헤더: "보유 3병" + "제조사 2곳"
rs[30] = { ...rs[30], name: 'Acridine', name_ko: '아크리딘', sort_letter: 'A', company: 'TCI', reagent_lots: [lot('lt-30a', 'loc-a1', 1, 100, 'T1')] }
rs[31] = { ...rs[31], name: 'Acridine', name_ko: '아크리딘', sort_letter: 'A', company: 'Daejung', reagent_lots: [lot('lt-31a', 'loc-a1', 1, 100, 'D1'), lot('lt-31b', 'loc-a2', 1, 100, 'D2')] }

const VIEWPORTS = [[1366, 768], [1440, 900], [1920, 1080], [320, 568], [360, 800], [390, 844], [430, 932]]
const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function open(w, h, { admin = false, url = '/reagents/list' } = {}) {
  const mobile = w < 768
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  else await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  const stats = await installMock(ctx, rs)
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => reply(r, { status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }))
  const rpcs = [], patches = []
  await ctx.route(/\/rest\/v1\/rpc\/reagent_change_request_submit/, r => { rpcs.push(JSON.parse(r.request().postData() || '{}')); reply(r, { id: 'x' }) })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.accept())
  page.on('request', q => { if (q.method() === 'PATCH' && /\/rest\/v1\/reagents/.test(q.url())) patches.push(JSON.parse(q.postData() || '{}')) })
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
  return { ctx, page, stats, errors, rpcs, patches, mobile }
}
const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const crumbs = page => page.locator('nav[aria-label="현재 위치"]')
const crumbText = async page => (await crumbs(page).innerText()).replace(/^home\s*/, '').replace(/\s+/g, ' ').trim()
const inView = async (loc, page) => { const b = await loc.boundingBox(); const vp = page.viewportSize(); return !!b && b.x >= -1 && b.x + b.width <= vp.width + 1 && b.y >= -1 && b.y + b.height <= vp.height + 1 }

// ════ H. Breadcrumb (목록 / 상세 / 기타 페이지) ════
{
  const { ctx, page, errors } = await open(1440, 900)
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 20000 })
  const nav = crumbs(page)
  const t = await crumbText(page)
  ok('H1. list breadcrumb = "홈 › 시약 목록" — no duplicate "홈 › 홈", no fake "시약 관리" level', t === '홈 › 시약 목록', t)
  ok('H2. 홈 crumb is a real link to "/", current page is not a link and has aria-current="page"', (await nav.getByRole('link', { name: '홈' }).getAttribute('href')) === '/' && (await nav.locator('[aria-current="page"]').innerText()) === '시약 목록' && (await nav.getByRole('link', { name: '시약 목록' }).count()) === 0)
  ok('H3. nav landmark named 현재 위치; separators hidden from assistive tech', (await page.getByRole('navigation', { name: '현재 위치' }).count()) === 1 && (await nav.locator('[aria-hidden="true"]').count()) >= 1)
  await nav.getByRole('link', { name: '홈' }).click()
  await page.waitForURL(BASE + '/'); ok('H4. clicking the 홈 crumb navigates home', new URL(page.url()).pathname === '/')
  await page.waitForFunction(() => !document.querySelector('nav[aria-label="현재 위치"]')?.textContent.includes('시약 목록'))
  const homeNav = await crumbText(page)
  ok('H5. Home page shows just "홈" as the current page (no link, no duplicate)', homeNav === '홈' && (await crumbs(page).getByRole('link').count()) === 0, homeNav)
  for (const [path, want] of [['/reagents/locations', '홈 › 시약장 위치'], ['/inventory', '홈 › 재고 실사'], ['/purchase-request', '홈 › 구매요청서'], ['/purchase-request/list', '홈 › 구매요청서 › 목록'], ['/resources', '홈 › 자료실'], ['/safety-signage', '홈 › 자료실 › 표지·대장 준비 도구']]) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await crumbs(page).waitFor({ timeout: 15000 })
    const tx = await crumbText(page)
    ok(`H6. ${path}: breadcrumb "${want}"`, tx === want, tx)
  }
  // 시약 일괄정리는 시약 목록에 통합됨 — /reagents/bulk-edit는 breadcrumb 없이 /reagents/list로 즉시 redirect
  await page.goto(BASE + '/reagents/bulk-edit', { waitUntil: 'domcontentloaded' })
  await page.waitForURL(u => new URL(u).pathname === '/reagents/list', { timeout: 15000 })
  ok('H6b. /reagents/bulk-edit redirects to /reagents/list (compatibility redirect, no separate page)', new URL(page.url()).pathname === '/reagents/list')
  await page.goto(BASE + '/purchase-request/list', { waitUntil: 'domcontentloaded' }); await crumbs(page).waitFor()
  await crumbs(page).getByRole('link', { name: '구매요청서' }).click()
  ok('H7. intermediate crumb (구매요청서) links to its real route', new URL(page.url()).pathname === '/purchase-request')
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}

// ════ D. 상세 ← 시약 목록 / breadcrumb (Scenario 1, 12) ════
{
  const { ctx, page, errors } = await open(1440, 900, { url: '/reagents/list?q=acet' })
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 20000 }); await page.waitForTimeout(900)
  const before = await page.getByText(/^검색결과/).first().innerText()
  await page.locator('tbody tr[title^="클릭"]').first().locator('td').nth(1).click()
  await page.waitForURL(/\/reagents\/r-/)
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor()
  const back = page.getByRole('button', { name: '시약 목록으로 돌아가기' })
  ok('D1. detail shows an always-visible "← 시약 목록" button above the title (accessible name: 시약 목록으로 돌아가기)', await back.isVisible() && (await back.innerText()).includes('← 시약 목록'))
  const bc = await crumbText(page)
  ok('D2. detail breadcrumb: 홈 › 시약 목록 › <name>; 시약 목록 is a link, name is aria-current', /^홈 › 시약 목록 › .+/.test(bc) && (await crumbs(page).getByRole('link', { name: '시약 목록' }).count()) === 1 && (await crumbs(page).locator('[aria-current="page"]').count()) === 1, bc)
  await back.click(); await page.waitForURL(/\/reagents\/list/); await page.getByText(/^검색결과/).first().waitFor(); await page.waitForTimeout(700)
  ok('D3. Scenario 1: back button returns to the same search (q=acet) with the same result count', new URL(page.url()).searchParams.get('q') === 'acet' && (await page.getByText(/^검색결과/).first().innerText()) === before, page.url())
  await page.locator('tbody tr[title^="클릭"]').first().locator('td').nth(1).click(); await page.waitForURL(/\/reagents\/r-/)
  await crumbs(page).getByRole('link', { name: '시약 목록' }).click(); await page.waitForURL(/\/reagents\/list/); await page.waitForTimeout(600)
  ok('D4. breadcrumb "시약 목록" also restores the list context (q=acet), not a fresh list', new URL(page.url()).searchParams.get('q') === 'acet', page.url())
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900, { url: '/reagents/r-0006' })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click(); await page.waitForURL(/\/reagents\/list$/, { timeout: 8000 })
  ok('D5. Scenario 12: direct detail URL (no list history) — back button falls back to /reagents/list', new URL(page.url()).pathname === '/reagents/list')
  await page.goto(BASE + '/reagents/r-0006', { waitUntil: 'domcontentloaded' }); await crumbs(page).getByRole('link', { name: '시약 목록' }).waitFor()
  await crumbs(page).getByRole('link', { name: '시약 목록' }).click(); await page.waitForURL(/\/reagents\/list$/, { timeout: 8000 })
  ok('D6. direct detail URL — breadcrumb 시약 목록 also falls back to /reagents/list', new URL(page.url()).pathname === '/reagents/list')
  await ctx.close()
}

// ════ E. 상세 action 구조 + 용어 (Scenario 8, 9) — 학생 ════
{
  const { ctx, page, rpcs, errors } = await open(1440, 900, { url: '/reagents/r-0006' })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(600)
  const body = await page.locator('main').innerText()
  ok('E1. Scenario 8: no ambiguous "재고 등록" wording; the button is "📦 새 Lot 추가"', !body.includes('재고 등록') && (await page.getByRole('button', { name: '📦 새 Lot 추가' }).count()) === 1)
  ok('E2. Scenario 9: no "수정완료" entry anywhere in the normal state; "✏️ 정보 수정 신청" is a visible top-level action', !body.includes('수정완료') && (await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).count()) === 1)
  ok('E3. top-level actions: 새 Lot 추가 · 위치 변경 신청 · 정보 수정 신청 · ⋯ 더보기 (with aria-haspopup)', (await page.getByRole('button', { name: '📍 위치 변경 신청' }).count()) === 1 && (await page.getByRole('button', { name: /더보기/ }).getAttribute('aria-haspopup')) === 'menu')
  await page.getByRole('button', { name: '📦 새 Lot 추가' }).click()
  const dlg = page.getByRole('dialog', { name: '새 Lot 추가' })
  const dt = await dlg.innerText()
  ok('E4. add-lot modal: title "새 Lot 추가" + explanation that it adds a bottle to THIS reagent (not a new reagent)', dt.includes('새 Lot 추가') && dt.includes('현재 시약에 새로 구매한 병/Lot을 추가합니다') && dt.includes('새 시약 종류를 등록하는 것이 아니에요') && (await dlg.getByRole('button', { name: 'Lot 추가하기' }).count()) === 1, dt.slice(0, 160))
  await dlg.getByRole('button', { name: '취소' }).click()

  // 더보기 메뉴: 키보드
  const more = page.getByRole('button', { name: /더보기/ })
  await more.click()
  ok('E5. ⋯더보기 opens a role=menu; focus moves to the first enabled item; holds 폐기 신청 only (student)', (await page.getByRole('menu').count()) === 1 && await page.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem') && (await page.getByRole('menuitem').count()) === 1 && (await more.getAttribute('aria-expanded')) === 'true')
  await page.keyboard.press('Escape')
  ok('E6. Esc closes the menu and returns focus to the ⋯ button', (await page.getByRole('menu').count()) === 0 && await page.evaluate(() => /더보기/.test(document.activeElement?.textContent || '')))

  // 기본정보 vs Lot 분리 (F)
  const heads = await page.locator('main').innerText()
  ok('F1. two clearly separated sections: 「시약 기본정보」(공통) and 「보유 Lot / 병」(병 단위)', heads.includes('시약 기본정보') && heads.includes('이 시약 종류의 모든 병에 공통으로 적용되는 정보예요.') && heads.includes('보유 Lot / 병') && heads.includes('병 1개마다 한 칸이에요'))
  const l0 = (await page.locator('[data-lot-id="lt-6a"]').innerText()).replace(/\s+/g, ' ')
  const l1 = (await page.locator('[data-lot-id="lt-6b"]').innerText()).replace(/\s+/g, ' ')
  ok('F2. each bottle card: 병 i/N, Lot No., 개봉/미개봉, 잔량, 위치, Cat No., 입고일, 유효기간, 제조사(기본정보) + per-bottle actions', l0.includes('병 1/2') && l1.includes('병 2/2') && l0.includes('SAME-LOT') && l1.includes('SAME-LOT') && l0.includes('미개봉') && l1.includes('개봉') && l1.includes('15%') && l0.includes('제조사') && l0.includes('Cat No.') && l0.includes('입고일') && l0.includes('이 병 위치 변경 신청') && l0.includes('이 병 폐기 신청'), l1.slice(0, 200))
  ok('F3. same lot_no on both bottles, distinct bottle ids in tooltips (병 ID)', (await page.locator('[data-lot-id="lt-6a"] [title^="병 ID:"]').first().getAttribute('title')) === '병 ID: lt-6a' && (await page.locator('[data-lot-id="lt-6b"] [title^="병 ID:"]').first().getAttribute('title')) === '병 ID: lt-6b')
  await page.locator('[data-lot-id="lt-6b"]').getByRole('button', { name: /이 병 위치 변경 신청/ }).click()
  const mv = page.getByRole('dialog', { name: '위치 변경 신청' })
  ok('F4. per-bottle "이 병 위치 변경 신청" opens the move modal with THAT bottle preselected (lot 2)', (await mv.locator('select').first().inputValue()) === 'lt-6b')
  await mv.getByRole('button', { name: '취소' }).click()

  // 정보 수정 신청: 취소/신청, 검증
  await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).click()
  const strip = page.getByRole('region', { name: '시약 기본정보 수정' })
  ok('E7. edit mode shows 취소 / 수정 신청 (strip explains it is shared by all bottles); the entry button is disabled while editing', (await strip.getByRole('button', { name: '취소' }).count()) === 1 && (await strip.getByRole('button', { name: /^수정 신청/ }).count()) === 1 && await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).isDisabled() && (await strip.innerText()).includes('모든 병에 공통'))
  ok('E8. English name is read-only ("변경 불가"); editable set = 국문명·CAS·제조사·순도·성상·용량/단위·유해정보', (await page.getByText('영문 시약명 (변경 불가)').count()) === 1 && (await page.locator('#master-name_ko, #master-cas_no, #master-purity, #master-category, #master-hazard').count()) === 5)
  await page.locator('#master-category').fill('액체'); await page.locator('#master-volume').fill('abc').catch(() => {})
  await strip.getByRole('button', { name: /^수정 신청/ }).click(); await page.waitForTimeout(600)
  ok('E9. nothing is sent when only cancelled/invalid (volume "abc" is a number input)', rpcs.length === 1 && rpcs[0].p_field_name === 'category', rpcs.map(r => r.p_field_name))
  await page.waitForTimeout(500)
  ok('E10. only CHANGED fields are submitted (category) via the request RPC with old/new value, no identity fields', rpcs[0].p_old_value === '고체' && rpcs[0].p_new_value === '액체' && !('p_requested_by' in rpcs[0]) && rpcs[0].p_session_token === TOKEN, rpcs[0])
  ok('E11. after submitting, edit mode closes (no 수정완료 step)', (await page.getByRole('region', { name: '시약 기본정보 수정' }).count()) === 0)
  await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).click(); await page.locator('#master-name_ko').fill('임시값')
  await page.getByRole('region', { name: '시약 기본정보 수정' }).getByRole('button', { name: '취소' }).click()
  ok('E12. 취소 discards the draft: nothing submitted, value unchanged', rpcs.length === 1 && (await page.locator('main').innerText()).includes('아크리딘 오렌지') && !(await page.locator('main').innerText()).includes('임시값'))
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}

// ════ E/F. 관리자: 직접 저장, cas_source 컬럼, 용량/단위 분리 ════
{
  const { ctx, page, patches, errors } = await open(1440, 900, { admin: true, url: '/reagents/r-0006' })
  await page.getByRole('button', { name: '✏️ 정보 수정' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(600)
  ok('E13. admin: button is "✏️ 정보 수정" (direct edit), menu has 폐기 처리 + 시약 종류 삭제', (await page.getByRole('button', { name: '✏️ 정보 수정', exact: true }).count()) === 1)
  await page.getByRole('button', { name: /더보기/ }).click()
  ok('E14. admin ⋯더보기: 폐기 처리 / 시약 종류 삭제', (await page.getByRole('menuitem').allInnerTexts()).join('|').includes('폐기 처리') && (await page.getByRole('menuitem').allInnerTexts()).join('|').includes('시약 종류 삭제'))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '✏️ 정보 수정', exact: true }).click()
  await page.locator('#master-cas_no').fill('110-02-1'); await page.locator('#master-volume').fill('50'); await page.getByLabel('단위').fill('mL')
  await page.getByRole('region', { name: '시약 기본정보 수정' }).getByRole('button', { name: /^저장/ }).click(); await page.waitForTimeout(700)
  const p = patches[0] || {}
  ok('E15. admin save = ONE update with only changed fields; CAS uses the real source column cas_source (not cas_no_source); volume is numeric, unit separate', patches.length === 1 && p.cas_no === '110-02-1' && p.cas_source === 'manual' && !('cas_no_source' in p) && p.volume === 50 && p.unit === 'mL' && p.volume_source === 'manual' && !('company' in p), p)
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}

// ════ G. 목록 badge 의미 (Scenario 10) ════
{
  const { ctx, page, errors } = await open(1440, 900, { url: '/reagents/list?q=Acridine' })
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 20000 }); await page.waitForTimeout(900)
  const txt = await page.locator('main').innerText()
  ok('G1. grouped header (same name, 2 manufacturers): "보유 3병", "제조사 2곳"; the ambiguous "N개 제품" is gone', txt.includes('보유 3병') && txt.includes('제조사 2곳') && !/\d+개 제품/.test(txt), txt.slice(0, 300))
  ok('G2. single reagent with 2 bottles in 2 places: "보유 2병 · 2개 위치" in ONE neutral badge; no "위치별 보기"', txt.includes('보유 2병 · 2개 위치') && !txt.includes('위치별 보기'))
  const badges = await page.locator('[data-badge]').evaluateAll(els => els.map(e => ({ kind: e.getAttribute('data-badge'), text: e.textContent.trim() })))
  const low = badges.find(b => b.text === '재고 부족'), summ = badges.find(b => b.text.startsWith('보유 '))
  ok('G3. warning badge reads "재고 부족" (not bare "부족") and differs in kind from the neutral summary badges', !!low && low.kind === 'warning' && !!summ && summ.kind === 'neutral' && !badges.some(b => b.text === '부족'), badges)
  const colors = await page.evaluate(() => { const g = t => [...document.querySelectorAll('[data-badge]')].find(e => e.textContent.trim().startsWith(t)); return { neutral: getComputedStyle(g('보유 ')).backgroundColor, warning: getComputedStyle(g('재고 부족')).backgroundColor } })
  ok('G4. neutral (gray) and warning (red) badges have different colours — one colour never carries two meanings', colors.neutral !== colors.warning, colors)
  const expander = page.getByRole('button', { name: /Acridine orange 병\(Lot\) 목록 펼치기/ })
  ok('G5. expand is a separate affordance: a real button with aria-expanded=false (the badge itself is info only)', (await expander.getAttribute('aria-expanded')) === 'false')
  await expander.click()
  ok('G6. expanding sets aria-expanded=true and shows child rows with 개봉/미개봉 state', (await page.getByRole('button', { name: /Acridine orange 병\(Lot\) 목록 접기/ }).getAttribute('aria-expanded')) === 'true' && (await page.locator('main').innerText()).includes('잔량 15%'))
  const grp = page.getByRole('button', { name: /Acridine 제품별로 펼치기/ })
  await grp.click()
  ok('G7. group header expand button toggles (aria-expanded) and reveals the product rows', (await page.getByRole('button', { name: /Acridine 제품별로 접기/ }).getAttribute('aria-expanded')) === 'true')
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}
{
  const { ctx, page } = await open(390, 844, { url: '/reagents/list?q=Acridine' })
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 20000 }); await page.waitForTimeout(900)
  const t = await page.locator('main').innerText()
  ok('G8. mobile card shows "보유 N병 · N개 위치 · 잔량 x%" and the "재고 부족" badge', t.includes('보유 2병 · 2개 위치') && t.includes('재고 부족') && !/\s부족\s/.test(t.replace('재고 부족', '')), t.slice(0, 200))
  await ctx.close()
}

// ════ J/K. 7개 viewport: overflow 0, 뒤로가기/action/더보기/breadcrumb ════
for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`
  const { ctx, page, errors } = await open(w, h, { url: '/reagents/r-0006' })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 15000 }); await page.waitForTimeout(500)
  ok(`[${tag}] detail: no horizontal overflow`, (await overflowX(page)) <= 0, await overflowX(page))
  const back = page.getByRole('button', { name: '시약 목록으로 돌아가기' })
  ok(`[${tag}] back button visible inside the viewport, >= 44px tall`, (await inView(back, page)) && (await back.boundingBox()).height >= 44)
  const acts = ['📦 새 Lot 추가', '📍 위치 변경 신청', '✏️ 정보 수정 신청', '⋯ 더보기']
  const fits = []
  for (const a of acts) { const b = page.getByRole('button', { name: a }); await b.scrollIntoViewIfNeeded(); const bb = await b.boundingBox(); const vp = page.viewportSize(); fits.push(!!bb && bb.x >= -1 && bb.x + bb.width <= vp.width + 1) }
  ok(`[${tag}] all four top actions fit the viewport width (wrap instead of overflow)`, fits.every(Boolean), fits)
  await page.getByRole('button', { name: /더보기/ }).click()
  const menu = page.getByRole('menu'); const mb = await menu.boundingBox(); const vp = page.viewportSize()
  ok(`[${tag}] ⋯더보기 menu stays inside the viewport horizontally`, !!mb && mb.x >= -1 && mb.x + mb.width <= vp.width + 1, mb)
  await page.keyboard.press('Escape')
  const bcBox = await crumbs(page).boundingBox()
  ok(`[${tag}] breadcrumb wraps inside the page (long name), no overflow`, !!bcBox && bcBox.x + bcBox.width <= vp.width + 1 && (await overflowX(page)) <= 0, bcBox)
  await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).click(); await page.waitForTimeout(600)
  ok(`[${tag}] edit mode: no horizontal overflow; 취소/수정 신청 reachable`, (await overflowX(page)) <= 0 && (await page.getByRole('button', { name: /^수정 신청/ }).isVisible()))
  ok(`[${tag}] no page errors`, errors.length === 0, errors)
  await ctx.close()
}
for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`
  const { ctx, page } = await open(w, h, { url: '/reagents/list?q=Acridine' })
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 20000 }); await page.waitForTimeout(800)
  ok(`[${tag}] list with badges: no horizontal overflow (page level)`, (await overflowX(page)) <= 0, await overflowX(page))
  await ctx.close()
}
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
