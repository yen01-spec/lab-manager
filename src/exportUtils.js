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
const LOT_STATUS_LABEL = { active: '', used_up: '사용완료', disposed: '폐기', missing: '분실' }

// Lot이 여러 개인 시약은 Lot 단위로 한 줄씩 풀어서 내보냄(위치·재고가 Lot마다 다르므로).
// 화면에서 "위치별 보기"로 펼쳐보고 있지 않아도 Excel에는 항상 이렇게 Lot별로 전부 나감 —
// 즉 화면에 현재 보이는(필터링된) 시약 목록을 기준으로, 그 시약들의 모든 Lot을 나열.
// locationIds가 있으면(화면에서 방/세부위치를 선택해 검색한 경우) 그 위치(들)의 Lot만
// 내보냄 — 아니면 "303-1로 검색했는데 그 시약이 5층에도 보관 중인 Lot까지" 같이 딸려나갔었음.
export function exportReagents(reagents, locations = [], locationIds = null, filterLabel = '') {
  const locName = locId => {
    const loc = locations.find(l => l.id === locId)
    return loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '-'
  }
  const rows = []
  reagents.forEach(r => {
    const allLots = r.reagent_lots || []
    const lots = locationIds ? allLots.filter(l => locationIds.includes(l.location_id)) : allLots
    if (lots.length === 0) {
      rows.push({
        name: r.name, cas_no: r.cas_no || '-', company: r.company || '-', cat_no: '-',
        lot_no: '-', category: r.category || '-',
        volume: r.volume ? `${r.volume}${r.unit}` : '-',
        sealed: '-', stock: '-', location: '-', note: '-',
      })
    } else {
      lots.forEach(lot => {
        const isLow = lot.status === 'active' && lot.sealed_count === 0 && lot.current_stock <= 20
        rows.push({
          name: r.name, cas_no: r.cas_no || '-', company: r.company || '-', cat_no: lot.cat_no || '-',
          lot_no: lot.lot_no || '-', category: r.category || '-',
          volume: r.volume ? `${r.volume}${r.unit}` : '-',
          sealed: `${lot.sealed_count}병`, stock: `${lot.current_stock}%`,
          location: locName(lot.location_id),
          note: LOT_STATUS_LABEL[lot.status] || (isLow ? '재고부족' : '정상'),
        })
      })
    }
  })

  const columns = [
    { key: 'name', label: '화학물질명' },
    { key: 'cas_no', label: 'CAS No.' },
    { key: 'company', label: '제조사' },
    { key: 'cat_no', label: 'Cat No.' },
    { key: 'lot_no', label: 'Lot No.' },
    { key: 'category', label: '성상' },
    { key: 'volume', label: '용량(단위)' },
    { key: 'sealed', label: '미개봉' },
    { key: 'stock', label: '잔량' },
    { key: 'location', label: '위치' },
    { key: 'note', label: '비고' },
  ]
  const filename = locationIds && filterLabel ? `시약목록_${filterLabel.replace(/[\s-]+/g, '_')}` : '시약목록'
  downloadExcel(rows, columns, filename)
}

// ── 선택 시약 목록 내보내기 (검색결과에서 체크한 항목) ────
export function exportPickedReagents(rows, locations = []) {
  const data = rows.map(r => {
    const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
    const avgStock = activeLots.length > 0
      ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : null
    const locIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
    const loc = locIds.size === 1 ? locations.find(l => l.id === activeLots[0].location_id) : null
    return {
      name: r.name,
      spec: r.volume ? `${r.volume}${r.unit || ''}` : '-',
      stock: avgStock !== null ? `${avgStock}%` : '-',
      location: locIds.size > 1 ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '-',
      confirmed: r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString('ko-KR') : '-',
    }
  })
  const columns = [
    { key: 'name', label: '시약명' },
    { key: 'spec', label: '규격/용량' },
    { key: 'stock', label: '잔량' },
    { key: 'location', label: '위치' },
    { key: 'confirmed', label: '최근 확인' },
  ]
  downloadExcel(data, columns, '선택시약목록')
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

// ── 구매요청서(시약+물품) 내보내기 — 시트 2개 ─────────────
export function exportPurchaseRequestForm(reagentItems, goodsItems, requesterName) {
  const wb = XLSX.utils.book_new()

  if (reagentItems.length > 0) {
    // 시약 항목에는 가격 필드가 없음(요청만 하고 가격은 담당자가 처리)
    const header = ['No.', '화학물질명', 'CAS No.', '필요한 용량', '사용처', '용도', '비고', '제조사', 'Cat No.', '규격', '수량']
    const rows = reagentItems.map((it, i) => [
      i + 1, it.name, it.cas_no, it.needed_amount, it.usage_place, it.purchase_reason, it.note,
      it.company, it.cat_no, it.spec, it.quantity,
    ])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = header.map((h, i) => ({ wch: Math.max(h.length + 2, ...rows.map(r => String(r[i] ?? '').length + 2)) }))
    XLSX.utils.book_append_sheet(wb, ws, '시약')
  }

  if (goodsItems.length > 0) {
    const header = ['No.', '제품명', 'Cat No.', '규격', '수량', '단가', '배송비', '총가격', '용도', '비고', '링크']
    const rows = goodsItems.map((it, i) => [
      i + 1, it.name, it.cat_no, it.spec, it.quantity, it.unit_price, it.shipping_fee, it.total_price, it.purpose, it.note, it.link,
    ])
    const totalPrice = goodsItems.reduce((s, it) => s + (Number(it.total_price) || 0), 0)
    const totalShipping = goodsItems.reduce((s, it) => s + (Number(it.shipping_fee) || 0), 0)
    rows.push(['', '', '', '', '합계', totalShipping, totalPrice, '', '', '', ''])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = header.map((h, i) => ({ wch: Math.max(h.length + 2, ...rows.map(r => String(r[i] ?? '').length + 2)) }))
    XLSX.utils.book_append_sheet(wb, ws, '물품')
  }

  if (wb.SheetNames.length === 0) { alert('내보낼 항목이 없습니다.'); return }
  const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
  XLSX.writeFile(wb, `구매요청서_${requesterName || ''}_${dateStr}.xlsx`)
}
