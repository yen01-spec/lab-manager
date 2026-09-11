// 학교 화학물질 등록 Excel — SchoolRegistrationView(자료 → 연구실 운영 → 화학물질 등록)와
// 시약목록 선택목록(→ Excel 내보내기 → 학교 화학물질 등록 양식)이 공유하는 핵심 로직 (Phase P2).
// 절대 복붙하지 않는다: 행 만들기(그룹핑 없음, Lot 1건 = 행 1건) · CAS 매칭 · 검증 · XLSX 생성을
// 여기 한 곳에만 둔다. 두 진입점은 "어떤 Lot을 대상으로 삼는지"만 다르다
// (SchoolRegistrationView = 최근 N일 입고 전체, 선택목록 = 사용자가 고른 reagent들의 현재 active Lot).
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

const CAS_RE = /^\d{2,7}-\d{2}-\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function locLabel(loc) {
  if (!loc) return ''
  return `${loc.room}${loc.detail ? ' ' + loc.detail : ''}`
}

// SchoolRegistrationView: 최근 days일 이내 입고된 active Lot 전체.
export async function fetchActiveLotsSince(days) {
  const sinceDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const { data } = await supabase.from('reagent_lots')
    .select('id, lot_no, sealed_count, received_date, expiry_date, location_id, reagents(id, name, cas_no)')
    .gte('received_date', sinceDate)
    .eq('status', 'active')
    .order('received_date', { ascending: false })
    .limit(500)
  return data || []
}

// 선택목록: 사용자가 고른 reagent id들의 현재 active Lot 전체(입고일 무관). 200건씩 나눠 조회.
export async function fetchActiveLotsForReagents(reagentIds) {
  const ids = [...new Set(reagentIds)]
  const out = []
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await supabase.from('reagent_lots')
      .select('id, lot_no, sealed_count, received_date, expiry_date, location_id, reagent_id, reagents(id, name, cas_no)')
      .in('reagent_id', chunk)
      .eq('status', 'active')
    out.push(...(data || []))
  }
  return out
}

// Lot(+reagents join) 배열 → 학교 양식 행. Lot 1건 = 행 1건(합치지 않음 — 규격/위치/입고일이
// Lot마다 다를 수 있어 함부로 그룹핑하지 않는다). CAS로 school_chemical_master 매칭해 공식
// 명칭/단위를 채우고, 매칭 안 되면 시약 DB 이름을 그대로 두고 unit/category는 비운다.
// volume(용량)은 항상 빈 값으로 시작 — 시약 DB의 volume/unit 표기가 학교 마스터 단위와
// 다를 수 있어 자동으로 채우지 않고 사용자 확인을 받는다(SchoolRegistrationView 원래 정책).
export async function buildSchoolRegistrationRows(lots) {
  const casList = [...new Set(lots.map(l => l.reagents?.cas_no).filter(Boolean))]
  const locIds = [...new Set(lots.map(l => l.location_id).filter(Boolean))]
  const [{ data: masters }, { data: locations }] = await Promise.all([
    casList.length > 0 ? supabase.from('school_chemical_master').select('*').in('cas_no', casList) : Promise.resolve({ data: [] }),
    locIds.length > 0 ? supabase.from('locations').select('id, room, detail').in('id', locIds) : Promise.resolve({ data: [] }),
  ])
  const masterByCas = new Map((masters || []).map(m => [m.cas_no, m]))
  const locById = new Map((locations || []).map(l => [l.id, l]))

  return lots.filter(l => l.reagents).map(l => {
    const master = l.reagents.cas_no ? masterByCas.get(l.reagents.cas_no) : null
    return {
      id: l.id,
      included: !!master,
      matched: !!master,
      cas_no: l.reagents.cas_no || '',
      name: master?.name || l.reagents.name,
      unit: master?.unit || '',
      volume: '',
      quantity: String(l.sealed_count ?? ''),
      location: locLabel(locById.get(l.location_id)),
      received_date: l.received_date || '',
      expiry_date: l.expiry_date || '',
      category: master ? '화학' : '',
    }
  })
}

