// QA F — 느린 네트워크(STEP25), 새로고침/하드 리프레시(STEP26), 요청/콘솔 감사(STEP27),
// 자료실 CMS 네트워크(STEP28) — 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, overflowX, resultCount, waitList, studentLogin, adminLogin, BASE } from './lib.mjs'

const browser = await browserLaunch(false)
const SLOW3G = { offline: false, latency: 500, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 }

// ── STEP25-a: Slow 3G 로 목록/상세 로드(로더 → 결과) ──
{
  const { ctx, page, rec } = await session(browser, { w: 390, h: 844 })
  // dev 서버(번들 안 된 수백 개 모듈)까지 느려지면 의미가 없어, API(Supabase) 응답만 지연시킨다(요청당 +1.5초, 대역폭은 실제 그대로).
  await ctx.route(/vvafhcqypvejvsuksooi.supabase.co/, async route => { await new Promise(r => setTimeout(r, 1500)); route.continue() })
  const t0 = Date.now()
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' })
  const sawLoader = await page.getByText('시약 목록을 불러오는 중').first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false)
  await shot(page, 'F-slowapi-list-loading')
  await waitList(page)
  ok(`STEP25 slow API (+1.5s per request) list: a loader ("시약 목록을 불러오는 중…") is visible while loading; list arrives after ${Date.now() - t0}ms`, sawLoader && (await resultCount(page)) >= 300, { sawLoader, ms: Date.now() - t0 })
  await page.locator('[data-index] span').filter({ hasText: /Acetone/ }).first().click().catch(async () => { await page.goto(BASE + '/reagents/list?q=Acetone'); await waitList(page); await page.locator('[data-index] span').filter({ hasText: /Acetone/ }).first().click() })
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 30000 })
  const sawDetailLoader = await page.getByText('불러오는 중...').first().isVisible().catch(() => false)
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 60000 })
  ok(`STEP25 slow API detail: loader shown (${sawDetailLoader}) then the page renders; no overflow`, (await overflowX(page)) <= 0, { sawDetailLoader })
  ok('STEP25 slow API: no page errors, no production contact', rec.errors.length === 0 && rec.prod.length === 0, { e: rec.errors })
  await ctx.close()
}

// ── STEP25-b: 요청이 멈춤 → 30초 시간 초과 → 오류 문구 + 다시 시도 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  let stall = true
  await ctx.route(/\/rest\/v1\/reagents\?/, async route => { if (!stall) return route.continue(); await new Promise(r => setTimeout(r, 36000)); route.abort().catch(() => {}) })
  const t0 = Date.now()
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' })
  await page.getByText('시약 목록을 불러오는 중').first().waitFor({ timeout: 15000 })
  await page.getByTestId('list-load-error').waitFor({ timeout: 50000 })
  const dt = Date.now() - t0
  const txt = await page.getByTestId('list-load-error').innerText()
  await shot(page, 'F-list-timeout-error')
  ok(`STEP25 stalled request: after ~30s (${Math.round(dt / 1000)}s) the list shows an ERROR message + 다시 시도 (not the misleading "조건에 맞는 시약이 없습니다")`, dt >= 28000 && dt < 45000 && txt.includes('시약 목록을 불러오지 못했어요') && txt.includes('다시 시도') && !(await page.locator('main').innerText()).includes('조건에 맞는 시약이 없습니다'), { dt, txt: txt.slice(0, 80) })
  stall = false
  await page.getByRole('button', { name: '다시 시도' }).click()
  await waitList(page)
  ok('STEP25 retry: after the network recovers "다시 시도" loads the list', (await resultCount(page)) >= 300 && (await page.getByTestId('list-load-error').count()) === 0, await resultCount(page))
  // 상세도
  stall = true
  await ctx.route(/\/rest\/v1\/reagents\?select=%2A%2Clocations/, async route => { if (!stall) return route.continue(); await new Promise(r => setTimeout(r, 36000)); route.abort().catch(() => {}) })
  await page.goto(BASE + '/reagents/list?q=Acetone', { waitUntil: 'domcontentloaded' })
  stall = false; await waitList(page)
  const id = await page.evaluate(async () => null)
  await page.locator('tbody tr[title^="클릭"] td:nth-child(2)').first().click()
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 })
  const detailUrl = page.url()
  stall = true
  const t1 = Date.now()
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })
  const errBox = page.getByTestId('detail-load-error')
  await errBox.waitFor({ timeout: 50000 })
  ok(`STEP25 stalled detail request: after ~30s (${Math.round((Date.now() - t1) / 1000)}s) an error message + 다시 시도 + ← 시약 목록 (not "시약을 찾을 수 없습니다")`, (await errBox.innerText()).includes('시약 정보를 불러오지 못했어요') && (await errBox.getByRole('button', { name: '다시 시도' }).count()) === 1 && !(await page.locator('body').innerText()).includes('시약을 찾을 수 없습니다'))
  stall = false
  await errBox.getByRole('button', { name: '다시 시도' }).click()
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 30000 })
  ok('STEP25 detail retry recovers', (await page.locator('[data-lot-id]').count()) >= 1)
  ok('STEP25 timeout flows: no production contact', rec.prod.length === 0)
  await ctx.close()
}

