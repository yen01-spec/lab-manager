// QA E — badge/grouping(18,19), manufacturer picker(20), 시약목록 통합 액션허브(21), breadcrumb(22),
// 자료실 CMS(RES), 구 라우트 redirect(RED), mobile detail(23), breadcrumb touch target(24) — 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, overflowX, crumbText, resultCount, waitList, studentLogin, adminLogin, BASE } from './lib.mjs'

const headed = process.env.QA_HEADED === '1'
const browser = await browserLaunch(headed, headed ? 120 : 0)
const vrow = (page) => page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2), [data-index] span')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 && r.width > 0 }); const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })
const rowByName = (page, name) => page.locator('tbody tr', { hasText: name }).first()

// ═══ STEP18/19 badge + grouping (데스크톱 1440, 모바일 390) ═══
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`, mobile = w < 768
  const { ctx, page, rec } = await session(browser, { w, h })
  const go = async q => { await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page); await page.waitForTimeout(500) }
  // A. 1병
  await go('Bromothymol'); const tA = await page.locator('main').innerText()
  ok(`[${tag}] STEP18-A 1 bottle (Bromothymol blue): desktop = no summary badge + stock "미개봉 1병 / 잔량 100%"; mobile card = "보유 1병 · 잔량 100%"`, mobile ? /보유 1병 · 잔량 100%/.test(tA) : (!/보유 \d+병/.test(tA) && /미개봉 1병\s*\/\s*잔량 100%/.test(tA)), tA.slice(tA.indexOf('Bromothymol') - 20, tA.indexOf('Bromothymol') + 120).replace(/\n/g, ' | '))
  // B/C. 여러 병 + 여러 위치 (E004 QA compound: 필러 중 i%4===0 & i%5!==0 → 묶이지 않는 단일 시약에 정상 병 2개, 위치 2곳)
  // ※ Acetone은 원래 다른 QA 스위트(qa-c-detail)가 새 Lot을 추가해줘야 2병이 됐다 — qa-e-ui.mjs 단독 실행 시엔 fixture 그대로 1병뿐이라 이 스텝만으로는 깨졌다(순서 의존 stale 케이스). 자기 완결적인 필러로 교체.
  await go('E004 QA compound'); const tB = await page.locator('main').innerText()
  ok(`[${tag}] STEP18-B/C several bottles in several places (E004 QA compound): "보유 2병 · 2개 위치" in one neutral badge`, tB.includes('보유 2병 · 2개 위치'), tB.slice(0, 60))
  // D. 여러 제조사 + 같은 이름 그룹
  await go('Ethanol'); const tD = await page.locator('main').innerText()
  await shot(page, `E-${tag}-ethanol-group`)
  ok(`[${tag}] STEP18-D/19 same-name masters (Ethanol x3): desktop = one group header "보유 4병 · 3개 위치" + "제조사 3곳"; mobile = 3 separate cards each with its manufacturer; NO "제품 N개"`, (mobile ? ((tD.match(/Ethanol/g) || []).length >= 3 && ['Samchun', 'Daejung', 'Duksan'].every(m => tD.includes(m))) : (tD.includes('보유 4병 · 3개 위치') && tD.includes('제조사 3곳'))) && !/\d+개 제품/.test(tD), tD.slice(tD.indexOf('Ethanol') - 5, tD.indexOf('Ethanol') + 90).replace(/\n/g, ' | '))
  if (!mobile) {
    const btn = page.getByRole('button', { name: /Ethanol 제품별로 펼치기/ })
    ok(`[${tag}] STEP19 expand affordance is a real button with aria-expanded=false`, (await btn.getAttribute('aria-expanded')) === 'false')
    await btn.click(); await page.waitForTimeout(400)
    const tE = await page.locator('main').innerText()
    ok(`[${tag}] STEP19 expanded: one row per master with its own manufacturer (Samchun / Daejung / Duksan) — not a merged record`, ['Samchun', 'Daejung', 'Duksan'].every(m => tE.includes(m)) && (await page.getByRole('button', { name: /Ethanol 제품별로 접기/ }).getAttribute('aria-expanded')) === 'true')
    await shot(page, `E-${tag}-ethanol-expanded`)
    await page.getByRole('button', { name: /Ethanol 제품별로 접기/ }).click()
    ok(`[${tag}] STEP19 collapse works`, (await page.getByRole('button', { name: /Ethanol 제품별로 펼치기/ }).count()) === 1)
    // Acetic acid 두 master
    await go('Acetic acid'); const tG = await page.locator('main').innerText()
    ok(`[${tag}] STEP19 second real group (Acetic acid ×2): "보유 4병 · 3개 위치" + "제조사 2곳"`, tG.includes('보유 4병 · 3개 위치') && tG.includes('제조사 2곳'), tG.slice(tG.indexOf('Acetic acid'), tG.indexOf('Acetic acid') + 90).replace(/\n/g, ' | '))
  }
  // E. 재고 부족 + neutral vs warning 색
  await go('Acridine'); const tE2 = await page.locator('main').innerText()
  const cols = await page.evaluate(() => { const g = t => [...document.querySelectorAll('[data-badge]')].find(e => e.textContent.trim() === t); return { warn: g('재고 부족') ? getComputedStyle(g('재고 부족')).backgroundColor : null } })
  await go('A000'); const tS = await page.evaluate(() => { const g = t => [...document.querySelectorAll('[data-badge]')].find(e => e.textContent.trim().startsWith(t)); return g('보유 ') ? getComputedStyle(g('보유 ')).backgroundColor : null })
  ok(`[${tag}] STEP18-E "재고 부족" warning badge (Acridine orange: opened bottle at 15%) — red tint (desktop: differs from the grey neutral summary badge)`, tE2.includes('재고 부족') && cols.warn && (mobile || (tS && cols.warn !== tS)), { warn: cols.warn, neutral: tS })
  await shot(page, `E-${tag}-lowstock`)
  ok(`[${tag}] badge screens: no horizontal overflow, no page/console errors`, (await overflowX(page)) <= 0 && rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0, { ox: await overflowX(page), c: rec.console.slice(0, 3) })
  ok(`[${tag}] no production contact`, rec.prod.length === 0)
  await ctx.close()
}

// ═══ STEP20 Manufacturer picker ═══
for (const [w, h] of [[1366, 768], [1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await page.getByRole('button', { name: /신규 시약 등록/ }).click()
  const company = page.locator('label:has-text("제조사") + div input').first()
  await company.waitFor({ timeout: 15000 }); await company.click()
  await page.getByTestId('company-picker-popup').waitFor()
  const m = await page.evaluate(() => { const p = document.querySelector('[data-testid="company-picker-popup"]'); const r = p.getBoundingClientRect(); const b = [...p.querySelectorAll('button')].map(x => x.getBoundingClientRect()); const top = document.elementFromPoint(r.left + r.width / 2, r.top + 30); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight, n: b.length, minH: Math.round(Math.min(...b.map(x => x.height))), minW: Math.round(Math.min(...b.map(x => x.width))), onTop: p.contains(top) } })
  await shot(page, `E-${tag}-picker`)
  ok(`[${tag}] STEP20 real RegisterReagentModal: popup fully inside the viewport, on top of the modal, 10 logos with ≥44px targets`, m.l >= 0 && m.r <= m.vw && m.t >= 0 && m.b <= m.vh && m.onTop && m.n === 10 && m.minH >= 44 && m.minW >= 44, m)
  // 오른쪽 끝/아래 끝으로 옮겨서
  await page.keyboard.press('Escape')
  await page.evaluate(() => { const inp = [...document.querySelectorAll('label')].find(l => l.textContent.includes('제조사')).nextElementSibling; inp.style.cssText = 'position:fixed;right:0;top:120px;width:150px;z-index:2000' })
  await company.click(); await page.getByTestId('company-picker-popup').waitFor(); await page.waitForTimeout(150)
  const r2 = await page.evaluate(() => { const r = document.querySelector('[data-testid="company-picker-popup"]').getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth } })
  ok(`[${tag}] STEP20 input at the far right edge → popup clamps inside the viewport`, r2.l >= 0 && r2.r <= r2.vw, r2)
  await page.keyboard.press('Escape')
  await page.evaluate(h => { const inp = [...document.querySelectorAll('label')].find(l => l.textContent.includes('제조사')).nextElementSibling; inp.style.cssText = `position:fixed;left:8px;top:${h - 60}px;width:150px;z-index:2000` }, h)
  await company.click(); await page.getByTestId('company-picker-popup').waitFor(); await page.waitForTimeout(150)
  const r3 = await page.evaluate(() => { const r = document.querySelector('[data-testid="company-picker-popup"]').getBoundingClientRect(); return { t: r.top, b: r.bottom, vh: innerHeight } })
  ok(`[${tag}] STEP20 input near the bottom → popup opens upward inside the viewport`, r3.t >= 0 && r3.b <= r3.vh, r3)
  // click reopen + 키보드
  await page.getByTestId('company-picker-popup').getByRole('button', { name: 'Samchun' }).click()
  ok(`[${tag}] STEP20 picking fills the name, closes, and returns focus to the input`, (await company.inputValue()) === 'Samchun' && (await page.getByTestId('company-picker-popup').count()) === 0 && await page.evaluate(() => document.activeElement?.tagName === 'INPUT'))
  await company.click()
  ok(`[${tag}] STEP20 clicking the already-focused input reopens the popup`, (await page.getByTestId('company-picker-popup').count()) === 1)
  await company.press('ArrowDown'); await page.waitForTimeout(200)
  const f1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.keyboard.press('ArrowRight'); const f2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.keyboard.press('Enter'); await page.waitForTimeout(200)
  ok(`[${tag}] STEP20 keyboard: ↓ from the input focuses the first logo, → moves, Enter picks (${f1} → ${f2}), popup closes, focus back in input`, f1 === 'Samchun' && f2 === 'Sigma-Aldrich' && (await company.inputValue()) === 'Sigma-Aldrich' && (await page.getByTestId('company-picker-popup').count()) === 0)
  await company.press('ArrowDown'); await page.keyboard.press('Escape')
  ok(`[${tag}] STEP20 Esc inside the popup closes it and returns focus to the input`, (await page.getByTestId('company-picker-popup').count()) === 0 && await page.evaluate(() => document.activeElement?.tagName === 'INPUT'))
  ok(`[${tag}] picker: no horizontal overflow; no page/console errors; no production contact`, (await overflowX(page)) <= 0 && rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 3) })
  await ctx.close()
}

// ═══ STEP21 시약 목록 = 단일 관리 허브 (학생 세션, 실제 QA 데이터, /reagents/list) ═══
// "시약 일괄정리" 페이지는 폐지됐다 — 체크박스="이 시약을 작업 대상으로 선택"(reagents.id) 뿐이고
// 무엇에 쓸지는 선택 후 액션바에서 고른다. 위치이동/폐기는 2단계 병(reagent_lots.id) 선택
// (LotSelectionDialog), 정보수정은 1종=상세페이지 재사용/여러종=순차 큐(MultiReagentEditQueue).
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  const openList = async () => { await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page) }
  const box = () => page.getByPlaceholder(/시약명.*(국문|CAS)/).first()
  const search = async q => { await box().fill(q); await box().press('Enter'); await page.waitForTimeout(600) }
  const pick = name => page.locator(`input[aria-label="${name} 선택 목록에 담기"]`).first()
  const countText = () => page.getByText(/종 선택됨/).first().innerText()

  await openList()
  ok('STEP21 with nothing selected there is no action bar', (await page.getByText(/종 선택됨/).count()) === 0)

  // ── B/C 선택 semantics + 액션바(자연스러운 일괄, 별도 "일괄 모드" 없음) ──
  await search('Benzene'); await pick('Benzene').check(); await page.waitForTimeout(300)
  ok('STEP21-B checking one reagent → "1종 선택됨" (reagent-master identity, not a bottle count)', /1종 선택됨/.test(await countText()))
  ok('STEP21-C action bar: 구매요청/위치 이동/폐기/정보 수정/Excel/선택 해제 — no separate bulk mode', (await page.getByRole('button', { name: /구매요청/ }).count()) === 1 && (await page.getByRole('button', { name: /위치 이동/ }).count()) === 1 && (await page.getByRole('button', { name: /🗑️ 폐기/ }).count()) === 1 && (await page.getByRole('button', { name: /정보 수정/ }).count()) === 1 && (await page.getByRole('button', { name: /Excel 내보내기/ }).count()) === 1 && (await page.getByRole('button', { name: '선택 해제' }).count()) === 1)

  // ── G/H 필터 변경 후 선택 유지 + 숨김 선택 안내 ──
  await search('Iron(III) chloride'); await pick('Iron(III) chloride').check(); await page.waitForTimeout(300)
  const withHidden = await countText()
  ok('STEP21-G/H filtering to "Iron(III) chloride" hides the earlier Benzene pick but keeps it selected (2종 선택됨 · 1종 숨김)', /2종 선택됨/.test(withHidden) && /현재 필터에서 1종 숨김/.test(withHidden), withHidden)
  await search(''); await page.waitForTimeout(400)
  ok('STEP21 clearing the filter restores visibility (hidden note gone), selection still 2', /2종 선택됨/.test(await countText()) && !/현재 필터에서/.test(await countText()))
  await page.getByRole('button', { name: '선택 해제' }).click(); await page.waitForTimeout(300)
  ok('STEP21 선택 해제 clears the action bar', (await page.getByText(/종 선택됨/).count()) === 0)

  // ── E 구매요청: reagent-level prefill, no Lot picker ──
  await search('Benzene'); await pick('Benzene').check(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: /구매요청/ }).click()
  await page.waitForURL(/\/purchase-request/, { timeout: 15000 })
  ok('STEP21-E 구매요청 goes straight to the prefilled purchase request (no Lot picker) and is prefilled with the reagent name', new URL(page.url()).pathname === '/purchase-request' && (await page.locator('main').innerText()).includes('Benzene'))

  // ── G/H(Lot) 위치 이동 — 같은 이름 그룹(Acetic acid, 펼쳐서 개별 선택) + 묶음 행(Sodium chloride, 가드) ──
  await openList()
  await search('Acetic acid')
  const expandBtn = page.getByRole('button', { name: /Acetic acid 제품별로 펼치기/ })
  await expandBtn.waitFor({ timeout: 15000 }); await expandBtn.click(); await page.waitForTimeout(300)
  const daejungRow = page.locator('tr', { hasText: 'Acetic acid' }).filter({ hasText: 'Daejung' }).first()
  await daejungRow.locator('input[type=checkbox]').check()
  await search('Sodium chloride'); await pick('Sodium chloride').check(); await page.waitForTimeout(300)
  ok('STEP21 selection across a filter change: Acetic acid(Daejung, hidden by "Sodium chloride" filter) + Sodium chloride = 2종 선택됨', /2종 선택됨/.test(await countText()))
  let netBefore = rec.net.length
  await page.getByRole('button', { name: /위치 이동/ }).click()
  const moveDlg = page.getByRole('dialog', { name: '병 선택 — 위치 이동' })
  await moveDlg.waitFor({ timeout: 15000 }); await moveDlg.locator('[data-lot-id]').first().waitFor({ timeout: 15000 })
  await shot(page, 'E-1440x900-lot-move-dialog')
  const sameLotRows = moveDlg.locator('[data-lot-id]', { hasText: 'QA-SAME' })
  ok('STEP21-G/H dialog lists real bottles (reagent_lots.id), not the reagents themselves; same Lot No. (QA-SAME ×2) → two independent checkboxes', (await sameLotRows.count()) === 2)
  const groupedRow = moveDlg.locator('[data-lot-id]', { hasText: 'QA-GROUPED' })
  ok('STEP21-G grouped row (sealed_count>1, Sodium chloride) is fail-closed: disabled and NOT auto-selected just from picking the reagent', await groupedRow.locator('input[type=checkbox]').isDisabled() && !(await groupedRow.locator('input[type=checkbox]').isChecked()))
  await sameLotRows.nth(0).locator('input[type=checkbox]').check()
  ok('STEP21 checking bottle 1 (QA-SAME) does not check its same-lot-no sibling; selected-count = 1', !(await sameLotRows.nth(1).locator('input[type=checkbox]').isChecked()) && (await moveDlg.getByTestId('lot-selected-count').innerText()).includes('선택된 1개 병'))
  // 1단계 버튼("선택한 N병 위치 변경 신청")은 실제 제출이 아니라 BulkMoveModal(위치 선택 폼)을 연다 — 실제 제출은 그 폼의 "위치 변경 신청" 버튼.
  await moveDlg.getByRole('button', { name: /선택한 1병 위치 변경/ }).click()
  const moveSubmit = page.getByRole('button', { name: '위치 변경 신청', exact: true })
  await moveSubmit.waitFor({ timeout: 10000 })
  await page.locator('select').last().selectOption({ label: 'QA-냉장실' })
  await page.waitForTimeout(200)
  await moveSubmit.click(); await moveSubmit.click({ force: true }).catch(() => {}); await moveSubmit.click({ force: true }).catch(() => {})
  await moveDlg.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
  const moveWrites = rec.net.slice(netBefore).filter(r => r.m === 'POST' && /rpc\/(location_request_submit|adminMoveLots|admin_move_lots)/i.test(r.u))
  const moveOk = moveWrites.filter(r => r.s === 200)
  // 프론트가 제출 버튼을 busy 동안 disable하지 않아 3번 다 서버로 나가지만, 서버(partial unique index)가
  // 두 번째부터 409로 거부해 실제 성공(200)은 1회뿐 — "의도된 단일 쓰기 1회"라는 목표는 달성된다.
  ok(`STEP21-S rapid triple-click on the move submit ("위치 변경 신청") → exactly 1 successful (200) write, others rejected by server-side idempotency (${JSON.stringify(moveWrites.map(r => r.s))})`, moveOk.length === 1, moveWrites)

  // ── I 폐기 — 시약 체크만으로 병 전체가 자동 대상이 되지 않음, 명시적 병 선택 필요 ──
  await openList(); await search('Thymolphthalein'); await pick('Thymolphthalein').check(); await page.waitForTimeout(300)
  netBefore = rec.net.length
  await page.getByRole('button', { name: /🗑️ 폐기/ }).click()
  const dispDlg = page.getByRole('dialog', { name: '병 선택 — 폐기' })
  await dispDlg.waitFor({ timeout: 15000 }); await dispDlg.locator('[data-lot-id]').first().waitFor({ timeout: 15000 })
  ok('STEP21-I disposal dialog opens with nothing pre-checked', (await dispDlg.getByTestId('lot-selected-count').innerText()).includes('선택된 0개 병'))
  const dispSubmit = dispDlg.getByRole('button', { name: /선택한 0병/ })
  ok('STEP21-I submit disabled until a bottle is explicitly checked', await dispSubmit.isDisabled())
  await dispDlg.locator('[data-lot-id] input[type=checkbox]').first().check()
  const dispOpen1 = dispDlg.getByRole('button', { name: /선택한 1병/ })
  ok('STEP21-I after checking one bottle the button enables and is scoped to that one bottle', await dispOpen1.isEnabled())
  await dispOpen1.click()
  const reasonInput = page.getByPlaceholder(/유효기간 만료/)
  await reasonInput.waitFor({ timeout: 10000 })
  await reasonInput.fill('QA 실브라우저 검증 — 폐기 신청 사유')
  const dispSubmitFinal = page.getByRole('button', { name: '폐기 신청하기' })
  await dispSubmitFinal.click(); await dispSubmitFinal.click({ force: true }).catch(() => {}); await dispSubmitFinal.click({ force: true }).catch(() => {})
  await dispDlg.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
  const dispWrites = rec.net.slice(netBefore).filter(r => r.m === 'POST' && /rpc\/(disposal_request_submit|adminDisposeLots|admin_dispose_lots)/i.test(r.u))
  const dispOk = dispWrites.filter(r => r.s === 200)
  ok(`STEP21-S rapid triple-click on the dispose submit ("폐기 신청하기") → exactly 1 successful (200) write, others rejected by server-side idempotency (${JSON.stringify(dispWrites.map(r => r.s))})`, dispOk.length === 1, dispWrites)

  // ── J/K 정보 수정 — 1종=상세페이지 기존 편집 폼 재사용, 여러 종=순차 큐 ──
  await openList(); await search('Benzene'); await pick('Benzene').check(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: /정보 수정/ }).click()
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 })
  ok('STEP21-J 1종 선택 정보 수정 → 시약 상세페이지의 기존 편집 폼(별도 새 editor 없음), 자동 편집모드', await page.getByRole('region', { name: '시약 기본정보 수정' }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false))
  await openList(); await search('tert-Butanol'); await pick('tert-Butanol').check()
  await search('n-Hexane'); await pick('n-Hexane').check(); await page.waitForTimeout(300)
  await page.getByRole('button', { name: /정보 수정/ }).click()
  const editQ = page.getByRole('dialog', { name: '여러 시약 정보 수정' })
  await editQ.waitFor({ timeout: 15000 })
  await editQ.getByLabel('국문 시약명').waitFor({ timeout: 15000 }) // 첫 시약(reagents.*) 비동기 로드 대기 — 로딩 중엔 필드 그리드가 아직 없음
  ok('STEP21-K multi-select 정보 수정 opens a sequential queue "1 / 2" (no unsafe bulk-update RPC), same field form reused', (await editQ.locator('span', { hasText: '1 / 2' }).count()) === 1 && (await editQ.getByLabel('국문 시약명').count()) === 1)
  await editQ.getByRole('button', { name: '건너뛰기' }).click(); await page.waitForTimeout(300)
  ok('STEP21-K advances to "2 / 2" after skipping the first', (await editQ.locator('span', { hasText: '2 / 2' }).count()) === 1)
  await editQ.getByRole('button', { name: '건너뛰기' }).click().catch(() => {})

  // ── F Excel 선택 내보내기 ──
  await openList(); await search('D-Glucose'); await pick('D-Glucose').check(); await page.waitForTimeout(300)
  const dl = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', { name: /Excel 내보내기/ }).click()
  const download = await dl.catch(() => null)
  ok('STEP21-F 선택 항목 Excel 내보내기 triggers a file download', !!download, download?.suggestedFilename())

  // ── A A–Z 점프 (canonical /reagents/list, data-index virtual row) ──
  await openList()
  await page.locator('button', { hasText: /^M$/ }).first().click(); await page.waitForTimeout(700)
  const mTop = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-index]')]
    const hdr = els.find(e => e.textContent.trim() === 'M')
    return hdr ? hdr.getBoundingClientRect().top : -1
  })
  ok(`STEP21-A A–Z jump "M" lands the M letter header near the top (${Math.round(mTop)}px)`, mTop >= 0 && mTop < 300, mTop)

  // ── 일괄검색(batch search, 목록 필터와 동일) ──
  await openList()
  await page.getByRole('button', { name: /📋 시약 일괄 검색/ }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('아세톤\nBenzene')
  await page.getByRole('dialog').getByRole('button', { name: '조회' }).click()
  await page.getByTestId('batch-bar').waitFor({ timeout: 10000 })
  ok('STEP21 batch search narrows the SAME reagent list (not a separate page)', /입력 2개/.test(await page.getByTestId('batch-summary').innerText()))

  // "flushSync was called from inside a lifecycle method"은 A–Z 점프(virtualizer.scrollToIndex)가
  // Vite dev 서버의 @vite/client(HMR) 코드에서 트리거하는 dev-only 경고(원본 위치가 앱 코드가 아니라
  // @vite/client) — StrictMode 이중 effect처럼 dev에서만 나고 production build(vite build)엔 없다.
  const KNOWN_DEV_ONLY = /flushSync was called from inside a lifecycle method/
  const realConsoleErrors = rec.console.filter(x => x.t === 'error' && !KNOWN_DEV_ONLY.test(x.x))
  const devOnlyNoise = rec.console.filter(x => x.t === 'error' && KNOWN_DEV_ONLY.test(x.x))
  if (devOnlyNoise.length) note('STEP21 dev-only noise filtered out of the console-error check (A–Z jump → @vite/client HMR + react-virtual scrollToIndex, not present in a production build)', { count: devOnlyNoise.length })
  ok('STEP21 no page/console errors across the whole action-hub flow', rec.errors.length === 0 && realConsoleErrors.length === 0, { errors: rec.errors.slice(0, 3), console: realConsoleErrors.slice(0, 5) })
  ok('STEP21 no production contact', rec.prod.length === 0)
  await ctx.close()
}

// ═══ STEP21-mobile 선택 bottom sheet + Lot picker (표시만, 실제 제출은 desktop 패스에서 이미 확인) ═══
{
  const { ctx, page, rec } = await session(browser, { w: 390, h: 844 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  const box = page.getByPlaceholder(/시약명.*(국문|CAS)/).first()
  await box.fill('Benzene'); await box.press('Enter'); await page.waitForTimeout(600)
  await page.locator('input[aria-label="Benzene 선택 목록에 담기"]').first().check(); await page.waitForTimeout(300)
  ok('STEP21-mobile "작업 선택" button opens a bottom-sheet dialog with the actions (no separate bulk page)', (await page.getByRole('button', { name: '작업 선택' }).count()) === 1)
  await page.getByRole('button', { name: '작업 선택' }).click()
  const sheet = page.getByRole('dialog', { name: '선택한 시약 작업' })
  await sheet.waitFor({ timeout: 10000 })
  await shot(page, 'E-390x844-action-sheet')
  ok('STEP21-mobile sheet lists 구매요청/위치 이동/폐기/정보 수정/선택 목록/Excel + 선택 해제, inside the viewport', (await sheet.getByText(/구매요청/).count()) === 1 && (await sheet.getByText(/위치 이동/).count()) === 1 && (await sheet.getByText(/🗑️ 폐기/).count()) === 1 && (await sheet.getByText(/정보 수정/).count()) === 1 && (await sheet.getByText('선택 해제').count()) === 1 && (await overflowX(page)) <= 0)
  await sheet.getByText(/위치 이동/).click()
  const moveDlg = page.getByRole('dialog', { name: '병 선택 — 위치 이동' })
  await moveDlg.waitFor({ timeout: 15000 })
  ok('STEP21-mobile Lot picker dialog fits the viewport, no overflow', (await overflowX(page)) <= 0)
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByRole('button', { name: '취소', exact: true }).first().click().catch(() => {})
  ok('STEP21-mobile: no console/production issues', rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0)
  await ctx.close()
}

// ═══ STEP22 Breadcrumb 전 페이지 ═══
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  // /reagents/bulk-edit, /notices(+:id), /safety(+:id) 는 이제 화면이 아니라 redirect 뿐이라 여기서
  // breadcrumb 텍스트로 확인하지 않는다 — STEP-REDIRECTS 블록에서 replace 시맨틱까지 따로 검증한다.
  const checks = [['/', '홈'], ['/reagents/list', '홈 › 시약 목록'], ['/reagents/locations', '홈 › 시약장 위치'], ['/inventory', '홈 › 재고 실사'], ['/purchase-request', '홈 › 구매요청서'], ['/purchase-request/list', '홈 › 구매요청서 › 목록'], ['/resources', '홈 › 자료실'], ['/safety-signage', '홈 › 자료실 › 표지·대장 준비 도구']]
  for (const [path, want] of checks) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await page.locator('nav[aria-label="현재 위치"]').waitFor({ timeout: 20000 })
    const tx = await crumbText(page)
    const cur = await page.locator('nav[aria-label="현재 위치"] [aria-current="page"]').count()
    ok(`STEP22 ${path}: "${want}" (no "홈 › 홈", aria-current on the last item)`, tx === want && cur === 1 && !tx.includes('홈 › 홈') && !tx.includes('시약 관리'), tx)
  }
  // 상세
  await page.goto(`${BASE}/reagents/list?q=Acetone`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  const p = await vrow(page); await page.mouse.click(p.x, p.y); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/)
  await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '시약 목록' }).waitFor()
  ok('STEP22 reagent detail: 홈 › 시약 목록 › Acetone; both intermediate crumbs are links', (await crumbText(page)) === '홈 › 시약 목록 › Acetone' && (await page.locator('nav[aria-label="현재 위치"] a').count()) === 2)
  await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '홈' }).click(); await page.waitForURL(BASE + '/')
  ok('STEP22 Home crumb navigates to "/"', new URL(page.url()).pathname === '/')
  await page.goto(BASE + '/purchase-request/list', { waitUntil: 'domcontentloaded' }); await page.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '구매요청서' }).click()
  ok('STEP22 intermediate crumb (구매요청서) goes to its real route /purchase-request', new URL(page.url()).pathname === '/purchase-request')
  ok('STEP22 breadcrumb pages: console clean, no production', rec.errors.length === 0 && rec.prod.length === 0, { e: rec.errors, c: rec.console.filter(x => x.t === 'error').slice(0, 3) })
  await ctx.close()
}
// admin breadcrumb
{
  const { ctx, page } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await adminLogin(page)
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' }); await page.locator('nav[aria-label="현재 위치"]').waitFor({ timeout: 20000 })
  ok('STEP22 /admin: "홈 › 관리자"', (await crumbText(page)) === '홈 › 관리자', await crumbText(page))
  await ctx.close()
}

// ═══ STEP-REDIRECTS 퇴역 라우트 5개 — replace 시맨틱(back 한 번에 옛 경로를 다시 거치지 않음) ═══
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  const routes = [
    ['/reagents/bulk-edit', '/reagents/list'],
    ['/notices', '/resources'],
    ['/notices/00000000-0000-0000-0000-000000000000', '/resources'],
    ['/safety', '/resources'],
    ['/safety/00000000-0000-0000-0000-000000000000', '/resources'],
  ]
  // history.length의 절대값 증가분(delta)은 이전 iteration이 남긴 forward-history가 다음 goto에서
  // truncate+push되며 상쇄될 수 있어 신뢰할 수 없다(직접 측정해서 확인함) — 대신 "back 한 번에 죽은
  // 경로를 다시 들르지 않고 바로 그 이전 페이지(/)로 간다"는 동작 자체가 replace의 직접적 증거다:
  // push였다면 back 한 번은 여전히 /notices 등에 내려앉고(그 즉시 /resources로 재-redirect), '/'로
  // 바로 가지 않는다.
  for (const [from, to] of routes) {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.goto(BASE + from, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(u => new URL(u).pathname === to, { timeout: 15000 })
    ok(`STEP-REDIRECTS ${from} → ${to}`, new URL(page.url()).pathname === to, page.url())
    await page.goBack()
    await page.waitForTimeout(500)
    ok(`STEP-REDIRECTS back navigation from ${to} goes straight to "/" in one step (replace semantics — the retired ${from} entry was never pushed, so back doesn't re-visit it)`, new URL(page.url()).pathname === '/', page.url())
  }
  ok('STEP-REDIRECTS: no console/production issues', rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0)
  await ctx.close()
}

