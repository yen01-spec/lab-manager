import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, btnGhost, thStyle, tdStyle } from '../../design'
import BulkMoveModal from '../reagents/BulkMoveModal'
import BulkDisposalModal from '../reagents/BulkDisposalModal'

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
  const [movedBy, setMovedBy] = useState(isAdmin ? '' : (student?.name || ''))
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalReason, setDisposalReason] = useState('')
  const [disposedBy, setDisposedBy] = useState(isAdmin ? '' : (student?.name || ''))
  const [busy, setBusy] = useState(false)

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
    return m
  }, [pendingMoves, pendingDisposals])

  const lotInfoById = useMemo(() => {
    const m = new Map()
    for (const r of reagents) for (const lot of r._activeLots) {
      m.set(lot.id, { reagentId: r.id, reagentName: r.name, fromLocationId: lot.location_id, lotNo: lot.lot_no })
    }
    return m
  }, [reagents])
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
    if (!movedBy.trim()) { alert('이름을 입력해주세요'); return }
    setBusy(true)
    const toLoc = locations.find(l => l.id === moveLocation)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    for (const lotId of checkedLotIds) {
      const info = lotInfoById.get(lotId)
      if (!info) continue
      const fromLocName = locationLabel(info.fromLocationId)
      if (isAdmin) {
        await supabase.from('reagent_lots').update({ location_id: moveLocation }).eq('id', lotId)
        await supabase.from('location_history').insert({
          reagent_id: info.reagentId, lot_id: lotId, reagent_name: info.reagentName,
          from_location_id: info.fromLocationId, from_location_name: fromLocName,
          to_location_id: moveLocation, to_location_name: toLocName, moved_by: movedBy,
        })
      } else {
        await supabase.from('location_requests').insert({
          reagent_id: info.reagentId, lot_id: lotId, reagent_name: info.reagentName,
          from_location_id: info.fromLocationId, from_location_name: fromLocName,
          to_location_id: moveLocation, to_location_name: toLocName,
          requested_by: movedBy, status: 'pending',
        })
      }
    }
    if (isAdmin) {
      await supabase.from('admin_logs').insert({
        admin_name: movedBy, action: '시약 일괄정리 - 위치이동', target_type: 'reagent',
        description: `Lot ${checkedLotIds.size}개 → ${toLocName}`,
      })
      alert(`✅ Lot ${checkedLotIds.size}개 이동 완료! → ${toLocName}`)
    } else {
      alert(`Lot ${checkedLotIds.size}개 위치이동 신청 완료! 관리자 승인 후 반영돼요.`)
    }
    setShowMoveModal(false); setMoveLocation(''); setBusy(false)
    fetchAll()
  }

  async function submitBulkDisposal() {
    if (!disposalReason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    if (!disposedBy.trim()) { alert('이름을 입력해주세요'); return }
    if (isAdmin && !window.confirm(`Lot ${checkedLotIds.size}개를 폐기 처리합니다. 되돌릴 수 없어요. 계속할까요?`)) return
    setBusy(true)
    const today = new Date().toISOString().split('T')[0]
    for (const lotId of checkedLotIds) {
      const info = lotInfoById.get(lotId)
      if (!info) continue
      if (isAdmin) {
        await supabase.from('disposal_requests').insert({
          reagent_id: info.reagentId, lot_id: lotId, reagent_name: info.reagentName, lot_no: info.lotNo,
          quantity: '전체', reason: disposalReason,
          requested_by: disposedBy, status: 'disposed', disposed_at: new Date().toISOString(),
          approved_by_student_id: student?.student_id ?? null,
        })
        await supabase.from('reagent_lots').update({
          sealed_count: 0, current_stock: 0, status: 'disposed', disposal_date: today, needs_review: false,
        }).eq('id', lotId)
      } else {
        await supabase.from('disposal_requests').insert({
          reagent_id: info.reagentId, lot_id: lotId, reagent_name: info.reagentName, lot_no: info.lotNo,
          quantity: '전체', reason: disposalReason,
          requested_by: disposedBy, requested_by_student_id: student?.student_id ?? null, status: 'pending',
        })
      }
    }
    if (isAdmin) {
      await supabase.from('admin_logs').insert({
        admin_name: disposedBy, action: '시약 일괄정리 - 폐기처리', target_type: 'reagent',
        description: `Lot ${checkedLotIds.size}개 폐기 (사유: ${disposalReason})`,
      })
      alert(`🗑️ Lot ${checkedLotIds.size}개 폐기 처리 완료!`)
    } else {
      alert(`Lot ${checkedLotIds.size}개 폐기 신청 완료! 관리자 승인 후 반영돼요.`)
    }
    setShowDisposalModal(false); setDisposalReason(''); setBusy(false)
    fetchAll()
  }

  const pendingBg = '#FFF9E6' // 승인 대기중인 Lot 행 배경(연한 노랑)

  return (
    <Card title="🧹 시약 일괄정리" sub={isAdmin ? '보유중인 Lot(병)을 골라서 한 번에 위치 이동/폐기' : '보유중인 Lot(병)을 골라서 위치이동/폐기 신청 (관리자 승인 후 반영)'}>
      {!isAdmin && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', background: '#EEF2FB', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12.5px', color: C.navy }}>
          신청하면 목록에 바뀐 내용이 <b style={{ background: pendingBg, padding: '0 4px', borderRadius: '4px' }}>연한 배경색</b>으로 표시돼요. 관리자가 승인해 최종 반영되면 배경색이 사라집니다.
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchAll()}
          placeholder="시약명 검색" style={{ ...inputStyle, maxWidth: '200px' }} />
        <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '160px' }}>
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
          }}>📍 위치 이동{!isAdmin && ' 신청'}</button>
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
                <th style={thStyle}><input type="checkbox" checked={selectableLotIds.length > 0 && checkedLotIds.size === selectableLotIds.length} onChange={toggleAll} /></th>
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
                        <input type="checkbox" checked={checkedLotIds.has(lot.id)} disabled={!!pend} onChange={() => toggleLot(lot.id)} />
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
          bulkMovedBy={movedBy} setBulkMovedBy={setMovedBy} submitLabel={isAdmin ? '이동하기' : '이동 신청'}
          onClose={() => !busy && setShowMoveModal(false)} onSubmit={submitBulkMove} />
      )}
      {showDisposalModal && (
        <BulkDisposalModal checkedCount={checkedLotIds.size} isRequest={!isAdmin}
          reason={disposalReason} setReason={setDisposalReason}
          disposedBy={disposedBy} setDisposedBy={setDisposedBy}
          onClose={() => !busy && setShowDisposalModal(false)} onSubmit={submitBulkDisposal} />
      )}
    </Card>
  )
}
