// 백업의 "사람이 보는 Excel 사본" — 조회/보관용. 복원에는 쓰이지 않는다(형식/타입이 손실될 수 있음).
// 시트: 요약 + 테이블별 1시트. reagent_lots 시트에는 시약명/제조사/위치 이름 열을 덧붙여 읽기 쉽게 한다.
const cellValue = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v)

export async function buildBackupExcel(snapshot, { ExcelJSLib, appVersion = 'unknown' } = {}) {
  const ExcelJS = ExcelJSLib || (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = '연구실 시약관리 시스템'
  const reagents = new Map((snapshot.tables.reagents || []).map(r => [r.id, r]))
  const locs = new Map((snapshot.tables.locations || []).map(l => [l.id, `${l.room}${l.detail ? ' - ' + l.detail : ''}`]))

  const sum = wb.addWorksheet('요약')
  sum.columns = [{ width: 30 }, { width: 14 }, { width: 40 }]
  sum.addRow(['전체 백업 — 조회용 Excel 사본']).font = { bold: true, size: 14 }
  sum.addRow(['※ 이 파일은 사람이 보는 용도입니다. 복원에는 반드시 JSON ZIP 을 사용하세요.'])
  sum.addRow(['backup_version', snapshot.backup_version]); sum.addRow(['created_at', String(snapshot.created_at)])
  sum.addRow(['app_version', appVersion]); sum.addRow(['schema_version', snapshot.schema_version])
  sum.addRow([])
  const h = sum.addRow(['테이블', '행 수', 'digest(md5)']); h.font = { bold: true }
  for (const t of snapshot.table_order) sum.addRow([t, snapshot.table_counts[t], snapshot.table_digests[t]])

  for (const t of snapshot.table_order) {
    const rows = snapshot.tables[t]
    const cols = snapshot.table_columns[t]
    const extra = t === 'reagent_lots' ? ['시약명(참고)', '제조사(참고)', '위치명(참고)'] : []
    const ws = wb.addWorksheet(t.slice(0, 31))
    ws.addRow([...cols, ...extra]).font = { bold: true }
    for (const r of rows) {
      const ex = t === 'reagent_lots' ? [reagents.get(r.reagent_id)?.name ?? '', reagents.get(r.reagent_id)?.company ?? '', locs.get(r.location_id) ?? ''] : []
      ws.addRow([...cols.map(c => cellValue(r[c])), ...ex])
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, cols.length + extra.length) } }
    ws.columns.forEach(c => { c.width = 18 })
  }
  return wb
}

export async function backupExcelBuffer(snapshot, opts) {
  return (await buildBackupExcel(snapshot, opts)).xlsx.writeBuffer()
}
