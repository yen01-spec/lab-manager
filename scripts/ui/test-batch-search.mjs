// 시약 일괄검색 = 시약목록에 거는 다중 검색 필터. 입력 모달 → [조회] → 모달 닫힘 → 기존 목록에 필터 적용.
// 별도 결과표 없음 / OR + 중복 제거 / 괄호 보조표기 / 미확인 입력 / 해제 / 다른 필터와 AND / 상세→뒤로·새로고침 유지 / 모달 재오픈 / 내보내기 / 성능. 가짜 Supabase.
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }

const rs = buildReagents(300)
const lot = (id, loc, sealed, stock, no) => ({ id, status: 'active', sealed_count: sealed, current_stock: stock, location_id: loc, lot_no: no, expiry_date: null, cat_no: null, pending_confirm: false })
const set = (i, name, name_ko, cas_no, letter, lots, extra = {}) => { rs[i] = { ...rs[i], name, name_ko, cas_no, sort_letter: letter, reagent_lots: lots || rs[i].reagent_lots, ...extra } }
set(20, 'Acetic acid', '아세트산', '64-19-7', 'A', [lot('aa-1', 'loc-a1', 1, 100, 'SAME'), lot('aa-2', 'loc-a1', 0, 40, 'SAME'), lot('aa-3', 'loc-c1', 1, 100, 'X9')], { msds_url: 'https://example.test/aa.pdf' })
set(21, 'Acetone', '아세톤', '67-64-1', 'A')
set(22, 'Bromothymol blue', '브로모티몰블루', '76-59-5', 'B')
set(23, 'Thymol blue', '티몰블루', '76-61-9', 'T')
set(24, 'Thymolphthalein', '티몰프탈레인', '125-20-2', 'T')
set(25, 'Iron(III) chloride', '염화철(III)', '7705-08-0', 'I')
// r-0005 = Benzene(특별관리물질, harness)
// 합성 데이터의 acetate/아세트산염 이름이 "acet"·"아세트산" 검색어와 겹치지 않게 바꿔 둔다(넓은 일치 자체는 유닛 테스트가 검증).
for (const r of rs) if (/acetate/.test(r.name)) { r.name = r.name.replace('acetate', 'sulfite'); r.name_ko = r.name_ko.replace('아세트산염', '아황산염') }
for (const r of rs) if (r.id !== 'r-0005' && /benzene/i.test(r.name)) r.name = r.name.replace(/benzene/i, 'xylene')

const TEN = ['Acetic acid', 'acet', '아세트산', '64-19-7', '64197', '브로모티몰블루(BTB)', '티몰블루', '티몰프탈레인', '존재하지않는시약XYZ', 'Benzene'].join('\n')
const EXPECT_NAMES = ['Acetic acid', 'Acetone', 'Bromothymol blue', 'Thymol blue', 'Thymolphthalein', 'Benzene']
const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function open(w = 1440, h = 900, { admin = false, url = '/reagents/list' } = {}) {
  const mobile = w < 768
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, acceptDownloads: true })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  const stats = await installMock(ctx, rs)
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  const writes = []
  ctx.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' })
  await page.getByText(/^검색결과/).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(700)
  return { ctx, page, stats, errors, writes, mobile }
}
const dialog = page => page.getByRole('dialog', { name: /시약 일괄 검색/ })
const openModal = async page => { await page.getByRole('button', { name: /시약 일괄 검색/ }).first().click(); await dialog(page).waitFor(); }
const fill = (page, text) => dialog(page).getByRole('textbox').fill(text)
const run = async (page, text) => { await openModal(page); await fill(page, text); await dialog(page).getByRole('button', { name: '조회' }).click(); await dialog(page).waitFor({ state: 'hidden', timeout: 10000 }); await page.waitForTimeout(500) }
const mainText = page => page.locator('main').innerText()
const counts = async page => { const t = (await page.getByTestId('batch-summary').innerText()).replace(/\s+/g, ' '); const m = t.match(/입력 (\d+)개 · 일치 시약 (\d+)개 · (\d+) Lot 표시 · 미확인 (\d+)개/); return m ? { input: +m[1], matched: +m[2], lots: +m[3], unmatched: +m[4], text: t } : { text: t } }
const resultCount = async page => +((await page.getByText(/^검색결과/).first().innerText()).match(/검색결과\s*([\d,]+)개/)?.[1].replace(/,/g, '') ?? -1)
const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

