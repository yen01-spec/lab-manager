// 시약 검색 자동추천(ReagentSearchInput) 통일 검증 — 모든 시약 검색 surface. 가짜 Supabase(실제 네트워크 없음).
//  영문(Acetic acid) / 부분 영문(acet) / 한글(아세트산) / CAS(64-19-7) / 없는 값(zzzz-not-found)
//  클릭 · ↑↓ · Enter · Escape · ARIA · 빈 입력 · 요청 수 · 모바일(320/360/390/430) · 잘림/화면 밖 · 재고실사 범위 제한
import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'
const axeSrc = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }

const rs = buildReagents(60)
const put = (i, o) => { rs[i] = { ...rs[i], ...o, sort_letter: (o.name || rs[i].name)[0].toUpperCase() } }
put(20, { name: 'Acetic acid', name_ko: '아세트산', cas_no: '64-19-7', company: 'Daejung' })
put(21, { name: 'Acetone', name_ko: '아세톤', cas_no: '67-64-1', company: 'Sigma-Aldrich' })
put(22, { name: 'Barium acetate', name_ko: '아세트산바륨', cas_no: '543-80-6', company: 'Junsei' })
put(50, { name: 'Acetylene', name_ko: '아세틸렌', cas_no: '74-86-2', company: 'Samchun' })   // 재고실사 세션 범위 밖
const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789'
const INDEX_REQ = /rest\/v1\/reagents\?select=id%2C\+?name%2C\+?name_ko%2C\+?cas_no%2C\+?company%2C\+?category%2C\+?purity/

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
async function open(w, h, { mobile = false, session = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile })
  await ctx.addInitScript(t => localStorage.setItem('lm_session', JSON.stringify({ student_id: 'S1', name: '테스터', session_token: t })), TOKEN)
  const stats = await installMock(ctx, rs, session
    ? { requests: [], reagentQueries: 0, session: { id: 7, status: 'active', label: 't', year: 2026, start_date: '2026-09-20', created_by: 'admin', purpose: 'current_list' },
        counts: rs.slice(20, 23).flatMap((r, i) => r.reagent_lots.map((l, k) => ({ id: i * 10 + k + 1, session_id: 7, reagent_id: r.id, lot_id: l.id, book_sealed: l.sealed_count, book_stock: l.current_stock, actual_sealed: null, actual_stock: null, counted_by: null, is_locked: false }))) }
    : undefined)
  await ctx.route(/\/rest\/v1\/rpc\/student_session_refresh/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 'ok', student_id: 'S1', name: '테스터', session_token: TOKEN }) }))
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.on('dialog', d => d.accept())
  return { ctx, page, stats, errors }
}
const pop = page => page.getByTestId('reagent-suggest-popover')
const opts = page => pop(page).locator('[role=option]')
const type = async (page, box, v) => { await box.fill(v); await page.waitForTimeout(400) }
const optTexts = async page => (await opts(page).allInnerTexts()).map(t => t.replace(/\s+/g, ' '))

// ── surface 정의 ───────────────────────────────────────────────────────────
const SURFACES = [
  { key: 'reagent-list', path: '/reagents/list', ph: /시약명.*CAS/,
    afterSelect: async page => { await page.waitForURL(/\/reagents\/r-0020/, { timeout: 8000 }); return true },
    afterEnter: async page => { await page.waitForFunction(() => new URL(location.href).searchParams.get('q') === 'acet', null, { timeout: 8000 }); return true } },
  { key: 'home', path: '/', ph: /예\) Acetone/,
    afterSelect: async page => { await page.waitForURL(/\/reagents\/r-0020/, { timeout: 8000 }); return true },
    afterEnter: async page => { await page.waitForURL(/\/reagents\/list\?q=acet/, { timeout: 8000 }); return true } },
  { key: 'purchase-request', path: '/purchase-request', ph: /화학물질명 또는 CAS/,
    afterSelect: async page => { await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === '64-19-7'), null, { timeout: 5000 }); return true },
    afterEnter: null },
  // 시약 일괄정리(/reagents/bulk-edit)는 시약목록에 통합되어 redirect만 남음 — 이 surface의 검색창은 'reagent-list' surface와 같다(중복 제거).
  { key: 'register-modal', path: '/reagents/list', ph: /Acetone — 이미 있는 시약이면/, prep: async page => { await page.getByRole('button', { name: /신규 시약 등록/ }).click(); await page.getByText('시약명 *').waitFor({ timeout: 8000 }) },
    afterSelect: async page => { await page.getByText('기존 시약에 새 Lot만 추가돼요').waitFor({ timeout: 5000 }); return true }, afterEnter: null },
]

