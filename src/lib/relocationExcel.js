import { LETTER_ORDER, ROLE_SPARE, summarize } from './relocationPlan.js'

// 시약장 재배치 작업표 Excel(현장 인쇄용). exceljs 는 관리자 화면에서 이 기능을 쓸 때만 동적으로 불러온다.
// 구성: "요약" 시트 1개 + 현재 위치별 시트 1개씩(A4 가로, 표 제목/머리글 행 반복 인쇄, 쪽번호).
// Excel 생성은 읽기 전용 — DB 를 변경하지 않는다.
const COLS = [
  { key: 'seq', label: 'No.', width: 5 },
  { key: 'letter', label: '알파벳', width: 7 },
  { key: 'reagentName', label: '시약명', width: 32 },
  { key: 'cas', label: 'CAS No.', width: 13 },
  { key: 'company', label: '회사', width: 14 },
  { key: 'lotNo', label: 'Lot No.', width: 13 },
  { key: 'shortId', label: '병 ID', width: 10 },
  { key: 'spec', label: '규격', width: 9 },
  { key: 'open', label: '개봉', width: 7 },
  { key: 'remain', label: '잔량', width: 7 },
  { key: 'role', label: '병 역할', width: 10 },
  { key: 'currentLocation', label: '현재 위치', width: 19 },
  { key: 'plannedLocation', label: '바뀔 위치', width: 21 },
  { key: 'done', label: '완료', width: 6 },
  { key: 'memo', label: '메모', width: 16 },
]
const HEADER_ROWS = 5 // 반복 인쇄되는 제목/요약/머리글 행 수
const NAVY = 'FF16233E', LIGHT = 'FFE7EAF0', GRAY = 'FFD9D9D9', BAND = 'FFF0F0F0'
const thin = { style: 'thin', color: { argb: 'FF666666' } }
const medium = { style: 'medium', color: { argb: 'FF000000' } }
const allThin = { top: thin, bottom: thin, left: thin, right: thin }

// 한글 등 전각 문자는 2칸으로 세어 줄바꿈 행 높이를 추정한다(exceljs 는 자동 행 높이를 계산하지 않음).
const visualLen = (s) => [...String(s ?? '')].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)
export const rowHeightFor = (cells) => {
  const lines = Math.max(1, ...cells.map(([text, width]) => Math.ceil(visualLen(text) / Math.max(1, width - 1))))
  return Math.max(26, lines * 15 + 6)
}

