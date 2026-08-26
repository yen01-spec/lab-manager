import { useState, useRef } from 'react'
import { C, inputStyle, labelStyle, btnPrimary, btnGhost, Icon } from '../design'
import { lookupStudent, registerStudent, loginAdmin, writeSession } from '../lib/session'

const EMPTY_FORM = { student_id: '', birth_date: '', name: '', password: '' }

// 연도 4자리 입력 시 월로, 월 입력(1자리 완결 또는 2자리) 시 일로 자동 이동하는 생년월일 입력.
// Modal이 닫힐 때 언마운트되므로(재오픈 시 새로 마운트) 초기값만 반영하면 충분하다.
function BirthDateInput({ value, onChange }) {
  const initParts = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-') : ['', '', '']
  const [year, setYear] = useState(initParts[0])
  const [month, setMonth] = useState(initParts[1])
  const [day, setDay] = useState(initParts[2])
  const yearRef = useRef(null)
  const monthRef = useRef(null)
  const dayRef = useRef(null)

  function emit(y, m, d) {
    onChange(y.length === 4 && m.length === 2 && d.length === 2 ? `${y}-${m}-${d}` : '')
  }

  function handleYear(e) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4)
    setYear(v)
    emit(v, month, day)
    if (v.length === 4) monthRef.current?.focus()
  }
  function handleMonth(e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (v.length === 1 && Number(v) >= 2) v = '0' + v
    setMonth(v)
    emit(year, v, day)
    if (v.length === 2) dayRef.current?.focus()
  }
  function handleDay(e) {
    let v = e.target.value.replace(/\D/g, '').slice(0, 2)
    if (v.length === 1 && Number(v) >= 4) v = '0' + v
    setDay(v)
    emit(year, month, v)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input ref={yearRef} value={year} onChange={handleYear} placeholder="YYYY" inputMode="numeric"
        style={{ ...inputStyle, width: 72, textAlign: 'center' }} />
      <span style={{ color: C.muted }}>-</span>
      <input ref={monthRef} value={month} onChange={handleMonth}
        onKeyDown={e => { if (e.key === 'Backspace' && !month) yearRef.current?.focus() }}
        placeholder="MM" inputMode="numeric" style={{ ...inputStyle, width: 52, textAlign: 'center' }} />
      <span style={{ color: C.muted }}>-</span>
      <input ref={dayRef} value={day} onChange={handleDay}
        onKeyDown={e => { if (e.key === 'Backspace' && !day) monthRef.current?.focus() }}
        placeholder="DD" inputMode="numeric" style={{ ...inputStyle, width: 52, textAlign: 'center' }} />
    </div>
  )
}

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

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div style={{
        width: '100%', maxWidth: 860, display: 'grid', gridTemplateColumns: '1fr 1fr',
        background: C.white, border: `1px solid ${C.border}`, borderRadius: 16,
        boxShadow: '0 24px 64px rgba(16,24,40,.2)', overflow: 'hidden', position: 'relative',
      }}>
        <button onClick={handleClose} style={{
          position: 'absolute', top: 14, right: 14, background: 'rgba(16,24,40,0.06)', border: 'none',
          borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: C.muted, fontSize: 16, zIndex: 2,
        }}>×</button>

        {/* 왼쪽 브랜드 패널 */}
        <div style={{
          background: C.navy, padding: '48px 40px', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="science" size={18} color="#fff" />
            </div>
            <div style={{ lineHeight: 1.25 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>연구실 시약관리 시스템</div>
              <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '1.4px', color: '#8497B8' }}>LAB CHEMICAL MANAGEMENT</div>
            </div>
          </div>
          <div style={{ margin: '48px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.3px' }}>
              찾기 → 확인하기 →<br />최신 상태로 남기기
            </div>
            <div style={{ fontSize: 12.5, color: '#A9B7CF', marginTop: 12, lineHeight: 1.6 }}>
              학번과 생년월일로 간편하게 접속하고,<br />재고실사·구매요청을 빠르게 처리하세요.
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#7889A4' }}>강원대학교 과학교육학부 연구실</div>
        </div>

        {/* 오른쪽 로그인 폼 */}
        <div style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {step === 'id_entry' ? (
            <>
              <div style={{ display: 'flex', background: C.bg, borderRadius: 10, padding: 3, gap: 2 }}>
                <button type="button" onClick={() => setShowPassword(false)} style={{
                  flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: !showPassword ? C.white : 'transparent',
                  boxShadow: !showPassword ? '0 1px 3px rgba(16,24,40,.06)' : 'none',
                  fontSize: 13, fontWeight: !showPassword ? 700 : 600, color: !showPassword ? C.blueDark : C.muted,
                  fontFamily: 'inherit',
                }}>일반 로그인</button>
                <button type="button" onClick={() => setShowPassword(true)} style={{
                  flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: showPassword ? C.white : 'transparent',
                  boxShadow: showPassword ? '0 1px 3px rgba(16,24,40,.06)' : 'none',
                  fontSize: 13, fontWeight: showPassword ? 700 : 600, color: showPassword ? C.blueDark : C.muted,
                  fontFamily: 'inherit',
                }}>관리자 로그인</button>
              </div>

              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.navyDeep, letterSpacing: '-0.3px' }}>로그인</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>학번·생년월일·이름으로 접속합니다. 처음이면 자동으로 등록돼요.</div>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>학번</label>
                  <input style={inputStyle} value={form.student_id} onChange={e => update('student_id', e.target.value)} placeholder="예) 202112345" autoFocus />
                </div>
                <div>
                  <label style={labelStyle}>생년월일</label>
                  <BirthDateInput value={form.birth_date} onChange={v => update('birth_date', v)} />
                </div>
                <div>
                  <label style={labelStyle}>이름</label>
                  <input style={inputStyle} value={form.name} onChange={e => update('name', e.target.value)} placeholder="예) 이OO" />
                </div>

                {showPassword && (
                  <div>
                    <label style={labelStyle}>관리자 비밀번호</label>
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="error" size={15} color="#C77B1E" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                  등록된 정보와 다르면 로그인되지 않아요. 본인이 맞다면 관리자에게 문의하세요.
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center', flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.navyDeep }}>신규 등록 확인</div>
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
        </div>
      </div>
    </div>
  )
}