async function box(page, s) {
  await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded' })
  if (s.prep) await s.prep(page)
  const b = page.getByPlaceholder(s.ph).first()
  await b.waitFor({ timeout: 15000 })
  await page.waitForTimeout(600)
  return b
}

for (const s of SURFACES) {
  const { ctx, page, stats, errors } = await open(1280, 900)
  const b = await box(page, s)
  const tag = `[${s.key}]`
  const indexReqBefore = stats.requests.filter(r => INDEX_REQ.test(r)).length
  await b.focus()
  ok(`${tag} empty focus: no popover (no 1,323-item dump)`, (await pop(page).count()) === 0)
  ok(`${tag} ARIA: role=combobox, aria-autocomplete=list, aria-expanded=false when closed`, (await b.getAttribute('role')) === 'combobox' && (await b.getAttribute('aria-autocomplete')) === 'list' && (await b.getAttribute('aria-expanded')) === 'false')

  await type(page, b, 'Acetic acid')
  let t = await optTexts(page)
  ok(`${tag} English "Acetic acid": first suggestion is Acetic acid with 국문명 · CAS · 제조사`, t[0]?.startsWith('Acetic acid') && t[0].includes('아세트산') && t[0].includes('64-19-7') && t[0].includes('Daejung'), t[0])
  const ctl = await b.getAttribute('aria-controls')
  ok(`${tag} ARIA open: aria-expanded=true, aria-controls → role=listbox, items role=option (≤10)`, (await b.getAttribute('aria-expanded')) === 'true' && !!ctl && (await page.locator(`[id="${ctl}"]`).getAttribute('role')) === 'listbox' && t.length >= 1 && t.length <= 10)
  ok(`${tag} highlight: matched text is emphasised (<mark>)`, (await pop(page).locator('mark').count()) >= 1)
  await type(page, b, 'acet')
  t = await optTexts(page)
  ok(`${tag} partial English "acet": Acetic acid + Acetone (+ others), ≤10 items`, t.some(x => x.startsWith('Acetic acid')) && t.some(x => x.startsWith('Acetone')) && t.length <= 10, t.length)
  await type(page, b, '아세트산')
  t = await optTexts(page)
  ok(`${tag} Korean "아세트산": 아세트산(Acetic acid) and 아세트산바륨 found`, t.some(x => x.includes('Acetic acid')) && t.some(x => x.includes('아세트산바륨')), t.slice(0, 3))
  await type(page, b, '64-19-7')
  t = await optTexts(page)
  ok(`${tag} CAS "64-19-7": Acetic acid`, t.length >= 1 && t[0].startsWith('Acetic acid'), t)
  await type(page, b, '64197')
  ok(`${tag} CAS without hyphens "64197": Acetic acid`, (await optTexts(page))[0]?.startsWith('Acetic acid'))
  await type(page, b, 'zzzz-not-found')
  ok(`${tag} not found: "일치하는 시약이 없습니다."`, (await pop(page).innerText()).includes('일치하는 시약이 없습니다.') && (await opts(page).count()) === 0)
  const indexReqs = stats.requests.filter(r => INDEX_REQ.test(r)).length - indexReqBefore
  ok(`${tag} data: 7 searches typed → at most ONE shared index request (no per-keystroke fetch)`, indexReqs <= 1, indexReqs)

  // 키보드
  await type(page, b, 'acet')
  await b.press('ArrowDown'); await page.waitForTimeout(80)
  let ad = await b.getAttribute('aria-activedescendant')
  ok(`${tag} keyboard ↓: aria-activedescendant → first option (aria-selected)`, !!ad && (await page.locator(`[id="${ad}"]`).getAttribute('aria-selected')) === 'true')
  await b.press('ArrowDown'); const ad2 = await b.getAttribute('aria-activedescendant')
  ok(`${tag} keyboard ↓↓ moves, ↑ moves back`, ad2 !== ad && (await (async () => { await b.press('ArrowUp'); return (await b.getAttribute('aria-activedescendant')) === ad })()))
  await b.press('Escape'); await page.waitForTimeout(80)
  ok(`${tag} Escape closes the popover and keeps the typed text`, (await pop(page).count()) === 0 && (await b.inputValue()) === 'acet' && (await b.getAttribute('aria-expanded')) === 'false')
  await b.press('ArrowDown'); await page.waitForTimeout(80)
  ok(`${tag} ↓ re-opens the list`, (await pop(page).count()) === 1)
  await b.press('Tab'); await page.waitForTimeout(80)
  ok(`${tag} Tab closes the popover (focus flow not trapped)`, (await pop(page).count()) === 0)

  if (s.afterEnter) {
    await b.focus(); await type(page, b, 'acet')
    await b.press('Enter')
    ok(`${tag} Enter with no highlighted item = normal search of the typed text`, await s.afterEnter(page).catch(() => false))
    await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded' }); if (s.prep) await s.prep(page)
  } else {
    await b.focus(); await type(page, b, 'acet'); await b.press('Enter'); await page.waitForTimeout(200)
    ok(`${tag} Enter with no highlight does not pick a suggestion or submit anything`, (await b.inputValue()) === 'acet')
  }
  const b2 = page.getByPlaceholder(s.ph).first()
  await b2.waitFor({ timeout: 15000 }); await page.waitForTimeout(400)
  await type(page, b2, 'Acetic')
  await b2.press('ArrowDown'); await b2.press('Enter')
  ok(`${tag} keyboard ↓ + Enter selects the highlighted reagent → surface action`, await s.afterSelect(page).catch(() => false))
  ok(`${tag} no page errors`, errors.length === 0, errors)
  await ctx.close()
}