export const safeSheetName = (name, used, index) => {
  const base = `${String(index).padStart(2, '0')} ${String(name).replace(/[[\]:*?/\\]/g, '·')}`.slice(0, 31)
  let n = base, i = 2
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)}~${i++}`
  used.add(n.toLowerCase())
  return n
}

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

function titleRow(ws, rowNo, text, { size = 11, bold = false, italic = false, color = 'FF000000', height = 20, bg } = {}) {
  ws.mergeCells(rowNo, 1, rowNo, COLS.length)
  const c = ws.getCell(rowNo, 1)
  c.value = text
  c.font = { size, bold, italic, color: { argb: color } }
  c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 }
  if (bg) c.fill = fill(bg)
  ws.getRow(rowNo).height = height
}

function addLocationSheet(wb, group, sheetName, generatedAt) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.8, bottom: 0.7, header: 0.3, footer: 0.3 },
      horizontalCentered: true, printTitlesRow: `1:${HEADER_ROWS}`,
    },
    views: [{ state: 'frozen', ySplit: HEADER_ROWS }],
  })
  ws.headerFooter.oddHeader = '&L&B시약장 재배치 작업표&B  —  &A&R출력 &D'
  ws.headerFooter.oddFooter = '&C&P / &N'
  ws.columns = COLS.map(c => ({ width: c.width }))

  const s = group.summary
  titleRow(ws, 1, `현재 위치: ${group.locationName}   ·   총 ${s.total}병 (시약 ${s.kinds}종)`, { size: 15, bold: true, color: 'FFFFFFFF', bg: NAVY, height: 28 })
  titleRow(ws, 2, `알파벳별 병 수:  ${s.letterLine || '-'}`, { size: 11, bold: true, height: 22, bg: LIGHT })
  titleRow(ws, 3, `병 역할:  ● 사용중 ${s.inUse}병  /  ○ 여분 ${s.spare}병      이동 예정(바뀔 위치가 현재와 다름): ${s.moves}병${s.ties ? `      동률 확인 필요: ${s.ties}병` : ''}`, { size: 11, height: 22, bg: LIGHT })
  titleRow(ws, 4, `※ 이 표의 "바뀔 위치"는 계획입니다. 출력/내보내기는 DB 의 실제 위치를 바꾸지 않습니다. 이동 후 관리자가 확인해 별도로 반영합니다.   (작성 ${generatedAt})`, { size: 9, italic: true, color: 'FF333333', height: 18 })

  const head = ws.getRow(HEADER_ROWS)
  COLS.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.label
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(NAVY)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = i === 12 ? { ...allThin, left: medium, right: medium } : allThin
  })
  head.height = 24

  let seq = 0, prevLetter = null, r = HEADER_ROWS + 1
  for (const row of group.rows) {
    if (row.letter !== prevLetter) {
      prevLetter = row.letter
      ws.mergeCells(r, 1, r, COLS.length)
      const band = ws.getCell(r, 1)
      band.value = `━━  ${row.letter}  (${s.letters[row.letter]}병)  ━━`
      band.font = { bold: true, size: 11 }
      band.fill = fill(BAND)
      band.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
      band.border = { top: medium, bottom: thin, left: thin, right: thin }
      ws.getRow(r).height = 20
      r++
    }
    seq++
    const changed = !!row.plannedLocationId
    const values = {
      seq, letter: row.letter, reagentName: row.reagentName, cas: row.cas, company: row.company, lotNo: row.lotNo || '-',
      shortId: row.shortId, spec: row.spec || '-', open: row.opened ? '개봉' : '미개봉', remain: row.opened ? `${row.remain}%` : '-',
      role: row.role === ROLE_SPARE ? '○ 여분' : '● 사용중', currentLocation: row.currentLocation,
      plannedLocation: changed ? `→ ${row.plannedLocation}` : '변경 없음', done: '☐', memo: row.tie ? '동률·현장 확인' : '',
    }
    const xr = ws.getRow(r)
    COLS.forEach((c, i) => {
      const cell = xr.getCell(i + 1)
      cell.value = values[c.key]
      cell.border = c.key === 'plannedLocation' ? { ...allThin, left: medium, right: medium } : allThin
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: ['seq', 'letter', 'open', 'remain', 'role', 'done', 'shortId'].includes(c.key) ? 'center' : 'left' }
      cell.font = { size: c.key === 'done' ? 15 : 10.5 }
    })
    xr.getCell(11).font = { size: 10.5, bold: row.role !== ROLE_SPARE, italic: row.role === ROLE_SPARE }
    xr.getCell(12).font = { size: 10.5, bold: true }
    xr.getCell(13).font = changed ? { size: 11, bold: true } : { size: 10, italic: true, color: { argb: 'FF777777' } }
    if (changed) xr.getCell(13).fill = fill(GRAY)
    if (row.role === ROLE_SPARE) xr.getCell(11).fill = fill('FFF2F2F2')
    xr.height = rowHeightFor([[values.reagentName, COLS[2].width], [values.company, COLS[4].width], [values.lotNo, COLS[5].width], [values.currentLocation, COLS[11].width], [values.plannedLocation, COLS[12].width], [values.memo, COLS[14].width]])
    r++
  }
  return ws
}

function addSummarySheet(wb, groups, meta) {
  const ws = wb.addWorksheet('요약', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true },
  })
  ws.columns = [{ width: 34 }, { width: 9 }, { width: 10 }, { width: 9 }, { width: 9 }, { width: 11 }, { width: 70 }]
  ws.mergeCells('A1:G1')
  ws.getCell('A1').value = '시약장 재배치 작업표 — 요약'
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').fill = fill(NAVY)
  ws.getCell('A1').alignment = { vertical: 'middle', indent: 1 }
  ws.getRow(1).height = 30
  const lines = [
    `작성: ${meta.generatedAt}`,
    `여분 병의 바뀔 위치(계획): ${meta.spareTargetName || '변경 없음'}    /    사용중 병의 바뀔 위치(계획): ${meta.inUseTargetName || '변경 없음'}    /    개별 지정: ${meta.overrideCount}건`,
    '※ 출력/내보내기는 DB 의 실제 위치를 바꾸지 않습니다. "바뀔 위치"는 계획값이며, 이동 후 관리자가 확인하여 별도로 반영합니다.',
    '※ 병 1개 = 1행(병 ID = 앱 내부 병 식별값). Lot No.는 제조사 배치 번호라 같은 번호의 병이 여러 개 있을 수 있습니다.',
    '※ 병 역할: 같은 시약의 활성 병 중 잔량이 가장 적은 병 = 사용중, 나머지 = 여분. 미개봉 병은 100%로 계산. 동률은 개봉 병 → 입고일 빠른 순 → 병 ID 순으로 임시 결정하고 "동률·현장 확인"으로 표시.',
  ]
  lines.forEach((t, i) => {
    ws.mergeCells(2 + i, 1, 2 + i, 7)
    const c = ws.getCell(2 + i, 1)
    c.value = t
    c.font = { size: 10, italic: i >= 2 }
    c.alignment = { wrapText: true, vertical: 'middle', indent: 1 }
    ws.getRow(2 + i).height = i >= 4 ? 30 : 18
  })
  const hr = 8
  ;['현재 위치', '총 병', '시약 종류', '사용중', '여분', '이동 예정', '알파벳별 병 수'].forEach((h, i) => {
    const c = ws.getCell(hr, i + 1)
    c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fill(NAVY); c.border = allThin
    c.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  ws.getRow(hr).height = 22
  let r = hr + 1
  groups.forEach(g => {
    const s = g.summary
    ;[g.locationName, s.total, s.kinds, s.inUse, s.spare, s.moves, s.letterLine || '-'].forEach((v, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = v; c.border = allThin
      c.alignment = { vertical: 'middle', wrapText: true, horizontal: i === 0 || i === 6 ? 'left' : 'center' }
    })
    ws.getRow(r).height = rowHeightFor([[g.locationName, 34], [s.letterLine, 70]])
    r++
  })
  const all = summarize(groups.flatMap(g => g.rows))
  ;['합계', all.total, '-', all.inUse, all.spare, all.moves, all.letterLine || '-'].forEach((v, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = v; c.font = { bold: true }; c.fill = fill(LIGHT); c.border = { ...allThin, top: medium }
    c.alignment = { vertical: 'middle', wrapText: true, horizontal: i === 0 || i === 6 ? 'left' : 'center' }
  })
  ws.getRow(r).height = rowHeightFor([[all.letterLine, 70]])
  const sumLetters = LETTER_ORDER.reduce((n, k) => n + all.letters[k], 0)
  ws.getCell(r + 2, 1).value = `검증: 알파벳별 병 수 합계 ${sumLetters} = 총 병 ${all.total} → ${sumLetters === all.total ? 'OK' : '불일치!'}`
  ws.getCell(r + 2, 1).font = { size: 10, italic: true }
  return ws
}

// groups: groupByLocation() 결과. meta: { spareTargetName, inUseTargetName, overrideCount, generatedAt }
export async function buildRelocationWorkbook(groups, meta, ExcelJSLib) {
  const ExcelJS = ExcelJSLib || (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = '연구실 시약관리 시스템'
  wb.created = new Date()
  const generatedAt = meta.generatedAt || new Date().toLocaleString('ko-KR')
  addSummarySheet(wb, groups, { ...meta, generatedAt })
  const used = new Set(['요약'])
  groups.forEach((g, i) => addLocationSheet(wb, g, safeSheetName(g.locationName, used, i + 1), generatedAt))
  return wb
}

export async function relocationXlsxBuffer(groups, meta, ExcelJSLib) {
  const wb = await buildRelocationWorkbook(groups, meta, ExcelJSLib)
  return wb.xlsx.writeBuffer()
}

export async function downloadRelocationXlsx(groups, meta) {
  const buf = await relocationXlsxBuffer(groups, meta)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date(), pad = n => String(n).padStart(2, '0')
  a.href = url
  a.download = `시약장_재배치_작업표_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
