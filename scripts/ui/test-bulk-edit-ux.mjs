// 시약 일괄정리 UX — 시약목록과 같은 정렬/검색/위치 필터/A–Z, 필터 적용 버튼 제거, 병 단위 child row, 선택 유지, 가로 overflow 0. 가짜 Supabase.
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }

const rs = buildReagents(240)
// r-0003: 두 병 모두 같은 Lot No. "SAME-LOT" (병 identity 는 lot id), 둘 다 미개봉 1병·개봉
rs[3].reagent_lots = [
  { id: 'lot-3-0', status: 'active', sealed_count: 1, current_stock: 100, location_id: 'loc-a1', lot_no: 'SAME-LOT', expiry_date: null, cat_no: null, pending_confirm: false },
  { id: 'lot-3-1', status: 'active', sealed_count: 0, current_stock: 35, location_id: 'loc-c1', lot_no: 'SAME-LOT', expiry_date: null, cat_no: null, pending_confirm: false },
]
// 추천/검색용 고정 시약
rs[10] = { ...rs[10], name: 'Acetic acid', name_ko: '아세트산', cas_no: '64-19-7', sort_letter: 'A' }
rs[11] = { ...rs[11], name: 'Acetone', name_ko: '아세톤', cas_no: '67-64-1', sort_letter: 'A' }

const VIEWPORTS = [[1366, 768], [1440, 900], [1920, 1080], [320, 568], [360, 800], [390, 844], [430, 932]]
const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function open(w, h, { admin = true } = {}) {
  const mobile = w < 768
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile })
  if (admin) await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  else await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  await installMock(ctx, rs)
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => reply(r, { status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }))
  const writes = []
  ctx.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.dismiss())
  await page.goto(BASE + '/reagents/bulk-edit', { waitUntil: 'domcontentloaded' })
  await page.getByText(/검색결과/).first().waitFor({ timeout: 20000 })
  await page.locator('[data-lot-id]').first().waitFor({ timeout: 20000 })
  return { ctx, page, errors, writes, mobile }
}
const overflowX = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const summary = async page => { const t = (await page.getByText(/^검색결과/).first().innerText()).replace(/\s+/g, ' '); const m = t.match(/검색결과 ([\d,]+)개 시약 · ([\d,]+)개 Lot/); return m ? { reagents: +m[1].replace(/,/g, ''), lots: +m[2].replace(/,/g, ''), text: t } : { text: t } }
const rowsOf = page => page.locator('[data-lot-id]')
const settle = page => page.waitForTimeout(350)