// 마우스 클릭(추천 클릭)
for (const s of SURFACES.filter(x => x.key !== 'reagent-list')) {
  const { ctx, page } = await open(1280, 900)
  const b = await box(page, s)
  await type(page, b, 'Acetic')
  await opts(page).first().click()
  ok(`[${s.key}] mouse click on a suggestion → surface action`, await s.afterSelect(page).catch(() => false))
  await ctx.close()
}
{
  const { ctx, page } = await open(1280, 900)
  const b = await box(page, SURFACES[0]); await type(page, b, 'Acetic'); await opts(page).first().click()
  ok('[reagent-list] mouse click on a suggestion → opens that reagent', await SURFACES[0].afterSelect(page).catch(() => false))
  await ctx.close()
}

// ── 목록 URL 상태 복원(60082a2 이후 기능 유지): 검색 확정 → 상세 → 뒤로/새로고침 ─────────────────────────────
{
  const { ctx, page } = await open(1280, 900)
  const b = await box(page, SURFACES[0])
  await b.fill('acet'); await b.press('Enter'); await page.waitForTimeout(800)
  ok('[reagent-list] Enter → URL ?q=acet (search confirmed)', new URL(page.url()).searchParams.get('q') === 'acet')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const b3 = page.getByPlaceholder(SURFACES[0].ph).first(); await b3.waitFor({ timeout: 15000 })
  ok('[reagent-list] reload: input restored from URL, popover NOT auto-open', (await b3.inputValue()) === 'acet' && (await pop(page).count()) === 0)
  await page.getByText('Acetic acid').first().click(); await page.waitForURL(/\/reagents\/r-/, { timeout: 8000 })
  await page.goBack(); await page.waitForTimeout(800)
  const b4 = page.getByPlaceholder(SURFACES[0].ph).first()
  ok('[reagent-list] back from detail: query + input restored, popover closed', new URL(page.url()).searchParams.get('q') === 'acet' && (await b4.inputValue()) === 'acet' && (await pop(page).count()) === 0)
  await ctx.close()
}

