import { useEffect, useState } from 'react'
import { supabase, supabaseAdmin } from '../supabase'

// 재고실사 메인 화면(세션 목록/진행률/시작·일시중단·검토·최종반영 등 관리 기능)의 상태와 서버 호출만
// 떼어낸 훅 — Inventory.jsx 쪽은 이 훅이 내려주는 값으로 화면만 그리면 됨.
//
// 업무 흐름(서버 RPC가 강제):
//   ① 학생 입력 → inventory_counts 임시저장(장부 불변)
//   ② 학생 Lot [완료] → 시약목록에 미확정 실사값 표시
//   ③ 관리자 [실사 완료 처리] → 세션 status='reviewed' (장부 여전히 불변)
//   ④ 관리자 [DB 최종 반영] → 한 트랜잭션으로 reagents/reagent_lots 반영 + 이력 생성 + 세션 completed
// 관리자 동작은 전부 Supabase Auth 관리자 세션(supabaseAdmin)으로 RPC 호출 — 서버가 is_admin()을 검증한다.
const OPEN = ['active', 'paused', 'reviewed']

export function useInventorySession(student) {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [locations, setLocations] = useState([])
  const [startForm, setStartForm] = useState({ year: new Date().getFullYear(), start_date: '', label: '', zones: [], mode: 'current_list' })
  const [zoneMode, setZoneMode] = useState('all') // 'all' | 'select' — startForm.zones에 가짜 플레이스홀더를 넣지 않기 위한 별도 UI 상태
  const [showStartModal, setShowStartModal] = useState(false)
  const [reviewSession, setReviewSession] = useState(null) // 완료된 회차의 신규등록 교차확인 모달 대상
  const [progress, setProgress] = useState({ total: 0, done: 0 })
  const [myCountedCount, setMyCountedCount] = useState(0) // ← 내가 이번 세션에서 이미 입력한 게 있는지("이어서 진행" 문구 판단용)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetchSessions(); fetchLocations() }, [])

  useEffect(() => {
    if (activeSession) {
      fetchProgress()
      const channel = supabase.channel('inventory_counts_' + activeSession.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_counts', filter: `session_id=eq.${activeSession.id}` }, () => {
          fetchProgress()
        })
        .subscribe()
      return () => supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession])

  async function fetchSessions() {
    const { data } = await supabase.from('inventory_sessions').select('*').order('created_at', { ascending: false })
    if (data) {
      setSessions(data)
      setActiveSession(data.find(s => OPEN.includes(s.status)) || null)
    }
  }

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
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

  async function rpc(fn, args) {
    const { data, error } = await supabaseAdmin.rpc(fn, args)
    if (error) { alert(error.message || '처리 중 오류가 발생했습니다.'); return null }
    return data
  }

  async function startSession() {
    if (!startForm.start_date) { alert('날짜를 선택해주세요'); return }
    const hasZones = startForm.zones && startForm.zones.length > 0
    const matchLocIds = hasZones
      ? locations.filter(l => startForm.zones.some(z => locationMatchesZone(l, z))).map(l => l.id)
      : null
    if (hasZones && matchLocIds.length === 0) { alert('해당 구역에 등록된 위치가 없습니다.'); return }
    setBusy(true)
    const out = await rpc('inventory_session_start', {
      p_year: startForm.year, p_start_date: startForm.start_date, p_label: startForm.label.trim() || null,
      p_purpose: startForm.mode, p_zones: hasZones ? startForm.zones : null, p_location_ids: matchLocIds,
    })
    setBusy(false)
    if (!out) return
    setShowStartModal(false)
    setStartForm({ year: new Date().getFullYear(), start_date: '', label: '', zones: [], mode: 'current_list' })
    setZoneMode('all')
    await fetchSessions()
    alert(`실사가 시작되었습니다! 총 ${out.lots}개 Lot`)
  }

  async function transition(action) {
    setBusy(true)
    const out = await rpc('inventory_session_transition', { p_session_id: activeSession.id, p_action: action })
    setBusy(false)
    if (out) await fetchSessions()
    return out
  }

  async function pauseSession() {
    if (!window.confirm('실사를 일시중단하시겠습니까?\n지금까지 입력된 내용은 임시저장되며, 학생들의 입력이 차단됩니다.\n최종 반영 전까지는 실제 재고 장부에 반영되지 않습니다.')) return
    await transition('pause')
  }

  async function resumeSession() {
    if (!window.confirm('실사를 재개하시겠습니까?')) return
    await transition('resume')
  }

  async function cancelSession() {
    if (!window.confirm('실사를 취소하시겠습니까?\n입력된 모든 데이터는 재고 장부에 반영되지 않으며, 실사 중 새로 등록된(미확정) 시약도 삭제되고 실사가 종료됩니다.')) return
    const out = await transition('cancel')
    if (out) {
      alert('실사가 취소되었습니다.')
      sessionStorage.removeItem('inv_count_view')
    }
  }

  // ③ 실사 완료 — 검토 단계로. 장부는 건드리지 않는다(시약목록에는 계속 미확정 실사값으로 표시).
  async function completeSession() {
    if (!window.confirm('실사를 완료(검토 단계) 처리하시겠습니까?\n이후 학생 입력이 잠기고, 실제 재고 장부는 "DB 최종 반영"을 눌러야 바뀝니다.\n(그 전에는 언제든 "검토 취소"로 다시 열 수 있습니다.)')) return
    const out = await transition('review')
    if (out) {
      sessionStorage.removeItem('inv_count_view')
      alert('실사가 완료 처리되었습니다. 내용을 검토한 뒤 "DB 최종 반영"을 눌러주세요.')
    }
  }

  async function reopenSession() {
    if (!window.confirm('검토를 취소하고 실사를 다시 열까요?\n(장부는 아직 바뀌지 않았으므로 되돌릴 것이 없습니다.)')) return
    await transition('reopen')
  }

  // ④ DB 최종 반영 — 서버가 한 트랜잭션으로 장부 반영 + 이력 생성 + 세션 완료. 실패하면 전부 롤백.
  async function finalizeSession() {
    if (!window.confirm('실사 내용을 실제 재고 장부(시약·Lot)에 최종 반영하시겠습니까?\n반영 후에는 되돌릴 수 없습니다.')) return
    setBusy(true)
    const out = await rpc('inventory_session_finalize', { p_session_id: activeSession.id })
    setBusy(false)
    if (!out) return
    if (out.low_stock_lot_ids?.length > 0) {
      const existing = JSON.parse(localStorage.getItem('low_stock_new') || '[]')
      localStorage.setItem('low_stock_new', JSON.stringify([...new Set([...existing, ...out.low_stock_lot_ids])]))
    }
    alert(`실사가 최종 반영되었습니다!\nLot ${out.lots}개 · 시약정보 ${out.reagent_fields}건 · 위치이동 ${out.moves}건${out.skipped ? ` · 건너뜀 ${out.skipped}건` : ''}`)
    sessionStorage.removeItem('inv_count_view')
    await fetchSessions()
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return {
    sessions, activeSession, setActiveSession, locations,
    startForm, setStartForm, zoneMode, setZoneMode, showStartModal, setShowStartModal,
    reviewSession, setReviewSession,
    progress, myCountedCount, busy, rooms,
    zoneTokenOf, fetchSessions, fetchProgress,
    startSession, pauseSession, resumeSession, cancelSession,
    completeSession, reopenSession, finalizeSession,
  }
}
