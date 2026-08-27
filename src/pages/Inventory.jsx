import { useEffect, useState, useRef } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, btnPrimary, btnGhost, inputStyle, labelStyle, thStyle, tdStyle } from '../design'
import DateSplitInput from '../components/DateSplitInput'

const PURPOSE_LABEL = { quantity_status: '재고/상태확인', comprehensive: '종합실사' }

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
  const [startForm, setStartForm] = useState({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', purpose: 'comprehensive', zones: [] })
  const [zoneMode, setZoneMode] = useState('all') // 'all' | 'select' — startForm.zones에 가짜 플레이스홀더를 넣지 않기 위한 별도 UI 상태
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
      purpose: startForm.purpose, zones: startForm.zones?.length ? startForm.zones : null,
    }).select().single()
    if (data) {
      const lots = await fetchAllPages((from, to) => supabase.from('reagent_lots')
        .select('id, reagent_id, sealed_count, current_stock, status, location_id, locations(room, detail)')
        .eq('status', 'active').range(from, to))
      if (lots) {
        let filtered = lots
        if (startForm.zones && startForm.zones.length > 0) {
          filtered = lots.filter(l => {
            const room = l.locations?.room || ''
            const detail = l.locations?.detail || ''
            return startForm.zones.some(z => room === z || detail === z)
          })
        }
        const rows = filtered.map(l => ({
          session_id: data.id, reagent_id: l.reagent_id, lot_id: l.id,
          book_sealed: l.sealed_count, book_stock: l.current_stock,
          book_status: l.status, book_location_id: l.location_id,
        }))
        for (let i = 0; i < rows.length; i += 100) await supabase.from('inventory_counts').insert(rows.slice(i, i + 100))
        setActiveSession(data)
        setShowStartModal(false)
        setStartForm({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', purpose: 'comprehensive', zones: [] })
        setZoneMode('all')
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
        reported_missing: false, abnormal_note: null, staged_location_id: null,
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
    for (const c of counts) {
      const actorLabel = `[실사] ${c.counted_by || activeSession.created_by}`
      if (!c.is_new_registration) {
        const afterSealed = c.actual_sealed
        const afterStock = c.actual_stock ?? c.book_stock
        const lotFields = {
          sealed_count: afterSealed, current_stock: afterStock,
          needs_review: false, pending_confirm: true,
        }
        if (c.reported_missing) lotFields.status = 'missing'
        if (c.staged_location_id) lotFields.location_id = c.staged_location_id
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
      .or('actual_sealed.not.is.null,is_new_registration.eq.true').range(from, to))
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
      .or('actual_sealed.not.is.null,is_new_registration.eq.true').range(from, to))
    if (counts) await applyCounts(counts)
    await supabase.from('inventory_assignments').update({ completed_at: new Date().toISOString() }).eq('session_id', activeSession.id).is('completed_at', null)
    fetchAssignments(); fetchProgress()
    alert('실사가 완료 처리되었습니다! 관리자 검토 후 "최종 DB 반영하기"를 눌러야 확정됩니다.')
  }

  // 2단계 — 관리자가 전체 변경사항을 검토한 뒤 최종 확정. 값은 이미 1단계에서 반영돼
  // 있으므로 pending_confirm만 끄고 세션을 completed로 닫는다(재기록 없음).
  async function finalizeSession() {
    if (!window.confirm('모든 변경사항을 최종 DB에 반영하시겠습니까?\n반영 후에는 구역별 되돌리기가 불가능합니다.')) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts').select('lot_id').eq('session_id', activeSession.id)
      .or('actual_sealed.not.is.null,is_new_registration.eq.true').range(from, to))
    const lotIds = [...new Set((counts || []).map(c => c.lot_id))]
    if (lotIds.length > 0) {
      for (let i = 0; i < lotIds.length; i += 200) {
        await supabase.from('reagent_lots').update({ pending_confirm: false }).in('id', lotIds.slice(i, i + 200))
      }
    }
    await supabase.from('inventory_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', activeSession.id)
    alert('실사가 최종 확정되었습니다!')
    setActiveSession(null)
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
      for (const c of zoneCounts) {
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
      student={student}
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
              sub={`시작일: ${activeSession.start_date} · 시작자: ${activeSession.created_by} · ${PURPOSE_LABEL[activeSession.purpose] || '종합실사'} · 범위: ${activeSession.zones?.length ? activeSession.zones.join(', ') : '전체'}`}
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
              <DateSplitInput value={startForm.start_date} onChange={v => setStartForm({ ...startForm, start_date: v })} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>관리자 이름 *</label>
              <input value={startForm.created_by} onChange={e => setStartForm({ ...startForm, created_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>실사 목적</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {Object.entries(PURPOSE_LABEL).map(([key, label]) => (
                  <button key={key} onClick={() => setStartForm({ ...startForm, purpose: key })} style={{
                    flex: 1, padding: '8px 10px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '700', cursor: 'pointer',
                    border: `1px solid ${startForm.purpose === key ? C.navy : C.border}`,
                    background: startForm.purpose === key ? C.navy : C.white,
                    color: startForm.purpose === key ? '#fff' : C.text,
                  }}>{label}</button>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>
                {startForm.purpose === 'comprehensive' ? '수량/상태/위치 확인 및 변경/신규시약·Lot등록/폐기예정/미확인 모두' : '수량/상태 확인 및 이상여부 기록 위주'}
              </div>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>실사 범위</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => { setZoneMode('all'); setStartForm({ ...startForm, zones: [] }) }} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${zoneMode === 'all' ? C.navy : C.border}`, background: zoneMode === 'all' ? C.navy : C.white, color: zoneMode === 'all' ? '#fff' : C.text }}>전체</button>
                <button onClick={() => setZoneMode('select')} style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', border: `1px solid ${zoneMode === 'select' ? C.navy : C.border}`, background: zoneMode === 'select' ? C.navy : C.white, color: zoneMode === 'select' ? '#fff' : C.text }}>구역 선택</button>
              </div>
              {zoneMode === 'select' && (
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
function InventoryCountView({ session, myName, student, myAssignments, isAdmin, onBack }) {
  const [lots, setLots] = useState([])
  const [counts, setCounts] = useState({})
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)   // ← 드롭다운 열림 여부
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState({})
  const [stockPicker, setStockPicker] = useState(null)
  const [changeModal, setChangeModal] = useState(null)
  const [changeForm, setChangeForm] = useState({ field_name: 'name', new_value: '' })
  const [abnormalModal, setAbnormalModal] = useState(null) // lot
  const [abnormalNote, setAbnormalNote] = useState('')
  const [disposalModal, setDisposalModal] = useState(null) // lot
  const [disposalReason, setDisposalReason] = useState('')
  const [locationModal, setLocationModal] = useState(null) // lot
  const [locationChoice, setLocationChoice] = useState('')
  const [showNewRegModal, setShowNewRegModal] = useState(false)
  const [newRegSearch, setNewRegSearch] = useState('')
  const [newRegCandidates, setNewRegCandidates] = useState([])
  const [newRegSelected, setNewRegSelected] = useState(null) // 기존 시약 후보 선택
  const [newRegForm, setNewRegForm] = useState({ name: '', cas_no: '', company: '', hazard: '', category: '', volume: '', unit: '', lot_no: '', sealed_count: '1', current_stock: '100', location_id: '' })
  const inputRefs = useRef({})
  const rowRefs = useRef({})       // ← 알파벳 인덱스용 행 ref
  const searchRef = useRef(null)   // ← 드롭다운 외부 클릭 감지

  useEffect(() => { fetchLots(); fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

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
    const countData = await fetchAllPages((from, to) => supabase.from('inventory_counts').select('*').eq('session_id', session.id).range(from, to))
    const lotIds = (countData || []).map(c => c.lot_id)
    if (lotIds.length === 0) { setLots([]); setCounts({}); setLoading(false); return }
    let lotData = []
    for (let i = 0; i < lotIds.length; i += 500) {
      const { data } = await supabase.from('reagent_lots')
        .select('*, reagents(id, name, cas_no, company, category, hazard, volume, unit), locations(room, detail)')
        .in('id', lotIds.slice(i, i + 500))
      lotData = lotData.concat(data || [])
    }
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

  async function saveCount(lot, field, value) {
    const numVal = Number(value)
    if (isNaN(numVal) || numVal < 0) return
    setSaving(prev => ({ ...prev, [lot.id]: true }))
    const existing = counts[lot.id]
    const updateData = { [field]: numVal, counted_by: myName, counted_by_student_id: student?.student_id ?? null, counted_at: new Date().toISOString() }
    if (existing) {
      await supabase.from('inventory_counts').update(updateData).eq('id', existing.id)
      setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], ...updateData } }))
    }
    setSaving(prev => ({ ...prev, [lot.id]: false }))
  }

  // 미확인(분실) 표시 — 스테이징만(실사 완료 처리 시점에 reagent_lots.status='missing'으로 반영)
  async function toggleMissing(lot) {
    const existing = counts[lot.id]
    if (!existing) return
    const next = !existing.reported_missing
    await supabase.from('inventory_counts').update({ reported_missing: next }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], reported_missing: next } }))
  }

  function openAbnormalModal(lot) {
    setAbnormalNote(counts[lot.id]?.abnormal_note || '')
    setAbnormalModal(lot)
  }
  async function submitAbnormalNote() {
    const existing = counts[abnormalModal.id]
    if (!existing) return
    await supabase.from('inventory_counts').update({ abnormal_note: abnormalNote.trim() || null }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [abnormalModal.id]: { ...prev[abnormalModal.id], abnormal_note: abnormalNote.trim() || null } }))
    setAbnormalModal(null)
    setAbnormalNote('')
  }

  // 폐기 신청 — 실사 완료 처리 흐름과 무관하게 기존 disposal_requests 신청→승인 구조 그대로 재사용
  function openDisposalModal(lot) {
    setDisposalReason('')
    setDisposalModal(lot)
  }
  async function submitDisposalRequest() {
    if (!myName.trim()) { alert('로그인 후 이용해주세요'); return }
    const lot = disposalModal
    await supabase.from('disposal_requests').insert({
      reagent_id: lot.reagent_id, lot_id: lot.id, lot_no: lot.lot_no,
      reagent_name: lot.reagents?.name, requested_by: myName, requested_by_student_id: student?.student_id ?? null,
      reason: disposalReason.trim() || null, status: 'pending',
    })
    alert('폐기 신청이 제출됐어요. 관리자 승인 후 처리됩니다.')
    setDisposalModal(null)
    setDisposalReason('')
  }

  // 위치 변경(종합실사 전용) — 스테이징만(실사 완료 처리 시점에 location_id 반영 + location_history 기록)
  function openLocationModal(lot) {
    setLocationChoice(counts[lot.id]?.staged_location_id || lot.location_id || '')
    setLocationModal(lot)
  }
  async function submitLocationChange() {
    const existing = counts[locationModal.id]
    if (!existing || !locationChoice) return
    await supabase.from('inventory_counts').update({ staged_location_id: locationChoice }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [locationModal.id]: { ...prev[locationModal.id], staged_location_id: locationChoice } }))
    setLocationModal(null)
  }

  // 신규(미등록) 시약 등록 — 이름 검색으로 중복 방지 후 기존에 Lot 추가 / 신규 등록.
  // 즉시 reagents/reagent_lots에 반영(진짜 생성)하고, 이번 세션 inventory_counts에도
  // 바로 편입시켜 진행률에 포함 + "완료" 상태로 시작(실사에서 방금 실측한 값이므로).
  function openNewRegModal() {
    setNewRegSearch(''); setNewRegCandidates([]); setNewRegSelected(null)
    setNewRegForm({ name: '', cas_no: '', company: '', hazard: '', category: '', volume: '', unit: '', lot_no: '', sealed_count: '1', current_stock: '100', location_id: '' })
    setShowNewRegModal(true)
  }
  async function searchNewRegCandidates(q) {
    setNewRegSearch(q)
    setNewRegSelected(null)
    if (!q.trim()) { setNewRegCandidates([]); return }
    const { data } = await supabase.from('reagents').select('id, name, cas_no, company, reagent_lots(id)').ilike('name', `%${q.trim()}%`).neq('status', 'archived').limit(15)
    setNewRegCandidates((data || []).sort((a, b) => (b.reagent_lots?.length || 0) - (a.reagent_lots?.length || 0)))
  }
  async function submitNewRegistration() {
    if (!myName.trim()) { alert('로그인 후 이용해주세요'); return }
    if (!newRegForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    let reagentId = newRegSelected?.id
    if (!reagentId) {
      if (!newRegForm.name.trim()) { alert('시약 이름을 입력해주세요'); return }
      const { data: r, error } = await supabase.from('reagents').insert({
        name: newRegForm.name.trim(), cas_no: newRegForm.cas_no || null, company: newRegForm.company || null,
        hazard: newRegForm.hazard || null, category: newRegForm.category || null,
        volume: newRegForm.volume || null, unit: newRegForm.unit || null,
        reagent_type: 'purchased', status: 'active', registered_by: student?.student_id ?? null,
      }).select().single()
      if (error) { alert('시약 등록 실패: ' + error.message); return }
      reagentId = r.id
    }
    const sealedNum = Number(newRegForm.sealed_count) || 0
    const stockNum = Number(newRegForm.current_stock) || 0
    const { data: newLot, error: lotErr } = await supabase.from('reagent_lots').insert({
      reagent_id: reagentId, lot_no: newRegForm.lot_no || null,
      sealed_count: sealedNum, current_stock: stockNum,
      location_id: newRegForm.location_id, status: 'active',
    }).select().single()
    if (lotErr) { alert('Lot 등록 실패: ' + lotErr.message); return }
    await supabase.from('inventory_counts').insert({
      session_id: session.id, reagent_id: reagentId, lot_id: newLot.id,
      book_sealed: 0, book_stock: 0, book_status: 'active', book_location_id: newRegForm.location_id,
      actual_sealed: sealedNum, actual_stock: stockNum,
      counted_by: myName, counted_by_student_id: student?.student_id ?? null, counted_at: new Date().toISOString(),
      is_new_registration: true,
    })
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: newLot.id, user_name: `[실사] ${myName}`,
      before_sealed: 0, after_sealed: sealedNum, before_stock: 0, after_stock: stockNum,
    })
    alert('미등록 시약이 등록되고 이번 실사에 포함됐어요!')
    setShowNewRegModal(false)
    fetchLots()
  }

  async function submitChangeRequest() {
    if (!changeForm.new_value.trim()) { alert('변경할 값을 입력해주세요'); return }
    const reagent = changeModal.reagent
    const oldValue = reagent[changeForm.field_name] ?? ''
    await supabase.from('reagent_change_requests').insert({
      reagent_id: reagent.id, requested_by: myName, requested_by_student_id: student?.student_id ?? null,
      field_name: changeForm.field_name,
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
  const fieldLabels = { name: '시약명', volume: '용량', unit: '단위', category: '성상/유별', hazard: '유해위험성', cas_no: 'CAS No.', company: '회사' }

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
                        <div style={{ fontSize: '11px', color: C.muted }}>{lot.locations?.room}{lot.locations?.detail ? ` · ${lot.locations.detail}` : ''}</div>
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

          <button onClick={() => openNewRegModal()} style={{
            padding: '6px 14px', borderRadius: '14px', border: `1px solid ${C.gold}`, cursor: 'pointer',
            background: '#FFF8E7', color: '#92400E', fontSize: '12px', fontWeight: '700',
          }}>🆕 미등록 시약 등록</button>
        </div>

        {isAdmin && (
          <NewRegistrationSummary session={session} />
        )}

        {/* ── 테이블 + 알파벳 인덱스 ── */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['시약명', '위치', 'Lot No.', '장부(미개봉)', '실측(미개봉)', '잔량(%)', '차이', ...(isAdmin ? ['입력자'] : ['입력일']), '조치'].map(h => (
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

                    const displayLocation = counts[lot.id]?.staged_location_id
                      ? locations.find(l => l.id === counts[lot.id].staged_location_id)
                      : lot.locations
                    const rowBg = count?.reported_missing ? '#FFF3E0' : hasDiff ? '#FFF8F8' : isDone ? '#F0FFF4' : C.white

                    return (
                      <tr key={lot.id} ref={el => rowRefs.current[lot.id] = el}
                        style={{ background: rowBg }}>
                        <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px' }}>
                          {lot.reagents?.name || '-'}
                          {count?.reported_missing && <span style={{ marginLeft: '5px', fontSize: '10px', color: '#E65100', fontWeight: '700' }}>미확인</span>}
                          {count?.abnormal_note && <span title={count.abnormal_note} style={{ marginLeft: '5px', fontSize: '10px', color: C.danger, fontWeight: '700' }}>⚠ 이상</span>}
                          <div style={{ fontSize: '11px', color: C.muted, fontWeight: '400' }}>
                            {[lot.reagents?.cas_no, lot.reagents?.company].filter(Boolean).join(' · ') || '기준정보 없음'}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                          {displayLocation?.room || '-'}
                          {displayLocation?.detail && ` · ${displayLocation.detail}`}
                          {counts[lot.id]?.staged_location_id && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#1565C0' }}>(변경예정)</span>}
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
                          {isAdmin ? (
                            <>
                              {count?.counted_by || '-'}
                              {count?.counted_at && <div style={{ fontSize: '10px' }}>{new Date(count.counted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>}
                            </>
                          ) : (
                            count?.counted_at ? new Date(count.counted_at).toLocaleDateString('ko-KR') : '-'
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center', maxWidth: '220px' }}>
                            <button onClick={() => { setChangeModal({ lot, reagent: lot.reagents }); setChangeForm({ field_name: 'name', new_value: '' }) }} style={smallBtnStyle()}>정보 수정</button>
                            <button onClick={() => toggleMissing(lot)} style={smallBtnStyle(count?.reported_missing, '#E65100', '#FFF3E0')}>
                              {count?.reported_missing ? '미확인 취소' : '미확인 표시'}
                            </button>
                            <button onClick={() => openAbnormalModal(lot)} style={smallBtnStyle(!!count?.abnormal_note, C.danger, '#FFEBEE')}>이상기록</button>
                            <button onClick={() => openDisposalModal(lot)} style={smallBtnStyle()}>폐기신청</button>
                            {session.purpose === 'comprehensive' && (
                              <button onClick={() => openLocationModal(lot)} style={smallBtnStyle(!!counts[lot.id]?.staged_location_id, '#1565C0', '#E3F2FD')}>위치변경</button>
                            )}
                          </div>
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

      {abnormalModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAbnormalModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ marginTop: 0, color: C.navy }}>⚠ 이상여부 기록</h3>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>
              시약: <strong style={{ color: C.navy }}>{abnormalModal.reagents?.name}</strong>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>이상 내용</label>
              <textarea value={abnormalNote} onChange={e => setAbnormalNote(e.target.value)} placeholder="예: 변색, 라벨 훼손, 용기 파손 등"
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setAbnormalModal(null)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitAbnormalNote} style={{ ...btnPrimary, flex: 1 }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {disposalModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDisposalModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ marginTop: 0, color: C.navy }}>🗑️ 폐기 신청</h3>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>
              시약: <strong style={{ color: C.navy }}>{disposalModal.reagents?.name}</strong> (Lot {disposalModal.lot_no || '번호없음'})<br />
              관리자 승인 후 폐기 처리됩니다.
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>폐기 사유</label>
              <input value={disposalReason} onChange={e => setDisposalReason(e.target.value)} placeholder="선택사항" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDisposalModal(null)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitDisposalRequest} style={{ ...btnPrimary, flex: 1, background: C.danger }}>신청</button>
            </div>
          </div>
        </div>
      )}

      {locationModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLocationModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ marginTop: 0, color: C.navy }}>📍 위치 변경</h3>
            <div style={{ fontSize: '13px', color: C.muted, marginBottom: '16px' }}>
              시약: <strong style={{ color: C.navy }}>{locationModal.reagents?.name}</strong><br />
              실사 완료 처리 시점에 반영됩니다.
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>새 위치 *</label>
              <select value={locationChoice} onChange={e => setLocationChoice(e.target.value)} style={inputStyle}>
                <option value="">선택하세요</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setLocationModal(null)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitLocationChange} style={{ ...btnPrimary, flex: 1 }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {showNewRegModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewRegModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '460px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
            <h3 style={{ marginTop: 0, color: C.navy }}>🆕 미등록 시약 등록</h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: C.muted }}>실사 중 발견한 병을 검색해서 기존 시약에 Lot으로 추가하거나, 없으면 신규로 등록해요.</p>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>시약 이름 검색</label>
              <input value={newRegSearch} onChange={e => searchNewRegCandidates(e.target.value)} placeholder="이름으로 검색..." style={inputStyle} />
              {newRegCandidates.length > 0 && (
                <div style={{ marginTop: '6px', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', maxHeight: '160px', overflowY: 'auto' }}>
                  {newRegCandidates.map(c => (
                    <div key={c.id} onClick={() => setNewRegSelected(c)} style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                      background: newRegSelected?.id === c.id ? '#EEF2FB' : C.white,
                      borderBottom: `1px solid ${C.border}`,
                    }}>
                      <strong style={{ color: C.navy }}>{c.name}</strong>
                      <span style={{ color: C.muted, marginLeft: '8px', fontSize: '11px' }}>Lot {c.reagent_lots?.length || 0}개{c.company ? ' · ' + c.company : ''}</span>
                    </div>
                  ))}
                </div>
              )}
              {newRegSelected && (
                <div style={{ marginTop: '6px', padding: '8px 12px', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '12px', color: '#276749' }}>
                  ✓ "{newRegSelected.name}"에 새 Lot으로 추가됩니다.
                </div>
              )}
            </div>

            {!newRegSelected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', paddingTop: '10px', borderTop: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: '12px', color: C.muted }}>해당 시약이 없으면 신규 등록 정보를 입력하세요.</div>
                <div><label style={labelStyle}>시약명 *</label>
                  <input value={newRegForm.name} onChange={e => setNewRegForm({ ...newRegForm, name: e.target.value })} style={inputStyle} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div><label style={labelStyle}>CAS No.</label>
                    <input value={newRegForm.cas_no} onChange={e => setNewRegForm({ ...newRegForm, cas_no: e.target.value })} style={inputStyle} /></div>
                  <div><label style={labelStyle}>회사</label>
                    <input value={newRegForm.company} onChange={e => setNewRegForm({ ...newRegForm, company: e.target.value })} style={inputStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div><label style={labelStyle}>유별/성질</label>
                    <input value={newRegForm.category} onChange={e => setNewRegForm({ ...newRegForm, category: e.target.value })} style={inputStyle} /></div>
                  <div><label style={labelStyle}>유해·위험성</label>
                    <input value={newRegForm.hazard} onChange={e => setNewRegForm({ ...newRegForm, hazard: e.target.value })} style={inputStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div><label style={labelStyle}>용량</label>
                    <input value={newRegForm.volume} onChange={e => setNewRegForm({ ...newRegForm, volume: e.target.value })} style={inputStyle} /></div>
                  <div><label style={labelStyle}>단위</label>
                    <input value={newRegForm.unit} onChange={e => setNewRegForm({ ...newRegForm, unit: e.target.value })} style={inputStyle} /></div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '10px', borderTop: `1px dashed ${C.border}` }}>
              <div style={{ fontSize: '12px', color: C.muted, fontWeight: '700' }}>이번에 발견한 Lot 정보</div>
              <div><label style={labelStyle}>Lot No.</label>
                <input value={newRegForm.lot_no} onChange={e => setNewRegForm({ ...newRegForm, lot_no: e.target.value })} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div><label style={labelStyle}>미개봉 병 수</label>
                  <input type="number" min="0" value={newRegForm.sealed_count} onChange={e => setNewRegForm({ ...newRegForm, sealed_count: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>개봉 병 잔량(%)</label>
                  <input type="number" min="0" max="100" value={newRegForm.current_stock} onChange={e => setNewRegForm({ ...newRegForm, current_stock: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>보관 위치 *</label>
                <select value={newRegForm.location_id} onChange={e => setNewRegForm({ ...newRegForm, location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select></div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowNewRegModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitNewRegistration} style={{ ...btnPrimary, flex: 1 }}>등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 관리자용 — 이번 실사에서 새로 등록된 시약 모아보기(1단계 완료 처리 전 검토용)
function NewRegistrationSummary({ session }) {
  const [rows, setRows] = useState([])
  async function fetchRows() {
    const { data } = await supabase.from('inventory_counts')
      .select('*, reagents(name), reagent_lots(lot_no)')
      .eq('session_id', session.id).eq('is_new_registration', true)
      .order('counted_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { fetchRows() }, [session.id])
  if (rows.length === 0) return null
  return (
    <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400E', marginBottom: '6px' }}>🆕 이번 실사에서 새로 등록된 시약 ({rows.length}건)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {rows.map(r => (
          <span key={r.id} style={{ fontSize: '12px', background: C.white, border: '1px solid #F0DBAE', borderRadius: '20px', padding: '3px 10px', color: '#92400E' }}>
            {r.reagents?.name} (Lot {r.reagent_lots?.lot_no || '번호없음'})
          </span>
        ))}
      </div>
    </div>
  )
}