// ════ 데스크톱 핵심 흐름 ════
{
  const { ctx, page, stats, errors, writes } = await open(1440, 900, { admin: true })
  const before = await resultCount(page)
  ok('baseline: full Reagent List loaded', before === 300, before)

  // 빈 입력 검증
  await openModal(page)
  ok('modal a11y: role=dialog with name, labelled textarea, focus starts in the textarea', (await dialog(page).getByRole('textbox', { name: /검색할 시약명 목록/ }).count()) === 1 && await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'))
  await dialog(page).getByRole('button', { name: '조회' }).click()
  ok('empty input: validation message, no filter applied, modal stays open', (await dialog(page).getByRole('alert').innerText()).includes('검색할 시약명을 한 줄에 하나씩 입력해주세요.') && (await page.getByTestId('batch-bar').count()) === 0)
  await page.keyboard.press('Escape')
  ok('Esc closes the modal', (await dialog(page).count()) === 0)

  // A. 10줄(+ 빈 줄/공백/CRLF/중복) → 조회 → 모달 닫힘 → 기존 목록에 필터
  const reqBefore = stats.requests.length
  const raw = ['  Acetic acid  ', '', 'acet', '아세트산', 'ACETIC ACID', '64-19-7', '64197', '브로모티몰블루(BTB)', '티몰블루', '티몰프탈레인', '존재하지않는시약XYZ', 'Benzene', ''].join('\r\n')
  const RAW_LF = raw.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
  await run(page, raw)
  const txt = await mainText(page)
  ok('A. modal closed; the existing list now shows ONLY matched reagents (no separate result table/modal)', EXPECT_NAMES.every(n => txt.includes(n)) && !txt.includes('입력한 이름') && !/조회 결과 · 있음/.test(txt) && (await dialog(page).count()) === 0, await resultCount(page))
  ok('A. unrelated reagents are filtered out', !txt.includes('Iron(III) chloride') && !/A0000 acid/.test(txt))
  const c1 = await counts(page)
  ok('summary chip: 입력 N개 · 일치 시약 · Lot 표시 · 미확인 — duplicate/blank lines excluded from 입력', c1.input === 10 && c1.unmatched === 1 && c1.matched >= 6 && c1.lots > 0, c1)
  ok('chip "일괄검색 · 10개 입력" with a clear (×) control', (await page.getByTestId('batch-bar').innerText()).includes('일괄검색 · 10개 입력') && (await page.getByRole('button', { name: '일괄검색 해제' }).count()) === 1)
  ok('OR + dedupe: each matched reagent listed once (grouped result count == unique masters by name)', (await resultCount(page)) === 6, await resultCount(page))
  ok('URL carries only a flag (bs=1), never the pasted lines', new URL(page.url()).searchParams.get('bs') === '1' && !decodeURIComponent(page.url()).includes('아세트산'), page.url())
  ok('no per-line DB queries: at most the shared reagent index (+0..1 requests to reagents), not 10', stats.requests.slice(reqBefore).filter(r => /rest\/v1\/reagents/.test(r)).length <= 2, stats.requests.slice(reqBefore).filter(r => /rest\/v1\/reagents/.test(r)))
  ok('focus moved to the batch summary region after apply', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'batch-bar'))
  ok('no horizontal overflow', (await overflowX(page)) <= 0)

  // B. 매칭 시약의 모든 Lot
  const aaRow = page.locator('tr', { hasText: 'Acetic acid' }).first()
  await aaRow.getByText(/▸/).first().click().catch(async () => { await aaRow.locator('span', { hasText: /병/ }).first().click() })
  await page.waitForTimeout(300)
  const lotRows = await page.locator('main').innerText()
  ok('B. all lots of a matched reagent are shown (existing expand behaviour) — 3 bottles incl. two with the SAME Lot No.', (lotRows.match(/SAME/g) || []).length >= 2 && lotRows.includes('X9'), (lotRows.match(/SAME/g) || []).length)

  // C. 미확인
  ok('C. unmatched input is NOT injected into the list as a fake row', !(await mainText(page)).includes('존재하지않는시약XYZ') || (await page.getByTestId('unmatched-panel').count()) === 1)
  await page.getByRole('button', { name: /미확인 1개 보기/ }).click()
  const panel = await page.getByTestId('unmatched-panel').innerText()
  ok('D. "미확인 1개 보기" opens a compact inline panel with the unmatched input + neutral wording', panel.includes('존재하지않는시약XYZ') && panel.includes('찾지 못한') && !panel.includes('없습니다') && (await overflowX(page)) <= 0, panel)
  await page.getByRole('button', { name: /미확인 1개 접기/ }).click()
  ok('unmatched panel collapses', (await page.getByTestId('unmatched-panel').count()) === 0)

  // F/G/H. 다른 필터와 AND
  await page.getByRole('button', { name: '5호관 101', exact: true }).click(); await page.waitForTimeout(900)
  const nRoom = await resultCount(page)
  ok('F. batch + room filter (AND): fewer/equal results, batch chip stays', nRoom <= 6 && (await page.getByTestId('batch-bar').count()) === 1 && new URL(page.url()).searchParams.get('room') === '5호관 101', nRoom)
  await page.getByRole('button', { name: '전체', exact: true }).first().click(); await page.waitForTimeout(700)
  ok('back to all rooms: batch result restored', (await resultCount(page)) === 6)
  const search = page.getByPlaceholder(/시약명.*CAS/).first()
  await page.mouse.move(2, 2)
  await search.fill('acid'); await page.waitForTimeout(400); await search.press('Enter'); await page.waitForTimeout(900)
  const tq = await mainText(page)
  ok('G. batch + normal q search (acid): only Acetic acid within the batch result; Acetone hidden', (await resultCount(page)) === 1 && tq.includes('Acetic acid') && !tq.includes('Acetone') && new URL(page.url()).searchParams.get('q') === 'acid', await resultCount(page))
  await search.fill(''); await search.press('Enter'); await page.waitForTimeout(900)
  ok('clearing q keeps the batch filter (two states are independent)', (await resultCount(page)) === 6 && (await page.getByTestId('batch-bar').count()) === 1)
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.waitForTimeout(500)
  const tsp = await mainText(page)
  ok('H. batch + special-management filter: only Benzene remains', (await resultCount(page)) === 1 && tsp.includes('Benzene') && !tsp.includes('Acetic acid'), await resultCount(page))

  // 선택(pickedIds) 유지 규칙: 필터가 바뀌어도 기존 선택 동작 유지
  await page.locator('input[aria-label="Benzene 선택 목록에 담기"]').check().catch(async () => { await page.locator('tr', { hasText: 'Benzene' }).locator('td').first().click() })
  ok('row selection works inside a batch result', (await page.getByText(/1종 선택됨/).count()) === 1)

  // I. 상세 → 뒤로: batch 유지
  await page.locator('tr', { hasText: 'Benzene' }).locator('td').nth(1).click()
  await page.waitForURL(/\/reagents\/r-0005/, { timeout: 8000 })
  await page.goBack(); await page.getByTestId('batch-bar').waitFor({ timeout: 8000 }); await page.waitForTimeout(800)
  ok('I. detail -> Back keeps the batch filter and the special filter (URL: bs=1&special=1)', (await resultCount(page)) === 1 && new URL(page.url()).searchParams.get('special') === '1' && new URL(page.url()).searchParams.get('bs') === '1' && (await page.getByTestId('batch-bar').count()) === 1, page.url())
  // J. reload
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByTestId('batch-bar').waitFor({ timeout: 15000 }); await page.waitForTimeout(800)
  ok('J. reload keeps the batch filter (sessionStorage) and other filters (URL)', (await counts(page)).input === 10 && new URL(page.url()).searchParams.get('special') === '1', (await counts(page)))
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.waitForTimeout(600)

  // K. 모달 재오픈 → 기존 입력 복원, 수정 후 재조회 = 교체
  await page.getByRole('button', { name: '입력 수정' }).click(); await dialog(page).waitFor()
  const restored = await dialog(page).getByRole('textbox').inputValue()
  ok('K. reopening the modal restores the exact pasted text (incl. blank lines / spacing)', restored === RAW_LF, restored.slice(0, 60))
  await fill(page, 'Acetone\n아세톤'); await dialog(page).getByRole('button', { name: '조회' }).click(); await dialog(page).waitFor({ state: 'hidden' }); await page.waitForTimeout(700)
  const c2 = await counts(page)
  ok('K. re-running REPLACES the batch filter (2 input lines -> Acetone only)', c2.input === 2 && (await resultCount(page)) === 1 && (await mainText(page)).includes('Acetone'), c2)

  // E. × 해제: batch 만 제거, 다른 필터 유지
  await page.getByRole('button', { name: '5호관 101', exact: true }).click(); await page.waitForTimeout(700)
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.waitForTimeout(600)
  await page.getByRole('button', { name: '일괄검색 해제' }).click(); await page.waitForTimeout(900)
  const u = new URL(page.url())
  ok('E. × removes ONLY the batch filter — room and special filters stay, bs flag gone, chip gone', u.searchParams.get('room') === '5호관 101' && u.searchParams.get('special') === '1' && !u.searchParams.has('bs') && (await page.getByTestId('batch-bar').count()) === 0, u.search)
  await page.getByRole('button', { name: /특별관리물질만 보기/ }).click(); await page.getByRole('button', { name: '전체', exact: true }).first().click(); await page.waitForTimeout(900)
  ok('with all filters cleared the full list returns', (await resultCount(page)) === 300)
  ok('a fresh visit does not resurrect a cleared batch', (await page.getByTestId('batch-bar').count()) === 0)
  ok('no DB writes, no page errors', writes.length === 0 && errors.length === 0, { writes, errors })
  await ctx.close()
}

