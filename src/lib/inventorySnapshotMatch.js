// 현재 재고 Excel 동기화 — 파싱/검증/매칭/diff 순수함수 (Phase 4b-2).
// UI(InventorySnapshotSyncTab)와 완전히 분리 — 여기엔 DOM/React가 전혀 없다.
// 이 모듈은 "무엇을 할지"만 계산한다. 실제 INSERT/UPDATE/DELETE는 하지 않는다(Phase 4b-3 RPC).
//
// 설계 원칙(Phase 4b-1 확정 정책 그대로):
//  - Excel 1행 = 현재 재고의 실물 병(Lot) 1개. 합치지 않는다.
//  - CAS는 unique가 아니고(실 데이터 236그룹/810행 중복), lot_no도 (reagent,lot_no) 기준
//    유일하지 않다(실 데이터 58그룹) — 그래서 후보가 여럿이면 절대 자동으로 하나를 고르지
//    않고 REVIEW로 보낸다. round-trip __reagent_id/__lot_id가 있으면 그게 최우선.
//  - 부분문자열 자동 병합 금지 — 이름 비교는 항상 정규화된 "완전 일치"만 본다.

export const CAS_RE = /^\d{2,7}-\d{2}-\d$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const STRONG_CONFIRM_TEXT = '현재재고동기화'

// ── 텍스트 정규화 ────────────────────────────────────────────────
// normalizeText: 대소문자/전각만 통일(비교용 원문 보존 목적, 예: CAS/파일명 표시).
// normalizeKey: 공백·기호까지 제거한 "완전 일치 비교" 전용 키(이름/위치/제조사 등).
export function normalizeText(s) {
  return (s ?? '').toString().normalize('NFKC').trim().toLowerCase()
}
export function normalizeKey(s) {
  return normalizeText(s).replace(/[^a-z0-9가-힣]/g, '')
}

export function locationLabel(loc) {
  if (!loc) return ''
  return `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}`
}

// ── 인덱스(1회 생성, O(1) 조회용 — §45/§46) ────────────────────────
// CAS/이름/위치가 여러 reagent에 걸릴 수 있어(중복 CAS 236그룹 등) 절대 단일값 Map으로
// 마지막 값을 덮어쓰지 않는다(BulkAddTab의 기존 결함을 반복하지 않음) — 항상 배열로 모은다.
export function buildMatchIndexes({ reagents, lots, locations }) {
  const reagentsById = new Map(reagents.map(r => [r.id, r]))
  const lotsById = new Map(lots.map(l => [l.id, l]))
  const locationsById = new Map(locations.map(l => [l.id, l]))

  const reagentsByCas = new Map()
  const reagentsByNormName = new Map()
  for (const r of reagents) {
    if (r.cas_no) {
      const k = normalizeText(r.cas_no)
      ;(reagentsByCas.get(k) || reagentsByCas.set(k, []).get(k)).push(r)
    }
    for (const nm of [r.name, r.name_ko]) {
      const k = normalizeKey(nm)
      if (!k) continue
      const arr = reagentsByNormName.get(k) || (reagentsByNormName.set(k, []), reagentsByNormName.get(k))
      if (!arr.includes(r)) arr.push(r)
    }
  }

  const lotsByReagent = new Map()
  const lotsByReagentAndLotNo = new Map()
  for (const l of lots) {
    ;(lotsByReagent.get(l.reagent_id) || (lotsByReagent.set(l.reagent_id, []), lotsByReagent.get(l.reagent_id))).push(l)
    if (l.lot_no) {
      const k = l.reagent_id + '::' + normalizeKey(l.lot_no)
      ;(lotsByReagentAndLotNo.get(k) || (lotsByReagentAndLotNo.set(k, []), lotsByReagentAndLotNo.get(k))).push(l)
    }
  }

  const locationsByLabel = new Map()
  for (const loc of locations) locationsByLabel.set(normalizeKey(locationLabel(loc)), loc)

  return { reagentsById, lotsById, locationsById, reagentsByCas, reagentsByNormName, lotsByReagent, lotsByReagentAndLotNo, locationsByLabel, locations }
}