// ── 홈: 위치로도 찾기(showLocation) 유지 ────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(1280, 900)
  const b = await box(page, SURFACES[1]); await type(page, b, '5호관 101'); await page.waitForTimeout(500)
  const t = await optTexts(page)
  ok('[home] location term "5호관 101" still suggests reagents kept there (📍 위치)', t.length >= 1 && t.some(x => x.includes('📍')), t.slice(0, 2))
  await ctx.close()
}

// ── 재고실사: 실사 세션 범위 안에서만 추천(범위를 넓히지 않음) + 병(Lot) 단위 항목 ─────────────────────────────
{
  const { ctx, page, errors } = await open(1280, 900, { session: true })
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  await page.getByRole('button', { name: /실사 (입력 시작|이어서 진행)/ }).click(); await page.waitForTimeout(1500)
  const b = page.getByPlaceholder(/시약명\(국문·영문\) \/ CAS \/ Lot No\./).first()
  await b.waitFor({ timeout: 15000 })
  await type(page, b, 'Acetylene')
  ok('[inventory] catalog reagent NOT in this session (Acetylene) is NOT suggested → "기존 목록에 없습니다" action only', (await opts(page).count()) === 0 && (await pop(page).innerText()).includes('기존 목록에 없습니다'))
  await type(page, b, 'acet')
  let t = await optTexts(page)
  ok('[inventory] "acet" suggests only in-session lots: Acetic acid, Acetone, Barium acetate — never Acetylene', t.length >= 2 && t.every(x => !x.includes('Acetylene')) && t.some(x => x.includes('Acetic acid')) && t.some(x => x.includes('Acetone')), t)
  ok('[inventory] lot-level items show Lot No. + location + status (병 단위)', t.every(x => /Lot /.test(x)))
  await type(page, b, '아세트산')
  ok('[inventory] Korean "아세트산" works (국문명 검색)', (await optTexts(page)).some(x => x.includes('Acetic acid')))
  await type(page, b, '64-19-7')
  ok('[inventory] CAS works', (await optTexts(page)).some(x => x.includes('Acetic acid')))
  await type(page, b, 'LOT200')
  ok('[inventory] Lot No. search still works', (await opts(page).count()) >= 1)
  await type(page, b, 'Acetic')
  await b.press('ArrowDown'); await b.press('Enter'); await page.waitForTimeout(600)
  ok('[inventory] ↓ + Enter opens the compare/edit panel for THAT lot (not another)', (await page.evaluate(() => [...document.querySelectorAll('input')].some(i => i.value === 'Acetic acid'))) && (await pop(page).count()) === 0)
  ok('[inventory] no page errors', errors.length === 0, errors)
  await ctx.close()
}

