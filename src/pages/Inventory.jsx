import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, btnPrimary, btnGhost, inputStyle, labelStyle, thStyle, tdStyle } from '../design'

function ZoneBadge({ status }) {
  const map = {
    pending:     { label: '대기중', bg: '#FFF3E0', color: '#E65100' },
    in_progress: { label: '진행중', bg: '#E3F2FD', color: '#1565C0' },
    done:        { label: '완료',   bg: '#E8F5E9', color: '#2E7D32' },
  }
  const s = map[status] || { label: status, bg: '#F5F5F5', color: '#616161' }
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
      {s.label}
    </span>
  )
}

function ZoneProgressCard({ zone, members, zoneProgress, onComplete, isAdmin }) {
  const info = zoneProgress[zone] || { total: 0, done: 0 }
  const pct = info.total > 0 ? Math.round(info.done / info.total * 100) : 0
  const isCompleted = members.every(a => a.completed_at)
  const allDone = pct === 100 && info.total > 0
  const started = info.done > 0

  const badgeStyle = isCompleted
    ? { bg: '#E8F5E9', color: '#2E7D32', label: '✅ 완료확정' }
    : allDone
    ? { bg: '#C8E6C9', color: '#1B5E20', label: '입력완료' }
    : started
    ? { bg: '#E3F2FD', color: '#1565C0', label: '진행중' }
    : { bg: '#FFF3E0', color: '#E65100', label: '대기중' }

  const barColor = isCompleted || allDone ? '#38A169' : started ? C.navy : C.border

  return (
    <div style={{ background: C.white, border: `1px solid ${allDone ? '#A5D6A7' : C.border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>📍 {zone}</div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>담당자 {members.length}명</div>
        </div>
        <span style={{ background: badgeStyle.bg, color: badgeStyle.color, fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '12px' }}>
          {badgeStyle.label}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {members.map(a => (
          <span key={a.id} style={{ fontSize: '11px', color: C.text, background: C.bg, border: `1px solid ${C.border}`, padding: '3px 10px', borderRadius: '20px' }}>
            👤 {a.assigned_to}
          </span>
        ))}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px' }}>
          <span style={{ color: C.muted }}>진행률</span>
          <span style={{ fontWeight: '700', color: isCompleted ? '#2E7D32' : allDone ? '#1B5E20' : C.navy }}>
            {info.done} / {info.total}개 ({pct}%)
          </span>
        </div>
        <div style={{ height: '6px', background: C.bg, borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '3px', background: barColor, width: `${pct}%`, transition: 'width 0.4s ease' }} />
        </div>
      </div>
      {isAdmin && !isCompleted && (
        <button onClick={onComplete} disabled={!allDone} style={{
          padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700',
          border: `1px solid ${allDone ? '#38A169' : C.border}`,
          background: allDone ? '#E8F5E9' : C.bg,
          color: allDone ? '#2E7D32' : C.muted,
          cursor: allDone ? 'pointer' : 'not-allowed',
        }}>
          {allDone ? '✅ 구역 완료 처리' : '⏳ 입력 완료 후 확정 가능'}
        </button>
      )}
      {isCompleted && (
        <div style={{ fontSize: '11px', color: '#2E7D32', textAlign: 'center' }}>
          {new Date(members[0].completed_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 완료확정
        </div>
      )}
    </div>
  )
}

export default function Inventory() {
  const { isAdmin } = useOutletContext?.() || {}
  const [view, setView] = useState('main')
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [locations, setLocations] = useState([])
  const [myName, setMyName] = useState(() => localStorage.getItem('inventory_user_name') || '')
  const [myAssignments, setMyAssignments] = useState([])
  const [startForm, setStartForm] = useState({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '' })
  const [showStartModal, setShowStartModal] = useState(false)
  const [assignForm, setAssignForm] = useState({ zone: '', assigned_to: '' })
  const [progress, setProgress] = useState({ total: 0, done: 0 })
  const [zoneProgress, setZoneProgress] = useState({})
  const [pausing, setPausing] = useState(false)

  useEffect(() => { fetchSessions(); fetchLocations() }, [])

  useEffect(() => {
    if (activeSession) {
      fetchAssignments()
      fetchProgress()
      const channel = supabase.channel('inventory_counts_' + activeSession.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_counts', filter: `session_id=eq.${activeSession.id}` }, () => {
          fetchProgress(); fetchZoneProgress()
        })
        .subscribe()
      return () => supabase.removeChannel(channel)
    }
  }, [activeSession])

  useEffect(() => {
    if (activeSession && assignments.length > 0) fetchZoneProgress()
  }, [assignments])

  async function fetchSessions() {
    const { data } = await supabase.from('inventory_sessions').select('*').order('created_at', { ascending: false })
    if (data) {
      setSessions(data)
      const active = data.find(s => s.status === 'active' || s.status === 'paused')
      if (active) setActiveSession(active)
    }
  }

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchAssignments() {
    if (!activeSession) return
    const { data } = await supabase.from('inventory_assignments').select('*').eq('session_id', activeSession.id).order('zone')
    if (data) setAssignments(data)
  }

  async function fetchProgress() {
    if (!activeSession) return
    const { count: total } = await supabase.from('inventory_counts').select('*', { count: 'exact', head: true }).eq('session_id', activeSession.id)
    const { count: done } = await supabase.from('inventory_counts').select('*', { count: 'exact', head: true }).eq('session_id', activeSession.id).not('actual_sealed', 'is', null)
    setProgress({ total: total || 0, done: done || 0 })
  }

  async function fetchZoneProgress() {
    if (!activeSession) return
    const { data: counts } = await supabase.from('inventory_counts')
      .select('lot_id, actual_sealed, reagent_lots(reagents(locations(room, detail)))')
      .eq('session_id', activeSession.id)
    if (!counts) return
    const zones = [...new Set(assignments.map(a => a.zone))]
    const result = {}
    for (const zone of zones) {
      const isAlpha = /^[A-Z]-[A-Z]$/.test(zone)
      const zoneItems = counts.filter(c => {
        const loc = c.reagent_lots?.reagents?.locations
        if (isAlpha) return true
        return loc?.detail === zone || loc?.room === zone
      })
      result[zone] = { total: zoneItems.length, done: zoneItems.filter(c => c.actual_sealed != null).length }
    }
    setZoneProgress(result)
  }

  async function startSession() {
    if (!startForm.created_by.trim()) { alert('관리자 이름을 입력해주세요'); return }
    if (!startForm.start_date) { alert('날짜를 선택해주세요'); return }
    const { data } = await supabase.from('inventory_sessions').insert({
      year: startForm.year, start_date: startForm.start_date, created_by: startForm.created_by, label: startForm.label.trim() || null,
    }).select().single()
    if (data) {
      const { data: lots } = await supabase.from('reagent_lots').select('id, reagent_id, sealed_count, current_stock, reagents(locations(room, detail))')
      if (lots) {
        let filtered = lots
        if (startForm.zones && startForm.zones.length > 0) {
          filtered = lots.filter(l => {
            const room = l.reagents?.locations?.room || ''
            const detail = l.reagents?.locations?.detail || ''
            return startForm.zones.some(z => room === z || detail === z)
          })
        }
        const rows = filtered.map(l => ({ session_id: data.id, reagent_id: l.reagent_id, lot_id: l.id, book_sealed: l.sealed_count, book_stock: l.current_stock }))
        for (let i = 0; i < rows.length; i += 100) await supabase.from('inventory_counts').insert(rows.slice(i, i + 100))
        setActiveSession(data)
        setShowStartModal(false)
        setStartForm({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', zones: [] })
        fetchSessions(); fetchAssignments(); fetchProgress()
        alert(`실사가 시작되었습니다! 총 ${rows.length}개 Lot`)
      }
    }
  }

  async function addAssignment() {
    if (!assignForm.zone || !assignForm.assigned_to.trim()) { alert('구역과 담당자를 입력해주세요'); return }
    const exists = assignments.find(a => a.zone === assignForm.zone && a.assigned_to === assignForm.assigned_to)
    if (exists) { alert('이미 배정된 담당자입니다'); return }
    await supabase.from('inventory_assignments').insert({ session_id: activeSession.id, zone: assignForm.zone, assigned_to: assignForm.assigned_to })
    setAssignForm({ ...assignForm, assigned_to: '' })
    fetchAssignments()
  }

  async function deleteAssignment(id) {
    if (!window.confirm('배정을 삭제하시겠습니까?')) return
    await supabase.from('inventory_assignments').delete().eq('id', id)
    fetchAssignments()
  }

  async function pauseSession() {
    if (!window.confirm('실사를 일시중단하시겠습니까?\n지금까지 입력된 내용은 임시저장되며, 학생들의 접근이 차단됩니다.\n실사 확정 전까지는 실제 재고에 반영되지 않습니다.')) return
    setPausing(true)
    await supabase.from('inventory_sessions').update({ status: 'paused', paused_at: new Date().toISOString(), paused_by: activeSession.created_by }).eq('id', activeSession.id)
    await fetchSessions()
    setPausing(false)
  }

  async function resumeSession() {
    if (!window.confirm('실사를 재개하시겠습니까?')) return
    await supabase.from('inventory_sessions').update({ status: 'active', paused_at: null, paused_by: null }).eq('id', activeSession.id)
    await fetchSessions()
  }

  async function cancelSession() {
    if (!window.confirm('실사를 취소하시겠습니까?\n입력된 모든 데이터는 재고에 반영되지 않으며, 실사가 종료됩니다.')) return
    await supabase.from('inventory_sessions').update({ status: 'closed' }).eq('id', activeSession.id)
    alert('실사가 취소되었습니다.')
    setActiveSession(null)
    fetchSessions()
  }

  async function resetZone(zone) {
    if (!window.confirm(`'${zone}' 구역의 입력값을 초기화하시겠습니까?\n담당자가 처음부터 다시 입력해야 합니다.`)) return
    const { data: counts } = await supabase.from('inventory_counts')
      .select('id, reagent_lots(reagents(locations(room, detail)))').eq('session_id', activeSession.id)
    if (counts) {
      const zoneCountIds = counts.filter(c => {
        const loc = c.reagent_lots?.reagents?.locations
        return loc?.detail === zone || loc?.room === zone
      }).map(c => c.id)
      if (zoneCountIds.length === 0) { alert('초기화할 입력값이 없습니다.'); return }
      await supabase.from('inventory_counts').update({ actual_sealed: null, actual_stock: null, counted_by: null, counted_at: null }).in('id', zoneCountIds)
    }
    for (const a of assignments.filter(a => a.zone === zone)) {
      await supabase.from('inventory_assignments').update({ completed_at: null }).eq('id', a.id)
    }
    fetchAssignments(); fetchProgress(); fetchZoneProgress()
    alert(`'${zone}' 구역 입력값이 초기화되었습니다.`)
  }

  async function completeZone(zone) {
    if (!window.confirm(`'${zone}' 구역 실사를 완료 처리하시겠습니까?\n해당 구역의 실측 수량이 재고에 반영됩니다.`)) return
    const { data: counts } = await supabase.from('inventory_counts')
      .select('*, reagent_lots(reagents(locations(room, detail)))').eq('session_id', activeSession.id).not('actual_sealed', 'is', null)
    if (counts) {
      const zoneCounts = counts.filter(c => {
        const loc = c.reagent_lots?.reagents?.locations
        return loc?.detail === zone || loc?.room === zone
      })
      for (const c of zoneCounts) {
        await supabase.from('reagent_lots').update({ sealed_count: c.actual_sealed, current_stock: c.actual_stock ?? c.book_stock }).eq('id', c.lot_id)
      }
    }
    for (const a of assignments.filter(a => a.zone === zone)) {
      await supabase.from('inventory_assignments').update({ completed_at: new Date().toISOString() }).eq('id', a.id)
    }
    fetchAssignments(); fetchProgress()
    // 재고 부족 항목 localStorage에 저장
if (counts) {
  const existing = JSON.parse(localStorage.getItem('low_stock_new') || '[]')
  const lowIds = zoneCounts
    .filter(c => c.actual_sealed === 0 && (c.actual_stock ?? c.book_stock) <= 20)
    .map(c => c.lot_id)
  const merged = [...new Set([...existing, ...lowIds])]
  if (merged.length > 0) localStorage.setItem('low_stock_new', JSON.stringify(merged))
}
    alert(`'${zone}' 구역 완료 처리되었습니다!`)
  }

  async function completeSession() {
    if (!window.confirm('실사를 확정하시겠습니까?\n실측 수량이 재고에 반영됩니다.')) return
    const { data: counts } = await supabase.from('inventory_counts').select('*').eq('session_id', activeSession.id).not('actual_sealed', 'is', null)
    if (counts) {
      for (const c of counts) {
        await supabase.from('reagent_lots').update({ sealed_count: c.actual_sealed, current_stock: c.actual_stock ?? c.book_stock }).eq('id', c.lot_id)
      }
    }
    await supabase.from('inventory_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeSession.id)
    // 재고 부족 항목 localStorage에 저장
if (counts) {
  const lowIds = counts
    .filter(c => c.actual_sealed === 0 && (c.actual_stock ?? c.book_stock) <= 20)
    .map(c => c.lot_id)
  if (lowIds.length > 0) {
    localStorage.setItem('low_stock_new', JSON.stringify(lowIds))
  }
}
    alert('실사가 완료되었습니다!')
    setActiveSession(null)
    fetchSessions()
  }

  function enterCounting() {
    if (!myName.trim()) { alert('이름을 입력해주세요'); return }
    localStorage.setItem('inventory_user_name', myName)
    const myZones = assignments.filter(a => a.assigned_to === myName.trim())
    if (myZones.length === 0 && !isAdmin) { alert('배정된 구역이 없습니다. 관리자에게 문의하세요'); return }
    setMyAssignments(myZones)
    setView('count')
  }

  const progressPct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0
  const rooms = [...new Set(locations.map(l => l.room))]
  const zoneGroups = assignments.reduce((acc, a) => {
    if (!acc[a.zone]) acc[a.zone] = []
    acc[a.zone].push(a)
    return acc
  }, {})

  if (view === 'count') return (
    <InventoryCountView
      session={activeSession}
      myName={myName}
      myAssignments={myAssignments}
      isAdmin={isAdmin}
      onBack={() => { setView('main'); fetchProgress() }}
    />
  )

  return (
    <div>
      <PageBanner title="재고 실사" sub="Inventory Count" breadcrumb={['홈', '재고 실사']} />
      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {!activeSession && (
          <Card title="📋 진행 중인 실사 없음">
            <p style={{ color: C.muted, fontSize: '14px', margin: '0 0 16px' }}>현재 진행 중인 실사가 없습니다.</p>
            {isAdmin && <button onClick={() => setShowStartModal(true)} style={btnPrimary}>🚀 실사 시작</button>}
          </Card>
        )}

        {activeSession && (
          <>
            <Card
              title={`📊 ${activeSession.year}년 재고 실사${activeSession.label ? ` · ${activeSession.label}` : ''}`}
              sub={`시작일: ${activeSession.start_date} · 시작자: ${activeSession.created_by}`}
              extra={isAdmin && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {activeSession.status === 'paused'
                    ? <button onClick={resumeSession} style={{ ...btnPrimary, background: '#1565C0' }}>▶ 재개</button>
                    : <button onClick={pauseSession} disabled={pausing} style={{ ...btnGhost, color: '#E65100', borderColor: '#E65100', opacity: pausing ? 0.6 : 1 }}>⏸ 일시중단</button>
                  }
                  <button onClick={cancelSession} style={{ ...btnGhost, color: C.danger, borderColor: C.danger }}>🗑️ 실사 취소</button>
                  {activeSession.status !== 'paused' &&
                    <button onClick={completeSession} style={{ ...btnPrimary, background: '#38A169' }}>✅ 실사 확정</button>
                  }
                </div>
              )}
            >
              {activeSession.status === 'paused' && (
                <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#E65100' }}>
                  <span style={{ fontSize: '16px' }}>⏸</span>
                  <div>
                    <strong>실사가 임시저장 상태로 중단되었습니다.</strong>
                    {activeSession.paused_at && (
                      <span style={{ color: '#BF5700', marginLeft: '8px', fontSize: '12px' }}>
                        {new Date(activeSession.paused_at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 중단
                      </span>
                    )}
                    {!isAdmin && <div style={{ marginTop: '2px', fontSize: '12px', color: '#BF5700' }}>관리자가 재개할 때까지 입력이 제한됩니다. 기존 입력 내용은 유지됩니다.</div>}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span style={{ color: C.muted }}>전체 진행률</span>
                  <span style={{ fontWeight: '700', color: C.navy }}>{progress.done} / {progress.total}개 완료 ({progressPct}%)</span>
                </div>
                <div style={{ height: '10px', background: C.bg, borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '5px', background: progressPct === 100 ? '#38A169' : C.navy, width: `${progressPct}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
              {activeSession.status === 'paused' && !isAdmin ? null : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: '240px' }}>
                    <label style={labelStyle}>내 이름</label>
                    <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="본인 이름 입력" style={inputStyle} />
                  </div>
                  <button onClick={enterCounting} style={btnPrimary}>📝 실사 입력 시작</button>
                </div>
              )}
            </Card>

            {isAdmin && (
              <Card title="🗺️ 구역 배정 및 진행 현황" sub="구역당 여러 명 배정 가능합니다">
                <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <label style={labelStyle}>구역</label>
                    <select value={assignForm.zone} onChange={e => setAssignForm({ ...assignForm, zone: e.target.value })} style={inputStyle}>
                      <option value="">선택하세요</option>
                      {rooms.map(r => (
                        <optgroup key={r} label={r}>
                          {locations.filter(l => l.room === r).map(loc => (
                            <option key={loc.id} value={loc.detail || loc.room}>{loc.detail || loc.room}</option>
                          ))}
                        </optgroup>
                      ))}
                      <optgroup label="알파벳 구역">
                        {['A-F', 'G-L', 'M-R', 'S-Z'].map(z => <option key={z} value={z}>{z}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '140px' }}>
                    <label style={labelStyle}>담당자</label>
                    <input value={assignForm.assigned_to} onChange={e => setAssignForm({ ...assignForm, assigned_to: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && addAssignment()} placeholder="이름 입력 후 Enter" style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button onClick={addAssignment} style={btnPrimary}>추가</button>
                  </div>
                </div>
                {Object.keys(zoneGroups).length === 0
                  ? <p style={{ color: C.muted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>아직 배정된 구역이 없습니다.</p>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                      {Object.entries(zoneGroups).map(([zone, members]) => (
                        <div key={zone}>
                          <ZoneProgressCard zone={zone} members={members} zoneProgress={zoneProgress} onComplete={() => completeZone(zone)} isAdmin={isAdmin} />
                          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {members.map(a => (
                                <button key={a.id} onClick={() => deleteAssignment(a.id)} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: `1px solid ${C.border}`, background: C.white, color: C.muted, cursor: 'pointer' }}>
                                  {a.assigned_to} ✕
                                </button>
                              ))}
                            </div>
                            <button onClick={() => resetZone(zone)} style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '10px', border: `1px solid ${C.danger}`, background: C.white, color: C.danger, cursor: 'pointer' }}>↺ 초기화</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }
              </Card>
            )}
          </>
        )}

        {sessions.filter(s => s.status !== 'active' && s.status !== 'paused').length > 0 && (
          <Card title="📁 실사 이력">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['연도', '라벨', '시작일', '완료일', '시작자', '상태'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {sessions.filter(s => s.status !== 'active' && s.status !== 'paused').map(s => (
                  <tr key={s.id}>
                    <td style={tdStyle}>{s.year}년</td>
                    <td style={tdStyle}>{s.label || <span style={{ color: C.muted }}>-</span>}</td>
                    <td style={tdStyle}>{s.start_date}</td>
                    <td style={{ ...tdStyle, color: C.muted }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '-'}</td>
                    <td style={tdStyle}>{s.created_by}</td>
                    <td style={tdStyle}>
                      <span style={{ background: s.status === 'completed' ? '#E8F5E9' : '#F5F5F5', color: s.status === 'completed' ? '#2E7D32' : '#616161', padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                        {s.status === 'completed' ? '완료' : '중단'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {showStartModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowStartModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '380px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ marginTop: 0, color: C.navy }}>🚀 실사 시작</h3>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>연도</label>
              <input type="number" value={startForm.year} onChange={e => setStartForm({ ...startForm, year: Number(e.target.value) })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>라벨 (선택)</label>
              <input value={startForm.label || ''} onChange={e => setStartForm({ ...startForm, label: e.target.value })} placeholder="예: 1학기, 여름방학, 3층 점검" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>시작일 *</label>
              <input type="date" value={startForm.start_date} onChange={e => setStartForm({ ...startForm, start_date: e.target.value })} style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>관리자 이름 *</label>
              <input value={startForm.created_by} onChange={e => setStartForm({ ...startForm, created_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>실사 범위</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => setStartForm({ ...startForm, zones: [] })} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${!startForm.zones?.length ? C.navy : C.border}`, background: !startForm.zones?.length ? C.navy : C.white, color: !startForm.zones?.length ? '#fff' : C.text }}>전체</button>
                <button onClick={() => setStartForm({ ...startForm, zones: startForm.zones?.length ? startForm.zones : ['선택'] })} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${startForm.zones?.length ? C.navy : C.border}`, background: startForm.zones?.length ? C.navy : C.white, color: startForm.zones?.length ? '#fff' : C.text }}>구역 선택</button>
              </div>
              {startForm.zones?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '10px', background: C.bg, borderRadius: '8px' }}>
                  {rooms.map(r => (
                    <button key={r} onClick={() => {
                      const cur = startForm.zones || []
                      setStartForm({ ...startForm, zones: cur.includes(r) ? cur.filter(z => z !== r) : [...cur, r] })
                    }} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', border: `1px solid ${(startForm.zones || []).includes(r) ? C.navy : C.border}`, background: (startForm.zones || []).includes(r) ? C.navy : C.white, color: (startForm.zones || []).includes(r) ? '#fff' : C.text, fontWeight: (startForm.zones || []).includes(r) ? '700' : '400' }}>{r}</button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#92400E' }}>
              ⚠️ 실사 시작 시 전체 Lot의 현재 재고가 장부 수량으로 저장됩니다.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowStartModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={startSession} style={{ ...btnPrimary, flex: 1 }}>시작</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  실사 입력 화면 (학생/관리자 공용)
// ════════════════════════════════════════════════════════════
function InventoryCountView({ session, myName, myAssignments, isAdmin, onBack }) {
  const [lots, setLots] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)   // ← 드롭다운 열림 여부
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState({})
  const [stockPicker, setStockPicker] = useState(null)
  const [changeModal, setChangeModal] = useState(null)
  const [changeForm, setChangeForm] = useState({ field_name: 'name', new_value: '' })
  const inputRefs = useRef({})
  const rowRefs = useRef({})       // ← 알파벳 인덱스용 행 ref
  const searchRef = useRef(null)   // ← 드롭다운 외부 클릭 감지

  useEffect(() => { fetchLots() }, [])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchLots() {
    setLoading(true)
    const { data: lotData } = await supabase.from('reagent_lots')
      .select('*, reagents(id, name, cas_no, category, hazard, volume, unit, locations(room, detail))')
      .order('reagents(name)')
    const { data: countData } = await supabase.from('inventory_counts').select('*').eq('session_id', session.id)
    if (lotData) {
      let filtered = lotData
      if (!isAdmin && myAssignments.length > 0) {
        filtered = lotData.filter(lot => myAssignments.some(a => {
          const zone = a.zone
          if (zone.match(/^[A-Z]-[A-Z]$/)) {
            const [from, to] = zone.split('-')
            const first = lot.reagents?.name?.[0]?.toUpperCase() || ''
            return first >= from && first <= to
          }
          return lot.reagents?.locations?.detail === zone || lot.reagents?.locations?.room === zone
        }))
      }
      setLots(filtered.sort((a, b) => (a.reagents?.name || '').localeCompare(b.reagents?.name || '', 'ko')))
    }
    if (countData) {
      const map = {}
      countData.forEach(c => { map[c.lot_id] = c })
      setCounts(map)
    }
    setLoading(false)
  }

  async function saveCount(lot, field, value) {
    const numVal = Number(value)
    if (isNaN(numVal) || numVal < 0) return
    setSaving(prev => ({ ...prev, [lot.id]: true }))
    const existing = counts[lot.id]
    const updateData = { [field]: numVal, counted_by: myName, counted_at: new Date().toISOString() }
    if (existing) {
      await supabase.from('inventory_counts').update(updateData).eq('id', existing.id)
      setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], ...updateData } }))
    }
    setSaving(prev => ({ ...prev, [lot.id]: false }))
  }

  async function submitChangeRequest() {
    if (!changeForm.new_value.trim()) { alert('변경할 값을 입력해주세요'); return }
    const reagent = changeModal.reagent
    const oldValue = reagent[changeForm.field_name] ?? ''
    await supabase.from('reagent_change_requests').insert({
      reagent_id: reagent.id, requested_by: myName, field_name: changeForm.field_name,
      old_value: String(oldValue), new_value: changeForm.new_value,
    })
    alert('변경 요청이 제출되었습니다. 관리자 승인 후 반영됩니다.')
    setChangeModal(null)
    setChangeForm({ field_name: 'name', new_value: '' })
  }

  // 알파벳 인덱스 — 실제 존재하는 첫 글자만 추출
  const availableLetters = [...new Set(lots.map(l => {
    const first = l.reagents?.name?.[0]?.toUpperCase() || ''
    return first.match(/[A-Z가-힣]/) ? first : '#'
  }))].sort()

  function scrollToLetter(letter) {
    const target = lots.find(l => {
      const first = l.reagents?.name?.[0]?.toUpperCase() || ''
      return first === letter
    })
    if (target && rowRefs.current[target.id]) {
      rowRefs.current[target.id].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  function jumpToLot(lot) {
    setSearch('')
    setSearchOpen(false)
    // filter를 'all'로 리셋 후 스크롤
    setFilter('all')
    setTimeout(() => {
      if (rowRefs.current[lot.id]) rowRefs.current[lot.id].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  const filteredLots = lots.filter(lot => {
    const name = lot.reagents?.name?.toLowerCase() || ''
    const matchSearch = !search || name.includes(search.toLowerCase())
    const count = counts[lot.id]
    const isDone = count?.actual_sealed != null
    const bookSealed = count?.book_sealed ?? lot.sealed_count
    const diff = isDone ? Math.abs((count?.actual_sealed ?? 0) - bookSealed) : 0
    if (filter === 'undone' && isDone) return false
    if (filter === 'diff' && diff === 0) return false
    return matchSearch
  })

  // 드롭다운 후보 — 검색어 있을 때만
  const dropdownLots = search.trim()
    ? lots.filter(l => (l.reagents?.name || '').toLowerCase().includes(search.toLowerCase())).slice(0, 20)
    : []

  const doneCnt = lots.filter(l => counts[l.id]?.actual_sealed != null).length
  const pct = lots.length > 0 ? Math.round(doneCnt / lots.length * 100) : 0
  const fieldLabels = { name: '시약명', volume: '용량', unit: '단위', category: '성상/유별', hazard: '유해위험성', cas_no: 'CAS No.' }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>

  return (
    <div onClick={() => setStockPicker(null)}>
      <PageBanner title="실사 입력" sub={`${session.year}년 재고 실사 · ${myName}`} breadcrumb={['홈', '재고 실사', '실사 입력']} />

      <div style={{ padding: '20px 40px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>← 뒤로</button>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span style={{ color: C.muted }}>
                {!isAdmin && myAssignments.length > 0 ? `구역: ${myAssignments.map(a => a.zone).join(', ')}` : '전체 구역'}
              </span>
              <span style={{ fontWeight: '700', color: C.navy }}>{doneCnt}/{lots.length} ({pct}%)</span>
            </div>
            <div style={{ height: '6px', background: C.bg, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '3px', background: pct === 100 ? '#38A169' : C.navy, width: `${pct}%`, transition: 'width 0.2s' }} />
            </div>
          </div>

          {/* ── 드롭다운 검색 ── */}
          <div ref={searchRef} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              placeholder="시약명 검색 또는 선택..."
              style={{ ...inputStyle, width: '220px' }}
            />
            {searchOpen && dropdownLots.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '300px', zIndex: 200,
                background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '280px', overflowY: 'auto',
              }}>
                {dropdownLots.map(lot => {
                  const count = counts[lot.id]
                  const isDone = count?.actual_sealed != null
                  return (
                    <div
                      key={lot.id}
                      onClick={() => jumpToLot(lot)}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: C.white,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: C.navy }}>{lot.reagents?.name}</div>
                        <div style={{ fontSize: '11px', color: C.muted }}>{lot.reagents?.locations?.room}{lot.reagents?.locations?.detail ? ` · ${lot.reagents.locations.detail}` : ''}</div>
                      </div>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700',
                        background: isDone ? '#E8F5E9' : '#FFF3E0',
                        color: isDone ? '#2E7D32' : '#E65100',
                      }}>
                        {isDone ? '✓ 입력완료' : '미입력'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {[['all', '전체'], ['undone', '미입력'], ['diff', '차이있음']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '6px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer',
              background: filter === key ? C.navy : C.bg, color: filter === key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: filter === key ? '700' : '400',
            }}>{label}</button>
          ))}
        </div>

        {/* ── 테이블 + 알파벳 인덱스 ── */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['시약명', '위치', 'Lot No.', '장부(미개봉)', '실측(미개봉)', '잔량(%)', '차이', '입력자', '변경요청'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLots.length === 0
                  ? <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>해당하는 항목이 없습니다.</td></tr>
                  : filteredLots.map((lot, idx) => {
                    const count = counts[lot.id]
                    const bookSealed = count?.book_sealed ?? lot.sealed_count
                    const actualSealed = count?.actual_sealed
                    const actualStock = count?.actual_stock
                    const isDone = actualSealed != null
                    const diff = isDone ? actualSealed - bookSealed : null
                    const hasDiff = diff !== null && diff !== 0
                    const isSavingNow = saving[lot.id]

                    return (
                      <tr key={lot.id} ref={el => rowRefs.current[lot.id] = el}
                        style={{ background: hasDiff ? '#FFF8F8' : isDone ? '#F0FFF4' : C.white }}>
                        <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px' }}>
                          {lot.reagents?.name || '-'}
                          <div style={{ fontSize: '11px', color: C.muted, fontWeight: '400' }}>{lot.reagents?.cas_no || ''}</div>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                          {lot.reagents?.locations?.room || '-'}
                          {lot.reagents?.locations?.detail && ` · ${lot.reagents.locations.detail}`}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{lot.lot_no || '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>{bookSealed}병</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input
                            ref={el => inputRefs.current[`sealed_${lot.id}`] = el}
                            type="number" min="0"
                            defaultValue={actualSealed ?? ''}
                            placeholder="입력"
                            onBlur={e => { if (e.target.value !== '') saveCount(lot, 'actual_sealed', e.target.value) }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                if (e.target.value !== '') saveCount(lot, 'actual_sealed', e.target.value)
                                const nextLot = filteredLots[idx + 1]
                                if (nextLot && inputRefs.current[`sealed_${nextLot.id}`]) inputRefs.current[`sealed_${nextLot.id}`].focus()
                              }
                            }}
                            style={{
                              width: '72px', padding: '5px 8px', borderRadius: '6px', textAlign: 'center',
                              border: `2px solid ${isDone ? (hasDiff ? '#FFCDD2' : '#A5D6A7') : C.border}`,
                              fontSize: '14px', fontWeight: '600', background: isSavingNow ? '#FFF8E7' : C.white,
                            }}
                          />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setStockPicker(stockPicker === lot.id ? null : lot.id)} style={{
                            width: '72px', padding: '5px 8px', borderRadius: '6px', textAlign: 'center',
                            border: `2px solid ${actualStock != null ? '#A5D6A7' : C.border}`,
                            fontSize: '13px', fontWeight: '600', background: C.white, cursor: 'pointer',
                          }}>
                            {actualStock != null ? `${actualStock}%` : '%'}
                          </button>
                          {stockPicker === lot.id && (
                            <div ref={el => { if (el && actualStock != null) { el.scrollTop = (actualStock / 10) * 37 - 37 } }}
                              style={{ position: 'absolute', zIndex: 100, background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', right: '50%', transform: 'translateX(50%)', top: '60%', width: '80px', maxHeight: '185px', overflowY: 'auto' }}>
                              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                                <div key={v} onClick={() => { saveCount(lot, 'actual_stock', v); setStockPicker(null) }}
                                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: actualStock === v ? C.navy : 'transparent', color: actualStock === v ? '#fff' : C.text, textAlign: 'center' }}
                                  onMouseEnter={e => { if (actualStock !== v) e.currentTarget.style.background = C.bg }}
                                  onMouseLeave={e => { if (actualStock !== v) e.currentTarget.style.background = 'transparent' }}
                                >{v}%</div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700', color: diff === null ? C.muted : diff === 0 ? '#38A169' : C.danger }}>
                          {diff === null ? '-' : diff > 0 ? `+${diff}` : diff}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                          {count?.counted_by || '-'}
                          {count?.counted_at && <div style={{ fontSize: '10px' }}>{new Date(count.counted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button onClick={() => { setChangeModal({ lot, reagent: lot.reagents }); setChangeForm({ field_name: 'name', new_value: '' }) }} style={{
                            padding: '4px 10px', borderRadius: '6px', border: `1px solid ${C.border}`,
                            background: C.white, cursor: 'pointer', fontSize: '11px', color: C.navy, fontWeight: '600',
                          }}>변경 요청</button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* ── 알파벳 인덱스 ── */}
          <div style={{
            position: 'sticky', top: '80px', display: 'flex', flexDirection: 'column',
            gap: '2px', background: C.white, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '6px 4px', minWidth: '28px', alignItems: 'center',
          }}>
            {availableLetters.map(letter => (
              <button key={letter} onClick={() => scrollToLetter(letter)} style={{
                width: '22px', height: '22px', borderRadius: '4px', border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{letter}</button>
            ))}
          </div>
        </div>
      </div>

      {changeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setChangeModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ marginTop: 0, color: C.navy }}>📝 시약 정보 변경 요청</h3>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>
              시약: <strong style={{ color: C.navy }}>{changeModal.reagent?.name}</strong><br />관리자 승인 후 변경됩니다.
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>변경 항목</label>
              <select value={changeForm.field_name} onChange={e => setChangeForm({ ...changeForm, field_name: e.target.value, new_value: '' })} style={inputStyle}>
                {Object.entries(fieldLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>현재 값</label>
              <div style={{ padding: '9px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.bg, fontSize: '14px', color: C.muted }}>
                {changeModal.reagent?.[changeForm.field_name] || '(없음)'}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>변경할 값 *</label>
              <input value={changeForm.new_value} onChange={e => setChangeForm({ ...changeForm, new_value: e.target.value })} placeholder="새로운 값 입력" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setChangeModal(null)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitChangeRequest} style={{ ...btnPrimary, flex: 1 }}>요청 제출</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
