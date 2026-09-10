import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary, btnGhost } from '../../design'
import { getSetting, setSetting, SCHOOL_SAFETY_SYSTEM_FALLBACK } from '../../lib/appSettings'

// ══════════════════════════════════════════════
//  설정 — 관리자 비밀번호 / 실험실 규칙 / 안전 브리핑 / 알림(FCM) 토큰
//  (예전 SuperTab에서 슈퍼관리자 관련만 빼고 관리자 설정으로 통합)
// ══════════════════════════════════════════════
export default function SettingsTab() {
  const [adminPw, setAdminPw] = useState({ current: '', new1: '', new2: '' })
  const [tokenCount, setTokenCount] = useState(0)
  const [schoolUrl, setSchoolUrl] = useState('')
  const [schoolUrlSaved, setSchoolUrlSaved] = useState('')

  // 실험실 규칙
  const [rules, setRules] = useState([])
  const [newRule, setNewRule] = useState('')
  const [editingRule, setEditingRule] = useState(null) // { id, content }

  // 안전 브리핑
  const [briefings, setBriefings] = useState([])
  const [newBriefing, setNewBriefing] = useState('')
  const [editingBriefing, setEditingBriefing] = useState(null)

  useEffect(() => {
    fetchTokenCount()
    fetchRules()
    fetchBriefings()
    getSetting('school_safety_system_url', SCHOOL_SAFETY_SYSTEM_FALLBACK).then(v => { setSchoolUrl(v); setSchoolUrlSaved(v) })
  }, [])

  async function saveSchoolUrl() {
    const v = schoolUrl.trim()
    if (v && !/^https?:\/\//i.test(v)) { alert('http:// 또는 https:// 로 시작하는 주소를 입력해주세요'); return }
    const { error } = await setSetting('school_safety_system_url', v)
    if (error) { alert('저장 실패: ' + error.message + '\n(app_settings 테이블에 이 키를 추가할 권한이 없을 수 있어요)'); return }
    setSchoolUrlSaved(v)
    alert('저장되었습니다.')
  }

  async function fetchTokenCount() {
    const { count } = await supabase.from('fcm_tokens').select('*', { count: 'exact', head: true })
    setTokenCount(count || 0)
  }

  async function fetchRules() {
    const { data } = await supabase.from('lab_rules').select('*').order('order_no')
    if (data) setRules(data)
  }

  async function fetchBriefings() {
    const { data } = await supabase.from('safety_briefings').select('*').order('created_at', { ascending: false })
    if (data) setBriefings(data)
  }

  async function changeAdminPassword() {
    if (!adminPw.new1.trim()) { alert('새 비밀번호를 입력해주세요'); return }
    if (adminPw.new1 !== adminPw.new2) { alert('새 비밀번호가 일치하지 않습니다'); return }
    if (adminPw.new1.length < 6) { alert('비밀번호는 6자 이상이어야 합니다'); return }
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'admin_password').single()
    if (data?.value !== adminPw.current) { alert('현재 비밀번호가 틀렸습니다'); return }
    await supabase.from('app_settings').update({ value: adminPw.new1 }).eq('key', 'admin_password')
    await supabase.from('fcm_tokens').delete().eq('role', 'admin')
    alert('✅ 관리자 비밀번호가 변경되었습니다.\n기존 관리자 기기의 알림이 초기화되었어요.')
    setAdminPw({ current: '', new1: '', new2: '' })
    fetchTokenCount()
  }

  async function clearAllTokens() {
    if (!window.confirm('모든 FCM 토큰을 삭제하시겠습니까?\n모든 기기에서 알림이 초기화됩니다.')) return
    await supabase.from('fcm_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    alert('FCM 토큰이 초기화되었습니다.')
    fetchTokenCount()
  }

  // 실험실 규칙
  async function addRule() {
    if (!newRule.trim()) return
    const maxOrder = rules.length > 0 ? Math.max(...rules.map(r => r.order_no)) + 1 : 0
    await supabase.from('lab_rules').insert({ content: newRule.trim(), order_no: maxOrder })
    setNewRule('')
    fetchRules()
  }

  async function saveRule(id) {
    if (!editingRule?.content.trim()) return
    await supabase.from('lab_rules').update({ content: editingRule.content }).eq('id', id)
    setEditingRule(null)
    fetchRules()
  }

  async function deleteRule(id) {
    if (!window.confirm('규칙을 삭제하시겠습니까?')) return
    await supabase.from('lab_rules').delete().eq('id', id)
    fetchRules()
  }

  async function moveRule(id, direction) {
    const idx = rules.findIndex(r => r.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= rules.length) return
    const a = rules[idx], b = rules[swapIdx]
    await supabase.from('lab_rules').update({ order_no: b.order_no }).eq('id', a.id)
    await supabase.from('lab_rules').update({ order_no: a.order_no }).eq('id', b.id)
    fetchRules()
  }

  // 안전 브리핑
  async function addBriefing() {
    if (!newBriefing.trim()) return
    await supabase.from('safety_briefings').insert({ content: newBriefing.trim() })
    setNewBriefing('')
    fetchBriefings()
  }

  async function saveBriefing(id) {
    if (!editingBriefing?.content.trim()) return
    await supabase.from('safety_briefings').update({ content: editingBriefing.content }).eq('id', id)
    setEditingBriefing(null)
    fetchBriefings()
  }

  async function deleteBriefing(id) {
    if (!window.confirm('브리핑 문구를 삭제하시겠습니까?')) return
    await supabase.from('safety_briefings').delete().eq('id', id)
    fetchBriefings()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 실험실 규칙 편집 */}
      <Card title="📋 실험실 규칙 편집" sub="홈 화면에 표시됩니다">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            value={newRule}
            onChange={e => setNewRule(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addRule()}
            placeholder="새 규칙 입력 후 Enter"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addRule} style={{ ...btnPrimary, padding: '9px 18px' }}>추가</button>
        </div>
        {rules.length === 0
          ? <div style={{ color: C.muted, fontSize: '13px' }}>등록된 규칙이 없습니다.</div>
          : rules.map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 0', borderBottom: i < rules.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{
                minWidth: '22px', height: '22px', background: C.navy, color: '#fff',
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', flexShrink: 0,
              }}>{i + 1}</span>

              {editingRule?.id === r.id ? (
                <>
                  <input
                    value={editingRule.content}
                    onChange={e => setEditingRule({ ...editingRule, content: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                  <button onClick={() => saveRule(r.id)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: '12px' }}>저장</button>
                  <button onClick={() => setEditingRule(null)} style={{ ...btnGhost, padding: '5px 10px', fontSize: '12px' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', color: C.text }}>{r.content}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => moveRule(r.id, 'up')} disabled={i === 0}
                      style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: C.muted, fontSize: '14px', opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => moveRule(r.id, 'down')} disabled={i === rules.length - 1}
                      style={{ background: 'none', border: 'none', cursor: i === rules.length - 1 ? 'default' : 'pointer', color: C.muted, fontSize: '14px', opacity: i === rules.length - 1 ? 0.3 : 1 }}>↓</button>
                    <button onClick={() => setEditingRule({ id: r.id, content: r.content })}
                      style={{ ...btnGhost, padding: '3px 10px', fontSize: '12px' }}>수정</button>
                    <button onClick={() => deleteRule(r.id)}
                      style={{ background: '#FFF5F5', color: C.danger, border: `1px solid #FC8181`, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
                  </div>
                </>
              )}
            </div>
          ))}
      </Card>

      {/* 안전 브리핑 편집 */}
      <Card title="📢 안전 브리핑 문구 편집" sub="홈 화면에서 10초마다 랜덤 전환됩니다">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            value={newBriefing}
            onChange={e => setNewBriefing(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBriefing()}
            placeholder="새 브리핑 문구 입력 후 Enter"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={addBriefing} style={{ ...btnPrimary, padding: '9px 18px' }}>추가</button>
        </div>
        {briefings.length === 0
          ? <div style={{ color: C.muted, fontSize: '13px' }}>등록된 브리핑 문구가 없습니다.</div>
          : briefings.map((b, i) => (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 0', borderBottom: i < briefings.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontSize: '16px' }}>📢</span>
              {editingBriefing?.id === b.id ? (
                <>
                  <input
                    value={editingBriefing.content}
                    onChange={e => setEditingBriefing({ ...editingBriefing, content: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                    autoFocus
                  />
                  <button onClick={() => saveBriefing(b.id)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: '12px' }}>저장</button>
                  <button onClick={() => setEditingBriefing(null)} style={{ ...btnGhost, padding: '5px 10px', fontSize: '12px' }}>취소</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', color: C.text, lineHeight: 1.5 }}>{b.content}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => setEditingBriefing({ id: b.id, content: b.content })}
                      style={{ ...btnGhost, padding: '3px 10px', fontSize: '12px' }}>수정</button>
                    <button onClick={() => deleteBriefing(b.id)}
                      style={{ background: '#FFF5F5', color: C.danger, border: `1px solid #FC8181`, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
                  </div>
                </>
              )}
            </div>
          ))}
      </Card>

      {/* 학교 시스템 URL */}
      <Card title="🔗 강원대학교 연구실안전관리시스템 URL" sub="자료 탭의 '학교 시스템 열기' 버튼이 이 주소로 연결됩니다">
        <div style={{ display: 'flex', gap: '8px', maxWidth: '560px' }}>
          <input value={schoolUrl} onChange={e => setSchoolUrl(e.target.value)}
            placeholder="https://safety.kangwon.ac.kr/" style={{ ...inputStyle, flex: 1 }} />
          <button onClick={saveSchoolUrl} disabled={schoolUrl.trim() === schoolUrlSaved}
            style={{ ...btnPrimary, padding: '9px 18px', opacity: schoolUrl.trim() === schoolUrlSaved ? 0.5 : 1 }}>저장</button>
        </div>
        <div style={{ fontSize: '11px', color: C.muted, marginTop: '6px' }}>
          비워두면 기본값({SCHOOL_SAFETY_SYSTEM_FALLBACK})이 쓰입니다. URL만 바꾸면 재배포 없이 즉시 반영됩니다.
        </div>
      </Card>

      {/* 관리자 비밀번호 변경 */}
      <Card title="🔑 관리자 비밀번호 변경" sub="변경 시 관리자 기기의 알림(FCM) 토큰도 초기화됩니다">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px' }}>
          <div><label style={labelStyle}>현재 비밀번호</label>
            <input type="password" value={adminPw.current} onChange={e => setAdminPw({ ...adminPw, current: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>새 비밀번호 (6자 이상)</label>
            <input type="password" value={adminPw.new1} onChange={e => setAdminPw({ ...adminPw, new1: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>새 비밀번호 확인</label>
            <input type="password" value={adminPw.new2} onChange={e => setAdminPw({ ...adminPw, new2: e.target.value })} style={inputStyle} /></div>
          <button onClick={changeAdminPassword} style={{ ...btnPrimary }}>변경</button>
        </div>
      </Card>

      {/* FCM 토큰 관리 */}
      <Card title="🔔 알림(FCM) 토큰 관리">
        <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>
          현재 등록된 알림 토큰: <strong style={{ color: C.navy }}>{tokenCount}개</strong>
        </div>
        <div style={{ padding: '12px 16px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
          ⚠️ 비밀번호 변경 시 자동으로 토큰이 초기화됩니다. 수동으로 초기화가 필요한 경우에만 아래 버튼을 사용하세요.
        </div>
        <button onClick={clearAllTokens} style={{ ...btnPrimary, background: '#D63031' }}>🗑️ 전체 토큰 초기화</button>
      </Card>

    </div>
  )
}
