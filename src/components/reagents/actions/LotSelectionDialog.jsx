import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../supabase'
import { C, shadow } from '../../../design'
import BulkMoveModal from '../BulkMoveModal'
import BulkDisposalModal from '../BulkDisposalModal'
import { ListState } from '../ReagentListChrome'
import { adminMoveLots, adminDisposeLots } from '../../../lib/adminReview'
import { useAdminSession } from '../../../hooks/useAdminSession'
import { useBreakpoint } from '../../../hooks/useBreakpoint'
import AdminAuthBanner from '../../admin/AdminAuthBanner'

// 시약 목록에서 시약(마스터)을 선택 → [위치 이동]/[폐기] → 이 화면에서 실제 병(reagent_lots.id) 선택 → 제출.
// 병 identity/묶음 행(sealed_count>1) 가드/신청 대기 표시는 예전 "시약 일괄정리"(BulkEditTab)와 같은 규칙을 쓴다.
// 시약 checkbox를 체크했다는 이유만으로 그 시약의 모든 병이 자동으로 폐기/이동 대상이 되지 않는다 — 병은 여기서 명시적으로 다시 고른다.
const shortId = (id) => String(id || '').replace(/-/g, '').slice(-6)
const lotRemainLabel = (lot) => (lot.sealed_count > 1 ? `${lot.sealed_count}병` : `${lot.current_stock ?? 0}%`)

