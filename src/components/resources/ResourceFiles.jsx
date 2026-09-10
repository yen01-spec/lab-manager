import { useEffect, useState, useCallback } from 'react'
import { C, Modal } from '../../design'
import {
  getResources, createResource, updateResourceMeta, replaceResourceFile,
  addResourceVersion, setResourceCurrent, deleteResource,
} from '../../lib/resources'
import { isAuthedAdmin, getAdminAuthUser, signOutAdmin } from '../../lib/adminAuth'
import ResourceFileCard from './ResourceFileCard'
import ResourceAdminAuth from './ResourceAdminAuth'
import ResourceFileForm from './ResourceFileForm'

// 자료 탭 "공식 자료 및 양식" — resource_files 표시(5-h2a) + 관리자 CMS(5-h2b).
// 관리자 write 는 전부 supabaseAdmin(Supabase Auth 세션) 경유. isAdmin(앱 권한)이면 로그인 UI 노출,
// 로그인 성공 + is_admin() 통과해야 실제 추가/수정/버전/삭제 버튼이 동작한다.
const TYPE_ORDER = [
  { key: 'form', label: '필수 양식' },
  { key: 'official', label: '공식 지침·매뉴얼' },
  { key: 'reference', label: '참고자료' },
]

const isSessionError = (msg) => /jwt|expired|만료|401|not authorized|권한이 없습니다/i.test(msg || '')

