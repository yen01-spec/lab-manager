// 원본 엑셀(`260306 시약정리표.xlsx`) 기준 시약 DB 전체 재구축
//
// 배경: 이 앱은 실사용된 적이 없고, 지금 DB의 reagents/reagent_lots는 사전 세션에서
// 알 수 없는 방식으로 원본 엑셀에서 임포트된 것이라 신뢰할 수 없다(엑셀에는 있는데
// DB에는 이름조차 없는 시약이 다수 발견됨). 그래서 DB를 완전히 비우고 원본 엑셀에서
// 처음부터 다시 만든다.
//
// 핵심 원칙(사용자 확정):
//   - Lot 번호가 없거나 같아도 절대 목록에서 빼지 않는다 — 어떤 행도 삭제/병합하지 않는다.
//   - 이름이 같은 행이 여러 개면 전부 "같은 시약 종류 밑의 서로 다른 병(Lot)"으로 취급한다.
//   - 재구축 후 "종류" 수(고유 이름 그룹 수)와 "총 개수"(전체 Lot 수)가 원본 기준과
//     정확히 일치해야 한다.
//
// 기본은 드라이런(쓰기 없음, 리포트만 출력). 실제로 반영하려면 --execute.
//
// 사용법:
//   node scripts/rebuild-from-excel.mjs            (드라이런)
//   node scripts/rebuild-from-excel.mjs --execute   (실제 반영 — DB 전체 삭제 후 재생성)

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import XLSX from 'xlsx'

const EXCEL_PATH = 'C:\\Users\\user\\Desktop\\학교\\시약관리시스템 만들기\\260306 시약정리표.xlsx'

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
const EXECUTE = process.argv.includes('--execute')

// ── 시트 → 위치 매핑 ──────────────────────────────────────────────
const SHEET_CONFIG = [
  { sheet: '303-1', room: '303-1', detail: null, isNewLocation: true },
  { sheet: '303-냉장시약장', room: '303호', detail: '냉장시약장' },
  { sheet: '303 버퍼&지시약 시약장', room: '303호', detail: '버퍼&지시약 시약장' },
  { sheet: '노란시약장(미완료)', skip: true },
  { sheet: '5층 액체', room: '5층', detail: '액체 시약장' },
  { sheet: '5층 극저온(미완료)', skip: true },
  { sheet: '5층 고체', room: '5층', detail: '고체 시약장' },
  { sheet: '5층 산염기', room: '5층', detail: '산염기 시약장' },
  { sheet: '5층 노란시약장', room: '5층', detail: '노란시약장', isNewLocation: true },
]

// ── 시약 마스터 필드 신뢰도 판단 (기존 consolidate-reagent-masters.mjs와 동일 규칙) ──
function isJunkCompany(v) {
  if (!v) return true
  const t = String(v).trim()
  if (!t) return true
  if (t === '?') return true
  if (/^[\d.]+$/.test(t)) return true
  return false
}
const CAS_RE = /^\d{2,7}-\d{2}-\d$/
function isValidCas(v) {
  return !!v && CAS_RE.test(String(v).trim())
}
// volume 컬럼은 numeric인데, 컬럼 밀림 등으로 "kg" 같은 단위 문자열이 섞여 들어오는
// 경우가 있어 숫자가 아니면 null로 버린다(단위는 그대로 unit 컬럼에 남아있음).
function toNumericOrNull(v) {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function fieldScore(r) {
  let s = 0
  if (isValidCas(r.cas_no)) s++
  if (r.company && !isJunkCompany(r.company)) s++
  if (r.category && r.category.trim()) s++
  if (r.hazard && r.hazard.trim()) s++
  return s
}

// ── 잔량 텍스트 → 0~100% 파싱 ─────────────────────────────────────
function parseStateToPercent(text) {
  let t = String(text || '').trim()
  if (!t) return { value: null, ok: false }
  if (/새\s*것|미개봉|뜯지\s*않음|안\s*뜯음|가득/.test(t)) return { value: 100, ok: true }
  if (/거의\s*없음|거의\s*다\s*씀/.test(t)) return { value: 5, ok: true }
  if (/^없음$/.test(t)) return { value: 0, ok: true }
  if (/극소량|미량|매우\s*소량/.test(t)) return { value: 5, ok: true }
  if (/^소량$/.test(t)) return { value: 10, ok: true }
  // 엑셀 서식 잔재로 분수 앞에 점(.)이나 백틱(`)이 붙는 경우가 있음 — 제거 후 재시도
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
    if (v >= 0 && v <= 100) return { value: Math.round(v), ok: true } // 이미 %로 보이는 순수 숫자
    return { value: 100, ok: false } // 45752같은 깨진 값(엑셀 날짜 잔재 등) — 확인 필요로 표시, 기본 100
  }
  return { value: 100, ok: false }
}

