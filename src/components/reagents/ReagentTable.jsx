import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { C, thStyle, Card } from '../../design'
import ReagentRow from './ReagentRow'
import ReagentGroupRow from './ReagentGroupRow'
import AlphabetIndex from './AlphabetIndex'
import { groupReagentsByName, normalizeReagentName } from '../../lib/nameGroup'

// data(=검색·필터 결과)를 화면에 세로로 쌓이는 "시각 행" 평탄 배열로 만든다.
//   - letter : 알파벳 구분 헤더
//   - single : 단일 시약 한 줄
//   - group  : 같은 이름 여러 제품 묶음 헤더 (펼치면 그 아래 제품별 행)
// Lot 펼침·그룹 펼침은 각 행(tbody) 내부에서 처리하므로 이 배열은 expandedIds와 무관 —
// data가 바뀔 때만 다시 만든다. 예전엔 체크박스 하나만 눌러도 900여 개 행 element를
// 전부 다시 만들고 재조정해서 200ms 이상 멈췄음(→ "응답 없음"). 이제 가상 스크롤로
// 화면에 보이는 ~40행만 DOM에 존재한다.
function buildVisualRows(data) {
  const groups = {}
  for (const r of data) {
    // AlphabetIndex.jsx와 동일: sort_letter(화학명 접두어 무시한 정렬 기준) 우선.
    const letter = (r.sort_letter || r.name[0]).toUpperCase()
    ;(groups[letter] ||= []).push(r)
  }
  const rows = []
  for (const letter of Object.keys(groups).sort()) {
    rows.push({ kind: 'letter', key: 'L:' + letter, letter })
    for (const members of groupReagentsByName(groups[letter])) {
      if (members.length === 1) {
        rows.push({ kind: 'single', key: members[0].id, r: members[0] })
      } else {
        const groupKey = 'grp:' + normalizeReagentName(members[0].name)
        rows.push({ kind: 'group', key: groupKey, groupKey, members })
      }
    }
  }
  return rows
}

const COL_KEYS = ['casNo', 'company', 'volume', 'stock', 'location', 'lastConfirmed', 'lot', 'expiry', 'category', 'fireClass', 'special', 'casCheck', 'ghs', 'status']

