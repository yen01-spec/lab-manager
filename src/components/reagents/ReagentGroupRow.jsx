import { C, tdStyle } from '../../design'
import { Badge, LOW_STOCK_TITLE } from './StatusBadges'
import { bottleSummaryText } from '../../lib/lotSummary'

// 같은 이름의 제품이 여러 개(제조사·순도 다름)일 때 목록에서 한 줄로 묶어 보여주는 헤더 행.
// 클릭하면 펼쳐져서 실제 제품별 ReagentRow가 아래에 나타남 — 제품이 1개뿐이면 이 컴포넌트를
// 아예 안 쓰고 기존 ReagentRow를 그대로 씀(ReagentTable.jsx에서 분기).
export default function ReagentGroupRow({ members, visibleCols, isExpanded, onToggleExpand, groupKey }) {
  const name = members[0].name
  const totalSealed = members.reduce((s, m) => s + (m._totalSealed || 0), 0)
  const totalBottles = members.reduce((s, m) => s + (m._bottleCount || 0), 0)
  const locationCount = new Set(members.flatMap(m => m._activeLocIds || [])).size
  const anyLow = members.some(m => m._isLow)
  const uniqueCas = [...new Set(members.map(m => m.cas_no).filter(Boolean))]
  const uniquePurity = [...new Set(members.map(m => m.purity).filter(Boolean))]
  const companies = [...new Set(members.map(m => m.company).filter(Boolean))]

  return (
    <tr onClick={() => onToggleExpand(groupKey)}
      title="클릭: 제품별로 펼치기"
      style={{ cursor: 'pointer', background: '#FAFBFD' }}
      onMouseEnter={e => { e.currentTarget.style.background = C.bg }}
      onMouseLeave={e => { e.currentTarget.style.background = '#FAFBFD' }}>
      <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />
      <td style={{ ...tdStyle, fontWeight: '700', color: C.navy, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
        <button type="button" aria-expanded={isExpanded} aria-label={`${name} 제품별로 ${isExpanded ? '접기' : '펼치기'}`}
          onClick={e => { e.stopPropagation(); onToggleExpand(groupKey) }}
          style={{ marginRight: '3px', color: C.blue, fontSize: '12px', fontWeight: '700', cursor: 'pointer', background: 'none', border: 'none', padding: '4px 5px', minWidth: 24 }}>{isExpanded ? '▾' : '▸'}</button>
        {name}
        <Badge kind="neutral" title={`이름이 같은 시약 ${members.length}건(제조사·순도·CAS가 다를 수 있음)을 한 줄로 묶었어요. 펼치면 제품별로 볼 수 있어요.`}>
          {bottleSummaryText({ bottles: totalBottles, locations: locationCount })}
        </Badge>
        {companies.length > 1 && <Badge kind="neutral" title={companies.join(', ')}>제조사 {companies.length}곳</Badge>}
        {anyLow && <Badge kind="warning" title={LOW_STOCK_TITLE}>재고 부족</Badge>}
      </td>
      <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{uniquePurity.length === 1 ? uniquePurity[0] : '다양'}</td>
      {visibleCols.casNo && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{uniqueCas.length === 1 ? uniqueCas[0] : uniqueCas.length === 0 ? '-' : '제품마다 다름'}</td>}
      {visibleCols.company && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{companies.length}곳</td>}
      {visibleCols.volume && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
      {visibleCols.stock && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{totalBottles > 0 ? `미개봉 ${totalSealed}병` : '보유 0병'}</td>}
      {visibleCols.location && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>제품별 상이</td>}
      {visibleCols.lot && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.expiry && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.category && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.fireClass && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.special && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.casCheck && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.ghs && <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }} />}
      {visibleCols.lastConfirmed && <td style={{ ...tdStyle, borderRight: visibleCols.status ? `1px solid ${C.borderRow}` : undefined }} />}
      {visibleCols.status && <td style={tdStyle} />}
    </tr>
  )
}
