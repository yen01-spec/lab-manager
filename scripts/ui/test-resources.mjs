// 자료 탭 단순화 검증 — 한 세로 목록(카테고리 필터 칩만) + 첨부파일, 시약 DB 재조회/Excel 생성/
// 공지사항 중복/특별관리물질 요약/학교등록 그리드/비상연락처 alert 같은 업무도구가 없는지. 가짜 Supabase.
import { chromium, CHROME, BASE, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }

const RESOURCE_FILES = [
  { id: 1, category_key: 'waste', section_key: 'reagent', resource_key: null, title: '폐시약 처리 안내', resource_type: 'form', issuer: null, revision_date: null, effective_date: null, version_label: null, sort_order: 0, notes: null, is_current: true, storage_path: 'resources/waste/reagent/guide.pdf', original_filename: '폐시약 처리 안내.pdf', mime_type: 'application/pdf', file_url: null, created_at: '2026-01-01T00:00:00Z' },
]
const APP_SETTINGS = [
  { key: 'school_safety_system_url', value: 'https://safety.example.ac.kr/' },
  { key: 'kosha_label_url', value: 'https://msds.example.or.kr/' },
]

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
async function open({ w = 1280, h = 900, admin = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  await installMock(ctx, [])
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/resource_files/, r => reply(r, RESOURCE_FILES))
  await ctx.route(/\/rest\/v1\/app_settings/, r => reply(r, APP_SETTINGS))
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, admin ? [{ user_id: UID }] : []))
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const writes = []; page.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료', level: 1 }).waitFor({ timeout: 15000 })
  await page.locator('section[aria-labelledby^="res-"]').first().waitFor({ timeout: 15000 })
  return { ctx, page, errors, writes }
}
const cards = page => page.locator('section[aria-labelledby^="res-"]')
const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// ── 한 세로 목록 + 필터 칩(중첩 2단계 없음) ──
{
  const { ctx, page, errors, writes } = await open()
  const chipGroup = page.getByRole('group', { name: '자료 분류' })
  ok('STEP-D 필터 칩은 전체/안전·폐기/서식·양식/연구실 운영 4개뿐(중첩 2단계 tab 없음)',
    (await chipGroup.getByRole('button').allInnerTexts()).join(',') === '전체,안전·폐기,서식·양식,연구실 운영')
  const total = await cards(page).count()
  ok('STEP-Q 전체를 고르면 모든 자료 항목이 한 세로 목록으로 보임(30개: 폐기물8·특별관리물질5·사전유해인자6·안전표지4·연구실운영7)', total === 30, total)

  await chipGroup.getByRole('button', { name: '서식·양식' }).click()
  await page.waitForTimeout(250)
  const formsCount = await cards(page).count()
  ok('STEP-Q "서식·양식" 필터는 사전유해인자 6개만 남김(파일 분류 매핑 그대로, category_key 안 바뀜)', formsCount === 6, formsCount)

  await chipGroup.getByRole('button', { name: '안전·폐기' }).click()
  await page.waitForTimeout(250)
  const safetyCount = await cards(page).count()
  ok('STEP-Q "안전·폐기" 필터는 폐기물+특별관리물질+안전표지 17개', safetyCount === 17, safetyCount)

  await chipGroup.getByRole('button', { name: '연구실 운영' }).click()
  await page.waitForTimeout(250)
  const opsCount = await cards(page).count()
  ok('STEP-Q "연구실 운영" 필터는 ops 7개', opsCount === 7, opsCount)

  await chipGroup.getByRole('button', { name: '전체' }).click()
  await page.waitForTimeout(250)
  const backTotal = await cards(page).count()
  ok('전체로 되돌리면 다시 30개', backTotal === 30, backTotal)

  ok('STEP-P 자료 탭 안에 "공지사항" 카테고리/카드 없음(공지사항은 Home에 이미 독립 메뉴)', (await page.getByRole('button', { name: '공지사항', exact: true }).count()) === 0)
  ok('no DB writes / no console errors from browsing + filtering', writes.length === 0 && errors.length === 0, { writes, errors })
  await ctx.close()
}

// ── 제거된 업무도구가 더 이상 없음 ──
{
  const { ctx, page } = await open()
  const bodyText = await page.locator('body').innerText()
  ok('STEP-F ResourceReagentList(현재 보유 특별관리물질 요약 위젯)가 더 이상 없음', !bodyText.includes('현재 연구실 특별관리물질') && !bodyText.includes('CAS 기준으로 중복 제거한 물질 종류 수'))
  ok('STEP-H SchoolRegistrationView(최근 입고 조회 편집 그리드)가 더 이상 없음', !bodyText.includes('최근 입고 시약 조회') && (await page.getByRole('button', { name: /^(7일|30일|90일|1년)$/ }).count()) === 0)
  ok('STEP-L 비상연락처 action이 더 이상 없음', !bodyText.includes('비상연락처'))
  await ctx.close()
}

