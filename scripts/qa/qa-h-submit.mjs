// QA H1 — 학생이 실제 UI 로 위치 이동 / 정보 수정 / 폐기 신청 3종 제출 (QA-FINAL 시약·병만 사용). 승인은 qa-h-approve.mjs.
import { browserLaunch, session, ok, note, summary, shot, studentLogin, waitList, BASE } from './lib.mjs'
const browser = await browserLaunch(process.env.QA_HEADED === '1', process.env.QA_HEADED === '1' ? 120 : 0)
const S = await session(browser, { w: 1440, h: 900 })
const { page, rec } = S
const post = re => rec.net.filter(r => r.m === 'POST' && re.test(r.u)).length
const bodies = []
page.on('request', q => { if (q.method() === 'POST' && /rpc\/(location_request_submit|reagent_change_request_submit|disposal_request_submit)/.test(q.url())) bodies.push({ fn: q.url().split('/rpc/')[1].split('?')[0], body: JSON.parse(q.postData() || '{}') }) })
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
const openByName = async name => {
  await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(name)}`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  const p = await page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 } })
  await page.mouse.click(p.x, p.y); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1200)
}

// ── 위치 이동 신청 (QA-MOVE-1: 위치A → 위치B), 제출 버튼 빠른 더블클릭 ──
await openByName('QA-FINAL Move reagent')
const lot = page.locator('[data-lot-id]').first()
ok('STEP10 detail shows the QA bottle at QA-FINAL-위치A', (await lot.innerText()).includes('QA-FINAL-위치A'))
await lot.getByRole('button', { name: /이 병 위치 변경 신청/ }).click()
const mv = page.getByRole('dialog', { name: '위치 변경 신청' })
await mv.locator('select').last().selectOption({ label: 'QA-FINAL-위치B' })
const sub = mv.getByRole('button', { name: '위치 변경 신청하기' })
await sub.click(); await sub.click({ force: true, timeout: 1500 }).catch(() => {})
await page.getByText('위치 변경 신청이 완료되었습니다.').first().waitFor({ timeout: 15000 }); await page.waitForTimeout(1000)
ok('STEP10 student 위치 이동 신청 submitted; rapid double-click → exactly 1 location_request_submit call', post(/rpc\/location_request_submit/) === 1, post(/rpc\/location_request_submit/))
ok('STEP10 pending state visible on the bottle (검토 대기) — the bottle stays at 위치A until approved', (await page.locator('[data-lot-id]').first().innerText()).includes('QA-FINAL-위치A') && (await page.getByText('위치 변경 신청 완료 · 관리자 검토 대기').count()) >= 1)
await shot(page, 'H1-move-pending')

// ── 정보 수정 신청 (purity 90% → 95%, 국문명 변경) ──
await openByName('QA-FINAL Info reagent')
await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).click()
await page.locator('#master-purity').fill('95%')
await page.locator('#master-name_ko').fill('큐에이 정보 승인됨')
const es = page.getByRole('region', { name: '시약 기본정보 수정' }).getByRole('button', { name: /^수정 신청/ })
await es.click(); await es.click({ force: true, timeout: 1500 }).catch(() => {})
await page.getByText('시약정보 수정 신청이 완료되었습니다.').first().waitFor({ timeout: 15000 }); await page.waitForTimeout(1000)
ok('STEP11 student 정보 수정 신청: only the 2 changed fields submitted (purity, name_ko); rapid double-click did not duplicate', post(/rpc\/reagent_change_request_submit/) === 2, post(/rpc\/reagent_change_request_submit/))

// ── 폐기 신청 (QA-DISP-1 한 병) ──
await openByName('QA-FINAL Dispose reagent')
const d1 = page.locator('[data-lot-id]', { hasText: 'QA-DISP-1' })
await d1.getByRole('button', { name: /이 병 폐기 신청/ }).click()
const dd = page.getByRole('dialog', { name: '폐기 신청' })
ok('STEP12 disposal modal is per bottle (1병 단위) with the chosen bottle preselected', (await dd.innerText()).includes('이 병 1개에 대한 폐기 신청') && (await dd.locator('select').inputValue()) !== '')
await dd.locator('textarea').fill('QA 최종 폐기 승인 E2E')
const ds = dd.getByRole('button', { name: '1병 폐기 신청하기' })
await ds.click(); await ds.click({ force: true, timeout: 1500 }).catch(() => {})
await page.getByText('폐기 신청이 완료되었습니다.').first().waitFor({ timeout: 15000 }); await page.waitForTimeout(1000)
ok('STEP12 student 1병 폐기 신청 submitted; rapid double-click → exactly 1 disposal_request_submit call; both bottles still 보유중', post(/rpc\/disposal_request_submit/) === 1 && (await page.getByText('보유중').count()) >= 2, post(/rpc\/disposal_request_submit/))
await shot(page, 'H1-disposal-pending')

const idKeys = bodies.filter(b => Object.keys(b.body).some(k => /student|requested_by|user|name/i.test(k) && k !== 'p_field_name'))
ok('STEP13 student identity is server-resolved: submit RPC payloads carry only session token + target ids/values (no student id / name / requester fields)', bodies.length >= 4 && idKeys.length === 0 && bodies.every(b => b.body.p_session_token), bodies.map(b => b.fn + ':' + Object.keys(b.body).join(',')))
ok('student submissions: console clean, no page errors, no production', rec.errors.length === 0 && rec.console.filter(c => c.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 3) })
await S.ctx.close(); await browser.close(); summary()
