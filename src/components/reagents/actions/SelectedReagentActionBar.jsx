import { useState } from 'react'
import { C } from '../../../design'
import { useBreakpoint } from '../../../hooks/useBreakpoint'

// 체크박스 = "이 시약을 작업 대상으로 선택"(reagents.id) 뿐 — 무엇에 쓸지는 선택 후 이 액션바에서 고른다.
// 1종 선택 = 단일 작업, 여러 종 선택 = 자연스럽게 일괄 작업(별도 "일괄 작업 모드" 없음).
export default function SelectedReagentActionBar({ count, hiddenCount, isAdmin, onAction, onClear }) {
  const { isMobile } = useBreakpoint()
  const [menuOpen, setMenuOpen] = useState(false)

  const actions = [
    { key: 'purchase', label: '🛒 구매요청', primary: true },
    { key: 'move', label: `📍 위치 이동${isAdmin ? '' : ' 신청'}` },
    { key: 'dispose', label: `🗑️ 폐기${isAdmin ? '' : ' 신청'}` },
    { key: 'edit', label: `✏️ 정보 수정${isAdmin ? '' : ' 신청'}` },
    { key: 'list', label: '📋 선택 목록 보기' },
    { key: 'excel', label: '📊 Excel 내보내기' },
  ]

  const countLabel = `${count}종 선택됨${hiddenCount > 0 ? ` · 현재 필터에서 ${hiddenCount}종 숨김` : ''}`

  if (isMobile) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        padding: '10px 14px', marginBottom: '14px', background: '#EEF2FB', border: `1px solid ${C.navy}`, borderRadius: '10px',
      }}>
        <span style={{ fontSize: '12.5px', fontWeight: '700', color: C.navy, minWidth: 0 }}>📋 {countLabel}</span>
        <button onClick={() => setMenuOpen(true)} style={{
          background: C.navy, color: '#fff', border: 'none', padding: '9px 16px', minHeight: 40, borderRadius: '8px',
          cursor: 'pointer', fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap',
        }}>작업 선택</button>

        {menuOpen && (
          <div role="dialog" aria-modal="true" aria-label="선택한 시약 작업" onClick={() => setMenuOpen(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.45)', zIndex: 350, display: 'flex', alignItems: 'flex-end',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: C.white, width: '100%', borderRadius: '16px 16px 0 0', padding: '10px 14px calc(14px + env(safe-area-inset-bottom, 0px))',
              boxShadow: '0 -8px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '4px',
            }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: '2px auto 10px' }} />
              <div style={{ fontSize: '12.5px', fontWeight: '700', color: C.navy, padding: '0 6px 6px' }}>{countLabel}</div>
              {actions.map(a => (
                <button key={a.key} onClick={() => { setMenuOpen(false); onAction(a.key) }} style={{
                  textAlign: 'left', padding: '13px 12px', minHeight: 44, borderRadius: '8px', border: 'none', background: 'none',
                  fontSize: '14px', color: C.text, cursor: 'pointer',
                }}>{a.label}</button>
              ))}
              <button onClick={() => { setMenuOpen(false); onClear() }} style={{
                textAlign: 'left', padding: '13px 12px', minHeight: 44, borderRadius: '8px', border: 'none', background: 'none',
                fontSize: '14px', color: C.muted, cursor: 'pointer', borderTop: `1px solid ${C.borderRow}`, marginTop: '4px',
              }}>선택 해제</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      padding: '12px 16px', marginBottom: '16px', background: '#EEF2FB', border: `1px solid ${C.navy}`, borderRadius: '8px',
    }}>
      <span style={{ fontSize: '13px', fontWeight: '700', color: C.navy, whiteSpace: 'nowrap' }}>📋 {countLabel}</span>
      {actions.map(a => (
        <button key={a.key} onClick={() => onAction(a.key)} style={{
          background: a.primary ? C.navy : C.white, color: a.primary ? '#fff' : C.navy,
          border: a.primary ? 'none' : '1px solid #C9DAF5',
          padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap',
        }}>{a.label}</button>
      ))}
      <button onClick={onClear} style={{
        background: C.white, color: C.muted, border: `1px solid ${C.border}`,
        padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', marginLeft: 'auto',
      }}>선택 해제</button>
    </div>
  )
}