// 후보 중 이름이 완전히 같은 것만 남김(둘 다 없으면 원본 그대로 반환 — 좁힐 근거가 없다는 뜻)
function narrowByName(candidates, row) {
  const key = normalizeKey(row.nameEn || row.nameKo)
  if (!key) return candidates
  const narrowed = candidates.filter(c => normalizeKey(c.name) === key || normalizeKey(c.name_ko) === key)
  return narrowed.length > 0 ? narrowed : candidates
}
function narrowByCompany(candidates, row) {
  if (!row.company) return candidates
  const key = normalizeKey(row.company)
  const narrowed = candidates.filter(c => normalizeKey(c.company) === key)
  return narrowed.length > 0 ? narrowed : candidates
}

// ── 엑셀 워크북 파싱 ────────────────────────────────────────────
export const DATA_SHEET_NAME = '현재재고'
export const GUIDE_SHEET_NAME = '사용안내'

export const SNAPSHOT_COLUMNS = [
  { key: 'nameEn', label: '영문명' },
  { key: 'nameKo', label: '국문명' },
  { key: 'casNo', label: 'CAS No.' },
  { key: 'company', label: '제조사' },
  { key: 'catNo', label: 'Cat.No.' },
  { key: 'purity', label: '순도' },
  { key: 'volume', label: '규격' },
  { key: 'unit', label: '단위' },
  { key: 'lotNo', label: 'Lot No.' },
  { key: 'lotKind', label: 'Lot 구분' },
  { key: 'locationLabel', label: '보관 위치' },
  { key: 'shelfPosition', label: '세부 위치' },
  { key: 'receivedDate', label: '입고일' },
  { key: 'expiryDate', label: '유효기간' },
  { key: 'currentStock', label: '현재 잔량(%)' },
  { key: 'sealedCount', label: '미개봉 수량' },
  { key: 'note', label: '비고' },
  { key: 'reagentId', label: '__reagent_id' },
  { key: 'lotId', label: '__lot_id' },
  { key: 'lotSource', label: '__lot_source' },
]

function excelDateStr(v) {
  if (v == null || v === '') return ''
  // 호출부가 XLSX.read(..., { cellDates: true })로 읽으면 날짜 서식 셀은 JS Date로 들어온다
  // (엑셀 serial number를 이 순수모듈이 직접 계산하지 않기 위함 — xlsx 라이브러리 의존 제거).
  if (v instanceof Date) {
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate()
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const s = v.toString().trim()
  const m = s.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return s
}

// XLSX.utils.sheet_to_json({header:1}) 로 뽑은 aoa를 받는다(라이브러리 의존은 호출부에서 처리).
export function parseInventorySnapshotAoa(sheetNames, getSheetAoa) {
  const sheetName = sheetNames.includes(DATA_SHEET_NAME) ? DATA_SHEET_NAME
    : sheetNames.find(n => n !== GUIDE_SHEET_NAME) || sheetNames[0]
  if (!sheetName) return { fileError: '워크북에 시트가 없습니다.' }
  const aoa = getSheetAoa(sheetName)
  if (!aoa || aoa.length === 0) return { fileError: `"${sheetName}" 시트가 비어 있습니다.` }

  const labelToKey = new Map(SNAPSHOT_COLUMNS.map(c => [normalizeText(c.label), c.key]))
  const headerIdx = aoa.findIndex(r => Array.isArray(r) && r.filter(c => labelToKey.has(normalizeText(c))).length >= 4)
  if (headerIdx < 0) return { fileError: '헤더 행을 찾지 못했습니다. "현재 재고 동기화용 Excel 다운로드"로 받은 양식을 그대로 사용해주세요.' }

  const headerRow = aoa[headerIdx].map(normalizeText)
  const seen = new Set()
  const dupLabels = new Set()
  headerRow.forEach(h => { if (h && labelToKey.has(h)) { if (seen.has(h)) dupLabels.add(h); seen.add(h) } })
  if (dupLabels.size > 0) return { fileError: `중복된 열이 있습니다: ${[...dupLabels].join(', ')}` }

  const colOf = {}
  for (const { key, label } of SNAPSHOT_COLUMNS) colOf[key] = headerRow.indexOf(normalizeText(label))
  if (colOf.nameEn < 0 && colOf.nameKo < 0) return { fileError: '영문명/국문명 열을 찾지 못했습니다.' }
  if (colOf.locationLabel < 0) return { fileError: '보관 위치 열을 찾지 못했습니다.' }

  const blank = v => { const s = (v ?? '').toString().trim(); return (s === '' || s === '-') ? '' : s }
  const rows = []
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i]
    if (!raw || raw.every(c => (c ?? '').toString().trim() === '')) continue
    const g = key => (colOf[key] >= 0 ? raw[colOf[key]] : '')
    rows.push({
      rowNo: i + 1,
      nameEn: blank(g('nameEn')), nameKo: blank(g('nameKo')), casNo: blank(g('casNo')),
      company: blank(g('company')), catNo: blank(g('catNo')), purity: blank(g('purity')),
      volume: blank(g('volume')), unit: blank(g('unit')),
      lotNo: blank(g('lotNo')),
      locationLabelRaw: blank(g('locationLabel')), shelfPosition: blank(g('shelfPosition')),
      receivedDate: excelDateStr(g('receivedDate')), expiryDate: excelDateStr(g('expiryDate')),
      currentStockRaw: blank(g('currentStock')), sealedCountRaw: blank(g('sealedCount')),
      note: blank(g('note')),
      reagentIdRaw: blank(g('reagentId')), lotIdRaw: blank(g('lotId')),
      _globalErrors: [],
    })
  }
  if (rows.length === 0) return { fileError: '데이터 행이 없습니다.' }
  return { sheetName, headerIdx, rows }
}