// SchoolRegistrationView의 편집 그리드에서 "엑셀 생성" 누르기 전 검증(그대로 재사용).
export function validateSchoolRegistrationRow(r) {
  const errors = []
  if (!CAS_RE.test(r.cas_no)) errors.push('CAS 형식 오류')
  if (!r.name.trim()) errors.push('화학물질명 필요')
  if (!r.unit.trim()) errors.push('단위 필요')
  if (!r.volume.trim() || isNaN(Number(r.volume))) errors.push('용량 숫자 필요')
  if (!r.quantity.trim() || isNaN(Number(r.quantity))) errors.push('입고수량 숫자 필요')
  if (r.received_date && !DATE_RE.test(r.received_date)) errors.push('입고일 형식 오류(YYYY-MM-DD)')
  if (r.expiry_date && !DATE_RE.test(r.expiry_date)) errors.push('유효기간 형식 오류(YYYY-MM-DD)')
  if (r.category !== '화학' && r.category !== '가스') errors.push('분류는 화학/가스 중 하나')
  return errors
}

// 원본 RegChemicalSample.xlsx "화학물질등록" 시트와 동일한 구조(안내문 7줄 + 헤더 + 데이터)로 생성.
// 컬럼(CAS No./화학물질명/단위/용량/연구실입고수량/보관위치/입고일/유효기간/분류)은 고정.
export function writeSchoolRegistrationExcel(includedRows) {
  const aoa = [
    ['화학물질 등록'],
    ['※주의'],
    ['1. CAS No. 123456-12-1의 형식으로 입력하세요 예)10034-93-2'],
    ["2. 입고일/유효기간은 'YYYY-MM-DD'형식으로 입력하세요(선택입력) 예)2015-04-18"],
    ['3. 보관위치는 화학물질의 보관위치를 입력하세요(선택입력) 예)배기형시약장1'],
    ['4. 화학물질의 단위를 꼭 확인하세요. 위험물 지정수량 초과시 과태료 처분을 받을 수 있습니다. (위험물 및 지정수량 시트 참고)'],
    ['5.분류: 화학 또는 가스 필수 입력'],
    [],
    ['CAS No.', '화학물질명', '단위', '용량', '연구실입고수량', '보관위치', '입고일', '유효기간', '분류'],
    // volume/quantity는 SchoolRegistrationView 경로에선 항상 검증된 숫자 문자열이라 그대로
    // Number() 변환되고, 선택목록 경로처럼 검증을 안 거친 빈 값은 셀도 비워둔다(0으로 안 씀).
    ...includedRows.map(r => [
      r.cas_no, r.name, r.unit,
      r.volume?.trim?.() ? Number(r.volume) : '',
      r.quantity?.trim?.() ? Number(r.quantity) : '',
      r.location, r.received_date, r.expiry_date, r.category,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '화학물질등록')
  const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
  XLSX.writeFile(wb, `화학물질등록_${dateStr}.xlsx`)
}

// 선택목록(시약목록) 전용 진입점 — SchoolRegistrationView 같은 편집 그리드 없이 바로 생성한다
// (P2 방침: 큰 wizard를 새로 만들지 않음). 그 대신:
//  - 선택한 reagent 전부를 included=true 로 포함(사용자가 명시적으로 고른 항목이라 매칭
//    실패로 조용히 빼지 않음), 미매칭 건수는 confirm으로 미리 알리고 진행 여부를 물음
//  - 값 보정(단위 변환 등)은 하지 않음 — 미매칭/빈 용량은 그대로 두고 파일 안내문(위 5줄)대로
//    엑셀에서 직접 채우게 한다
// 반환: { cancelled: true } | { cancelled: false, total, unmatched }
export async function exportSchoolRegistrationForPicked(reagentIds) {
  if (!reagentIds || reagentIds.length === 0) throw new Error('선택된 시약이 없습니다.')
  const lots = await fetchActiveLotsForReagents(reagentIds)
  if (lots.length === 0) throw new Error('선택한 시약 중 현재 보유 중인(활성 Lot) 항목이 없습니다.')
  const rows = await buildSchoolRegistrationRows(lots)
  const unmatched = rows.filter(r => !r.matched).length
  if (unmatched > 0) {
    const proceed = window.confirm(
      `학교 DB 미등록 ${unmatched}건이 있습니다. 화학물질명·단위를 엑셀에서 직접 확인해야 합니다.\n\n그래도 계속 내보내시겠습니까?`,
    )
    if (!proceed) return { cancelled: true }
  }
  writeSchoolRegistrationExcel(rows.map(r => ({ ...r, included: true })))
  return { cancelled: false, total: rows.length, unmatched }
}
