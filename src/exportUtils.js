import * as XLSX from 'xlsx'

// ── 공통 엑셀 다운로드 함수 ──────────────────────────
export function downloadExcel(data, columns, filename) {
  // columns: [{ key, label }]
  const header = columns.map(c => c.label)
  const rows = data.map(row => columns.map(c => row[c.key] ?? '-'))

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows])

  // 컬럼 너비 자동 조정
  ws['!cols'] = columns.map((c, i) => ({
    wch: Math.max(
      c.label.length + 2,
      ...rows.map(r => String(r[i] ?? '').length + 2)
    )
  }))

  // 헤더 스타일 (배경색 등은 xlsx 무료 버전에서 미지원, 구조만)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, `${filename}_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`)
}

// ── 시약 목록 내보내기 ────────────────────────────────
export function exportReagents(reagents) {
  const rows = []
  reagents.forEach(r => {
    const lots = r.reagent_lots || []
    if (lots.length === 0) {
      rows.push({
        name: r.name, cas_no: r.cas_no || '-', company: r.company || '-',
        volume: r.volume ? `${r.volume}${r.unit}` : '-',
        category: r.category || '-', hazard: r.hazard || '-',
        location: r.locations ? `${r.locations.room}${r.locations.detail ? ' - ' + r.locations.detail : ''}` : '-',
        lot_no: '-', expiry_date: '-', sealed_count: '-', current_stock: '-', status: '-',
      })
    } else {
      lots.forEach(lot => {
        const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
        rows.push({
          name: r.name, cas_no: r.cas_no || '-', company: r.company || '-',
          volume: r.volume ? `${r.volume}${r.unit}` : '-',
          category: r.category || '-', hazard: r.hazard || '-',
          location: r.locations ? `${r.locations.room}${r.locations.detail ? ' - ' + r.locations.detail : ''}` : '-',
          lot_no: lot.lot_no || '-', expiry_date: lot.expiry_date || '-',
          sealed_count: lot.sealed_count, current_stock: `${lot.current_stock}%`,
          status: isLow ? '재고부족' : '정상',
        })
      })
    }
  })

  const columns = [
    { key: 'name', label: '시약명' },
    { key: 'cas_no', label: 'CAS No.' },
    { key: 'company', label: '회사' },
    { key: 'volume', label: '용량' },
    { key: 'category', label: '성상' },
    { key: 'hazard', label: '유해·위험성' },
    { key: 'location', label: '위치' },
    { key: 'lot_no', label: 'Lot No.' },
    { key: 'expiry_date', label: '유통기한' },
    { key: 'sealed_count', label: '미개봉(병)' },
    { key: 'current_stock', label: '잔량' },
    { key: 'status', label: '상태' },
  ]
  downloadExcel(rows, columns, '시약목록')
}

// ── 물품 목록 내보내기 ────────────────────────────────
export function exportItems(items) {
  const rows = []
  items.forEach(item => {
    const lots = item.item_lots || []
    if (lots.length === 0) {
      rows.push({
        name: item.name, category: item.category || '-',
        location: item.locations ? `${item.locations.room}${item.locations.detail ? ' - ' + item.locations.detail : ''}` : '-',
        sealed_count: '-', current_stock: '-', status: '-', notes: item.notes || '-',
      })
    } else {
      lots.forEach(lot => {
        const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
        rows.push({
          name: item.name, category: item.category || '-',
          location: item.locations ? `${item.locations.room}${item.locations.detail ? ' - ' + item.locations.detail : ''}` : '-',
          sealed_count: lot.sealed_count, current_stock: `${lot.current_stock}%`,
          status: isLow ? '재고부족' : '정상', notes: item.notes || '-',
        })
      })
    }
  })

  const columns = [
    { key: 'name', label: '물품명' },
    { key: 'category', label: '종류' },
    { key: 'location', label: '위치' },
    { key: 'sealed_count', label: '미개봉(개)' },
    { key: 'current_stock', label: '잔량' },
    { key: 'status', label: '상태' },
    { key: 'notes', label: '비고' },
  ]
  downloadExcel(rows, columns, '물품목록')
}

// ── 구매 요청 내보내기 ────────────────────────────────
export function exportPurchaseRequests(requests) {
  const statusMap = {
    pending: '대기중', approved: '승인됨', rejected: '반려됨',
    ordered: '발주완료', delivered: '배송완료', done: '완료',
  }
  const rows = requests.map(r => ({
    created_at: new Date(r.created_at).toLocaleDateString('ko-KR'),
    user_name: r.user_name,
    target_type: r.target_type === 'reagent' ? '시약' : r.target_type === 'item' ? '물품' : '신규',
    target_name: r.target_name || '-',
    quantity: r.quantity,
    reason: r.reason || '-',
    status: statusMap[r.status] || r.status,
    reject_note: r.reject_note || '-',
    tracking_number: r.tracking_number || '-',
    estimated_arrival: r.estimated_arrival || '-',
    ordered_at: r.ordered_at ? new Date(r.ordered_at).toLocaleDateString('ko-KR') : '-',
    delivered_at: r.delivered_at ? new Date(r.delivered_at).toLocaleDateString('ko-KR') : '-',
  }))

  const columns = [
    { key: 'created_at', label: '요청일' },
    { key: 'user_name', label: '요청자' },
    { key: 'target_type', label: '종류' },
    { key: 'target_name', label: '항목명' },
    { key: 'quantity', label: '수량' },
    { key: 'reason', label: '요청 사유' },
    { key: 'status', label: '상태' },
    { key: 'reject_note', label: '반려 사유' },
    { key: 'tracking_number', label: '운송장 번호' },
    { key: 'estimated_arrival', label: '예상 도착일' },
    { key: 'ordered_at', label: '발주일' },
    { key: 'delivered_at', label: '배송완료일' },
  ]
  downloadExcel(rows, columns, '구매요청목록')
}
