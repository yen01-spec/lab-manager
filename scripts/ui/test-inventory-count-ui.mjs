// 재고실사 입력 화면 → RPC 연동 확인: 학생이 잔량을 입력하면 inventory_count_save 가 올바른 payload(세션 토큰, 잔량/미개봉만)로 호출되고
// reagents/reagent_lots 를 직접 쓰는 요청은 하나도 나가지 않아야 한다(장부 불변).
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
const reagents = buildReagents(12)
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d ? ' — ' + JSON.stringify(d) : ''}`) }
for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile })
  await ctx.addInitScript(() => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: 'tok-abcdefghijklmnopqrstuvwxyz0123456789' })))
  const counts = reagents.slice(0, 6).flatMap((r, i) => r.reagent_lots.map((l, k) => ({ id: i * 10 + k + 1, session_id: 7, reagent_id: r.id, lot_id: l.id, book_sealed: l.sealed_count, book_stock: l.current_stock, actual_sealed: null, actual_stock: null, reported_missing: false, staged_location_id: null, staged_reagent_fields: null, staged_lot_fields: null, is_new_registration: false, book_location_id: l.location_id })))
  const stats = await installMock(ctx, reagents, { requests: [], reagentQueries: 0, session: { id: 7, status: 'active', label: 't', year: 2026, start_date: '2026-09-20', created_by: 'admin', purpose: 'current_list' }, counts })
  const rpcBodies = []; const writes = []
  page_setup: {
    await ctx.route(/\/rest\/v1\/rpc\/(student_session_refresh|inventory_count_save)/, async r => {
      const u = r.request().url()
      if (u.includes('student_session_refresh')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'ok', student_id: 'S1', name: '테스터', session_token: 'tok-abcdefghijklmnopqrstuvwxyz0123456789' }) })
      const body = JSON.parse(r.request().postData() || '{}'); rpcBodies.push(body)
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: body.p_count_id, actual_stock: body.p_fields.actual_stock, actual_sealed: body.p_fields.actual_sealed, counted_by: '테스터' }) })
    })
    ctx.on('request', req => { if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method()) && /\/rest\/v1\/(reagents|reagent_lots|stock_logs|location_history|inventory_counts|inventory_sessions)\b/.test(req.url())) writes.push(`${req.method()} ${new URL(req.url()).pathname}`) })
  }
  const page = await ctx.newPage()
  page.on('dialog', d => d.accept())
  await page.goto(BASE + '/inventory'); await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /실사 (입력 시작|이어서 진행)/ }).click()
  await page.waitForTimeout(1500)
  if (mobile) {
    // 모바일: 목록에서 항목을 탭 → 입력 화면에서 [완료]
    await page.getByText('A0000 acid (99%)').first().tap(); await page.waitForTimeout(700)
    if (process.env.SHOT) await page.screenshot({ path: 'count-panel.png' })
    await page.getByRole('button', { name: '저장 및 다음' }).tap(); await page.waitForTimeout(900)
    ok(`[${w}] mobile: inventory_count_save called via '저장 및 다음' with token + stock/sealed only`, rpcBodies.length >= 1 && rpcBodies[0].p_session_token?.startsWith('tok-') && Object.keys(rpcBodies[0].p_fields).sort().join() === 'actual_sealed,actual_stock', rpcBodies[0])
    ok(`[${w}] mobile: NO direct write to ledger/count/session tables`, writes.length === 0, writes)
  } else {
    const input = page.locator('input[type=number], input[inputmode=numeric]').first()
    const visible = await input.isVisible().catch(() => false)
    ok(`[${w}] count view renders editable stock input`, visible)
    if (visible) {
      await input.fill('37'); await input.press('Enter'); await page.waitForTimeout(800)
      ok(`[${w}] inventory_count_save called once with token + stock/sealed only`, rpcBodies.length >= 1 && rpcBodies[0].p_session_token?.startsWith('tok-') && rpcBodies[0].p_fields.actual_stock === 37 && Object.keys(rpcBodies[0].p_fields).sort().join() === 'actual_sealed,actual_stock', rpcBodies[0])
      ok(`[${w}] NO direct write to ledger/count/session tables`, writes.length === 0, writes)
    }
  }
  await ctx.close()
}
await browser.close()
console.log(`\nTOTAL=${results.length} PASS=${results.filter(Boolean).length} FAIL=${results.filter(x => !x).length}`)
process.exitCode = results.every(Boolean) ? 0 : 1
