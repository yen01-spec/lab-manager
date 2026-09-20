// 시약장 재배치 작업표 관리자 화면 — 위치 선택/계획/미리보기/Excel 내보내기 + "DB write 0" 검증. 가짜 Supabase.
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { chromium, CHROME, BASE, buildReagents, installMock } from './harness.mjs'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-1111-1111-111111111111'
const exp = Math.floor(Date.now() / 1000) + 36000
const adminSession = { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp })}.s`, refresh_token: 'x', token_type: 'bearer', expires_in: 36000, expires_at: exp, user: { id: UID, email: 'a@test.local' } }

const LOCS = [
  { id: 'loc-a1', room: '303호', detail: 'A-1 시약장' },
  { id: 'loc-a2', room: '303호', detail: 'A-2 시약장' },
  { id: 'loc-sp', room: '5층 여분의 시약장', detail: null },
  { id: 'loc-empty', room: '빈 시약장', detail: null },
]
const mk = (n, rid, name, sl, over) => ({
  id: `b${String(n).padStart(3, '0')}0000-0000-4000-8000-000000000000`, reagent_id: rid, lot_no: 'SAMELOT', sealed_count: 0, current_stock: 50,
  location_id: 'loc-a1', status: 'active', received_date: null,
  reagents: { id: rid, name, cas_no: '64-17-5', company: 'Daejung', volume: 500, unit: 'mL', sort_letter: sl }, ...over,
})
const LOTS = [
  mk(1, 'r1', 'Acetone', 'A', { current_stock: 80 }), mk(2, 'r1', 'Acetone', 'A', { current_stock: 30 }), mk(3, 'r1', 'Acetone', 'A', { sealed_count: 1, current_stock: 0 }),
  mk(4, 'r2', 'Benzene', 'B', { current_stock: 60 }), mk(5, 'r2', 'Benzene', 'B', { current_stock: 20, location_id: 'loc-a2' }),
  mk(6, 'r3', 'Calcium chloride', 'C', { current_stock: 90, location_id: 'loc-a2' }),
  mk(7, 'r4', 'Tris(hydroxymethyl)aminomethane hydrochloride extra-pure grade reagent solution 0.5 mol/L in ultrapure water for molecular biology', 'T', { current_stock: 70 }),
  mk(8, 'r5', 'Ethanol', 'E', { current_stock: 10, location_id: 'loc-sp' }),
  mk(9, 'r6', 'Toluene', 'T', { current_stock: 40 }), mk(10, 'r6', 'Toluene', 'T', { current_stock: 40 }),   // 동률 → 현장 확인 필요
]

async function open(browser, w, h, { seedDraft } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true })
  await ctx.addInitScript(s => localStorage.setItem('lm_admin_auth', JSON.stringify(s)), adminSession)
  const writes = []
  await installMock(ctx, buildReagents(10))
  const reply = (r, body) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await ctx.route(/\/rest\/v1\/admin_users/, r => reply(r, [{ user_id: UID }]))
  await ctx.route(/\/rest\/v1\/locations/, r => reply(r, LOCS))
  await ctx.route(/\/rest\/v1\/reagent_lots\?.*select=id%2C\+?reagent_id%2C.*reagents/, r => {
    const u = new URL(r.request().url())
    const range = (r.request().headers()['range'] || '0-999').split('-').map(Number)
    reply(r, LOTS.slice(range[0], range[1] + 1))
  })
  const page = await ctx.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  page.on('request', q => { if (/supabase\.co\/rest\/v1\//.test(q.url()) && !['GET', 'HEAD', 'OPTIONS'].includes(q.method())) writes.push(q.method() + ' ' + new URL(q.url()).pathname) })
  return { ctx, page, writes, errors }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
{
  const { ctx, page, writes, errors } = await open(browser, 1440, 900)
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /시약장 재배치 작업표/ }).first().click()
  await page.getByText('현재 위치 선택').waitFor({ timeout: 15000 })
  const t0 = await page.locator('main').innerText()
  ok('tab: locations with bottles are listed with bottle counts; empty cabinet hidden', (await page.getByRole('checkbox').count()) === 3 && t0.includes('A-1 시약장') && t0.includes('5층 여분의 시약장') && t0.includes('7병'))
  ok('tab: export disabled until a location is chosen', await page.getByRole('button', { name: /작업표 Excel 내보내기/ }).isDisabled())

  await page.getByRole('checkbox').nth(0).check()   // 303호 A-1
  await page.getByRole('checkbox').nth(1).check()   // 303호 A-2
  await page.getByText('3. 미리보기').waitFor()
  const sum = await page.getByTestId('reloc-summary').innerText()
  ok('preview: A-1 shows 7병 (Acetone×3 + Benzene 60% + Tris + Toluene×2) with alphabet line A 3 / B 1 / T 3', sum.includes('총 7병') && sum.includes('A 3 / B 1 / T 3'), sum)
  ok('preview: 사용중/여분 over ALL bottles of each reagent; Toluene tie → 확인 필요 2 and the counts are marked 잠정', sum.includes('사용중 2 / 여분 3 / 확인 필요 2 (잠정)') && (await page.getByTestId('reloc-provisional').count()) === 1, sum)
  const rows1 = await page.getByTestId('reloc-row').count()
  ok('preview: one row per bottle (same lot_no bottles are separate rows)', rows1 === 7, rows1)

  // 기본 규칙: 여분 병 → 5층 여분의 시약장
  await page.getByLabel('여분 병의 바뀔 위치').selectOption({ label: '5층 여분의 시약장' })
  const sum2 = await page.getByTestId('reloc-summary').innerText()
  ok('plan: spare target → 이동 예정 3 (in-use and 확인 필요 stay 변경 없음)', sum2.includes('이동 예정 3'), sum2)
  // 현장 확인: 동률 병 하나를 사용중으로 지정 → 다른 동률 병은 여분으로 확정, 잠정 표시 해제
  const tolRows = page.getByTestId('reloc-row').filter({ hasText: 'Toluene' })
  const tolTxt = await tolRows.first().innerText()
  ok('tie rows show △ 확인 필요 + 동률 and get no automatic planned location', tolTxt.includes('△ 확인 필요') && tolTxt.includes('동률') && (await tolRows.first().getByLabel(/^바뀔 위치/).inputValue()) === '')
  await tolRows.first().getByLabel(/^병 역할 지정/).selectOption({ label: '사용중 지정' })
  const sum3 = await page.getByTestId('reloc-summary').innerText()
  ok('role override: 사용중 지정 resolves the tie (사용중 3 / 여분 4 / 확인 필요 0) and the 잠정 notice disappears', sum3.includes('사용중 3 / 여분 4 / 확인 필요 0') && !sum3.includes('잠정') && (await page.getByTestId('reloc-provisional').count()) === 0, sum3)
  await tolRows.first().getByLabel(/^병 역할 지정/).selectOption({ label: '자동' })
  ok('role override: 자동 restores the tie (잠정 again)', (await page.getByTestId('reloc-provisional').count()) === 1)
  // 개별 병 수정: 사용중 병 하나를 A-2 로
  const firstInUse = page.getByTestId('reloc-row').filter({ hasText: '● 사용중' }).first()
  await firstInUse.getByLabel(/^바뀔 위치/).selectOption({ label: '303호 - A-2 시약장' })
  ok('plan: per-bottle override raises 이동 예정 to 4', (await page.getByTestId('reloc-summary').innerText()).includes('이동 예정 4'))

  // Excel 내보내기
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /작업표 Excel 내보내기/ }).click()])
  const path = await dl.path()
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(readFileSync(path))
  ok('export: file name + sheets = 요약 + 2 locations', /시약장_재배치_작업표_\d{8}\.xlsx$/.test(dl.suggestedFilename()) && wb.worksheets.length === 3 && wb.worksheets[0].name === '요약', { f: dl.suggestedFilename(), s: wb.worksheets.map(w => w.name) })
  const a1 = wb.worksheets.find(w => w.name.includes('A-1'))
  const nums = []; a1.eachRow((row, n) => { if (n > 5 && typeof row.getCell(1).value === 'number') nums.push(row.getCell(1).value) })
  ok('export: A-1 sheet bottle rows == preview rows (7) and No. runs 1..7', nums.length === 7 && nums.every((v, i) => v === i + 1), nums)
  ok('export: alphabet summary + 잠정 marker in file == preview', String(a1.getCell('A2').value).includes('A 3 / B 1 / T 3') && String(a1.getCell('A3').value).includes('(잠정)'))
  ok('export: 현재 위치 / 바뀔 위치 both present with planned arrow', (() => { let arrow = false; a1.eachRow((row, n) => { if (n > 5 && String(row.getCell(13).value).startsWith('→ ')) arrow = true }); return arrow })())
  await page.waitForTimeout(400)
  ok('export: DB write count is 0 (only GET requests)', writes.length === 0, writes)

  // 초안 유지(새로고침)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /시약장 재배치 작업표/ }).first().click()
  await page.getByText('3. 미리보기').waitFor({ timeout: 15000 })
  ok('draft: selection + spare target survive reload (localStorage only)', (await page.getByLabel('여분 병의 바뀔 위치').inputValue()) === 'loc-sp' && (await page.getByRole('checkbox').nth(0).isChecked()))
  ok('no page errors', errors.length === 0, errors)
  ok('still no DB writes after reload/interaction', writes.length === 0, writes)
  await ctx.close()
}
{
  const { ctx, page, errors } = await open(browser, 390, 844)
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /시약장 재배치 작업표/ }).first().click()
  await page.getByText('현재 위치 선택').waitFor({ timeout: 15000 })
  await page.getByRole('checkbox').nth(0).check()
  await page.getByText('3. 미리보기').waitFor()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  ok('mobile 390: page body has no horizontal overflow (table scrolls inside its own container)', !overflow)
  ok('mobile 390: no page errors', errors.length === 0, errors)
  await ctx.close()
}
await browser.close()
const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