// ════ L. 0건 / 내보내기 / 오래된 sessionStorage / 정책 ════
{
  const { ctx, page, errors } = await open(1440, 900, { admin: true })
  await run(page, '없는시약1\n없는시약2(ABC)\nzzzz')
  const empty = await page.getByTestId('batch-empty').innerText()
  ok('L. 0 matches: list area says "일괄검색 결과가 없습니다." with [미확인 3개 보기] and [일괄검색 해제] (no result modal)', empty.includes('일괄검색 결과가 없습니다.') && empty.includes('미확인 3개 보기') && empty.includes('일괄검색 해제') && (await dialog(page).count()) === 0, empty)
  await page.getByTestId('batch-empty').getByRole('button', { name: /미확인 3개 보기/ }).click()
  ok('L. unmatched panel shows all 3 inputs', (await page.getByTestId('unmatched-panel').innerText()).includes('zzzz'))
  await page.getByTestId('batch-empty').getByRole('button', { name: '일괄검색 해제' }).click(); await page.waitForTimeout(800)
  ok('L. clearing returns to the full list', (await resultCount(page)) === 300)
  ok('L. no page errors', errors.length === 0, errors)
  await ctx.close()
}
{
  // 새 세션에서 bs=1 URL 만 열린 경우(저장된 상태 없음): 조용히 해제, 전체 목록
  const { ctx, page } = await open(1440, 900, { url: '/reagents/list?bs=1' })
  await page.waitForTimeout(800)
  ok('stale bs=1 without stored batch (new session / shared link): flag is dropped, normal full list', (await page.getByTestId('batch-bar').count()) === 0 && !new URL(page.url()).searchParams.has('bs') && (await resultCount(page)) === 300, page.url())
  await ctx.close()
}
{
  // 내보내기: batch 결과만
  const { ctx, page } = await open(1440, 900, { admin: true })
  await run(page, 'Acetone\nBromothymol blue\n64-19-7')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Excel로 내보내기/ }).click()])
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(readFileSync(await dl.path()))
  const names = new Set(); wb.worksheets[0].eachRow(row => { const v = row.getCell(1).value; if (v) names.add(String(v)) })
  ok('export (Excel) uses the current filtered result: only the batch-matched reagents, not the whole list', ['Acetone', 'Bromothymol blue', 'Acetic acid'].every(n => names.has(n)) && ![...names].some(n => n === 'Thymol blue' || n === 'Benzene') && names.size < 15, [...names].slice(0, 12))
  // PDF(인쇄)·학교등록 내보내기는 "선택 목록"(체크한 시약)을 대상으로 한다 — 헤더 체크박스는 현재(=일괄검색 필터된) 목록만 담는다.
  const nShown = await resultCount(page)
  await page.locator('input[aria-label="현재 목록 전체를 선택 목록에 담기"]').check(); await page.waitForTimeout(300)
  ok('select-all in a batch result picks ONLY the filtered reagents (feeds 선택 목록 → PDF / 학교등록 exports)', (await page.getByText(new RegExp(`${nShown}종 선택됨`)).count()) === 1 && nShown < 20, nShown)
  await ctx.close()
}