// ── STEP25-c: 느린 쓰기 + 중복 제출 방지(새 Lot 추가 3연타) ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  let lotAdd = 0
  await ctx.route(/\/rest\/v1\/rpc\/lot_add/, async route => { lotAdd++; await new Promise(r => setTimeout(r, 2500)); route.continue() })
  await page.goto(BASE + '/reagents/list?q=Thymol%20blue', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await page.locator('tbody tr[title^="클릭"] td:nth-child(2)').filter({ hasText: /^Thymol blue/ }).first().click()
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '📦 새 Lot 추가' }).waitFor({ timeout: 20000 })
  const before = await page.locator('[data-lot-id]').count()
  await page.getByRole('button', { name: '📦 새 Lot 추가' }).click()
  const dlg = page.getByRole('dialog', { name: '새 Lot 추가' })
  await dlg.locator('input').first().fill('QA-DUP-1'); await dlg.locator('select').first().selectOption({ label: 'QA-냉장실' })
  const btn = dlg.getByRole('button', { name: 'Lot 추가하기' })
  await btn.click(); await btn.click({ force: true }).catch(() => {}); await btn.click({ force: true }).catch(() => {})
  await page.waitForTimeout(500)
  ok('STEP25 slow write: while pending the modal stays open (state kept)', (await dlg.count()) === 1)
  await page.waitForFunction(n => document.querySelectorAll('[data-lot-id]').length > n, before, { timeout: 30000 })
  await page.waitForTimeout(800)
  ok(`STEP25 duplicate-submit guard: 3 rapid clicks → ${lotAdd} lot_add request(s), exactly one new bottle (${before} → ${await page.locator('[data-lot-id]').count()})`, lotAdd === 1 && (await page.locator('[data-lot-id]').count()) === before + 1)
  ok('STEP25 slow write: no page errors, no production contact', rec.errors.length === 0 && rec.prod.length === 0)
  await ctx.close()
}