// ── 행 단위 검증(§11/§12/§20/§21) ──────────────────────────────
function suggestLocation(text, locations) {
  const key = normalizeKey(text)
  if (!key) return null
  return locations.find(l => key.includes(normalizeKey(l.room)) || normalizeKey(l.room).includes(key)) || null
}

export function validateRow(row, idx) {
  const errors = [...row._globalErrors]
  const warnings = []

  if (!row.nameEn && !row.nameKo) errors.push({ code: 'name_missing', message: '영문명/국문명이 모두 없습니다.' })

  let resolvedLocation = null
  if (!row.locationLabelRaw) {
    errors.push({ code: 'location_missing', message: '보관 위치가 없습니다.' })
  } else {
    resolvedLocation = idx.locationsByLabel.get(normalizeKey(row.locationLabelRaw)) || null
    if (!resolvedLocation) {
      const s = suggestLocation(row.locationLabelRaw, idx.locations)
      errors.push({
        code: 'location_unmatched',
        message: `보관 위치 "${row.locationLabelRaw}"를 찾지 못했습니다.` + (s ? ` (비슷한 위치: "${locationLabel(s)}")` : ' 등록된 위치와 정확히 일치해야 합니다.'),
      })
    }
  }

  const hasStockRaw = row.currentStockRaw !== ''
  const hasSealedRaw = row.sealedCountRaw !== ''
  if (!hasStockRaw && !hasSealedRaw) errors.push({ code: 'stock_missing', message: '현재 잔량과 미개봉 수량이 모두 없습니다.' })

  let currentStock = null
  if (hasStockRaw) {
    const n = Number(row.currentStockRaw)
    if (!Number.isFinite(n)) errors.push({ code: 'stock_not_number', message: `현재 잔량이 숫자가 아닙니다: "${row.currentStockRaw}"` })
    else if (n < 0 || n > 100) errors.push({ code: 'stock_out_of_range', message: `현재 잔량은 0~100 사이여야 합니다: ${n}` })
    else currentStock = Math.round(n)
  }
  let sealedCount = null
  if (hasSealedRaw) {
    const n = Number(row.sealedCountRaw)
    if (!Number.isFinite(n) || !Number.isInteger(n)) errors.push({ code: 'sealed_not_integer', message: `미개봉 수량은 정수여야 합니다: "${row.sealedCountRaw}"` })
    else if (n < 0) errors.push({ code: 'sealed_negative', message: `미개봉 수량은 0 이상이어야 합니다: ${n}` })
    else sealedCount = n
  }

  if (row.casNo && !CAS_RE.test(row.casNo)) errors.push({ code: 'cas_format', message: `CAS 형식이 올바르지 않습니다: "${row.casNo}" (예: 67-64-1)` })
  if (row.reagentIdRaw && !UUID_RE.test(row.reagentIdRaw)) errors.push({ code: 'reagent_id_malformed', message: `__reagent_id 형식이 올바르지 않습니다(UUID 아님): "${row.reagentIdRaw}"` })
  if (row.lotIdRaw && !UUID_RE.test(row.lotIdRaw)) errors.push({ code: 'lot_id_malformed', message: `__lot_id 형식이 올바르지 않습니다(UUID 아님): "${row.lotIdRaw}"` })

  if (!row.casNo) warnings.push({ code: 'cas_missing', message: 'CAS No.가 없습니다.' })
  if (!row.company) warnings.push({ code: 'company_missing', message: '제조사가 없습니다.' })
  if (!row.lotNo) warnings.push({ code: 'lotno_missing', message: 'Lot No.가 없어 내부 관리번호가 자동 생성될 예정입니다.' })
  if (!row.catNo) warnings.push({ code: 'catno_missing', message: 'Cat.No.가 없습니다.' })
  if (!row.purity) warnings.push({ code: 'purity_missing', message: '순도가 없습니다.' })
  if (!row.volume || !row.unit) warnings.push({ code: 'spec_missing', message: '규격/단위가 없습니다.' })
  if (!row.receivedDate) warnings.push({ code: 'received_missing', message: '입고일이 없습니다.' })
  if (!row.expiryDate) warnings.push({ code: 'expiry_missing', message: '유효기간이 없습니다.' })

  return { errors, warnings, resolvedLocation, currentStock, sealedCount }
}

