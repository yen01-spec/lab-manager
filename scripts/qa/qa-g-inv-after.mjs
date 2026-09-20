// QA G5 — 최종 반영 이후: 중복 finalization 서버 차단, 목록의 미확정 표시 제거/확정 값, 세션 이력 화면 — 실제 staging 브라우저
import { readFileSync } from 'node:fs'
import { browserLaunch, session, ok, note, summary, shot, adminLogin, BASE } from './lib.mjs'
const env = {}
for (const line of readFileSync(new URL('../../.env.staging.local', import.meta.url), 'utf-8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim() }
const browser = await browserLaunch(false)
const A = await session(browser, { w: 1440, h: 900 })
await A.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(A.page)
const dup = await A.page.evaluate(async ({ url, anon }) => {
  const raw = JSON.parse(localStorage.getItem('lm_admin_auth') || '{}')
  const sess = (await (await fetch(`${url}/rest/v1/inventory_sessions?select=id,status&label=like.QA_FINAL*`, { headers: { apikey: anon } })).json())[0]
  const r = await fetch(`${url}/rest/v1/rpc/inventory_session_finalize`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${raw.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_session_id: sess.id }) })
  return { sessionStatus: sess.status, http: r.status, body: (await r.text()).slice(0, 160) }
}, { url: env.VITE_SUPABASE_URL, anon: env.VITE_SUPABASE_ANON_KEY })
ok('STEP7 duplicate finalization refused by the server with the normal admin token (session already completed → 4xx, no second mutation)', dup.sessionStatus === 'completed' && dup.http >= 400, dup)
await A.page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' }); await A.page.getByText(/진행 중인 실사 없음/).waitFor({ timeout: 25000 }); await A.page.waitForTimeout(1000)
await shot(A.page, 'G5-admin-history')
const cross = A.page.getByRole('button', { name: /교차확인/ })
ok('STEP7 completed session row in the history: 상태 "최종 반영" with 🔍 교차확인', (await A.page.locator('main').innerText()).includes('최종 반영') && (await cross.count()) >= 1)

const L = await session(browser, { w: 1440, h: 900 })
await L.page.goto(`${BASE}/reagents/list?q=QA-FINAL%20Inventory`, { waitUntil: 'domcontentloaded' })
await L.page.getByText(/^검색결과/).first().waitFor({ timeout: 30000 }); await L.page.waitForTimeout(1500)
const banner = await L.page.getByRole('status').filter({ hasText: '재고실사' }).count()
const blue = await L.page.evaluate(() => [...document.querySelectorAll('td')].filter(td => getComputedStyle(td).backgroundColor === 'rgb(221, 235, 255)').length)
const txt = await L.page.locator('main').innerText()
await shot(L.page, 'G5-list-after-finalize')
ok('STEP7 pending display cleared: no "재고실사 진행 중/검토 중" banner and no blue (미확정) cells', banner === 0 && blue === 0, { banner, blue })
ok('STEP7 list shows the FINAL ledger: reagent A average remaining 70% (A1 90 + A2 50)', /Inventory reagent A[\s\S]{0,220}잔량 70%/.test(txt), txt.slice(txt.indexOf('Inventory reagent A'), txt.indexOf('Inventory reagent A') + 160).replace(/\n/g, ' | '))
ok('after-finalize pages: console clean (admin probe 4xx is the intended refusal), no production', L.rec.errors.length === 0 && L.rec.console.filter(c => c.t === 'error').length === 0 && L.rec.prod.length === 0 && A.rec.prod.length === 0)
await L.ctx.close(); await A.ctx.close(); await browser.close(); summary()
