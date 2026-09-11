import { useMemo, useState } from 'react'
import { C, thStyle, tdStyle } from '../../design'
import { rowBucket, buildRowDiff, locationLabel } from '../../lib/inventorySnapshotMatch'

const PAGE_SIZE = 50

const BUCKET_LABEL = {
  changed: { label: '변경 있음', bg: '#FFF8E7', color: '#8A5A16' },
  unchanged: { label: '변경 없음', bg: '#F3F4F6', color: C.muted },
  new: { label: '신규', bg: '#EAF1FB', color: '#1F4E96' },
  review: { label: '확인 필요', bg: '#FFF3CD', color: '#8A5A16' },
  error: { label: '오류', bg: '#FDECEC', color: C.danger },
}

const FILTERS = [
  ['all', '전체'], ['changed', '변경 있음'], ['new', '신규'],
  ['review', '확인 필요'], ['error', '오류'], ['excluded', '현재 목록 제외 예정'],
]

function rowNote(row) {
  const bucket = rowBucket(row)
  if (bucket === 'error') return row.errors.map(e => e.message).join(' · ')
  if (bucket === 'review') return '관리자 확인 대기 중 — 위 "매칭 확인" 단계에서 처리하세요.'
  if (bucket === 'new') {
    const parts = []
    if (row.reagentMatch.status === 'new') parts.push('신규 시약')
    if (row.lotMatch.status === 'new') parts.push(row.lotNo ? '신규 Lot' : '신규 Lot(내부 관리번호 자동 생성 예정)')
    return parts.join(' + ')
  }
  return '' // changed/unchanged는 diff 컬럼에서 표시
}

export default function InventorySnapshotPreviewTable({ matchedRows, idx, excludedLots, provisionalExcluded }) {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)

  const counts = useMemo(() => {
    const c = { all: matchedRows.length, changed: 0, unchanged: 0, new: 0, review: 0, error: 0, excluded: excludedLots.length }
    for (const r of matchedRows) c[rowBucket(r)]++
    return c
  }, [matchedRows, excludedLots])

  const filteredRows = useMemo(() => {
    if (filter === 'excluded') return []
    if (filter === 'all') return matchedRows
    return matchedRows.filter(r => rowBucket(r) === filter)
  }, [matchedRows, filter])

  const pageCount = Math.max(1, Math.ceil((filter === 'excluded' ? excludedLots.length : filteredRows.length) / PAGE_SIZE))
  const curPage = Math.min(page, pageCount - 1)
  const pageRows = filteredRows.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)
  const pageExcluded = excludedLots.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE)

  function setFilterAndResetPage(f) { setFilter(f); setPage(0) }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map(([key, label]) => (
          <button key={key} onClick={() => setFilterAndResetPage(key)} style={{
            padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${filter === key ? C.navy : C.border}`,
            background: filter === key ? C.navy : C.white, color: filter === key ? '#fff' : C.text,
            fontWeight: filter === key ? 700 : 500,
          }}>{label} ({counts[key] ?? 0})</button>
        ))}
      </div>

      {filter === 'excluded' ? (
        <>
          {provisionalExcluded && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 8, fontSize: 12, color: '#8A5A16' }}>
              ⚠ 아직 확인 필요 항목이 남아 있어 이 목록은 잠정 결과입니다. 매칭 확인을 모두 끝내면 확정됩니다.
            </div>
          )}
          <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
              <thead><tr>{['시약명', 'Lot No.', '위치', '현재 잔량', '미개봉', '예정 상태'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {pageExcluded.length === 0
                  ? <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>제외될 재고가 없습니다.</td></tr>
                  : pageExcluded.map(l => (
                    <tr key={l.id}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.navy }}>{idx.reagentsById.get(l.reagent_id)?.name || '(알 수 없음)'}</td>
                      <td style={tdStyle}>{l.lot_no || '-'}</td>
                      <td style={tdStyle}>{locationLabel(idx.locationsById.get(l.location_id))}</td>
                      <td style={tdStyle}>{l.current_stock}%</td>
                      <td style={tdStyle}>{l.sealed_count}병</td>
                      <td style={{ ...tdStyle, color: '#8A5A16', fontWeight: 600 }}>현재 목록 제외</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
            <thead><tr>{['행', '상태', '시약명', 'Lot No.', '변경/비고'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {pageRows.length === 0
                ? <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: C.muted }}>해당하는 행이 없습니다.</td></tr>
                : pageRows.map(row => {
                  const bucket = rowBucket(row)
                  const badge = BUCKET_LABEL[bucket]
                  const diffs = bucket === 'changed' ? buildRowDiff(row, idx) : []
                  return (
                    <tr key={row.rowNo}>
                      <td style={{ ...tdStyle, color: C.muted }}>{row.rowNo}</td>
                      <td style={tdStyle}><span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{badge.label}</span></td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>{row.nameEn || row.nameKo}</td>
                      <td style={{ ...tdStyle, color: C.muted }}>{row.lotNo || '-'}</td>
                      <td style={{ ...tdStyle, fontSize: 11.5 }}>
                        {bucket === 'unchanged' ? <span style={{ color: C.muted }}>변경 없음</span>
                          : bucket === 'changed'
                            ? diffs.map(d => <div key={d.label}>{d.label}: <span style={{ color: C.muted }}>{String(d.before ?? '-')}</span> → <b>{String(d.after ?? '-')}</b></div>)
                            : <span style={{ color: bucket === 'error' ? C.danger : C.text }}>{rowNote(row)}</span>}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
          <button disabled={curPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))} style={pageBtn(curPage === 0)}>‹ 이전</button>
          <span style={{ fontSize: 12, color: C.muted, alignSelf: 'center' }}>{curPage + 1} / {pageCount}</span>
          <button disabled={curPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} style={pageBtn(curPage >= pageCount - 1)}>다음 ›</button>
        </div>
      )}
    </div>
  )
}

function pageBtn(disabled) {
  return { padding: '6px 14px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: 12.5, fontFamily: 'inherit' }
}
