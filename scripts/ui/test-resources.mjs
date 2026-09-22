// 자료실(DB 기반 CMS) 읽기 경로 회귀 — 탭/글/첨부파일 렌더링, 관리자 버튼 노출, 공지 기능 퇴역
// (홈/사이드바에서 사라짐 + /notices, /safety 는 /resources로 redirect). 관리자 탭/글/파일 CRUD는
// 실제 staging 실브라우저 QA(scripts/staging QA)로 검증하고 여기서는 mock CRUD를 흉내내지 않는다.
// 가짜 Supabase(실제 네트워크 없음).
import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, installMock } from './harness.mjs'
const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }

const TAB_SAFETY = 'a0000000-0000-0000-0000-000000000001'
const TAB_OPS = 'a0000000-0000-0000-0000-000000000002'
const ART_LIQUID = 'b0000000-0000-0000-0000-000000000001'
const ART_SPECIAL = 'b0000000-0000-0000-0000-000000000002'
const ART_REGISTER = 'b0000000-0000-0000-0000-000000000003'

const TABS = [
  { id: TAB_SAFETY, name: '안전·폐기', sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: TAB_OPS, name: '연구실 운영', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]
const ARTICLES = [
  {
    id: ART_LIQUID, tab_id: TAB_SAFETY, title: '폐액 처리 안내',
    summary: '폐액을 종류별로 구분하고, 지정 용기·라벨을 사용합니다.',
    audience: '연구실안전관리담당자 · 연구실책임자', timing: '신규 입고 시 · 정기 점검 시',
    steps: ['폐액 성상 확인', '유기 / 무기 / 산성 / 알칼리 구분', '지정 용기 사용'],
    notice: '자세한 기준은 첨부된 공식자료를 확인하세요.',
    link_label: '학교 시스템 열기 ↗', link_url: 'https://safety.example.ac.kr/',
    sort_order: 0, legacy_category_key: null, legacy_section_key: null,
  },
  {
    id: ART_SPECIAL, tab_id: TAB_SAFETY, title: '특별관리물질 취급 안내',
    summary: '취급 전 해당 여부와 SDS를 확인하고 필요한 기록을 작성합니다.',
    audience: null, timing: null,
    steps: ['대상 여부 확인', '필요한 등록·기록 수행'],
    notice: null,
    link_label: '시약 목록 열기', link_url: '/reagents/list',
    sort_order: 1, legacy_category_key: null, legacy_section_key: null,
  },
  {
    id: ART_REGISTER, tab_id: TAB_OPS, title: '학교 화학물질 등록',
    summary: '시약목록에서 등록 대상을 선택해 Excel로 내보냅니다.',
    audience: null, timing: null, steps: [], notice: null, link_label: null, link_url: null,
    sort_order: 0, legacy_category_key: null, legacy_section_key: null,
  },
]
const FILES = [
  { id: 'c1', article_id: ART_LIQUID, category_key: null, section_key: null, resource_key: null, title: '폐액 처리 안내.pdf', resource_type: 'form', issuer: null, revision_date: null, effective_date: null, version_label: null, sort_order: 0, notes: null, is_current: true, storage_path: 'resources/articles/x/a.pdf', original_filename: '폐액 처리 안내.pdf', mime_type: 'application/pdf', file_url: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'c2', article_id: ART_LIQUID, category_key: null, section_key: null, resource_key: null, title: '폐액 라벨.hwp', resource_type: 'form', issuer: null, revision_date: null, effective_date: null, version_label: null, sort_order: 1, notes: null, is_current: true, storage_path: 'resources/articles/x/b.hwp', original_filename: '폐액 라벨.hwp', mime_type: 'application/haansofthwp', file_url: null, created_at: '2026-01-01T00:00:00Z' },
]

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
async function open({ w = 1280, h = 900, admin = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  await installMock(ctx, [])
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/resource_tabs/, r => reply(r, TABS))
  await ctx.route(/\/rest\/v1\/resource_articles/, r => reply(r, ARTICLES))
  await ctx.route(/\/rest\/v1\/resource_files/, r => reply(r, FILES))
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, admin ? [{ user_id: UID }] : []))
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const writes = []; page.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 15000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)
  return { ctx, page, errors, writes }
}
const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// ── 탭/글 렌더링 ──
{
  const { ctx, page, errors, writes } = await open()
  const tablist = page.getByRole('tablist', { name: '자료실 탭' })
  ok('STEP-10 탭은 전체(synthetic) + DB 탭 2개 = 3개', (await tablist.getByRole('tab').allInnerTexts()).join(',') === '전체,안전·폐기,연구실 운영')
  ok('STEP-10 "전체"가 기본 선택(aria-selected)', await tablist.getByRole('tab', { name: '전체' }).getAttribute('aria-selected') === 'true')
  ok('STEP-10 "전체"에서 글 3개 모두 보임', (await page.locator('section[aria-labelledby^="article-"]').count()) === 3)

  await tablist.getByRole('tab', { name: '연구실 운영' }).click()
  await page.waitForTimeout(300)
  ok('STEP-10 "연구실 운영" 탭 선택 시 그 탭 글만(1개)', (await page.locator('section[aria-labelledby^="article-"]').count()) === 1)
  ok('연구실 운영 탭이 aria-selected=true로 바뀜', await tablist.getByRole('tab', { name: '연구실 운영' }).getAttribute('aria-selected') === 'true')

  await tablist.getByRole('tab', { name: '전체' }).click()
  await page.waitForTimeout(300)
  const liquidCard = page.getByRole('region', { name: '폐액 처리 안내' })
  ok('STEP-1/15 누가/언제가 있으면 보임', (await liquidCard.getByText('연구실안전관리담당자 · 연구실책임자').count()) === 1 && (await liquidCard.getByText('신규 입고 시 · 정기 점검 시').count()) === 1)
  ok('STEP-13 해야 할 일 bullet 3개', (await liquidCard.locator('li').count()) === 3)
  ok('STEP-16 notice 박스', (await liquidCard.getByText('자세한 기준은 첨부된 공식자료를 확인하세요.').count()) === 1)
  ok('STEP-17 관련 링크 버튼 1개(외부)', (await liquidCard.getByRole('button', { name: '학교 시스템 열기 ↗' }).count()) === 1)
  ok('STEP-28 첨부파일 즉시 노출(클릭 없이)', (await liquidCard.getByText('폐액 처리 안내.pdf').count()) === 1 && (await liquidCard.getByText('폐액 라벨.hwp').count()) === 1)

  const specialCard = page.getByRole('region', { name: '특별관리물질 취급 안내' })
  ok('STEP-15 누가/언제 없으면 그 영역 자체가 렌더링되지 않음', (await specialCard.getByText('누가').count()) === 0 && (await specialCard.getByText('언제').count()) === 0)
  ok('STEP-2 "앱에서 준비하기" 섹션/문구 없음(자료실 전체)', (await page.getByText('앱에서 준비하기').count()) === 0)
  ok('STEP-49 게시판 표(번호|제목|작성자|작성일|조회수) 아님 — table 요소 없음', (await page.locator('table').count()) === 0)
  ok('no DB writes / no console errors from browsing + tab switching', writes.length === 0 && errors.length === 0, { writes, errors })
  await ctx.close()
}

