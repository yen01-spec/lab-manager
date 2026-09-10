import { useState } from 'react'
import { C } from '../../design'
import { signInAdmin } from '../../lib/adminAuth'

// 자료 CMS 관리자 로그인 폼 (Phase 5-h2b). 앱 일반 로그인과 완전히 별개 —
// 여기서 성공한 Supabase Auth 세션(lm_admin_auth) 만 resource_files write 를 통과시킨다.
export default function ResourceAdminAuth({ onAuthed }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    const r = await signInAdmin(email, pw)
    setBusy(false)
    if (!r.ok) { setErr(r.error || '로그인에 실패했습니다.'); return }
    setPw('')
    onAuthed?.(r.user)
  }

  const field = {
    width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
    fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        공식 자료를 추가·수정·삭제하려면 자료관리 관리자 계정으로 로그인하세요.
        이 로그인은 앱의 일반 로그인과 별개이며, 자료 write 권한에만 사용됩니다.
      </div>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: C.textSub }}>
        이메일
        <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}
          required style={{ ...field, marginTop: 4 }} />
      </label>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: C.textSub }}>
        비밀번호
        <input type="password" autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)}
          required style={{ ...field, marginTop: 4 }} />
      </label>
      {err && (
        <div style={{ fontSize: 12, color: C.danger, background: '#FFF5F5', border: '1px solid #FCC', borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
          {err}
        </div>
      )}
      <button type="submit" disabled={busy} style={{
        marginTop: 2, padding: '9px 14px', borderRadius: 8, border: 'none',
        background: busy ? C.muted : C.navy, color: '#fff', fontSize: 13, fontWeight: 700,
        fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
      }}>{busy ? '확인 중...' : '로그인'}</button>
    </form>
  )
}
