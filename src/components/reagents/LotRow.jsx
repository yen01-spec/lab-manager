import { C, tdStyle } from '../../design'

const LOT_STATUS_LABEL = { active: '보유중', used_up: '사용완료', disposed: '폐기', missing: '분실' }
const LOT_STATUS_COLOR = { active: '#00875A', used_up: C.muted, disposed: C.danger, missing: '#B7791F' }

export default function LotRow({ lot, locations, visibleCols }) {
  const loc = locations.find(l => l.id === lot.location_id)
  const dimmed = lot.status !== 'active'
  return (
    <tr onClick={e => e.stopPropagation()} style={{ background: '#F7F9FC', opacity: dimmed ? 0.6 : 1 }}>
      <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }}></td>
      <td style={{ ...tdStyle, fontSize: '12.5px', color: C.muted, whiteSpace: 'nowrap', paddingLeft: '30px', borderRight: `1px solid ${C.borderRow}` }}>
        ↳ Lot {lot.lot_no || '(번호 없음)'}
      </td>
      <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>
      {visibleCols.casNo && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
      {visibleCols.company && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
      {visibleCols.volume && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
      {visibleCols.stock && (
        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '36px', height: '6px', borderRadius: '3px', background: '#F0F2F6', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: `${lot.current_stock}%`, height: '100%', background: (lot.sealed_count === 0 && lot.current_stock <= 20) ? '#E5484D' : '#1E9E6A' }} />
            </div>
            <span>{lot.sealed_count}병 / {lot.current_stock}%</span>
          </div>
        </td>
      )}
      {visibleCols.location && (
        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
          {loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}
        </td>
      )}
      {visibleCols.lot && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{lot.lot_no || '-'}</td>}
      {visibleCols.expiry && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{lot.expiry_date || '-'}</td>}
      {visibleCols.category && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
      {visibleCols.ghs && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
      {visibleCols.lastConfirmed && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: visibleCols.status ? `1px solid ${C.borderRow}` : undefined }}>-</td>}
      {visibleCols.status && (
        <td style={{ ...tdStyle, fontSize: '12px', color: LOT_STATUS_COLOR[lot.status] || C.muted, fontWeight: '600' }}>
          {LOT_STATUS_LABEL[lot.status] || lot.status}
        </td>
      )}
    </tr>
  )
}
