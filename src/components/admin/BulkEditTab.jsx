import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, btnGhost, thStyle, tdStyle } from '../../design'
import BulkMoveModal from '../reagents/BulkMoveModal'
import BulkDisposalModal from '../reagents/BulkDisposalModal'

// ══════════════════════════════════════════════
//  시약 일괄정리 탭 — src/pages/BulkEdit.jsx(/reagents/bulk-edit)에서 사용.
//  용도: 여러 시약을 다중 선택해서 한 번에 위치 이동하거나 폐기 처리하는 관리자 전용 도구.
//  (필드를 한 칸씩 고치는 스프레드시트 편집이 아님 — 그건 시약 상세페이지/재고실사에서.)
//  이 화면은 관리자 전용 메뉴에서만 진입 가능해서(Layout.jsx) 위치이동/폐기 둘 다
//  승인 대기 없이 즉시 반영됨 — 시약목록 편집모드의 다량 위치이동과 같은 방식.
// ══════════════════════════════════════════════
export default function BulkEditTab({ locations, student }) {
  const [reagents, setReagents] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveLocation, setMoveLocation] = useState('')
  const [movedBy, setMovedBy] = useState('')
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalReason, setDisposalReason] = useState('')
  const [disposedBy, setDisposedBy] = useState('')
  const [busy, setBusy] = useState(false)

  const rooms = [...new Set(locations.map(l => l.room))]

  useEffect(() => { fetchReagents() }, [])

  function activeLots(r) {
    return (r.reagent_lots || []).filter(l => l.status === 'active')
  }

  async function fetchReagents() {
    setLoading(true)
    let query = supabase.from('reagents')
      .select('id, name, company, reagent_lots(id, status, sealed_count, current_stock, location_id)')
      .neq('status', 'archived')
      .order('name')
      .range(0, 2999)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    const { data } = await query
    let filtered = data || []
    if (roomFilter) {
      const roomLocIds = new Set(locations.filter(l => l.room === roomFilter).map(l => l.id))
      filtered = filtered.filter(r => activeLots(r).some(l => roomLocIds.has(l.location_id)))
    }
    setReagents(filtered)
    setCheckedIds(new Set())
    setLoading(false)
  }

  function toggleCheck(id) {
    const next = new Set(checkedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setCheckedIds(next)
  }
  function toggleAll() {
    if (checkedIds.size === reagents.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(reagents.map(r => r.id)))
  }

  function locationLabel(locId) {
    const l = locations.find(x => x.id === locId)
    return l ? `${l.room}${l.detail ? ' · ' + l.detail : ''}` : '미지정'
  }
  function locationSummary(r) {
    const lots = activeLots(r)
    if (lots.length === 0) return '보유 0병'
    const uniqueLocs = [...new Set(lots.map(l => l.location_id))]
    return uniqueLocs.length === 1 ? locationLabel(uniqueLocs[0]) : '위치별 상이'
  }

  async function submitBulkMove() {
    if (!moveLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (!movedBy.trim()) { alert('이름을 입력해주세요'); return }
    setBusy(true)
    const toLoc = locations.find(l => l.id === moveLocation)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    const selected = reagents.filter(r => checkedIds.has(r.id))
    let movedLotCount = 0
    for (const r of selected) {
      for (const lot of activeLots(r)) {
        const fromLocName = locationLabel(lot.location_id)
        await supabase.from('reagent_lots').update({ location_id: moveLocation }).eq('id', lot.id)
        await supabase.from('location_history').insert({
          reagent_id: r.id, lot_id: lot.id, reagent_name: r.name,
          from_location_id: lot.location_id, from_location_name: fromLocName,
          to_location_id: moveLocation, to_location_name: toLocName,
          moved_by: movedBy,
        })
        movedLotCount++
      }
    }
    await supabase.from('admin_logs').insert({
      admin_name: movedBy, action: '시약 일괄정리 - 위치이동', target_type: 'reagent',
      description: `${selected.length}개 시약(Lot ${movedLotCount}개) → ${toLocName}`,
    })
    alert(`✅ ${movedLotCount}개 Lot 이동 완료! → ${toLocName}`)
    setShowMoveModal(false)
    setMoveLocation('')
    setMovedBy('')
    setBusy(false)
    fetchReagents()
  }

  async function submitBulkDisposal() {
    if (!disposalReason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    if (!disposedBy.trim()) { alert('이름을 입력해주세요'); return }
    if (!window.confirm(`${checkedIds.size}개 시약의 보유 Lot 전체를 폐기 처리합니다. 되돌릴 수 없어요. 계속할까요?`)) return
    setBusy(true)
    const selected = reagents.filter(r => checkedIds.has(r.id))
    let disposedLotCount = 0
    const today = new Date().toISOString().split('T')[0]
    for (const r of selected) {
      for (const lot of activeLots(r)) {
        await supabase.from('disposal_requests').insert({
          reagent_id: r.id, lot_id: lot.id, reagent_name: r.name,
          quantity: '전체', reason: disposalReason,
          requested_by: disposedBy, status: 'disposed', disposed_at: new Date().toISOString(),
          approved_by_student_id: student?.student_id ?? null,
        })
        await supabase.from('reagent_lots').update({
          sealed_count: 0, current_stock: 0, status: 'disposed', disposal_date: today, needs_review: false,
        }).eq('id', lot.id)
        disposedLotCount++
      }
    }
    await supabase.from('admin_logs').insert({
      admin_name: disposedBy, action: '시약 일괄정리 - 폐기처리', target_type: 'reagent',
      description: `${selected.length}개 시약(Lot ${disposedLotCount}개) 폐기 (사유: ${disposalReason})`,
    })
    alert(`🗑️ ${disposedLotCount}개 Lot 폐기 처리 완료!`)
    setShowDisposalModal(false)
    setDisposalReason('')
    setDisposedBy('')
    setBusy(false)
    fetchReagents()
  }

  return (
    <Card title="🧹 시약 일괄정리" sub="여러 시약을 선택해서 한 번에 위치 이동하거나 폐기 처리">
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
          <b>{reagents.length}개</b> 필터결과 · <b>{checkedIds.size}개</b> 선택됨
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowMoveModal(true)} disabled={checkedIds.size === 0} style={{
            background: checkedIds.size === 0 ? '#F7F7F7' : '#667EEA', color: checkedIds.size === 0 ? C.muted : '#fff',
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: checkedIds.size === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600',
          }}>📍 위치 이동</button>
          <button onClick={() => setShowDisposalModal(true)} disabled={checkedIds.size === 0} style={{
            background: checkedIds.size === 0 ? '#F7F7F7' : C.danger, color: checkedIds.size === 0 ? C.muted : '#fff',
            border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: checkedIds.size === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: '600',
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
                <th style={thStyle}><input type="checkbox" checked={reagents.length > 0 && checkedIds.size === reagents.length} onChange={toggleAll} /></th>
                <th style={thStyle}>시약명</th>
                <th style={thStyle}>회사</th>
                <th style={thStyle}>위치</th>
                <th style={thStyle}>보유 Lot</th>
              </tr>
            </thead>
            <tbody>
              {reagents.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>조건에 맞는 시약이 없습니다.</td></tr>
              ) : reagents.map(r => {
                const lots = activeLots(r)
                return (
                  <tr key={r.id} onClick={() => toggleCheck(r.id)} style={{ cursor: 'pointer', background: checkedIds.has(r.id) ? '#EEF2FB' : 'transparent' }}>
                    <td style={tdStyle} onClick={e => e.stopPropagation()}><input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => toggleCheck(r.id)} /></td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.company || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locationSummary(r)}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{lots.length}개</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showMoveModal && (
        <BulkMoveModal checkedCount={checkedIds.size} locations={locations}
          bulkMoveLocation={moveLocation} setBulkMoveLocation={setMoveLocation}
          bulkMovedBy={movedBy} setBulkMovedBy={setMovedBy}
          onClose={() => !busy && setShowMoveModal(false)} onSubmit={submitBulkMove} />
      )}
      {showDisposalModal && (
        <BulkDisposalModal checkedCount={checkedIds.size}
          reason={disposalReason} setReason={setDisposalReason}
          disposedBy={disposedBy} setDisposedBy={setDisposedBy}
          onClose={() => !busy && setShowDisposalModal(false)} onSubmit={submitBulkDisposal} />
      )}
    </Card>
  )
}
