// QA H2b — 남은 정보 수정 요청(국문명) 승인 + 반영 확인 + 이미 처리된 요청의 재승인 차단(중복 승인 방지)
import { readFileSync } from 'node:fs'
import { browserLaunch, session, ok, note, summary, shot, adminLogin, studentLogin, waitList, BASE } from './lib.mjs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
const browser = await browserLaunch(false)
const A = await session(browser, { w: 1440, h: 900 })
const page = A.page
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(page)
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /시약정보 수정/ }).first().click(); await page.waitForTimeout(1800)
const pend = page.getByRole('button', { name: /✓ 승인/ }).filter({ visible: true })
ok('one info-change request (국문명) is still pending', (await pend.count()) === 1 && (await page.locator('main').innerText()).includes('name_ko'), await pend.count())
const c0 = A.rec.net.filter(r => r.m === 'POST' && /rpc\/reagent_change_request_review/.test(r.u)).length
await pend.first().click(); await pend.first().click({ force: true, timeout: 1200 }).catch(() => {})
await page.waitForTimeout(2500)
ok('STEP11 second info-change approved with exactly 1 review call (rapid double-click)', A.rec.net.filter(r => r.m === 'POST' && /rpc\/reagent_change_request_review/.test(r.u)).length - c0 === 1)
ok('no 승인 buttons left (nothing pending)', (await page.getByRole('button', { name: /✓ 승인/ }).filter({ visible: true }).count()) === 0)
// 이미 승인된 요청 재승인 → 서버 거부(같은 관리자 토큰, 정상 경로)
const rid = await page.evaluate(async ({ url, anon }) => {
  const raw = JSON.parse(localStorage.getItem('lm_admin_auth') || '{}')
  const reqs = await (await fetch(`${url}/rest/v1/reagent_change_requests?select=id,status,field_name&status=eq.approved&order=created_at.desc&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${raw.access_token}` } })).json()
  const r = await fetch(`${url}/rest/v1/rpc/reagent_change_request_review`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${raw.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_request_id: reqs[0].id, p_decision: 'approve', p_reason: null }) })
  return { was: reqs[0].status, http: r.status, body: (await r.text()).slice(0, 140) }
}, { url: env.VITE_SUPABASE_URL, anon: env.VITE_SUPABASE_ANON_KEY })
ok('STEP13 already-approved request cannot be approved again (server: pending only)', rid.was === 'approved' && rid.http >= 400, rid)
const S = await session(browser, { w: 1440, h: 900 })
await S.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(S.page)
await S.page.goto(`${BASE}/reagents/list?q=QA-FINAL%20Info`, { waitUntil: 'domcontentloaded' }); await waitList(S.page)
const p = await S.page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 } })
await S.page.mouse.click(p.x, p.y); await S.page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await S.page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await S.page.waitForTimeout(1500)
const t = await S.page.locator('main').innerText()
await shot(S.page, 'H2-student-info-after')
ok('STEP11 after approval + reload: master shows 95% and 큐에이 정보 승인됨, no pending marker', t.includes('95%') && t.includes('큐에이 정보 승인됨') && !t.includes('큐에이 정보 원본') && !t.includes('검토 대기'), t.slice(t.indexOf('국문 시약명'), t.indexOf('국문 시약명') + 60).replace(/\n/g, ' | '))
ok('console clean / no production', A.rec.prod.length === 0 && S.rec.prod.length === 0 && S.rec.errors.length === 0 && S.rec.console.filter(c => c.t === 'error').length === 0)
await S.ctx.close(); await A.ctx.close(); await browser.close(); summary()
