// QA G4 — 학생 "입력 완료" 안내 확인 → 관리자 DB 최종 반영(빠른 더블클릭 포함) → 반영 후 화면/중복 finalization 차단 — 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, adminLogin, studentLogin, BASE } from './lib.mjs'
const browser = await browserLaunch(process.env.QA_HEADED === '1', process.env.QA_HEADED === '1' ? 120 : 0)
const admin = await session(browser, { w: 1440, h: 900 })
const A = admin.page
await A.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(A)
await A.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' })
await A.getByRole('button', { name: /검토 취소/ }).waitFor({ timeout: 25000 })

// (1) 다시 열어서 "학생 입력 완료" 상태의 학생 화면 문구 확인 (데스크톱 + 모바일)
await A.getByRole('button', { name: /검토 취소/ }).click()
await A.getByRole('button', { name: /실사 완료 처리/ }).waitFor({ timeout: 20000 })
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const stu = await session(browser, { w, h })
  await stu.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(stu.page)
  await stu.page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' })
  await stu.page.getByTestId('all-counted-note').waitFor({ timeout: 25000 })
  const n = await stu.page.getByTestId('all-counted-note').innerText()
  await shot(stu.page, `G4-${w}-student-all-counted`)
  ok(`STEP5 [${w}] student sees "✅ 모든 Lot 입력이 끝났어요 … 아직 실사가 끝난 것은 아니에요 … 실사 완료 처리(검토)와 DB 최종 반영" — input-complete ≠ inventory-complete`, n.includes('모든 Lot 입력이 끝났어요') && n.includes('아직 실사가 끝난 것은 아니에요') && n.includes('DB 최종 반영') && n.includes('미확정'), n)
  ok(`STEP5 [${w}] student can still re-enter until the admin closes the session (입력 button remains); no horizontal overflow`, (await stu.page.getByRole('button', { name: /실사 이어서 진행/ }).count()) === 1 && (await stu.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0)
  ok(`[${w}] student page console clean / no production`, stu.rec.errors.length === 0 && stu.rec.console.filter(c => c.t === 'error').length === 0 && stu.rec.prod.length === 0)
  await stu.ctx.close()
}

// (2) 다시 검토 단계로 → DB 최종 반영 (빠른 더블클릭)
await A.getByRole('button', { name: /실사 완료 처리/ }).click()
const fin = A.getByRole('button', { name: /DB 최종 반영/ })
await fin.waitFor({ timeout: 20000 }); await A.waitForTimeout(600)
const finCalls = () => admin.rec.net.filter(r => r.m === 'POST' && /rpc\/inventory_session_finalize/.test(r.u)).length
const c0 = finCalls()
await fin.click(); await fin.click({ force: true, timeout: 2000 }).catch(() => {})
await A.getByText(/진행 중인 실사 없음/).waitFor({ timeout: 25000 }); await A.waitForTimeout(1200)
const d = (admin.rec.dialogs || []).map(x => x.msg)
ok('STEP7 DB 최종 반영 asks for confirmation ("반영 후에는 되돌릴 수 없습니다") and reports the result', d.some(m => m.includes('최종 반영하시겠습니까') && m.includes('되돌릴 수 없')) && d.some(m => m.includes('실사가 최종 반영되었습니다')), d.slice(-2).map(m => m.slice(0, 90)))
note('STEP7 finalize result alert', d.find(m => m.includes('최종 반영되었습니다')))
ok(`STEP7 rapid double-click on DB 최종 반영 → ${finCalls() - c0} inventory_session_finalize request (busy-guard)`, finCalls() - c0 === 1, finCalls() - c0)
const t = await A.locator('main').innerText()
await shot(A, 'G4-admin-after-finalize')
ok('STEP7 after finalization: no active session ("진행 중인 실사 없음"), the QA session appears in the history as completed; no 최종 반영/완료 처리 buttons to press again', t.includes('진행 중인 실사 없음') && t.includes('QA_FINAL_INVENTORY_20260921') && (await A.getByRole('button', { name: /DB 최종 반영|실사 완료 처리/ }).count()) === 0, t.slice(t.indexOf('QA_FINAL') - 20, t.indexOf('QA_FINAL') + 120).replace(/\n/g, ' | '))

// (3) 중복 finalization 차단 — 관리자 세션 토큰으로 같은 RPC 를 다시 호출(정상 인증 경로, 서버가 거부해야 함)
const rep = await A.evaluate(async () => {
  const raw = JSON.parse(localStorage.getItem('lm_admin_auth') || '{}')
  const key = document.querySelector('script[type=module]') ? null : null
  const url = (import.meta && import.meta.env) ? null : null
  return { hasToken: !!raw.access_token }
})
note('admin token present for duplicate-finalize probe', rep)
const dup = await A.evaluate(async () => {
  const raw = JSON.parse(localStorage.getItem('lm_admin_auth') || '{}')
  const base = performance.getEntriesByType('resource').map(e => e.name).find(n => /supabase\.co\/rest\/v1\//.test(n))
  const origin = base.match(/^https:\/\/[^/]+/)[0]
  const anon = (await (await fetch('/src/supabase.js')).text()).match(/"VITE_SUPABASE_ANON_KEY":\s*"([^"]+)"/)?.[1]
  const sid = (await (await fetch(`${origin}/rest/v1/inventory_sessions?select=id,status&label=like.QA_FINAL*`, { headers: { apikey: anon } })).json())[0]
  const r = await fetch(`${origin}/rest/v1/rpc/inventory_session_finalize`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${raw.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_session_id: sid.id }) })
  return { sessionStatus: sid.status, http: r.status, body: (await r.text()).slice(0, 200) }
})
ok('STEP7 duplicate finalization is refused by the server (already completed → error, no second mutation)', dup.sessionStatus === 'completed' && dup.http >= 400, dup)

// (4) 목록: 미확정 표시 제거 + 확정 값
const L = await session(browser, { w: 1440, h: 900 })
await L.page.goto(`${BASE}/reagents/list?q=QA-FINAL%20Inventory`, { waitUntil: 'domcontentloaded' })
await L.page.getByText(/^검색결과/).first().waitFor({ timeout: 30000 }); await L.page.waitForTimeout(1500)
const banner = await L.page.getByRole('status').filter({ hasText: '재고실사' }).count()
const blue = await L.page.evaluate(() => [...document.querySelectorAll('td')].filter(td => getComputedStyle(td).backgroundColor === 'rgb(221, 235, 255)').length)
const txt = await L.page.locator('main').innerText()
await shot(L.page, 'G4-list-after-finalize')
ok('STEP7 pending display cleared: no "재고실사 진행 중" banner and no blue (미확정) cells', banner === 0 && blue === 0, { banner, blue })
ok('STEP7 list now shows the FINAL ledger: reagent A average remaining 70% (A1 90 + A2 50)', /Inventory reagent A[\s\S]{0,200}잔량 70%/.test(txt), txt.slice(txt.indexOf('Inventory reagent A'), txt.indexOf('Inventory reagent A') + 160).replace(/\n/g, ' | '))
ok('list after finalize: console clean, no production', L.rec.errors.length === 0 && L.rec.console.filter(c => c.t === 'error').length === 0 && L.rec.prod.length === 0)
await L.ctx.close()
ok('admin finalize flow: console clean / no page errors / no production', admin.rec.errors.length === 0 && admin.rec.prod.length === 0 && admin.rec.console.filter(c => c.t === 'error' && !/40[0-9]|status of 4/.test(c.x)).length === 0, { c: admin.rec.console.slice(0, 4) })
await admin.ctx.close(); await browser.close(); summary()