// ── 관리자 버튼 노출(읽기 전용 — 실제 CRUD는 staging 실브라우저 QA) ──
{
  const { ctx, page } = await open({ admin: true })
  ok('STEP-11 관리자: "탭 관리" 버튼 노출', (await page.getByRole('button', { name: '탭 관리' }).count()) === 1)
  ok('STEP-12 관리자: "+ 글 작성" 버튼 노출', (await page.getByRole('button', { name: '+ 글 작성' }).count()) === 1)
  const liquidCard = page.getByRole('region', { name: '폐액 처리 안내' })
  // 삭제는 글 자체(1개) + 첨부파일 2개(파일별 삭제) 모두 있어 카드 안에 여러 개 있을 수 있다 — 최소 1개만 확인.
  ok('STEP-50 관리자: 글 카드에 수정/삭제 버튼', (await liquidCard.getByRole('button', { name: '수정', exact: true }).count()) === 1 && (await liquidCard.getByRole('button', { name: '삭제' }).count()) >= 1)
  await ctx.close()
}
{
  const { ctx, page } = await open({ admin: false })
  ok('STEP-50 비관리자: "탭 관리"/"+ 글 작성"/수정/삭제 전혀 없음', (await page.getByRole('button', { name: '탭 관리' }).count()) === 0 && (await page.getByRole('button', { name: '+ 글 작성' }).count()) === 0 && (await page.getByRole('button', { name: '수정' }).count()) === 0)
  await ctx.close()
}

