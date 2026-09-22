// 관리자 화면 접근 게이트 검증 — 가짜 Supabase(실제 네트워크 없음).
//  UI 게이트는 "노출 제어"일 뿐이며 실제 권한은 DB(is_admin()/RLS)가 결정한다. 여기서는 프론트가 fail-closed 인지 확인한다:
//   비로그인 / 학생 세션 / admin_users 미등록 / 관리자 조회 실패(500) / 조회 지연 중 → 관리자 화면 미노출, 영구 로딩 없음
//   등록된 관리자 → 관리자 메뉴 노출
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const ADMIN_MARK = 'Excel 일괄 추가' // 관리자 화면 사이드바에만 있는 문구

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function scenario(name, { session, adminUsers, delayMs = 0 }, check) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  if (session === 'admin') await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  if (session === 'student') await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  const writes = []
  await installMock(ctx, buildReagents(20))
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }) }))
  await ctx.route(/\/rest\/v1\/admin_users/, async r => {
    if (delayMs) await new Promise(res => setTimeout(res, delayMs))
    const h = { 'access-control-allow-origin': '*' }
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (adminUsers === 'error') return r.fulfill({ status: 500, contentType: 'application/json', headers: h, body: JSON.stringify({ message: 'boom' }) })
    if (adminUsers === 'abort') return r.abort()
    return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(adminUsers === 'row' ? [{ user_id: UID }] : []) })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && q.method() !== 'GET' && !/rpc\/student_session_refresh/.test(q.url())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  await check(page, { errors, writes })
  await ctx.close()
}

const body = p => p.evaluate(() => document.body.innerText)

await scenario('비로그인', { session: null, adminUsers: 'empty' }, async (page, { errors, writes }) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  const t = await body(page)
  ok('비로그인: /admin 직접 접근 → 관리자 화면 미노출', !t.includes(ADMIN_MARK))
  ok('비로그인: 로그인 안내 표시(영구 로딩 아님)', t.includes('관리자 로그인 후 이용할 수 있습니다') && !t.includes('확인하는 중'))
  ok('비로그인: alert/redirect 없이 URL 유지', new URL(page.url()).pathname === '/admin')
  ok('비로그인: 쓰기 요청 0 / 페이지 오류 0', writes.length === 0 && errors.length === 0, { writes, errors })
})

await scenario('학생 세션', { session: 'student', adminUsers: 'empty' }, async (page) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  const t = await body(page)
  ok('학생: /admin → 관리자 화면 미노출', !t.includes(ADMIN_MARK) && t.includes('관리자 로그인 후 이용할 수 있습니다'))
  // 시약 일괄정리는 시약목록에 통합됨 — 선택 → 위치 이동에서도 학생은 "신청" 모드(직접 반영 아님, 관리자 배너 없음)
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await page.getByText(/검색결과/).first().waitFor({ timeout: 15000 })
  await page.locator('input[aria-label$="선택 목록에 담기"]').first().click()
  await page.getByRole('button', { name: /위치 이동/ }).click()
  await page.getByRole('dialog', { name: '병 선택 — 위치 이동' }).waitFor({ timeout: 10000 })
  const bt = await body(page)
  ok('학생: 위치 이동 병 선택 화면은 "신청" 모드(직접 반영 아님, 관리자 배너 없음)', bt.includes('신청') && !bt.includes('관리자 로그인 상태 확인 중') && !bt.includes('관리자 로그인됨'))
})

await scenario('Auth 세션은 있으나 admin_users 미등록', { session: 'admin', adminUsers: 'empty' }, async (page) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  const t = await body(page)
  ok('미등록 계정: 관리자 화면 미노출', !t.includes(ADMIN_MARK))
})

await scenario('관리자 조회 실패(500)', { session: 'admin', adminUsers: 'error' }, async (page, { errors }) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500)
  const t = await body(page)
  ok('조회 500: 관리자 아님으로 처리(화면 미노출)', !t.includes(ADMIN_MARK))
  ok('조회 500: 영구 로딩 아님', !t.includes('확인하는 중'))
  ok('조회 500: 페이지 오류 0', errors.length === 0, errors)
})

await scenario('관리자 조회 네트워크 오류', { session: 'admin', adminUsers: 'abort' }, async (page) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6500) // 재시도 상한(5s) 이후
  const t = await body(page)
  ok('네트워크 오류: 화면 미노출 + 영구 로딩 아님', !t.includes(ADMIN_MARK) && !t.includes('확인하는 중'))
})

await scenario('조회 지연 중', { session: 'admin', adminUsers: 'row', delayMs: 2500 }, async (page) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(800)
  const t1 = await body(page)
  ok('확인 중: 관리자 화면 미노출(깜빡임 없음), 로딩 문구 표시', !t1.includes(ADMIN_MARK) && t1.includes('확인하는 중'))
  await page.waitForTimeout(3000)
  ok('확인 완료 후: 관리자 화면 노출', (await body(page)).includes(ADMIN_MARK))
})

await scenario('등록된 관리자', { session: 'admin', adminUsers: 'row' }, async (page, { errors }) => {
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500)
  const t = await body(page)
  ok('관리자: 관리자 메뉴 노출', t.includes(ADMIN_MARK) && t.includes('관리자 메뉴'))
  ok('관리자: 잔여 alert/redirect 없음', new URL(page.url()).pathname === '/admin')
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1000)
  ok('관리자: 홈 정상 렌더(일반 기능 유지)', (await body(page)).length > 50 && errors.length === 0, errors)
})

await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
