// QA B — 시약 일괄검색(STEP 6~8, 27) 실제 staging 브라우저
import { browserLaunch, session, ok, note, summary, shot, overflowX, resultCount, waitList, BASE } from './lib.mjs'

const headed = process.env.QA_HEADED === '1'
const browser = await browserLaunch(headed, headed ? 120 : 0)
const dialog = page => page.getByRole('dialog', { name: /시약 일괄 검색/ })
const idxReq = rec => rec.net.filter(r => r.m === 'GET' && /\/rest\/v1\/reagents\?/.test(r.u)).length
const counts = async page => { await page.waitForFunction(() => { const e = document.querySelector('[data-testid="batch-summary"]'); return e && !e.textContent.includes('…') }, null, { timeout: 15000 }).catch(() => {}); const t = (await page.getByTestId('batch-summary').innerText()).replace(/\s+/g, ' '); const m = t.match(/입력 (\d+)개 · 일치 시약 (\d+)개 · (\d+) Lot 표시 · 미확인 (\d+)개/); return m ? { input: +m[1], matched: +m[2], lots: +m[3], unmatched: +m[4] } : { text: t } }
const open = async page => { await page.getByRole('button', { name: /시약 일괄 검색/ }).first().click(); await dialog(page).waitFor() }
const apply = async (page, text) => { await open(page); await dialog(page).getByRole('textbox').fill(text); await dialog(page).getByRole('button', { name: '조회' }).click(); await dialog(page).waitFor({ state: 'hidden', timeout: 15000 }); await page.waitForTimeout(700) }
const INPUT = ['브로모티몰블루(BTB)', '티몰블루', '티몰프탈레인', 'Acetic acid', '64-19-7', '존재하지않는시약XYZ'].join('\n')

