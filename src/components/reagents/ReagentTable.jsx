import { Fragment } from 'react'
import { C, thStyle } from '../../design'
import ReagentRow from './ReagentRow'

function getGroupedReagents(data) {
  const groups = {}
  data.forEach(r => {
    const letter = r.name[0].toUpperCase()
    if (!groups[letter]) groups[letter] = []
    groups[letter].push(r)
  })
  return groups
}

export default function ReagentTable({
  data, locations, visibleCols, checkedIds, pickedIds, editMode, isAdmin,
  inlineEdit, setInlineEdit, expandedIds, alphabetRefs,
  toggleCheck, togglePick, toggleAll, togglePickAll, handleRowClick, toggleExpand,
  startInlineEdit, saveInlineEdit, confirmPending,
}) {
  const COLS = 3 // 체크박스 + 시약명 + 순도 (항상 표시)
    + (visibleCols.casNo ? 1 : 0) + (visibleCols.company ? 1 : 0) + (visibleCols.volume ? 1 : 0)
    + (visibleCols.stock ? 1 : 0) + (visibleCols.location ? 1 : 0) + (visibleCols.lastConfirmed ? 1 : 0)
    + (visibleCols.lot ? 1 : 0) + (visibleCols.expiry ? 1 : 0)
    + (visibleCols.category ? 1 : 0) + (visibleCols.fireClass ? 1 : 0) + (visibleCols.ghs ? 1 : 0) + (visibleCols.status ? 1 : 0)

  const groups = getGroupedReagents(data)
  const letters = Object.keys(groups).sort()
  const allChecked = data.length > 0 && checkedIds.size === data.length
  const allPicked = data.length > 0 && data.every(r => pickedIds.has(r.id))

  const renderRow = (r) => {
    const isEditingSealed = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'sealed_count'
    const isEditingStock = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'current_stock'
    return (
      <ReagentRow key={r.id} r={r} locations={locations} visibleCols={visibleCols}
        editMode={editMode} isAdmin={isAdmin} data={data}
        isChecked={checkedIds.has(r.id)} isPicked={pickedIds.has(r.id)} isExpanded={expandedIds.has(r.id)}
        isEditingSealed={isEditingSealed} isEditingStock={isEditingStock}
        editValue={(isEditingSealed || isEditingStock) ? inlineEdit.value : undefined}
        onToggleCheck={toggleCheck} onTogglePick={togglePick} onToggleExpand={toggleExpand} onRowClick={handleRowClick}
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
            title={editMode ? '일괄편집 대상으로 선택' : '선택 목록에 담기'}>
            <input type="checkbox" checked={editMode ? allChecked : allPicked}
              onChange={() => editMode ? toggleAll(data) : togglePickAll(data)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            <div style={{ fontSize: '9.5px', fontWeight: '400', color: C.muted, marginTop: '2px', whiteSpace: 'nowrap' }}>
              {editMode ? '편집' : '담기'}
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
            {groups[letter].map(r => renderRow(r))}
          </Fragment>
        ))}
      </tbody>
    </table>
    {isAdmin && !editMode && (
      <div style={{ padding: '8px 14px', fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}` }}>
        💡 재고 숫자를 클릭하면 바로 수정할 수 있어요.
      </div>
    )}
  </div>
  )
}
