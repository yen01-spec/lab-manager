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
//  · 개봉 여부(실제 사용 흔적)는 자동판정 기준: 최소 잔량 후보 중 개봉 병이 있으면 개봉 병만 후보.
//  · 그래도 후보가 둘 이상이면 자동 확정하지 않는다 → 역할 = "현장 확인 필요"(후보 전원). 입고일/병 ID 는 판정에 쓰지 않는다(표시/정렬 전용).
//  · sealed_count > 1(여러 병이 한 행에 묶임)은 병 단위 판정 불가 → "현장 확인 필요"(reason 'grouped'), 순위 계산에서 제외.
//  · roleOverrides[lotId] ∈ {사용중, 여분} 로 관리자가 병별 역할을 직접 지정할 수 있다(수동 지정이 우선).
export const ROLE_CHECK = '현장 확인 필요'

export function classifyBottles(lots, roleOverrides = {}) {
  const byReagent = new Map()
  for (const l of lots) {
    if (l.status !== 'active') continue
    if (!byReagent.has(l.reagent_id)) byReagent.set(l.reagent_id, [])
    byReagent.get(l.reagent_id).push(l)
  }
  const out = new Map()
  for (const list of byReagent.values()) {
    const put = (l, role, reason) => out.set(l.id, { role, reason, check: role === ROLE_CHECK, manual: false, bottlesOfReagent: list.length })
    const grouped = list.filter(l => Number(l.sealed_count) > 1)
    grouped.forEach(l => put(l, ROLE_CHECK, 'grouped'))
    const rest = list.filter(l => !(Number(l.sealed_count) > 1))
    if (rest.length === 1) put(rest[0], ROLE_IN_USE, 'single')
    else if (rest.length > 1) {
      const min = Math.min(...rest.map(remainOf))
      const cands = rest.filter(l => remainOf(l) === min)
      const opened = cands.filter(l => !isSealed(l))
      const finalists = opened.length ? opened : cands
      if (finalists.length === 1) rest.forEach(l => put(l, l === finalists[0] ? ROLE_IN_USE : ROLE_SPARE, 'auto'))
      else rest.forEach(l => put(l, finalists.includes(l) ? ROLE_CHECK : ROLE_SPARE, finalists.includes(l) ? 'tie' : 'auto'))
    }
    // 수동 지정
    let manualInUse = false
    for (const l of list) {
      const ov = roleOverrides[l.id]
      if (ov === ROLE_IN_USE || ov === ROLE_SPARE) { out.set(l.id, { ...out.get(l.id), role: ov, reason: 'manual', check: false, manual: true }); if (ov === ROLE_IN_USE) manualInUse = true }
    }
    // 관리자가 사용중 병을 지정했다면 같은 시약의 동률 후보(미지정)는 여분으로 확정
    if (manualInUse) for (const l of list) { const v = out.get(l.id); if (v.role === ROLE_CHECK && v.reason === 'tie') out.set(l.id, { ...v, role: ROLE_SPARE, reason: 'after-manual', check: false }) }
  }
  return out
}

const cmpText = (a, b) => String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'base', numeric: true })

// plan: { spareTarget, inUseTarget, overrides } — 값은 locations.id. overrides[lotId] === '' 이면 "변경 없음" 강제.
export function buildRelocationRows({ lots, locations, selectedLocationIds, plan = {} }) {
  const locById = new Map(locations.map(l => [l.id, l]))
  const roles = classifyBottles(lots, plan.roleOverrides || {})
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
      : (info.role === ROLE_SPARE ? plan.spareTarget : info.role === ROLE_IN_USE ? plan.inUseTarget : null)
    const plannedId = wanted && wanted !== lot.location_id && locById.has(wanted) ? wanted : null
    rows.push({
      lotId: lot.id, shortId: shortId(lot.id), reagentId: lot.reagent_id,
      letter: letterOf(rg), reagentName: rg.name || '', cas: rg.cas_no || '', company: rg.company || '',
      lotNo: lot.lot_no || '', spec: rg.volume ? `${rg.volume}${rg.unit || ''}` : '',
      opened: !isSealed(lot), remain: isSealed(lot) ? null : Number(lot.current_stock) || 0,
      role: info.role, check: info.check, manualRole: info.manual, roleReason: info.reason, bottlesOfReagent: info.bottlesOfReagent,
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
  let inUse = 0, spare = 0, moves = 0, check = 0
  const kinds = new Set()
  for (const r of rows) {
    letters[r.letter]++
    if (r.role === ROLE_SPARE) spare++; else if (r.role === ROLE_CHECK) check++; else inUse++
    if (r.plannedLocationId) moves++
    kinds.add(r.reagentId)
  }
  const letterLine = LETTER_ORDER.filter(k => letters[k] > 0).map(k => `${k} ${letters[k]}`).join(' / ')
  return { total: rows.length, kinds: kinds.size, letters, letterLine, inUse, spare, check, moves, provisional: check > 0 }
}