export default function LotSelectionDialog({ reagentIds, mode, locations, isAdmin, student, onClose, onDone }) {
  const { isMobile } = useBreakpoint()
  const adminSession = useAdminSession()
  const [reagents, setReagents] = useState([])
  const [pendingMoves, setPendingMoves] = useState([])
  const [pendingDisposals, setPendingDisposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [checkedLotIds, setCheckedLotIds] = useState(new Set())
  const [showActionModal, setShowActionModal] = useState(false)
  const [moveLocation, setMoveLocation] = useState('')
  const [disposalReason, setDisposalReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const ids = [...reagentIds]
      const [{ data }, { data: moves }, { data: disposals }] = await Promise.all([
        supabase.from('reagents')
          .select('id, name, name_ko, cas_no, company, reagent_lots(id, status, sealed_count, current_stock, location_id, lot_no)')
          .in('id', ids),
        supabase.from('location_requests').select('*').in('reagent_id', ids).eq('status', 'pending'),
        supabase.from('disposal_requests').select('*').in('reagent_id', ids).eq('status', 'pending'),
      ])
      if (!alive) return
      setReagents(data || [])
      setPendingMoves(moves || [])
      setPendingDisposals(disposals || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [reagentIds])

  const holding = useMemo(() => reagents
    .map(r => ({ ...r, _activeLots: (r.reagent_lots || []).filter(l => l.status === 'active') }))
    .filter(r => r._activeLots.length > 0), [reagents])
  const totalLots = useMemo(() => holding.reduce((s, r) => s + r._activeLots.length, 0), [holding])

  // lotId -> 'move' | 'dispose' | 'grouped' (승인 대기 / 묶음 행 — 병 단위 작업 불가, 서버도 fail-closed)
  const pendingByLotId = useMemo(() => {
    const m = new Map()
    for (const req of pendingMoves) if (req.lot_id) m.set(req.lot_id, { type: 'move', toLocationName: req.to_location_name })
    for (const req of pendingDisposals) if (req.lot_id) m.set(req.lot_id, { type: 'dispose' })
    for (const r of holding) for (const l of r._activeLots) if (l.sealed_count > 1 && !m.has(l.id)) m.set(l.id, { type: 'grouped' })
    return m
  }, [pendingMoves, pendingDisposals, holding])

  const selectableLotIds = useMemo(
    () => holding.flatMap(r => r._activeLots.map(l => l.id)).filter(id => !pendingByLotId.has(id)),
    [holding, pendingByLotId])

  function toggleLot(id) {
    if (pendingByLotId.has(id)) return
    setCheckedLotIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  const allOn = selectableLotIds.length > 0 && selectableLotIds.every(id => checkedLotIds.has(id))
  function toggleAll() {
    setCheckedLotIds(prev => { const next = new Set(prev); selectableLotIds.forEach(id => allOn ? next.delete(id) : next.add(id)); return next })
  }

  const locById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  const locationLabel = (locId) => { const l = locById.get(locId); return l ? `${l.room}${l.detail ? ' · ' + l.detail : ''}` : '미지정' }

  async function submitMove() {
    if (!moveLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (isAdmin) {
      if (!adminSession.authed) { alert('관리자 로그인이 필요합니다. 화면 위쪽의 관리자 로그인을 먼저 해주세요.'); return }
      setBusy(true)
      try { const out = await adminMoveLots([...checkedLotIds], moveLocation); alert(`✅ Lot ${out.moved}개 이동 완료! → ${out.to}`) }
      catch (e) { alert(e.message); setBusy(false); return }
    } else {
      if (!student?.session_token) { alert('제출하려면 로그인이 필요해요.'); return }
      setBusy(true)
      const failed = []; let okN = 0
      for (const lotId of checkedLotIds) {
        const { error } = await supabase.rpc('location_request_submit', { p_session_token: student.session_token, p_lot_id: lotId, p_to_location_id: moveLocation, p_notes: null })
        if (error) failed.push(error.message); else okN++
      }
      alert(failed.length === 0 ? `위치 변경 신청이 완료되었습니다. (${okN}병 · 관리자가 승인하면 반영돼요)` : `${okN}병 신청 완료, ${failed.length}병은 신청되지 않았습니다.\n${[...new Set(failed)].join('\n')}`)
    }
    setBusy(false)
    onDone([...checkedLotIds])
  }

  async function submitDisposal() {
    if (!disposalReason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    if (isAdmin) {
      if (!adminSession.authed) { alert('관리자 로그인이 필요합니다. 화면 위쪽의 관리자 로그인을 먼저 해주세요.'); return }
      if (!window.confirm(`Lot ${checkedLotIds.size}개를 폐기 처리합니다. 되돌릴 수 없어요. 계속할까요?`)) return
      setBusy(true)
      try { const out = await adminDisposeLots([...checkedLotIds], disposalReason); alert(`🗑️ Lot ${out.disposed}개 폐기 처리 완료!`) }
      catch (e) { alert(e.message); setBusy(false); return }
    } else {
      if (!student?.session_token) { alert('제출하려면 로그인이 필요해요.'); return }
      setBusy(true)
      const failed = []; let okN = 0
      for (const lotId of checkedLotIds) {
        const { error } = await supabase.rpc('disposal_request_submit', { p_session_token: student.session_token, p_lot_id: lotId, p_reason: disposalReason })
        if (error) failed.push(error.message); else okN++
      }
      alert(failed.length === 0 ? `폐기 신청이 완료되었습니다. (${okN}병 · 관리자가 승인하면 폐기가 완료돼요)` : `${okN}병 신청 완료, ${failed.length}병은 신청되지 않았습니다.\n${[...new Set(failed)].join('\n')}`)
    }
    setBusy(false)
    onDone([...checkedLotIds])
  }

  const reagentTitle = (r) => (
    <>
      <span style={{ fontWeight: 600, color: C.navy, overflowWrap: 'anywhere' }}>{r.name}</span>
      {r.name_ko ? <span style={{ marginLeft: 6, fontSize: 12, color: C.text, overflowWrap: 'anywhere' }}>{r.name_ko}</span> : null}
      <div style={{ fontSize: 11, color: C.muted, overflowWrap: 'anywhere' }}>{r.cas_no || 'CAS 없음'}{r.company ? ` · ${r.company}` : ''}</div>
    </>
  )
  const lotChecked = (r, lot, i, n) => (
    <input type="checkbox" style={{ width: 18, height: 18 }}
      aria-label={`${r.name} Lot ${lot.lot_no || '번호없음'}${n > 1 ? ` · 병 ${i + 1}/${n}` : ''} 선택`}
      checked={checkedLotIds.has(lot.id)} disabled={!!pendingByLotId.get(lot.id)} onChange={() => toggleLot(lot.id)} />
  )
  const stateCell = (lot, pend) => (pend?.type === 'move'
    ? <span style={{ color: '#8A5A16' }}>{locationLabel(lot.location_id)} → <b>{pend.toLocationName}</b> <span style={{ fontSize: '10.5px' }}>(승인대기)</span></span>
    : pend?.type === 'dispose'
      ? <span style={{ color: '#8A5A16', fontWeight: '700' }}>폐기 예정 <span style={{ fontSize: '10.5px', fontWeight: '400' }}>(승인대기)</span></span>
      : pend?.type === 'grouped'
        ? <span style={{ color: '#C13B3F', fontWeight: '700' }}>묶음 행(미개봉 {lot.sealed_count}병) — 병별 Lot 행으로 분리 필요</span>
        : locationLabel(lot.location_id))
  const bottleLabel = (lot, i, n) => (
    <span title={`병 ID: ${lot.id}`} style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
      {n > 1 ? <>↳ 병 {i + 1}/{n} </> : null}
      {isAdmin ? <span style={{ fontSize: 10.5, color: '#8A93A3' }}>#{shortId(lot.id)}</span> : null}
    </span>
  )
  const rowBg = (lot, pend) => (pend ? '#FFF9E6' : (checkedLotIds.has(lot.id) ? '#EEF2FB' : 'transparent'))

  const thS = { padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: '11.5px', color: C.muted, fontWeight: 600, background: C.bg, whiteSpace: 'nowrap' }
  const tdS = { padding: '9px 14px', borderBottom: `1px solid ${C.borderRow}`, fontSize: 12.5, color: C.muted, verticalAlign: 'middle' }
  const noneSel = checkedLotIds.size === 0
  const actionLabel = mode === 'move' ? `📍 선택한 ${checkedLotIds.size}병 위치 변경${isAdmin ? '' : ' 신청'}` : `🗑️ 선택한 ${checkedLotIds.size}병 폐기${isAdmin ? '' : ' 신청'}`

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={mode === 'move' ? '병 선택 — 위치 이동' : '병 선택 — 폐기'} onClick={e => e.stopPropagation()} style={{
        background: C.white, borderRadius: '14px', padding: isMobile ? '18px' : '24px 28px', width: '760px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
      }}>
        <h3 style={{ margin: '0 0 4px', color: mode === 'dispose' ? C.danger : C.navy }}>{mode === 'move' ? '📍 위치 이동 — 병 선택' : '🗑️ 폐기 — 병 선택'}</h3>
        <p style={{ margin: '0 0 14px', color: C.muted, fontSize: '13px' }}>
          선택한 시약 {holding.length}종에 총 {totalLots}병이 있어요. {mode === 'move' ? '이동할' : '폐기할'} 병을 직접 골라주세요.
        </p>
        {isAdmin && <AdminAuthBanner session={adminSession} purpose={mode === 'move' ? '위치이동을 처리' : '폐기를 처리'} />}

        {loading ? <ListState loading /> : holding.length === 0 ? <ListState>선택한 시약 중 보유중인 병이 없습니다.</ListState> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span data-testid="lot-selected-count" style={{ fontSize: '12.5px', fontWeight: '700', borderRadius: '999px', padding: '3px 12px', background: checkedLotIds.size > 0 ? '#EEF2FB' : '#F0F0F0', color: checkedLotIds.size > 0 ? C.navy : C.muted }}>선택된 {checkedLotIds.size}개 병</span>
              <button type="button" onClick={toggleAll} style={{ fontSize: '12px', fontWeight: '700', color: C.navy, background: '#EEF2FB', padding: '4px 10px', borderRadius: '10px', border: 'none', cursor: 'pointer', minHeight: 28 }}>{allOn ? '전체 해제' : '전체 선택'}</button>
            </div>
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: shadow.card, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 0 : 640 }}>
                <thead>
                  <tr>
                    <th style={thS}><input type="checkbox" aria-label="모든 병 선택" checked={allOn} onChange={toggleAll} /></th>
                    <th style={thS}>시약명 / 병</th>
                    <th style={thS}>Lot No.</th>
                    <th style={thS}>위치 / 상태</th>
                    <th style={thS}>잔량</th>
                  </tr>
                </thead>
                <tbody>
                  {holding.map(r => {
                    const n = r._activeLots.length
                    return (
                      <Fragment key={r.id}>
                        {n > 1 && (
                          <tr><td style={tdS} /><td style={{ ...tdS, borderBottom: 'none', paddingBottom: 2 }} colSpan={4}>{reagentTitle(r)}</td></tr>
                        )}
                        {r._activeLots.map((lot, i) => {
                          const pend = pendingByLotId.get(lot.id)
                          return (
                            <tr key={lot.id} data-lot-id={lot.id} onClick={() => toggleLot(lot.id)} style={{ cursor: pend ? 'default' : 'pointer', background: rowBg(lot, pend) }}>
                              <td style={tdS} onClick={e => e.stopPropagation()}>{lotChecked(r, lot, i, n)}</td>
                              <td style={{ ...tdS, paddingLeft: n > 1 ? 28 : 14 }}>{n > 1 ? bottleLabel(lot, i, n) : <>{reagentTitle(r)}{bottleLabel(lot, i, n)}</>}</td>
                              <td style={{ ...tdS, color: C.text }}>{lot.lot_no || <span style={{ color: C.muted }}>번호없음</span>}</td>
                              <td style={tdS}>{stateCell(lot, pend)}</td>
                              <td style={{ ...tdS, color: C.text }}>{pend ? '-' : lotRemainLabel(lot)}</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
          <button onClick={() => setShowActionModal(true)} disabled={noneSel} style={{
            flex: 2, padding: '10px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: '700',
            background: noneSel ? '#F7F7F7' : (mode === 'move' ? '#667EEA' : C.danger), color: noneSel ? C.muted : '#fff', cursor: noneSel ? 'default' : 'pointer',
          }}>{actionLabel}</button>
        </div>
      </div>

      {showActionModal && mode === 'move' && (
        <BulkMoveModal checkedCount={checkedLotIds.size} locations={locations}
          bulkMoveLocation={moveLocation} setBulkMoveLocation={setMoveLocation}
          submitLabel={isAdmin ? '위치 변경' : '위치 변경 신청'}
          onClose={() => !busy && setShowActionModal(false)} onSubmit={submitMove} />
      )}
      {showActionModal && mode === 'dispose' && (
        <BulkDisposalModal checkedCount={checkedLotIds.size} isRequest={!isAdmin}
          reason={disposalReason} setReason={setDisposalReason}
          onClose={() => !busy && setShowActionModal(false)} onSubmit={submitDisposal} />
      )}
    </div>
  )
}
