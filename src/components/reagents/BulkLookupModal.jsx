import { C, inputStyle, btnPrimary, thStyle, tdStyle } from '../../design'

// 시약 일괄조회 모달 — 여러 시약명을 한번에 붙여넣어 존재유무/위치/잔량을 확인(학기 준비용).
// 조회/ZIP 생성 로직(runBulkLookup/downloadMsdsZip/addBulkLookupMatchesToPicked)은 부모가 갖고,
// 이 컴포넌트는 입력/결과 표시만 담당.
export default function BulkLookupModal({
  locations, bulkLookupText, setBulkLookupText, bulkLookupResults, bulkLookupLoading, zippingMsds,
  onRun, onAddMatchesToPicked, onDownloadMsds, onClose,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(26,42,94,0.55)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px', padding: '28px',
        width: '760px', maxWidth: '95vw', maxHeight: '86vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        <h3 style={{ margin: '0 0 4px', color: C.navy }}>📋 시약 일괄 검색</h3>
        <p style={{ margin: '0 0 16px', color: C.muted, fontSize: '12.5px' }}>
          필요한 시약명을 한 줄에 하나씩 붙여넣으면 목록에 있는지, 위치와 잔량이 어떤지 한번에 확인할 수 있어요.
        </p>
        <textarea value={bulkLookupText} onChange={e => setBulkLookupText(e.target.value)}
          placeholder={'예)\nAcetone\nHCl\nEDTA'} rows={6}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button onClick={onRun} disabled={bulkLookupLoading} style={{ ...btnPrimary, padding: '9px 20px', opacity: bulkLookupLoading ? 0.6 : 1 }}>
            {bulkLookupLoading ? '조회 중...' : '조회'}
          </button>
        </div>

        {bulkLookupResults && (
          <div style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>
                조회 결과 · 있음 {bulkLookupResults.filter(r => r.matches.length > 0).length}/{bulkLookupResults.length}건
              </span>
              {bulkLookupResults.some(r => r.matches.length > 0) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {bulkLookupResults.some(r => r.matches.some(m => m.msds_url)) && (
                    <button onClick={onDownloadMsds} disabled={zippingMsds} style={{
                      background: C.white, color: C.navy, border: `1px solid ${C.border}`, padding: '7px 14px',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', fontWeight: '600',
                      opacity: zippingMsds ? 0.6 : 1,
                    }}>{zippingMsds ? '압축 중...' : '📦 MSDS 일괄 다운로드'}</button>
                  )}
                  <button onClick={onAddMatchesToPicked} style={{
                    background: C.navy, color: '#fff', border: 'none', padding: '7px 14px',
                    borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', fontWeight: '600',
                  }}>찾은 시약 모두 선택 목록에 담기</button>
                </div>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['입력한 이름', '결과', '위치', '잔량', '최근확인'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {bulkLookupResults.map(({ query, matches }) => (
                  matches.length === 0 ? (
                    <tr key={query}>
                      <td style={{ ...tdStyle, fontWeight: '600' }}>{query}</td>
                      <td style={{ ...tdStyle, color: C.danger, fontWeight: '700' }}>✕ 없음</td>
                      <td style={tdStyle}>-</td><td style={tdStyle}>-</td><td style={tdStyle}>-</td>
                    </tr>
                  ) : matches.map((r, i) => {
                    const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
                    const avgStock = activeLots.length > 0
                      ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : 0
                    const locIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
                    const loc = locIds.size === 1 ? locations.find(l => l.id === activeLots[0].location_id) : null
                    const locText = locIds.size > 1 ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'
                    return (
                      <tr key={r.id}>
                        <td style={{ ...tdStyle, fontWeight: '600' }}>{i === 0 ? query : ''}</td>
                        <td style={{ ...tdStyle, color: '#00875A', fontWeight: '700' }}>{i === 0 && matches.length > 1 ? `✓ ${matches.length}건` : '✓ 있음'}</td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locText}</td>
                        <td style={{ ...tdStyle, fontSize: '12px' }}>{activeLots.length > 0 ? `${avgStock}%` : '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted }}>{r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}</td>
                      </tr>
                    )
                  })
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}`, padding: '9px 18px' }}>닫기</button>
        </div>
      </div>
    </div>
  )
}