// ── 전역 검증(파일 전체를 봐야만 알 수 있는 것들, §22) ──────────
export function runGlobalValidation(rows) {
  const byLotId = new Map()
  for (const r of rows) {
    if (r.lotIdRaw && UUID_RE.test(r.lotIdRaw)) {
      ;(byLotId.get(r.lotIdRaw) || (byLotId.set(r.lotIdRaw, []), byLotId.get(r.lotIdRaw))).push(r)
    }
  }
  for (const [lotId, group] of byLotId) {
    if (group.length > 1) for (const r of group) r._globalErrors.push({ code: 'lot_id_duplicate_in_file', message: `__lot_id(${lotId})가 파일 안에서 ${group.length}번 나옵니다.` })
  }

  // 완전히 동일한 "신규" 행(ID 둘 다 없는 행) 중복 — 실수로 같은 줄을 복붙한 경우
  const seen = new Map()
  for (const r of rows) {
    if (r.reagentIdRaw || r.lotIdRaw) continue
    const key = [normalizeKey(r.nameEn || r.nameKo), normalizeText(r.casNo), normalizeText(r.company),
      normalizeText(r.purity), normalizeText(r.volume), normalizeText(r.unit), normalizeText(r.lotNo),
      normalizeKey(r.locationLabelRaw), r.currentStockRaw, r.sealedCountRaw].join('|')
    ;(seen.get(key) || (seen.set(key, []), seen.get(key))).push(r)
  }
  for (const [, group] of seen) {
    if (group.length > 1) for (const r of group) r._globalErrors.push({ code: 'duplicate_new_row', message: `완전히 동일한 신규 행이 ${group.length}건 있습니다(중복 입력 의심).` })
  }
}