// 비고체(비고) 컬럼에서 총 병 개수 추출. "4개", "3개(모두 새 것)", "새 것 + 한 개" 등
function parseNoteCount(note) {
  const t = String(note || '').trim()
  if (!t) return null
  const m = t.match(/(\d+)\s*개/)
  if (m) return Number(m[1])
  if (/개/.test(t)) return 1 // "한 개" 등 숫자 없이 "개"만 있는 경우
  return null
}

// 콤마로 나뉜 텍스트를 "상태 N개" 조각들로 파싱해서 [{stock, ok}] 배열로 반환.
// 조각이 전부 유효하게 파싱될 때만 성공(allOk=true)으로 취급 — 예: "1/2, 2/3"(분수
// 둘 다 유효) → 성공, "80% 2개"(조각 1개뿐이어도 개수 있으면 확장) → 성공.
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
  for (const s of perSegment) {
    for (let i = 0; i < s.n; i++) bottles.push({ stock: s.stock, ok: s.ok })
  }
  return { bottles, allOk, segmentCount: segments.length }
}

// 비고체에 "N개(상태 N개, 상태 N개)"처럼 괄호 안에 "각 조각마다 개수가 명시된" 세부
// 내역이 있으면 그걸 우선 사용. 예: "4개(1/1 2개, 4/5 2개)" → 100%×2 + 80%×2, 총 4병.
// 괄호 안이 "모두 새 것"처럼 개수 없는 단순 설명이면(예: "3개(모두 새 것)") 이건 그냥
// 앞의 "3개"에 대한 부연설명일 뿐이므로 세부 내역으로 취급하지 않는다 — 조각마다
// 반드시 "N개" 형태의 개수가 있어야만 진짜 내역으로 인정.
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

// 잔량 셀 하나를 파싱해서 [{stock, ok}] 배열로 반환 (묶음 행이면 여러 개, 아니면 1개).
// 콤마로 나뉜 각 조각이 전부 "N개 상태" 또는 그 자체로 유효하게 파싱되는 값(분수/퍼센트/
// 상태어)일 때만 여러 병으로 쪼갠다 — 예: "1/2, 2/3"(조각 둘 다 유효한 분수) → 2병,
// "소량, 1/2"(둘 다 유효한 상태값) → 2병. 반대로 조각 중 하나라도 못 알아보는 값이면
// (예: "1/5(소량)" 안의 콤마가 아예 없는 경우는 해당 없음, "가득함, 알수없음덩어리" 같은
// 경우) 콤마를 병 구분자로 확신할 수 없으므로 전체를 한 병짜리 미확인 값으로 처리한다.
function parseRemainCell(remainRaw) {
  let t = String(remainRaw || '').trim()
  if (!t) return { bottles: [], noRemainInfo: true }
  // 콤마 없이 "미개봉 2개 1/2 1개"처럼 개수 표현이 공백만으로 이어지는 경우도 있어서,
  // "N개" 뒤에 다음 내용이 이어지면 강제로 콤마를 끼워넣어 조각으로 나뉘게 만든다.
  t = t.replace(/(\d+\s*개)(\s+)(?=\S)/g, '$1,$2')
  const { bottles, allOk, segmentCount } = parseSegmentList(t)
  const totalCount = bottles.length
  if (!allOk || (segmentCount === 1 && totalCount === 1)) {
    // 여러 병 나열이 아니라고 판단되거나, 애초에 조각 하나짜리 단순값인 경우 —
    // 단순값이면 그대로, 실패했으면 원문 전체를 한 병짜리 미확인 값으로 처리
    const parsed = allOk ? bottles[0] : parseStateToPercent(t)
    return { bottles: [{ stock: parsed.stock ?? parsed.value, ok: parsed.ok }], bundled: false }
  }
  return { bottles, bundled: true }
}

// ── 엑셀 읽기 ──────────────────────────────────────────────────
console.log(EXECUTE ? '=== 실제 반영 모드 ===' : '=== 드라이런 모드 (쓰기 없음) ===')
const wb = XLSX.readFile(EXCEL_PATH)

