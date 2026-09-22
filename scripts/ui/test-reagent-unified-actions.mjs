// 시약목록 단일 관리 허브 — 체크박스="시약 선택"(reagents.id) → 선택 후 액션바에서 작업 고르기 →
// 위치이동/폐기는 2단계 병(reagent_lots.id) 선택, 정보수정은 1종=상세페이지 재사용/여러종=순차 큐.
// /reagents/bulk-edit는 호환 redirect만 남았고 "시약 일괄정리" 메뉴는 제거됨. 가짜 Supabase.
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }

const rs = buildReagents(60)
// r-0003: 두 병 모두 같은 Lot No.(병 identity = reagent_lots.id, 서로 독립) — 이동/폐기 2단계 선택에서 재확인
rs[3].reagent_lots = [
  { id: 'lot-3-0', status: 'active', sealed_count: 1, current_stock: 100, location_id: 'loc-a1', lot_no: 'SAME-LOT', expiry_date: null, cat_no: null, pending_confirm: false },
  { id: 'lot-3-1', status: 'active', sealed_count: 0, current_stock: 35, location_id: 'loc-c1', lot_no: 'SAME-LOT', expiry_date: null, cat_no: null, pending_confirm: false },
]
// r-0004: 묶음 행(sealed_count > 1) — 병 단위 작업 대상에서 제외되는지
rs[4].reagent_lots = [{ id: 'lot-4-0', status: 'active', sealed_count: 3, current_stock: 100, location_id: 'loc-a1', lot_no: 'GROUP-1', expiry_date: null, cat_no: null, pending_confirm: false }]
rs[10] = { ...rs[10], name: 'Acetic acid', name_ko: '아세트산', cas_no: '64-19-7', sort_letter: 'A' }

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
async function open({ admin = true, path = '/reagents/list' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  await installMock(ctx, rs)
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, admin ? [{ user_id: UID }] : []))
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => reply(r, { status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }))
  const writes = []
  ctx.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method()) && !/rpc\/student_session_refresh/.test(q.url())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.dismiss())
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  return { ctx, page, errors, writes }
}
const settle = page => page.waitForTimeout(350)
const rowOf = (page, name) => page.locator('tbody tr', { hasText: name }).first()
const pick = (row) => row.locator('input[aria-label$="선택 목록에 담기"]')

// ── /reagents/bulk-edit는 호환 redirect, "시약 일괄정리" 메뉴는 사라짐 ──
{
  const { ctx, page } = await open({ path: '/reagents/bulk-edit' })
  await page.waitForURL(u => new URL(u).pathname === '/reagents/list', { timeout: 15000 })
  ok('STEP-T /reagents/bulk-edit redirects to /reagents/list (old bookmarks keep working)', new URL(page.url()).pathname === '/reagents/list')
  ok('STEP-S "시약 일괄정리" nav item is gone from the sidebar', (await page.getByRole('link', { name: '시약 일괄정리' }).count()) === 0)
  await ctx.close()
}

// ── 선택 semantics + 액션바 ──
{
  const { ctx, page, errors, writes } = await open()
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  ok('no action bar with nothing selected', (await page.getByText(/선택됨/).count()) === 0)

  await pick(rowOf(page, rs[3].name)).click()
  await settle(page)
  ok('STEP-B checking one reagent shows "1종 선택됨" (reagent-master identity, not a bottle count)', (await page.getByText(/1종 선택됨/).count()) === 1)
  ok('STEP-C action bar shows 구매요청/위치 이동/폐기/정보 수정/Excel/선택 목록/선택 해제 — no separate "bulk mode"', (await page.getByRole('button', { name: /구매요청/ }).count()) === 1
    && (await page.getByRole('button', { name: /위치 이동/ }).count()) === 1 && (await page.getByRole('button', { name: /^🗑️ 폐기/ }).count()) === 1
    && (await page.getByRole('button', { name: /정보 수정/ }).count()) === 1 && (await page.getByRole('button', { name: /Excel 내보내기/ }).count()) === 1
    && (await page.getByRole('button', { name: '선택 해제' }).count()) === 1)

  await pick(rowOf(page, 'Acetic acid')).click()
  await settle(page)
  ok('selecting a 2nd reagent updates the count to "2종 선택됨" (natural bulk, same UI)', (await page.getByText(/2종 선택됨/).count()) === 1)

  // ── Phase Q: 필터 변경 후 선택 유지 + 숨김 안내 ──
  const box = page.getByPlaceholder(/시약명.*CAS/).first()
  await box.fill('아세트'); await box.press('Enter'); await settle(page)
  ok('STEP-Q selection survives a search filter change; hidden-selection note shown', (await page.getByText(/2종 선택됨/).count()) === 1 && (await page.getByText(/현재 필터에서 1종 숨김/).count()) === 1)
  await box.fill(''); await box.press('Enter'); await settle(page)
  ok('clearing the filter restores visibility (hidden note gone)', (await page.getByText(/현재 필터에서/).count()) === 0)

  ok('no DB writes / no page errors from pure selection + filtering', writes.length === 0 && errors.length === 0, { writes, errors })
  await ctx.close()
}

