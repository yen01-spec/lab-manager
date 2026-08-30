import { C, thStyle, tdStyle } from '../../design'
import { exportPickedReagents } from '../../exportUtils'

function Modal({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '640px', maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        {children}
      </div>
    </div>
  )
}

// 검색결과에서 체크해 모아둔 "선택 목록"을 인쇄/PDF·MSDS 일괄 열기·Excel로 내보내는 모달.
export default function PickedListModal({ pickedIds, setPickedIds, locations, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="picked-print-target">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>선택 목록</div>
            <h2 style={{ margin: 0, color: C.navy, fontSize: '18px', fontWeight: '800' }}>선택한 시약 {pickedIds.size}개</h2>
          </div>
          <button className="no-print" onClick={onClose} style={{ background: 'transparent', border: 'none', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#CBD5E0' }}>×</button>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <thead>
            <tr>
              {['시약명', '규격/용량', '잔량', '위치', '최근 확인', ''].map(h => (
                <th key={h} style={thStyle} className={h === '' ? 'no-print' : undefined}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(pickedIds.values()).map(r => {
              const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
              const avgStock = activeLots.length > 0
                ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : null
              const locIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
              const loc = locIds.size === 1 ? locations.find(l => l.id === activeLots[0].location_id) : null
              const locText = locIds.size > 1 ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'
              return (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.volume ? `${r.volume}${r.unit || ''}` : '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px' }}>{avgStock !== null ? `${avgStock}%` : '-'}</td>
                  <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locText}</td>
                  <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted }}>{r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}</td>
                  <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                    <button onClick={() => setPickedIds(prev => { const next = new Map(prev); next.delete(r.id); return next })}
                      style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '13px' }}>제거</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="no-print" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>닫기</button>
        <button onClick={() => {
          document.body.classList.add('printing-picked-list')
          window.print()
          setTimeout(() => document.body.classList.remove('printing-picked-list'), 200)
        }} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🖨️ 인쇄/PDF</button>
        <button onClick={() => {
          const withMsds = Array.from(pickedIds.values()).filter(r => r.msds_url)
          if (withMsds.length === 0) { alert('선택한 시약 중 등록된 MSDS 파일이 있는 항목이 없어요.'); return }
          withMsds.forEach(r => window.open(r.msds_url, '_blank'))
        }} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          📄 MSDS 일괄 열기 ({Array.from(pickedIds.values()).filter(r => r.msds_url).length}건)
        </button>
        <button onClick={() => exportPickedReagents(Array.from(pickedIds.values()), locations)} style={{ padding: '9px 16px', borderRadius: '6px', border: 'none', background: '#1D6F42', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📥 Excel</button>
      </div>
    </Modal>
  )
}
