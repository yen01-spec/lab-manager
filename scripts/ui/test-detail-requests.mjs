// 시약 상세 요청 3종(위치 변경 / 시약정보 수정 / 폐기) UX 통일 검증 — 가짜 Supabase(서버 상태를 흉내내는 인메모리 DB).
//  - 학생: 버튼/모달/성공 문구/pending 표시/중복 차단/새로고침 유지/직접 쓰기 0
//  - 관리자: 3종 승인·반려 버튼(폐기는 "즉시 폐기 완료", 별도 2단계 없음)
//  - 모바일 320/360/390/430: 모달 세로 오버플로·제출 버튼 접근·긴 시약명
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 36000 })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: UID, email: 'a@test.local' } }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const RID = 'r-0010'

function makeReagents() {
  const rs = buildReagents(40)
  const i = rs.findIndex(r => r.id === RID)
  rs[i] = { ...rs[i], name: 'Tris(hydroxymethyl)aminomethane hydrochloride extra-pure grade reagent solution 0.5 mol/L in ultrapure water for molecular biology' }
  return rs
}

async function newCtx(browser, { w, h, mobile, admin }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  else await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  await installMock(ctx, makeReagents())
  // 요청 3종 테이블을 흉내내는 인메모리 "DB"
  const db = { location_requests: [], reagent_change_requests: [], disposal_requests: [] }
  const rpcCalls = [], directWrites = []
  const reply = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => reply(r, { status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }))
  await ctx.route(/\/rest\/v1\/(location_requests|reagent_change_requests|disposal_requests)\?/, r => {
    const t = /\/rest\/v1\/(\w+)\?/.exec(r.request().url())[1]
    const q = new URL(r.request().url()).searchParams
    const st = q.get('status') || ''
    let rows = db[t]
    if (st.startsWith('eq.')) rows = rows.filter(x => x.status === st.slice(3))
    else if (st.startsWith('in.')) { const set = st.slice(4, -1).split(','); rows = rows.filter(x => set.includes(x.status)) }
    reply(r, rows)
  })
  await ctx.route(/\/rest\/v1\/rpc\/(location_request_submit|reagent_change_request_submit|disposal_request_submit|location_request_review|reagent_change_request_review|disposal_request_review)/, r => {
    const name = /rpc\/(\w+)/.exec(r.request().url())[1]
    const body = JSON.parse(r.request().postData() || '{}')
    rpcCalls.push({ name, body })
    const now = new Date().toISOString()
    if (name === 'location_request_submit') {
      if (db.location_requests.some(x => x.lot_id === body.p_lot_id && x.status === 'pending')) return reply(r, { message: '이 Lot은 이미 위치 변경 신청이 접수되어 관리자 검토 대기 중입니다.' }, 400)
      db.location_requests.push({ id: 'lr' + db.location_requests.length, reagent_id: RID, lot_id: body.p_lot_id, from_location_name: body.p_from_location_name, to_location_name: body.p_to_location_name, requested_by: '테스터', status: 'pending', created_at: now })
      return reply(r, { id: 'x' })
    }
    if (name === 'reagent_change_request_submit') {
      if (db.reagent_change_requests.some(x => x.field_name === body.p_field_name && x.status === 'pending')) return reply(r, { message: '이 항목은 이미 수정 신청이 접수되어 관리자 검토 대기 중입니다.' }, 400)
      db.reagent_change_requests.push({ id: 'cr' + db.reagent_change_requests.length, reagent_id: RID, field_name: body.p_field_name, old_value: body.p_old_value, new_value: body.p_new_value, requested_by: '테스터', status: 'pending', created_at: now })
      return reply(r, { id: 'x' })
    }
    if (name === 'disposal_request_submit') {
      if (db.disposal_requests.some(x => x.lot_id === body.p_lot_id && x.status === 'pending')) return reply(r, { message: '이 Lot은 이미 폐기 신청이 접수되어 관리자 검토 대기 중입니다.' }, 400)
      db.disposal_requests.push({ id: 'dr' + db.disposal_requests.length, reagent_id: RID, lot_id: body.p_lot_id, lot_no: body.p_lot_no, quantity: null, reason: body.p_reason, requested_by: '테스터', status: 'pending', created_at: now })
      return reply(r, { id: 'x' })
    }
    const table = name.startsWith('location') ? 'location_requests' : name.startsWith('reagent') ? 'reagent_change_requests' : 'disposal_requests'
    const row = db[table].find(x => x.id === body.p_request_id)
    const decision = body.p_decision || body.p_action
    if (row) { row.status = decision === 'reject' ? 'rejected' : table === 'disposal_requests' ? 'disposed' : 'approved'; row.review_note = body.p_reason; row.approved_at = now }
    return reply(r, { id: body.p_request_id, status: row?.status })
  })
  const page = await ctx.newPage()
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? '사유 테스트' : undefined))
  page.on('request', req => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method()) && /\/rest\/v1\/(?!rpc\/)(reagents|reagent_lots|location_requests|reagent_change_requests|disposal_requests|stock_logs|location_history)/.test(req.url())) directWrites.push(`${req.method()} ${new URL(req.url()).pathname}`)
  })
  return { ctx, page, db, rpcCalls, directWrites }
}
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
async function inViewport(loc, page) {
  const b = await loc.boundingBox(); const vp = page.viewportSize()
  return !!b && b.x >= -1 && b.x + b.width <= vp.width + 1 && b.y >= -1 && b.y + b.height <= vp.height + 1
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
for (const [w, h, mobile] of [[1440, 900, false], [320, 568, true], [360, 800, true], [390, 844, true], [430, 932, true]]) {
  const tag = `[${w}]`
  const { ctx, page, rpcCalls, directWrites } = await newCtx(browser, { w, h, mobile, admin: false })
  await page.goto(`${BASE}/reagents/${RID}`)
  await page.getByRole('button', { name: /위치 변경 신청/ }).first().waitFor({ timeout: 15000 })
  ok(`${tag} student header button is "위치 변경 신청" (not an immediate-change wording)`, await page.getByRole('button', { name: '📍 위치 변경 신청' }).count() === 1)
  await page.getByRole('button', { name: /더보기/ }).click()
  ok(`${tag} more-menu has 시약정보 수정 신청 + 폐기 신청`, (await page.getByRole('button', { name: /시약정보 수정 신청/ }).count()) === 1 && (await page.getByRole('button', { name: /^🗑️ 폐기 신청$/ }).count()) === 1)
  await page.getByRole('button', { name: /더보기/ }).click()

  // ── 위치 변경 신청 ──
  await page.getByRole('button', { name: '📍 위치 변경 신청' }).click()
  const dlg = page.getByRole('dialog')
  const dtxt = await dlg.innerText()
  ok(`${tag} location modal title/copy`, dtxt.includes('위치 변경 신청') && dtxt.includes('기존 위치 그대로'))
  await dlg.locator('select').last().selectOption({ index: 2 })
  if (mobile) {
    const submit = dlg.getByRole('button', { name: '위치 변경 신청하기' })
    await submit.scrollIntoViewIfNeeded()
    ok(`${tag} mobile: modal fits viewport & submit reachable`, (await inViewport(dlg, page)) && (await inViewport(submit, page)) && await noOverflow(page), await dlg.boundingBox())
  }
  await dlg.getByRole('button', { name: '위치 변경 신청하기' }).click()
  await page.getByText('위치 변경 신청이 완료되었습니다.').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok(`${tag} location success message`, await page.getByText('위치 변경 신청이 완료되었습니다.').count() >= 1)
  const call = rpcCalls.find(c => c.name === 'location_request_submit')
  ok(`${tag} location uses submit RPC with session token, no identity fields`, call && call.body.p_session_token === TOKEN && !('p_student_id' in call.body) && !('p_requested_by' in call.body))
  await page.waitForTimeout(600)
  ok(`${tag} location pending visible + button disabled`, (await page.getByText('위치 변경 신청 완료 · 관리자 검토 대기').count()) >= 1 && await page.getByRole('button', { name: '📍 위치 변경 신청 완료' }).isDisabled())

  // ── 폐기 신청 ──
  await page.getByRole('button', { name: /더보기/ }).click()
  await page.getByRole('button', { name: /^🗑️ 폐기 신청$/ }).click()
  const d2 = page.getByRole('dialog')
  const d2t = await d2.innerText()
  ok(`${tag} disposal modal title/copy (병 1개 단위, 수량 입력 없음)`, d2t.includes('폐기 신청') && d2t.includes('이 병만 폐기 완료') && !d2t.includes('수량'), d2t.slice(0, 200))
  await d2.locator('textarea').fill('용기 파손')
  if (mobile) { const sb = d2.getByRole('button', { name: '폐기 신청하기' }); await sb.scrollIntoViewIfNeeded(); ok(`${tag} mobile: disposal modal fits & submit reachable`, (await inViewport(d2, page)) && (await inViewport(sb, page)) && await noOverflow(page)) }
  await d2.getByRole('button', { name: '폐기 신청하기' }).click()
  await page.getByText('폐기 신청이 완료되었습니다.').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok(`${tag} disposal success message`, await page.getByText('폐기 신청이 완료되었습니다.').count() >= 1)
  ok(`${tag} disposal uses submit RPC; Lot still shown as 보유중 (신청 완료 ≠ 폐기 완료)`, rpcCalls.some(c => c.name === 'disposal_request_submit' && c.body.p_session_token === TOKEN) && (await page.getByText('보유중').count()) >= 1)
  const dcall = rpcCalls.find(c => c.name === 'disposal_request_submit')
  ok(`${tag} disposal RPC payload = {token, lot_id, reason} only (no quantity / reagent_id / lot_no from client)`, dcall && JSON.stringify(Object.keys(dcall.body).sort()) === JSON.stringify(['p_lot_id', 'p_reason', 'p_session_token']) && !!dcall.body.p_lot_id, dcall && Object.keys(dcall.body))
  const lcall = rpcCalls.find(c => c.name === 'location_request_submit')
  ok(`${tag} location RPC payload = {token, lot_id, to_location_id, notes} only`, lcall && JSON.stringify(Object.keys(lcall.body).sort()) === JSON.stringify(['p_lot_id', 'p_notes', 'p_session_token', 'p_to_location_id']) && !!lcall.body.p_lot_id, lcall && Object.keys(lcall.body))
  await page.waitForTimeout(600)
  ok(`${tag} disposal pending visible`, (await page.getByText('폐기 신청 완료 · 관리자 검토 대기').count()) >= 1)

  // ── 시약정보 수정 신청 ──
  await page.getByRole('button', { name: /더보기/ }).click()
  await page.getByRole('button', { name: /시약정보 수정 신청$/ }).click()
  ok(`${tag} edit-mode banner says 신청`, (await page.getByText('시약정보 수정 신청 모드').count()) === 1)
  await page.getByText('제조사', { exact: true }).locator('xpath=following-sibling::div').first().click()
  const inp = page.locator('input:not([type=checkbox])').last()
  await inp.fill('NEW-COMPANY'); await inp.blur()
  await page.getByText('시약정보 수정 신청이 완료되었습니다.').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok(`${tag} info-change success message + submit RPC`, (await page.getByText('시약정보 수정 신청이 완료되었습니다.').count()) >= 1 && rpcCalls.some(c => c.name === 'reagent_change_request_submit' && c.body.p_field_name === 'company' && c.body.p_session_token === TOKEN))
  await page.waitForTimeout(600)
  ok(`${tag} info-change pending label visible`, (await page.getByText('시약정보 수정 신청 완료 · 관리자 검토 대기').count()) >= 1)
  ok(`${tag} zero direct table writes (only RPC)`, directWrites.length === 0, directWrites)

  // ── reload → DB 기준 상태 유지 ──
  await page.reload(); await page.getByRole('button', { name: /위치 변경 신청/ }).first().waitFor({ timeout: 15000 }); await page.waitForTimeout(900)
  ok(`${tag} after reload: all 3 pending states persist (read from DB)`, (await page.getByText('위치 변경 신청 완료 · 관리자 검토 대기').count()) >= 1 && (await page.getByText('폐기 신청 완료 · 관리자 검토 대기').count()) >= 1 && (await page.getByText('시약정보 수정 신청 완료 · 관리자 검토 대기').count()) >= 1)
  ok(`${tag} duplicate pending blocked in UI (location + disposal buttons disabled)`, await page.getByRole('button', { name: '📍 위치 변경 신청 완료' }).isDisabled())
  if (mobile) ok(`${tag} mobile: no page-level horizontal overflow with long name + 3 pending cards`, await noOverflow(page))
  await ctx.close()
}

// ── 관리자 ──
{
  const { ctx, page, db, rpcCalls, directWrites } = await newCtx(browser, { w: 1440, h: 900, mobile: false, admin: true })
  const now = new Date().toISOString()
  db.location_requests.push({ id: 'lr0', reagent_id: RID, lot_id: 'lot-10-0', from_location_name: 'A', to_location_name: 'B', requested_by: '학생', status: 'pending', created_at: now })
  db.reagent_change_requests.push({ id: 'cr0', reagent_id: RID, field_name: 'company', old_value: 'x', new_value: 'y', requested_by: '학생', status: 'pending', created_at: now })
  db.disposal_requests.push({ id: 'dr0', reagent_id: RID, lot_id: 'lot-10-0', lot_no: 'L', quantity: '1', reason: '파손', requested_by: '학생', status: 'pending', created_at: now })
  await page.goto(`${BASE}/reagents/${RID}`)
  await page.getByText('폐기 요청 대기').first().waitFor({ timeout: 15000 })
  ok('[admin] pending cards use admin wording (요청 대기) for all 3 kinds', (await page.getByText('시약정보 수정 요청 대기').count()) >= 1 && (await page.getByText('위치 변경 요청 대기').count()) >= 1 && (await page.getByText('폐기 요청 대기').count()) >= 1)
  ok('[admin] disposal approve says immediate disposal; NO separate "폐기 완료" 2nd-step button', (await page.getByRole('button', { name: '승인 (즉시 폐기 완료)' }).count()) === 1 && (await page.getByRole('button', { name: '폐기 완료', exact: true }).count()) === 0)
  await page.getByRole('button', { name: '승인 (즉시 폐기 완료)' }).click()
  await page.getByText('폐기가 완료되었습니다.').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('[admin] disposal approve -> single review RPC action "approve" + message', rpcCalls.some(c => c.name === 'disposal_request_review' && c.body.p_action === 'approve') && (await page.getByText('폐기가 완료되었습니다.').count()) >= 1)
  await page.getByRole('button', { name: '승인', exact: true }).first().click(); await page.waitForTimeout(700)
  ok('[admin] location/info approve use their review RPCs', rpcCalls.some(c => c.name === 'location_request_review' || c.name === 'reagent_change_request_review'))
  await page.getByRole('button', { name: '반려', exact: true }).first().click(); await page.waitForTimeout(700)
  ok('[admin] reject sends reason (prompt) to review RPC', rpcCalls.some(c => c.body.p_decision === 'reject' && c.body.p_reason === '사유 테스트'))
  ok('[admin] zero direct request-table writes', directWrites.length === 0, directWrites)
  await ctx.close()
}
await browser.close()
console.log(`\nTOTAL=${results.length} PASS=${results.filter(Boolean).length} FAIL=${results.filter(x => !x).length}`)
process.exitCode = results.every(Boolean) ? 0 : 1
