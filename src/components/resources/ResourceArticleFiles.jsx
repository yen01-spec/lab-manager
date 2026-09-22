import { useEffect, useState, useCallback } from 'react'
import { C, Modal, inputStyle, labelStyle, btnPrimary, btnGhost } from '../../design'
import { getArticleFiles, createArticleFile, deleteResource, RESOURCE_UPLOAD_HELP } from '../../lib/resources'
import { signOutAdmin } from '../../lib/adminAuth'
import { useAdminSession } from '../../hooks/useAdminSession'
import ResourceFileCard from './ResourceFileCard'
import ResourceAdminAuth from './ResourceAdminAuth'

// 자료실 글 하나의 첨부파일 — 단순 업로드(파일 + 표시 제목만)와 삭제만 지원한다(복잡한 버전/유형
// 관리 UI는 감춤). 기존(legacy category_key/section_key 시절) 파일의 메타데이터는 그대로 보존해
// ResourceFileCard로 똑같이 보여준다 — 관리자 액션만 "삭제"로 단순화한다.
const isSessionError = (msg) => /jwt|expired|만료|401|not authorized|권한이 없습니다/i.test(msg || '')

export default function ResourceArticleFiles({ articleId, isAdmin = false, initialRows }) {
  // initialRows(부모 Resources.jsx가 이미 한 번에 가져온 결과)는 useState의 lazy initializer로
  // 딱 한 번만 읽는다 — effect 안에서 "이미 썼는지" ref로 추적하던 예전 설계는 dev StrictMode의
  // mount→cleanup→mount 이중 effect 호출에서 "이미 처리했다"고 잘못 읽혀 오히려 매번 실제 조회
  // 분기로 빠지는 역설(글 30개 = 매 로드마다 개별 resource_files 요청 30번, STEP28 네트워크 감사로
  // 발견)이 있었다. lazy initializer는 StrictMode에서도 컴포넌트당 정확히 한 번만 호출되므로 안전.
  const [state, setState] = useState(() => (initialRows ? { status: 'ok', rows: initialRows } : { status: 'loading', rows: [] }))
  const adminSession = useAdminSession()
  const admin = { ready: !isAdmin || adminSession.ready, authed: adminSession.authed, email: adminSession.email }
  const [authOpen, setAuthOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addFile, setAddFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(null)

  // 실제 조회(항상 서버에서 새로 가져옴) — 추가/삭제 후 새로고침, "다시 시도" 버튼, mount 시
  // fallback(초기 데이터가 없을 때)에서 쓴다. 'loading' 전환까지 마이크로태스크로 미뤄서(effect
  // 본문에서 곧장 setState를 부르지 않게) react-hooks/set-state-in-effect를 우회 — 어차피 네트워크
  // 지연에 비하면 무의미한 지연이고, 클릭 핸들러(다시 시도/추가/삭제)에서 부를 때는 원래도 동기 호출이
  // 아니었다.
  const refresh = useCallback(() => {
    if (!articleId) return
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      setState({ status: 'loading', rows: [] })
      getArticleFiles(articleId)
        .then(rows => { if (alive) setState({ status: 'ok', rows }) })
        .catch(() => { if (alive) setState({ status: 'error', rows: [] }) })
    })
    return () => { alive = false }
  }, [articleId])

  // initialRows가 없을 때만(드문 fallback 경로) mount 시 조회 — lazy initializer가 이미
  // 'ok' 상태를 채워준 경우는 아무것도 하지 않는다.
  useEffect(() => {
    if (!initialRows) return refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId])

  const canManage = isAdmin && admin.authed

  function report(e, okText) {
    if (!e) { setFlash(okText ? { kind: 'ok', text: okText } : null); return }
    const text = e instanceof Error ? e.message : String(e)
    if (isSessionError(text)) {
      adminSession.refresh()
      setFlash({ kind: 'err', text: '관리자 세션이 만료되었습니다. 다시 로그인해주세요.' })
    } else {
      setFlash({ kind: 'err', text })
    }
  }

  async function runMutation(fn, okText) {
    setBusy(true); setFlash(null)
    try {
      const res = await fn()
      if (res?.warn) setFlash({ kind: 'warn', text: (okText ? okText + ' · ' : '') + res.warn })
      else report(null, okText)
      refresh()
      return true
    } catch (e) {
      report(e)
      refresh()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function submitAdd() {
    if (!addFile) { setFlash({ kind: 'err', text: '파일을 선택해주세요.' }); return }
    const ok = await runMutation(() => createArticleFile(articleId, addFile, addTitle), '파일을 추가했습니다.')
    if (ok) { setAddOpen(false); setAddTitle(''); setAddFile(null) }
  }

  function doDelete(row) {
    if (!window.confirm(`"${row.title}"을(를) 삭제합니다. 되돌릴 수 없습니다.\n계속하시겠습니까?`)) return
    runMutation(() => deleteResource(row), '파일을 삭제했습니다.')
  }

  async function logout() {
    await signOutAdmin()
    adminSession.refresh()
    setFlash(null)
  }

  const box = (children, tone) => (
    <div style={{
      fontSize: 12, color: tone === 'err' ? C.danger : C.muted,
      padding: '8px 12px', background: tone === 'err' ? '#FFF5F5' : C.bg,
      border: tone === 'err' ? '1px solid #FCC' : 'none', borderRadius: 8,
    }}>{children}</div>
  )

  const adminStrip = isAdmin && admin.ready && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '7px 10px', background: '#F7F9FC', border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>관리자</span>
      {canManage ? (
        <>
          <button onClick={() => setAddOpen(true)} style={stripBtn(C.navy, '#fff')}>+ 파일 추가</button>
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
      fontSize: 12, lineHeight: 1.5, borderRadius: 8, padding: '8px 10px', marginBottom: 10, whiteSpace: 'pre-wrap',
      background: flash.kind === 'err' ? '#FFF5F5' : flash.kind === 'warn' ? '#FFF8E7' : '#E7F5EC',
      border: `1px solid ${flash.kind === 'err' ? '#FCC' : flash.kind === 'warn' ? '#F6C343' : '#B7E1C6'}`,
      color: flash.kind === 'err' ? C.dangerDark : flash.kind === 'warn' ? '#8A5A16' : '#1E7A46',
    }}>{flash.text}</div>
  )

  let body
  if (state.status === 'loading') body = box('불러오는 중...')
  else if (state.status === 'error') {
    body = (
      <div style={{ fontSize: 12.5, color: C.danger, padding: '10px 12px', background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8 }}>
        첨부파일을 불러오지 못했습니다.
        <button onClick={refresh} style={{ marginLeft: 6, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit' }}>다시 시도</button>
      </div>
    )
  } else if (state.rows.length === 0) {
    body = canManage ? null : box('첨부파일이 없습니다.')
  } else {
    const cardProps = canManage ? { admin: true, onDelete: doDelete } : {}
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {state.rows.map(r => <ResourceFileCard key={r.id} row={r} {...cardProps} />)}
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', marginBottom: 8 }}>첨부파일</div>
      {adminStrip}
      {flashNode}
      {body}

      <Modal open={authOpen} onClose={() => setAuthOpen(false)} title="자료 관리 로그인" width={420}>
        <ResourceAdminAuth onAuthed={() => { setAuthOpen(false); adminSession.refresh(); setFlash({ kind: 'ok', text: '자료 관리 관리자로 로그인했습니다.' }) }} />
      </Modal>

      <Modal open={addOpen} onClose={() => !busy && setAddOpen(false)} title="파일 추가" width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label htmlFor="article-file-input" style={labelStyle}>파일 *</label>
            <input id="article-file-input" type="file" onChange={e => setAddFile(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: '6px 8px' }} />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{RESOURCE_UPLOAD_HELP}</div>
          </div>
          <div>
            <label htmlFor="article-file-title" style={labelStyle}>표시 제목(선택, 비우면 파일명 사용)</label>
            <input id="article-file-title" value={addTitle} onChange={e => setAddTitle(e.target.value)} placeholder={addFile?.name || ''} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => !busy && setAddOpen(false)} disabled={busy} style={{ ...btnGhost, flex: 1, minHeight: 40 }}>취소</button>
            <button onClick={submitAdd} disabled={busy} style={{ ...btnPrimary, flex: 1, minHeight: 40, opacity: busy ? 0.6 : 1 }}>{busy ? '처리 중...' : '추가'}</button>
          </div>
        </div>
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