const rawItems = [] // { name, nameNorm, cas, company, hazard, category, volume, unit, lot_no, sheet, room, detail, bottles: [{stock, ok}], excelRow, noteCount, bundled }
const reviewRows = [] // 확인 필요 행

for (const cfg of SHEET_CONFIG) {
  if (cfg.skip) { console.log(`[스킵] ${cfg.sheet}: 데이터 없음`); continue }
  const sheet = wb.Sheets[cfg.sheet]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false })
  if (rows.length === 0) { console.log(`[스킵] ${cfg.sheet}: 빈 시트`); continue }
  const header = rows[0].map(h => String(h || '').trim())
  const idx = {
    name: header.indexOf('화학물질명'),
    cas: header.indexOf('CAS No.'),
    company: header.indexOf('회사명'),
    lot: header.indexOf('제품번호 (Lot.No)'),
    hazard: header.indexOf('유해·위험성'),
    category: header.indexOf('유별(성질)'),
    volume: header.indexOf('용량'),
    unit: header.indexOf('단위'),
    remain: header.indexOf('잔량'),
    note: header.indexOf('비고체'),
  }

  let sheetBottleCount = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const name = r[idx.name]
    if (!name || !String(name).trim()) continue
    const excelRow = i + 1
    const remainRaw = idx.remain >= 0 ? r[idx.remain] : ''
    const noteRaw = idx.note >= 0 ? r[idx.note] : ''
    const noteCount = parseNoteCount(noteRaw)
    const { bottles, bundled, noRemainInfo } = parseRemainCell(remainRaw)
    const noteBreakdown = parseNoteBreakdown(noteRaw) // "N개(상태 N개, 상태 N개)" 같은 세부 내역

    let finalBottles
    if (noteBreakdown && noteBreakdown.length !== bottles.length) {
      // 비고체 괄호 안 세부 내역이 잔량 파싱보다 더 구체적인 경우 그걸 우선 사용
      // (예: 잔량="1/1, 4/5"(2병) vs 비고체="4개(1/1 2개, 4/5 2개)"(4병) → 4병이 맞음)
      finalBottles = noteBreakdown
      reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: `비고체 괄호 세부내역(${noteBreakdown.length}병)을 잔량 파싱(${bottles.length}병) 대신 사용`, remainRaw, noteRaw })
    } else if (bottles.length > 0) {
      let padded = false
      if (noteCount !== null && noteCount > bottles.length) {
        if (bottles.length === 1) {
          // 잔량은 단일 상태값 하나뿐인데 비고체가 "N개"라고 하면 — 그 상태의 병이
          // N개 있다는 뜻(예: "1/2인 것 3개") — 개수를 비고체 기준으로 확장한다.
          finalBottles = Array.from({ length: noteCount }, () => ({ stock: bottles[0].stock, ok: bottles[0].ok }))
          reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: `비고체 개수(${noteCount})에 맞춰 잔량 단일값을 ${noteCount}병으로 확장`, remainRaw, noteRaw })
        } else {
          // 잔량에 여러 상태값이 있지만 비고체 총 개수가 더 크면(예: "4/5, 4/5"인데
          // 비고체는 "10개") — 아는 값은 그대로 쓰고 나머지는 미확인으로 채워 총
          // 개수를 비고체 기준에 맞춘다.
          const pad = noteCount - bottles.length
          finalBottles = [...bottles, ...Array.from({ length: pad }, () => ({ stock: 100, ok: false }))]
          reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: `비고체 개수(${noteCount})가 잔량 파싱 개수(${bottles.length})보다 많아 ${pad}병을 미확인으로 추가`, remainRaw, noteRaw })
          padded = true
        }
      } else {
        finalBottles = bottles
        if (noteCount !== null && noteCount !== bottles.length) {
          reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: `비고체 개수(${noteCount})와 잔량 파싱 개수(${bottles.length}) 불일치`, remainRaw, noteRaw })
        }
      }
      // 패딩된 행은 이미 그 자체로 사유가 명확히 기록됐으니 원래 알던 값들까지 다시
      // "파싱 불확실"로 중복 플래그하지 않는다 — 원래 bottles가 전부 ok였다면 생략.
      if (!padded && finalBottles.some(b => !b.ok)) {
        reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: `잔량 파싱 불확실("${remainRaw}") — 100%로 임시 채움`, remainRaw, noteRaw })
      }
    } else if (noteCount !== null && noteCount > 0) {
      // 잔량은 비어있지만 비고체에 개수만 있는 경우 — 개수만큼 등록, 상태는 확인필요로 표시
      finalBottles = Array.from({ length: noteCount }, () => ({ stock: 100, ok: false }))
      reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: '잔량 정보 없이 비고체 개수만 있음(100%로 임시 채움)', remainRaw, noteRaw })
    } else {
      finalBottles = [{ stock: 100, ok: false }]
      reviewRows.push({ sheet: cfg.sheet, excelRow, name, reason: '잔량/비고체 모두 비어있음(1병, 100%로 임시 채움)', remainRaw, noteRaw })
    }

    const nameStr = String(name).trim()
    rawItems.push({
      name: nameStr,
      nameNorm: nameStr.toLowerCase(),
      cas: idx.cas >= 0 ? String(r[idx.cas] || '').trim() : '',
      company: idx.company >= 0 ? String(r[idx.company] || '').trim() : '',
      hazard: idx.hazard >= 0 ? String(r[idx.hazard] || '').trim() : '',
      category: idx.category >= 0 ? String(r[idx.category] || '').trim() : '',
      volume: idx.volume >= 0 ? r[idx.volume] : '',
      unit: idx.unit >= 0 ? String(r[idx.unit] || '').trim() : '',
      lot_no: idx.lot >= 0 ? String(r[idx.lot] || '').trim() : '',
      sheet: cfg.sheet, room: cfg.room, detail: cfg.detail,
      bottles: finalBottles, excelRow, bundled: !!bundled,
    })
    sheetBottleCount += finalBottles.length
  }
  console.log(`${cfg.sheet}: 원본 행 -> Lot ${sheetBottleCount}개`)
}