for (const [w, h] of VIEWPORTS) {
  const tag = `${w}x${h}`
  const { ctx, page, errors, writes, mobile } = await open(w, h)
  const s0 = await summary(page)
  const expLots = rs.reduce((n, r) => n + r.reagent_lots.filter(l => l.status === 'active').length, 0)
  ok(`[${tag}] summary line: 검색결과 N개 시약 · M개 Lot (all holdings, like Reagent List wording)`, s0.reagents === rs.length && s0.lots === expLots, s0)
  ok(`[${tag}] no "필터 적용" button; no horizontal overflow`, (await page.getByRole('button', { name: '필터 적용' }).count()) === 0 && (await overflowX(page)) <= 0, await overflowX(page))
  ok(`[${tag}] selected chip shows "선택된 0개 Lot"; move/dispose disabled`, (await page.getByTestId('selected-count').innerText()).includes('선택된 0개 Lot') && await page.getByRole('button', { name: /위치 변경/ }).isDisabled() && await page.getByRole('button', { name: /^🗑️ 폐기/ }).isDisabled())

  // ── 같은 시약 다중 Lot + 같은 Lot No. ──
  const r3 = page.locator('[data-lot-id="lot-3-0"], [data-lot-id="lot-3-1"]')
  const t0 = (await page.locator('[data-lot-id="lot-3-0"]').innerText()).replace(/\s+/g, ' ')
  const t1 = (await page.locator('[data-lot-id="lot-3-1"]').innerText()).replace(/\s+/g, ' ')
  ok(`[${tag}] multi-lot reagent: each bottle row shows Lot No · 위치 · 개봉/미개봉 · 잔량 (not just ↳)`,
    t0.includes('병 1/2') && t1.includes('병 2/2') && t0.includes('SAME-LOT') && t1.includes('SAME-LOT') && t0.includes('5호관 101') && t1.includes('냉장실') && t0.includes('미개봉') && t1.includes('개봉') && t0.includes('100%') && t1.includes('35%'), { t0, t1 })
  ok(`[${tag}] bottle identity tooltip carries the full reagent_lots.id (admin aid)`, (await page.locator('[data-lot-id="lot-3-0"] [title^="병 ID:"]').first().getAttribute('title')) === '병 ID: lot-3-0')
  ok(`[${tag}] same lot_no on two bottles → two independent checkboxes`, (await r3.count()) === 2)
  await page.locator('[data-lot-id="lot-3-0"] input[type=checkbox]').check()
  ok(`[${tag}] checking bottle 1 selects only that lot id (bottle 2 stays unchecked)`, await page.locator('[data-lot-id="lot-3-0"] input').isChecked() && !(await page.locator('[data-lot-id="lot-3-1"] input').isChecked()) && (await page.getByTestId('selected-count').innerText()).includes('선택된 1개 Lot'))
  ok(`[${tag}] 위치 변경 / 폐기 buttons enabled once a lot is selected`, await page.getByRole('button', { name: /위치 변경/ }).isEnabled() && await page.getByRole('button', { name: /^🗑️ 폐기/ }).isEnabled())

  // ── 실험실 필터: 즉시 적용, 선택 유지 ──
  const roomTab = page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: '5호관 102', exact: true })
  await roomTab.click(); await settle(page)
  const s1 = await summary(page)
  const locsShown = await page.evaluate(() => [...document.querySelectorAll('[data-lot-id]')].map(e => e.innerText))
  ok(`[${tag}] room filter applies immediately (no apply button) and shows only that room's bottles + real filtered counts`, s1.lots < s0.lots && s1.lots > 0 && locsShown.every(t => t.includes('5호관 102')) && s1.text.includes('전체'), s1)
  ok(`[${tag}] selection survives a filter change and hidden selection is announced`, (await page.getByTestId('selected-count').innerText()).includes('선택된 1개 Lot') && (await page.getByText(/현재 목록 밖에 있어요/).count()) === 1)
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: '전체', exact: true }).click(); await settle(page)
  ok(`[${tag}] back to 전체: counts restored, hidden note gone`, (await summary(page)).lots === s0.lots && (await page.getByText(/현재 목록 밖에 있어요/).count()) === 0)

  // ── 검색: autocomplete(추천 선택) + Enter ──
  const box = page.getByPlaceholder(/시약명\(국문·영문\) 또는 CAS/).first()
  await box.fill('아세트'); await page.waitForTimeout(500)
  const popupOk = await page.getByTestId('reagent-suggest-popover').isVisible()
  await page.getByRole('option').first().click(); await settle(page)
  const s2 = await summary(page)
  ok(`[${tag}] autocomplete pick (Korean partial) → only that reagent`, popupOk && s2.reagents === 1, s2)
  // A–Z 병행: 추천으로 1개만 남으면 A 만 활성
  const availTxt = mobile
    ? null
    : await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^[A-Z]$/.test(b.textContent.trim()) && !b.disabled).map(b => b.textContent.trim()))
  ok(`[${tag}] A–Z index follows the filtered result (only A enabled after picking "Acetic acid")`, mobile ? true : (availTxt.length === 1 && availTxt[0] === 'A'), availTxt)
  await box.fill(''); await box.press('Enter'); await settle(page)
  ok(`[${tag}] Enter on empty search clears the filter`, (await summary(page)).reagents === rs.length)
  await box.fill('64197'); await box.press('Enter'); await settle(page)
  const s3 = await summary(page)
  ok(`[${tag}] Enter search: CAS without hyphens (64197) finds Acetic acid`, s3.reagents === 1 && (await page.locator('main').innerText()).includes('Acetic acid'), s3)
  await page.mouse.move(2, 2); await box.fill('acet'); await page.waitForTimeout(400); await box.press('Enter'); await settle(page)
  const s4 = await summary(page)
  ok(`[${tag}] Enter search "acet" → Acetic acid + Acetone (english partial)`, s4.reagents >= 2, s4)
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: '5호관 101', exact: true }).click(); await settle(page)
  const s5 = await summary(page)
  ok(`[${tag}] search + room filter combine (AND)`, s5.reagents <= s4.reagents && (await rowsOf(page).count()) === s5.lots, { s4: s4.reagents, s5 })
  await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: '전체', exact: true }).click(); await box.fill(''); await box.press('Enter'); await settle(page)

  // ── A–Z jump ──
  if (mobile) {
    await page.getByRole('button', { name: '알파벳으로 이동' }).click()
    await page.getByRole('dialog', { name: '알파벳 바로가기' }).getByRole('button', { name: 'M', exact: true }).click()
  } else {
    await page.locator('button', { hasText: /^M$/ }).first().click()
  }
  await page.waitForTimeout(400)
  const mTop = await page.evaluate(() => document.querySelector('[data-bulk-letter="M"]').getBoundingClientRect().top)
  ok(`[${tag}] A–Z: clicking M jumps to the M group (header near the top, below the fixed header)`, mTop >= 40 && mTop < 260, mTop)
  ok(`[${tag}] after jump: still no horizontal overflow`, (await overflowX(page)) <= 0)
  ok(`[${tag}] no DB writes, no page errors`, writes.length === 0 && errors.length === 0, { writes, errors })
  await ctx.close()
}

