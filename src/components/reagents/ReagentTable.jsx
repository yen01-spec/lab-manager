import { Fragment } from 'react'
import { C, thStyle } from '../../design'
import ReagentRow from './ReagentRow'
import ReagentGroupRow from './ReagentGroupRow'
import { groupReagentsByName, normalizeReagentName } from '../../lib/nameGroup'

function getGroupedReagents(data) {
  const groups = {}
  data.forEach(r => {
    // AlphabetIndex.jsx와 동일: sort_letter(화학명 접두어 무시한 실제 정렬 기준) 우선.
    const letter = (r.sort_letter || r.name[0]).toUpperCase()
    if (!groups[letter]) groups[letter] = []
    groups[letter].push(r)
  })
  return groups
}

export default function ReagentTable({
  data, locations, visibleCols, pickedIds, isAdmin,
  inlineEdit, setInlineEdit, expandedIds, alphabetRefs,
  togglePick, togglePickAll, handleRowClick, toggleExpand,
  startInlineEdit, saveInlineEdit, confirmPending,
}) {
  const COLS = 3 // 체크박스 + 시약명 + 순도 (항상 표시)
    + (visibleCols.casNo ? 1 : 0) + (visibleCols.company ? 1 : 0) + (visibleCols.volume ? 1 : 0)
    + (visibleCols.stock ? 1 : 0) + (visibleCols.location ? 1 : 0) + (visibleCols.lastConfirmed ? 1 : 0)
    + (visibleCols.lot ? 1 : 0) + (visibleCols.expiry ? 1 : 0)
    + (visibleCols.category ? 1 : 0) + (visibleCols.fireClass ? 1 : 0) + (visibleCols.special ? 1 : 0) + (visibleCols.casCheck ? 1 : 0) + (visibleCols.ghs ? 1 : 0) + (visibleCols.status ? 1 : 0)

  const groups = getGroupedReagents(data)
  const letters = Object.keys(groups).sort()
  const allPicked = data.length > 0 && data.every(r => pickedIds.has(r.id))

  const renderRow = (r) => {
    const isEditingSealed = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'sealed_count'
    const isEditingStock = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'current_stock'
    return (
      <ReagentRow key={r.id} r={r} locations={locations} visibleCols={visibleCols}
        isAdmin={isAdmin} data={data}
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

  return (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, borderRight: `1px solid ${C.borderRow}` }}
            title="선택 목록에 담기">
            <input type="checkbox" checked={allPicked}
              onChange={() => togglePickAll(data)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <div style={{ fontSize: '9.5px', fontWeight: '400', color: C.muted, marginTop: '2px', whiteSpace: 'nowrap' }}>
              담기
            </div>
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
      <tbody>
        {letters.map(letter => (
          <Fragment key={letter}>
            <tr key={letter + '_header'} ref={el => alphabetRefs.current[letter] = el}>
              <td colSpan={COLS} style={{
                padding: '8px 14px',
                background: `linear-gradient(90deg, ${C.navy}11, transparent)`,
                fontWeight: '800', fontSize: '13px', color: C.navy,
                borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`,
              }}>{letter}</td>
            </tr>
            {groupReagentsByName(groups[letter]).map(members => {
              if (members.length === 1) return renderRow(members[0])
              const groupKey = `grp:${normalizeReagentName(members[0].name)}`
              const isExpanded = expandedIds.has(groupKey)
              return (
                <Fragment key={groupKey}>
                  <ReagentGroupRow members={members} visibleCols={visibleCols} isExpanded={isExpanded} onToggleExpand={toggleExpand} groupKey={groupKey} />
                  {isExpanded && members.map(r => renderRow(r))}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
    {isAdmin && (
      <div style={{ padding: '8px 14px', fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}` }}>
        💡 재고 숫자를 클릭하면 바로 수정할 수 있어요.
      </div>
    )}
  </div>
  )
}
