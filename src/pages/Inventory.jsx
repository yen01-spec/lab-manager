import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, btnPrimary, btnGhost, inputStyle, labelStyle, StatusBadge, thStyle, tdStyle } from '../design'

// ── 상태 뱃지 ──────────────────────────────────────
function ZoneBadge({ status }) {
  const map = {
    pending:     { label: '대기중',   bg: '#FFF3E0', color: '#E65100' },
    in_progress: { label: '진행중',   bg: '#E3F2FD', color: '#1565C0' },
    done:        { label: '완료',     bg: '#E8F5E9', color: '#2E7D32' },
  }
  const s = map[status] || { label: status, bg: '#F5F5F5', color: '#616161' }
  return (
    <span style={{ background: s.bg, color: s.color,
      padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
      {s.label}
    </span>
  )
}

export default function Inventory() {
  const { isAdmin } = useOutletContext?.() || {}
  const [view, setView] = useState('main') // 'main' | 'count'
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [locations, setLocations] = useState([])
  const [myName, setMyName] = useState(() => localStorage.getItem('inventory_user_name') || '')
  const [myAssignment, setMyAssignment] = useState(null)

  // 실사 시작 폼
  const [startForm, setStartForm] = useState({ year: new Date().getFullYear(), start_date: '', created_by: '' })
  const [showStartModal, setShowStartModal] = useState(false)

  // 구역 배정 폼
  const [assignForm, setAssignForm] = useState({ zone: '', assigned_to: '' })

  // 진행률
  const [progress, setProgress] = useState({ total: 0, done: 0 })

  useEffect(() => {
    fetchSessions()
    fetchLocations()
  }, [])

  useEffect(() => {
    if (activeSession) {
      fetchAssignments()
      fetchProgress()
      // Realtime 구독
      const channel = supabase.channel('inventory_counts_' + activeSession.id)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'inventory_counts',
          filter: `session_id=eq.${activeSession.id}`,
        }, () => { fetchProgress() })
        .subscribe()
      return () => supabase.removeChannel(channel)
    }
  }, [activeSession])

  async function fetchSessions() {
    const { data } = await supabase.from('inventory_sessions')
      .select('*').order('created_at', { ascending: false })
    if (data) {
      setSessions(data)
      const active = data.find(s => s.status === 'active')
      if (active) setActiveSession(active)
    }
  }

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchAssignments() {
    if (!activeSession) return
    const { data } = await supabase.from('inventory_assignments')
      .select('*').eq('session_id', activeSession.id).order('zone')
    if (data) setAssignments(data)
  }

  async function fetchProgress() {
    if (!activeSession) return
    const { count: total } = await supabase.from('inventory_counts')
      .select('*', { count: 'exact', head: true }).eq('session_id', activeSession.id)
    const { count: done } = await supabase.from('inventory_counts')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', activeSession.id).not('actual_sealed', 'is', null)
    setProgress({ total: total || 0, done: done || 0 })
  }

  async function startSession() {
    if (!startForm.created_by.trim()) { alert('관리자 이름을 입력해주세요'); return }
    if (!startForm.start_date) { alert('날짜를 선택해주세요'); return }

    // 기존 active 세션 종료
    if (activeSession) {
      await supabase.from('inventory_sessions').update({ status: 'closed' }).eq('id', activeSession.id)
    }

    const { data } = await supabase.from('inventory_sessions').insert({
      year: startForm.year, start_date: startForm.start_date, created_by: startForm.created_by,
    }).select().single()

    if (data) {
      // 전체 lot 데이터를 inventory_counts에 미리 생성
      const { data: lots } = await supabase.from('reagent_lots')
        .select('id, reagent_id, sealed_count, current_stock')
      if (lots) {
        const rows = lots.map(l => ({
          session_id: data.id, reagent_id: l.reagent_id, lot_id: l.id,
          book_sealed: l.sealed_count, book_stock: l.current_stock,
        }))
        // 100개씩 나눠서 insert
        for (let i = 0; i < rows.length; i += 100) {
          await supabase.from('inventory_counts').insert(rows.slice(i, i + 100))
        }
      }
      setActiveSession(data)
      setShowStartModal(false)
      fetchSessions()
      fetchAssignments()
      fetchProgress()
      alert(`실사가 시작되었습니다! 총 ${lots?.length || 0}개 Lot`)
    }
  }

  async function addAssignment() {
    if (!assignForm.zone || !assignForm.assigned_to.trim()) { alert('구역과 담당자를 입력해주세요'); return }
    await supabase.from('inventory_assignments').insert({
      session_id: activeSession.id, zone: assignForm.zone, assigned_to: assignForm.assigned_to,
    })
    setAssignForm({ zone: '', assigned_to: '' })
    fetchAssignments()
  }

  async function deleteAssignment(id) {
    if (!window.confirm('배정을 삭제하시겠습니까?')) return
    await supabase.from('inventory_assignments').delete().eq('id', id)
    fetchAssignments()
  }

  async function completeSession() {
    if (!window.confirm('실사를 확정하시겠습니까?\n실측 수량이 재고에 반영됩니다.')) return

    // 입력된 실측값으로 재고 업데이트
    const { data: counts } = await supabase.from('inventory_counts')
      .select('*').eq('session_id', activeSession.id).not('actual_sealed', 'is', null)

    if (counts) {
      for (const c of counts) {
        await supabase.from('reagent_lots').update({
          sealed_count: c.actual_sealed, current_stock: c.actual_stock ?? c.book_stock,
        }).eq('id', c.lot_id)
      }
    }

    await supabase.from('inventory_sessions').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', activeSession.id)

    alert('실사가 완료되었습니다!')
    setActiveSession(null)
    fetchSessions()
  }

  function enterCounting() {
    if (!myName.trim()) { alert('이름을 입력해주세요'); return }
    localStorage.setItem('inventory_user_name', myName)
    const myZone = assignments.find(a => a.assigned_to === myName.trim())
    if (!myZone && !isAdmin) { alert('배정된 구역이 없습니다. 관리자에게 문의하세요'); return }
    setMyAssignment(myZone || null)
    setView('count')
  }

  const progressPct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0
  const rooms = [...new Set(locations.map(l => l.room))]

  // ── 메인 화면 ──────────────────────────────────────
  if (view === 'main') {
    return (
      <div>
        <PageBanner title="재고 실사" sub="Inventory Count" breadcrumb={['홈', '재고 실사']} />
        <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* 진행 중인 실사 없을 때 */}
          {!activeSession && (
            <Card title="📋 진행 중인 실사 없음">
              <p style={{ color: C.muted, fontSize: '14px', margin: '0 0 16px' }}>
                현재 진행 중인 실사가 없습니다.
              </p>
              {isAdmin && (
                <button onClick={() => setShowStartModal(true)} style={btnPrimary}>
                  🚀 실사 시작
                </button>
              )}
            </Card>
          )}

          {/* 진행 중인 실사 */}
          {activeSession && (
            <>
              {/* 진행률 카드 */}
              <Card title={`📊 ${activeSession.year}년 재고 실사`} sub={`시작일: ${activeSession.start_date} · 시작자: ${activeSession.created_by}`}
                extra={isAdmin && (
                  <button onClick={completeSession} style={{ ...btnPrimary, background: '#38A169' }}>
                    ✅ 실사 확정
                  </button>
                )}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                    <span style={{ color: C.muted }}>전체 진행률</span>
                    <span style={{ fontWeight: '700', color: C.navy }}>
                      {progress.done} / {progress.total}개 완료 ({progressPct}%)
                    </span>
                  </div>
                  <div style={{ height: '10px', background: C.bg, borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: '5px',
                      background: progressPct === 100 ? '#38A169' : C.navy,
                      width: `${progressPct}%`, transition: 'width 0.3s',
                    }} />
                  </div>
                </div>

                {/* 이름 입력 + 입력 시작 */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: '240px' }}>
                    <label style={labelStyle}>내 이름</label>
                    <input value={myName} onChange={e => setMyName(e.target.value)}
                      placeholder="본인 이름 입력" style={inputStyle} />
                  </div>
                  <button onClick={enterCounting} style={btnPrimary}>
                    📝 실사 입력 시작
                  </button>
                </div>
              </Card>

              {/* 구역 배정 (관리자) */}
              {isAdmin && (
                <Card title="🗺️ 구역 배정" sub="담당자별 구역을 배정하세요">
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label style={labelStyle}>구역</label>
                      <select value={assignForm.zone} onChange={e => setAssignForm({ ...assignForm, zone: e.target.value })} style={inputStyle}>
                        <option value="">선택하세요</option>
                        {rooms.map(r => (
                          <optgroup key={r} label={r}>
                            {locations.filter(l => l.room === r).map(loc => (
                              <option key={loc.id} value={loc.detail || loc.room}>
                                {loc.detail || loc.room}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        <optgroup label="알파벳 구역">
                          {['A-F', 'G-L', 'M-R', 'S-Z'].map(z => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label style={labelStyle}>담당자</label>
                      <input value={assignForm.assigned_to}
                        onChange={e => setAssignForm({ ...assignForm, assigned_to: e.target.value })}
                        placeholder="이름 입력" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button onClick={addAssignment} style={btnPrimary}>추가</button>
                    </div>
                  </div>

                  {assignments.length === 0
                    ? <p style={{ color: C.muted, fontSize: '13px' }}>배정된 구역이 없습니다.</p>
                    : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          {['구역', '담당자', '상태', '삭제'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {assignments.map(a => (
                            <tr key={a.id}>
                              <td style={{ ...tdStyle, fontWeight: '600' }}>{a.zone}</td>
                              <td style={tdStyle}>{a.assigned_to}</td>
                              <td style={tdStyle}><ZoneBadge status={a.status} /></td>
                              <td style={tdStyle}>
                                <button onClick={() => deleteAssignment(a.id)}
                                  style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '14px' }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                </Card>
              )}
            </>
          )}

          {/* 과거 실사 이력 */}
          {sessions.filter(s => s.status !== 'active').length > 0 && (
            <Card title="📁 실사 이력">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['연도', '시작일', '완료일', '시작자', '상태'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sessions.filter(s => s.status !== 'active').map(s => (
                    <tr key={s.id}>
                      <td style={tdStyle}>{s.year}년</td>
                      <td style={tdStyle}>{s.start_date}</td>
                      <td style={{ ...tdStyle, color: C.muted }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '-'}</td>
                      <td style={tdStyle}>{s.created_by}</td>
                      <td style={tdStyle}>
                        <span style={{ background: s.status === 'completed' ? '#E8F5E9' : '#F5F5F5',
                          color: s.status === 'completed' ? '#2E7D32' : '#616161',
                          padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
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

        {/* 실사 시작 모달 */}
        {showStartModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(26,42,94,0.45)', zIndex: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setShowStartModal(false)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: C.white, borderRadius: '14px', padding: '28px', width: '380px',
              boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
            }}>
              <h3 style={{ marginTop: 0, color: C.navy }}>🚀 실사 시작</h3>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>연도</label>
                <input type="number" value={startForm.year}
                  onChange={e => setStartForm({ ...startForm, year: Number(e.target.value) })}
                  style={inputStyle} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>시작일 *</label>
                <input type="date" value={startForm.start_date}
                  onChange={e => setStartForm({ ...startForm, start_date: e.target.value })}
                  style={inputStyle} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>관리자 이름 *</label>
                <input value={startForm.created_by}
                  onChange={e => setStartForm({ ...startForm, created_by: e.target.value })}
                  placeholder="본인 이름" style={inputStyle} />
              </div>
              <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px',
                padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#92400E' }}>
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

  // ── 실사 입력 화면 ──────────────────────────────────
  return (
    <InventoryCountView
      session={activeSession}
      myName={myName}
      myAssignment={myAssignment}
      isAdmin={isAdmin}
      onBack={() => { setView('main'); fetchProgress() }}
      onAssignmentUpdate={fetchAssignments}
    />
  )
}

// ── 실사 입력 뷰 ────────────────────────────────────
function InventoryCountView({ session, myName, myAssignment, isAdmin, onBack, onAssignmentUpdate }) {
  const [lots, setLots] = useState([])
  const [counts, setCounts] = useState({}) // lotId -> count record
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'undone' | 'diff'
  const [saving, setSaving] = useState({})
  const inputRefs = useRef({})

  useEffect(() => {
    fetchLots()
    // Realtime 구독
    const channel = supabase.channel('count_view_' + session.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'inventory_counts',
        filter: `session_id=eq.${session.id}`,
      }, payload => {
        const updated = payload.new
        setCounts(prev => ({ ...prev, [updated.lot_id]: updated }))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function fetchLots() {
    setLoading(true)
    // 내 구역에 해당하는 시약만 가져오기
    let query = supabase.from('reagent_lots')
      .select('*, reagents(name, cas_no, category, hazard, locations(room, detail))')
      .order('reagents(name)')

    // 알파벳 구역 필터
    if (myAssignment && !isAdmin) {
      const zone = myAssignment.zone
      if (zone.includes('-') && zone.match(/^[A-Z]-[A-Z]$/)) {
        const [from, to] = zone.split('-')
        // 알파벳 범위 필터는 클라이언트에서
      }
    }

    const { data: lotData } = await query
    const { data: countData } = await supabase.from('inventory_counts')
      .select('*').eq('session_id', session.id)

    if (lotData) {
      let filtered = lotData
      // 구역 필터 적용
      if (myAssignment && !isAdmin) {
        const zone = myAssignment.zone
        if (zone.match(/^[A-Z]-[A-Z]$/)) {
          const [from, to] = zone.split('-')
          filtered = lotData.filter(l => {
            const first = l.reagents?.name?.[0]?.toUpperCase() || ''
            return first >= from && first <= to
          })
        } else {
          // 위치 기반 필터
          filtered = lotData.filter(l =>
            l.reagents?.locations?.detail === zone || l.reagents?.locations?.room === zone
          )
        }
      }
      setLots(filtered.sort((a, b) => (a.reagents?.name || '').localeCompare(b.reagents?.name || '')))
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
    const updateData = {
      [field]: numVal,
      counted_by: myName,
      counted_at: new Date().toISOString(),
    }

    if (existing) {
      await supabase.from('inventory_counts').update(updateData).eq('id', existing.id)
      setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], ...updateData } }))
    }
    setSaving(prev => ({ ...prev, [lot.id]: false }))
  }

  const filteredLots = lots.filter(lot => {
    const name = lot.reagents?.name?.toLowerCase() || ''
    const matchSearch = !search || name.includes(search.toLowerCase())
    const count = counts[lot.id]
    const isDone = count?.actual_sealed != null
    const bookSealed = count?.book_sealed ?? lot.sealed_count
    const diff = isDone ? Math.abs((count?.actual_sealed ?? 0) - bookSealed) : 0
    const hasDiff = diff > 0

    if (filter === 'undone' && isDone) return false
    if (filter === 'diff' && !hasDiff) return false
    return matchSearch
  })

  const doneCnt = lots.filter(l => counts[l.id]?.actual_sealed != null).length
  const pct = lots.length > 0 ? Math.round(doneCnt / lots.length * 100) : 0

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
  )

  return (
    <div>
      <PageBanner title="실사 입력" sub={`${session.year}년 재고 실사 · ${myName}`}
        breadcrumb={['홈', '재고 실사', '실사 입력']} />

      <div style={{ padding: '20px 40px' }}>
        {/* 상단 컨트롤 */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>
            ← 뒤로
          </button>

          {/* 내 구역 진행률 */}
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
              <span style={{ color: C.muted }}>
                {myAssignment ? `구역: ${myAssignment.zone}` : '전체 구역 (관리자)'}
              </span>
              <span style={{ fontWeight: '700', color: C.navy }}>{doneCnt}/{lots.length} ({pct}%)</span>
            </div>
            <div style={{ height: '6px', background: C.bg, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '3px',
                background: pct === 100 ? '#38A169' : C.navy, width: `${pct}%`, transition: 'width 0.2s' }} />
            </div>
          </div>

          {/* 검색 */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="시약명 검색..." style={{ ...inputStyle, width: '180px' }} />

          {/* 필터 */}
          {[['all', '전체'], ['undone', '미입력'], ['diff', '차이있음']].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '6px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer',
              background: filter === key ? C.navy : C.bg,
              color: filter === key ? '#fff' : C.text, fontSize: '12px', fontWeight: filter === key ? '700' : '400',
            }}>{label}</button>
          ))}
        </div>

        {/* 실사 입력 테이블 */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['시약명', '성상', '위치', 'Lot No.', '장부(미개봉)', '실측(미개봉)', '차이', '입력자'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLots.length === 0
                ? <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>
                    해당하는 항목이 없습니다.
                  </td></tr>
                : filteredLots.map((lot, idx) => {
                  const count = counts[lot.id]
                  const bookSealed = count?.book_sealed ?? lot.sealed_count
                  const actualSealed = count?.actual_sealed
                  const isDone = actualSealed != null
                  const diff = isDone ? actualSealed - bookSealed : null
                  const hasDiff = diff !== null && diff !== 0
                  const isSavingNow = saving[lot.id]

                  return (
                    <tr key={lot.id} style={{
                      background: hasDiff ? '#FFF8F8' : isDone ? '#F0FFF4' : C.white,
                    }}>
                      {/* 시약명 */}
                      <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px' }}>
                        {lot.reagents?.name || '-'}
                        <div style={{ fontSize: '11px', color: C.muted, fontWeight: '400' }}>
                          {lot.reagents?.cas_no || ''}
                        </div>
                      </td>
                      {/* 성상 */}
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {lot.reagents?.category || '-'}
                      </td>
                      {/* 위치 */}
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {lot.reagents?.locations?.room || '-'}
                        {lot.reagents?.locations?.detail && ` · ${lot.reagents.locations.detail}`}
                      </td>
                      {/* Lot No. */}
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {lot.lot_no || '-'}
                      </td>
                      {/* 장부 수량 */}
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600' }}>
                        {bookSealed}병
                      </td>
                      {/* 실측 수량 입력 */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          ref={el => inputRefs.current[lot.id] = el}
                          type="number" min="0"
                          defaultValue={actualSealed ?? ''}
                          placeholder="입력"
                          onBlur={e => { if (e.target.value !== '') saveCount(lot, 'actual_sealed', e.target.value) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (e.target.value !== '') saveCount(lot, 'actual_sealed', e.target.value)
                              // 다음 행으로 이동
                              const nextLot = filteredLots[idx + 1]
                              if (nextLot && inputRefs.current[nextLot.id]) {
                                inputRefs.current[nextLot.id].focus()
                              }
                            }
                          }}
                          style={{
                            width: '72px', padding: '5px 8px', borderRadius: '6px', textAlign: 'center',
                            border: `2px solid ${isDone ? (hasDiff ? '#FFCDD2' : '#A5D6A7') : C.border}`,
                            fontSize: '14px', fontWeight: '600',
                            background: isSavingNow ? '#FFF8E7' : C.white,
                          }}
                        />
                      </td>
                      {/* 차이 */}
                      <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '700',
                        color: diff === null ? C.muted : diff === 0 ? '#38A169' : C.danger }}>
                        {diff === null ? '-' : diff > 0 ? `+${diff}` : diff}
                      </td>
                      {/* 입력자 */}
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {count?.counted_by || '-'}
                        {count?.counted_at && (
                          <div style={{ fontSize: '10px' }}>
                            {new Date(count.counted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
