// 시약장 재배치 작업표 — 순수 계산(네트워크/DB 없음). 입력을 변경하지 않는다.
//  - 병 1개 = reagent_lots 1행. lot_no 는 제조사 배치 번호라 병 식별키가 아니다(병 ID = reagent_lots.id).
//  - 사용중/여분은 DB 에 저장된 값이 없어 "같은 시약의 활성 병" 전체를 기준으로 여기서 계산한다.
//  - 바뀔 위치는 계획값일 뿐이다(DB 위치는 절대 바뀌지 않는다).
export const LETTER_ORDER = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '기타']
export const ROLE_IN_USE = '사용중'
export const ROLE_SPARE = '여분'

export const locationName = (loc) => (loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '미지정')
export const shortId = (id) => String(id || '').slice(0, 8)

export function letterOf(reagent) {
  const raw = String(reagent?.sort_letter || (reagent?.name || '')[0] || '').toUpperCase()
  return /^[A-Z]$/.test(raw) ? raw : '기타'
}

// 미개봉 병(sealed_count > 0)은 current_stock 이 0 으로 저장되어 있으므로 "가득 찬 병"(100)으로 취급한다.
export const isSealed = (lot) => Number(lot.sealed_count) > 0
export const remainOf = (lot) => (isSealed(lot) ? 100 : Number(lot.current_stock) || 0)

// 사용중 병 = 같은 시약 활성 병 중 잔량이 가장 적은 병, 나머지 = 여분.
// 동률 처리(업무 규칙에 없음 → 결정론적 임시 규칙): 개봉 병 우선 → 입고일 빠른 순(비어 있으면 뒤) → reagent_lots.id.
// 동률(잔량과 개봉 여부가 같음)에 의존한 병은 tie=true 로 표시해 현장 확인을 유도한다.
function compareForUse(a, b) {
  const r = remainOf(a) - remainOf(b)
  if (r) return r
  const s = Number(isSealed(a)) - Number(isSealed(b))
  if (s) return s
  const da = a.received_date || '9999-12-31', db = b.received_date || '9999-12-31'
  if (da !== db) return da < db ? -1 : 1
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
}

export function classifyBottles(lots) {
  const byReagent = new Map()
  for (const l of lots) {
    if (l.status !== 'active') continue
    if (!byReagent.has(l.reagent_id)) byReagent.set(l.reagent_id, [])
    byReagent.get(l.reagent_id).push(l)
  }
  const out = new Map()
  for (const list of byReagent.values()) {
    const sorted = [...list].sort(compareForUse)
    const best = sorted[0]
    const tied = sorted.filter(l => remainOf(l) === remainOf(best) && isSealed(l) === isSealed(best))
    const tieSet = new Set(tied.length > 1 ? tied.map(l => l.id) : [])
    sorted.forEach((l, i) => out.set(l.id, { role: i === 0 ? ROLE_IN_USE : ROLE_SPARE, tie: tieSet.has(l.id), bottlesOfReagent: list.length }))
  }
  return out
}

const cmpText = (a, b) => String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'base', numeric: true })

// plan: { spareTarget, inUseTarget, overrides } — 값은 locations.id. overrides[lotId] === '' 이면 "변경 없음" 강제.
export function buildRelocationRows({ lots, locations, selectedLocationIds, plan = {} }) {
  const locById = new Map(locations.map(l => [l.id, l]))
  const roles = classifyBottles(lots)
  const selected = new Set(selectedLocationIds)
  const locOrder = new Map([...locations].sort((a, b) => cmpText(locationName(a), locationName(b))).map((l, i) => [l.id, i]))
  const rows = []
  for (const lot of lots) {
    if (lot.status !== 'active' || !selected.has(lot.location_id)) continue
    const info = roles.get(lot.id)
    const rg = lot.reagents || {}
    const overrides = plan.overrides || {}
    const wanted = Object.prototype.hasOwnProperty.call(overrides, lot.id)
      ? overrides[lot.id]
      : (info.role === ROLE_SPARE ? plan.spareTarget : plan.inUseTarget)
    const plannedId = wanted && wanted !== lot.location_id && locById.has(wanted) ? wanted : null
    rows.push({
      lotId: lot.id, shortId: shortId(lot.id), reagentId: lot.reagent_id,
      letter: letterOf(rg), reagentName: rg.name || '', cas: rg.cas_no || '', company: rg.company || '',
      lotNo: lot.lot_no || '', spec: rg.volume ? `${rg.volume}${rg.unit || ''}` : '',
      opened: !isSealed(lot), remain: isSealed(lot) ? null : Number(lot.current_stock) || 0,
      role: info.role, tie: info.tie, bottlesOfReagent: info.bottlesOfReagent,
      currentLocationId: lot.location_id, currentLocation: locationName(locById.get(lot.location_id)),
      plannedLocationId: plannedId, plannedLocation: plannedId ? locationName(locById.get(plannedId)) : '',
    })
  }
  rows.sort((a, b) =>
    (locOrder.get(a.currentLocationId) ?? 1e9) - (locOrder.get(b.currentLocationId) ?? 1e9) ||
    LETTER_ORDER.indexOf(a.letter) - LETTER_ORDER.indexOf(b.letter) ||
    cmpText(a.reagentName, b.reagentName) || cmpText(a.company, b.company) ||
    cmpText(a.lotNo, b.lotNo) || (a.lotId < b.lotId ? -1 : a.lotId > b.lotId ? 1 : 0))
  return rows
}

export function groupByLocation(rows, locations, selectedLocationIds) {
  const locById = new Map(locations.map(l => [l.id, l]))
  const orderIndex = new Map(rows.map((r, i) => [r.currentLocationId, i]))
  const ids = [...new Set(selectedLocationIds)].filter(id => locById.has(id))
    .sort((a, b) => (orderIndex.get(a) ?? 1e9) - (orderIndex.get(b) ?? 1e9) || cmpText(locationName(locById.get(a)), locationName(locById.get(b))))
  return ids.map(id => {
    const list = rows.filter(r => r.currentLocationId === id)
    return { locationId: id, locationName: locationName(locById.get(id)), rows: list, summary: summarize(list) }
  })
}

export function summarize(rows) {
  const letters = Object.fromEntries(LETTER_ORDER.map(k => [k, 0]))
  let inUse = 0, spare = 0, moves = 0, ties = 0
  const kinds = new Set()
  for (const r of rows) {
    letters[r.letter]++
    if (r.role === ROLE_SPARE) spare++; else inUse++
    if (r.plannedLocationId) moves++
    if (r.tie) ties++
    kinds.add(r.reagentId)
  }
  const letterLine = LETTER_ORDER.filter(k => letters[k] > 0).map(k => `${k} ${letters[k]}`).join(' / ')
  return { total: rows.length, kinds: kinds.size, letters, letterLine, inUse, spare, moves, ties }
}