// ── 공지 기능 퇴역 ──
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await installMock(ctx, [])
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await page.getByText('바로가기').first().waitFor({ timeout: 15000 })
  ok('STEP-38 Home QUICK_MENU에 "공지사항" 타일 없음', (await page.getByRole('link', { name: /공지사항/ }).count()) === 0)
  ok('STEP-9/43 Home 자료 타일 라벨 "자료실"', (await page.getByRole('link', { name: '자료실' }).count()) === 1)
  await ctx.close()
}
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await installMock(ctx, [])
  const page = await ctx.newPage()
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' })
  await page.getByText(/검색결과/).first().waitFor({ timeout: 15000 })
  ok('STEP-43 사이드바/바텀네비에 "공지사항" 없음', (await page.getByRole('link', { name: /공지사항/ }).count()) === 0)
  const resourcesNavLink = page.locator('a[href="/resources"]').first()
  const resourcesNavText = (await resourcesNavLink.innerText()).trim()
  ok('STEP-43 사이드바 자료 라벨 "자료실"(옛 "자료" 단독 라벨 없음)', resourcesNavText.endsWith('자료실') && !resourcesNavText.endsWith('\n자료') && resourcesNavText !== '자료', resourcesNavText)
  await ctx.close()
}
for (const [path, tag] of [['/notices', 'STEP-39 /notices'], ['/notices/abc', 'STEP-40 /notices/:id'], ['/safety', 'STEP-41 /safety'], ['/safety/abc', 'STEP-41 /safety/:id']]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await installMock(ctx, [])
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/resource_tabs/, r => reply(r, TABS))
  await ctx.route(/\/rest\/v1\/resource_articles/, r => reply(r, ARTICLES))
  await ctx.route(/\/rest\/v1\/resource_files/, r => reply(r, FILES))
  const page = await ctx.newPage()
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(u => new URL(u).pathname === '/resources', { timeout: 15000 })
  ok(`${tag} redirects to /resources(옛 bookmark 호환, 게시판 UI 없음)`, new URL(page.url()).pathname === '/resources')
  await ctx.close()
}

// ── Accessibility(axe, 탭/카드/관리자 컨트롤 포함한 실제 콘텐츠 상태) ──
{
  const { ctx, page } = await open({ admin: true })
  await page.evaluate(src => { (0, eval)(src) }, axeSrc)
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
    return r.violations.filter(v => v.impact === 'critical' || v.impact === 'serious').map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, html: v.nodes[0].html.slice(0, 140) }))
  })
  ok('STEP-57 axe critical/serious = 0(탭/글/링크/첨부/관리자 컨트롤 포함)', violations.length === 0, violations)
  await ctx.close()
}

// ── Mobile overflow ──
for (const [w, h] of [[320, 568], [360, 800], [390, 844], [430, 932]]) {
  const { ctx, page, errors } = await open({ w, h })
  ok(`[${w}x${h}] STEP-56 자료실 가로 overflow 없음(탭 chip/긴 제목/여러 첨부/관리 버튼)`, (await overflowX(page)) <= 0, await overflowX(page))
  ok(`[${w}x${h}] 콘솔 오류 없음`, errors.length === 0, errors)
  await ctx.close()
}

await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