// ═══ STEP-RESOURCES 자료실 CMS 정본 구조(/resources) — DB 기반, 학생 세션 ═══
{
  const { ctx, page, rec } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(500)
  const tablist = page.getByRole('tablist', { name: '자료실 탭' })
  const tabNames = await tablist.getByRole('tab').allInnerTexts()
  ok('STEP-RESOURCES 첫 화면: 합성 "전체" 탭 + 실제 DB 탭들, role=tablist/tab', tabNames[0] === '전체' && tabNames.length >= 2, tabNames)
  const allCards = await page.locator('section[aria-labelledby^="article-"]').count()
  ok(`STEP-RESOURCES "전체" 탭에 DB의 모든 글이 보임 (${allCards}개)`, allCards > 0, allCards)

  // 카드 필드 — 최소 1개 카드에서 각 필드가 실제로 렌더되는지(있는 카드가 있다는 전제로 존재성만 확인)
  const firstCard = page.locator('section[aria-labelledby^="article-"]').first()
  ok('STEP-RESOURCES 카드: 제목(h2) 존재', (await firstCard.locator('h2').count()) === 1)
  ok('STEP-RESOURCES 카드: 첨부파일 섹션("첨부파일" 라벨) 존재', (await firstCard.getByText('첨부파일', { exact: true }).count()) === 1)
  const withAudience = page.locator('section[aria-labelledby^="article-"]', { hasText: '누가' })
  ok('STEP-RESOURCES 최소 1개 카드에 "누가"/"언제" 필드가 보임', (await withAudience.count()) > 0)
  const withSteps = page.locator('section[aria-labelledby^="article-"]', { hasText: '해야 할 일' })
  ok('STEP-RESOURCES 최소 1개 카드에 "해야 할 일"(steps) 목록이 보임', (await withSteps.count()) > 0)
  // link_label은 글마다 커스텀 문구일 수 있지만("학교 시스템 열기 ↗" 등) 항상 →(내부) 또는 ↗(외부)로 끝난다(ResourceArticleCard.jsx).
  const withLink = page.locator('section[aria-labelledby^="article-"] button', { hasText: /→|↗/ })
  ok('STEP-RESOURCES 최소 1개 카드에 관련 링크 버튼이 보임', (await withLink.count()) > 0)

  // 탭 전환
  const secondTabName = tabNames[1]
  await tablist.getByRole('tab', { name: secondTabName, exact: true }).click()
  await page.waitForTimeout(500)
  ok(`STEP-RESOURCES 탭 전환("${secondTabName}") 후 aria-selected 갱신 + 카드 수가 "전체"보다 작거나 같음`, (await tablist.getByRole('tab', { name: secondTabName, exact: true }).getAttribute('aria-selected')) === 'true' && (await page.locator('section[aria-labelledby^="article-"]').count()) <= allCards)

  // 없어져야 할 것들
  const bodyText = await page.locator('main, #root, body').first().innerText()
  ok('STEP-RESOURCES "공지사항" UI가 자료실 안에 없음(공지 기능 자체가 퇴역)', !bodyText.includes('공지사항 게시판') && !bodyText.includes('공지사항 목록'))
  ok('STEP-RESOURCES "앱에서 준비하기" 같은 기능-런처 문구가 없음(자료실은 읽기 전용 안내실)', !bodyText.includes('앱에서 준비하기'))
  ok('STEP-RESOURCES 중첩 PillNav/이중 탭바가 없음(탭바는 하나(role=tablist)뿐)', (await page.getByRole('tablist').count()) === 1)
  ok('STEP-RESOURCES 시약 목록이 자료실 안에 임베드되어 있지 않음(체크박스/시약 검색창 없음)', (await page.locator('main input[type=checkbox]').count()) === 0)

  // 관리자 컨트롤 — 비관리자에게는 안 보임
  ok('STEP-RESOURCES 비관리자 세션에는 "탭 관리"/"+ 글 작성" 버튼이 없음', (await page.getByRole('button', { name: '탭 관리' }).count()) === 0 && (await page.getByRole('button', { name: '+ 글 작성' }).count()) === 0)

  ok('STEP-RESOURCES no overflow, console clean, no production contact', (await overflowX(page)) <= 0 && rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0)
  await ctx.close()
}

