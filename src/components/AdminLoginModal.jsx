import { useState } from 'react'
import { C, Modal, inputStyle, labelStyle, btnPrimary, Icon } from '../design'
import { signInAdmin } from '../lib/adminAuth'

// 관리자 로그인 — Supabase Auth(이메일/비밀번호) + admin_users 등록 계정만 통과한다.
// 앱 일반 로그인(학번/생년월일/이름)과 별개이며, 관리자 화면·모든 관리자 write(DB의 public.is_admin())의
// 유일한 근거다. (예전의 "학생 계정 관리자 승격 + 공유 PIN" 방식은 폐기됨)
export default function AdminLoginModal({ open, onClose, onSuccess }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() { setPw(''); setError(''); setLoading(false); onClose() }

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError('')
    const r = await signInAdmin(email, pw)
    setLoading(false)
    if (!r.ok) { setError(r.error || '로그인에 실패했습니다.'); return }
    setPw('')
    onSuccess?.(r.user)
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="관리자 로그인" width={380}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          관리자 계정(이메일/비밀번호)으로 로그인하세요. 일반 로그인(학번·생년월일·이름)과는 별개입니다.
        </div>
        <div>
          <label style={labelStyle} htmlFor="admin-email">이메일</label>
          <input id="admin-email" style={{ ...inputStyle, fontSize: 16 }} type="email" autoComplete="username" value={email}
            onChange={e => { setEmail(e.target.value); setError('') }} autoFocus required />
        </div>
        <div>
          <label style={labelStyle} htmlFor="admin-pw">비밀번호</label>
          <input id="admin-pw" style={{ ...inputStyle, fontSize: 16 }} type="password" autoComplete="current-password" value={pw}
            onChange={e => { setPw(e.target.value); setError('') }} required />
        </div>
        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.dangerDark, background: C.dangerTint, padding: '8px 10px', borderRadius: 8 }}>
            <Icon name="error" size={14} color={C.dangerDark} />
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
          {loading ? '확인 중...' : '로그인'}
        </button>
      </form>
    </Modal>
  )
}