// ── 모바일 4종: 화면 밖/잘림/터치 타깃/짧은 화면 ───────────────────────────────────────────────────────────
for (const [w, h] of [[320, 568], [360, 740], [390, 844], [430, 932]]) {
  for (const s of [SURFACES[0], SURFACES[1], SURFACES.find(x => x.key === 'register-modal')]) {
    const { ctx, page } = await open(w, h, { mobile: true })
    const b = await box(page, s)
    await b.tap(); await b.fill('acet'); await page.waitForTimeout(500)
    const info = await pop(page).evaluate(el => {
      const r = el.getBoundingClientRect(); const first = el.querySelector('[role=option]')?.getBoundingClientRect()
      const cx = r.left + r.width / 2, cy = r.top + Math.min(20, r.height / 2)
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, vw: innerWidth, vh: innerHeight, optH: first?.height, hit: el.contains(document.elementFromPoint(cx, cy)), inBody: el.parentElement === document.body, z: getComputedStyle(el).zIndex, docOverflow: document.documentElement.scrollWidth > innerWidth + 1 }
    })
    ok(`[${w}px ${s.key}] popover fully inside the viewport (no right/bottom clipping) + rendered on <body> (escapes overflow ancestors/modals)`, info.l >= 0 && info.r <= info.vw + 0.5 && info.t >= 0 && info.b <= info.vh + 0.5 && info.inBody && info.hit, info)
    ok(`[${w}px ${s.key}] touch target ≥ 44px, z-index above content, no horizontal page overflow`, info.optH >= 43.5 && Number(info.z) >= 1000 && !info.docOverflow, { optH: info.optH, z: info.z })
    await opts(page).first().tap().catch(() => {})
    ok(`[${w}px ${s.key}] tapping a suggestion selects it`, s.afterSelect ? await s.afterSelect(page).catch(() => false) : true)
    await ctx.close()
  }
}
{
  // 소프트 키보드로 화면 높이가 줄어든 상황(390×340): 위로 뒤집히거나 max-height 로 줄어 화면 안에 유지 + 내부 스크롤
  const { ctx, page } = await open(390, 340, { mobile: true })
  const b = await box(page, SURFACES[1])
  await b.tap(); await b.fill('a'); await page.waitForTimeout(500)
  const info = await pop(page).evaluate(el => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, vh: innerHeight, scrollable: el.scrollHeight > el.clientHeight, oy: getComputedStyle(el).overflowY } })
  ok('[390×340 short viewport ("keyboard open")] popover stays inside the visible area and scrolls internally', info.t >= 0 && info.b <= info.vh + 0.5 && info.oy === 'auto', info)
  await ctx.close()
}

// ── axe 접근성: 추천창이 열린 상태(role=combobox/listbox/option, aria-* 속성 유효성·이름·대비) ───────────────────
for (const s of SURFACES.filter(x => ['reagent-list', 'home', 'register-modal'].includes(x.key))) {
  const { ctx, page } = await open(1280, 900)
  const b = await box(page, s); await type(page, b, 'acet')
  await page.evaluate(src => { (0, eval)(src) }, axeSrc)
  const res = await page.evaluate(async () => { const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, rules: { 'color-contrast': { enabled: false } } }); return r.violations.filter(v => v.nodes.some(n => /combobox|listbox|option|reagent-suggest|aria/i.test(JSON.stringify(n.html) + n.target.join(' ')))).map(v => ({ id: v.id, n: v.nodes.length, html: v.nodes[0].html.slice(0, 120) })) })
  ok(`[${s.key}] axe (WCAG2A/AA, popover open): no violations on the combobox/listbox/options`, res.length === 0, res)
  await ctx.close()
}

// ── 요청 수: 홈 → 시약목록(SPA 이동)에서 같은 시약 인덱스를 재사용(중복 전체 fetch 없음) ──────────────────────
{
  const { ctx, page, stats } = await open(1280, 900)
  const b = await box(page, SURFACES[1])
  for (const v of ['A', 'Ac', 'Ace', 'Acet', 'Aceti', 'Acetic', 'Acetic ', 'Acetic a']) { await b.fill(v); await page.waitForTimeout(220) }
  const afterHome = stats.requests.filter(r => INDEX_REQ.test(r)).length
  await page.getByText('시약 검색', { exact: true }).first().click().catch(async () => { await page.goto(BASE + '/reagents/list') })
  await page.waitForURL(/\/reagents\/list/, { timeout: 8000 })
  const b2 = page.getByPlaceholder(SURFACES[0].ph).first(); await b2.waitFor({ timeout: 15000 })
  for (const v of ['A', 'Ac', 'Ace', 'Acet']) { await b2.fill(v); await page.waitForTimeout(220) }
  const afterList = stats.requests.filter(r => INDEX_REQ.test(r)).length
  ok('data: 12 keystrokes on Home + 4 on the list (SPA navigation) → exactly ONE shared index request in total', afterHome === 1 && afterList === 1, { afterHome, afterList })
  await ctx.close()
}

await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