// ════ 모바일 320/360/390/430 + 데스크톱 해상도 ════
for (const [w, h] of [[320, 568], [360, 800], [390, 844], [430, 932], [1366, 768], [1920, 1080]]) {
  const tag = `${w}x${h}`
  const { ctx, page, errors, mobile } = await open(w, h)
  await page.getByRole('button', { name: /시약 일괄 검색/ }).first().click(); await dialog(page).waitFor()
  const box = await dialog(page).boundingBox()
  ok(`[${tag}] modal fits the viewport (textarea, 조회, 닫기 reachable, no overflow)`, box.x >= 0 && box.x + box.width <= w + 0.5 && box.y >= 0 && box.y + box.height <= h + 0.5 && await dialog(page).getByRole('button', { name: '조회' }).isVisible() && await dialog(page).getByRole('button', { name: '닫기' }).isVisible() && (await overflowX(page)) <= 0, box)
  await fill(page, TEN); await dialog(page).getByRole('button', { name: '조회' }).click(); await dialog(page).waitFor({ state: 'hidden', timeout: 10000 }); await page.waitForTimeout(700)
  const t = await mainText(page)
  ok(`[${tag}] after apply the existing ${mobile ? 'mobile card list' : 'table'} shows only matched reagents`, EXPECT_NAMES.every(n => t.includes(n)) && !t.includes('Iron(III)'), await resultCount(page))
  await page.getByRole('button', { name: /미확인 1개 보기/ }).click()
  ok(`[${tag}] unmatched panel + summary fit: no horizontal overflow`, (await page.getByTestId('unmatched-panel').isVisible()) && (await overflowX(page)) <= 0, await overflowX(page))
  const bar = await page.getByTestId('batch-bar').boundingBox()
  ok(`[${tag}] batch bar inside the viewport width`, bar.x >= 0 && bar.x + bar.width <= w + 0.5, bar)
  if (mobile) {
    await page.getByRole('button', { name: '알파벳으로 이동' }).click()
    const avail = await page.getByRole('dialog', { name: '알파벳 바로가기' }).locator('button:not([disabled])').allInnerTexts()
    ok(`[${tag}] mobile A–Z sheet follows the batch result (only letters present: A,B,T + close)`, ['A', 'B', 'T'].every(x => avail.includes(x)) && !avail.includes('Z'), avail)
    await page.getByRole('dialog', { name: '알파벳 바로가기' }).getByRole('button', { name: 'T', exact: true }).click(); await page.waitForTimeout(400)
    ok(`[${tag}] A–Z jump works inside the batch result`, (await mainText(page)).includes('Thymol'))
  } else {
    const letters = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^[A-Z]$/.test(b.textContent.trim()) && !b.disabled).map(b => b.textContent.trim()))
    ok(`[${tag}] A–Z index follows the batch result (A,B,T enabled; Z disabled)`, ['A', 'B', 'T'].every(x => letters.includes(x)) && !letters.includes('Z'), letters)
  }
  ok(`[${tag}] no page errors`, errors.length === 0, errors)
  await ctx.close()
}