// ── reagent/lot 매칭 (§1-4·§1-5, §16~19) ───────────────────────
function matchReagentRaw(row, idx) {
  if (row.reagentIdRaw) {
    if (!UUID_RE.test(row.reagentIdRaw)) return { status: 'blocked' } // validateRow가 이미 error 기록
    const existing = idx.reagentsById.get(row.reagentIdRaw)
    if (existing) return { status: 'exact', id: existing.id, reagent: existing, source: 'id' }
    // 유효한 UUID인데 DB에 없음 — 자동 fallback 금지, 추천 후보만 제시(§1-3)
    const casCands = row.casNo ? (idx.reagentsByCas.get(normalizeText(row.casNo)) || []) : []
    const nameCands = idx.reagentsByNormName.get(normalizeKey(row.nameEn || row.nameKo)) || []
    const candidates = [...new Set([...casCands, ...nameCands])].slice(0, 8)
    return { status: 'review', id: null, candidates, reason: 'id_not_found' }
  }
  if (row.casNo && CAS_RE.test(row.casNo)) {
    const casCandidates = idx.reagentsByCas.get(normalizeText(row.casNo)) || []
    if (casCandidates.length === 1) return { status: 'exact', id: casCandidates[0].id, reagent: casCandidates[0], source: 'cas' }
    if (casCandidates.length > 1) {
      const narrowed = narrowByName(casCandidates, row)
      if (narrowed.length === 1) return { status: 'exact', id: narrowed[0].id, reagent: narrowed[0], source: 'cas+name' }
      return { status: 'review', id: null, candidates: narrowed, reason: 'cas_multi' }
    }
  }
  const nameKey = normalizeKey(row.nameEn || row.nameKo)
  const nameCandidates = nameKey ? (idx.reagentsByNormName.get(nameKey) || []) : []
  if (nameCandidates.length === 1) return { status: 'exact', id: nameCandidates[0].id, reagent: nameCandidates[0], source: 'name' }
  if (nameCandidates.length > 1) {
    const narrowed = narrowByCompany(nameCandidates, row)
    if (narrowed.length === 1) return { status: 'exact', id: narrowed[0].id, reagent: narrowed[0], source: 'name+company' }
    return { status: 'review', id: null, candidates: narrowed, reason: 'name_multi' }
  }
  return { status: 'new' }
}

function matchLotRaw(row, reagentMatch, idx) {
  if (row.lotIdRaw) {
    if (!UUID_RE.test(row.lotIdRaw)) return { status: 'blocked' }
    const existing = idx.lotsById.get(row.lotIdRaw)
    if (!existing) return { status: 'review', id: null, candidates: [], reason: 'id_not_found' }
    const resolvedReagentId = reagentMatch.status === 'exact' ? reagentMatch.id : null
    if (resolvedReagentId && existing.reagent_id !== resolvedReagentId) {
      return { status: 'blocked', reason: 'relationship_mismatch', id: existing.id, lot: existing }
    }
    return { status: 'exact', id: existing.id, lot: existing, source: 'id' }
  }
  if (reagentMatch.status === 'new') return { status: 'new' }
  if (reagentMatch.status !== 'exact') return { status: 'review', id: null, candidates: [], reason: 'reagent_unresolved' }
  if (!row.lotNo) return { status: 'new' }
  const key = reagentMatch.id + '::' + normalizeKey(row.lotNo)
  const candidates = idx.lotsByReagentAndLotNo.get(key) || []
  if (candidates.length === 1) return { status: 'exact', id: candidates[0].id, lot: candidates[0], source: 'reagent+lotno' }
  if (candidates.length > 1) return { status: 'review', id: null, candidates, reason: 'lotno_multi' }
  return { status: 'new' }
}

// ── 재고 필드 최종값 결정(§41~43) ───────────────────────────────
// 기존 매칭 Lot: Excel 값이 있으면 그 값, 없으면(빈칸) 기존 DB 값 유지 — 빈칸을 삭제로 해석 안 함.
// 신규 Lot(참고할 기존 값이 없음): 값이 하나만 있으면 나머지는 §1-6/§12 기본값으로 보충.
function resolveStockFields(validated, existingLot) {
  const hasStock = validated.currentStock !== null
  const hasSealed = validated.sealedCount !== null
  if (existingLot) {
    return {
      current_stock: hasStock ? validated.currentStock : existingLot.current_stock,
      sealed_count: hasSealed ? validated.sealedCount : existingLot.sealed_count,
    }
  }
  if (hasStock && !hasSealed) return { current_stock: validated.currentStock, sealed_count: 0 }
  if (hasSealed && !hasStock) return { current_stock: 0, sealed_count: validated.sealedCount }
  return { current_stock: validated.currentStock ?? 0, sealed_count: validated.sealedCount ?? 0 }
}

// blank 셀은 기존 값 유지(§41/§42) — 신규 Lot이면 빈 값 그대로 null.
function resolveKeepIfBlank(excelVal, existingVal) {
  return excelVal !== '' && excelVal != null ? excelVal : (existingVal ?? null)
}

