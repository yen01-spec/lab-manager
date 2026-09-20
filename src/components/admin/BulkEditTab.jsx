import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { C, shadow } from '../../design'
import BulkMoveModal from '../reagents/BulkMoveModal'
import BulkDisposalModal from '../reagents/BulkDisposalModal'
import ReagentSearchBar from '../reagents/ReagentSearchBar'
import LocationFilter from '../reagents/LocationFilter'
import AlphabetIndex from '../reagents/AlphabetIndex'
import AlphabetSheet from '../reagents/AlphabetSheet'
import { ResultSummary, Count, ListState } from '../reagents/ReagentListChrome'
import { adminMoveLots, adminDisposeLots } from '../../lib/adminReview'
import { useAdminSession } from '../../hooks/useAdminSession'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import AdminAuthBanner from './AdminAuthBanner'
import { compareReagentNames, rankFields } from '../../lib/reagentSearch'
import { groupByLetter, availableLetterSet } from '../../lib/reagentLetters'

// ══════════════════════════════════════════════
//  시약 일괄정리 — src/pages/BulkEdit.jsx(/reagents/bulk-edit).
//  보유중인 Lot(병)을 여러 개 골라서 한 번에 위치 이동하거나 폐기 처리.
//  - "시약을 찾는 경험"(검색창·위치 필터·결과 수·A–Z·로딩/빈 상태)은 시약목록과 같은 컴포넌트/정렬 기준을 쓴다.
//  - "찾은 병으로 하는 작업"(체크박스·선택 Lot 수·위치 이동·폐기)만 이 화면 전용이다.
//  - 관리자: 바로 DB에 반영(승인 대기 없음).
//  - 일반 사용자: location_requests / disposal_requests 로 "신청"만 하고, 관리자가
//    승인하면 최종 반영됨. 승인 전까지는 목록에서 바뀐 값이 보이되 그 Lot 행에
//    연한 배경색이 칠해지고, 승인되면 배경색이 사라짐(= 실제 반영).
//  승인 UI는 기존 관리자 화면(홈 대기목록 / MoveTab / DisposalTab)이 그대로 처리.
//  - 검색·위치 필터는 한 번 불러온 보유 시약 목록을 화면에서 걸러낸다(선택 즉시 적용 — 별도 "필터 적용" 버튼 없음).
//  - 병 identity 는 항상 reagent_lots.id. 같은 Lot No.가 여러 병에 있을 수 있어 "병 i/N"과 짧은 병 ID 로 구분해 보여준다.
// ══════════════════════════════════════════════
const pendingBg = '#FFF9E6' // 승인 대기중인 Lot 행 배경(연한 노랑)
const shortId = (id) => String(id || '').replace(/-/g, '').slice(-6)
const lotStateLabel = (lot) => (lot.sealed_count > 0 ? '미개봉' : '개봉')
const lotRemainLabel = (lot) => (lot.sealed_count > 1 ? `${lot.sealed_count}병` : `${lot.current_stock ?? 0}%`)

const letterHeadStyle = {
  padding: '8px 14px', background: `linear-gradient(90deg, ${C.navy}11, transparent)`, fontWeight: '800', fontSize: '13px',
  color: C.navy, borderLeft: `3px solid ${C.gold}`, scrollMarginTop: '130px',
}

