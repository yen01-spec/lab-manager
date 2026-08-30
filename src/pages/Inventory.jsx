import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, btnPrimary, btnGhost, inputStyle, labelStyle, thStyle, tdStyle } from '../design'
import DateSplitInput from '../components/DateSplitInput'

// Supabase/PostgREST 기본 응답은 1000행으로 잘림 — 시약이 7000개가 넘는 지금은
// 반드시 페이지네이션해야 함. queryFn(from, to)는 .range(from, to)를 적용한 쿼리를 반환.
async function fetchAllPages(queryFn) {
  let all = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

function smallBtnStyle(active, activeColor = C.navy, activeBg = C.bg) {
  return {
    padding: '4px 9px', borderRadius: '6px', border: `1px solid ${active ? activeColor : C.border}`,
    background: active ? activeBg : C.white, cursor: 'pointer', fontSize: '11px',
    color: active ? activeColor : C.navy, fontWeight: '600',
  }
}

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

function ZoneProgressCard({ zone, members, zoneProgress, onComplete, onUndo, isAdmin }) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
          <div style={{ fontSize: '11px', color: '#2E7D32' }}>
            {new Date(members[0].completed_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 완료 처리(검토 대기)
          </div>
          {isAdmin && onUndo && (
            <button onClick={onUndo} style={{
              padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
              border: `1px solid ${C.danger}`, background: C.white, color: C.danger, cursor: 'pointer',
            }}>↩ 완료 취소</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function Inventory() {
  const { isAdmin, student } = useOutletContext?.() || {}
  const myName = student?.name || ''
  const [view, setView] = useState('main')
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [locations, setLocations] = useState([])
  const [myAssignments, setMyAssignments] = useState([])
  const [startForm, setStartForm] = useState({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', zones: [] })
  const [zoneMode, setZoneMode] = useState('all') // 'all' | 'select' — startForm.zones에 가짜 플레이스홀더를 넣지 않기 위한 별도 UI 상태
  const [showStartModal, setShowStartModal] = useState(false)
  const [reviewSession, setReviewSession] = useState(null) // 완료된 회차의 신규등록 교차확인 모달 대상
  const [assignForm, setAssignForm] = useState({ zone: '', assigned_to: '' })
  const [progress, setProgress] = useState({ total: 0, done: 0 })
  const [myCountedCount, setMyCountedCount] = useState(0) // ← 내가 이번 세션에서 이미 입력한 게 있는지("이어서 진행" 문구 판단용)
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

  // 다른 페이지에 갔다가 재고실사로 돌아와도 "실사 입력" 화면에 있던 걸 유지 —
  // Inventory 컴포넌트가 라우트 이동으로 언마운트되면서 view 상태가 사라지는 문제 보정.
  const restoredViewRef = useRef(false)
  useEffect(() => {
    if (restoredViewRef.current || !activeSession) return
    let saved
    try { saved = JSON.parse(sessionStorage.getItem('inv_count_view') || 'null') } catch { saved = null }
    if (!saved || saved.sessionId !== activeSession.id) return
    if (isAdmin) {
      restoredViewRef.current = true
      setMyAssignments([])
      setView('count')
    } else if (assignments.length > 0) {
      const myZones = assignments.filter(a =>
        (a.assigned_student_id && a.assigned_student_id === student?.student_id) ||
        (!a.assigned_student_id && a.assigned_to === student?.name)
      )
      if (myZones.length > 0) {
        restoredViewRef.current = true
        setMyAssignments(myZones)
        setView('count')
      }
    }
  }, [activeSession, assignments, isAdmin, student])

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
    if (student?.student_id) {
      const { count: mine } = await supabase.from('inventory_counts').select('*', { count: 'exact', head: true })
        .eq('session_id', activeSession.id).eq('counted_by_student_id', student.student_id)
      setMyCountedCount(mine || 0)
    }
  }

  async function fetchZoneProgress() {
    if (!activeSession) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts')
      .select('lot_id, actual_sealed, book_location_id')
      .eq('session_id', activeSession.id).range(from, to))
    if (!counts) return
    const zones = [...new Set(assignments.map(a => a.zone))]
    const result = {}
    for (const zone of zones) {
      const isAlpha = /^[A-Z]-[A-Z]$/.test(zone)
      const zoneItems = counts.filter(c => {
        const loc = locations.find(l => l.id === c.book_location_id)
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
      purpose: 'comprehensive', zones: startForm.zones?.length ? startForm.zones : null,
    }).select().single()
    if (data) {
      // 구역이 지정된 경우, 전체 active Lot을 내려받아 클라이언트에서 거르지 않고
      // 해당 구역의 location_id만 쿼리 단계에서 걸러서 가져온다(대량 DB에서 훨씬 빠름).
      const hasZones = startForm.zones && startForm.zones.length > 0
      const matchLocIds = hasZones
        ? locations.filter(l => startForm.zones.some(z => locationMatchesZone(l, z))).map(l => l.id)
        : null
      if (hasZones && matchLocIds.length === 0) { alert('해당 구역에 등록된 위치가 없습니다.'); return }
      const lots = await fetchAllPages((from, to) => {
        let q = supabase.from('reagent_lots')
          .select('id, reagent_id, sealed_count, current_stock, status, location_id, cat_no, lot_no, reagents(name, cas_no, company, hazard, category, volume, unit)')
          .eq('status', 'active')
        if (matchLocIds) q = q.in('location_id', matchLocIds)
        return q.range(from, to)
      })
      if (lots) {
        const rows = lots.map(l => ({
          session_id: data.id, reagent_id: l.reagent_id, lot_id: l.id,
          book_sealed: l.sealed_count, book_stock: l.current_stock,
          book_status: l.status, book_location_id: l.location_id,
          book_reagent_fields: {
            name: l.reagents?.name ?? '', cas_no: l.reagents?.cas_no ?? '', company: l.reagents?.company ?? '',
            hazard: l.reagents?.hazard ?? '', category: l.reagents?.category ?? '', volume: l.reagents?.volume ?? '', unit: l.reagents?.unit ?? '',
          },
          book_lot_fields: { cat_no: l.cat_no ?? '', lot_no: l.lot_no ?? '' },
        }))
        const chunks = []
        for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100))
        await Promise.all(chunks.map(c => supabase.from('inventory_counts').insert(c)))
        setActiveSession(data)
        setShowStartModal(false)
        setStartForm({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', zones: [] })
        setZoneMode('all')
        fetchSessions(); fetchAssignments(); fetchProgress()
        alert(`실사가 시작되었습니다! 총 ${rows.length}개 Lot`)
      }
    }
  }

  async function addAssignment() {
    if (!assignForm.zone || !assignForm.assigned_to.trim()) { alert('구역과 담당자를 입력해주세요'); return }
    const name = assignForm.assigned_to.trim()
    const exists = assignments.find(a => a.zone === assignForm.zone && a.assigned_to === name)
    if (exists) { alert('이미 배정된 담당자입니다'); return }
    // 이름만으로는 동명이인을 구분 못하므로, 학번을 같이 저장해서 정확히 그 학생과 매칭되게 함
    const { data: matches } = await supabase.from('students').select('student_id, name').eq('name', name)
    let assignedStudentId = null
    if (matches && matches.length === 1) {
      assignedStudentId = matches[0].student_id
    } else if (matches && matches.length > 1) {
      const picked = window.prompt(`"${name}"인 학생이 ${matches.length}명 있어요. 배정할 학생의 학번을 입력해주세요:\n${matches.map(m => `- ${m.student_id}`).join('\n')}`)
      if (picked === null) return
      const found = matches.find(m => m.student_id === picked.trim())
      if (!found) { alert('입력한 학번과 일치하는 학생이 없습니다. 다시 시도해주세요.'); return }
      assignedStudentId = found.student_id
    }
    // matches가 0건이면(등록 안 된 이름 등) 학번 없이 이름만으로 배정 — 기존 방식 그대로 유지
    await supabase.from('inventory_assignments').insert({ session_id: activeSession.id, zone: assignForm.zone, assigned_to: name, assigned_student_id: assignedStudentId })
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
    sessionStorage.removeItem('inv_count_view')
    fetchSessions()
  }

  async function resetZone(zone) {
    if (!window.confirm(`'${zone}' 구역의 입력값을 초기화하시겠습니까?\n담당자가 처음부터 다시 입력해야 합니다.`)) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts')
      .select('id, book_location_id').eq('session_id', activeSession.id).range(from, to))
    if (counts) {
      const zoneCountIds = counts.filter(c => {
        const loc = locations.find(l => l.id === c.book_location_id)
        return loc?.detail === zone || loc?.room === zone
      }).map(c => c.id)
      if (zoneCountIds.length === 0) { alert('초기화할 입력값이 없습니다.'); return }
      await supabase.from('inventory_counts').update({
        actual_sealed: null, actual_stock: null, counted_by: null, counted_at: null,
        reported_missing: false, abnormal_note: null, staged_location_id: null, staged_reagent_fields: null,
      }).in('id', zoneCountIds)
    }
    for (const a of assignments.filter(a => a.zone === zone)) {
      await supabase.from('inventory_assignments').update({ completed_at: null }).eq('id', a.id)
    }
    fetchAssignments(); fetchProgress(); fetchZoneProgress()
    alert(`'${zone}' 구역 입력값이 초기화되었습니다.`)
  }

  // 1단계 반영 공통 로직 — completeZone/completeSession이 공유. 실제 reagent_lots 반영 +
  // pending_confirm:true(2단계 최종 반영 전까지 화면에 연한 배경으로 표시) + 이력(stock_logs/location_history) 기록.
  async function applyCounts(counts) {
    const lowIds = []
    const processedReagentFields = new Set() // reagent_id — 같은 시약의 Lot이 여럿이어도 정보 반영은 1회만
    for (const c of counts) {
      const actorLabel = `[실사] ${c.counted_by || activeSession.created_by}`
      if (c.staged_reagent_fields && !processedReagentFields.has(c.reagent_id)) {
        processedReagentFields.add(c.reagent_id)
        const book = c.book_reagent_fields || {}
        const changed = {}
        for (const [field, value] of Object.entries(c.staged_reagent_fields)) {
          if (value !== (book[field] ?? '')) changed[field] = value
        }
        if (Object.keys(changed).length > 0) {
          await supabase.from('reagents').update({ ...changed, pending_confirm: true }).eq('id', c.reagent_id)
          for (const [field, value] of Object.entries(changed)) {
            await supabase.from('reagent_change_requests').insert({
              reagent_id: c.reagent_id, field_name: field,
              old_value: String(book[field] ?? ''), new_value: String(value),
              requested_by: actorLabel, status: 'approved',
            })
          }
        }
      }
      if (!c.is_new_registration) {
        const afterSealed = c.actual_sealed ?? c.book_sealed
        const afterStock = c.actual_stock ?? c.book_stock
        const lotFields = {
          sealed_count: afterSealed, current_stock: afterStock,
          needs_review: false, pending_confirm: true,
        }
        if (c.reported_missing) lotFields.status = 'missing'
        if (c.staged_location_id) lotFields.location_id = c.staged_location_id
        if (c.staged_lot_fields) {
          const bookLot = c.book_lot_fields || {}
          for (const [field, value] of Object.entries(c.staged_lot_fields)) {
            if (value !== (bookLot[field] ?? '')) lotFields[field] = value
          }
        }
        await supabase.from('reagent_lots').update(lotFields).eq('id', c.lot_id)
        await supabase.from('stock_logs').insert({
          target_type: 'reagent', lot_id: c.lot_id, user_name: actorLabel,
          before_sealed: c.book_sealed, after_sealed: afterSealed,
          before_stock: c.book_stock, after_stock: afterStock,
        })
        if (c.staged_location_id && c.staged_location_id !== c.book_location_id) {
          const { data: fromLoc } = c.book_location_id
            ? await supabase.from('locations').select('room, detail').eq('id', c.book_location_id).single()
            : { data: null }
          const { data: toLoc } = await supabase.from('locations').select('room, detail').eq('id', c.staged_location_id).single()
          await supabase.from('location_history').insert({
            reagent_id: c.reagent_id, lot_id: c.lot_id,
            from_location_id: c.book_location_id || null,
            from_location_name: fromLoc ? `${fromLoc.room}${fromLoc.detail ? ' - ' + fromLoc.detail : ''}` : '미지정',
            to_location_id: c.staged_location_id,
            to_location_name: toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : '',
            moved_by: actorLabel,
          })
        }
        if (afterSealed === 0 && afterStock <= 20) lowIds.push(c.lot_id)
      } else {
        // 신규 등록 Lot은 등록 시점에 이미 값이 반영돼있음 — 검토대기 표시만 켠다
        await supabase.from('reagent_lots').update({ pending_confirm: true }).eq('id', c.lot_id)
      }
    }
    if (lowIds.length > 0) {
      const existing = JSON.parse(localStorage.getItem('low_stock_new') || '[]')
      localStorage.setItem('low_stock_new', JSON.stringify([...new Set([...existing, ...lowIds])]))
    }
  }

  async function completeZone(zone) {
    if (!window.confirm(`'${zone}' 구역 실사를 완료 처리하시겠습니까?\n해당 구역의 실측 수량이 재고에 반영됩니다(검토 대기 상태로 표시).`)) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts')
      .select('*').eq('session_id', activeSession.id)
      .or('actual_sealed.not.is.null,is_new_registration.eq.true,staged_reagent_fields.not.is.null').range(from, to))
    if (counts) {
      const zoneCounts = counts.filter(c => {
        const loc = locations.find(l => l.id === c.book_location_id)
        return loc?.detail === zone || loc?.room === zone
      })
      await applyCounts(zoneCounts)
    }
    for (const a of assignments.filter(a => a.zone === zone)) {
      await supabase.from('inventory_assignments').update({ completed_at: new Date().toISOString() }).eq('id', a.id)
    }
    fetchAssignments(); fetchProgress()
    alert(`'${zone}' 구역 완료 처리되었습니다! (관리자 검토 후 "최종 DB 반영하기"를 눌러야 확정됩니다)`)
  }

  async function completeSession() {
    if (!window.confirm('남은 미완료분을 포함해 실사를 완료 처리하시겠습니까?\n실측 수량이 재고에 반영됩니다(검토 대기 상태로 표시).')) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts').select('*').eq('session_id', activeSession.id)
      .or('actual_sealed.not.is.null,is_new_registration.eq.true,staged_reagent_fields.not.is.null').range(from, to))
    if (counts) await applyCounts(counts)
    await supabase.from('inventory_assignments').update({ completed_at: new Date().toISOString() }).eq('session_id', activeSession.id).is('completed_at', null)
    fetchAssignments(); fetchProgress()
    alert('실사가 완료 처리되었습니다! 관리자 검토 후 "최종 DB 반영하기"를 눌러야 확정됩니다.')
  }

  // 2단계 — 관리자가 전체 변경사항을 검토한 뒤 최종 확정. 값은 이미 1단계에서 반영돼
  // 있으므로 pending_confirm만 끄고 세션을 completed로 닫는다(재기록 없음).
  async function finalizeSession() {
    if (!window.confirm('모든 변경사항을 최종 DB에 반영하시겠습니까?\n반영 후에는 구역별 되돌리기가 불가능합니다.')) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts').select('lot_id, reagent_id').eq('session_id', activeSession.id)
      .or('actual_sealed.not.is.null,is_new_registration.eq.true,staged_reagent_fields.not.is.null').range(from, to))
    const lotIds = [...new Set((counts || []).map(c => c.lot_id))]
    const reagentIds = [...new Set((counts || []).map(c => c.reagent_id))]
    if (lotIds.length > 0) {
      for (let i = 0; i < lotIds.length; i += 200) {
        await supabase.from('reagent_lots').update({ pending_confirm: false }).in('id', lotIds.slice(i, i + 200))
      }
    }
    if (reagentIds.length > 0) {
      for (let i = 0; i < reagentIds.length; i += 200) {
        await supabase.from('reagents').update({ pending_confirm: false }).in('id', reagentIds.slice(i, i + 200))
      }
    }
    await supabase.from('inventory_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeSession.id)
    alert('실사가 최종 확정되었습니다!')
    setActiveSession(null)
    sessionStorage.removeItem('inv_count_view')
    fetchSessions()
  }

  // 구역 완료 취소(되돌리기) — 1단계는 지났지만(pending_confirm=true) 아직 2단계(최종 반영) 전인 구역 대상.
  async function undoZoneCompletion(zone) {
    if (!window.confirm(`'${zone}' 구역의 완료 처리를 취소하고 실사 이전 값으로 되돌리시겠습니까?`)) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts')
      .select('*').eq('session_id', activeSession.id).range(from, to))
    if (counts) {
      // book_location_id(실사 배정 당시 위치)로 구역을 매칭한다 — 1단계에서 현재 위치가 이미
      // 바뀌었을 수 있어(위치변경 반영) 현재 위치로 매칭하면 원래 구역을 못 찾는다.
      const zoneCounts = counts.filter(c => {
        const loc = locations.find(l => l.id === c.book_location_id)
        return loc?.detail === zone || loc?.room === zone
      })
      const revertedReagentFields = new Set() // reagent_id — 같은 시약의 Lot이 여럿이어도 정보 되돌리기는 1회만
      for (const c of zoneCounts) {
        if (c.staged_reagent_fields && c.book_reagent_fields && !c.is_new_registration && !revertedReagentFields.has(c.reagent_id)) {
          revertedReagentFields.add(c.reagent_id)
          await supabase.from('reagents').update({ ...c.book_reagent_fields, pending_confirm: false }).eq('id', c.reagent_id)
        }
        if (c.is_new_registration) {
          const { data: lotRow } = await supabase.from('reagent_lots').select('reagent_id').eq('id', c.lot_id).single()
          await supabase.from('inventory_counts').delete().eq('id', c.id)
          await supabase.from('reagent_lots').delete().eq('id', c.lot_id)
          if (lotRow?.reagent_id) {
            const { count } = await supabase.from('reagent_lots')
              .select('id', { count: 'exact', head: true }).eq('reagent_id', lotRow.reagent_id)
            if (!count) await supabase.from('reagents').delete().eq('id', lotRow.reagent_id)
          }
        } else {
          await supabase.from('reagent_lots').update({
            sealed_count: c.book_sealed, current_stock: c.book_stock,
            status: c.book_status || 'active', location_id: c.book_location_id,
            ...(c.book_lot_fields || {}),
            pending_confirm: false,
          }).eq('id', c.lot_id)
          await supabase.from('stock_logs').insert({
            target_type: 'reagent', lot_id: c.lot_id, user_name: `[실사] ${activeSession.created_by}`,
            before_sealed: c.actual_sealed, after_sealed: c.book_sealed,
            before_stock: c.actual_stock ?? c.book_stock, after_stock: c.book_stock,
          })
        }
      }
    }
    for (const a of assignments.filter(a => a.zone === zone)) {
      await supabase.from('inventory_assignments').update({ completed_at: null }).eq('id', a.id)
    }
    fetchAssignments(); fetchProgress(); fetchZoneProgress()
    alert(`'${zone}' 구역이 실사 이전 값으로 되돌려졌습니다.`)
  }

  function enterCounting() {
    if (!student) { alert('로그인 후 이용해주세요'); return }
    const myZones = assignments.filter(a =>
      (a.assigned_student_id && a.assigned_student_id === student.student_id) ||
      (!a.assigned_student_id && a.assigned_to === student.name)
    )
    if (myZones.length === 0 && !isAdmin) { alert('배정된 구역이 없습니다. 관리자에게 문의하세요'); return }
    setMyAssignments(myZones)
    setView('count')
    sessionStorage.setItem('inv_count_view', JSON.stringify({ sessionId: activeSession.id }))
  }

  const progressPct = progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0
  const rooms = [...new Set(locations.map(l => l.room))]

  // 시약장(세부 위치) 이름이 서로 다른 방(room)에 같은 이름으로 존재할 수 있음(예: "노란시약장"이
  // 303호와 5층에 둘 다 있음) — 이런 경우만 "방 · 세부위치"로 구분하고, 겹치지 않으면 그대로 세부위치명만 사용.
  const detailCountAcrossRooms = {}
  locations.forEach(l => {
    const key = l.detail || l.room
    if (!detailCountAcrossRooms[key]) detailCountAcrossRooms[key] = new Set()
    detailCountAcrossRooms[key].add(l.room)
  })
  function zoneTokenOf(loc) {
    const key = loc.detail || loc.room
    return detailCountAcrossRooms[key]?.size > 1 ? `${loc.room} · ${key}` : key
  }
  function locationMatchesZone(loc, z) {
    if (z.includes(' · ')) {
      const [room, detail] = z.split(' · ')
      return loc.room === room && (loc.detail || loc.room) === detail
    }
    return loc.room === z || loc.detail === z
  }
  const zoneGroups = assignments.reduce((acc, a) => {
    if (!acc[a.zone]) acc[a.zone] = []
    acc[a.zone].push(a)
    return acc
  }, {})

  if (view === 'count') return (
    <InventoryCountView
      session={activeSession}
      myName={myName}
      student={student}
      myAssignments={myAssignments}
      isAdmin={isAdmin}
      onBack={() => { setView('main'); fetchProgress(); sessionStorage.removeItem('inv_count_view') }}
    />
  )

  return (
    <div>
      <PageBanner title="재고 실사" sub="Inventory Count" breadcrumb={['홈', '재고 실사']} />
      <div style={{ padding: '28px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {!activeSession && (
          <Card title="📋 진행 중인 실사 없음">
            <p style={{ color: C.muted, fontSize: '14px', margin: '0 0 16px' }}>현재 진행 중인 실사가 없습니다.</p>
            {isAdmin && <button onClick={() => {
              const today = new Date().toISOString().slice(0, 10)
              setStartForm(f => ({ ...f, start_date: f.start_date || today, created_by: f.created_by || myName }))
              setShowStartModal(true)
            }} style={btnPrimary}>🚀 실사 시작</button>}
          </Card>
        )}

        {activeSession && (
          <>
            <Card
              title={`📊 ${activeSession.year}년 재고 실사${activeSession.label ? ` · ${activeSession.label}` : ''}`}
              sub={`시작일: ${activeSession.start_date} · 시작자: ${activeSession.created_by} · 범위: ${activeSession.zones?.length ? activeSession.zones.join(', ') : '전체'}`}
              extra={isAdmin && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {activeSession.status === 'paused'
                    ? <button onClick={resumeSession} style={{ ...btnPrimary, background: '#1565C0' }}>▶ 재개</button>
                    : <button onClick={pauseSession} disabled={pausing} style={{ ...btnGhost, color: '#E65100', borderColor: '#E65100', opacity: pausing ? 0.6 : 1 }}>⏸ 일시중단</button>
                  }
                  <button onClick={cancelSession} style={{ ...btnGhost, color: C.danger, borderColor: C.danger }}>🗑️ 실사 취소</button>
                  {activeSession.status !== 'paused' && (
                    <>
                      <button onClick={completeSession} style={{ ...btnPrimary, background: '#1565C0' }}>✅ 나머지 완료 처리</button>
                      <button onClick={finalizeSession} style={{ ...btnPrimary, background: '#38A169' }}>🏁 모든 변경사항 최종 DB 반영하기</button>
                    </>
                  )}
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
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {student ? (
                    <span style={{ fontSize: '13.5px', color: C.text }}>👤 {student.name}님으로 시작합니다</span>
                  ) : (
                    <span style={{ fontSize: '13.5px', color: C.muted }}>로그인 후 이용해주세요</span>
                  )}
                  <button onClick={enterCounting} style={btnPrimary}>{myCountedCount > 0 ? '📝 실사 이어서 진행' : '📝 실사 입력 시작'}</button>
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
                          <ZoneProgressCard zone={zone} members={members} zoneProgress={zoneProgress} onComplete={() => completeZone(zone)} onUndo={() => undoZoneCompletion(zone)} isAdmin={isAdmin} />
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
              <thead><tr>{['연도', '라벨', '시작일', '완료일', '시작자', '상태', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
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
                    <td style={tdStyle}>
                      {s.status === 'completed' && isAdmin && (
                        <button onClick={() => setReviewSession(s)} style={{ ...smallBtnStyle(), whiteSpace: 'nowrap' }}>🔍 교차확인</button>
                      )}
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
              <DateSplitInput value={startForm.start_date} onChange={v => setStartForm({ ...startForm, start_date: v })} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>관리자 이름 *</label>
              <input value={startForm.created_by} onChange={e => setStartForm({ ...startForm, created_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>실사 범위</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => { setZoneMode('all'); setStartForm({ ...startForm, zones: [] }) }} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${zoneMode === 'all' ? C.navy : C.border}`, background: zoneMode === 'all' ? C.navy : C.white, color: zoneMode === 'all' ? '#fff' : C.text }}>전체</button>
                <button onClick={() => setZoneMode('select')} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${zoneMode === 'select' ? C.navy : C.border}`, background: zoneMode === 'select' ? C.navy : C.white, color: zoneMode === 'select' ? '#fff' : C.text }}>구역 선택</button>
              </div>
              {zoneMode === 'select' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: C.bg, borderRadius: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                  {rooms.map(r => {
                    const locsInRoom = locations.filter(l => l.room === r)
                    // 세부 위치(시약장)가 하나뿐이거나 없으면 방 이름 자체를 하나의 구역으로 취급.
                    // 저장/매칭에 쓰는 값(token)은 다른 방과 이름이 겹치면 "방 · 세부위치"로 구분하되,
                    // 버튼에는 이미 방 이름이 위에 제목으로 있으니 세부위치명만 짧게 보여줌.
                    const zoneEntries = locsInRoom.length > 0
                      ? [...new Map(locsInRoom.map(l => [zoneTokenOf(l), l.detail || l.room])).entries()]
                      : [[r, r]]
                    return (
                      <div key={r}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '4px' }}>{r}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {zoneEntries.map(([z, label]) => (
                            <button key={z} onClick={() => {
                              const cur = startForm.zones || []
                              setStartForm({ ...startForm, zones: cur.includes(z) ? cur.filter(x => x !== z) : [...cur, z] })
                            }} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer', border: `1px solid ${(startForm.zones || []).includes(z) ? C.navy : C.border}`, background: (startForm.zones || []).includes(z) ? C.navy : C.white, color: (startForm.zones || []).includes(z) ? '#fff' : C.text, fontWeight: (startForm.zones || []).includes(z) ? '700' : '400' }}>{label}</button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
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

      {reviewSession && <SessionReviewModal session={reviewSession} onClose={() => setReviewSession(null)} />}
    </div>
  )
}

// 실사 완료 후 관리자가 확인하는 신규등록 교차확인 화면 — "303-1에서 미확인 처리된 시약이
// 5층에서 신규등록됐다면, 사실 303-1 물건이 5층에 잘못 보관된 걸 수도 있다"를 판단하도록
// 도와줌. 진행 중인 실사 화면(라이브)이 아니라 완료된 회차를 나중에 검토하는 용도.
function SessionReviewModal({ session, onClose }) {
  const [rows, setRows] = useState(null) // null = 로딩중
  const [missingByName, setMissingByName] = useState(new Map())
  const [missingCount, setMissingCount] = useState(0)

  useEffect(() => {
    async function fetchData() {
      const [{ data: newRegs }, { data: missing }, { data: locs }] = await Promise.all([
        supabase.from('inventory_counts')
          .select('*, reagents(name), reagent_lots(lot_no, location_id)')
          .eq('session_id', session.id).eq('is_new_registration', true)
          .order('counted_at', { ascending: false }),
        supabase.from('inventory_counts').select('reagents(name), book_location_id')
          .eq('session_id', session.id).eq('reported_missing', true),
        supabase.from('locations').select('id, room, detail'),
      ])
      const locById = new Map((locs || []).map(l => [l.id, `${l.room}${l.detail ? ' · ' + l.detail : ''}`]))
      const map = new Map()
      ;(missing || []).forEach(m => {
        if (m.reagents?.name) map.set(m.reagents.name, locById.get(m.book_location_id) || '다른 위치')
      })
      setMissingByName(map)
      setMissingCount((missing || []).length)
      setRows((newRegs || []).map(r => ({
        ...r,
        registeredLocationName: locById.get(r.reagent_lots?.location_id) || '-',
      })))
    }
    fetchData()
  }, [session.id])

  const matchedCount = rows ? rows.filter(r => missingByName.has(r.reagents?.name)).length : 0

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '760px', maxWidth: '95vw', maxHeight: '86vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '4px', color: C.navy }}>🔍 {session.year}년 실사{session.label ? ` · ${session.label}` : ''} — 신규등록 교차확인</h3>
        <p style={{ margin: '0 0 16px', color: C.muted, fontSize: '12.5px' }}>
          이번 회차에 새로 등록된 시약 중, 다른 위치에서 미확인(분실) 처리된 시약과 이름이 같은
          항목을 표시합니다. 원래 있던 위치에 잘못 보관돼 있다가 다른 곳에서 새로 등록된 걸 수도 있어요.
        </p>
        {rows === null ? (
          <div style={{ padding: '30px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: C.muted }}>이번 실사에서 새로 등록된 시약이 없습니다.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12.5px', color: C.muted }}>
              <span>신규등록 <b style={{ color: C.navy }}>{rows.length}건</b></span>
              <span>매칭 의심 <b style={{ color: matchedCount > 0 ? C.danger : C.navy }}>{matchedCount}건</b></span>
              <span>미확인(분실) 처리 <b style={{ color: C.navy }}>{missingCount}건</b></span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['시약명', 'Lot No.', '등록된 위치', '교차확인'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map(r => {
                  const originalLoc = missingByName.get(r.reagents?.name)
                  return (
                    <tr key={r.id} style={{ background: originalLoc ? '#FDECEC' : 'transparent' }}>
                      <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.reagents?.name}</td>
                      <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.reagent_lots?.lot_no || '-'}</td>
                      <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.registeredLocationName}</td>
                      <td style={tdStyle}>
                        {originalLoc
                          ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12.5px' }}>⚠️ {originalLoc}에서 미확인됨</span>
                          : <span style={{ color: C.muted, fontSize: '12.5px' }}>-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ ...btnGhost, padding: '9px 18px' }}>닫기</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
//  실사 입력 화면 (학생/관리자 공용)
// ════════════════════════════════════════════════════════════
function InventoryCountView({ session, myName, student, myAssignments, isAdmin, onBack }) {
  const [lots, setLots] = useState([])
  const [counts, setCounts] = useState({})
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('') // ← 목록 필터링/하이라이트용(디바운스)
  const [compareLot, setCompareLot] = useState(null)  // ← 검색어 정확히 일치 시 상단에 뜨는 대조 입력 패널 대상
  const [compareCandidates, setCompareCandidates] = useState([]) // ← 같은 이름의 Lot이 여러 개라 특정 못했을 때 고를 후보들
  const [savedMsg, setSavedMsg] = useState(false)      // ← "✓ 수정되었습니다" 인라인 메시지
  const [searchOpen, setSearchOpen] = useState(false)  // ← 검색창 아래 후보 드롭다운 열림 여부
  const [filter, setFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('')
  const [capStart, setCapStart] = useState(0) // 렌더 캡 윈도우 시작 인덱스 — 알파벳 인덱스 점프 시 이동
  const [saving, setSaving] = useState({})
  const [disposingLotId, setDisposingLotId] = useState(null)
  // 검색해도 기존 목록에 전혀 없을 때, 상단 패널 안에서 바로 미등록 시약을 입력하는 모드
  // (예전엔 별도 모달이었는데, 검색→대조/수정 패널과 자연스럽게 이어지도록 통합함)
  const [newEntryMode, setNewEntryMode] = useState(false)
  const [newEntryForm, setNewEntryForm] = useState({ name: '', cas_no: '', company: '', cat_no: '', lot_no: '', category: '', volume: '', unit: '', location_id: '', current_stock: '100', abnormal_note: '' })
  const inputRefs = useRef({})
  const rowRefs = useRef({})       // ← 알파벳 인덱스용 행 ref
  const searchInputRef = useRef(null)
  const searchBoxRef = useRef(null)   // ← 후보 드롭다운 바깥 클릭 감지용
  const comparePanelInputRef = useRef(null)
  const completeButtonRef = useRef(null)
  const searchDebounceRef = useRef(null)
  const savedMsgTimerRef = useRef(null)

  useEffect(() => { fetchLots(); fetchLocations() }, [])

  // 검색 후보 드롭다운 바깥을 클릭하면 닫음
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  // 검색어 입력은 즉시 반영하되, 목록 필터링/하이라이트는 살짝 디바운스해서 렌더 부담을 줄임.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(searchDebounceRef.current)
  }, [search])

  async function fetchLots() {
    setLoading(true)
    // 이전엔 세션 전체(수천 개)를 일단 다 받아온 뒤 내 담당 구역으로 화면에서만 걸러냈음 —
    // 관리자가 아니고 배정된 구역이 전부 "위치" 기반(알파벳 범위 구역 없음)이면, 애초에
    // 서버에다 그 위치의 Lot만 요청해서 안 쓰는 나머지를 통신량에서부터 빼버린다.
    // 알파벳 범위 구역("A-G" 등, 시약명 기준)은 서버에서 걸러내기 까다로워 기존 방식 유지.
    const alphaZones = myAssignments.filter(a => a.zone.match(/^[A-Z]-[A-Z]$/))
    const locZones = myAssignments.filter(a => !a.zone.match(/^[A-Z]-[A-Z]$/))
    const canScopeByLocation = !isAdmin && myAssignments.length > 0 && alphaZones.length === 0

    // matchedLocIds가 null이면 제한 없음(관리자 등 전체를 봐야 하는 경우).
    // 담당 구역에 해당하는 Lot id 목록을 먼저 통째로 받아와 .in(lot_id, [...])로 거르면
    // 구역이 세션 전체(수천 개)에 가까울 때 URL에 UUID가 수천 개 붙어 요청 자체가 실패한다
    // (실제로 재현됨: 414/URL too long → 브라우저에는 CORS 오류로만 보임).
    // 그래서 lot_id 목록을 따로 안 만들고, inventory_counts를 reagent_lots와 조인해서
    // "location_id가 내 구역에 속한 것만" 서버에서 바로 걸러낸다 — 필터 값은 위치 id
    // 몇 개뿐이라 URL 길이 문제가 없다.
    let matchedLocIds = null
    if (canScopeByLocation) {
      const { data: locs } = await supabase.from('locations').select('id, room, detail')
      const zoneNames = new Set(locZones.map(a => a.zone))
      matchedLocIds = (locs || []).filter(l => zoneNames.has(l.detail) || zoneNames.has(l.room)).map(l => l.id)
      if (matchedLocIds.length === 0) { setLots([]); setCounts({}); setLoading(false); return }
    }

    const countData = await fetchAllPages((from, to) => {
      let q = supabase.from('inventory_counts')
        .select(matchedLocIds ? '*, reagent_lots!inner(location_id)' : '*')
        .eq('session_id', session.id)
      if (matchedLocIds) q = q.in('reagent_lots.location_id', matchedLocIds)
      return q.range(from, to)
    })
    const lotIds = (countData || []).map(c => c.lot_id)
    if (lotIds.length === 0) { setLots([]); setCounts({}); setLoading(false); return }
    const idChunks = []
    for (let i = 0; i < lotIds.length; i += 500) idChunks.push(lotIds.slice(i, i + 500))
    const chunkResults = await Promise.all(idChunks.map(chunk => supabase.from('reagent_lots')
      .select('id, reagent_id, location_id, lot_no, cat_no, sealed_count, current_stock, reagents(id, name, cas_no, company, category, hazard, volume, unit), locations(room, detail)')
      .in('id', chunk)))
    const lotData = chunkResults.flatMap(r => r.data || [])
    if (lotData) {
      let filtered = lotData
      if (!isAdmin && myAssignments.length > 0 && !canScopeByLocation) {
        // 알파벳 범위 구역이 섞여 있는 경우엔 서버에서 미리 못 거르므로 기존처럼 여기서 걸러냄
        filtered = lotData.filter(lot => myAssignments.some(a => {
          const zone = a.zone
          if (zone.match(/^[A-Z]-[A-Z]$/)) {
            const [from, to] = zone.split('-')
            const first = lot.reagents?.name?.[0]?.toUpperCase() || ''
            return first >= from && first <= to
          }
          return lot.locations?.detail === zone || lot.locations?.room === zone
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

  // Lot 단위로 이미 한 행 = 한 병이므로("미개봉 병 수"를 따로 세는 건 의미가 없음 — 같은
  // 시약이라도 병이 여러 개면 각각 별도 Lot으로 등록돼 있어야 함), 실사에서 입력받는 실측값은
  // "잔량(%)" 하나뿐. 미개봉 병 수(sealed_count)는 장부값 그대로 자동으로 같이 저장해서
  // (반영 로직이 계속 sealed_count도 갱신하므로) 다른 화면에는 영향이 없게 함.
  async function saveStock(lot, value) {
    const numVal = Number(value)
    if (isNaN(numVal) || numVal < 0) return
    setSaving(prev => ({ ...prev, [lot.id]: true }))
    const existing = counts[lot.id]
    const bookSealed = existing?.book_sealed ?? lot.sealed_count
    const updateData = { actual_stock: numVal, actual_sealed: bookSealed, counted_by: myName, counted_by_student_id: student?.student_id ?? null, counted_at: new Date().toISOString() }
    if (existing) {
      await supabase.from('inventory_counts').update(updateData).eq('id', existing.id)
      setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], ...updateData } }))
    }
    setSaving(prev => ({ ...prev, [lot.id]: false }))
  }

  // 잔량 입력칸은 장부값이 이미 채워진 채로 시작 — 병을 확인해서 장부랑 같으면
  // 아무것도 고치지 않고 Enter 한 번으로 그 값 그대로 저장 + 바로 다음 행으로 이동.
  // 다르면 그 칸만 고쳐 쓰고 Enter를 누르면 됨(엑셀에서 맞는 셀은 그냥 넘어가는 것과 동일한 흐름).
  function confirmRow(lot, idx, currentList, bookStock) {
    const stockEl = inputRefs.current[`stock_${lot.id}`]
    // 고쳐 쓴 값을 지워서 빈 칸이 되면 장부값으로 되돌린 것으로 보고 그 값을 저장
    if (stockEl) saveStock(lot, stockEl.value !== '' ? stockEl.value : bookStock)
    const nextLot = currentList[idx + 1]
    if (nextLot && inputRefs.current[`stock_${nextLot.id}`]) inputRefs.current[`stock_${nextLot.id}`].focus()
  }

  // 미확인(분실) 표시 — 스테이징만(실사 완료 처리 시점에 reagent_lots.status='missing'으로 반영)
  async function toggleMissing(lot) {
    const existing = counts[lot.id]
    if (!existing) return
    const next = !existing.reported_missing
    await supabase.from('inventory_counts').update({ reported_missing: next }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], reported_missing: next } }))
  }

  // 이상기록도 잔량/미개봉처럼 열에 바로 입력하는 칸(Tab/Enter로 이동) — 모달 없음.
  async function saveAbnormalNote(lot, value) {
    const existing = counts[lot.id]
    if (!existing) return
    const trimmed = value.trim() || null
    if (trimmed === (existing.abnormal_note || null)) return
    await supabase.from('inventory_counts').update({ abnormal_note: trimmed }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], abnormal_note: trimmed } }))
  }

  // 폐기 신청 — 실사 완료 처리 흐름과 무관하게 기존 disposal_requests 신청→승인 구조 그대로 재사용.
  // window.prompt() 대신 표를 벗어나지 않는 사유 칩 선택으로 한 번에 제출.
  const DISPOSAL_REASONS = ['변색', '침전', '용기손상', '유효기간 경과', '기타']
  async function requestDisposal(lot, reason) {
    if (!myName.trim()) { alert('로그인 후 이용해주세요'); return }
    await supabase.from('disposal_requests').insert({
      reagent_id: lot.reagent_id, lot_id: lot.id, lot_no: lot.lot_no,
      reagent_name: lot.reagents?.name, requested_by: myName, requested_by_student_id: student?.student_id ?? null,
      reason, status: 'pending',
    })
    setDisposingLotId(null)
  }

  // 위치 변경(종합실사 전용) — 스테이징만(실사 완료 처리 시점에 location_id 반영 + location_history 기록).
  // 열에 있는 select에서 고르는 즉시 저장(별도 저장 버튼 없음).
  async function changeLocation(lot, locationId) {
    const existing = counts[lot.id]
    if (!existing) return
    await supabase.from('inventory_counts').update({ staged_location_id: locationId || null }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], staged_location_id: locationId || null } }))
  }

  // 시약 기본정보(시약명/CAS/회사/용량/단위/성상/유해정보) 실사 중 수정 — 잔량/미개봉과 같은
  // 스테이징 방식: inventory_counts.staged_reagent_fields에 모아뒀다가 구역 완료 처리(1단계)
  // 시점에 reagents에 반영 + pending_confirm(검토대기 표시).
  async function saveReagentField(lot, field, value) {
    const existing = counts[lot.id]
    if (!existing) return
    const book = existing.book_reagent_fields || {}
    if (value === (existing.staged_reagent_fields?.[field] ?? book[field] ?? '')) return
    const nextStaged = { ...(existing.staged_reagent_fields || {}), [field]: value }
    await supabase.from('inventory_counts').update({ staged_reagent_fields: nextStaged }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], staged_reagent_fields: nextStaged } }))
  }

  // Lot 고유정보(Cat No./Lot No.) 실사 중 수정 — saveReagentField와 동일한 스테이징 방식이지만
  // reagents가 아니라 이 Lot 자체(reagent_lots)에 반영되는 필드라 book/staged 스냅샷을 따로 둠.
  async function saveLotField(lot, field, value) {
    const existing = counts[lot.id]
    if (!existing) return
    const book = existing.book_lot_fields || {}
    if (value === (existing.staged_lot_fields?.[field] ?? book[field] ?? '')) return
    const nextStaged = { ...(existing.staged_lot_fields || {}), [field]: value }
    await supabase.from('inventory_counts').update({ staged_lot_fields: nextStaged }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], staged_lot_fields: nextStaged } }))
  }

  // 신규(미등록) 시약 등록 — 검색해서 기존 목록에 전혀 없으면 상단 검색창 아래 드롭다운에
  // "기존 목록에 없습니다"를 띄우고, 그걸 누르면 대조 패널이 신규 입력 모드로 바뀜.
  // 입력한 시약명을 그대로 넣어두고 나머지 정보를 채운 뒤 "등록 완료"를 누르면
  // 즉시 reagents/reagent_lots를 생성하고, 이번 세션 inventory_counts에도 바로 편입시켜
  // 진행률에 포함 + "완료" 상태로 시작(실사에서 방금 발견/확인한 값이므로).
  function startNewEntry() {
    setCompareLot(null)
    setCompareCandidates([])
    setNewEntryMode(true)
    setNewEntryForm({ name: search.trim(), cas_no: '', company: '', cat_no: '', lot_no: '', category: '', volume: '', unit: '', location_id: '', current_stock: '100', abnormal_note: '' })
    setSearchOpen(false)
  }
  function cancelNewEntry() {
    setNewEntryMode(false)
    setSearch('')
    setDebouncedSearch('')
  }
  async function submitInlineNewReagent() {
    if (!myName.trim()) { alert('로그인 후 이용해주세요'); return }
    if (!newEntryForm.name.trim()) { alert('화학물질명을 입력해주세요'); return }
    if (!newEntryForm.location_id) { alert('위치를 선택해주세요'); return }
    const { data: r, error } = await supabase.from('reagents').insert({
      name: newEntryForm.name.trim(), cas_no: newEntryForm.cas_no || null, company: newEntryForm.company || null,
      category: newEntryForm.category || null, volume: newEntryForm.volume || null, unit: newEntryForm.unit || null,
      reagent_type: 'purchased', status: 'active', registered_by: student?.student_id ?? null,
    }).select().single()
    if (error) { alert('시약 등록 실패: ' + error.message); return }
    const stockNum = Number(newEntryForm.current_stock) || 0
    const { data: newLot, error: lotErr } = await supabase.from('reagent_lots').insert({
      reagent_id: r.id, lot_no: newEntryForm.lot_no || null, cat_no: newEntryForm.cat_no || null,
      sealed_count: 1, current_stock: stockNum, location_id: newEntryForm.location_id, status: 'active',
    }).select().single()
    if (lotErr) { alert('Lot 등록 실패: ' + lotErr.message); return }
    await supabase.from('inventory_counts').insert({
      session_id: session.id, reagent_id: r.id, lot_id: newLot.id,
      book_sealed: 0, book_stock: 0, book_status: 'active', book_location_id: newEntryForm.location_id,
      actual_sealed: 1, actual_stock: stockNum,
      abnormal_note: newEntryForm.abnormal_note.trim() || null,
      counted_by: myName, counted_by_student_id: student?.student_id ?? null, counted_at: new Date().toISOString(),
      is_new_registration: true,
    })
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: newLot.id, user_name: `[실사] ${myName}`,
      before_sealed: 0, after_sealed: 1, before_stock: 0, after_stock: stockNum,
    })
    alert('미등록 시약이 입력되었습니다!')
    setNewEntryMode(false)
    setSearch('')
    setDebouncedSearch('')
    fetchLots()
  }

  // 알파벳 인덱스 — 실제 존재하는 첫 글자만 추출
  const availableLetters = [...new Set(lots.map(l => {
    const first = l.reagents?.name?.[0]?.toUpperCase() || ''
    return first.match(/[A-Z가-힣]/) ? first : '#'
  }))].sort()

  // 캡에 걸려 대상 행이 안 그려졌을 수 있으니, 전체를 다 풀지 않고 대상 주변으로
  // 캡 윈도우(capStart~capStart+RENDER_CAP)를 옮긴 뒤 스크롤한다 — 큰 범위에서도 가볍게 유지.
  function scrollToLetter(letter) {
    const idx = lots.findIndex(l => {
      const first = l.reagents?.name?.[0]?.toUpperCase() || ''
      return first === letter
    })
    if (idx === -1) return
    const target = lots[idx]
    setSearch('')
    setFilter('all')
    setCapStart(Math.max(0, idx - 20))
    setTimeout(() => {
      if (rowRefs.current[target.id]) rowRefs.current[target.id].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  // 검색창에서 Enter — 시약명/CAS/Lot No.가 검색어와 "정확히" 일치하는 항목이 딱 1건이면
  // 상단 대조 입력 패널에 띄운다. 없거나(부분일치만 있음) 여러 건이면 패널은 비워두고 목록 필터만 유지.
  function handleSearchEnter() {
    const term = search.trim().toLowerCase()
    if (!term) return
    setSearchOpen(false)
    const matches = locationScopedLots.filter(l =>
      (l.reagents?.name || '').toLowerCase() === term
      || (l.reagents?.cas_no || '').toLowerCase() === term
      || (l.lot_no || '').toLowerCase() === term
    )
    if (matches.length === 1) {
      openComparePanel(matches[0])
    } else if (matches.length > 1) {
      // 같은 시약명인데 Lot이 여러 개라 특정할 수 없음 — 어떤 Lot을 고치는 건지 사용자가 직접 고르게 함
      setCompareLot(null)
      setCompareCandidates(matches)
    } else if (dropdownLots.length === 0) {
      // 부분일치조차 전혀 없음 — 기존 목록에 없는 시약이므로 바로 신규 입력 모드로
      startNewEntry()
    }
  }

  function openComparePanel(lot) {
    setCompareCandidates([])
    setCompareLot(lot)
    setNewEntryMode(false)
    setSearchOpen(false)
    setTimeout(() => { comparePanelInputRef.current?.focus(); comparePanelInputRef.current?.select() }, 50)
  }

  function saveComparePanel() {
    if (!compareLot) return
    if (!window.confirm(`'${compareLot.reagents?.name}' 정보를 확인 완료하시겠습니까?`)) return
    const count = counts[compareLot.id]
    const bookStock = count?.book_stock ?? compareLot.current_stock
    const value = comparePanelInputRef.current?.value
    saveStock(compareLot, value !== '' && value != null ? value : bookStock)
    setSavedMsg(true)
    if (savedMsgTimerRef.current) clearTimeout(savedMsgTimerRef.current)
    savedMsgTimerRef.current = setTimeout(() => setSavedMsg(false), 2500)
    setSearch('')
    setDebouncedSearch('')
    setCompareLot(null)
    setSearchOpen(false)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  // 지금 실사 중인 시약장(위치) 하나로 화면을 좁혀서 보는 필터 — 관리자/담당자 구분 없이
  // 누구나 쓸 수 있는, 이 화면 안에서만 적용되는 클라이언트 사이드 보기 필터(구역 배정과는 별개).
  const sessionLocationGroups = {}
  lots.forEach(l => {
    if (!l.location_id || !l.locations) return
    const room = l.locations.room
    if (!sessionLocationGroups[room]) sessionLocationGroups[room] = new Map()
    if (!sessionLocationGroups[room].has(l.location_id)) {
      sessionLocationGroups[room].set(l.location_id, l.locations.detail || l.locations.room)
    }
  })

  // 위치 필터가 걸려 있으면 검색도 그 범위 안에서만 — 지금 서 있는 시약장과 무관한 결과가 뜨지 않게
  const locationScopedLots = locationFilter ? lots.filter(l => l.location_id === locationFilter) : lots

  // 검색창 아래 후보 드롭다운 — 전체 시약 DB가 아니라 이번 실사에 배정된(하단 목록과 같은 범위) Lot 중에서만 찾음
  const dropdownLots = search.trim()
    ? locationScopedLots.filter(l => {
        const term = search.trim().toLowerCase()
        return (l.reagents?.name || '').toLowerCase().includes(term)
          || (l.reagents?.cas_no || '').toLowerCase().includes(term)
          || (l.lot_no || '').toLowerCase().includes(term)
      }).slice(0, 15)
    : []

  // 실제로 병을 무작위로 꺼내며 라벨의 시약명/CAS/Lot 번호 중 뭐가 보이든 그걸로 바로 찾을 수 있어야 하므로
  // 목록 필터링도 셋 다 대상으로 함(디바운스된 검색어 기준, 위치 필터 범위 안에서).
  const searchTerm = debouncedSearch.trim().toLowerCase()
  const filteredLots = locationScopedLots.filter(lot => {
    const matchSearch = !searchTerm
      || (lot.reagents?.name || '').toLowerCase().includes(searchTerm)
      || (lot.reagents?.cas_no || '').toLowerCase().includes(searchTerm)
      || (lot.lot_no || '').toLowerCase().includes(searchTerm)
    const count = counts[lot.id]
    const isDone = count?.actual_stock != null
    const bookStock = count?.book_stock ?? lot.current_stock
    const stockDiff = isDone ? Math.abs(count.actual_stock - bookStock) : 0
    if (filter === 'undone' && isDone) return false
    if (filter === 'diff' && stockDiff === 0) return false
    return matchSearch
  })

  // 범위가 넓은 실사(예: 전체)에서 수백~수천 행을 한꺼번에 그리면 페이지가 멈춘 것처럼 느려짐 —
  // 검색/필터 없이 볼 때는 캡 윈도우(capStart~capStart+RENDER_CAP)만 렌더링.
  // 알파벳 인덱스로 점프하면 전체를 다 풀지 않고 이 윈도우를 대상 근처로 옮긴다(성능 유지).
  const RENDER_CAP = 300
  const isCapped = !searchTerm && filter === 'all' && filteredLots.length > RENDER_CAP
  const cappedStart = Math.min(capStart, Math.max(0, filteredLots.length - RENDER_CAP))
  const visibleLots = isCapped ? filteredLots.slice(cappedStart, cappedStart + RENDER_CAP) : filteredLots

  const doneCnt = lots.filter(l => counts[l.id]?.actual_stock != null).length
  const pct = lots.length > 0 ? Math.round(doneCnt / lots.length * 100) : 0

  // 상태 배지: 일치(장부=실측, 초록) / 미입력(회색) / 차이있음(장부≠실측, 빨강)
  function rowStatus(lot) {
    const count = counts[lot.id]
    const isDone = count?.actual_stock != null
    if (!isDone) return 'empty'
    const bookStock = count?.book_stock ?? lot.current_stock
    const stockDiff = Math.abs(count.actual_stock - bookStock)
    return stockDiff !== 0 ? 'diff' : 'ok'
  }
  const STATUS_BADGE = {
    ok:    { label: '일치', bg: '#E8F5E9', color: '#2E7D32' },
    empty: { label: '미입력', bg: '#F1EFE8', color: '#888780' },
    diff:  { label: '차이있음', bg: '#FCEBEB', color: '#791F1F' },
  }

  // 시약 정보 열 — 잔량과 같은 방식으로 Tab/Enter 이동하며 직접입력, 장부값과 다르면 파란 테두리.
  // scope='reagent'면 시약 자체(이름/CAS/회사/성상/용량/단위, 여러 Lot이 공유)를 고치는 거고,
  // scope='lot'이면 이 Lot 고유정보(Cat No./Lot No.)만 고치는 거라 book/staged 스냅샷이 따로 있음.
  function fieldInputCell(lot, idx, field, width = 90, scope = 'reagent') {
    const c = counts[lot.id]
    const isLot = scope === 'lot'
    const book = (isLot ? c?.book_lot_fields : c?.book_reagent_fields) || {}
    const staged = (isLot ? c?.staged_lot_fields : c?.staged_reagent_fields) || {}
    const bookVal = book[field] ?? (isLot ? lot[field] : lot.reagents?.[field]) ?? ''
    const current = field in staged ? staged[field] : bookVal
    const changed = field in staged && staged[field] !== bookVal
    const saveFn = isLot ? saveLotField : saveReagentField
    return (
      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <input
          ref={el => inputRefs.current[`${field}_${lot.id}`] = el}
          defaultValue={current}
          onBlur={e => saveFn(lot, field, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              saveFn(lot, field, e.target.value)
              const nextLot = visibleLots[idx + 1]
              if (nextLot && inputRefs.current[`${field}_${nextLot.id}`]) inputRefs.current[`${field}_${nextLot.id}`].focus()
            }
          }}
          style={{
            width: `${width}px`, padding: '5px 8px', borderRadius: '6px',
            border: `1px solid ${changed ? '#1565C0' : 'transparent'}`,
            fontSize: '12px', background: changed ? '#EAF1FB' : 'transparent',
          }}
        />
      </td>
    )
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>

  return (
    <div>
      <PageBanner title="실사 입력" sub={`${session.year}년 재고 실사 · ${myName}`} breadcrumb={['홈', '재고 실사', '실사 입력']} />

      <div style={{ padding: '20px 40px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
          <button onClick={onBack} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>← 뒤로</button>
        </div>

        {/* ── ① 검색 & 대조/수정 영역 (상단) ── */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
          <div ref={searchBoxRef} style={{ position: 'relative' }}>
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setCompareLot(null); setCompareCandidates([]); setNewEntryMode(false); setSearchOpen(true) }}
              onFocus={() => { if (search.trim()) setSearchOpen(true) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEnter() } }}
              placeholder="시약명 / CAS / Lot No. 검색 후 Enter"
              style={{ ...inputStyle, fontSize: '14px', padding: '9px 12px' }}
            />
            {searchOpen && search.trim() && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', overflowY: 'auto',
              }}>
                {dropdownLots.length > 0 ? dropdownLots.map(lot => {
                  const s = STATUS_BADGE[rowStatus(lot)]
                  return (
                    <div key={lot.id} onClick={() => openComparePanel(lot)}
                      style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: C.navy }}>{lot.reagents?.name}</div>
                        <div style={{ fontSize: '11px', color: C.muted }}>
                          Lot {lot.lot_no || '(번호 없음)'} · {lot.locations?.room || '-'}{lot.locations?.detail ? ` · ${lot.locations.detail}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '12px', fontWeight: '700', background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                  )
                }) : (
                  <div onClick={startNewEntry} style={{ padding: '12px 14px', cursor: 'pointer', fontSize: '13px', color: '#92400E' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FFF8E7'}
                    onMouseLeave={e => e.currentTarget.style.background = C.white}>
                    "{search.trim()}" 기존 목록에 없습니다 — 클릭해서 신규 등록하기
                  </div>
                )}
              </div>
            )}
          </div>
          {savedMsg && <div style={{ fontSize: '12px', color: '#2E7D32', marginTop: '8px' }}>✓ 수정되었습니다 · 다음 시약으로 이동</div>}

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '12px', paddingTop: '12px' }}>
            {compareCandidates.length > 0 ? (
              <div>
                <div style={{ fontSize: '12.5px', color: '#92400E', marginBottom: '8px' }}>
                  같은 이름으로 등록된 Lot이 {compareCandidates.length}개예요 — 어떤 Lot을 확인/수정할지 골라주세요.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {compareCandidates.map(c => (
                    <div key={c.id} onClick={() => openComparePanel(c)}
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span>Lot {c.lot_no || '(번호 없음)'} · {c.locations?.room || '-'}{c.locations?.detail ? ` · ${c.locations.detail}` : ''}</span>
                      <span style={{ color: C.muted }}>장부 잔량 {counts[c.id]?.book_stock ?? c.current_stock}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : newEntryMode ? (
              <>
                <div style={{ fontSize: '12.5px', color: '#92400E', marginBottom: '10px' }}>
                  "{newEntryForm.name}" — 기존 목록에 없는 시약이에요. 정보를 입력하고 등록 완료를 누르세요.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 16px', fontSize: '13px' }}>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>화학물질명 *</div>
                    <input value={newEntryForm.name} onChange={e => setNewEntryForm({ ...newEntryForm, name: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>CAS No.</div>
                    <input value={newEntryForm.cas_no} onChange={e => setNewEntryForm({ ...newEntryForm, cas_no: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>회사</div>
                    <input value={newEntryForm.company} onChange={e => setNewEntryForm({ ...newEntryForm, company: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>Cat No.</div>
                    <input value={newEntryForm.cat_no} onChange={e => setNewEntryForm({ ...newEntryForm, cat_no: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>Lot No.</div>
                    <input value={newEntryForm.lot_no} onChange={e => setNewEntryForm({ ...newEntryForm, lot_no: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>성상</div>
                    <input value={newEntryForm.category} onChange={e => setNewEntryForm({ ...newEntryForm, category: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted }}>규격</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                      <input value={newEntryForm.volume} onChange={e => setNewEntryForm({ ...newEntryForm, volume: e.target.value })} placeholder="용량"
                        style={{ ...inputStyle, width: '60px', padding: '5px 8px', fontSize: '13px' }} />
                      <input value={newEntryForm.unit} onChange={e => setNewEntryForm({ ...newEntryForm, unit: e.target.value })} placeholder="단위"
                        style={{ ...inputStyle, width: '55px', padding: '5px 8px', fontSize: '13px' }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted }}>위치 *</div>
                    <select value={newEntryForm.location_id} onChange={e => setNewEntryForm({ ...newEntryForm, location_id: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }}>
                      <option value="">선택하세요</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                    </select>
                  </div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>잔량(%)</div>
                    <input type="number" min="0" max="100" value={newEntryForm.current_stock} onChange={e => setNewEntryForm({ ...newEntryForm, current_stock: e.target.value })}
                      style={{ ...inputStyle, width: '80px', padding: '5px 8px', marginTop: '2px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>비고</div>
                    <input value={newEntryForm.abnormal_note} onChange={e => setNewEntryForm({ ...newEntryForm, abnormal_note: e.target.value })} placeholder="메모"
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '12px' }} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                  <button onClick={cancelNewEntry} style={{ ...btnGhost, padding: '7px 16px', fontSize: '13px' }}>취소</button>
                  <button onClick={submitInlineNewReagent} style={{ ...btnPrimary, padding: '7px 16px', fontSize: '13px' }}>🆕 등록 완료</button>
                </div>
              </>
            ) : (() => {
              const count = compareLot ? counts[compareLot.id] : null
              const bookStock = compareLot ? (count?.book_stock ?? compareLot.current_stock) : null
              const book = count?.book_reagent_fields || {}
              const staged = count?.staged_reagent_fields || {}
              const disabledBoxStyle = { ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: C.bg, color: C.muted }

              // 시약명/CAS/회사도 실측값처럼 담당자가 직접 확인해서 고칠 수 있는 입력칸으로 표시(단, "-" 텍스트가 아니라 네모 입력칸)
              function panelMasterField(field, width, scope = 'reagent') {
                if (!compareLot) return <input disabled placeholder="-" style={{ ...disabledBoxStyle, width: `${width}px` }} />
                const isLot = scope === 'lot'
                const b = isLot ? (count?.book_lot_fields || {}) : book
                const st = isLot ? (count?.staged_lot_fields || {}) : staged
                const bookVal = b[field] ?? (isLot ? compareLot[field] : compareLot.reagents?.[field]) ?? ''
                const current = field in st ? st[field] : bookVal
                const saveFn = isLot ? saveLotField : saveReagentField
                return (
                  <input key={`${compareLot.id}_${field}`} defaultValue={current}
                    onBlur={e => saveFn(compareLot, field, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveFn(compareLot, field, e.target.value) } }}
                    style={{ ...inputStyle, width: `${width}px`, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} />
                )
              }

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 16px', fontSize: '13px' }}>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>화학물질명</div>{panelMasterField('name', 150)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>CAS No.</div>{panelMasterField('cas_no', 120)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>회사</div>{panelMasterField('company', 120)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>Cat No.</div>{panelMasterField('cat_no', 100, 'lot')}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>Lot No.</div>{panelMasterField('lot_no', 100, 'lot')}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>성상</div>{panelMasterField('category', 100)}</div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>규격</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>{panelMasterField('volume', 60)}{panelMasterField('unit', 55)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>위치</div>
                      {compareLot ? (
                        <select value={counts[compareLot.id]?.staged_location_id ?? compareLot.location_id ?? ''} onChange={e => changeLocation(compareLot, e.target.value)}
                          style={{ ...inputStyle, width: '140px', padding: '5px 8px', marginTop: '2px', fontSize: '13px' }}>
                          <option value="">(위치 없음)</option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                        </select>
                      ) : (
                        <select disabled style={{ ...disabledBoxStyle, width: '140px' }}><option>-</option></select>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>잔량(%)</div>
                      {compareLot ? (
                        <input key={compareLot.id} ref={comparePanelInputRef} type="number" min="0" max="100" defaultValue={count?.actual_stock ?? bookStock}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); completeButtonRef.current?.focus() } }}
                          style={{ ...inputStyle, width: '80px', padding: '5px 8px', marginTop: '2px' }} />
                      ) : (
                        <input disabled placeholder="-" style={{ ...disabledBoxStyle, width: '80px' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>비고</div>
                      {compareLot ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                          <label title="미확인(분실) 표시" style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', color: C.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={!!count?.reported_missing} onChange={() => toggleMissing(compareLot)} /> 미확인
                          </label>
                          <input defaultValue={count?.abnormal_note || ''} placeholder="메모"
                            onBlur={e => saveAbnormalNote(compareLot, e.target.value)}
                            style={{ ...inputStyle, width: '90px', padding: '5px 8px', fontSize: '12px' }} />
                        </div>
                      ) : (
                        <input disabled placeholder="-" style={{ ...disabledBoxStyle, width: '140px' }} />
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                    <button ref={completeButtonRef} onClick={saveComparePanel} disabled={!compareLot} style={{ ...btnPrimary, padding: '7px 16px', fontSize: '13px', opacity: compareLot ? 1 : 0.4, cursor: compareLot ? 'pointer' : 'default' }}>완료</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* ── ② 진행률 · 필터 · 목록 영역 ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>
              {!isAdmin && myAssignments.length > 0 ? `내 배정 구역 · ${myAssignments.map(a => a.zone).join(', ')}` : '전체 구역'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '18px', fontWeight: '700', color: C.navy }}>{doneCnt} / {lots.length}</span>
              <span style={{ fontSize: '12px', color: C.muted }}>완료 ({pct}%)</span>
            </div>
            <div style={{ height: '6px', background: C.bg, borderRadius: '3px', overflow: 'hidden', marginTop: '6px', width: '220px' }}>
              <div style={{ height: '100%', borderRadius: '3px', background: pct === 100 ? '#38A169' : C.navy, width: `${pct}%`, transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {[['all', '전체'], ['undone', '미입력'], ['diff', '장부와 차이있음']].map(([key, label]) => (
              <button key={key} onClick={() => { setFilter(key); setCapStart(0) }} style={{
                padding: '6px 12px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                background: filter === key ? C.navy : C.bg, color: filter === key ? '#fff' : C.text,
                fontSize: '12px', fontWeight: filter === key ? '700' : '400',
              }}>{label}</button>
            ))}
            {Object.keys(sessionLocationGroups).length > 0 && (
              <select value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setCapStart(0) }}
                style={{ ...inputStyle, width: 'auto', maxWidth: '190px' }}>
                <option value="">📍 전체 위치</option>
                {Object.entries(sessionLocationGroups).map(([room, locMap]) => (
                  <optgroup key={room} label={room}>
                    {[...locMap.entries()].map(([locId, label]) => (
                      <option key={locId} value={locId}>{label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
          {searchTerm && (
            <span style={{ fontSize: '12px', color: C.muted }}>
              "{debouncedSearch.trim()}" 검색 결과 <b style={{ color: C.blue }}>{filteredLots.length}건</b>{' '}
              <button onClick={() => { setSearch(''); setDebouncedSearch(''); setCompareLot(null); setCompareCandidates([]); setNewEntryMode(false); setSearchOpen(false) }}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>✕ 초기화</button>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '18px', alignItems: 'center', marginBottom: '10px', fontSize: '12px', color: C.muted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ display: 'inline-block', width: '13px', height: '13px', borderRadius: '4px', border: `2px solid ${C.border}` }} />
            회색 테두리: 아직 확인 안 함
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ display: 'inline-block', width: '13px', height: '13px', borderRadius: '4px', border: '2px solid transparent', background: '#F5F5F5' }} />
            테두리 없음: 장부값과 일치 확인됨
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ display: 'inline-block', width: '13px', height: '13px', borderRadius: '4px', border: '2px solid #FFCDD2' }} />
            빨강: 장부값과 차이 있음 — 실제 값으로 고쳐졌어요
          </span>
          <span style={{ fontWeight: '600', color: C.navy }}>💡 병을 확인했는데 숫자가 맞으면 아무것도 고치지 말고 Enter만 누르세요. 그대로 저장되고 다음 항목으로 넘어갑니다.</span>
        </div>

        {isAdmin && (
          <NewRegistrationSummary session={session} />
        )}

        {isCapped && (
          <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#92400E' }}>
            ⚠️ 범위가 넓어 {filteredLots.length}개 중 {cappedStart + 1}~{cappedStart + visibleLots.length}번째만 표시하고 있어요. 오른쪽 알파벳 인덱스로 이동하거나, 검색·"미입력"/"차이있음" 필터를 사용하세요.
          </div>
        )}

        {/* ── 테이블 + 알파벳 인덱스 ── */}
        {/* 시약 목록 화면과 행 높이를 맞추기 위해 이 표 안의 셀/입력칸 패딩만 좁게(className으로 스코프) */}
        <style>{`
          .inv-count-table td { padding: 4px 8px !important; }
          .inv-count-table input, .inv-count-table select { padding: 3px 6px !important; margin-top: 0 !important; font-size: 12.5px !important; }
        `}</style>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflowX: 'auto', overflowY: 'hidden' }}>
            <table className="inv-count-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>화학물질명</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>CAS No.</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>회사</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Cat No.</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Lot No.</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>성상</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }} colSpan={2}>규격</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>위치</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>잔량(%)</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>비고</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>{isAdmin ? '입력자' : '입력일'}</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>조치</th>
                </tr>
              </thead>
              <tbody>
                {visibleLots.length === 0
                  ? <tr><td colSpan={13} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>해당하는 항목이 없습니다.</td></tr>
                  : visibleLots.map((lot, idx) => {
                    const count = counts[lot.id]
                    const bookStock = count?.book_stock ?? lot.current_stock
                    const actualStock = count?.actual_stock
                    const isDone = actualStock != null
                    const hasStockDiff = actualStock != null && actualStock !== bookStock
                    const isSavingNow = saving[lot.id]
                    const rowBg = count?.reported_missing ? '#FFF3E0' : hasStockDiff ? '#FFF8F8' : isDone ? '#F0FFF4' : C.white

                    return (
                      <tr key={lot.id} ref={el => rowRefs.current[lot.id] = el}
                        style={{ background: rowBg }}>
                        <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <input
                              ref={el => inputRefs.current[`name_${lot.id}`] = el}
                              defaultValue={counts[lot.id]?.staged_reagent_fields?.name ?? counts[lot.id]?.book_reagent_fields?.name ?? lot.reagents?.name ?? ''}
                              onBlur={e => saveReagentField(lot, 'name', e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  saveReagentField(lot, 'name', e.target.value)
                                  const nextLot = visibleLots[idx + 1]
                                  if (nextLot && inputRefs.current[`name_${nextLot.id}`]) inputRefs.current[`name_${nextLot.id}`].focus()
                                }
                              }}
                              style={{
                                width: '150px', padding: '5px 8px', borderRadius: '6px', fontWeight: '600', color: C.navy,
                                border: `1px solid ${counts[lot.id]?.staged_reagent_fields?.name && counts[lot.id].staged_reagent_fields.name !== (counts[lot.id]?.book_reagent_fields?.name ?? lot.reagents?.name ?? '') ? '#1565C0' : 'transparent'}`,
                                fontSize: '13px', background: counts[lot.id]?.staged_reagent_fields?.name && counts[lot.id].staged_reagent_fields.name !== (counts[lot.id]?.book_reagent_fields?.name ?? lot.reagents?.name ?? '') ? '#EAF1FB' : 'transparent',
                              }}
                            />
                          </div>
                        </td>
                        {fieldInputCell(lot, idx, 'cas_no', 100)}
                        {fieldInputCell(lot, idx, 'company', 100)}
                        {fieldInputCell(lot, idx, 'cat_no', 90, 'lot')}
                        {fieldInputCell(lot, idx, 'lot_no', 90, 'lot')}
                        {fieldInputCell(lot, idx, 'category', 80)}
                        {fieldInputCell(lot, idx, 'volume', 55)}
                        {fieldInputCell(lot, idx, 'unit', 50)}
                        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <select value={counts[lot.id]?.staged_location_id ?? lot.location_id ?? ''} onChange={e => changeLocation(lot, e.target.value)}
                            style={{
                              fontSize: '11px', padding: '4px 6px', borderRadius: '6px', maxWidth: '130px',
                              border: `1px solid ${counts[lot.id]?.staged_location_id ? '#1565C0' : 'transparent'}`,
                              background: counts[lot.id]?.staged_location_id ? '#EAF1FB' : 'transparent',
                            }}>
                            <option value="">(위치 없음)</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                          </select>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input
                            key={`stock_${lot.id}_${actualStock ?? 'x'}`}
                            ref={el => inputRefs.current[`stock_${lot.id}`] = el}
                            type="number" min="0" max="100"
                            defaultValue={actualStock ?? bookStock}
                            placeholder={String(bookStock)}
                            onBlur={e => saveStock(lot, e.target.value !== '' ? e.target.value : bookStock)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); confirmRow(lot, idx, visibleLots, bookStock) }
                            }}
                            style={{
                              width: '72px', padding: '5px 8px', borderRadius: '6px', textAlign: 'center',
                              border: `2px solid ${isDone ? (hasStockDiff ? '#FFCDD2' : 'transparent') : C.border}`,
                              fontSize: '14px', fontWeight: '600', background: isSavingNow ? '#FFF8E7' : (isDone && !hasStockDiff ? 'transparent' : C.white),
                            }}
                          />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                            <input type="checkbox" checked={!!count?.reported_missing} onChange={() => toggleMissing(lot)}
                              title="미확인(분실) 표시" style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }} />
                            <input
                              ref={el => inputRefs.current[`abnormal_${lot.id}`] = el}
                              type="text" defaultValue={count?.abnormal_note || ''} placeholder="메모"
                              onBlur={e => saveAbnormalNote(lot, e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  saveAbnormalNote(lot, e.target.value)
                                  const nextLot = visibleLots[idx + 1]
                                  if (nextLot && inputRefs.current[`abnormal_${nextLot.id}`]) inputRefs.current[`abnormal_${nextLot.id}`].focus()
                                }
                              }}
                              style={{
                                width: '80px', padding: '5px 8px', borderRadius: '6px',
                                border: `1px solid ${count?.abnormal_note ? C.danger : C.border}`,
                                fontSize: '12px', background: C.white,
                              }}
                            />
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>
                          {isAdmin ? (
                            <>
                              {count?.counted_by || '-'}
                              {count?.counted_at && <span style={{ fontSize: '10px', marginLeft: '4px' }}>· {new Date(count.counted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>}
                            </>
                          ) : (
                            count?.counted_at ? new Date(count.counted_at).toLocaleDateString('ko-KR') : '-'
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          {disposingLotId === lot.id ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', maxWidth: '190px' }}>
                              {DISPOSAL_REASONS.map(reason => (
                                <button key={reason} onClick={() => requestDisposal(lot, reason)} style={{ ...smallBtnStyle(), background: '#FDECEC', borderColor: '#F3D6D6', color: '#C13B3F', whiteSpace: 'nowrap' }}>{reason}</button>
                              ))}
                              <button onClick={() => setDisposingLotId(null)} style={{ ...smallBtnStyle(), whiteSpace: 'nowrap' }}>취소</button>
                            </div>
                          ) : (
                            <button onClick={() => setDisposingLotId(lot.id)} style={{ ...smallBtnStyle(), whiteSpace: 'nowrap' }}>폐기신청</button>
                          )}
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
    </div>
  )
}

// 관리자용 — 이번 실사에서 새로 등록된 시약 모아보기(1단계 완료 처리 전 검토용)
// 신규 등록된 시약이, 이번 실사에서 다른 위치에 "미확인" 처리된 시약과 이름이 같으면
// "혹시 그게 잘못 보관돼서 여기서 새로 등록된 거 아닐까?"를 관리자가 알아챌 수 있게 표시.
function NewRegistrationSummary({ session }) {
  const [rows, setRows] = useState([])
  const [missingByName, setMissingByName] = useState(new Map()) // 시약명 -> 원래 있어야 했던 위치명
  async function fetchRows() {
    const { data } = await supabase.from('inventory_counts')
      .select('*, reagents(name), reagent_lots(lot_no)')
      .eq('session_id', session.id).eq('is_new_registration', true)
      .order('counted_at', { ascending: false })
    setRows(data || [])
  }
  async function fetchMissing() {
    const [{ data: missing }, { data: locs }] = await Promise.all([
      supabase.from('inventory_counts').select('reagents(name), book_location_id')
        .eq('session_id', session.id).eq('reported_missing', true),
      supabase.from('locations').select('id, room, detail'),
    ])
    const locById = new Map((locs || []).map(l => [l.id, `${l.room}${l.detail ? ' · ' + l.detail : ''}`]))
    const map = new Map()
    ;(missing || []).forEach(m => {
      if (m.reagents?.name) map.set(m.reagents.name, locById.get(m.book_location_id) || '다른 위치')
    })
    setMissingByName(map)
  }
  useEffect(() => { fetchRows(); fetchMissing() }, [session.id])
  if (rows.length === 0) return null
  return (
    <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E', marginBottom: '6px' }}>🆕 이번 실사에서 새로 등록된 시약 ({rows.length}건)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {rows.map(r => {
          const originalLoc = missingByName.get(r.reagents?.name)
          return (
            <span key={r.id} title={originalLoc ? `같은 이름의 시약이 "${originalLoc}"에서 미확인(분실) 처리됨 — 잘못 보관돼서 여기서 새로 등록된 걸 수도 있어요` : undefined}
              style={{ fontSize: '12px', background: C.white, border: `1px solid ${originalLoc ? C.danger : '#F0DBAE'}`, borderRadius: '20px', padding: '3px 10px', color: originalLoc ? C.danger : '#92400E', fontWeight: originalLoc ? '700' : '400' }}>
              {r.reagents?.name} (Lot {r.reagent_lots?.lot_no || '번호없음'}){originalLoc && ` ⚠️ ${originalLoc}에서 미확인됨`}
            </span>
          )
        })}
      </div>
    </div>
  )
}