// ── 메인 파이프라인: 정규화된 rows + 인덱스 + 사용자의 REVIEW 선택 → 최종 매칭 결과 ──
// reviewChoices: { [rowNo]: { reagent?: 'NEW'|reagentId, lot?: 'NEW'|lotId,
//                              company?: 'keep'|'treat_as_new'|'fill' } }
// 순수 함수라 reviewChoices가 바뀔 때마다 다시 불러도 안전(§45 — O(n), 인덱스 재사용).
// 신규 마스터 grouping 키(Phase 4b-3a §13/§28) — 같은 신규 시약이 여러 병(행)으로 있어도
// RPC가 마스터를 한 번만 만들도록, 현재 master grouping 정책(§import-inventory-2026-2.mjs)과
// 동일하게 "정규화 이름 + 제조사 + 순도 + 규격/단위"로 묶는다. CAS만으로 묶지 않는다(§28).
export function newReagentKey(row) {
  return [normalizeKey(row.nameEn || row.nameKo), normalizeKey(row.company), normalizeKey(row.purity),
    normalizeText(row.volume), normalizeKey(row.unit)].join('|')
}

export function matchInventorySnapshotRows(rows, idx, reviewChoices = {}) {
  return rows.map(row => {
    const validated = validateRow(row, idx)
    const choice = reviewChoices[row.rowNo] || {}

    let reagentMatch = matchReagentRaw(row, idx)
    if (reagentMatch.status === 'review' && choice.reagent) {
      reagentMatch = choice.reagent === 'NEW'
        ? { status: 'new', reviewResolved: true }
        : { status: 'exact', id: choice.reagent, reagent: idx.reagentsById.get(choice.reagent), reviewResolved: true, source: 'review' }
    }
    if (reagentMatch.status === 'new' && !reagentMatch.newReagentKey) {
      reagentMatch = { ...reagentMatch, newReagentKey: newReagentKey(row) }
    }

    let lotMatch = matchLotRaw(row, reagentMatch, idx)
    if (lotMatch.status === 'review' && choice.lot) {
      lotMatch = choice.lot === 'NEW'
        ? { status: 'new', reviewResolved: true }
        : { status: 'exact', id: choice.lot, lot: idx.lotsById.get(choice.lot), reviewResolved: true, source: 'review' }
    }

    // company mismatch review(§1-9/§23) — 기존 EXACT reagent에서만 의미가 있다.
    let companyReview = null
    if (reagentMatch.status === 'exact' && reagentMatch.reagent) {
      const dbCompany = (reagentMatch.reagent.company || '').trim()
      const excelCompany = (row.company || '').trim()
      if (excelCompany && dbCompany && normalizeKey(excelCompany) !== normalizeKey(dbCompany)) {
        companyReview = { kind: 'mismatch', dbCompany, excelCompany, resolved: choice.company || null }
      } else if (!dbCompany && excelCompany) {
        companyReview = { kind: 'fillable', dbCompany: '', excelCompany, resolved: choice.company || null }
      }
    }
    // "신규 시약으로 처리" 선택 시 이 행은 통째로 신규 취급(§23-B)
    if (companyReview?.resolved === 'treat_as_new') {
      reagentMatch = { status: 'new', forcedByCompanyReview: true, newReagentKey: newReagentKey(row) }
      lotMatch = { status: 'new' }
    }

    if (lotMatch.status === 'blocked') {
      validated.errors.push({
        code: 'lot_reagent_mismatch',
        message: `__lot_id가 가리키는 기존 Lot은 다른 시약(${lotMatch.lot?.reagent_id})에 속해 있습니다.`,
      })
    }
    if (reagentMatch.status === 'blocked' || lotMatch.status === 'blocked') {
      // malformed UUID 등 이미 validateRow에서 error가 잡혔을 케이스 — 중복 메시지 방지 목적의 표시만.
    }

    const existingLot = lotMatch.status === 'exact' ? lotMatch.lot : null
    const resolvedStock = resolveStockFields(validated, existingLot)

    return {
      ...row,
      errors: validated.errors,
      warnings: validated.warnings,
      resolvedLocation: validated.resolvedLocation,
      currentStock: validated.currentStock,
      sealedCount: validated.sealedCount,
      reagentMatch,
      lotMatch,
      companyReview,
      resolvedStock,
      resolvedCatNo: resolveKeepIfBlank(row.catNo, existingLot?.cat_no),
      resolvedReceivedDate: resolveKeepIfBlank(row.receivedDate, existingLot?.received_date),
      resolvedExpiryDate: resolveKeepIfBlank(row.expiryDate, existingLot?.expiry_date),
      resolvedShelfPosition: resolveKeepIfBlank(row.shelfPosition, existingLot?.shelf_position),
    }
  })
}

