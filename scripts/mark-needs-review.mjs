// rebuild-from-excel.mjs와 완전히 동일한 파싱 로직으로 원본 엑셀을 다시 읽어서,
// "확인 필요"로 판정된 병들을 실제 reagent_lots 행과 매칭해 needs_review=true로
// 표시한다. rebuild-from-excel.mjs 실행 직후 딱 한 번 쓰는 후속 스크립트.
//
// 매칭 방법: 같은 이름(reagent) 그룹 안에서 (lot_no, current_stock) 조합으로
// DB의 미사용 Lot을 하나씩 소비하며 매칭한다 — 완전히 동일한 값의 중복 Lot이
// 여러 개 있어도 정확히 필요한 개수만큼만 표시되도록.
//
// 사용법: node scripts/mark-needs-review.mjs [--execute]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import XLSX from 'xlsx'

const EXCEL_PATH = 'C:\\Users\\user\\Desktop\\학교\\시약관리시스템 만들기\\260306 시약정리표.xlsx'
const EXECUTE = process.argv.includes('--execute')

function loadEnvLocal() {
  const text = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}
const env = loadEnvLocal()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const SHEET_CONFIG = [
  { sheet: '303-1', room: '303-1', detail: null },
  { sheet: '303-냉장시약장', room: '303호', detail: '냉장시약장' },
  { sheet: '303 버퍼&지시약 시약장', room: '303호', detail: '버퍼&지시약 시약장' },
  { sheet: '노란시약장(미완료)', skip: true },
  { sheet: '5층 액체', room: '5층', detail: '액체 시약장' },
  { sheet: '5층 극저온(미완료)', skip: true },
  { sheet: '5층 고체', room: '5층', detail: '고체 시약장' },
  { sheet: '5층 산염기', room: '5층', detail: '산염기 시약장' },
  { sheet: '5층 노란시약장', room: '5층', detail: '노란시약장' },
]

