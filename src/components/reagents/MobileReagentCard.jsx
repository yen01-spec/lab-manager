import { C } from '../../design'

// 모바일 시약목록 카드 — PC의 minWidth:900px 표는 휴대폰으로 시약장을 돌아다니며
// 검색할 때 가로 스크롤이 계속 생겨서 불편함. 대신 핵심 정보(시약명·CAS·회사·위치·
// 재고)만 카드 한 장에 담고, 탭하면 바로 상세페이지로 이동.
export default function MobileReagentCard({ r, locations, isPicked, onTogglePick, onOpenDetail }) {
  const activeLots = r._activeLots
  const isLow = r._isLow
  const hasPendingConfirm = r._hasPendingConfirm

  let loc = null
  if (activeLots.length > 0 && r._activeLocIds.length <= 1) {
    loc = locations.find(l => l.id === activeLots[0].location_id) || null
  }
  const locText = r._multiLocation ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'

  return (
    <div onClick={() => onOpenDetail(r)}
      style={{
        background: isLow ? '#FFF8F8' : hasPendingConfirm ? '#F0F7FF' : C.white,
        border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px',
        display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer',
      }}>
      <div onClick={e => { e.stopPropagation(); onTogglePick(r, e) }} style={{ paddingTop: '2px' }}>
        <input type="checkbox" checked={isPicked} onChange={() => {}} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
          <span style={{ fontWeight: '700', color: C.navy, fontSize: '15px' }}>{r.name}</span>
          {r.purity && <span style={{ fontSize: '11.5px', color: C.muted }}>({r.purity})</span>}
          {r.reagent_type === 'self_made' && <span style={{ fontSize: '9.5px', background: '#EAF1FB', color: '#1F4E96', padding: '1px 7px', borderRadius: '999px', fontWeight: '700' }}>직접제조</span>}
          {isLow && <span style={{ fontSize: '10px', background: '#FFEBEE', color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>부족</span>}
          {hasPendingConfirm && <span style={{ fontSize: '10px', background: '#E3F2FD', color: '#1565C0', padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>검토대기</span>}
        </div>
        <div style={{ fontSize: '12.5px', color: C.muted, marginBottom: '6px' }}>
          {r.cas_no || '-'}{r.company ? ` · ${r.company}` : ''}
        </div>
        <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: C.text }}>
          <span>📍 {locText}</span>
          <span>{activeLots.length > 0 ? `${r._totalSealed}병 · 잔량 ${r._avgStock}%` : '보유 0병'}</span>
        </div>
      </div>
      <span style={{ color: C.muted, fontSize: '18px', flexShrink: 0 }}>›</span>
    </div>
  )
}