const totalBottles = rawItems.reduce((s, it) => s + it.bottles.length, 0)
const nameGroups = new Map()
for (const it of rawItems) {
  if (!nameGroups.has(it.nameNorm)) nameGroups.set(it.nameNorm, [])
  nameGroups.get(it.nameNorm).push(it)
}

console.log('')
console.log(`=== 목표 수치 ===`)
console.log(`시약 "종류"(고유 이름) 수: ${nameGroups.size}`)
console.log(`시약 "총 개수"(전체 Lot 수): ${totalBottles}`)
console.log(`확인 필요 행: ${reviewRows.length}건 (scripts/rebuild-needs-review.csv 저장)`)

// 확인 필요 리포트 저장
{
  const header = 'sheet,excelRow,name,reason,remainRaw,noteRaw'
  const csvRows = reviewRows.map(r => [r.sheet, r.excelRow, r.name, r.reason, r.remainRaw, r.noteRaw]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  writeFileSync(new URL('./rebuild-needs-review.csv', import.meta.url), [header, ...csvRows].join('\n'), 'utf-8')
}

// 시트별/시약군별 요약 저장
{
  const header = 'nameNorm,displayName,count,sheets'
  const csvRows = [...nameGroups.entries()].map(([norm, items]) => {
    const totalCount = items.reduce((s, it) => s + it.bottles.length, 0)
    const sheets = [...new Set(items.map(it => it.sheet))].join(';')
    return [norm, items[0].name, totalCount, sheets].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
  })
  writeFileSync(new URL('./rebuild-groups-summary.csv', import.meta.url), [header, ...csvRows].join('\n'), 'utf-8')
  console.log(`시약 종류별 요약: scripts/rebuild-groups-summary.csv 저장 (${nameGroups.size}줄)`)
}

if (!EXECUTE) {
  console.log('')
  console.log('드라이런 완료. 리포트를 확인한 뒤 실제 반영하려면: node scripts/rebuild-from-excel.mjs --execute')
  process.exit(0)
}

// ── 실제 반영 ──────────────────────────────────────────────────
console.log('')
console.log('=== 실제 반영 시작 ===')

const CHILD_TABLES = [
  'reagent_change_requests', 'disposal_requests', 'location_history',
  'location_requests', 'purchase_request_reagent_items', 'inventory_counts',
  'stock_logs', 'stock_history',
]
for (const t of CHILD_TABLES) {
  const { error } = await supabase.from(t).delete().not('id', 'is', null)
  if (error) console.error(`${t} 삭제 실패:`, error.message)
  else console.log(`${t} 전체 삭제 완료`)
}
{
  const { error } = await supabase.from('reagent_lots').delete().not('id', 'is', null)
  if (error) throw new Error('reagent_lots 삭제 실패: ' + error.message)
  console.log('reagent_lots 전체 삭제 완료')
}
{
  const { error } = await supabase.from('reagents').delete().not('id', 'is', null)
  if (error) throw new Error('reagents 삭제 실패: ' + error.message)
  console.log('reagents 전체 삭제 완료')
}

// 신규 위치 생성(이미 있으면 재사용)
const locationIdByKey = new Map() // "room|detail" -> id
{
  const { data: existing } = await supabase.from('locations').select('id, room, detail')
  for (const l of existing) locationIdByKey.set(`${l.room}|${l.detail || ''}`, l.id)
  for (const cfg of SHEET_CONFIG) {
    if (cfg.skip) continue
    const key = `${cfg.room}|${cfg.detail || ''}`
    if (locationIdByKey.has(key)) continue
    const { data, error } = await supabase.from('locations').insert({ room: cfg.room, detail: cfg.detail }).select().single()
    if (error) throw new Error(`위치 생성 실패 (${key}): ` + error.message)
    locationIdByKey.set(key, data.id)
    console.log(`신규 위치 생성: ${cfg.room}${cfg.detail ? ' - ' + cfg.detail : ''} (${data.id})`)
  }
}

// reagents 생성 (그룹당 1개, 필드는 신뢰도 높은 값으로 채움)
console.log('')
console.log('reagents 생성 중...')
const reagentIdByNameNorm = new Map()
{
  const toInsert = []
  for (const [norm, items] of nameGroups) {
    const best = [...items].sort((a, b) => fieldScore(b) - fieldScore(a))[0]
    const casDonor = items.find(it => isValidCas(it.cas))
    const companyDonor = items.find(it => !isJunkCompany(it.company))
    toInsert.push({
      _norm: norm,
      name: best.name,
      cas_no: casDonor ? casDonor.cas : (best.cas || null),
      company: companyDonor ? companyDonor.company : (best.company || null),
      hazard: best.hazard || null,
      category: best.category || null,
      volume: toNumericOrNull(best.volume),
      unit: best.unit || null,
      reagent_type: 'purchased',
      status: 'active',
    })
  }
  const BATCH = 300
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH).map(({ _norm, ...rest }) => rest)
    const norms = toInsert.slice(i, i + BATCH).map(x => x._norm)
    const { data, error } = await supabase.from('reagents').insert(chunk).select('id, name')
    if (error) throw new Error('reagents insert 실패: ' + error.message)
    data.forEach((row, j) => reagentIdByNameNorm.set(norms[j], row.id))
    console.log(`  reagents ${Math.min(i + BATCH, toInsert.length)}/${toInsert.length}`)
  }
}