// ════ 스크롤 복원 + 괄호 대체 검색(자동추천/Enter) ════
{
  const { ctx, page, errors } = await open(1440, 900)
  await run(page, 'sulfite')
  const n = await resultCount(page)
  await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(500)
  const y0 = await page.evaluate(() => window.scrollY)
  await page.locator('tbody tr[title^="클릭"]').nth(8).locator('td').nth(1).click()
  await page.waitForURL(/\/reagents\/r-/, { timeout: 8000 })
  await page.goBack(); await page.getByTestId('batch-bar').waitFor({ timeout: 8000 }); await page.waitForTimeout(1200)
  const y1 = await page.evaluate(() => window.scrollY)
  ok('detail -> Back inside a batch result restores scroll position and keeps the filter (' + n + ' results)', n >= 20 && y0 > 300 && Math.abs(y1 - y0) < 150 && (await resultCount(page)) === n, { n, y0, y1 })
  ok('no page errors', errors.length === 0, errors)
  await ctx.close()
}
{
  const { ctx, page } = await open(1440, 900)
  const box = page.getByPlaceholder(/시약명.*CAS/).first()
  await page.mouse.move(2, 2)
  await box.fill('브로모티몰블루(BTB)'); await page.waitForTimeout(500)
  const opts = await page.getByRole('option').allInnerTexts()
  ok('autocomplete: "이름(약어)" input still suggests the reagent via the shared parenthesis fallback', opts.length === 1 && opts[0].includes('Bromothymol blue'), opts)
  await box.press('Enter'); await page.waitForTimeout(900)
  ok('list search (Enter) with "이름(약어)" falls back the same way: 1 result', (await resultCount(page)) === 1 && (await mainText(page)).includes('Bromothymol blue'), await resultCount(page))
  await box.fill('Iron(III) chloride'); await page.waitForTimeout(500)
  ok('chemical-name parentheses are untouched: "Iron(III) chloride" suggests exactly that reagent', (await page.getByRole('option').allInnerTexts()).join('|').includes('Iron(III) chloride'))
  await ctx.close()
}