// ═══ STEP-RESOURCES-admin 관리자 컨트롤 존재(탭 관리/+ 글 작성 버튼) — 구체적 CRUD는 qa-resource-library.mjs ═══
{
  const { ctx, page } = await session(browser, { w: 1440, h: 900 })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await adminLogin(page)
  await page.goto(BASE + '/resources', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '자료실', level: 1 }).waitFor({ timeout: 20000 })
  await page.locator('section[aria-labelledby^="article-"]').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  ok('STEP-RESOURCES-admin 관리자 세션에는 "탭 관리" + "+ 글 작성" 버튼이 보임', (await page.getByRole('button', { name: '탭 관리' }).count()) === 1 && (await page.getByRole('button', { name: '+ 글 작성' }).count()) === 1, { tabMgr: await page.getByRole('button', { name: '탭 관리' }).count(), writeBtn: await page.getByRole('button', { name: '+ 글 작성' }).count() })
  await ctx.close()
}

// ═══ STEP23/24 모바일 상세 + 브레드크럼 터치 타깃 ═══
for (const [w, h] of [[390, 844], [360, 800]]) {
  const tag = `${w}x${h}`
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await studentLogin(page)
  // "Tris(hydroxymethyl)..."는 현재 staging에 없는 이름(현재 staging 실데이터 = QA 픽스처뿐, 전수조사
  // 300+ 데이터셋이 아님) — 긴 화학명 대표로 QA 픽스처 중 가장 긴 이름(N,N-Dimethylformamide)으로 교체.
  for (const q of ['N,N-Dimethylformamide', 'Acetone']) {
    await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page)
    await page.locator('[data-index] span').filter({ hasText: /Dimethylformamide|Acetone/ }).first().click()
    await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1000)
    const long = q.startsWith('N,N')
    await shot(page, `E-${tag}-detail-${long ? 'long' : 'acetone'}`)
    const vp = page.viewportSize()
    const acts = []
    for (const a of ['📦 새 Lot 추가', '📍 위치 변경 신청', '✏️ 정보 수정 신청', '⋯ 더보기']) { const b = page.getByRole('button', { name: a }); await b.scrollIntoViewIfNeeded(); const bb = await b.boundingBox(); acts.push(!!bb && bb.x >= -1 && bb.x + bb.width <= vp.width + 1) }
    ok(`[${tag}] STEP23 ${long ? 'long chemical name' : 'Acetone'}: no horizontal overflow; back button, breadcrumb and 4 actions inside the viewport`, (await overflowX(page)) <= 0 && acts.every(Boolean) && (await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).isVisible()), { ox: await overflowX(page), acts })
    await page.getByRole('button', { name: /더보기/ }).click()
    const mb = await page.getByRole('menu').boundingBox()
    ok(`[${tag}] STEP23 ${long ? 'long name: ' : ''}⋯ 더보기 menu stays inside the viewport`, mb.x >= 0 && mb.x + mb.width <= vp.width + 1 && mb.y >= 0 && mb.y + mb.height <= vp.height + 1, mb)
    await page.keyboard.press('Escape')
    // 병 카드/배지 줄바꿈
    const lots = await page.locator('[data-lot-id]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && e.scrollWidth <= e.clientWidth + 1 }))
    ok(`[${tag}] STEP23 ${long ? 'long name: ' : ''}bottle cards wrap (no clipped content)`, lots.every(Boolean), lots)
    // STEP24 터치 타깃
    const links = await page.locator('nav[aria-label="현재 위치"] a').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) } }))
    const navH = await page.locator('nav[aria-label="현재 위치"]').evaluate(e => Math.round(e.getBoundingClientRect().height))
    ok(`[${tag}] STEP24 breadcrumb link tap targets >= 44px tall (${links.map(l => l.h + 'px').join(', ')}); breadcrumb block height ${navH}px (short crumb = 28px, wrapped long name grows only by its extra lines)`, links.every(l => l.h >= 44) && navH <= (long ? 110 : 40), { links, navH })
  }
  ok(`[${tag}] mobile detail: console clean, no production`, rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0 && rec.prod.length === 0, { c: rec.console.slice(0, 3) })
  await ctx.close()
}
await browser.close()
summary()