// ── 정렬 기준: 시약목록과 같은 sort_letter / 영문명 정렬 ──
{
  const { ctx, page } = await open(1440, 900)
  const letters = await page.evaluate(() => [...document.querySelectorAll('[data-bulk-letter]')].map(e => e.getAttribute('data-bulk-letter')))
  const sorted = [...letters].sort()
  const names = await page.evaluate(() => [...document.querySelectorAll('tbody tr[data-lot-id]')].length)
  ok('sort: groups follow sort_letter code-point order (same helper as Reagent List)', JSON.stringify(letters) === JSON.stringify(sorted) && letters.length >= 20, letters.join(''))
  ok('sort: reagents within a group are in english-name order (localeCompare, same as Reagent List)', await page.evaluate(() => {
    const groups = {}; let cur = null
    for (const tr of document.querySelectorAll('tbody tr')) {
      if (tr.hasAttribute('data-bulk-letter')) { cur = tr.getAttribute('data-bulk-letter'); groups[cur] = []; continue }
      const t = tr.querySelector('td span[style*="font-weight: 600"]'); if (t && cur) groups[cur].push(t.textContent)
    }
    return Object.values(groups).every(a => a.every((n, i) => i === 0 || a[i - 1].localeCompare(n) <= 0))
  }))
  ok('rows rendered for every active bottle', names === rs.reduce((n, r) => n + r.reagent_lots.length, 0), names)
  await ctx.close()
}
// ── 일반 사용자(신청) 화면도 같은 구조 ──
{
  const { ctx, page, errors } = await open(1366, 768, { admin: false })
  ok('non-admin: same search/filter UI; buttons say 신청', (await page.getByRole('button', { name: /위치 변경 신청/ }).count()) === 1 && (await page.getByRole('group', { name: '실험실 필터' }).getByRole('button', { name: '전체', exact: true }).count()) === 1)
  ok('non-admin: no page errors', errors.length === 0, errors)
  await ctx.close()
}
// ── ResourceReagentList 는 dead code 가 아니다: /resources?c=special&s=targets(자료 > 특별관리물질 > 대상물질)에서 실제 렌더 ──
{
  const { ctx, page, errors } = await open(1366, 768)
  await page.goto(BASE + '/resources?c=special&s=targets', { waitUntil: 'domcontentloaded' })
  await page.getByText('현재 연구실 특별관리물질').first().waitFor({ timeout: 15000 })
  ok('ResourceReagentList is live: rendered on /resources?c=special&s=targets (embed specialTargets)', (await page.getByText(/CAS 기준으로 중복 제거한 물질 종류 수/).count()) >= 1 && errors.length === 0, errors)
  await ctx.close()
}
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