// ════ M. 100줄 성능 + 요청 수 ════
{
  const { ctx, page, stats, errors } = await open(1440, 900)
  const hundred = Array.from({ length: 100 }, (_, i) => (i % 4 === 0 ? `${String.fromCharCode(65 + (i % 26))}${String(i * 2).padStart(4, '0')} acid` : i % 4 === 1 ? `산 ${i}` : i % 4 === 2 ? `${1000 + i}-${String(i % 90).padStart(2, '0')}-${i % 10}` : `없는시약${i}(ABC)`)).join('\n')
  const q0 = stats.requests.length
  await openModal(page); await fill(page, hundred)
  const t0 = Date.now()
  await dialog(page).getByRole('button', { name: '조회' }).click(); await dialog(page).waitFor({ state: 'hidden', timeout: 10000 }); await page.getByTestId('batch-bar').waitFor()
  const ms = Date.now() - t0
  const c = await counts(page)
  const reagentReq = stats.requests.slice(q0).filter(r => /rest\/v1\/reagents/.test(r)).length
  ok(`M. 100 lines: applied in ${ms}ms with at most the shared index request (${reagentReq} reagents request(s), not 100)`, ms < 3000 && reagentReq <= 2 && c.input === 100, { ms, reagentReq, c })
  ok('M. no page errors', errors.length === 0, errors)
  await ctx.close()
}
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