// 행 하나의 전체 상태 버킷 — 화면 필터/요약 카운트가 전부 이 함수 하나만 기준으로 삼는다.
export function rowBucket(row) {
  if (row.errors.length > 0) return 'error'
  const unresolvedReview =
    (row.reagentMatch.status === 'review' && !row.reagentMatch.reviewResolved) ||
    (row.lotMatch.status === 'review' && !row.lotMatch.reviewResolved) ||
    (row.companyReview != null && !row.companyReview.resolved)
  if (unresolvedReview) return 'review'
  if (row.reagentMatch.status === 'new' || row.lotMatch.status === 'new') return 'new'
  if (row.reagentMatch.status === 'exact' && row.lotMatch.status === 'exact') {
    return rowHasDiff(row) ? 'changed' : 'unchanged'
  }
  return 'review' // 안전망(도달하면 안 되는 상태)
}

// ── 기존 Lot diff(§25/§26) ─────────────────────────────────────
export function buildRowDiff(row, idx) {
  if (row.lotMatch.status !== 'exact' || !row.lotMatch.lot) return []
  const lot = row.lotMatch.lot
  const diffs = []
  const push = (label, before, after) => { if (String(before ?? '') !== String(after ?? '')) diffs.push({ label, before, after }) }
  push('보관 위치', locationLabel(idx.locationsById.get(lot.location_id)), locationLabel(row.resolvedLocation))
  push('세부 위치', lot.shelf_position || '', row.resolvedShelfPosition || '')
  push('현재 잔량(%)', lot.current_stock, row.resolvedStock.current_stock)
  push('미개봉 수량', lot.sealed_count, row.resolvedStock.sealed_count)
  push('Cat.No.', lot.cat_no || '', row.resolvedCatNo || '')
  push('입고일', lot.received_date || '', row.resolvedReceivedDate || '')
  push('유효기간', lot.expiry_date || '', row.resolvedExpiryDate || '')
  return diffs
}
export function rowHasDiff(row) {
  // buildRowDiff는 idx.locationsById가 필요해 여기서 다시 계산하지 않고 위치만 별도 비교 +
  // 나머지는 lot 원본과 직접 비교(짧은 필드 5개라 idx 없이도 충분히 싸다).
  const lot = row.lotMatch.lot
  if (!lot) return false
  if (lot.location_id !== row.resolvedLocation?.id) return true
  if ((lot.shelf_position || '') !== (row.resolvedShelfPosition || '')) return true
  if (lot.current_stock !== row.resolvedStock.current_stock) return true
  if (lot.sealed_count !== row.resolvedStock.sealed_count) return true
  if ((lot.cat_no || '') !== (row.resolvedCatNo || '')) return true
  if ((lot.received_date || '') !== (row.resolvedReceivedDate || '')) return true
  if ((lot.expiry_date || '') !== (row.resolvedExpiryDate || '')) return true
  return false
}

// ── snapshot에서 빠진 active Lot(§27/§28) ───────────────────────
// REVIEW가 남아있는 동안엔 "확정"이 아니라 "잠정" — 호출부에서 provisional 여부를 같이 보여준다.
export function computeExcludedLots(allActiveLots, matchedRows) {
  const matchedLotIds = new Set()
  for (const row of matchedRows) {
    if (row.errors.length > 0) continue
    if (row.lotMatch.status === 'exact' && row.lotMatch.id) matchedLotIds.add(row.lotMatch.id)
  }
  return allActiveLots.filter(l => !matchedLotIds.has(l.id))
}

// ── reagent master가 archived 예정인지(§30) ─────────────────────
export function computeArchivedReagentsPreview(reagents, lotsByReagent, matchedRows) {
  const keepsStock = new Set()
  for (const row of matchedRows) {
    if (row.errors.length > 0) continue
    if (row.reagentMatch.status === 'exact' && row.reagentMatch.id) keepsStock.add(row.reagentMatch.id)
  }
  return reagents.filter(r => (lotsByReagent.get(r.id) || []).length > 0 && !keepsStock.has(r.id))
}

