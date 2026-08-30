import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fetchAllPages } from '../lib/fetchAllPages'

// 재고실사 메인 화면(세션 목록/진행률/시작·일시중단·완료처리·최종반영 등 관리 기능)의
// 상태와 DB 로직만 떼어낸 훅 — Inventory.jsx 쪽은 이 훅이 내려주는 값으로 화면만 그리면 됨.
// InventoryCountView(실사 입력 화면)의 lots/counts 상태는 별개(그쪽은 세션 하나를 붙잡고
// Lot 단위로 훨씬 세밀하게 움직이는 상태라 성격이 달라서 여기 섞지 않음).
export function useInventorySession(student) {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [locations, setLocations] = useState([])
  const [startForm, setStartForm] = useState({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', zones: [], mode: 'current_list' })
  const [zoneMode, setZoneMode] = useState('all') // 'all' | 'select' — startForm.zones에 가짜 플레이스홀더를 넣지 않기 위한 별도 UI 상태
  const [showStartModal, setShowStartModal] = useState(false)
  const [reviewSession, setReviewSession] = useState(null) // 완료된 회차의 신규등록 교차확인 모달 대상
  const [progress, setProgress] = useState({ total: 0, done: 0 })
  const [myCountedCount, setMyCountedCount] = useState(0) // ← 내가 이번 세션에서 이미 입력한 게 있는지("이어서 진행" 문구 판단용)
  const [pendingConfirmCount, setPendingConfirmCount] = useState(0) // ← 1단계는 지났지만 2단계 전인 Lot 수("완료 취소" 버튼 노출 판단용)
  const [pausing, setPausing] = useState(false)

  useEffect(() => { fetchSessions(); fetchLocations() }, [])

  useEffect(() => {
    if (activeSession) {
      fetchProgress()
      fetchPendingConfirmCount()
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
      const active = data.find(s => s.status === 'active' || s.status === 'paused')
      if (active) setActiveSession(active)
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

  // 1단계(완료 처리)는 지났지만 2단계(최종 DB 반영) 전인 Lot이 있는지 — "완료 취소" 버튼
  // 노출 여부 판단용. inventory_counts를 reagent_lots와 조인해 세션 범위 안에서만 셈.
  async function fetchPendingConfirmCount() {
    if (!activeSession) return
    const { count } = await supabase.from('inventory_counts')
      .select('id, reagent_lots!inner(pending_confirm)', { count: 'exact', head: true })
      .eq('session_id', activeSession.id).eq('reagent_lots.pending_confirm', true)
    setPendingConfirmCount(count || 0)
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

  async function startSession() {
    if (!startForm.created_by.trim()) { alert('관리자 이름을 입력해주세요'); return }
    if (!startForm.start_date) { alert('날짜를 선택해주세요'); return }
    const { data } = await supabase.from('inventory_sessions').insert({
      year: startForm.year, start_date: startForm.start_date, created_by: startForm.created_by, label: startForm.label.trim() || null,
      purpose: startForm.mode, zones: startForm.zones?.length ? startForm.zones : null,
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
          .select('id, reagent_id, sealed_count, current_stock, status, location_id, cat_no, lot_no, reagents(name, cas_no, company, hazard, category, volume, unit, purity)')
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
            purity: l.reagents?.purity ?? '',
          },
          book_lot_fields: { cat_no: l.cat_no ?? '', lot_no: l.lot_no ?? '' },
        }))
        const chunks = []
        for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100))
        await Promise.all(chunks.map(c => supabase.from('inventory_counts').insert(c)))
        setActiveSession(data)
        setShowStartModal(false)
        setStartForm({ year: new Date().getFullYear(), start_date: '', created_by: '', label: '', zones: [], mode: 'current_list' })
        setZoneMode('all')
        fetchSessions(); fetchProgress()
        alert(`실사가 시작되었습니다! 총 ${rows.length}개 Lot`)
      }
    }
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

  // 1단계 반영 공통 로직 — completeSession/undoSessionCompletion이 공유. 실제 reagent_lots 반영 +
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

  // 1단계 — 지금까지 입력된 실측값을 전부 반영(검토 대기 상태로 표시). 구역 배정이 없어졌으므로
  // 세션 전체를 대상으로 한 번에 처리.
  async function completeSession() {
    if (!window.confirm('지금까지 입력된 내용을 완료 처리하시겠습니까?\n실측 수량이 재고에 반영됩니다(검토 대기 상태로 표시).')) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts').select('*').eq('session_id', activeSession.id)
      .or('actual_sealed.not.is.null,is_new_registration.eq.true,staged_reagent_fields.not.is.null').range(from, to))
    if (counts) await applyCounts(counts)
    fetchProgress(); fetchPendingConfirmCount()
    alert('실사가 완료 처리되었습니다! 관리자 검토 후 "실사 DB 반영하기"를 눌러야 확정됩니다.')
  }

  // 2단계 — 관리자가 전체 변경사항을 검토한 뒤 최종 확정. 값은 이미 1단계에서 반영돼
  // 있으므로 pending_confirm만 끄고 세션을 completed로 닫는다(재기록 없음).
  async function finalizeSession() {
    if (!window.confirm('모든 변경사항을 최종 DB에 반영하시겠습니까?\n반영 후에는 되돌리기가 불가능합니다.')) return
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

  // 완료 취소(되돌리기) — 1단계는 지났지만(pending_confirm=true) 아직 2단계(최종 반영) 전인 세션 전체 대상.
  // 예전엔 구역 단위로만 되돌릴 수 있었는데, 구역 배정 기능이 없어졌으므로 세션 전체를 한 번에 되돌림.
  async function undoSessionCompletion() {
    if (!window.confirm('완료 처리를 취소하고 실사 이전 값으로 되돌리시겠습니까?')) return
    const counts = await fetchAllPages((from, to) => supabase.from('inventory_counts')
      .select('*, reagent_lots!inner(pending_confirm)').eq('session_id', activeSession.id)
      .eq('reagent_lots.pending_confirm', true).range(from, to))
    if (counts) {
      const revertedReagentFields = new Set() // reagent_id — 같은 시약의 Lot이 여럿이어도 정보 되돌리기는 1회만
      for (const c of counts) {
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
    fetchProgress(); fetchPendingConfirmCount()
    alert('실사 이전 값으로 되돌려졌습니다.')
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return {
    sessions, activeSession, setActiveSession, locations,
    startForm, setStartForm, zoneMode, setZoneMode, showStartModal, setShowStartModal,
    reviewSession, setReviewSession,
    progress, myCountedCount, pendingConfirmCount, pausing, rooms,
    zoneTokenOf, fetchSessions, fetchProgress, fetchPendingConfirmCount,
    startSession, pauseSession, resumeSession, cancelSession,
    completeSession, finalizeSession, undoSessionCompletion,
  }
}