export default function ResourceFiles({ categoryKey, sectionKey, isAdmin = false }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [admin, setAdmin] = useState({ ready: !isAdmin, authed: false, email: null })
  const [authOpen, setAuthOpen] = useState(false)
  const [form, setForm] = useState(null)   // { mode:'add'|'edit'|'version', base? }
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null) // { kind:'ok'|'warn'|'err', text }

  const load = useCallback(() => {
    if (!categoryKey || !sectionKey) return
    let alive = true
    setState({ status: 'loading', rows: [] })
    getResources(categoryKey, sectionKey)
      .then(rows => { if (alive) setState({ status: 'ok', rows }) })
      .catch(() => { if (alive) setState({ status: 'error', rows: [] }) })
    return () => { alive = false }
  }, [categoryKey, sectionKey])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => load(), [load])

  // 기존 관리자 Auth 세션(lm_admin_auth) 복원 — 네비게이션 후에도 유지.
  useEffect(() => {
    if (!isAdmin) return
    let alive = true
    ;(async () => {
      const ok = await isAuthedAdmin()
      const u = ok ? await getAdminAuthUser() : null
      if (alive) setAdmin({ ready: true, authed: ok, email: u?.email || null })
    })()
    return () => { alive = false }
  }, [isAdmin])

  const canManage = isAdmin && admin.authed

  function report(e, okText) {
    if (!e) { setFlash(okText ? { kind: 'ok', text: okText } : null); return }
    const text = e instanceof Error ? e.message : String(e)
    if (isSessionError(text)) {
      setAdmin(a => ({ ...a, authed: false }))
      setFlash({ kind: 'err', text: '관리자 세션이 만료되었습니다. 다시 로그인해주세요.' })
    } else {
      setFlash({ kind: 'err', text })
    }
  }

  async function runMutation(fn, okText) {
    setBusy(true); setFlash(null)
    try {
      const res = await fn()
      setForm(null)
      if (res?.warn) setFlash({ kind: 'warn', text: (okText ? okText + ' · ' : '') + res.warn })
      else report(null, okText)
      load()
    } catch (e) {
      report(e)
      load()   // 부분 성공(메타 수정 후 파일 교체 실패 등)도 목록에 반영
    } finally {
      setBusy(false)
    }
  }

  const submitForm = ({ fields, file }) => {
    if (form.mode === 'add') return runMutation(() => createResource(fields, file), '자료를 추가했습니다.')
    if (form.mode === 'version') return runMutation(() => addResourceVersion(form.base, fields, file), '새 버전을 등록했습니다. "현재 자료로 지정"으로 노출 버전을 바꿔주세요.')
    // edit: 파일이 있으면 교체까지, 없으면 메타데이터만
    return runMutation(async () => {
      await updateResourceMeta(form.base.id, fields)
      if (file) return await replaceResourceFile(form.base, file)
      return null
    }, '자료를 수정했습니다.')
  }

  const doSetCurrent = (row) => {
    if (!window.confirm(`"${row.title}"을(를) 현재 자료로 지정합니다.\n같은 버전 그룹의 다른 자료는 자동으로 이전 자료가 됩니다.`)) return
    runMutation(() => setResourceCurrent(row.id), '현재 자료를 변경했습니다.')
  }

  const doDelete = (row) => {
    const warn = row.is_current
      ? `⚠️ "${row.title}"은(는) 현재 사용 중인 자료입니다.\n삭제하면 이 분류에 현재 자료가 없게 될 수 있습니다.\n가능하면 다른 버전을 먼저 "현재 자료로 지정"한 뒤 삭제하세요.\n\n그래도 삭제하시겠습니까?`
      : `"${row.title}"을(를) 삭제합니다. 파일도 함께 삭제되며 되돌릴 수 없습니다.\n계속하시겠습니까?`
    if (!window.confirm(warn)) return
    runMutation(() => deleteResource(row), '자료를 삭제했습니다.')
  }

  async function logout() {
    await signOutAdmin()
    setAdmin(a => ({ ...a, authed: false, email: null }))
    setFlash(null)
  }

  const title = <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', marginBottom: 8 }}>공식 자료 및 양식</div>

  const box = (children, tone) => (
    <div style={{
      fontSize: 12, color: tone === 'err' ? C.danger : C.muted,
      padding: '8px 12px', background: tone === 'err' ? '#FFF5F5' : C.bg,
      border: tone === 'err' ? '1px solid #FCC' : 'none', borderRadius: 8,
    }}>{children}</div>
  )

  // ── 관리자 스트립 ───────────────────────────────────────
  const adminStrip = isAdmin && admin.ready && (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      marginBottom: 10, padding: '7px 10px', background: '#F7F9FC',
      border: `1px solid ${C.border}`, borderRadius: 8,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>관리자</span>
      {canManage ? (
        <>
          <button onClick={() => setForm({ mode: 'add' })} style={stripBtn(C.navy, '#fff')}>+ 자료 추가</button>
          <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>{admin.email}</span>
          <button onClick={logout} style={stripBtn()}>로그아웃</button>
        </>
      ) : (
        <button onClick={() => setAuthOpen(true)} style={{ ...stripBtn(), marginLeft: 'auto' }}>자료 관리 로그인</button>
      )}
    </div>
  )

  const flashNode = flash && (
    <div style={{
      fontSize: 12, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px', marginBottom: 10,
      whiteSpace: 'pre-wrap',
      background: flash.kind === 'err' ? '#FFF5F5' : flash.kind === 'warn' ? '#FFF8E7' : '#E7F5EC',
      border: `1px solid ${flash.kind === 'err' ? '#FCC' : flash.kind === 'warn' ? '#F6C343' : '#B7E1C6'}`,
      color: flash.kind === 'err' ? C.dangerDark : flash.kind === 'warn' ? '#8A5A16' : '#1E7A46',
    }}>{flash.text}</div>
  )

  // ── 본문 ───────────────────────────────────────────────
  let body
  if (state.status === 'loading') body = box('불러오는 중...')
  else if (state.status === 'error') {
    body = (
      <div style={{ fontSize: 12.5, color: C.danger, padding: '10px 12px', background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8 }}>
        자료를 불러오지 못했습니다.
        <button onClick={load} style={{ marginLeft: 6, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}>다시 시도</button>
      </div>
    )
  } else if (state.rows.length === 0) {
    body = box('현재 등록된 공식 자료가 없습니다.')
  } else {
    const rows = state.rows
    const current = rows.filter(r => r.is_current)
    const old = rows.filter(r => !r.is_current)
    const usedOldIds = new Set()
    const olderOf = (r) => {
      if (!r.resource_key) return []
      const fam = old.filter(o => o.resource_key === r.resource_key)
      fam.forEach(o => usedOldIds.add(o.id))
      return fam
    }
    const orphanOld = () => old.filter(o => !usedOldIds.has(o.id))

    const cardProps = canManage
      ? { admin: true, onEdit: (r) => setForm({ mode: 'edit', base: r }), onNewVersion: (r) => setForm({ mode: 'version', base: r }), onSetCurrent: doSetCurrent, onDelete: doDelete }
      : {}

    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {TYPE_ORDER.map(t => {
          const group = current.filter(r => r.resource_type === t.key)
          if (group.length === 0) return null
          return (
            <div key={t.key}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.map(r => {
                  const olders = olderOf(r)
                  return (
                    <div key={r.id}>
                      <ResourceFileCard row={r} {...cardProps} />
                      {olders.length > 0 && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ fontSize: 11.5, color: C.muted, cursor: 'pointer', padding: '2px 0 2px 4px' }}>이전 버전 {olders.length}건</summary>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, paddingLeft: 12 }}>
                            {olders.map(o => <ResourceFileCard key={o.id} row={o} dim {...cardProps} />)}
                          </div>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {orphanOld().length > 0 && (
          <details>
            <summary style={{ fontSize: 12, color: C.muted, cursor: 'pointer', fontWeight: 600 }}>이전 자료 {orphanOld().length}건</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {orphanOld().map(o => <ResourceFileCard key={o.id} row={o} dim {...cardProps} />)}
            </div>
          </details>
        )}
      </div>
    )
  }

  return (
    <div>
      {title}
      {adminStrip}
      {flashNode}
      {body}

      <Modal open={authOpen} onClose={() => setAuthOpen(false)} title="자료 관리 로그인" width={420}>
        <ResourceAdminAuth onAuthed={(u) => {
          setAuthOpen(false)
          setAdmin({ ready: true, authed: true, email: u?.email || null })
          setFlash({ kind: 'ok', text: '자료 관리 관리자로 로그인했습니다.' })
        }} />
      </Modal>

      <Modal open={!!form} onClose={() => !busy && setForm(null)}
        title={form?.mode === 'add' ? '공식 자료 추가' : form?.mode === 'version' ? '새 버전 등록' : '자료 수정'} width={560}>
        {form && (
          <ResourceFileForm
            mode={form.mode} base={form.base} categoryKey={categoryKey} sectionKey={sectionKey}
            busy={busy} onSubmit={submitForm} onCancel={() => !busy && setForm(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function stripBtn(bg = C.white, color = C.textSub) {
  return {
    fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    background: bg, color, border: `1px solid ${bg === C.white ? C.border : bg}`,
    borderRadius: 6, padding: '4px 10px',
  }
}