// ── Phase G/H: 위치 이동 — 2단계 병 선택(같은 Lot No. 독립, 묶음 행 가드) ──
{
  const { ctx, page } = await open()
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  for (const r of [rs[3], rs[4]]) await pick(rowOf(page, r.name)).click()
  await page.getByRole('button', { name: /위치 이동/ }).click()
  const dlg = page.getByRole('dialog', { name: '병 선택 — 위치 이동' })
  await dlg.waitFor({ timeout: 15000 })
  await dlg.locator('[data-lot-id]').first().waitFor({ timeout: 15000 })
  const r3rows = dlg.locator('[data-lot-id="lot-3-0"], [data-lot-id="lot-3-1"]')
  ok('STEP-G/H dialog lists real bottles (reagent_lots.id) of the selected reagents, not the reagents themselves', (await r3rows.count()) === 2)
  ok('same Lot No. on two bottles → two independent checkboxes', await dlg.locator('[data-lot-id="lot-3-0"] input[type=checkbox]').count() === 1 && await dlg.locator('[data-lot-id="lot-3-1"] input[type=checkbox]').count() === 1)
  await dlg.locator('[data-lot-id="lot-3-0"] input[type=checkbox]').check()
  ok('checking bottle 1 does not check its same-lot-no sibling', await dlg.locator('[data-lot-id="lot-3-0"] input').isChecked() && !(await dlg.locator('[data-lot-id="lot-3-1"] input').isChecked()))
  ok('STEP-G grouped row (sealed_count>1) blocked — fail-closed, checkbox disabled, no auto-select just from picking the reagent', await dlg.locator('[data-lot-id="lot-4-0"] input[type=checkbox]').isDisabled() && !(await dlg.locator('[data-lot-id="lot-4-0"] input[type=checkbox]').isChecked()))
  ok('selected-count reflects only the explicitly checked bottle', (await dlg.getByTestId('lot-selected-count').innerText()).includes('선택된 1개 병'))
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByRole('button', { name: '취소', exact: true }).first().click().catch(() => {})
  await ctx.close()
}

// ── Phase I: 폐기 — 시약 체크만으로 병 전체가 자동 폐기 대상이 되지 않음, 명시적 병 선택 필요 ──
{
  const { ctx, page } = await open()
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  await pick(rowOf(page, rs[3].name)).click()
  await page.getByRole('button', { name: /^🗑️ 폐기/ }).click()
  const dlg = page.getByRole('dialog', { name: '병 선택 — 폐기' })
  await dlg.waitFor({ timeout: 15000 })
  await dlg.locator('[data-lot-id]').first().waitFor({ timeout: 15000 })
  ok('STEP-I disposal dialog opens with nothing pre-checked (explicit bottle confirmation required)', (await dlg.getByTestId('lot-selected-count').innerText()).includes('선택된 0개 병'))
  ok('submit is disabled until a bottle is explicitly checked', await dlg.getByRole('button', { name: /선택한 0병 폐기/ }).isDisabled())
  await dlg.locator('[data-lot-id="lot-3-0"] input[type=checkbox]').check()
  ok('after checking one bottle, submit enables and is scoped to that one bottle', await dlg.getByRole('button', { name: /선택한 1병 폐기/ }).isEnabled())
  await ctx.close()
}

// ── Phase E: 구매요청 — reagent-level prefill (Lot 선택 없음) ──
{
  const { ctx, page } = await open({ admin: false })
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  await pick(rowOf(page, rs[3].name)).click()
  await page.getByRole('button', { name: /구매요청/ }).click()
  await page.waitForURL(/\/purchase-request/, { timeout: 15000 })
  ok('STEP-E 구매요청 goes straight to the prefilled purchase request (reagent-level, no Lot picker)', new URL(page.url()).pathname === '/purchase-request')
  ok('prefilled with the selected reagent name', (await page.locator('main').innerText()).includes(rs[3].name))
  await ctx.close()
}

// ── Phase J/K: 정보 수정 — 1종은 상세페이지 재사용(autoEdit), 여러 종은 순차 큐 ──
{
  const { ctx, page } = await open()
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  await pick(rowOf(page, rs[3].name)).click()
  await page.getByRole('button', { name: /정보 수정/ }).click()
  await page.waitForURL(/\/reagents\/r-0003/, { timeout: 15000 })
  const autoEditRegion = page.getByRole('region', { name: '시약 기본정보 수정' })
  const autoEditOk = await autoEditRegion.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
  ok('STEP-J 1종 선택 정보 수정 → 시약 상세페이지의 기존 편집 폼으로 이동(별도 새 editor 없음), 자동으로 편집모드', autoEditOk)
  await ctx.close()
}
{
  const { ctx, page } = await open()
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  for (const r of [rs[3], rs[4]]) await pick(rowOf(page, r.name)).click()
  await page.getByRole('button', { name: /정보 수정/ }).click()
  const dlg = page.getByRole('dialog', { name: '여러 시약 정보 수정' })
  await dlg.waitFor({ timeout: 15000 })
  ok('STEP-K multi-select 정보 수정 opens a sequential queue "1 / 2" (no unsafe bulk-update RPC)', (await dlg.locator('span', { hasText: '1 / 2' }).count()) === 1)
  ok('same field form as the single-edit flow is reused per reagent', (await dlg.getByLabel('국문 시약명').count()) === 1)
  await dlg.getByRole('button', { name: '건너뛰기' }).click()
  await settle(page)
  ok('advances to "2 / 2" after the first reagent', (await dlg.locator('span', { hasText: '2 / 2' }).count()) === 1)
  await ctx.close()
}

// ── Phase F: Excel — 선택 항목만 내보내는 별개 경로(기존 "현재 목록 Excel"과 공존) ──
{
  const { ctx, page } = await open()
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  const toolbarExcelBtn = page.getByRole('button', { name: /Excel로 내보내기/ })
  const toolbarExcelOk = await toolbarExcelBtn.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  ok('현재 목록 전체 Excel export button still exists (unrelated to selection, not removed)', toolbarExcelOk && (await toolbarExcelBtn.count()) === 1)
  await pick(rowOf(page, rs[3].name)).click()
  const dl = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', { name: /Excel 내보내기/ }).click()
  const download = await dl.catch(() => null)
  ok('STEP-F 선택 항목 Excel 내보내기 triggers a file download', !!download, download?.suggestedFilename())
  await ctx.close()
}

await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
