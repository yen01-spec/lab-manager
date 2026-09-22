import { C } from '../../design'

// 자료실 상단 탭 — "전체"만 화면에서 합성한 synthetic 탭이고 나머지는 관리자가 만든 실제 DB 탭.
// role=tablist/tab(aria-selected) 표준 탭 패턴을 쓴다.
export default function ResourceLibraryTabs({ tabs, selected, onSelect, isAdmin, onManageTabs }) {
  const items = [{ id: 'all', name: '전체' }, ...tabs]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
      <div role="tablist" aria-label="자료실 탭" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {items.map(t => {
          const active = t.id === selected
          return (
            <button key={t.id} role="tab" aria-selected={active} id={`restab-${t.id}`} aria-controls="restab-panel"
              onClick={() => onSelect(t.id)} style={{
                padding: '10px 18px', minHeight: 44, minWidth: 44, borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                fontWeight: active ? 700 : 500, border: `1px solid ${active ? C.navy : C.border}`,
                background: active ? C.navy : C.white, color: active ? '#fff' : C.text,
              }}>{t.name}</button>
          )
        })}
      </div>
      {isAdmin && (
        <button onClick={onManageTabs} style={{
          marginLeft: 'auto', padding: '9px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          fontFamily: 'inherit', border: `1px solid ${C.border}`, background: C.white, color: C.navy,
        }}>탭 관리</button>
      )}
    </div>
  )
}
