import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { C } from '../../design'
import MobileReagentCard from './MobileReagentCard'
import { useVirtualListRestore } from '../../hooks/useVirtualListRestore'

// 모바일 시약 목록 — 카드를 전부 DOM에 그리던 방식(1,300여 장)을 window 가상 스크롤로 교체.
// 화면에 보이는 카드(+overscan)만 DOM에 존재하고, A–Z 바로가기(하단 시트)로 알파벳 구간에 점프한다.
// 카드는 높이가 제각각(이름 줄바꿈·배지)이라 measureElement로 실제 높이를 잰다.
function buildRows(data) {
  const groups = {}
  for (const r of data) {
    const letter = (r.sort_letter || r.name[0]).toUpperCase() // 데스크톱 ReagentTable과 동일 기준
    ;(groups[letter] ||= []).push(r)
  }
  const rows = []
  for (const letter of Object.keys(groups).sort()) {
    rows.push({ kind: 'letter', key: 'L:' + letter, letter })
    for (const r of groups[letter]) rows.push({ kind: 'card', key: r.id, r })
  }
  return rows
}

const HEADER_OFFSET = 64 // 상단 고정 헤더(56px) 아래로 보이도록 점프 보정

export default function MobileReagentList({ data, locations, pickedIds, togglePick, onOpenDetail }) {
  const rows = useMemo(() => buildRows(data), [data])
  const listRef = useRef(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  useEffect(() => {
    if (!listRef.current) return
    setScrollMargin(listRef.current.getBoundingClientRect().top + window.scrollY)
  }, [])

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (i) => (rows[i].kind === 'letter' ? 34 : 108),
    overscan: 8,
    scrollMargin,
    getItemKey: (i) => rows[i].key,
  })
  useVirtualListRestore(virtualizer, rows, scrollMargin > 0)

  const [sheetOpen, setSheetOpen] = useState(false)
  const availableLetters = useMemo(() => new Set(rows.filter(r => r.kind === 'letter').map(r => r.letter)), [rows])
  const allLetters = useMemo(() => [...new Set([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...availableLetters])].sort(), [availableLetters])

  const jumpTo = useCallback((letter) => {
    const idx = rows.findIndex(r => r.kind === 'letter' && r.letter === letter)
    if (idx < 0) return
    setSheetOpen(false)
    virtualizer.scrollToIndex(idx, { align: 'start' })
    setTimeout(() => window.scrollBy({ top: -HEADER_OFFSET }), 0)
  }, [rows, virtualizer])

  const items = virtualizer.getVirtualItems()

  return (
    <>
      <div ref={listRef} style={{ position: 'relative', height: `${virtualizer.getTotalSize()}px` }}>
        {items.map(vi => {
          const row = rows[vi.index]
          return (
            <div key={vi.key} data-index={vi.index} ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${vi.start - scrollMargin}px)`, paddingBottom: '8px' }}>
              {row.kind === 'letter' ? (
                <div style={{
                  padding: '6px 12px', fontWeight: '800', fontSize: '13px', color: C.navy,
                  background: `linear-gradient(90deg, ${C.navy}11, transparent)`, borderLeft: `3px solid ${C.gold}`,
                }}>{row.letter}</div>
              ) : (
                <MobileReagentCard r={row.r} locations={locations}
                  isPicked={pickedIds.has(row.r.id)} onTogglePick={togglePick} onOpenDetail={onOpenDetail} />
              )}
            </div>
          )
        })}
      </div>

      <button onClick={() => setSheetOpen(true)} aria-label="알파벳으로 이동" style={{
        position: 'fixed', right: '16px', bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 150,
        width: '52px', height: '52px', borderRadius: '26px', border: 'none', cursor: 'pointer',
        background: C.navy, color: '#fff', fontSize: '14px', fontWeight: '800',
        boxShadow: '0 4px 14px rgba(16,24,40,.28)',
      }}>A–Z</button>

      {sheetOpen && (
        <div onClick={() => setSheetOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(16,24,40,.45)' }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="알파벳 바로가기" style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, background: C.white,
            borderRadius: '16px 16px 0 0', padding: '16px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '70vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong style={{ color: C.navy, fontSize: '15px' }}>알파벳으로 이동</strong>
              <button onClick={() => setSheetOpen(false)} style={{ border: 'none', background: 'none', fontSize: '22px', color: C.muted, cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
              {allLetters.map(letter => {
                const on = availableLetters.has(letter)
                return (
                  <button key={letter} disabled={!on} onClick={() => jumpTo(letter)} style={{
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
