// 시약장 재배치 작업표 — 순수 계산 + Excel 구조 검증(네트워크/DB 없음). 샘플 파일도 여기서 생성한다.
//   node scripts/test-relocation-worksheet.mjs [--write-sample]
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { mkdirSync } from 'node:fs'
import {
  ROLE_CHECK, classifyBottles, buildRelocationRows, groupByLocation, summarize, letterOf, LETTER_ORDER, ROLE_IN_USE, ROLE_SPARE,
} from '../src/lib/relocationPlan.js'
import { buildRelocationWorkbook, safeSheetName, rowHeightFor } from '../src/lib/relocationExcel.js'

const results = []
const ok = (name, c, d) => { results.push(!!c); console.log(`${c ? '[PASS]' : '[FAIL]'} ${name}${d !== undefined ? ' — ' + JSON.stringify(d) : ''}`) }
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze) } return o }

// ── 합성 데이터(실제 재고 아님) ─────────────────────────────────────────────
const LOC = { A1: 'loc-a1', A2: 'loc-a2', SP: 'loc-spare', B1: 'loc-b1' }
const locations = [
  { id: LOC.A1, room: '303호', detail: 'A-1 시약장' },
  { id: LOC.A2, room: '303호', detail: 'A-2 시약장' },
  { id: LOC.B1, room: '303-1호', detail: 'B-1 시약장' },
  { id: LOC.SP, room: '5층 여분의 시약장', detail: null },
]
const NAMES = [
  ['Acetone', 'A'], ['Acetic acid', 'A'], ['Aniline', 'A'], ['Benzene', 'B'], ['Butanol', 'B'], ['Calcium chloride', 'C'],
  ['Chloroform', 'C'], ['Dichloromethane', 'D'], ['Ethanol', 'E'], ['Ethyl acetate', 'E'],
  ['4-Aminobenzoic acid', 'A'], ['Formaldehyde solution', 'F'], ['Hydrochloric acid', 'H'], ['Methanol', 'M'], ['Sodium hydroxide', 'S'],
  ['Tris(hydroxymethyl)aminomethane hydrochloride extra-pure grade reagent solution 0.5 mol/L in ultrapure water for molecular biology', 'T'],
  ['Zinc oxide', 'Z'], ['Xylene', 'X'], ['Grouped reagent', 'G'],
]
let seq = 0
const uid = () => `b0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const lots = []
const add = (ri, over) => {
  const [name, sl] = NAMES[ri]
  lots.push({
    id: uid(), reagent_id: `r-${ri}`, lot_no: 'LOT-DEFAULT', sealed_count: 0, current_stock: 50, location_id: LOC.A1, status: 'active', received_date: null,
    reagents: { id: `r-${ri}`, name, cas_no: `${1000 + ri}-00-0`, company: ri % 2 ? 'Sigma-Aldrich' : 'Daejung', volume: 500, unit: 'mL', sort_letter: sl }, ...over,
  })
}
// 같은 시약 + 같은 lot_no 의 병 2개(각각 별도 행) — Acetone
add(0, { lot_no: 'ABC123', current_stock: 80 }); add(0, { lot_no: 'ABC123', current_stock: 30 })
add(0, { lot_no: 'ABC123', sealed_count: 1, current_stock: 0 })                 // 미개봉 → 100 취급
add(1, { current_stock: 40 }); add(1, { current_stock: 40 })                       // 동률(개봉 40 / 40)
add(2, { current_stock: 10, location_id: LOC.A2 })                                  // 단일 병
add(3, { current_stock: 60 }); add(3, { current_stock: 20, location_id: LOC.A2 }); add(3, { sealed_count: 1, current_stock: 0, location_id: LOC.SP })
add(4, { sealed_count: 1, current_stock: 0 }); add(4, { sealed_count: 1, current_stock: 0, received_date: '2025-01-01' }) // 미개봉끼리 동률 → 입고일
add(5, { current_stock: 90 }); add(6, { current_stock: 5 }); add(7, { current_stock: 70 }); add(8, { current_stock: 33, location_id: LOC.B1 })
add(9, { current_stock: 25, location_id: LOC.B1 }); add(9, { current_stock: 25, location_id: LOC.B1, received_date: '2024-05-05' })
add(10, { current_stock: 55 }); add(11, { current_stock: 45, location_id: LOC.B1 }); add(12, { current_stock: 15 }); add(13, { current_stock: 65 })
add(14, { current_stock: 35 }); add(15, { current_stock: 75 }); add(16, { current_stock: 85 })
add(16, { status: 'disposed', current_stock: 0 })                                    // 폐기된 병은 제외
add(17, { current_stock: 100 }); add(17, { sealed_count: 1, current_stock: 0 })   // 개봉 100% vs 미개봉(=100) → 개봉 우선으로 자동 확정
add(18, { sealed_count: 3, current_stock: 0 }); add(18, { current_stock: 60 }) // 묶음 행(sealed 3) + 정상 병
lots.push({ id: uid(), reagent_id: 'r-x', lot_no: null, sealed_count: 0, current_stock: 50, location_id: LOC.A1, status: 'active', received_date: null, reagents: { id: 'r-x', name: '(미지)Unknown', cas_no: '', company: '', volume: null, unit: null, sort_letter: null } })
deepFreeze(lots); deepFreeze(locations)

// ── 1. 분류 ──────────────────────────────────────────────────────────────────
const roles = classifyBottles(lots)
const byReagent = rid => lots.filter(l => l.reagent_id === rid && l.status === 'active')
const roleList = rid => byReagent(rid).map(l => roles.get(l.id).role)
ok('classify: lowest remaining = 사용중, others = 여분 (Acetone: 30% in use, 80% & sealed spare)', (() => {
  const l = byReagent('r-0'); const inUse = l.filter(x => roles.get(x.id).role === ROLE_IN_USE)
  return inUse.length === 1 && inUse[0].current_stock === 30 && l.filter(x => roles.get(x.id).role === ROLE_SPARE).length === 2
})())
ok('classify: sealed bottle (stock stored as 0) is treated as full, never as the emptiest', (() => {
  const sealed = byReagent('r-0').find(x => x.sealed_count > 0); return roles.get(sealed.id).role === ROLE_SPARE
})())
ok('classify: single bottle is 사용중 (no spare)', roleList('r-2').length === 1 && roleList('r-2')[0] === ROLE_IN_USE)
const R = id => roles.get(id).role
ok('classify: tie after open-preference (open 40% vs open 40%) → BOTH 현장 확인 필요, never auto-picked', (() => {
  const l = byReagent('r-1'); return l.every(x => R(x.id) === ROLE_CHECK && roles.get(x.id).reason === 'tie')
})())
ok('classify: received_date / bottle id are NOT used as tie-breakers (sealed-vs-sealed with different received_date → both 확인 필요)', (() => {
  const l = byReagent('r-4'); return l.some(x => x.received_date) && l.every(x => R(x.id) === ROLE_CHECK)
})())
ok('classify: open bottle wins over sealed at the same effective remain (open 100% → 사용중, sealed → 여분)', (() => {
  const l = byReagent('r-17'); const open = l.find(x => x.sealed_count === 0); const sealed = l.find(x => x.sealed_count > 0)
  return R(open.id) === ROLE_IN_USE && R(sealed.id) === ROLE_SPARE
})())
ok('classify: grouped row (sealed_count > 1) → 현장 확인 필요 (reason grouped), excluded from ranking; the normal bottle is 사용중', (() => {
  const l = byReagent('r-18'); const g = l.find(x => x.sealed_count > 1); const n = l.find(x => x.sealed_count === 0)
  return R(g.id) === ROLE_CHECK && roles.get(g.id).reason === 'grouped' && R(n.id) === ROLE_IN_USE
})())
ok('classify: manual role override wins; picking 사용중 among a tie resolves the other candidate to 여분', (() => {
  const l = byReagent('r-1'); const m = classifyBottles(lots, { [l[0].id]: ROLE_IN_USE })
  return m.get(l[0].id).role === ROLE_IN_USE && m.get(l[0].id).manual === true && m.get(l[1].id).role === ROLE_SPARE
})())
ok('classify: manual 여분 on one tied bottle leaves the other unresolved (no guessing)', (() => {
  const l = byReagent('r-1'); const m = classifyBottles(lots, { [l[0].id]: ROLE_SPARE })
  return m.get(l[0].id).role === ROLE_SPARE && m.get(l[1].id).role === ROLE_CHECK
})())
ok('classify: manual override cannot be applied to a bottle via roleOverrides with an invalid value', (() => {
  const l = byReagent('r-1'); const m = classifyBottles(lots, { [l[0].id]: '아무거나' }); return m.get(l[0].id).role === ROLE_CHECK
})())
ok('classify: role decided over ALL bottles of the reagent, across locations (Benzene: 20% at A-2 is 사용중, sealed at spare cabinet is 여분)', (() => {
  const l = byReagent('r-3'); const a2 = l.find(x => x.location_id === LOC.A2); const sp = l.find(x => x.location_id === LOC.SP)
  return roles.get(a2.id).role === ROLE_IN_USE && roles.get(sp.id).role === ROLE_SPARE
})())
ok('classify: disposed bottles ignored', !roles.has(lots.find(l => l.status === 'disposed').id))

// ── 2. 행 생성 / 정렬 / 집계 ────────────────────────────────────────────────
const selected = [LOC.A1, LOC.A2, LOC.B1]
const plan = { spareTarget: LOC.SP, inUseTarget: null, overrides: {} }
const rows = buildRelocationRows({ lots, locations, selectedLocationIds: selected, plan })
const expectedBottles = lots.filter(l => l.status === 'active' && selected.includes(l.location_id)).length
ok('rows: one row per bottle (병 1개 = 1행), count matches active bottles in selected locations', rows.length === expectedBottles, { rows: rows.length, expectedBottles })
ok('rows: same reagent + same lot_no bottles stay separate rows with distinct bottle IDs', (() => {
  const a = rows.filter(r => r.lotNo === 'ABC123'); return a.length === 3 && new Set(a.map(r => r.lotId)).size === 3
})())
ok('rows: spare bottles at a non-spare location get planned target; in-use / already-there stay "변경 없음"', rows.every(r => r.role === ROLE_SPARE ? r.plannedLocationId === LOC.SP : r.plannedLocationId === null))
ok('rows: current vs planned location are separate fields (current never changed)', rows.every(r => r.currentLocationId !== r.plannedLocationId))
ok('rows: sorted by current location → letter → name (grouped per cabinet, A→Z, 기타 last)', (() => {
  const key = r => [locations.findIndex(l => l.id === r.currentLocationId), LETTER_ORDER.indexOf(r.letter)]
  const locNames = rows.map(r => r.currentLocation)
  const grouped = locNames.every((n, i) => i === 0 || n === locNames[i - 1] || !locNames.slice(0, i - 1).includes(n))
  const sortedWithin = rows.every((r, i) => i === 0 || rows[i - 1].currentLocationId !== r.currentLocationId || LETTER_ORDER.indexOf(rows[i - 1].letter) <= LETTER_ORDER.indexOf(r.letter))
  const lastIsKita = rows.filter(r => r.currentLocationId === LOC.A1).at(-1).letter === '기타'
  return grouped && sortedWithin && lastIsKita
})())
ok('letter: sort_letter wins; "4-Aminobenzoic acid" → A; missing → 기타', letterOf({ sort_letter: 'A', name: '4-Aminobenzoic acid' }) === 'A' && letterOf({ name: '(미지)' }) === '기타' && letterOf({ name: 'zinc' }) === 'Z')
const groups = groupByLocation(rows, locations, selected)
ok('group: 3 selected locations → 3 groups, only rows of that location', groups.length === 3 && groups.every(g => g.rows.every(r => r.currentLocationId === g.locationId)))
ok('summary: per-location alphabet counts sum to that location\'s total bottles', groups.every(g => LETTER_ORDER.reduce((n, k) => n + g.summary.letters[k], 0) === g.summary.total && g.summary.total === g.rows.length))
const all = summarize(rows)
ok('summary: overall letter sum == total bottles == Σ location totals', LETTER_ORDER.reduce((n, k) => n + all.letters[k], 0) === all.total && all.total === groups.reduce((n, g) => n + g.summary.total, 0))
ok('summary: 사용중 + 여분 + 확인 필요 == total; provisional flag on when 확인 필요 exists; kinds counts reagents (not bottles)', all.inUse + all.spare + all.check === all.total && all.check > 0 && all.provisional === true && groups[0].summary.kinds <= groups[0].summary.total)
const ovr = buildRelocationRows({ lots, locations, selectedLocationIds: selected, plan: { spareTarget: LOC.SP, overrides: { [rows[0].lotId]: LOC.B1, [rows[1].lotId]: '' } } })
ok('plan overrides: per-bottle target wins; "" forces 변경 없음', ovr.find(r => r.lotId === rows[0].lotId).plannedLocationId === (rows[0].currentLocationId === LOC.B1 ? null : LOC.B1) && ovr.find(r => r.lotId === rows[1].lotId).plannedLocationId === null)
ok('rows: 확인 필요 bottles get NO automatic planned location (even with a spare target set)', rows.filter(r => r.role === ROLE_CHECK).length > 0 && rows.filter(r => r.role === ROLE_CHECK).every(r => r.plannedLocationId === null))
ok('inputs are never mutated (deep-frozen inputs survived)', true)

// ── 3. Excel 구조 ────────────────────────────────────────────────────────────
const wb = await buildRelocationWorkbook(groups, { spareTargetName: '5층 여분의 시약장', inUseTargetName: '', overrideCount: 0, generatedAt: '2026-09-23 10:00' }, ExcelJS)
const buf = await wb.xlsx.writeBuffer()
const rb = new ExcelJS.Workbook(); await rb.xlsx.load(buf)
ok('excel: 요약 + one sheet per current location', rb.worksheets.length === 1 + groups.length && rb.worksheets[0].name === '요약', rb.worksheets.map(w => w.name))
const locSheets = rb.worksheets.slice(1)
const zip = await JSZip.loadAsync(buf)
const wbXml = await zip.file('xl/workbook.xml').async('string')
const sheetXmls = await Promise.all(locSheets.map((w, i) => zip.file('xl/worksheets/sheet' + (i + 2) + '.xml').async('string')))
ok('excel: every location sheet is A4 landscape (paperSize 9), fit to 1 page wide × auto tall', sheetXmls.every(x => /paperSize="9"/.test(x) && /orientation="landscape"/.test(x) && /fitToWidth="1"/.test(x) && /fitToHeight="0"/.test(x) && /fitToPage="1"/.test(x)))
ok('excel: print titles repeat rows 1:5 (location title + alphabet summary + header) on every page of every location sheet', (wbXml.match(/_xlnm.Print_Titles/g) || []).length === locSheets.length && (wbXml.match(/\$1:\$5</g) || []).length === locSheets.length)
ok('excel: sheet header shows sheet (=current location) name and page numbers', locSheets.every(w => /&A/.test(w.headerFooter.oddHeader || '') && /&P/.test(w.headerFooter.oddFooter || '')))
ok('excel: sheet names ≤ 31 chars and unique', new Set(rb.worksheets.map(w => w.name.toLowerCase())).size === rb.worksheets.length && rb.worksheets.every(w => w.name.length <= 31))
ok('excel: header row has 현재 위치 / 바뀔 위치 / 병 역할 / 완료 / 메모 columns', (() => {
  const h = locSheets[0].getRow(5).values.slice(1); return ['현재 위치', '바뀔 위치', '병 역할', '완료', '메모', '병 ID', 'Lot No.'].every(k => h.includes(k))
})())
ok('excel: bottle rows (excluding letter bands) == bottles in that location; No. runs 1..n', locSheets.every((w, i) => {
  const nums = []; w.eachRow((row, n) => { if (n > 5 && typeof row.getCell(1).value === 'number') nums.push(row.getCell(1).value) })
  return nums.length === groups[i].rows.length && nums.every((v, k) => v === k + 1)
}))
ok('excel: provisional wording — 잠정 in the role line (only sheets with 확인 필요), 확인 필요 role cell + 메모 (동률 / 묶음 행)', (() => {
  const prov = locSheets.filter(x => String(x.getCell('A3').value).includes('(잠정)'))
  const notProv = locSheets.filter(x => !String(x.getCell('A3').value).includes('(잠정)'))
  const memos = [], roleCells = []
  for (const w of locSheets) w.eachRow((row, n) => { if (n > 5) { memos.push(String(row.getCell(15).value || '')); roleCells.push(String(row.getCell(11).value || '')) } })
  return prov.length >= 1 && notProv.every((x, i) => /확인 필요 0병/.test(String(x.getCell('A3').value))) && roleCells.some(v => v.startsWith('△')) && memos.some(v => v.includes('동률·현장 확인')) && memos.some(v => v.includes('묶음 행'))
})())
ok('excel: alphabet summary line on top of every location sheet', locSheets.every((w, i) => String(w.getCell('A2').value).includes(groups[i].summary.letterLine)))
ok('excel: 요약 sheet totals row + reconciliation OK', (() => {
  const s = rb.worksheets[0]; let total = null, verdict = ''
  s.eachRow(row => { if (String(row.getCell(1).value).startsWith('합계')) total = row.getCell(2).value; if (String(row.getCell(1).value || '').startsWith('검증')) verdict = row.getCell(1).value })
  return total === all.total && verdict.endsWith('OK')
})())
ok('excel: long reagent name wraps (wrapText) and its row is taller than the default', (() => {
  let found = null
  for (const w of locSheets) w.eachRow(row => { if (String(row.getCell(3).value || '').startsWith('Tris(')) found = row })
  return found && found.getCell(3).alignment.wrapText === true && found.height > 40
})())
ok('excel: 바뀔 위치 cell distinguishable without color (arrow text + fill only as extra)', (() => {
  const w = locSheets.flatMap(x => { const v = []; x.eachRow((row, n) => { if (n > 5) v.push(String(row.getCell(13).value)) }); return v })
  return w.some(v => v.startsWith('→ ')) && w.some(v => v === '변경 없음')
})())
ok('helpers: safeSheetName strips illegal chars; rowHeightFor grows with text', safeSheetName('a/b:c*d?[e]', new Set(), 1).length <= 31 && !/[\[\]:*?/\\]/.test(safeSheetName('a/b:c*d?[e]', new Set(), 1)) && rowHeightFor([['x'.repeat(120), 30]]) > rowHeightFor([['x', 30]]))

if (process.argv.includes('--write-sample')) {
  mkdirSync(new URL('../docs/samples/', import.meta.url), { recursive: true })
  await wb.xlsx.writeFile(new URL('../docs/samples/relocation-worksheet-sample.xlsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  console.log('[sample] docs/samples/relocation-worksheet-sample.xlsx 생성(합성 데이터)')
}

const fail = results.filter(x => !x).length
console.log(`\nTOTAL=${results.length} PASS=${results.length - fail} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
