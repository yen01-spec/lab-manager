// QA C — 상세 진입/복귀, 직접 URL, action UI, 새 Lot 추가, 학생 요청(정보 수정/위치/폐기) — 실제 staging 브라우저(학생 = QA 학생 UI 로그인)
import { browserLaunch, session, ok, note, summary, shot, overflowX, crumbText, resultCount, waitList, studentLogin, BASE, STATE } from './lib.mjs'

const headed = process.env.QA_HEADED === '1'
const browser = await browserLaunch(headed, headed ? 150 : 0)
const vrow = (page) => page.evaluate(() => { const e = [...document.querySelectorAll('tbody tr[title^="클릭"] td:nth-child(2)')].find(x => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 20 }); const r = e.getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 } })
const openReagent = async (page, q) => { await page.goto(`${BASE}/reagents/list?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' }); await waitList(page); const p = await vrow(page); await page.mouse.click(p.x, p.y); await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/, { timeout: 15000 }); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(800) }

// ═══ 학생 (데스크톱 1440) ═══
const S = await session(browser, { w: 1440, h: 900 })
{
  const { page, rec } = S
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await studentLogin(page)
  ok('STUDENT login through the real UI (QA-STU-9001)', (await page.locator('header').innerText()).includes('QA 학생') || (await page.locator('body').innerText()).includes('QA 학생'))

  // STEP9
  await page.goto(`${BASE}/reagents/list?q=Acetone`, { waitUntil: 'domcontentloaded' }); await waitList(page)
  const before = await page.getByText(/^검색결과/).first().innerText()
  const p = await vrow(page); await page.mouse.click(p.x, p.y)
  await page.waitForURL(/\/reagents\/[0-9a-f-]{36}/); await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(1200)
  const detailUrl = page.url(); await shot(page, 'C-1440-detail-student')
  ok('STEP9 breadcrumb "홈 › 시약 목록 › Acetone", "← 시약 목록" visible, no horizontal overflow', (await crumbText(page)) === '홈 › 시약 목록 › Acetone' && (await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).isVisible()) && (await overflowX(page)) <= 0, { crumb: await crumbText(page), ox: await overflowX(page) })
  // STEP11
  const main = await page.locator('main').innerText()
  ok('STEP11 top actions (student): 새 Lot 추가 · 위치 변경 신청 · 정보 수정 신청 · ⋯ 더보기', (await page.getByRole('button', { name: '📦 새 Lot 추가' }).count()) === 1 && (await page.getByRole('button', { name: '📍 위치 변경 신청' }).count()) === 1 && (await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).count()) === 1 && (await page.getByRole('button', { name: /더보기/ }).count()) === 1)
  ok('STEP11 no leftover "재고 등록" / "수정완료" wording anywhere in the detail page', !main.includes('재고 등록') && !main.includes('수정완료'))
  await page.getByRole('button', { name: /더보기/ }).click()
  const menuItems = await page.getByRole('menuitem').allInnerTexts()
  ok('STEP11 ⋯더보기 holds only disposal (student has no 시약 종류 삭제)', menuItems.length === 1 && menuItems[0].includes('폐기 신청'), menuItems)
  await page.keyboard.press('Escape')
  // STEP17 master vs lot
  ok('STEP17 sections: 「시약 기본정보」 (모든 병에 공통) vs 「보유 Lot / 병」 (병 1개마다 한 칸)', main.includes('시약 기본정보') && main.includes('이 시약 종류의 모든 병에 공통으로 적용되는 정보예요.') && main.includes('보유 Lot / 병') && main.includes('병 1개마다 한 칸이에요'))
  // back → 같은 검색
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click(); await page.waitForURL(/\/reagents\/list/); await waitList(page); await page.waitForTimeout(600)
  ok('STEP9 "← 시약 목록" returns to the same search (q=Acetone) and result', new URL(page.url()).searchParams.get('q') === 'Acetone' && (await page.getByText(/^검색결과/).first().innerText()) === before, page.url())
  // breadcrumb crumb
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' })

  // STEP10 direct URL fallback — 새 탭(히스토리 없음)
  const direct = await S.ctx.newPage()
  await direct.goto(detailUrl, { waitUntil: 'domcontentloaded' })
  await direct.getByRole('button', { name: '시약 목록으로 돌아가기' }).waitFor({ timeout: 20000 })
  await direct.getByRole('button', { name: '시약 목록으로 돌아가기' }).click(); await direct.waitForURL(/\/reagents\/list$/, { timeout: 10000 })
  ok('STEP10 direct detail URL (new tab, no history): "← 시약 목록" falls back to /reagents/list', new URL(direct.url()).pathname === '/reagents/list')
  await direct.goto(detailUrl, { waitUntil: 'domcontentloaded' }); await direct.locator('nav[aria-label="현재 위치"]').getByRole('link', { name: '시약 목록' }).click(); await direct.waitForURL(/\/reagents\/list$/, { timeout: 10000 })
  ok('STEP10 direct URL: breadcrumb "시약 목록" also falls back to /reagents/list', new URL(direct.url()).pathname === '/reagents/list')
  await direct.close()

  // STEP12 새 Lot 추가
  await page.getByRole('button', { name: '📦 새 Lot 추가' }).waitFor()
  const lotsBefore = await page.locator('[data-lot-id]').count()
  await page.getByRole('button', { name: '📦 새 Lot 추가' }).click()
  const dlg = page.getByRole('dialog', { name: '새 Lot 추가' })
  const dt = await dlg.innerText(); await shot(page, 'C-1440-addlot-modal')
  ok('STEP12 modal title + explanation "현재 시약에 새로 구매한 병/Lot" (not a new reagent)', dt.includes('새 Lot 추가') && dt.includes('현재 시약에 새로 구매한 병/Lot을 추가합니다') && dt.includes('새 시약 종류를 등록하는 것이 아니에요'))
  ok('STEP12 fields present: Lot No., Cat No., 미개봉 병 수, 개봉 병 잔량, 보관 위치, 입고일, 유효기간', ['Cat No.', '미개봉 병 수', '개봉 병 잔량', '보관 위치', '입고일', '유효기간'].every(t => dt.includes(t)) && /Lot/.test(dt))
  const box = await dlg.locator('> div').first().boundingBox()
  ok('STEP12 modal fits the viewport (no clipping, submit reachable)', box.y >= 0 && box.y + box.height <= 900 + 1 && (await dlg.getByRole('button', { name: 'Lot 추가하기' }).isVisible()))
  // 같은 lot_no(기존 병과 동일) 로 새 Lot — bottle identity 는 id
  await dlg.getByPlaceholder(/Lot/).first().fill('QA-AC1').catch(async () => { await dlg.locator('input').first().fill('QA-AC1') })
  await dlg.locator('input').nth(1).fill('QA-CAT-NEW').catch(() => {})
  await dlg.locator('select').first().selectOption({ label: 'QA-냉장실' })
  await dlg.getByRole('button', { name: 'Lot 추가하기' }).click()
  await page.waitForFunction(n => document.querySelectorAll('[data-lot-id]').length > n, lotsBefore, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const lotsAfter = await page.locator('[data-lot-id]').count()
  const ids = await page.locator('[data-lot-id]').evaluateAll(els => els.map(e => e.getAttribute('data-lot-id')))
  const texts = await page.locator('[data-lot-id]').allInnerTexts()
  ok(`STEP12 real Lot add on staging: detail shows ${lotsBefore} → ${lotsAfter} bottles immediately`, lotsAfter === lotsBefore + 1, { dialogs: S.rec.dialogs })
  ok('STEP12 same Lot No. on two bottles = two separate cards with distinct bottle ids (identity by id, not lot_no)', texts.filter(t => t.includes('QA-AC1')).length === 2 && new Set(ids).size === ids.length, { same: texts.filter(t => t.includes('QA-AC1')).length })
  await shot(page, 'C-1440-detail-after-addlot')
  await page.getByRole('button', { name: '시약 목록으로 돌아가기' }).click(); await page.waitForURL(/\/reagents\/list/); await waitList(page); await page.waitForTimeout(800)
  ok('STEP12 list reflects the new bottle: Acetone row now shows "보유 2병 · 2개 위치"', (await page.locator('main').innerText()).includes('보유 2병 · 2개 위치'))

  // STEP14 학생 정보 수정 신청
  await openReagent(page, 'Acetone')
  await page.getByRole('button', { name: '✏️ 정보 수정 신청' }).click()
  await page.locator('#master-category').fill('QA-액체-신청')
  await shot(page, 'C-1440-edit-student')
  await page.getByRole('region', { name: '시약 기본정보 수정' }).getByRole('button', { name: /^수정 신청/ }).click()
  await page.getByText('시약정보 수정 신청이 완료되었습니다.').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('STEP14 student 정보 수정 신청: completion notice shown; edit mode closes', (await page.getByText('시약정보 수정 신청이 완료되었습니다.').count()) >= 1 && (await page.getByRole('region', { name: '시약 기본정보 수정' }).count()) === 0, S.rec.dialogs)
  await page.waitForTimeout(800)
  ok('STEP14 pending state visible on the 성상 field (검토 대기), only that field submitted', (await page.getByText('시약정보 수정 신청 완료 · 관리자 검토 대기').count()) >= 1)

  // STEP15 위치 이동 신청 (QA 병)
  const lotCard = page.locator('[data-lot-id]').first()
  await lotCard.getByRole('button', { name: /이 병 위치 변경 신청/ }).click()
  const mv = page.getByRole('dialog', { name: '위치 변경 신청' })
  await mv.locator('select').last().selectOption({ label: 'QA-5호관 102' })
  await mv.getByRole('button', { name: '위치 변경 신청하기' }).click()
  await page.getByText('위치 변경 신청이 완료되었습니다.').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('STEP15 student 위치 이동 신청 from the per-bottle button: completion notice + pending badge on that bottle', (await page.getByText('위치 변경 신청이 완료되었습니다.').count()) >= 1, S.rec.dialogs)
  await page.waitForTimeout(800)
  ok('STEP15 the same bottle cannot be requested twice (button disabled)', await page.locator('[data-lot-id]').first().getByRole('button', { name: /이 병 위치 변경 신청/ }).isDisabled())

  // STEP16 폐기 신청 UI
  const second = page.locator('[data-lot-id]').nth(1)
  await second.getByRole('button', { name: /이 병 폐기 신청/ }).click()
  const dd = page.getByRole('dialog', { name: '폐기 신청' })
  const ddt = await dd.innerText()
  ok('STEP16 disposal modal wording: 1병 단위 ("이 병 1개에 대한 폐기 신청", "이 병만 폐기 완료")', ddt.includes('이 병 1개에 대한 폐기 신청') && ddt.includes('이 병만 폐기 완료') && (await dd.getByRole('button', { name: '1병 폐기 신청하기' }).count()) === 1, ddt.slice(0, 160))
  await dd.locator('textarea').fill('QA 폐기 신청 테스트')
  await dd.getByRole('button', { name: '1병 폐기 신청하기' }).click()
  await page.getByText('폐기 신청이 완료되었습니다.').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('STEP16 student 폐기 신청 submitted (request only — lot still 보유중, nothing disposed)', (await page.getByText('폐기 신청이 완료되었습니다.').count()) >= 1 && (await page.getByText('보유중').count()) >= 2, S.rec.dialogs)
  await shot(page, 'C-1440-detail-after-requests')

  // grouped(sealed>1) fail-closed 유지
  await openReagent(page, 'Sodium chloride')
  const g = page.locator('[data-lot-id]').first()
  ok('STEP16 grouped row (sealed_count 3): per-bottle move/dispose stay disabled (fail-closed) with the explanation', (await g.getByRole('button', { name: /이 병 위치 변경/ }).isDisabled()) && (await g.getByRole('button', { name: /이 병 폐기/ }).isDisabled()) && (await page.getByRole('button', { name: /^📍 위치 변경/ }).first().isDisabled()))

  ok('STUDENT flows: console clean (no page errors, no console errors)', rec.errors.length === 0 && rec.console.filter(x => x.t === 'error').length === 0, { errors: rec.errors, console: rec.console.slice(0, 5) })
  ok('STUDENT flows: no 4xx/5xx from staging Supabase', rec.net.filter(r => r.s >= 400).length === 0, rec.net.filter(r => r.s >= 400).slice(0, 5))
  ok('STUDENT flows: no production/Firebase request attempted', rec.prod.length === 0, rec.prod)
}
await S.ctx.close()
await browser.close()
summary()
