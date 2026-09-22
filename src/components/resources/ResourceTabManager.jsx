import { useState } from 'react'
import { C, Modal, inputStyle, btnPrimary } from '../../design'
import { createResourceTab, renameResourceTab, reorderResourceTabs, deleteResourceTab } from '../../lib/resources'

// 관리자 탭 관리 — 생성/이름 수정/순서 변경(↑↓)/삭제(빈 탭만). 드래그앤드롭 라이브러리 없이
// 키보드로도 쓸 수 있는 단순 버튼만 사용한다.
export default function ResourceTabManager({ tabs, articleCountByTab, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(null) // { id, name }

  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn(); await onChanged() }
    catch (e) { setErr(e.message || String(e)) }
    finally { setBusy(false) }
  }

  function addTab() {
    const name = newName.trim()
    if (!name) { setErr('탭 이름을 입력해주세요.'); return }
    run(async () => { await createResourceTab(name); setNewName('') })
  }

  function saveRename() {
    if (!renaming?.name.trim()) { setErr('탭 이름을 입력해주세요.'); return }
    run(async () => { await renameResourceTab(renaming.id, renaming.name); setRenaming(null) })
  }

  function move(idx, dir) {
    const next = [...tabs]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    run(() => reorderResourceTabs(next.map(t => t.id)))
  }

  function remove(tab) {
    const n = articleCountByTab.get(tab.id) || 0
    if (n > 0) { setErr(`이 탭에 자료 ${n}개가 있습니다. 자료를 다른 탭으로 이동하거나 삭제한 후 탭을 삭제하세요.`); return }
    if (!window.confirm(`"${tab.name}" 탭을 삭제할까요?`)) return
    run(() => deleteResourceTab(tab.id))
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="탭 관리" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {err && <div style={{ fontSize: 12.5, color: C.dangerDark, background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>{err}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tabs.map((t, i) => (
            <div key={t.id} data-tab-id={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
              {renaming?.id === t.id ? (
                <input autoFocus value={renaming.name} onChange={e => setRenaming({ id: t.id, name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(null) }}
                  style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 13 }} />
              ) : (
                <span style={{ flex: 1, fontSize: 13.5, color: C.text, overflowWrap: 'anywhere' }}>{t.name} <span style={{ color: C.muted, fontSize: 11.5 }}>· 자료 {articleCountByTab.get(t.id) || 0}개</span></span>
              )}
              <button onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`${t.name} 위로 이동`} title="위로" style={tabBtn(busy || i === 0)}>↑</button>
              <button onClick={() => move(i, 1)} disabled={busy || i === tabs.length - 1} aria-label={`${t.name} 아래로 이동`} title="아래로" style={tabBtn(busy || i === tabs.length - 1)}>↓</button>
              {renaming?.id === t.id ? (
                <button onClick={saveRename} disabled={busy} style={tabBtn(busy, C.navy, '#fff')}>저장</button>
              ) : (
                <button onClick={() => setRenaming({ id: t.id, name: t.name })} disabled={busy} style={tabBtn(busy)}>이름 수정</button>
              )}
              <button onClick={() => remove(t)} disabled={busy} style={tabBtn(busy, '#FDECEC', C.dangerDark)}>삭제</button>
            </div>
          ))}
          {tabs.length === 0 && <div style={{ fontSize: 12.5, color: C.muted, padding: '8px 4px' }}>아직 탭이 없습니다.</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 6, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="새 탭 이름" disabled={busy}
            onKeyDown={e => { if (e.key === 'Enter') addTab() }} style={{ ...inputStyle, flex: 1 }} aria-label="새 탭 이름" />
          <button onClick={addTab} disabled={busy} style={{ ...btnPrimary, minHeight: 40, opacity: busy ? 0.6 : 1 }}>+ 탭 생성</button>
        </div>
      </div>
    </Modal>
  )
}

function tabBtn(disabled, bg = C.white, color = C.text) {
  return {
    fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    background: bg, color, border: `1px solid ${bg === C.white ? C.border : bg}`, borderRadius: 6, padding: '6px 10px', minHeight: 32,
  }
}
