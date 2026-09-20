import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, btnGhost, thStyle, tdStyle } from '../../design'
import BulkMoveModal from '../reagents/BulkMoveModal'
import BulkDisposalModal from '../reagents/BulkDisposalModal'
import { adminMoveLots, adminDisposeLots } from '../../lib/adminReview'
import { useAdminSession } from '../../hooks/useAdminSession'
import AdminAuthBanner from './AdminAuthBanner'

// ══════════════════════════════════════════════
//  시약 일괄정리 — src/pages/BulkEdit.jsx(/reagents/bulk-edit).
//  보유중인 Lot(병)을 여러 개 골라서 한 번에 위치 이동하거나 폐기 처리.
//  - 관리자: 바로 DB에 반영(승인 대기 없음).
//  - 일반 사용자: location_requests / disposal_requests 로 "신청"만 하고, 관리자가
//    승인하면 최종 반영됨. 승인 전까지는 목록에서 바뀐 값이 보이되 그 Lot 행에
//    연한 배경색이 칠해지고, 승인되면 배경색이 사라짐(= 실제 반영).
//  승인 UI는 기존 관리자 화면(홈 대기목록 / MoveTab / DisposalTab)이 그대로 처리.
// ══════════════════════════════════════════════
export default function BulkEditTab({ locations, student, isAdmin }) {
  const [reagents, setReagents] = useState([])
  const [pendingMoves, setPendingMoves] = useState([])   // location_requests(status=pending)
  const [pendingDisposals, setPendingDisposals] = useState([]) // disposal_requests(status=pending)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [checkedLotIds, setCheckedLotIds] = useState(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveLocation, setMoveLocation] = useState('')
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalReason, setDisposalReason] = useState('')
  const [busy, setBusy] = useState(false)
  const adminSession = useAdminSession()

  const rooms = [...new Set(locations.map(l => l.room))]

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    let query = supabase.from('reagents')
      .select('id, name, company, reagent_lots(id, status, sealed_count, current_stock, location_id, lot_no)')
      .neq('status', 'archived')
      .order('name')
      .range(0, 2999)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    const [{ data }, { data: moves }, { data: disposals }] = await Promise.all([
      query,
      supabase.from('location_requests').select('*').eq('status', 'pending'),
      supabase.from('disposal_requests').select('*').eq('status', 'pending'),
    ])
    let list = (data || []).map(r => ({ ...r, _activeLots: (r.reagent_lots || []).filter(l => l.status === 'active') }))
    if (roomFilter) {
      const roomLocIds = new Set(locations.filter(l => l.room === roomFilter).map(l => l.id))
      list = list.map(r => ({ ...r, _activeLots: r._activeLots.filter(l => roomLocIds.has(l.location_id)) }))
    }
    list = list.filter(r => r._activeLots.length > 0)
    setReagents(list)
    setPendingMoves(moves || [])
    setPendingDisposals(disposals || [])
    setCheckedLotIds(new Set())
    setLoading(false)
  }

  // lotId -> 'move' | 'dispose' | null  (승인 대기 표시용)
  const pendingByLotId = useMemo(() => {
    const m = new Map()
    for (const req of pendingMoves) if (req.lot_id) m.set(req.lot_id, { type: 'move', toLocationName: req.to_location_name })
    for (const req of pendingDisposals) if (req.lot_id) m.set(req.lot_id, { type: 'dispose' })
    // 여러 병이 한 Lot 행에 묶인 행(sealed_count > 1)은 병 단위 작업 불가 — 선택 대상에서 제외(서버도 fail-closed)
    for (const r of reagents) for (const l of r._activeLots) if (l.sealed_count > 1 && !m.has(l.id)) m.set(l.id, { type: 'grouped' })
    return m
  }, [pendingMoves, pendingDisposals, reagents])

  // 이미 대기중인 Lot은 다시 신청 못 하게 선택 대상에서 뺌
  const selectableLotIds = useMemo(
    () => reagents.flatMap(r => r._activeLots.map(l => l.id)).filter(id => !pendingByLotId.has(id)),
    [reagents, pendingByLotId])

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
  function toggleAll() {
    setCheckedLotIds(prev => prev.size === selectableLotIds.length ? new Set() : new Set(selectableLotIds))
  }

  function locationLabel(locId) {
    const l = locations.find(x => x.id === locId)
    return l ? `${l.room}${l.detail ? ' · ' + l.detail : ''}` : '미지정'
  }
  function lotStockLabel(lot) {
    return lot.sealed_count > 0 ? `미개봉 ${lot.sealed_count}병` : `개봉 ${lot.current_stock}%`
  }

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
    fetchAll()
  }

  const pendingBg = '#FFF9E6' // 승인 대기중인 Lot 행 배경(연한 노랑)

  return (
    <Card title="🧹 시약 일괄정리" sub={isAdmin ? '보유중인 Lot(병)을 골라서 한 번에 위치 변경/폐기' : '보유중인 Lot(병)을 골라서 위치 변경/폐기 신청 (관리자가 승인하면 반영)'}>
      {!isAdmin && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', background: '#EEF2FB', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12.5px', color: C.navy }}>
          신청하면 목록에 바뀐 내용이 <b style={{ background: pendingBg, padding: '0 4px', borderRadius: '4px' }}>연한 배경색</b>으로 표시돼요. 관리자가 승인해 최종 반영되면 배경색이 사라집니다.
        </div>
      )}
      {isAdmin && <AdminAuthBanner session={adminSession} purpose="일괄 위치이동/폐기를 처리" />}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()}
          placeholder="시약명 검색" style={{ ...inputStyle, maxWidth: '200px' }} />
        <select aria-label="실험실 필터" value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '160px' }}>
          <option value="">전체 실험실</option>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={fetchAll} style={{ ...btnGhost, padding: '8px 16px' }}>필터 적용</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12.5px', color: C.muted }}>
            검색결과 <b style={{ color: C.text }}>{reagents.length}개 시약</b> · <b style={{ color: C.text }}>{selectableLotIds.length}개 Lot</b>
          </span>
          <span style={{
            fontSize: '12.5px', fontWeight: '700', borderRadius: '999px', padding: '3px 12px',
            background: checkedLotIds.size > 0 ? '#EEF2FB' : '#F0F0F0',
            color: checkedLotIds.size > 0 ? C.navy : C.muted,
          }}>선택됨 {checkedLotIds.size}개 Lot</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowMoveModal(true)} disabled={checkedLotIds.size === 0} style={{
            background: checkedLotIds.size === 0 ? '#F7F7F7' : '#667EEA', color: checkedLotIds.size === 0 ? C.muted : '#fff',
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: checkedLotIds.size === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600',
          }}>📍 위치 변경{!isAdmin && ' 신청'}</button>
          <button onClick={() => setShowDisposalModal(true)} disabled={checkedLotIds.size === 0} style={{
            background: checkedLotIds.size === 0 ? '#F7F7F7' : C.danger, color: checkedLotIds.size === 0 ? C.muted : '#fff',
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: checkedLotIds.size === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600',
          }}>🗑️ 폐기{!isAdmin && ' 신청'}</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}><input type="checkbox" aria-label="모든 Lot 선택" checked={selectableLotIds.length > 0 && checkedLotIds.size === selectableLotIds.length} onChange={toggleAll} /></th>
                <th style={thStyle}>시약명</th>
                <th style={thStyle}>Lot No.</th>
                <th style={thStyle}>위치</th>
                <th style={thStyle}>재고</th>
              </tr>
            </thead>
            <tbody>
              {reagents.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>조건에 맞는 시약이 없습니다.</td></tr>
              ) : reagents.map(r => {
                const selIds = r._activeLots.map(l => l.id).filter(id => !pendingByLotId.has(id))
                const allOn = selIds.length > 0 && selIds.every(id => checkedLotIds.has(id))
                return r._activeLots.map((lot, i) => {
                  const pend = pendingByLotId.get(lot.id)
                  const rowBg = pend ? pendingBg : (checkedLotIds.has(lot.id) ? '#EEF2FB' : 'transparent')
                  return (
                    <tr key={lot.id} onClick={() => toggleLot(lot.id)} style={{ cursor: pend ? 'default' : 'pointer', background: rowBg }}>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`${r.name} Lot ${lot.lot_no || '번호없음'} 선택`} checked={checkedLotIds.has(lot.id)} disabled={!!pend} onChange={() => toggleLot(lot.id)} />
                      </td>
                      <td style={{ ...tdStyle, fontWeight: i === 0 ? '600' : '400', color: i === 0 ? C.navy : C.muted, fontSize: i === 0 ? '13px' : '12px', paddingLeft: i === 0 ? undefined : '24px' }}>
                        {i === 0 ? (
                          <>
                            {r.name}
                            {r.company ? <span style={{ marginLeft: '6px', fontSize: '11px', color: C.muted }}>· {r.company}</span> : null}
                            {selIds.length > 1 && (
                              <span onClick={e => { e.stopPropagation(); toggleReagentLots(r) }}
                                style={{ marginLeft: '8px', fontSize: '10.5px', fontWeight: '700', color: C.navy, background: '#EEF2FB', padding: '1px 8px', borderRadius: '10px', cursor: 'pointer' }}>
                                {allOn ? '전체 해제' : `Lot ${selIds.length}개 전체`}
                              </span>
                            )}
                          </>
                        ) : '↳'}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{lot.lot_no || '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {pend?.type === 'move'
                          ? <span style={{ color: '#8A5A16' }}>{locationLabel(lot.location_id)} → <b>{pend.toLocationName}</b> <span style={{ fontSize: '10.5px' }}>(승인대기)</span></span>
                          : locationLabel(lot.location_id)}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
                        {pend?.type === 'dispose'
                          ? <span style={{ color: '#8A5A16', fontWeight: '700' }}>폐기 예정 <span style={{ fontSize: '10.5px', fontWeight: '400' }}>(승인대기)</span></span>
                          : pend?.type === 'grouped'
                            ? <span style={{ color: '#C13B3F', fontWeight: '700' }}>묶음 행(미개봉 {lot.sealed_count}병) — 병별 Lot 행으로 분리 필요</span>
                            : lotStockLabel(lot)}
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
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
    </Card>
  )
}