// ── STEP26: 새로고침 / 하드 리프레시 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  const cdp = await ctx.newCDPSession(page)
  const hard = async () => { await cdp.send('Page.reload', { ignoreCache: true }); await page.waitForLoadState('domcontentloaded') }
  // q + room
  await page.goto(`${BASE}/reagents/list?q=acet&room=${encodeURIComponent('QA-5호관 101')}`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  const n0 = await resultCount(page)
  await page.reload({ waitUntil: 'domcontentloaded' }); await waitList(page)
  const n1 = await resultCount(page)
  await hard(); await waitList(page)
  ok(`STEP26 list q+room: reload and hard-refresh keep the same result (${n0}/${n1}/${await resultCount(page)}) and URL state`, n0 === n1 && n1 === (await resultCount(page)) && new URL(page.url()).searchParams.get('q') === 'acet' && new URL(page.url()).searchParams.get('room') === 'QA-5호관 101')
  // batch
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await page.getByRole('button', { name: /시약 일괄 검색/ }).first().click(); await page.getByRole('dialog').getByRole('textbox').fill('티몰블루\nAcetic acid'); await page.getByRole('dialog').getByRole('button', { name: '조회' }).click(); await page.getByTestId('batch-bar').waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByTestId('batch-bar').waitFor({ timeout: 20000 })
  const a = await page.getByTestId('batch-summary').innerText()
  await hard(); await page.getByTestId('batch-bar').waitFor({ timeout: 20000 })
  ok('STEP26 batch search: reload and hard-refresh both keep the batch filter (sessionStorage)', a.includes('입력 2개') && (await page.getByTestId('batch-summary').innerText()).includes('입력 2개'), a)
  // 새 탭(같은 세션 storage 아님) → 복원 안 됨(설계: 새 브라우저 세션까지 영구 보존하지 않음)
  const fresh = await (await browser.newContext()).newPage()
  await fresh.goto(BASE + '/reagents/list?bs=1', { waitUntil: 'domcontentloaded' }); await waitList(fresh)
  ok('STEP26 a NEW browser session opening ?bs=1 does not resurrect the batch (flag dropped, full list)', (await fresh.getByTestId('batch-bar').count()) === 0 && !new URL(fresh.url()).searchParams.has('bs'), fresh.url())
  await fresh.context().close()
  // detail
  await page.goto(`${BASE}/reagents/list?q=Acetone`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  await page.locator('tbody tr[title^="클릭"] td:nth-child(2)').first().click(); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/)
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 })
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click(); await page.waitForURL(/\/reagents\/list/); await waitList(page)
  ok('STEP26 detail reload: page renders again; "← 시약 목록" after a reload still returns to the list search (history entry kept)', new URL(page.url()).searchParams.get('q') === 'Acetone', page.url())
  // /reagents/bulk-edit는 이제 /reagents/list로 즉시 redirect될 뿐 별도 페이지가 아니다 —
  // reload 시 상태 유지/초기화는 Reagent List 자체(URL 기반 q/room 등)와 동일하므로 여기서
  // 별도로 다시 확인할 것이 없고, redirect 자체는 qa-e-ui.mjs의 STEP-REDIRECTS가 검증한다.
  await page.goto(BASE + '/reagents/bulk-edit', { waitUntil: 'domcontentloaded' })
  await page.waitForURL(u => new URL(u).pathname === '/reagents/list', { timeout: 15000 })
  ok('STEP26 /reagents/bulk-edit redirects to /reagents/list (old bookmarks still work, no separate BulkEdit page state to reload)', new URL(page.url()).pathname === '/reagents/list')
  ok('STEP26 refresh flows: no page errors, no production contact', rec.errors.length === 0 && rec.prod.length === 0)
  await ctx.close()
}

// ── STEP27: 요청 감사 — 목록 로드 시 중복/과다 요청, 일괄검색 20줄 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page); await page.waitForTimeout(1500)
  const by = {}; for (const r of rec.net) { const k = r.m + ' ' + r.u.replace(/\?.*/, ''); by[k] = (by[k] || 0) + 1 }
  note('STEP27 requests on list load (dev server = React StrictMode double effects)', by)
  const byFull = {}; for (const r of rec.net) { const k = r.m + ' ' + r.u; byFull[k] = (byFull[k] || 0) + 1 }
  const dupes = Object.entries(byFull).filter(([, n]) => n > 2)
  ok('STEP27 list load: no identical request more than twice (React StrictMode in dev doubles effects; a production build does not)', dupes.length === 0, dupes)
  const before = rec.net.length
  await page.getByRole('button', { name: /시약 일괄 검색/ }).first().click()
  const twenty = Array.from({ length: 20 }, (_, i) => [`A${String(i * 26).padStart(3, '0')} QA compound`, `큐에이 시약 ${i + 40}`, `91${String(1000 + i * 3)}`, `없는시약${i}(ABC)`][i % 4]).join('\n')
  await page.getByRole('dialog').getByRole('textbox').fill(twenty); await page.getByRole('dialog').getByRole('button', { name: '조회' }).click(); await page.getByTestId('batch-bar').waitFor()
  const added = rec.net.slice(before)
  ok(`STEP27 bulk search with 20 lines → ${added.length} Supabase request(s) (${[...new Set(added.map(r => r.u.replace(/\?.*/, '')))].join(', ') || 'none'}), NOT 20`, added.length <= 2, added)
  ok('STEP27 no stale-abort / unhandled errors during load and bulk search', rec.errors.length === 0 && rec.console.filter(c => c.t === 'error').length === 0, { c: rec.console.slice(0, 4), f: rec.failed.slice(0, 3) })
  note('STEP27 failed requests (aborted by navigation etc.)', rec.failed.slice(0, 6))
  note('STEP27 external (non-Supabase) requests', [...new Set(rec.ext.map(e => e.u.replace(/[?].*/, '')))].slice(0, 10))
  ok('STEP27 no production/Firebase request', rec.prod.length === 0)
  await ctx.close()
}

