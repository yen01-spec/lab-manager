import { useState } from 'react'
import { C } from '../../design'
import { allLetters } from '../../lib/reagentLetters'

// 모바일 A–Z 바로가기 — 우하단 A–Z 버튼 + 하단 시트. 시약목록(MobileReagentList)과 일괄정리가 같은 컴포넌트를 쓴다.
// available: 목록에 실제 있는 글자 Set, onJump(letter): 해당 구간으로 이동(시트는 이 컴포넌트가 닫는다).
export default function AlphabetSheet({ available, onJump }) {
  const [open, setOpen] = useState(false)
  const letters = allLetters(available)
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="알파벳으로 이동" style={{
        position: 'fixed', right: '16px', bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 150,
        width: '52px', height: '52px', borderRadius: '26px', border: 'none', cursor: 'pointer',
        background: C.navy, color: '#fff', fontSize: '14px', fontWeight: '800',
        boxShadow: '0 4px 14px rgba(16,24,40,.28)',
      }}>A–Z</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(16,24,40,.45)' }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="알파벳 바로가기" style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, background: C.white,
            borderRadius: '16px 16px 0 0', padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '70vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ color: C.navy, fontSize: '15px' }}>알파벳으로 이동</strong>
              <button onClick={() => setOpen(false)} aria-label="닫기" style={{ border: 'none', background: 'none', fontSize: '22px', color: C.muted, cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {letters.map(letter => {
                const on = available.has(letter)
                return (
                  <button key={letter} disabled={!on} onClick={() => { setOpen(false); onJump(letter) }} style={{
                    minHeight: '48px', borderRadius: '10px', fontSize: '16px', fontWeight: on ? '700' : '400',
                    border: `1px solid ${on ? C.navy : C.border}`, background: on ? C.white : '#F4F5F7',
                    color: on ? C.navy : '#C5CAD3', cursor: on ? 'pointer' : 'default',
                  }}>{letter}</button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