export default function ReagentTable({
  data, locations, visibleCols, pickedIds, isAdmin,
  inlineEdit, setInlineEdit, expandedIds,
  togglePick, togglePickAll, handleRowClick, toggleExpand,
  startInlineEdit, saveInlineEdit, confirmPending,
}) {
  const COLS = 3 // 체크박스 + 시약명 + 순도 (항상 표시)
    + COL_KEYS.filter(k => visibleCols[k]).length

  const visualRows = useMemo(() => buildVisualRows(data), [data])
  const allPicked = data.length > 0 && data.every(r => pickedIds.has(r.id))

  // ── 가상 스크롤 (페이지 window 스크롤 기준) ──────────────────────────
  const listRef = useRef(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useEffect(() => {
    if (!listRef.current) return
    // 문서 최상단부터 이 목록까지의 거리 — 가상 스크롤러가 window 스크롤 위치를
    // 행 인덱스로 환산할 때 필요.
    const top = listRef.current.getBoundingClientRect().top + window.scrollY
    setScrollMargin(top)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: visualRows.length,
    estimateSize: (i) => (visualRows[i].kind === 'letter' ? 38 : 46),
    overscan: 10,
    scrollMargin,
    getItemKey: (i) => visualRows[i].key,
  })

  const items = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const padTop = items.length ? items[0].start - scrollMargin : 0
  const padBottom = items.length ? totalSize - items[items.length - 1].end : 0

  const scrollToLetter = useCallback((letter) => {
    const idx = visualRows.findIndex(v => v.kind === 'letter' && v.letter === letter)
    if (idx < 0) return
    virtualizer.scrollToIndex(idx, { align: 'start' })
    // 상단 고정 네비에 살짝 가리지 않도록 보정
    setTimeout(() => window.scrollBy({ top: -80 }), 0)
  }, [visualRows, virtualizer])

  const renderRow = (r) => {
    const isEditingSealed = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'sealed_count'
    const isEditingStock = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'current_stock'
    return (
      <ReagentRow key={r.id} r={r} locations={locations} visibleCols={visibleCols}
        isAdmin={isAdmin}
        isPicked={pickedIds.has(r.id)} isExpanded={expandedIds.has(r.id)}
        isEditingSealed={isEditingSealed} isEditingStock={isEditingStock}
        editValue={(isEditingSealed || isEditingStock) ? inlineEdit.value : undefined}
        onTogglePick={togglePick} onToggleExpand={toggleExpand} onRowClick={handleRowClick}
        onStartEdit={startInlineEdit}
        onSaveEdit={(isEditingSealed || isEditingStock) ? saveInlineEdit : undefined}
        onChangeEdit={(isEditingSealed || isEditingStock) ? setInlineEdit : undefined}
        onConfirmPending={confirmPending} />
    )
  }

  const renderVisual = (row) => {
    if (row.kind === 'letter') {
      return (
        <tr>
          <td colSpan={COLS} style={{
            padding: '8px 14px',
            background: `linear-gradient(90deg, ${C.navy}11, transparent)`,
            fontWeight: '800', fontSize: '13px', color: C.navy,
            borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`,
          }}>{row.letter}</td>
        </tr>
      )
    }
    if (row.kind === 'group') {
      const isExpanded = expandedIds.has(row.groupKey)
      return (
        <>
          <ReagentGroupRow members={row.members} visibleCols={visibleCols}
            isExpanded={isExpanded} onToggleExpand={toggleExpand} groupKey={row.groupKey} />
          {isExpanded && row.members.map(r => renderRow(r))}
        </>
      )
    }
    return renderRow(row.r)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Card noPadding>
          <div ref={listRef} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, borderRight: `1px solid ${C.borderRow}` }} title="선택 목록에 담기">
                    <input type="checkbox" checked={allPicked}
                      onChange={() => togglePickAll(data)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <div style={{ fontSize: '9.5px', fontWeight: '400', color: C.muted, marginTop: '2px', whiteSpace: 'nowrap' }}>담기</div>
                  </th>
                  {[
                    '시약명',
                    '순도',
                    ...(visibleCols.casNo ? ['CAS No.'] : []),
                    ...(visibleCols.company ? ['회사'] : []),
                    ...(visibleCols.volume ? ['용량'] : []),
                    ...(visibleCols.stock ? ['재고'] : []),
                    ...(visibleCols.location ? ['위치'] : []),
                    ...(visibleCols.lot ? ['Lot No.'] : []),
                    ...(visibleCols.expiry ? ['유효기간'] : []),
                    ...(visibleCols.category ? ['성상'] : []),
                    ...(visibleCols.fireClass ? ['위험물유별'] : []),
                    ...(visibleCols.special ? ['특별관리물질'] : []),
                    ...(visibleCols.casCheck ? ['CAS확인'] : []),
                    ...(visibleCols.ghs ? ['GHS'] : []),
                    ...(visibleCols.lastConfirmed ? ['최근확인'] : []),
                    ...(visibleCols.status ? ['상태'] : []),
                  ].map(h => (
                    <th key={h} style={{ ...thStyle, borderRight: `1px solid ${C.borderRow}` }}>{h}</th>
                  ))}
                </tr>
              </thead>

              {/* 위쪽 여백 — 화면 밖(위) 행들의 높이만큼 */}
              <tbody aria-hidden="true">
                <tr style={{ height: `${Math.max(0, padTop)}px` }}><td colSpan={COLS} style={{ padding: 0, border: 0 }} /></tr>
              </tbody>

              {items.map(vi => (
                <tbody key={vi.key} data-index={vi.index} ref={virtualizer.measureElement}>
                  {renderVisual(visualRows[vi.index])}
                </tbody>
              ))}

              {/* 아래쪽 여백 — 화면 밖(아래) 행들의 높이만큼 */}
              <tbody aria-hidden="true">
                <tr style={{ height: `${Math.max(0, padBottom)}px` }}><td colSpan={COLS} style={{ padding: 0, border: 0 }} /></tr>
              </tbody>
            </table>
          </div>
          {isAdmin && (
            <div style={{ padding: '8px 14px', fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}` }}>
              💡 재고 숫자를 클릭하면 바로 수정할 수 있어요.
            </div>
          )}
        </Card>
      </div>
      <AlphabetIndex data={data} scrollToLetter={scrollToLetter} />
    </div>
  )
}
