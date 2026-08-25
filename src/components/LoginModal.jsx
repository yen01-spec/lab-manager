import { useState } from 'react'
import { C, Modal, inputStyle, labelStyle, btnPrimary, btnGhost, Icon } from '../design'
import { lookupStudent, registerStudent, loginAdmin, writeSession } from '../lib/session'

const EMPTY_FORM = { student_id: '', birth_date: '', name: '', password: '' }

export default function LoginModal({ open, onClose, onSuccess }) {
  const [step, setStep] = useState('id_entry') // 'id_entry' | 'confirm_new'
  const [form, setForm] = useState(EMPTY_FORM)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() {
    setStep('id_entry'); setForm(EMPTY_FORM); setShowPassword(false); setError(''); setLoading(false)
  }
  function handleClose() { reset(); onClose() }

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setError('')
  }

  function finish(session) {
    writeSession(session)
    reset()
    onSuccess(session)
    onClose()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.student_id.trim() || !form.birth_date.trim() || !form.name.trim()) {
      setError('학번·생년월일·이름을 모두 입력하세요'); return
    }
    setLoading(true)
    setError('')
    try {
      if (showPassword && form.password.trim()) {
        const session = await loginAdmin({
          student_id: form.student_id.trim(),
          birth_date: form.birth_date.trim(),
          name: form.name.trim(),
          password: form.password,
        })
        finish(session)
        return
      }

      const student = await lookupStudent(form.student_id.trim())
      if (!student) {
        setStep('confirm_new')
        return
      }
      if (student.name !== form.name.trim() || student.birth_date !== form.birth_date.trim()) {
        setError('등록된 정보와 다릅니다. 본인이 맞다면 관리자에게 문의하세요')
        return
      }
      // 비밀번호 없이 로그인 — 관리자 권한이 있어도 이번 세션은 일반 사용자로 시작
      finish({ student_id: student.student_id, name: student.name, is_admin: false, is_super: false })
    } catch (err) {
      setError(err.message || '처리 중 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmRegister() {
    setLoading(true)
    setError('')
    try {
      const student = await registerStudent({
        student_id: form.student_id.trim(),
        birth_date: form.birth_date.trim(),
        name: form.name.trim(),
      })
      finish({ student_id: student.student_id, name: student.name, is_admin: false, is_super: false })
    } catch (err) {
      setError(err.message || '등록 중 오류가 발생했습니다')
      setStep('id_entry')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={step === 'confirm_new' ? '신규 등록 확인' : '로그인'} width={420}>
      {step === 'id_entry' ? (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: C.muted }}>학번·생년월일·이름으로 접속합니다. 처음이면 자동으로 등록돼요.</div>

          <div>
            <label style={labelStyle}>학번</label>
            <input style={inputStyle} value={form.student_id} onChange={e => update('student_id', e.target.value)} placeholder="예) 202112345" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>생년월일</label>
            <input style={inputStyle} type="date" value={form.birth_date} onChange={e => update('birth_date', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>이름</label>
            <input style={inputStyle} value={form.name} onChange={e => update('name', e.target.value)} placeholder="예) 이OO" />
          </div>

          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}
          >
            {showPassword ? '− 관리자 비밀번호 접기' : '+ 관리자이신가요?'}
          </button>

          {showPassword && (
            <div>
              <label style={labelStyle}>비밀번호</label>
              <input style={inputStyle} type="password" value={form.password} onChange={e => update('password', e.target.value)} placeholder="관리자 승격 시 설정한 비밀번호" />
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.dangerDark, background: C.dangerTint, padding: '8px 10px', borderRadius: 8 }}>
              <Icon name="error" size={14} color={C.dangerDark} />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6 }}>
            <b>{form.name}</b>님(학번: {form.student_id}, 생년월일: {form.birth_date})이 맞으신가요?
          </div>
          {error && (
            <div style={{ fontSize: 11.5, color: C.dangerDark, background: C.dangerTint, padding: '8px 10px', borderRadius: 8 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('id_entry')} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>아니요</button>
            <button onClick={handleConfirmRegister} disabled={loading} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', opacity: loading ? 0.6 : 1 }}>
              {loading ? '등록 중...' : '예, 맞습니다'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