// ── STEP28: 자료실(/resources) 네트워크 — resource_tabs/resource_articles/resource_files 중심,
//    공지(notices/notice_files) 조회 없음, 카드별 N+1 없음, 탭 전환이 전체 재조회를 유발하지 않음 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  const paths = rec.net.map(r => r.u.replace(/\?.*/, ''))
  const hit = re => paths.some(p => re.test(p))
  ok('STEP28 최초 로드: resource_tabs 조회 있음', hit(/\/rest\/v1\/resource_tabs/))
  ok('STEP28 최초 로드: resource_articles 조회 있음', hit(/\/rest\/v1\/resource_articles/))
  ok('STEP28 최초 로드: resource_files 조회(글 하나당 각각이 아니라 한 번에 배치)', hit(/\/rest\/v1\/resource_files/))
  ok('STEP28 notices/notice_files 조회 없음(공지 기능 자체가 퇴역)', !hit(/\/rest\/v1\/notices/) && !hit(/\/rest\/v1\/notice_files/))
  const filesReqs = rec.net.filter(r => /\/rest\/v1\/resource_files/.test(r.u))
  ok(`STEP28 resource_files 요청이 글 카드 수만큼(N+1)이 아니라 소수(batch) — ${filesReqs.length}건`, filesReqs.length > 0 && filesReqs.length <= 3, filesReqs.map(r => r.u))
  const cardCountInitial = await page.locator('section[aria-labelledby^="article-"]').count()

  const before = rec.net.length
  const tablist = page.getByRole('tablist', { name: '자료실 탭' })
  const tabNames = await tablist.getByRole('tab').allInnerTexts()
  await tablist.getByRole('tab', { name: tabNames[1], exact: true }).click()
  await page.waitForTimeout(800)
  const afterTabSwitch = rec.net.slice(before)
  ok(`STEP28 탭 전환("${tabNames[1]}")이 resource_tabs/resource_articles/resource_files 전체 재조회를 유발하지 않음(클라이언트 필터링) — 이번 전환에 발생한 요청 ${afterTabSwitch.length}건`, afterTabSwitch.length <= 1, afterTabSwitch)
  ok('STEP28 탭 전환 후에도 카드가 렌더됨(전체 탭 카드 수 이하)', (await page.locator('section[aria-labelledby^="article-"]').count()) <= cardCountInitial)

  const byFullRes = {}; for (const r of rec.net) { const k = r.m + ' ' + r.u; byFullRes[k] = (byFullRes[k] || 0) + 1 }
  const dupesRes = Object.entries(byFullRes).filter(([, n]) => n > 2)
  ok('STEP28 자료실 방문 전체에서 같은 요청이 반복 재요청(수십 번)되지 않음', dupesRes.length === 0, dupesRes)
  // 실패한 요청 자체는 STEP27과 같은 이유로 note만(홈 화면을 떠나며 취소되는 위젯 요청 등 navigation-abort 포함 가능) — 콘솔 에러만 strict.
  ok('STEP28 콘솔 에러 없음', rec.console.filter(x => x.t === 'error').length === 0, { c: rec.console.slice(0, 3) })
  note('STEP28 실패한 요청(navigation-abort 등)', rec.failed.slice(0, 6))
  ok('STEP28 production/Firebase 접속 없음', rec.prod.length === 0)
  await ctx.close()
}

// ── STEP28-admin: 관리자 세션에서도 resourceGuides.js 런타임 의존이 없고(하드코딩 콘텐츠 없음),
//    탭 관리 모달 오픈이 추가 전체 재조회를 유발하지 않는지 ──
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(2000) // 초기 로드 요청(글 30개 각각의 resource_files 등)이 완전히 끝난 뒤에 "before"를 재야, 이후 탭 관리 클릭이 유발한 요청만 정확히 잡힌다.
  const before = rec.net.length
  await page.getByRole('button', { name: '탭 관리' }).click()
  await page.getByRole('dialog', { name: '탭 관리' }).waitFor({ timeout: 10000 })
  await page.waitForTimeout(500)
  const opened = rec.net.slice(before)
  ok(`STEP28-admin "탭 관리" 모달 오픈이 resource_articles 전체를 다시 조회하지 않음(이미 가진 tabs만 재사용) — ${opened.length}건`, opened.length <= 1, opened)
  ok('STEP28-admin production 접속 없음', rec.prod.length === 0)
  await ctx.close()
}
await browser.close()
summary()