// reagent_lots 생성
console.log('')
console.log('reagent_lots 생성 중...')
{
  const toInsert = []
  for (const it of rawItems) {
    const reagentId = reagentIdByNameNorm.get(it.nameNorm)
    const locKey = `${it.room}|${it.detail || ''}`
    const locationId = locationIdByKey.get(locKey) || null
    for (const b of it.bottles) {
      toInsert.push({
        reagent_id: reagentId,
        lot_no: it.lot_no || null,
        sealed_count: 0,
        current_stock: b.stock ?? 100,
        location_id: locationId,
        status: 'active',
        lot_source: 'excel',
      })
    }
  }
  const BATCH = 500
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('reagent_lots').insert(chunk)
    if (error) throw new Error('reagent_lots insert 실패: ' + error.message)
    console.log(`  reagent_lots ${Math.min(i + BATCH, toInsert.length)}/${toInsert.length}`)
  }
}

// 최종 검증
console.log('')
console.log('=== 최종 검증 ===')
const { count: reagentsCount } = await supabase.from('reagents').select('*', { count: 'exact', head: true })
const { count: lotsCount } = await supabase.from('reagent_lots').select('*', { count: 'exact', head: true })
console.log(`목표 종류 수: ${nameGroups.size} / 실제 reagents 수: ${reagentsCount} ${reagentsCount === nameGroups.size ? 'OK' : '!! 불일치 !!'}`)
console.log(`목표 총 개수: ${totalBottles} / 실제 reagent_lots 수: ${lotsCount} ${lotsCount === totalBottles ? 'OK' : '!! 불일치 !!'}`)
