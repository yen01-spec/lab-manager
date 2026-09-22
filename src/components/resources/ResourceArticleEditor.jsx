import { useState } from 'react'
import { C, Modal, inputStyle, labelStyle, btnPrimary, btnGhost } from '../../design'
import { createResourceArticle, updateResourceArticle } from '../../lib/resources'

// 관리자 글 작성/수정 — rich text/WYSIWYG 없음. plain text + steps는 줄바꿈 textarea → 배열.
// HTML 직접 입력·dangerouslySetInnerHTML 금지(자료실은 plain text만 저장·표시한다).
function isSafeLinkUrl(u) {
  const s = (u || '').trim()
  if (!s) return true // 링크 없음은 허용(둘 다 없어야 함은 별도 검사)
  if (/^\//.test(s) && !/^\/\//.test(s)) return true   // 내부 경로(react-router)
  return /^https?:\/\//i.test(s)                        // 외부 링크
}

export default function ResourceArticleEditor({ tabs, defaultTabId, article, onClose, onSaved }) {
  const editing = !!article
  const [form, setForm] = useState(() => ({
    tabId: article?.tab_id || defaultTabId || tabs[0]?.id || '',
    title: article?.title || '',
    summary: article?.summary || '',
    audience: article?.audience || '',
    timing: article?.timing || '',
    stepsText: (article?.steps || []).join('\n'),
    notice: article?.notice || '',
    linkLabel: article?.link_label || '',
    linkUrl: article?.link_url || '',
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setErr('')
    if (!form.title.trim()) { setErr('제목을 입력해주세요.'); return }
    if (!form.tabId) { setErr('탭을 선택해주세요.'); return }
    if ((form.linkLabel.trim() && !form.linkUrl.trim()) || (!form.linkLabel.trim() && form.linkUrl.trim())) {
      setErr('관련 링크는 이름과 주소를 함께 입력해주세요.'); return
    }
    if (form.linkUrl.trim() && !isSafeLinkUrl(form.linkUrl)) {
      setErr('관련 링크 주소는 https:// 로 시작하는 외부 주소이거나 / 로 시작하는 앱 내부 경로여야 합니다.'); return
    }
    const steps = form.stepsText.split('\n').map(s => s.trim()).filter(Boolean)
    const fields = {
      tabId: form.tabId, title: form.title, summary: form.summary, audience: form.audience, timing: form.timing,
      steps, notice: form.notice, linkLabel: form.linkLabel, linkUrl: form.linkUrl,
      sortOrder: article?.sort_order ?? 0,
    }
    setBusy(true)
    try {
      if (editing) await updateResourceArticle(article.id, fields)
      else await createResourceArticle(fields)
      await onSaved()
    } catch (e) {
      setErr(e.message || String(e))
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={editing ? '글 수정' : '글 작성'} width={620}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {err && <div style={{ fontSize: 12.5, color: C.dangerDark, background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>{err}</div>}

        <div>
          <label htmlFor="art-tab" style={labelStyle}>탭 *</label>
          <select id="art-tab" value={form.tabId} onChange={e => set('tabId', e.target.value)} style={inputStyle}>
            {tabs.length === 0 && <option value="">탭이 없습니다 — 먼저 탭을 만들어주세요</option>}
            {tabs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="art-title" style={labelStyle}>제목 *</label>
          <input id="art-title" value={form.title} onChange={e => set('title', e.target.value)} style={inputStyle} />
        </div>

        <div>
          <label htmlFor="art-summary" style={labelStyle}>안내/요약(선택)</label>
          <textarea id="art-summary" value={form.summary} onChange={e => set('summary', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="art-audience" style={labelStyle}>누가(선택)</label>
            <input id="art-audience" value={form.audience} onChange={e => set('audience', e.target.value)} placeholder="예: 연구실책임자 · 연구실안전관리담당자" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="art-timing" style={labelStyle}>언제(선택)</label>
            <input id="art-timing" value={form.timing} onChange={e => set('timing', e.target.value)} placeholder="예: 신규 입고 시 · 정기 점검 시" style={inputStyle} />
          </div>
        </div>

        <div>
          <label htmlFor="art-steps" style={labelStyle}>해야 할 일(선택, 한 줄에 하나씩)</label>
          <textarea id="art-steps" value={form.stepsText} onChange={e => set('stepsText', e.target.value)} rows={4}
            placeholder={'현재 대상 물질 확인\n공식 시스템에서 등록\n취급 시 관련 기록 작성'} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div>
          <label htmlFor="art-notice" style={labelStyle}>참고/주의사항(선택)</label>
          <textarea id="art-notice" value={form.notice} onChange={e => set('notice', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="art-link-label" style={labelStyle}>관련 링크 이름(선택)</label>
            <input id="art-link-label" value={form.linkLabel} onChange={e => set('linkLabel', e.target.value)} placeholder="예: 학교 시스템 열기" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="art-link-url" style={labelStyle}>관련 링크 주소(선택)</label>
            <input id="art-link-url" value={form.linkUrl} onChange={e => set('linkUrl', e.target.value)} placeholder="https://... 또는 /reagents/list" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => !busy && onClose()} disabled={busy} style={{ ...btnGhost, flex: 1, minHeight: 44 }}>취소</button>
          <button onClick={save} disabled={busy} style={{ ...btnPrimary, flex: 2, minHeight: 44, opacity: busy ? 0.6 : 1 }}>{busy ? '처리 중...' : (editing ? '저장' : '작성 완료')}</button>
        </div>
      </div>
    </Modal>
  )
}