for (const [w, h] of [[1440, 900], [390, 844]]) {
  const tag = `${w}x${h}`, mobile = w < 768
  const { ctx, page, rec } = await session(browser, { w, h })
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  const total = await resultCount(page)
  await open(page)
  await shot(page, `B-${tag}-modal`)
  const bx = await dialog(page).boundingBox()
  ok(`[${tag}] STEP6 modal opens inside the viewport`, bx.x >= 0 && bx.x + bx.width <= w + 1 && bx.y >= 0 && bx.y + bx.height <= h + 1, bx)
  await page.keyboard.press('Escape')
  const reqBefore = idxReq(rec)
  await apply(page, INPUT)
  await shot(page, `B-${tag}-applied`)
  const c = await counts(page)
  const txt = await page.locator('main').innerText()
  ok(`[${tag}] STEP6 modal closed, NO separate result table; existing list is filtered`, (await dialog(page).count()) === 0 && !txt.includes('입력한 이름') && !/조회 결과 · 있음/.test(txt), await resultCount(page))
  ok(`[${tag}] OR matching: Bromothymol blue (via 괄호 fallback), Thymol blue, Thymolphthalein, both Acetic acid masters — and nothing else`, ['Bromothymol blue', 'Thymol blue', 'Thymolphthalein', 'Acetic acid'].every(n => txt.includes(n)) && !txt.includes('Acetone') && !txt.includes('A000 QA'), await resultCount(page))
  ok(`[${tag}] summary: 입력 6 · 일치 시약 5 · 7 Lot 표시 · 미확인 1 (8 after the QA-added Lot on Thymol blue)`, c.input === 6 && c.matched === 5 && c.lots >= 7 && c.unmatched === 1, c)
  ok(`[${tag}] chip "일괄검색 · 6개 입력" + clear (×) button with accessible name`, (await page.getByTestId('batch-bar').innerText()).includes('일괄검색 · 6개 입력') && (await page.getByRole('button', { name: '일괄검색 해제' }).count()) === 1)
  ok(`[${tag}] matched reagent listed once (grouped by name: 4 rows for 5 masters)`, (await resultCount(page)) === 4, await resultCount(page))
  await page.getByRole('button', { name: /미확인 1개 보기/ }).click()
  const panel = await page.getByTestId('unmatched-panel').innerText()
  ok(`[${tag}] "미확인 1개 보기" panel shows the unmatched input with neutral wording`, panel.includes('존재하지않는시약XYZ') && panel.includes('찾지 못한') && !panel.includes('없습니다'), panel)
  await shot(page, `B-${tag}-unmatched`)
  ok(`[${tag}] zero horizontal overflow (chip, summary, unmatched panel)`, (await overflowX(page)) <= 0, await overflowX(page))
  ok(`[${tag}] only the shared reagent index request was made (${idxReq(rec) - reqBefore} reagents GET) — not one per line`, idxReq(rec) - reqBefore <= 2, idxReq(rec) - reqBefore)

  // 20줄 → 네트워크 요청 수
  const twenty = Array.from({ length: 20 }, (_, i) => [`A${String(i * 26).padStart(3, '0')} QA compound`, `큐에이 시약 ${i + 40}`, `91${String(1000 + i * 3)}`, `없는시약${i}(ABC)`][i % 4]).join('\n')
  const b2 = idxReq(rec), all2 = rec.net.length
  await apply(page, twenty)
  const c20 = await counts(page)
  ok(`[${tag}] STEP27 20 lines applied → ${rec.net.length - all2} total Supabase requests (index is cached: 0 expected) — not 20`, c20.input === 20 && rec.net.length - all2 <= 3, { delta: rec.net.length - all2, c20 })
  await apply(page, INPUT)

  // ── STEP7 기존 필터와 AND ──
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: 'QA-5호관 102', exact: true }).click(); await page.waitForTimeout(1500); await waitList(page).catch(() => {})
  const nRoom = await resultCount(page)
  const tRoom = await page.locator('main').innerText()
  ok(`[${tag}] STEP7 batch AND room (QA-5호관 102): only matched reagents located there (Iron/… excluded)`, nRoom <= 4 && (await page.getByTestId('batch-bar').count()) === 1, { nRoom })
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: '전체', exact: true }).click(); await page.waitForTimeout(1200); await waitList(page)
  await page.getByPlaceholder(/시약명.*CAS/).first().fill('blue'); await page.getByPlaceholder(/시약명.*CAS/).first().press('Enter'); await page.waitForTimeout(1500); await waitList(page)
  const tq = await page.locator('main').innerText()
  ok(`[${tag}] batch AND general q ("blue"): Bromothymol blue + Thymol blue only`, (await resultCount(page)) === 2 && tq.includes('Thymol blue') && !tq.includes('Acetic acid') && new URL(page.url()).searchParams.get('q') === 'blue', await resultCount(page))
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.waitForTimeout(800)
  ok(`[${tag}] batch + q + special → empty (Benzene not in batch)`, (await resultCount(page)) === 0)
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.waitForTimeout(500)
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: 'QA-5호관 101', exact: true }).click(); await page.waitForTimeout(1200)
  await page.getByRole('button', { name: '일괄검색 해제' }).click(); await page.waitForTimeout(1500); await waitList(page)
  const u = new URL(page.url())
  ok(`[${tag}] batch × removes ONLY the batch: q=blue and room=QA-5호관 101 stay; bs gone; chip gone`, u.searchParams.get('q') === 'blue' && u.searchParams.get('room') === 'QA-5호관 101' && !u.searchParams.has('bs') && (await page.getByTestId('batch-bar').count()) === 0, u.search)

  // ── STEP8 persistence ──
  await page.goto(BASE + '/reagents/list', { waitUntil: 'domcontentloaded' }); await waitList(page)
  await apply(page, INPUT)
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByTestId('batch-bar').waitFor({ timeout: 20000 }); await waitList(page)
  const cr = await counts(page)
  await page.getByRole('button', { name: '입력 수정' }).click(); await dialog(page).waitFor()
  const restored = await dialog(page).getByRole('textbox').inputValue()
  ok(`[${tag}] STEP8-A reload keeps the batch filter and restores the pasted input in the modal`, cr.input === 6 && restored === INPUT, { cr, restored: restored.slice(0, 40) })
  await page.keyboard.press('Escape')
  // Hard refresh(캐시 무시)도 동일
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByTestId('batch-bar').waitFor({ timeout: 20000 })
  ok(`[${tag}] reload again: batch persists (sessionStorage)`, (await counts(page)).input === 6)

  // detail → back (스크롤 복원은 결과가 긴 batch 로)
  await apply(page, 'QA compound')
  await waitList(page)
  const nBig = await resultCount(page)
  await page.evaluate(() => window.scrollTo(0, 2200)); await page.waitForTimeout(700)
  const y0 = await page.evaluate(() => window.scrollY)
  const anchorOf = () => page.evaluate(() => { const el = [...document.querySelectorAll('[data-index]')].find(e => e.getBoundingClientRect().bottom > 60); return el ? { idx: el.getAttribute('data-index'), top: Math.round(el.getBoundingClientRect().top) } : null })
  const a0 = await anchorOf()
  // 화면에 실제로 보이는 행을 좌표로 클릭(가상 스크롤의 overscan 행은 화면 밖이라 locator.click 이 스크롤을 바꿔 버린다)
  const pt = await page.evaluate(m => { const els = m ? [...document.querySelectorAll('[data-index] span')].filter(e => /QA compound/.test(e.textContent) && e.children.length === 0) : [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')]; const e = els.find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } }, mobile)

  await page.mouse.click(pt.x, pt.y)
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 })
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click()
  await page.getByTestId('batch-bar').waitFor({ timeout: 15000 }); await waitList(page); await page.waitForTimeout(2000)
  const y1 = await page.evaluate(() => window.scrollY)
  const a1 = await anchorOf()
  const u2 = new URL(page.url())
  ok(`[${tag}] STEP8-B detail → "← 시약 목록": batch kept (bs=1), result count ${nBig}, same anchor row at the same screen position (idx ${a0?.idx}/top ${a0?.top} → idx ${a1?.idx}/top ${a1?.top}; raw scrollY ${y0} → ${y1})`, u2.searchParams.get('bs') === '1' && (await resultCount(page)) === nBig && a0 && a1 && a0.idx === a1.idx && Math.abs(a0.top - a1.top) <= 6 && y0 > 1000, { a0, a1, y0, y1 })
  await shot(page, `B-${tag}-after-back`)
  await page.locator('tbody tr[title^="클릭"], [data-index] >> text=QA compound').first().click().catch(() => {})
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
  await page.goBack(); await page.getByTestId('batch-bar').waitFor({ timeout: 15000 })
  ok(`[${tag}] browser Back (not the button) also keeps the batch`, (await page.getByTestId('batch-bar').count()) === 1)

  ok(`[${tag}] console clean / no page errors`, rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0, { errors: rec.errors, console: rec.console.slice(0, 4) })
  ok(`[${tag}] no production/Firebase request attempted`, rec.prod.length === 0, rec.prod)
  ok(`[${tag}] no 4xx/5xx from staging`, rec.net.filter(r => r.s >= 400).length === 0, rec.net.filter(r => r.s >= 400).slice(0, 4))
  await ctx.close()
}
await browser.close()
summary()
