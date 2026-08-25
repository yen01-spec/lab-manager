import { useState } from 'react'
import { C, Modal, inputStyle, labelStyle, btnPrimary, Icon } from '../design'
import { upgradeToAdmin, writeSession } from '../lib/session'

export default function AdminUpgradeModal({ open, onClose, student, onSuccess }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleClose() { setPin(''); setError(''); setLoading(false); onClose() }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!pin.trim()) return
    setLoading(true)
    setError('')
    try {
      const updated = await upgradeToAdmin({ student_id: student.student_id, pin })
      const session = {
        student_id: updated.student_id,
        name: updated.name,
        is_admin: updated.is_admin,
        is_super: updated.is_super,
      }
      writeSession(session)
      handleClose()
      onSuccess(session)
    } catch (err) {
      setError(err.message || '승격 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="관리자 승격" width={380}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          기존 관리자 비밀번호를 입력하면 <b>{student?.name}</b>님 계정이 관리자로 전환돼요. 다음부턴 학번+생년월일+이름+비밀번호로 로그인하시면 됩니다.
        </div>
        <div>
          <label style={labelStyle}>관리자 비밀번호</label>
          <input style={inputStyle} type="password" value={pin} onChange={e => { setPin(e.target.value); setError('') }} autoFocus />
        </div>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.dangerDark, background: C.dangerTint, padding: '8px 10px', borderRadius: 8 }}>
            <Icon name="error" size={14} color={C.dangerDark} />
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
          {loading ? '확인 중...' : '승격하기'}
        </button>
      </form>
    </Modal>
  )
}
