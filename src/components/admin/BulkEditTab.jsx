import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, btnGhost, thStyle, tdStyle } from '../../design'
import BulkMoveModal from '../reagents/BulkMoveModal'
import BulkDisposalModal from '../reagents/BulkDisposalModal'

// ══════════════════════════════════════════════
//  시약 일괄정리 탭 — src/pages/BulkEdit.jsx(/reagents/bulk-edit)에서 사용.
//  용도: 보유중인 Lot(병)을 여러 개 골라서 한 번에 위치 이동하거나 폐기 처리하는 관리자
//  전용 도구. 시약 종류 단위가 아니라 Lot 단위로 선택 — 같은 시약이라도 Lot이 여러 개면
//  그중 일부만 골라 옮기거나 폐기할 수 있음.
//  관리자 전용 메뉴라(Layout.jsx) 승인 대기 없이 즉시 반영됨.
// ══════════════════════════════════════════════
export default function BulkEditTab({ locations, student }) {
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [checkedLotIds, setCheckedLotIds] = useState(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveLocation, setMoveLocation] = useState('')
  const [movedBy, setMovedBy] = useState('')
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalReason, setDisposalReason] = useState('')
  const [disposedBy, setDisposedBy] = useState('')
  const [busy, setBusy] = useState(false)

  const rooms = [...new Set(locations.map(l => l.room))]

  useEffect(() => { fetchReagents() }, [])

  async function fetchReagents() {
    setLoading(true)
    let query = supabase.from('reagents')
      .select('id, name, company, reagent_lots(id, status, sealed_count, current_stock, location_id, lot_no)')
      .neq('status', 'archived')
      .order('name')
      .range(0, 2999)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    const { data } = await query
    let list = (data || []).map(r => ({ ...r, _activeLots: (r.reagent_lots || []).filter(l => l.status === 'active') }))
    if (roomFilter) {
      const roomLocIds = new Set(locations.filter(l => l.room === roomFilter).map(l => l.id))
      list = list.map(r => ({ ...r, _activeLots: r._activeLots.filter(l => roomLocIds.has(l.location_id)) }))
    }
    list = list.filter(r => r._activeLots.length > 0)
    setReagents(list)
    setCheckedLotIds(new Set())
    setLoading(false)
  }

  // lotId -> { reagentId, reagentName, fromLocationId }
  const lotInfoById = useMemo(() => {
    const m = new Map()
    for (const r of reagents) for (const lot of r._activeLots) {
      m.set(lot.id, { reagentId: r.id, reagentName: r.name, fromLocationId: lot.location_id })
    }
    return m
  }, [reagents])
  const allLotIds = useMemo(() => reagents.flatMap(r => r._activeLots.map(l => l.id)), [reagents])

  function toggleLot(id) {
    setCheckedLotIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleReagentLots(r) {
    const ids = r._activeLots.map(l => l.id)
    const allOn = ids.every(id => checkedLotIds.has(id))
    setCheckedLotIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => allOn ? next.delete(id) : next.add(id))
      return next
    })
  }
  function toggleAll() {
    setCheckedLotIds(prev => prev.size === allLotIds.length ? new Set() : new Set(allLotIds))
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
      await supabase.from('reagent_lots').update({ location_id: moveLocation }).eq('id', lotId)
      await supabase.from('location_history').insert({
        reagent_id: info.reagentId, lot_id: lotId, reagent_name: info.reagentName,
        from_location_id: info.fromLocationId, from_location_name: locationLabel(info.fromLocationId),
        to_location_id: moveLocation, to_location_name: toLocName, moved_by: movedBy,
      })
    }
    await supabase.from('admin_logs').insert({
      admin_name: movedBy, action: '시약 일괄정리 - 위치이동', target_type: 'reagent',
      description: `Lot ${checkedLotIds.size}개 → ${toLocName}`,
    })
    alert(`✅ Lot ${checkedLotIds.size}개 이동 완료! → ${toLocName}`)
    setShowMoveModal(false); setMoveLocation(''); setMovedBy(''); setBusy(false)
    fetchReagents()
  }

  async function submitBulkDisposal() {
    if (!disposalReason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    if (!disposedBy.trim()) { alert('이름을 입력해주세요'); return }
    if (!window.confirm(`Lot ${checkedLotIds.size}개를 폐기 처리합니다. 되돌릴 수 없어요. 계속할까요?`)) return
    setBusy(true)
    const today = new Date().toISOString().split('T')[0]
    for (const lotId of checkedLotIds) {
      const info = lotInfoById.get(lotId)
      if (!info) continue
      await supabase.from('disposal_requests').insert({
        reagent_id: info.reagentId, lot_id: lotId, reagent_name: info.reagentName,
        quantity: '전체', reason: disposalReason,
        requested_by: disposedBy, status: 'disposed', disposed_at: new Date().toISOString(),
        approved_by_student_id: student?.student_id ?? null,
      })
      await supabase.from('reagent_lots').update({
        sealed_count: 0, current_stock: 0, status: 'disposed', disposal_date: today, needs_review: false,
      }).eq('id', lotId)
    }
    await supabase.from('admin_logs').insert({
      admin_name: disposedBy, action: '시약 일괄정리 - 폐기처리', target_type: 'reagent',
      description: `Lot ${checkedLotIds.size}개 폐기 (사유: ${disposalReason})`,
    })
    alert(`🗑️ Lot ${checkedLotIds.size}개 폐기 처리 완료!`)
    setShowDisposalModal(false); setDisposalReason(''); setDisposedBy(''); setBusy(false)
    fetchReagents()
  }

  return (
    <Card title="🧹 시약 일괄정리" sub="보유중인 Lot(병)을 골라서 한 번에 위치 이동하거나 폐기 처리">
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchReagents()}
          placeholder="시약명 검색" style={{ ...inputStyle, maxWidth: '200px' }} />
        <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} style={{ ...inputStyle, maxWidth: '160px' }}>
          <option value="">전체 실험실</option>
          {rooms.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={fetchReagents} style={{ ...btnGhost, padding: '8px 16px' }}>필터 적용</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
        <span style={{ fontSize: '12.5px', color: C.text }}>
          <b>{reagents.length}개 시약 · {allLotIds.length}개 Lot</b> · <b>{checkedLotIds.size}개 Lot</b> 선택됨
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowMoveModal(true)} disabled={checkedLotIds.size === 0} style={{
            background: checkedLotIds.size === 0 ? '#F7F7F7' : '#667EEA', color: checkedLotIds.size === 0 ? C.muted : '#fff',
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: checkedLotIds.size === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600',
          }}>📍 위치 이동</button>
          <button onClick={() => setShowDisposalModal(true)} disabled={checkedLotIds.size === 0} style={{
            background: checkedLotIds.size === 0 ? '#F7F7F7' : C.danger, color: checkedLotIds.size === 0 ? C.muted : '#fff',
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: checkedLotIds.size === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600',
          }}>🗑️ 폐기처리</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}><input type="checkbox" checked={allLotIds.length > 0 && checkedLotIds.size === allLotIds.length} onChange={toggleAll} /></th>
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
                const allOn = r._activeLots.every(l => checkedLotIds.has(l.id))
                return r._activeLots.map((lot, i) => (
                  <tr key={lot.id} onClick={() => toggleLot(lot.id)} style={{ cursor: 'pointer', background: checkedLotIds.has(lot.id) ? '#EEF2FB' : 'transparent' }}>
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedLotIds.has(lot.id)} onChange={() => toggleLot(lot.id)} />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: i === 0 ? '600' : '400', color: i === 0 ? C.navy : C.muted, fontSize: i === 0 ? '13px' : '12px', paddingLeft: i === 0 ? undefined : '24px' }}>
                      {i === 0 ? (
                        <>
                          {r.name}
                          {r.company ? <span style={{ marginLeft: '6px', fontSize: '11px', color: C.muted }}>· {r.company}</span> : null}
                          {r._activeLots.length > 1 && (
                            <span onClick={e => { e.stopPropagation(); toggleReagentLots(r) }}
                              style={{ marginLeft: '8px', fontSize: '10.5px', fontWeight: '700', color: C.navy, background: '#EEF2FB', padding: '1px 8px', borderRadius: '10px', cursor: 'pointer' }}>
                              {allOn ? '전체 해제' : `Lot ${r._activeLots.length}개 전체`}
                            </span>
                          )}
                        </>
                      ) : '↳'}
                    </td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{lot.lot_no || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locationLabel(lot.location_id)}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{lotStockLabel(lot)}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}

      {showMoveModal && (
        <BulkMoveModal checkedCount={checkedLotIds.size} locations={locations}
          bulkMoveLocation={moveLocation} setBulkMoveLocation={setMoveLocation}
          bulkMovedBy={movedBy} setBulkMovedBy={setMovedBy}
          onClose={() => !busy && setShowMoveModal(false)} onSubmit={submitBulkMove} />
      )}
      {showDisposalModal && (
        <BulkDisposalModal checkedCount={checkedLotIds.size}
          reason={disposalReason} setReason={setDisposalReason}
          disposedBy={disposedBy} setDisposedBy={setDisposedBy}
          onClose={() => !busy && setShowDisposalModal(false)} onSubmit={submitBulkDisposal} />
      )}
    </Card>
  )
}