// snapshot 시작 시점(=미리보기 생성 시점)의 active Lot id 전체 — RPC가 "미리보기 이후
// 재고가 바뀌었는지"를 판단하는 기준선이 된다(Phase 4b-3a §7/§8). preview를 다시 만들면
// 이 값도 다시 계산해야 한다(호출부가 매번 새로 넘겨야 함 — 여기서 캐시하지 않는다).
export function computeBaselineActiveLotIds(allActiveLots) {
  return allActiveLots.map(l => l.id)
}

// company_action: RPC가 신뢰할 유일한 "제조사 보완" 신호. 'fill_if_empty'만 실제 UPDATE
// 후보이고, 그 외(기본값 'keep')는 RPC가 절대 company를 건드리지 않는다(§1-9/§11).
function companyAction(row) {
  return row.companyReview?.resolved === 'fill' ? 'fill_if_empty' : 'keep'
}

// ── 최종 payload(§35~38, Phase 4b-3a §7/§11/§13로 확장) — 준비된(matched/new) 행만,
// review/error 행은 제외. RPC는 이 payload의 match_confidence/lot_source_hint를 그대로
// 믿지 않고 서버에서 다시 검증한다(§10) — 여기 있는 값은 어디까지나 "요청 의도"다.
export function buildInventorySnapshotPayload(matchedRows, { snapshotId, sourceFilename, baselineActiveLotIds }) {
  const rows = matchedRows
    .filter(r => ['changed', 'unchanged', 'new'].includes(rowBucket(r)))
    .map(r => {
      const reviewResolved = !!(r.reagentMatch.reviewResolved || r.lotMatch.reviewResolved || (r.companyReview && r.companyReview.resolved))
      const isNew = r.reagentMatch.status === 'new' || r.lotMatch.status === 'new'
      const reagentId = r.reagentMatch.status === 'exact' ? r.reagentMatch.id : null
      const lotId = r.lotMatch.status === 'exact' ? r.lotMatch.id : null
      return {
        row_no: r.rowNo,
        reagent_id: reagentId,
        reagent_lot_id: lotId,
        match_confidence: isNew ? 'new' : (reviewResolved ? 'review_confirmed' : 'exact'),
        // 신규 마스터 grouping — 같은 신규 시약의 여러 병이 마스터를 한 번만 만들도록(§13/§28).
        new_reagent_key: reagentId ? null : (r.reagentMatch.newReagentKey || null),
        name: r.nameEn || r.nameKo || null, name_ko: r.nameKo || null, cas_no: r.casNo || null,
        company: r.company || null, cat_no: r.resolvedCatNo || null, purity: r.purity || null,
        volume: r.volume || null, unit: r.unit || null,
        lot_no: r.lotNo || null, lot_source_hint: r.lotNo ? 'manufacturer' : 'generated',
        location_id: r.resolvedLocation?.id || null, shelf_position: r.resolvedShelfPosition || null,
        received_date: r.resolvedReceivedDate || null, expiry_date: r.resolvedExpiryDate || null,
        current_stock: r.resolvedStock.current_stock, sealed_count: r.resolvedStock.sealed_count,
        // 기존 EXACT reagent의 company를 "비어있을 때만" 채우는 명시적 승인 신호(§11).
        company_action: reagentId ? companyAction(r) : 'keep',
        // stale preview 방어(§7/§9) — RPC가 이 값과 실제 DB updated_at을 대조해 다르면 전체 중단.
        expected_reagent_updated_at: reagentId ? (r.reagentMatch.reagent?.updated_at || null) : null,
        expected_lot_updated_at: lotId ? (r.lotMatch.lot?.updated_at || null) : null,
      }
    })
  return {
    snapshot_id: snapshotId,
    source_filename: sourceFilename,
    baseline_active_lot_ids: baselineActiveLotIds || [],
    rows,
  }
}

// ── 최종 적용 준비 상태(§36) ─────────────────────────────────────
export function checkSyncReadiness(matchedRows) {
  const buckets = matchedRows.map(rowBucket)
  const blockingErrors = buckets.filter(b => b === 'error').length
  const unresolvedReview = buckets.filter(b => b === 'review').length
  return { ready: blockingErrors === 0 && unresolvedReview === 0, blockingErrors, unresolvedReview }
}
