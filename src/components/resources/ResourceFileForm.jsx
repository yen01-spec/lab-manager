import { useState } from 'react'
import { C } from '../../design'
import { RESOURCE_UPLOAD_HELP } from '../../lib/resources'

// 공식 자료 추가 / 수정 / 새 버전 등록 폼 (Phase 5-h2b). Modal 안에서 사용.
// mode: 'add'    — 새 자료. 파일 필수. category/section 은 현재 섹션에서 자동.
//       'edit'   — 메타데이터 수정. 파일은 선택(넣으면 '파일 교체', 비우면 Storage 미변경).
//       'version'— 새 버전 등록. 파일 필수. 기존 메타데이터가 기본값. resource_key 승계.
const TYPE_OPTS = [
  { v: 'form', t: '필수 양식' },
  { v: 'official', t: '공식 지침·매뉴얼' },
  { v: 'reference', t: '참고자료' },
]

export default function ResourceFileForm({ mode, base, categoryKey, sectionKey, busy, onSubmit, onCancel }) {
  const b = base || {}
  // add: 빈 폼. edit: 모든 값 그대로. version: 제목·유형·기관·메모는 승계, 날짜/버전표기는 새로 입력.
  const [f, setF] = useState({
    title: mode === 'add' ? '' : (b.title || ''),
    resourceType: b.resource_type || 'form',
    issuer: mode === 'add' ? '' : (b.issuer || ''),
    revisionDate: mode === 'edit' ? (b.revision_date || '') : '',
    effectiveDate: mode === 'edit' ? (b.effective_date || '') : '',
    versionLabel: mode === 'edit' ? (b.version_label || '') : '',
    resourceKey: b.resource_key || '',
    sortOrder: b.sort_order ?? 0,
    notes: mode === 'add' ? '' : (b.notes || ''),
  })
  const [file, setFile] = useState(null)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const fileRequired = mode === 'add' || mode === 'version'

  function submit(e) {
    e.preventDefault()
    if (busy) return
    if (!f.title.trim()) return
    if (fileRequired && !file) return
    onSubmit({ fields: { ...f, categoryKey, sectionKey }, file })
  }

  const field = {
    width: '100%', padding: '7px 9px', borderRadius: 7, border: `1px solid ${C.border}`,
    fontSize: 12.5, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', background: C.white,
  }
  const lab = { fontSize: 11, fontWeight: 700, color: C.textSub, display: 'block', marginBottom: 3 }
  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ fontSize: 11.5, color: C.muted }}>
        위치: <b>{categoryKey} / {sectionKey}</b>
        {mode === 'version' && ' · 기존 자료의 새 버전(등록 후 "현재 자료로 지정" 필요)'}
      </div>

      <div>
        <label style={lab}>제목 *</label>
        <input value={f.title} onChange={set('title')} required style={field} placeholder="예: 화학물질 취급 시 안전작업 표준서" />
      </div>

      <div style={row2}>
        <div>
          <label style={lab}>유형 *</label>
          <select value={f.resourceType} onChange={set('resourceType')} style={field}>
            {TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
          </select>
        </div>
        <div>
          <label style={lab}>발행/근거 기관</label>
          <input value={f.issuer} onChange={set('issuer')} style={field} placeholder="예: 강원대학교 / 고용노동부" />
        </div>
      </div>

      <div style={row2}>
        <div>
          <label style={lab}>개정일</label>
          <input type="date" value={f.revisionDate} onChange={set('revisionDate')} style={field} />
        </div>
        <div>
          <label style={lab}>시행일</label>
          <input type="date" value={f.effectiveDate} onChange={set('effectiveDate')} style={field} />
        </div>
      </div>

      <div style={row2}>
        <div>
          <label style={lab}>버전 표기</label>
          <input value={f.versionLabel} onChange={set('versionLabel')} style={field} placeholder="예: 2024 개정판 / v3" />
        </div>
        <div>
          <label style={lab}>정렬 순서</label>
          <input type="number" value={f.sortOrder} onChange={set('sortOrder')} style={field} />
        </div>
      </div>

      {mode !== 'add' && (
        <div>
          <label style={lab}>버전 키 (resource_key) — 같은 문서의 버전끼리 묶는 값</label>
          <input value={f.resourceKey} onChange={set('resourceKey')} style={field}
            placeholder={mode === 'version' ? '비우면 자동 생성/승계' : '비우면 단독 자료'} />
        </div>
      )}

      <div>
        <label style={lab}>메모</label>
        <textarea value={f.notes} onChange={set('notes')} rows={2} style={{ ...field, resize: 'vertical' }} />
      </div>

      <div>
        <label style={lab}>
          {mode === 'edit' ? '파일 교체 (선택 — 비워두면 파일은 그대로)' : '파일 *'}
        </label>
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)}
          accept=".pdf,.hwp,.hwpx,.xls,.xlsx,.doc,.docx,.png,.jpg,.jpeg" style={{ fontSize: 12 }} />
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{RESOURCE_UPLOAD_HELP}</div>
        {mode === 'edit' && b.original_filename && (
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>현재 파일: {b.original_filename}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{
          padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white,
          color: C.textSub, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}>취소</button>
        <button type="submit" disabled={busy || (fileRequired && !file) || !f.title.trim()} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: busy ? C.muted : C.navy, color: '#fff', fontSize: 12.5, fontWeight: 700,
          fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
        }}>{busy ? '처리 중...' : mode === 'add' ? '자료 추가' : mode === 'version' ? '새 버전 등록' : '수정 저장'}</button>
      </div>
    </form>
  )
}
