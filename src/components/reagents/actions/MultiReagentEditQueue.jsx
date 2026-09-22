import { useEffect, useState } from 'react'
import { supabase } from '../../../supabase'
import { C, btnPrimary, btnGhost } from '../../../design'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import ReagentMasterFieldsGrid from '../ReagentMasterFieldsGrid'
import { saveReagentMasterFields } from '../../../lib/reagentMasterEdit'

// 여러 시약(reagent 단위) 정보 수정을 순차로 처리 — 새 bulk update RPC를 만들지 않고,
// 각 시약마다 ReagentDetail과 같은 단일 편집 폼/저장 규칙(reagentMasterEdit.js)을 그대로 재사용한다.
// 이유: 여러 시약에 같은 값을 한 번에 잘못 덮어쓰는 사고를 막고, 기존 승인 요청 semantics를 그대로 유지하기 위함.
export default function MultiReagentEditQueue({ reagentIds, isAdmin, student, onClose, onDone }) {
  const { isMobile } = useBreakpoint()
  const [idx, setIdx] = useState(0)
  const [reagent, setReagent] = useState(null)
  const [pendingChanges, setPendingChanges] = useState([])
  const [draft, setDraft] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changedCount, setChangedCount] = useState(0)
  const total = reagentIds.length
  const id = reagentIds[idx]

  useEffect(() => {
    let alive = true
    setLoading(true); setDraft({})
    ;(async () => {
      const [{ data: r }, { data: pc }] = await Promise.all([
        supabase.from('reagents').select('*').eq('id', id).single(),
        supabase.from('reagent_change_requests').select('*').eq('reagent_id', id).eq('status', 'pending'),
      ])
      if (!alive) return
      setReagent(r); setPendingChanges(pc || []); setLoading(false)
    })()
    return () => { alive = false }
  }, [id])

  function setDraftField(k, v) { setDraft(d => ({ ...d, [k]: v })) }
  function advance(changed) {
    if (changed) setChangedCount(n => n + 1)
    if (idx + 1 >= total) { onDone(changed ? changedCount + 1 : changedCount); return }
    setIdx(i => i + 1)
  }

  async function saveAndNext() {
    setSaving(true)
    const out = await saveReagentMasterFields({ id, isAdmin, student, draft, reagent, pendingChanges })
    setSaving(false)
    if (!out.ok) {
      if (out.reason === 'nochange') { advance(false); return }
      if (out.reason === 'badvolume') { alert('용량은 0 이상의 숫자로 입력해주세요.'); return }
      if (out.reason === 'nologin') { alert('제출하려면 로그인이 필요해요.'); return }
      if (out.reason === 'error') { alert(out.message); return }
      if (out.mode === 'student') {
        if (out.errs?.length) alert(out.errs.join('\n'))
        if (!out.okN) return
      }
    }
    advance(true)
  }

  const canGoPrev = idx > 0
  function goPrev() { if (canGoPrev) setIdx(i => i - 1) }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="여러 시약 정보 수정" onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px', padding: isMobile ? '18px' : '24px 28px', width: '640px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <h3 style={{ margin: 0, color: C.navy }}>✏️ {isAdmin ? '여러 시약 정보 수정' : '여러 시약 정보 수정 신청'}</h3>
          <span style={{ fontSize: '13px', fontWeight: '700', color: C.muted }}>{idx + 1} / {total}</span>
        </div>
        <p style={{ margin: '0 0 16px', color: C.muted, fontSize: '12.5px' }}>
          시약마다 따로 {isAdmin ? '저장' : '수정 신청'}해요 — 여러 시약에 같은 값을 한 번에 덮어쓰지 않기 위해서예요.
        </p>

        {loading || !reagent ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
        ) : (
          <>
            <div style={{ fontSize: '15px', fontWeight: '700', color: C.navy, marginBottom: 2, overflowWrap: 'anywhere' }}>{reagent.name}</div>
            {reagent.name_ko && <div style={{ fontSize: '12.5px', color: C.muted, marginBottom: 14 }}>{reagent.name_ko}</div>}
            <ReagentMasterFieldsGrid reagent={reagent} isMobile={isMobile} isEditing
              draft={draft} setDraftField={setDraftField} pendingChanges={pendingChanges} isAdmin={isAdmin}
              idPrefix={`multiedit-${idx}`} />
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '22px' }}>
          <button onClick={onClose} disabled={saving} style={{ ...btnGhost, minHeight: 40 }}>닫기</button>
          {canGoPrev && <button onClick={goPrev} disabled={saving} style={{ ...btnGhost, minHeight: 40 }}>← 이전</button>}
          <button onClick={() => advance(false)} disabled={saving || loading} style={{ ...btnGhost, minHeight: 40, marginLeft: 'auto' }}>건너뛰기</button>
          <button onClick={saveAndNext} disabled={saving || loading} style={{ ...btnPrimary, minHeight: 40, opacity: saving ? 0.6 : 1 }}>
            {saving ? '처리 중...' : (isAdmin ? '저장' : '수정 신청') + (idx + 1 < total ? ' 후 다음' : ' 후 완료')}
          </button>
        </div>
      </div>
    </div>
  )
}
