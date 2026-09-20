import { useState } from 'react'
import { C } from '../../design'
import { signInAdmin, signOutAdmin } from '../../lib/adminAuth'

// 관리자 Supabase Auth 로그인 배너 — 요청 승인/반려 등 "관리자 write"는 이 로그인이 있어야 통과한다.
// (앱 일반 로그인·학생 관리자 승격과 별개. DB가 public.is_admin()으로 최종 검증한다.)
export default function AdminAuthBanner({ session, purpose = '요청을 처리' }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!session.ready) return <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>관리자 로그인 상태 확인 중…</div>

  if (session.authed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, fontSize: 12.5, color: '#1E7A46', fontWeight: 700 }}>
        ✓ 관리자 로그인됨 · {session.email}
        <button onClick={async () => { await signOutAdmin(); session.refresh() }}
          style={{ border: `1px solid ${C.border}`, background: C.white, borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: C.text }}>로그아웃</button>
      </div>
    )
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    const r = await signInAdmin(email, pw)
    setBusy(false)
    if (!r.ok) { setErr(r.error || '로그인에 실패했습니다.'); return }
    setPw('')
    session.refresh()
  }
  const field = { padding: '9px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 16, fontFamily: 'inherit', minWidth: 0, flex: '1 1 160px' }
  return (
    <form onSubmit={submit} style={{ marginBottom: 16, padding: '12px 14px', background: '#FFF9E6', border: '1px solid #F0DFA0', borderRadius: 10 }}>
      <div style={{ fontSize: 12.5, color: C.text, marginBottom: 8, lineHeight: 1.6 }}>
        🔐 {purpose}하려면 <b>관리자 계정(Supabase 로그인)</b>이 필요합니다. 앱 일반 로그인과는 별개입니다.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="email" autoComplete="username" placeholder="관리자 이메일" aria-label="관리자 이메일" value={email} onChange={e => setEmail(e.target.value)} required style={field} />
        <input type="password" autoComplete="current-password" placeholder="비밀번호" aria-label="비밀번호" value={pw} onChange={e => setPw(e.target.value)} required style={field} />
        <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: busy ? C.muted : C.navy, color: '#fff', fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer' }}>{busy ? '확인 중…' : '로그인'}</button>
      </div>
      {err && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: C.danger }}>{err}</div>}
    </form>
  )
}
