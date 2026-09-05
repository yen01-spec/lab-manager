import { Fragment, memo } from 'react'
import { C, tdStyle } from '../../design'
import LotRow from './LotRow'

// 행 하나를 memo로 감싸서, 서로 무관한 상태 변화(다른 행 체크/선택/펼치기, 컬럼 표시
// 전환 등)가 일어나도 실제로 이 행에 영향을 주는 props가 안 바뀌면 리렌더를 건너뛴다.
// isChecked/isPicked/isExpanded/editing* 처럼 원본 Set·Map·객체 대신 "이 행에 해당하는
// boolean/원시값"만 골라서 props로 내려주는 게 핵심 — 그래야 다른 행이 체크되어도 이
// 행의 props는 그대로라 memo가 스킵할 수 있다. onSaveEdit/onChangeEdit도 실제로
// 편집 중인 행에만 값을 넘기고, 나머지 행에는 항상 undefined(고정값)를 넘긴다.
const ReagentRow = memo(function ReagentRow({
  r, locations, visibleCols, editMode, isAdmin, data,
  isChecked, isPicked, isExpanded, isEditingSealed, isEditingStock, editValue,
  onToggleCheck, onTogglePick, onToggleExpand, onRowClick,
  onStartEdit, onSaveEdit, onChangeEdit, onConfirmPending,
}) {
  const allLots = r.reagent_lots || []
  const activeLots = r._activeLots
  const totalSealed = r._totalSealed
  const avgStock = r._avgStock
  const isLow = r._isLow
  const hasPendingConfirm = r._hasPendingConfirm
  const ghsList = r._ghsList
  const onlyLot = r._onlyLot
  const canExpand = r._canExpand
  const multiLocation = r._multiLocation

  let loc = null
  if (activeLots.length > 0 && r._activeLocIds.length <= 1) {
    loc = locations.find(l => l.id === activeLots[0].location_id) || null
  }

  const baseBg = isLow ? '#FFF8F8' : hasPendingConfirm ? '#F0F7FF' : C.white
  const selectedBg = '#EEF2FB'
  const isSelected = editMode ? isChecked : isPicked

  return (
    <Fragment>
      <tr
        onClick={e => editMode ? onToggleCheck(r.id, e, data) : onRowClick(r)}
        title={!editMode ? '클릭: 상세페이지' + (canExpand ? ' · ▸ 아이콘: Lot 목록 펼치기' : '') : ''}
        style={{
          background: isSelected ? selectedBg : baseBg,
          cursor: 'pointer',
          borderLeft: isSelected ? `3px solid ${C.navy}` : '3px solid transparent',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isLow ? '#FFEFEF' : C.bg }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = baseBg }}>
        <td style={{ ...tdStyle, textAlign: 'center', borderRight: `1px solid ${C.borderRow}` }}
          onClick={e => editMode ? onToggleCheck(r.id, e, data) : onTogglePick(r, e)}>
          <input type="checkbox" checked={isSelected} onChange={() => {}}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
        </td>
        <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px', maxWidth: '300px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
          {canExpand && (
            <span onClick={e => { e.stopPropagation(); onToggleExpand(r.id) }}
              style={{ marginRight: '5px', color: C.blue, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '230px', verticalAlign: 'middle' }} title={r.name}>{r.name}</span>
          {canExpand && (
            <span onClick={e => { e.stopPropagation(); onToggleExpand(r.id) }}
              style={{ marginLeft: '6px', fontSize: '10.5px', background: '#EEF2FB', color: C.navy,
                padding: '2px 8px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
              {activeLots.length}병{multiLocation ? ' · 위치별 보기' : ''}
            </span>
          )}
          {r.reagent_type === 'self_made' && <span style={{ marginLeft: '6px', fontSize: '9.5px', background: '#EAF1FB',
            color: '#1F4E96', padding: '1px 7px', borderRadius: '999px', fontWeight: '700' }}>직접제조</span>}
          {isLow && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#FFEBEE',
            color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>부족</span>}
          {hasPendingConfirm && (
            <span
              onClick={isAdmin ? e => { e.stopPropagation(); onConfirmPending(r) } : undefined}
              title={isAdmin ? '클릭하여 최종 확인 처리' : '아직 관리자 최종 확인 전이에요'}
              style={{ marginLeft: '6px', fontSize: '10px', background: '#E3F2FD',
                color: '#1565C0', padding: '1px 6px', borderRadius: '8px', fontWeight: '700',
                cursor: isAdmin ? 'pointer' : 'default' }}>검토대기{isAdmin ? ' ✓' : ''}</span>
          )}
        </td>
        <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{r.purity || '-'}</td>
        {visibleCols.casNo && (
          <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{r.cas_no || '-'}</td>
        )}
        {visibleCols.company && (
          <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px', borderRight: `1px solid ${C.borderRow}` }} title={r.company || ''}>{r.company || '-'}</td>
        )}
        {visibleCols.volume && (
          <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
            {r.volume ? `${r.volume}${r.unit}` : '-'}
          </td>
        )}
        {visibleCols.stock && (
        <td style={{ ...tdStyle, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }} onClick={e => e.stopPropagation()}>
          {activeLots.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '36px', height: '6px', borderRadius: '3px', background: '#F0F2F6', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${avgStock}%`, height: '100%', background: isLow ? '#E5484D' : '#1E9E6A' }} />
              </div>
              {isEditingSealed ? (
                <input autoFocus type="number" min="0" value={editValue}
                  onChange={e => onChangeEdit(prev => ({ ...prev, value: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(onlyLot, { advance: true, data }); if (e.key === 'Escape') onChangeEdit(null) }}
                  onBlur={() => onSaveEdit(onlyLot)}
                  style={{ width: '52px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
              ) : (
                <span onClick={e => !editMode && onlyLot && onStartEdit(onlyLot.id, r.id, 'sealed_count', totalSealed, e)}
                  title={isAdmin && !editMode && onlyLot ? '클릭하여 수정' : !onlyLot ? '상세페이지에서 Lot별로 수정하세요' : ''}
                  style={{ cursor: isAdmin && !editMode && onlyLot ? 'text' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                    border: isAdmin && !editMode && onlyLot ? `1px dashed ${C.border}` : 'none', minWidth: '32px', display: 'inline-block', textAlign: 'center' }}>
                  {totalSealed}병
                </span>
              )}
              <span style={{ color: C.muted, fontSize: '11px' }}>/</span>
              {isEditingStock ? (
                <input autoFocus type="number" min="0" max="100" value={editValue}
                  onChange={e => onChangeEdit(prev => ({ ...prev, value: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(onlyLot, { advance: true, data }); if (e.key === 'Escape') onChangeEdit(null) }}
                  onBlur={() => onSaveEdit(onlyLot)}
                  style={{ width: '52px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
              ) : (
                <span onClick={e => !editMode && onlyLot && onStartEdit(onlyLot.id, r.id, 'current_stock', avgStock, e)}
                  title={isAdmin && !editMode && onlyLot ? '클릭하여 수정' : !onlyLot ? '상세페이지에서 Lot별로 수정하세요' : ''}
                  style={{ cursor: isAdmin && !editMode && onlyLot ? 'text' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                    border: isAdmin && !editMode && onlyLot ? `1px dashed ${C.border}` : 'none', minWidth: '32px', display: 'inline-block', textAlign: 'center' }}>
                  {avgStock}%
                </span>
              )}
            </div>
          ) : <span style={{ color: C.muted, fontSize: '12px' }}>보유 0병</span>}
        </td>
        )}
        {visibleCols.location && (
        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px', borderRight: `1px solid ${C.borderRow}` }}
          title={loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : ''}>
          {multiLocation ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}
        </td>
        )}
        {visibleCols.lot && (
          <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{onlyLot?.lot_no || '-'}</td>
        )}
        {visibleCols.expiry && (
          <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{onlyLot?.expiry_date || '-'}</td>
        )}
        {visibleCols.category && (
          <td style={{ ...tdStyle, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>
            {r.category
              ? <span style={{ background: '#EEF2FB', color: C.navy, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{r.category}</span>
              : <span style={{ color: C.muted }}>-</span>}
          </td>
        )}
        {visibleCols.fireClass && (
          <td style={{ ...tdStyle, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>
            {r._fireSafetyClass
              ? <span style={{ background: '#FDECEC', color: '#C13B3F', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>{r._fireSafetyClass}</span>
              : <span style={{ color: C.muted }}>-</span>}
          </td>
        )}
        {visibleCols.ghs && (
          <td style={{ ...tdStyle, fontSize: '16px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }} onClick={e => e.stopPropagation()}>
            {ghsList.length > 0
              ? <span title={ghsList.map(g => g.label).join(', ')}>{ghsList.map(g => g.emoji).join('')}</span>
              : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
          </td>
        )}
        {visibleCols.lastConfirmed && (
          <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted, whiteSpace: 'nowrap', borderRight: visibleCols.status ? `1px solid ${C.borderRow}` : undefined }}>
            {r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}
          </td>
        )}
        {visibleCols.status && (
          <td style={tdStyle}>
            {activeLots.length === 0
              ? <span style={{ color: C.muted, fontWeight: '600', fontSize: '12px' }}>보유없음</span>
              : isLow
                ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
                : <span style={{ color: '#00875A', fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
          </td>
        )}
      </tr>
      {isExpanded && allLots.map(lot => <LotRow key={lot.id} lot={lot} locations={locations} visibleCols={visibleCols} />)}
    </Fragment>
  )
})

export default ReagentRow
