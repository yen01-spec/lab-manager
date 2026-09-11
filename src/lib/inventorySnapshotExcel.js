// 현재 재고 Excel 동기화 — DB → Excel 내보내기(§5~8, §31~32) 전용. 파싱/매칭은
// inventorySnapshotMatch.js. 일반 시약목록 export(exportReagents 등)와는 완전히 별개 —
// 여기서만 __reagent_id/__lot_id round-trip 컬럼을 심는다(§1-2, 일반 Excel엔 추가 안 함).
import * as XLSX from 'xlsx'
import { supabase } from '../supabase'
import { fetchAllPages } from './fetchAllPages'
import { isGeneratedLot } from './lotNo'
import { SNAPSHOT_COLUMNS, DATA_SHEET_NAME, GUIDE_SHEET_NAME, locationLabel } from './inventorySnapshotMatch'

// 현재 active reagent_lots + 연결된 reagent + locations를 SELECT만 해서 내보낼 행을 만든다.
// 1행 = reagent_lot 1건(§1-1) — 그룹핑/합산 없음.
export async function fetchCurrentSnapshotRows() {
  const [lots, { data: locations }] = await Promise.all([
    fetchAllPages((from, to) => supabase.from('reagent_lots')
      .select('id, reagent_id, lot_no, lot_source, cat_no, sealed_count, current_stock, location_id, shelf_position, received_date, expiry_date, status, reagents(id, name, name_ko, cas_no, company, purity, volume, unit)')
      // 이번 DB엔 아직 not_in_snapshot 상태가 없다(Phase 4b-3 migration 전) — 'active'만 명시적으로
      // 걸러서, 나중에 그 상태가 생겨도 기본 export가 자동으로 활성 재고만 포함하도록 안전하게 둔다.
      .eq('status', 'active').range(from, to)),
    supabase.from('locations').select('id, room, detail'),
  ])
  const locById = new Map((locations || []).map(l => [l.id, l]))

  return lots.filter(l => l.reagents).map(l => {
    const r = l.reagents
    const loc = locById.get(l.location_id)
    return {
      nameEn: r.name || '', nameKo: r.name_ko || '', casNo: r.cas_no || '',
      company: r.company || '', catNo: l.cat_no || '', purity: r.purity || '',
      volume: r.volume ?? '', unit: r.unit || '',
      lotNo: l.lot_no || '', lotKind: l.lot_no ? (isGeneratedLot(l.lot_source) ? '내부 관리번호' : '제조사 Lot') : '',
      locationLabel: locationLabel(loc), shelfPosition: l.shelf_position || '',
      receivedDate: l.received_date || '', expiryDate: l.expiry_date || '',
      currentStock: l.current_stock, sealedCount: l.sealed_count,
      note: '',
      reagentId: r.id, lotId: l.id, lotSource: l.lot_source || '',
    }
  })
}

const GUIDE_LINES = [
  ['현재 재고 Excel 동기화 — 사용 안내'],
  [],
  ['- 한 행은 실물 시약 1병(Lot)입니다. 같은 시약이라도 병이 여러 개면 여러 행으로 나옵니다.'],
  ['- __reagent_id / __lot_id는 시스템 식별자입니다. 수정하지 마세요.'],
  ['- 새로운 시약이나 병을 추가하려면 __reagent_id / __lot_id 칸을 비워두세요.'],
  ['- 기존 행을 이 파일에서 지우면, 그 재고는 "현재 목록 제외" 예정으로 처리됩니다.'],
  ['  (주의: 삭제된 재고가 DB에서 바로 삭제되는 것은 아닙니다. 기록은 보존되며, 상태만 바뀝니다.)'],
  ['- Lot No.가 없으면 시스템이 내부 관리번호(KNU-YYYYMMDD-NNN)를 자동으로 생성할 예정입니다.'],
  ['- 보관 위치는 앱에 등록된 위치 이름과 정확히 같아야 합니다(예: "5층 배기형 시약장 - 1번(여분 시약들)").'],
  ['- 세부 위치는 보관 위치보다 더 자세한 자유 텍스트입니다(예: "좌측"). 없어도 됩니다.'],
  ['- 현재 잔량(%) 또는 미개봉 수량 중 최소 하나는 입력해야 합니다.'],
  ['- 이 파일을 업로드해도 DB는 바로 바뀌지 않습니다. 미리보기와 관리자 확인을 거쳐야 합니다.'],
]

// rows: fetchCurrentSnapshotRows()가 반환한 형태(export) 또는 그 부분집합(백업도 동일 구조 — §32).
export function writeInventorySnapshotWorkbook(rows, filename) {
  const header = SNAPSHOT_COLUMNS.map(c => c.label)
  const aoa = [header, ...rows.map(r => SNAPSHOT_COLUMNS.map(c => r[c.key] ?? ''))]
  const dataWs = XLSX.utils.aoa_to_sheet(aoa)
  dataWs['!cols'] = SNAPSHOT_COLUMNS.map(c => ({ wch: Math.max(c.label.length + 2, 12) }))

  const guideWs = XLSX.utils.aoa_to_sheet(GUIDE_LINES)
  guideWs['!cols'] = [{ wch: 90 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, guideWs, GUIDE_SHEET_NAME)
  XLSX.utils.book_append_sheet(wb, dataWs, DATA_SHEET_NAME)
  XLSX.writeFile(wb, filename)
}

function timestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// STEP 1 — "현재 재고 동기화용 Excel 다운로드"
export async function downloadInventorySnapshotExport() {
  const rows = await fetchCurrentSnapshotRows()
  writeInventorySnapshotWorkbook(rows, `현재재고_동기화_${timestamp()}.xlsx`)
  return rows.length
}

// STEP 5 — "적용 전 현재 재고 백업 다운로드". 업로드 파일과 구분되도록 파일명을 다르게 하고
// (§32), 항상 지금 이 순간의 DB 상태를 새로 조회한다(사용자가 수정한 업로드 파일이 아님).
export async function downloadInventorySnapshotBackup() {
  const rows = await fetchCurrentSnapshotRows()
  writeInventorySnapshotWorkbook(rows, `inventory_backup_${timestamp()}.xlsx`)
  return rows.length
}