export default function BulkEditTab({ locations, student, isAdmin }) {
  const { isMobile } = useBreakpoint()
  const [reagents, setReagents] = useState([])
  const [pendingMoves, setPendingMoves] = useState([])   // location_requests(status=pending)
  const [pendingDisposals, setPendingDisposals] = useState([]) // disposal_requests(status=pending)
  const [loading, setLoading] = useState(true)
  const [applied, setApplied] = useState({ term: '', reagentId: null })   // Enter/검색/추천 선택으로 확정된 검색
  const [roomFilter, setRoomFilter] = useState('')
  const [detailFilter, setDetailFilter] = useState('')
  const [checkedLotIds, setCheckedLotIds] = useState(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveLocation, setMoveLocation] = useState('')
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalReason, setDisposalReason] = useState('')
  const [busy, setBusy] = useState(false)
  const adminSession = useAdminSession()

  const rooms = useMemo(() => [...new Set(locations.map(l => l.room))], [locations])

  const [reloadKey, setReloadKey] = useState(0)
  const fetchAll = useCallback(() => setReloadKey(k => k + 1), [])
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data }, { data: moves }, { data: disposals }] = await Promise.all([
        supabase.from('reagents')
          .select('id, name, name_ko, cas_no, company, sort_letter, reagent_lots(id, status, sealed_count, current_stock, location_id, lot_no)')
          .neq('status', 'archived')
          .range(0, 2999),
        supabase.from('location_requests').select('*').eq('status', 'pending'),
        supabase.from('disposal_requests').select('*').eq('status', 'pending'),
      ])
      if (!alive) return
      setReagents([...(data || [])].sort(compareReagentNames))   // 시약목록과 같은 정렬 기준(영문명)
      setPendingMoves(moves || [])
      setPendingDisposals(disposals || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [reloadKey])

  // 보유중(active) Lot 이 있는 시약만
  const holding = useMemo(() => reagents
    .map(r => ({ ...r, _activeLots: (r.reagent_lots || []).filter(l => l.status === 'active') }))
    .filter(r => r._activeLots.length > 0), [reagents])
  const totalLots = useMemo(() => holding.reduce((s, r) => s + r._activeLots.length, 0), [holding])

  // 검색(시약목록 자동추천과 같은 영문명/국문명/CAS 규칙) + 위치 필터 — 모두 즉시 적용
  const visible = useMemo(() => {
    let list = holding
    const locIds = detailFilter ? new Set([detailFilter])
      : roomFilter ? new Set(locations.filter(l => l.room === roomFilter).map(l => l.id)) : null
    if (locIds) list = list.map(r => ({ ...r, _activeLots: r._activeLots.filter(l => locIds.has(l.location_id)) })).filter(r => r._activeLots.length > 0)
    if (applied.reagentId) list = list.filter(r => r.id === applied.reagentId)
    else if (applied.term) list = list.filter(r => rankFields({ name: r.name, name_ko: r.name_ko, cas_no: r.cas_no }, applied.term) !== null)
    return list
  }, [holding, roomFilter, detailFilter, applied, locations])
  const visibleLots = useMemo(() => visible.reduce((s, r) => s + r._activeLots.length, 0), [visible])
  const filtered = visible.length !== holding.length || visibleLots !== totalLots
  const sections = useMemo(() => groupByLetter(visible), [visible])

  // lotId -> 'move' | 'dispose' | 'grouped' (승인 대기 / 묶음 행 표시용)
  const pendingByLotId = useMemo(() => {
    const m = new Map()
    for (const req of pendingMoves) if (req.lot_id) m.set(req.lot_id, { type: 'move', toLocationName: req.to_location_name })
    for (const req of pendingDisposals) if (req.lot_id) m.set(req.lot_id, { type: 'dispose' })
    // 여러 병이 한 Lot 행에 묶인 행(sealed_count > 1)은 병 단위 작업 불가 — 선택 대상에서 제외(서버도 fail-closed)
    for (const r of holding) for (const l of r._activeLots) if (l.sealed_count > 1 && !m.has(l.id)) m.set(l.id, { type: 'grouped' })
    return m
  }, [pendingMoves, pendingDisposals, holding])

  // 이미 대기중인 Lot은 다시 신청 못 하게 선택 대상에서 뺌(현재 목록에 보이는 것 기준)
  const selectableLotIds = useMemo(
    () => visible.flatMap(r => r._activeLots.map(l => l.id)).filter(id => !pendingByLotId.has(id)),
    [visible, pendingByLotId])
  const visibleSet = useMemo(() => new Set(visible.flatMap(r => r._activeLots.map(l => l.id))), [visible])
  // 필터를 바꿔도 선택은 유지된다 — 현재 목록 밖에 선택된 병이 있으면 그 수를 알려 준다(폐기/이동은 선택 전체에 적용되므로).
  const hiddenChecked = useMemo(() => [...checkedLotIds].filter(id => !visibleSet.has(id)).length, [checkedLotIds, visibleSet])

  function toggleLot(id) {
    if (pendingByLotId.has(id)) return
    setCheckedLotIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleReagentLots(r) {
    const ids = r._activeLots.map(l => l.id).filter(id => !pendingByLotId.has(id))
    const allOn = ids.length > 0 && ids.every(id => checkedLotIds.has(id))
    setCheckedLotIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => allOn ? next.delete(id) : next.add(id))
      return next
    })
  }
  const allVisibleOn = selectableLotIds.length > 0 && selectableLotIds.every(id => checkedLotIds.has(id))
  function toggleAll() {
    setCheckedLotIds(prev => {
      const next = new Set(prev)
      selectableLotIds.forEach(id => allVisibleOn ? next.delete(id) : next.add(id))
      return next
    })
  }

  const locById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  function locationLabel(locId) {
    const l = locById.get(locId)
    return l ? `${l.room}${l.detail ? ' · ' + l.detail : ''}` : '미지정'
  }

  const jumpTo = useCallback((letter) => {
    document.querySelector(`[data-bulk-letter="${letter}"]`)?.scrollIntoView({ block: 'start' })
  }, [])

  function applySearch(term, reagentId = null) { setApplied({ term: term.trim(), reagentId }) }

  async function submitBulkMove() {
    if (!moveLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (isAdmin) {
      if (!adminSession.authed) { alert('관리자 로그인이 필요합니다. 화면 위쪽의 관리자 로그인을 먼저 해주세요.'); return }
      setBusy(true)
      try {
        const out = await adminMoveLots([...checkedLotIds], moveLocation)
        alert(`✅ Lot ${out.moved}개 이동 완료! → ${out.to}`)
      } catch (e) { alert(e.message); setBusy(false); return }
    } else {
      if (!student?.session_token) { alert('제출하려면 로그인이 필요해요.'); return }
      setBusy(true)
      const failed = []
      let okN = 0
      for (const lotId of checkedLotIds) {
        // 병 1개(reagent_lots.id) = 신청 1건. 시약명/기존 위치는 서버가 병 행에서 확정한다.
        const { error } = await supabase.rpc('location_request_submit', {
          p_session_token: student.session_token, p_lot_id: lotId, p_to_location_id: moveLocation, p_notes: null,
        })
        if (error) failed.push(error.message); else okN++
      }
      alert(failed.length === 0 ? `위치 변경 신청이 완료되었습니다. (${okN}병 · 관리자가 승인하면 반영돼요)` : `${okN}병 신청 완료, ${failed.length}병은 신청되지 않았습니다.\n${[...new Set(failed)].join('\n')}`)
    }
    setShowMoveModal(false); setMoveLocation(''); setBusy(false)
    setCheckedLotIds(new Set())
    fetchAll()
  }

  async function submitBulkDisposal() {
    if (!disposalReason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    if (isAdmin) {
      if (!adminSession.authed) { alert('관리자 로그인이 필요합니다. 화면 위쪽의 관리자 로그인을 먼저 해주세요.'); return }
      if (!window.confirm(`Lot ${checkedLotIds.size}개를 폐기 처리합니다. 되돌릴 수 없어요. 계속할까요?`)) return
      setBusy(true)
      try {
        const out = await adminDisposeLots([...checkedLotIds], disposalReason)
        alert(`🗑️ Lot ${out.disposed}개 폐기 처리 완료!`)
      } catch (e) { alert(e.message); setBusy(false); return }
    } else {
      if (!student?.session_token) { alert('제출하려면 로그인이 필요해요.'); return }
      setBusy(true)
      const failed = []
      let okN = 0
      for (const lotId of checkedLotIds) {
        // 병 1개(reagent_lots.id) = 신청 1건. 신청자/시약명/Lot 번호는 서버가 확정한다.
        const { error } = await supabase.rpc('disposal_request_submit', {
          p_session_token: student.session_token, p_lot_id: lotId, p_reason: disposalReason,
        })
        if (error) failed.push(error.message); else okN++
      }
      alert(failed.length === 0 ? `폐기 신청이 완료되었습니다. (${okN}병 · 관리자가 승인하면 폐기가 완료돼요)` : `${okN}병 신청 완료, ${failed.length}병은 신청되지 않았습니다.\n${[...new Set(failed)].join('\n')}`)
    }
    setShowDisposalModal(false); setDisposalReason(''); setBusy(false)
    setCheckedLotIds(new Set())
    fetchAll()
  }

  // ── 렌더 조각 ─────────────────────────────────────────────
  const reagentTitle = (r) => (
    <>
      <span style={{ fontWeight: 600, color: C.navy, overflowWrap: 'anywhere' }}>{r.name}</span>
      {r.name_ko ? <span style={{ marginLeft: 6, fontSize: 12, color: C.text, overflowWrap: 'anywhere' }}>{r.name_ko}</span> : null}
      <div style={{ fontSize: 11, color: C.muted, overflowWrap: 'anywhere' }}>
        {r.cas_no || 'CAS 없음'}{r.company ? ` · ${r.company}` : ''}
      </div>
    </>
  )
  const allLotsChip = (r) => {
    const ids = r._activeLots.map(l => l.id).filter(id => !pendingByLotId.has(id))
    if (ids.length < 2) return null
    const allOn = ids.every(id => checkedLotIds.has(id))
    return (
      <button type="button" onClick={e => { e.stopPropagation(); toggleReagentLots(r) }}
        style={{ fontSize: '11px', fontWeight: '700', color: C.navy, background: '#EEF2FB', padding: '4px 10px', borderRadius: '10px', cursor: 'pointer', border: 'none', minHeight: 28 }}>
        {allOn ? '전체 해제' : `Lot ${ids.length}개 전체`}
      </button>
    )
  }
  const lotChecked = (r, lot, i, n) => (
    <input type="checkbox" style={{ width: 18, height: 18 }}
      aria-label={`${r.name} Lot ${lot.lot_no || '번호없음'}${n > 1 ? ` · 병 ${i + 1}/${n}` : ''} 선택`}
      checked={checkedLotIds.has(lot.id)} disabled={!!pendingByLotId.get(lot.id)} onChange={() => toggleLot(lot.id)} />
  )
  const locCell = (lot, pend) => (pend?.type === 'move'
    ? <span style={{ color: '#8A5A16' }}>{locationLabel(lot.location_id)} → <b>{pend.toLocationName}</b> <span style={{ fontSize: '10.5px' }}>(승인대기)</span></span>
    : locationLabel(lot.location_id))
  const stateCell = (lot, pend) => (pend?.type === 'dispose'
    ? <span style={{ color: '#8A5A16', fontWeight: '700' }}>폐기 예정 <span style={{ fontSize: '10.5px', fontWeight: '400' }}>(승인대기)</span></span>
    : pend?.type === 'grouped'
      ? <span style={{ color: '#C13B3F', fontWeight: '700' }}>묶음 행(미개봉 {lot.sealed_count}병) — 병별 Lot 행으로 분리 필요</span>
      : <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 700,
        background: lot.sealed_count > 0 ? C.successTint : C.warningTint, color: lot.sealed_count > 0 ? C.successDark : C.warningDark }}>{lotStateLabel(lot)}</span>)
  const bottleLabel = (lot, i, n) => (
    <span title={`병 ID: ${lot.id}`} style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
      {n > 1 ? <>↳ 병 {i + 1}/{n} </> : null}
      {isAdmin ? <span style={{ fontSize: 10.5, color: '#8A93A3' }}>#{shortId(lot.id)}</span> : null}
    </span>
  )
  const rowBgOf = (lot, pend) => (pend ? pendingBg : (checkedLotIds.has(lot.id) ? '#EEF2FB' : 'transparent'))

  const thS = { padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: '11.5px', color: C.muted, fontWeight: 600, background: C.bg, whiteSpace: 'nowrap' }
  const tdS = { padding: '9px 14px', borderBottom: `1px solid ${C.borderRow}`, fontSize: 12.5, color: C.muted, verticalAlign: 'middle' }

  const desktopList = (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: shadow.card, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
        <thead>
          <tr>
            <th style={thS}><input type="checkbox" aria-label="모든 Lot 선택" checked={allVisibleOn} onChange={toggleAll} /></th>
            <th style={thS}>시약명 / 병</th>
            <th style={thS}>Lot No.</th>
            <th style={thS}>위치</th>
            <th style={thS}>상태</th>
            <th style={thS}>잔량</th>
          </tr>
        </thead>
        <tbody>
          {sections.map(({ letter, items }) => (
            <Fragment key={letter}>
              <tr data-bulk-letter={letter} style={{ scrollMarginTop: '130px' }}><td colSpan={6} style={letterHeadStyle}>{letter}</td></tr>
              {items.map(r => {
                const n = r._activeLots.length
                return (
                  <Fragment key={r.id}>
                    {n > 1 && (
                      <tr>
                        <td style={tdS} />
                        <td style={{ ...tdS, borderBottom: 'none', paddingBottom: 2 }} colSpan={4}>{reagentTitle(r)}</td>
                        <td style={{ ...tdS, borderBottom: 'none', paddingBottom: 2, textAlign: 'right' }}>{allLotsChip(r)}</td>
                      </tr>
                    )}
                    {r._activeLots.map((lot, i) => {
                      const pend = pendingByLotId.get(lot.id)
                      return (
                        <tr key={lot.id} data-lot-id={lot.id} onClick={() => toggleLot(lot.id)} style={{ cursor: pend ? 'default' : 'pointer', background: rowBgOf(lot, pend) }}>
                          <td style={tdS} onClick={e => e.stopPropagation()}>{lotChecked(r, lot, i, n)}</td>
                          <td style={{ ...tdS, paddingLeft: n > 1 ? 28 : 14 }}>{n > 1 ? bottleLabel(lot, i, n) : <>{reagentTitle(r)}{bottleLabel(lot, i, n)}</>}</td>
                          <td style={{ ...tdS, color: C.text }}>{lot.lot_no || <span style={{ color: C.muted }}>번호없음</span>}</td>
                          <td style={tdS}>{locCell(lot, pend)}</td>
                          <td style={tdS}>{stateCell(lot, pend)}</td>
                          <td style={{ ...tdS, color: C.text }}>{pend ? '-' : lotRemainLabel(lot)}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )

  const mobileList = (
    <div>
      {sections.map(({ letter, items }) => (
        <Fragment key={letter}>
          <div data-bulk-letter={letter} style={{ ...letterHeadStyle, padding: '6px 12px', marginBottom: 8 }}>{letter}</div>
          {items.map(r => {
            const n = r._activeLots.length
            return (
              <div key={r.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px 8px', display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>{reagentTitle(r)}</div>
                  {allLotsChip(r)}
                </div>
                {r._activeLots.map((lot, i) => {
                  const pend = pendingByLotId.get(lot.id)
                  return (
                    <label key={lot.id} data-lot-id={lot.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', minHeight: 44, borderTop: `1px solid ${C.borderRow}`, background: rowBgOf(lot, pend), cursor: pend ? 'default' : 'pointer' }}>
                      <span style={{ paddingTop: 2 }}>{lotChecked(r, lot, i, n)}</span>
                      <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>
                        <span style={{ color: C.text, fontWeight: 600, overflowWrap: 'anywhere' }}>Lot {lot.lot_no || '번호없음'}</span> {bottleLabel(lot, i, n)}
                        <br />{locCell(lot, pend)}
                        <br />{stateCell(lot, pend)}{!pend && <span style={{ marginLeft: 8, color: C.text }}>잔량 {lotRemainLabel(lot)}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            )
          })}
        </Fragment>
      ))}
    </div>
  )

  const noneSel = checkedLotIds.size === 0
  const actionBtn = (bg) => ({ background: noneSel ? '#F7F7F7' : bg, color: noneSel ? C.muted : '#fff', border: 'none', padding: '8px 16px', minHeight: 40, borderRadius: '6px', cursor: noneSel ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600' })

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: C.muted }}>
        {isAdmin ? '보유중인 Lot(병)을 골라서 한 번에 위치 변경/폐기' : '보유중인 Lot(병)을 골라서 위치 변경/폐기 신청 (관리자가 승인하면 반영)'}
      </p>
      {!isAdmin && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', background: '#EEF2FB', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12.5px', color: C.navy }}>
          신청하면 목록에 바뀐 내용이 <b style={{ background: pendingBg, padding: '0 4px', borderRadius: '4px' }}>연한 배경색</b>으로 표시돼요. 관리자가 승인해 최종 반영되면 배경색이 사라집니다.
        </div>
      )}
      {isAdmin && <AdminAuthBanner session={adminSession} purpose="일괄 위치이동/폐기를 처리" />}

      <ReagentSearchBar value={applied.term} onSubmit={term => applySearch(term)} onSelect={r => applySearch(r.name, r.id)} />
      <LocationFilter rooms={rooms} roomFilter={roomFilter} setRoomFilter={setRoomFilter}
        detailFilter={detailFilter} setDetailFilter={setDetailFilter} locations={locations} />

      <ResultSummary total={filtered ? `(전체 ${holding.length.toLocaleString()}개 시약 · ${totalLots.toLocaleString()}개 Lot)` : null}>
        검색결과 <Count n={visible.length} unit="개 시약" /> · <Count n={visibleLots} unit="개 Lot" />
      </ResultSummary>

      {/* 일괄정리 전용: 선택 Lot 수 + 위치 이동/폐기 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '12px',
        position: isMobile ? 'static' : 'sticky', top: 64, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span data-testid="selected-count" style={{
            fontSize: '12.5px', fontWeight: '700', borderRadius: '999px', padding: '3px 12px',
            background: checkedLotIds.size > 0 ? '#EEF2FB' : '#F0F0F0', color: checkedLotIds.size > 0 ? C.navy : C.muted,
          }}>선택된 {checkedLotIds.size}개 Lot</span>
          {hiddenChecked > 0 && <span style={{ fontSize: 12, color: '#8A5A16' }}>이 중 {hiddenChecked}개는 현재 목록 밖에 있어요</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowMoveModal(true)} disabled={noneSel} style={actionBtn('#667EEA')}>📍 위치 변경{!isAdmin && ' 신청'}</button>
          <button onClick={() => setShowDisposalModal(true)} disabled={noneSel} style={actionBtn(C.danger)}>🗑️ 폐기{!isAdmin && ' 신청'}</button>
        </div>
      </div>

      {loading ? <ListState loading />
        : visible.length === 0 ? <ListState>{holding.length > 0 ? '조건에 맞는 시약이 없습니다. 검색어나 위치 필터를 조정해 보세요.' : '조건에 맞는 시약이 없습니다.'}</ListState>
          : isMobile ? (<>{mobileList}<AlphabetSheet available={availableLetterSet(visible)} onJump={jumpTo} /></>)
            : (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>{desktopList}</div>
                <AlphabetIndex data={visible} scrollToLetter={jumpTo} top={140} />
              </div>
            )}

      {showMoveModal && (
        <BulkMoveModal checkedCount={checkedLotIds.size} locations={locations}
          bulkMoveLocation={moveLocation} setBulkMoveLocation={setMoveLocation}
          submitLabel={isAdmin ? '위치 변경' : '위치 변경 신청'}
          onClose={() => !busy && setShowMoveModal(false)} onSubmit={submitBulkMove} />
      )}
      {showDisposalModal && (
        <BulkDisposalModal checkedCount={checkedLotIds.size} isRequest={!isAdmin}
          reason={disposalReason} setReason={setDisposalReason}
          onClose={() => !busy && setShowDisposalModal(false)} onSubmit={submitBulkDisposal} />
      )}
    </div>
  )
}