// ── 시약 목록 링크(reagent-search) — preset 딥링크 1개만, Lot picker 없음 ──
{
  const { ctx, page } = await open()
  const targetsCard = page.locator('section[aria-labelledby^="res-special-targets"]')
  await targetsCard.waitFor({ timeout: 15000 })
  const reagentLinks = targetsCard.getByRole('button', { name: '시약 목록 열기 →' })
  ok('STEP-G 카드 하나에 "시약 목록 열기" 링크가 정확히 1개(여러 preset 버튼 없음)', (await reagentLinks.count()) === 1)
  await reagentLinks.click()
  // 시약목록은 ?preset=special 딥링크를 받아 실제 필터 파라미터(?special=1)로 즉시 바꿔 적용한다(기존 동작).
  await page.waitForURL(/\/reagents\/list\?special=1/, { timeout: 15000 })
  ok('클릭하면 시약목록의 특별관리물질 필터로 이동(딥링크 1개, 자료 안에 목록/선택/Excel 재구현 없음)', new URL(page.url()).searchParams.get('special') === '1')
  await ctx.close()
}

// ── 첨부파일은 핵심 기능으로 유지 ──
{
  const { ctx, page } = await open()
  const wasteReagentCard = page.locator('section[aria-labelledby^="res-waste-reagent"]')
  await wasteReagentCard.waitFor({ timeout: 15000 })
  await wasteReagentCard.getByText('폐시약 처리 안내').first().waitFor({ timeout: 10000 })
  ok('STEP-N 첨부파일이 카드 안에 바로 보임(클릭해서 펼칠 필요 없음)', (await wasteReagentCard.getByText('폐시약 처리 안내').count()) >= 1)
  await ctx.close()
}

// ── SafetySignage(유지 결정) 도구 링크 ──
{
  const { ctx, page } = await open()
  const signageCard = page.locator('section[aria-labelledby^="res-signage-safety-sign"]')
  await signageCard.waitFor({ timeout: 15000 })
  const toolLink = signageCard.getByRole('button', { name: /출입구 표지 현황 도구/ })
  ok('SafetySignage 링크(출입구 표지 현황 도구)는 카드 안 단순 링크 1개로 유지', (await toolLink.count()) === 1)
  await toolLink.click()
  await page.waitForURL(/\/safety-signage/, { timeout: 15000 })
  ok('클릭하면 /safety-signage로 이동', new URL(page.url()).pathname === '/safety-signage')
  await ctx.close()
}

// ── 공식 링크 ──
{
  const { ctx, page } = await open()
  const wasteReagentCard = page.locator('section[aria-labelledby^="res-waste-reagent"]')
  await wasteReagentCard.waitFor({ timeout: 15000 })
  await page.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u } })
  await wasteReagentCard.getByRole('button', { name: /학교 시스템 열기/ }).click()
  const opened = await page.evaluate(() => window.__opened)
  ok('STEP-M 공식 링크 1개(학교 시스템 열기)가 app_settings 값으로 새 탭 열기', opened === 'https://safety.example.ac.kr/', opened)
  await ctx.close()
}

// ── 관리자 CMS는 그대로 유지 ──
{
  const { ctx, page } = await open({ admin: true })
  const wasteReagentCard = page.locator('section[aria-labelledby^="res-waste-reagent"]')
  await wasteReagentCard.waitFor({ timeout: 15000 })
  const addBtn = wasteReagentCard.getByRole('button', { name: '+ 자료 추가' })
  const cmsOk = await addBtn.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  ok('STEP-N/O 관리자는 카드별로 "+ 자료 추가"(기존 CMS) 그대로 사용 가능', cmsOk)
  await ctx.close()
}

// ── Mobile overflow ──
for (const [w, h] of [[320, 568], [360, 800], [390, 844], [430, 932]]) {
  const { ctx, page, errors } = await open({ w, h })
  ok(`[${w}x${h}] STEP-V 자료 목록 가로 overflow 없음(카테고리 칩/긴 제목/여러 첨부)`, (await overflowX(page)) <= 0, await overflowX(page))
  ok(`[${w}x${h}] 콘솔 오류 없음`, errors.length === 0, errors)
  await ctx.close()
}

await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
