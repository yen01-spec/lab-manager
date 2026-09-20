// QA H2 — 관리자가 실제 UI 로 위치 이동 / 정보 수정 / 폐기 요청을 승인하고, 학생 화면에서 실제 반영을 확인 (QA-FINAL 데이터만)
import { browserLaunch, session, ok, note, summary, shot, adminLogin, studentLogin, waitList, BASE } from './lib.mjs'
const browser = await browserLaunch(process.env.QA_HEADED === '1', process.env.QA_HEADED === '1' ? 120 : 0)
const A = await session(browser, { w: 1440, h: 900 })
const page = A.page
const calls = re => A.rec.net.filter(r => r.m === 'POST' && re.test(r.u)).length
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(page)
await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })

async function approveIn(tab, marker, rpcRe, label) {
  await page.getByRole('button', { name: new RegExp(tab) }).first().click(); await page.waitForTimeout(1800)
  const t = await page.locator('main').innerText()
  ok(`${label}: admin review screen lists the pending QA request (${marker})`, t.includes(marker), t.slice(t.indexOf(marker) - 40, t.indexOf(marker) + 140).replace(/\n/g, ' | '))
  await shot(page, `H2-admin-${label}-pending`)
  const c0 = calls(rpcRe)
  const btn = page.getByRole('button', { name: /승인/ }).filter({ visible: true }).first()
  await btn.click(); await btn.click({ force: true, timeout: 1200 }).catch(() => {})
  await page.waitForTimeout(2500)
  return calls(rpcRe) - c0
}
// ── 위치 이동 ──
const n1 = await approveIn('위치 변경', 'QA-FINAL Move reagent', /rpc\/location_request_review/, 'STEP10 location')
ok(`STEP10 location approve → ${n1} review RPC call (rapid double-click did not duplicate)`, n1 === 1, n1)
const move = await page.locator('main').innerText()
ok('STEP10 the request now reads as approved (위치 변경 완료) and no 승인 button remains for it', !(await page.getByRole('button', { name: /승인/ }).filter({ visible: true }).count()), move.slice(0, 120).replace(/\n/g, ' | '))
// ── 정보 수정 ──
const n2 = await approveIn('시약정보 수정', 'QA-FINAL Info reagent', /rpc\/reagent_change_request_review/, 'STEP11 info-change')
// 정보 수정은 요청이 2건(purity, name_ko) — 남은 건 하나 더 승인
let extra = 0
while (await page.getByRole('button', { name: /^승인$/ }).filter({ visible: true }).count()) { const c = calls(/rpc\/reagent_change_request_review/); await page.getByRole('button', { name: /^승인$/ }).filter({ visible: true }).first().click(); await page.waitForTimeout(2200); extra += calls(/rpc\/reagent_change_request_review/) - c; if (extra > 3) break }
ok(`STEP11 info-change: 2 requests approved with exactly ${n2 + extra} review RPC calls total (first click double-clicked rapidly)`, n2 + extra === 2, { first: n2, extra })
// ── 폐기 ──
const n3 = await approveIn('폐기', 'QA-FINAL Dispose reagent', /rpc\/disposal_request_review/, 'STEP12 disposal')
ok(`STEP12 disposal approve → ${n3} review RPC call; approval = immediate disposal (there is no separate "폐기 완료" second step button)`, n3 === 1 && (await page.getByRole('button', { name: '폐기 완료', exact: true }).count()) === 0, n3)
const dtxt = await page.locator('main').innerText()
await shot(page, 'H2-admin-disposal-after')
note('admin disposal tab after approve', dtxt.slice(dtxt.indexOf('QA-FINAL Dispose'), dtxt.indexOf('QA-FINAL Dispose') + 200).replace(/\n/g, ' | '))
ok('admin approvals: console clean / no page errors', A.rec.errors.length === 0 && A.rec.console.filter(c => c.t === 'error').length === 0 && A.rec.prod.length === 0, { c: A.rec.console.slice(0, 3) })

// ── 학생 화면에서 실제 반영 확인(reload 후) ──
const S = await session(browser, { w: 1440, h: 900 })
await S.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(S.page)
const open = async name => {
  await S.page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(name)}`, { waitUntil: 'domcontentloaded' }); await waitList(S.page)
  const p = await S.page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 } })
  await S.page.mouse.click(p.x, p.y); await S.page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await S.page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await S.page.waitForTimeout(1500)
  return S.page.locator('main').innerText()
}
let t = await open('QA-FINAL Move reagent')
ok('STEP10 after approval + reload: the bottle shows the NEW location 위치B, no pending badge', /QA-FINAL-위치B/.test(t) && !t.includes('위치 변경 신청 완료 · 관리자 검토 대기') && !t.includes('위치 변경 요청 대기'), t.slice(t.indexOf('Lot QA-MOVE-1'), t.indexOf('Lot QA-MOVE-1') + 200).replace(/\n/g, ' | '))
await shot(S.page, 'H2-student-move-after')
t = await open('QA-FINAL Info reagent')
ok('STEP11 after approval + reload: reagent master shows the approved values (purity 95%, 국문명 큐에이 정보 승인됨)', t.includes('95%') && t.includes('큐에이 정보 승인됨') && !t.includes('큐에이 정보 원본'), t.slice(t.indexOf('시약 기본정보'), t.indexOf('시약 기본정보') + 260).replace(/\n/g, ' | '))
t = await open('QA-FINAL Dispose reagent')
const lots = await S.page.locator('[data-lot-id]').evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 90)))
await shot(S.page, 'H2-student-disposal-after')
ok('STEP12 after approval + reload: QA-DISP-1 shows as 폐기(disposed) and only QA-DISP-2 is 보유중', lots.some(l => l.includes('QA-DISP-1') && l.includes('폐기')) && lots.some(l => l.includes('QA-DISP-2') && l.includes('보유중')), lots)
await S.page.goto(`${BASE}/reagents/list?q=QA-FINAL%20Dispose`, { waitUntil: 'domcontentloaded' }); await waitList(S.page)
const lt = await S.page.locator('main').innerText()
ok('STEP12 Reagent List: the disposed bottle is no longer counted as active (single bottle → no "보유 N병" summary badge)', !/보유 2병/.test(lt), lt.slice(lt.indexOf('Dispose reagent'), lt.indexOf('Dispose reagent') + 120).replace(/\n/g, ' | '))
ok('student post-approval pages: console clean / no production', S.rec.errors.length === 0 && S.rec.console.filter(c => c.t === 'error').length === 0 && S.rec.prod.length === 0 && A.rec.prod.length === 0)
await S.ctx.close(); await A.ctx.close(); await browser.close(); summary()