function parseStateToPercent(text) {
  let t = String(text || '').trim()
  if (!t) return { value: null, ok: false }
  if (/새\s*것|미개봉|뜯지\s*않음|안\s*뜯음|가득/.test(t)) return { value: 100, ok: true }
  if (/거의\s*없음|거의\s*다\s*씀/.test(t)) return { value: 5, ok: true }
  if (/^없음$/.test(t)) return { value: 0, ok: true }
  if (/극소량|미량|매우\s*소량/.test(t)) return { value: 5, ok: true }
  if (/^소량$/.test(t)) return { value: 10, ok: true }
  t = t.replace(/^[.`]+/, '')
  const fracM = t.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (fracM) {
    const v = Math.round((Number(fracM[1]) / Number(fracM[2])) * 100)
    return { value: Math.min(100, Math.max(0, v)), ok: true }
  }
  const pctM = t.match(/^(\d+(?:\.\d+)?)\s*%$/)
  if (pctM) return { value: Math.round(Number(pctM[1])), ok: true }
  const decM = t.match(/^0?\.\d+$/)
  if (decM) return { value: Math.round(Number(t) * 100), ok: true }
  const intM = t.match(/^(\d+(?:\.\d+)?)$/)
  if (intM) {
    const v = Number(intM[1])
    if (v >= 0 && v <= 100) return { value: Math.round(v), ok: true }
    return { value: 100, ok: false }
  }
  return { value: 100, ok: false }
}
function parseNoteCount(note) {
  const t = String(note || '').trim()
  if (!t) return null
  const m = t.match(/(\d+)\s*개/)
  if (m) return Number(m[1])
  if (/개/.test(t)) return 1
  return null
}
function parseSegmentList(text) {
  const segments = String(text || '').split(',').map(s => s.trim()).filter(Boolean)
  const perSegment = segments.map(seg => {
    const countM = seg.match(/(\d+)\s*개/)
    if (countM) {
      const n = Number(countM[1])
      const stateText = seg.replace(/(\d+)\s*개/, '').trim()
      const parsed = parseStateToPercent(stateText)
      return { n, stock: parsed.value, ok: parsed.ok }
    }
    const parsed = parseStateToPercent(seg)
    return { n: 1, stock: parsed.value, ok: parsed.ok }
  })
  const allOk = perSegment.length > 0 && perSegment.every(s => s.ok)
  const bottles = []
  for (const s of perSegment) for (let i = 0; i < s.n; i++) bottles.push({ stock: s.stock, ok: s.ok })
  return { bottles, allOk, segmentCount: segments.length }
}
function parseNoteBreakdown(note) {
  const t = String(note || '').trim()
  const m = t.match(/\(([^)]*)\)/)
  if (!m) return null
  const segments = m[1].split(',').map(s => s.trim()).filter(Boolean)
  if (segments.length === 0 || !segments.every(seg => /\d+\s*개/.test(seg))) return null
  const { bottles, allOk } = parseSegmentList(m[1])
  if (!allOk || bottles.length === 0) return null
  return bottles
}
function parseRemainCell(remainRaw) {
  let t = String(remainRaw || '').trim()
  if (!t) return { bottles: [], noRemainInfo: true }
  t = t.replace(/(\d+\s*개)(\s+)(?=\S)/g, '$1,$2')
  const { bottles, allOk, segmentCount } = parseSegmentList(t)
  if (!allOk || (segmentCount === 1 && bottles.length === 1)) {
    const parsed = allOk ? bottles[0] : parseStateToPercent(t)
    return { bottles: [{ stock: parsed.stock ?? parsed.value, ok: parsed.ok }], bundled: false }
  }
  return { bottles, bundled: true }
}

console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 (쓰기 없음) ===')
const wb = XLSX.readFile(EXCEL_PATH)
const rawItems = []

for (const cfg of SHEET_CONFIG) {
  if (cfg.skip) continue
  const sheet = wb.Sheets[cfg.sheet]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
  if (rows.length === 0) continue
  const header = rows[0].map(h => String(h || '').trim())
  const idx = {
    name: header.indexOf('화학물질명'), lot: header.indexOf('제품번호 (Lot.No)'),
    remain: header.indexOf('잔량'), note: header.indexOf('비고체'),
  }
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = r[idx.name]
    if (!name || !String(name).trim()) continue
    const remainRaw = idx.remain >= 0 ? r[idx.remain] : ''
    const noteRaw = idx.note >= 0 ? r[idx.note] : ''
    const noteCount = parseNoteCount(noteRaw)
    const { bottles } = parseRemainCell(remainRaw)
    const noteBreakdown = parseNoteBreakdown(noteRaw)

    let finalBottles
    let reason = null
    if (noteBreakdown && noteBreakdown.length !== bottles.length) {
      finalBottles = noteBreakdown // 전부 ok:true (parseNoteBreakdown이 allOk 확인 후 반환)
    } else if (bottles.length > 0) {
      if (noteCount !== null && noteCount > bottles.length) {
        if (bottles.length === 1) {
          finalBottles = Array.from({ length: noteCount }, () => ({ stock: bottles[0].stock, ok: bottles[0].ok }))
          if (!bottles[0].ok) reason = `비고체 개수(${noteCount})에 맞춰 확장, 잔량 자체도 불확실("${remainRaw}")`
        } else {
          const pad = noteCount - bottles.length
          finalBottles = [...bottles, ...Array.from({ length: pad }, () => ({ stock: 100, ok: false }))]
          reason = `비고체 개수(${noteCount})가 잔량 파싱 개수(${bottles.length})보다 많아 ${pad}병을 미확인으로 추가`
        }
      } else {
        finalBottles = bottles
        if (finalBottles.some(b => !b.ok)) reason = `잔량 파싱 불확실("${remainRaw}")`
      }
    } else if (noteCount !== null && noteCount > 0) {
      finalBottles = Array.from({ length: noteCount }, () => ({ stock: 100, ok: false }))
      reason = '잔량 정보 없이 비고체 개수만 있음'
    } else {
      finalBottles = [{ stock: 100, ok: false }]
      reason = '잔량/비고체 모두 비어있음'
    }

    const nameStr = String(name).trim()
    rawItems.push({
      nameNorm: nameStr.toLowerCase(),
      lot_no: idx.lot >= 0 ? (String(r[idx.lot] || '').trim() || null) : null,
      bottles: finalBottles,
      reason,
    })
  }
}

// 매칭 대상: !ok인 병만 needs_review 후보
const needed = new Map() // nameNorm -> [{lot_no, stock, reason}]
for (const it of rawItems) {
  for (const b of it.bottles) {
    if (b.ok) continue
    if (!needed.has(it.nameNorm)) needed.set(it.nameNorm, [])
    needed.get(it.nameNorm).push({ lot_no: it.lot_no, stock: b.stock ?? 100, reason: it.reason || '잔량 파싱 불확실' })
  }
}
const totalNeeded = [...needed.values()].reduce((s, arr) => s + arr.length, 0)
console.log(`확인 필요로 판정된 병: ${totalNeeded}개 (${needed.size}개 시약 종류에 걸쳐있음)`)

// DB에서 이름별 reagent_id + 현재 lots 가져오기
let allReagents = []
{
  let from = 0
  while (true) {
    const { data, error } = await supabase.from('reagents').select('id, name').range(from, from + 999)
    if (error) throw new Error(error.message)
    allReagents = allReagents.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
}
const reagentIdByNorm = new Map(allReagents.map(r => [r.name.trim().toLowerCase(), r.id]))

let matched = 0
let unmatched = 0
const updates = [] // {id, review_note}

for (const [nameNorm, targets] of needed) {
  const reagentId = reagentIdByNorm.get(nameNorm)
  if (!reagentId) { unmatched += targets.length; console.log(`!! 매칭 실패(시약 없음): ${nameNorm}`); continue }
  const { data: lots, error } = await supabase.from('reagent_lots')
    .select('id, lot_no, current_stock, needs_review').eq('reagent_id', reagentId)
  if (error) throw new Error(error.message)
  // 아직 표시 안 된 것만 소비 대상 풀로
  const pool = lots.filter(l => !l.needs_review).map(l => ({ ...l, used: false }))
  for (const t of targets) {
    const idx = pool.findIndex(l => !l.used && (l.lot_no || null) === (t.lot_no || null) && l.current_stock === t.stock)
    if (idx === -1) { unmatched++; continue }
    pool[idx].used = true
    updates.push({ id: pool[idx].id, review_note: t.reason })
    matched++
  }
}

console.log(`매칭 성공: ${matched} / 매칭 실패: ${unmatched}`)
{
  const idCounts = new Map()
  for (const u of updates) idCounts.set(u.id, (idCounts.get(u.id) || 0) + 1)
  const dupes = [...idCounts.entries()].filter(([, c]) => c > 1)
  console.log(`updates 배열 길이: ${updates.length}, 고유 id 수: ${idCounts.size}, 중복 id: ${dupes.length}건`)
  if (dupes.length > 0) console.log('중복 예시:', dupes.slice(0, 5))
}
if (unmatched > 0) console.log('!! 매칭 실패분이 있음 — 실행 전 원인 확인 필요')

if (!EXECUTE) {
  console.log('드라이런 완료. 실제 반영하려면: node scripts/mark-needs-review.mjs --execute')
  process.exit(0)
}

console.log('')
console.log('DB 업데이트 중...')
let updateFailures = 0
for (let i = 0; i < updates.length; i++) {
  const u = updates[i]
  const { error } = await supabase.from('reagent_lots').update({ needs_review: true, review_note: u.review_note }).eq('id', u.id)
  if (error) { updateFailures++; console.log(`!! 업데이트 실패 (${u.id}):`, error.message) }
  if ((i + 1) % 100 === 0 || i === updates.length - 1) console.log(`  ${i + 1}/${updates.length}`)
}
if (updateFailures > 0) console.log(`!! 업데이트 실패 건수: ${updateFailures}`)

const { count } = await supabase.from('reagent_lots').select('*', { count: 'exact', head: true }).eq('needs_review', true)
console.log(`최종 확인: needs_review=true인 Lot 수: ${count}`)
