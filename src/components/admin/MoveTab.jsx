import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary, btnGhost, thStyle, tdStyle } from '../../design'

// ══════════════════════════════════════════════
//  위치 이동
// ══════════════════════════════════════════════
export default function MoveTab({ locations }) {
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [toLocationId, setToLocationId] = useState('')
  const [movedBy, setMovedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [history, setHistory] = useState([])

  // 다량 이동용
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkLocation, setBulkLocation] = useState('')
  const [bulkSearch, setBulkSearch] = useState('')
  const [bulkResults, setBulkResults] = useState([])
  const [checkedIds, setCheckedIds] = useState(new Set())
  const [bulkMovedBy, setBulkMovedBy] = useState('')

  // 위치 이동 신청 목록
  const [requests, setRequests] = useState([])
  const [reqFilter, setReqFilter] = useState('pending')
  const [adminName, setAdminName] = useState('')

  useEffect(() => { fetchHistory(); fetchRequests() }, [])

  async function fetchHistory() {
    const { data } = await supabase.from('location_history')
      .select('*').order('created_at', { ascending: false }).limit(30)
    if (data) setHistory(data)
  }

  async function fetchRequests() {
    const { data } = await supabase.from('location_requests')
      .select('*').order('created_at', { ascending: false })
    if (data) setRequests(data)
  }

  async function handleSearch() {
    if (!search.trim()) return
    const { data } = await supabase.from('reagents')
      .select('*, reagent_lots(*)').ilike('name', `%${search}%`)
    if (data) setSearchResults(data)
  }

  async function handleBulkSearch() {
    const { data } = await supabase.from('reagents')
      .select('*, reagent_lots(*)')
      .ilike('name', `%${bulkSearch}%`)
    if (data) setBulkResults(data)
  }

  // 활성 Lot들의 위치를 표시용 문자열로: 없음/한 곳/여러 곳(상이)
  function locText(r) {
    const active = (r.reagent_lots || []).filter(l => l.status === 'active')
    if (active.length === 0) return '보유 Lot 없음'
    const locIds = new Set(active.map(l => l.location_id).filter(Boolean))
    if (locIds.size === 0) return '미지정'
    if (locIds.size > 1) return '위치별 상이'
    const loc = locations.find(l => l.id === active[0].location_id)
    return loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '미지정'
  }

  // 시약(마스터)의 활성 Lot 전부를 새 위치로 이동 — 여러 Lot이 다른 위치에 있어도 한 번에 정리하는 용도
  async function moveLotsOfReagent(r, toLocationId, toLocName, movedByName, notesText) {
    const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
    let moved = 0
    for (const lot of activeLots) {
      const fromLoc = locations.find(l => l.id === lot.location_id)
      const fromLocName = fromLoc ? `${fromLoc.room}${fromLoc.detail ? ' - ' + fromLoc.detail : ''}` : '미지정'
      await supabase.from('reagent_lots').update({ location_id: toLocationId }).eq('id', lot.id)
      await supabase.from('location_history').insert({
        reagent_id: r.id, lot_id: lot.id, reagent_name: r.name,
        from_location_id: lot.location_id, from_location_name: fromLocName,
        to_location_id: toLocationId, to_location_name: toLocName,
        moved_by: movedByName, notes: notesText,
      })
      moved++
    }
    return moved
  }

  async function moveReagent() {
    if (!selectedReagent) { alert('시약을 선택해주세요'); return }
    if (!toLocationId) { alert('이동할 위치를 선택해주세요'); return }
    if (!movedBy.trim()) { alert('이동자 이름을 입력해주세요'); return }
    const activeLots = (selectedReagent.reagent_lots || []).filter(l => l.status === 'active')
    if (activeLots.length === 0) { alert('보유중인(활성) Lot이 없어 이동할 수 없습니다'); return }

    const toLoc = locations.find(l => l.id === toLocationId)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    const fromLocName = locText(selectedReagent)

    const movedCount = await moveLotsOfReagent(selectedReagent, toLocationId, toLocName, movedBy, notes)
    await supabase.from('admin_logs').insert({
      admin_name: movedBy, action: '위치 이동',
      target_type: 'reagent',
      description: `${selectedReagent.name}(Lot ${movedCount}개): ${fromLocName} → ${toLocName}`,
    })
    alert(`✅ ${selectedReagent.name} 이동 완료! (Lot ${movedCount}개)\n${fromLocName} → ${toLocName}`)
    setSelectedReagent(null); setToLocationId(''); setNotes('')
    setSearch(''); setSearchResults([])
    fetchHistory()
  }

  async function bulkMove() {
    if (checkedIds.size === 0) { alert('시약을 선택해주세요'); return }
    if (!bulkLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (!bulkMovedBy.trim()) { alert('이동자 이름을 입력해주세요'); return }

    const toLoc = locations.find(l => l.id === bulkLocation)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    const selected = bulkResults.filter(r => checkedIds.has(r.id))

    let movedLotCount = 0
    let skippedCount = 0
    for (const r of selected) {
      const n = await moveLotsOfReagent(r, bulkLocation, toLocName, bulkMovedBy, undefined)
      if (n === 0) skippedCount++
      movedLotCount += n
    }
    await supabase.from('admin_logs').insert({
      admin_name: bulkMovedBy, action: '다량 위치 이동',
      target_type: 'reagent',
      description: `${selected.length}개 시약(Lot ${movedLotCount}개) → ${toLocName}`,
    })
    alert(`✅ ${movedLotCount}개 Lot 이동 완료! → ${toLocName}` + (skippedCount > 0 ? `\n(보유중인 Lot이 없어 ${skippedCount}개 시약은 건너뜀)` : ''))
    setCheckedIds(new Set()); setBulkLocation(''); setBulkMovedBy('')
    setBulkResults([]); setBulkSearch('')
    fetchHistory()
  }

  async function approveRequest(req) {
    if (!adminName.trim()) { alert('승인자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 위치 이동을 승인하시겠습니까?\n${req.from_location_name} → ${req.to_location_name}`)) return

    if (req.lot_id) {
      // 신청 시점에 특정 Lot이 지정된 경우 — 그 Lot만 이동
      await supabase.from('reagent_lots').update({ location_id: req.to_location_id }).eq('id', req.lot_id)
    } else {
      // 오래된 신청(마이그레이션 이전) 등 Lot이 특정되지 않은 경우 — 해당 시약의 활성 Lot 전부 이동
      const { data: r } = await supabase.from('reagents').select('*, reagent_lots(*)').eq('id', req.reagent_id).single()
      if (r) await moveLotsOfReagent(r, req.to_location_id, req.to_location_name, adminName, `신청자: ${req.requested_by}`)
    }
    await supabase.from('location_requests').update({
      status: 'approved', approved_by: adminName, approved_at: new Date().toISOString(),
    }).eq('id', req.id)
    if (req.lot_id) {
      await supabase.from('location_history').insert({
        reagent_id: req.reagent_id, lot_id: req.lot_id, reagent_name: req.reagent_name,
        from_location_id: req.from_location_id, from_location_name: req.from_location_name,
        to_location_id: req.to_location_id, to_location_name: req.to_location_name,
        moved_by: adminName, notes: `신청자: ${req.requested_by}`,
      })
    }
    await supabase.from('admin_logs').insert({
      admin_name: adminName, action: '위치 이동 승인',
      target_type: 'reagent',
      description: `${req.reagent_name}: ${req.from_location_name} → ${req.to_location_name}`,
    })
    fetchRequests(); fetchHistory()
  }

  async function rejectRequest(req) {
    if (!adminName.trim()) { alert('처리자 이름을 입력해주세요'); return }
    if (!window.confirm(`"${req.reagent_name}" 위치 이동 신청을 반려하시겠습니까?`)) return
    await supabase.from('location_requests').update({ status: 'rejected' }).eq('id', req.id)
    fetchRequests()
  }

  const toggleCheck = (id) => {
    const next = new Set(checkedIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setCheckedIds(next)
  }

  const toggleAll = () => {
    if (checkedIds.size === bulkResults.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(bulkResults.map(r => r.id)))
  }

  const filteredReqs = reqFilter === 'all' ? requests : requests.filter(r => r.status === reqFilter)
  const reqCounts = { all: requests.length, pending: 0, approved: 0, rejected: 0 }
  requests.forEach(r => { if (reqCounts[r.status] !== undefined) reqCounts[r.status]++ })
  const statusColor = { pending: '#E8A020', approved: '#38A169', rejected: C.danger }
  const statusLabel = { pending: '대기중', approved: '승인됨', rejected: '반려' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 위치 이동 신청 목록 */}
      <Card title="📬 위치 이동 신청 목록" sub="학생 신청 승인/반려">
        <div style={{ marginBottom: '16px', padding: '12px 16px',
          background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
          <label style={labelStyle}>처리자 이름 *</label>
          <input value={adminName} onChange={e => setAdminName(e.target.value)}
            placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[['all','전체'],['pending','대기중'],['approved','승인됨'],['rejected','반려']].map(([key, label]) => (
            <button key={key} onClick={() => setReqFilter(key)} style={{
              padding: '5px 14px', borderRadius: '16px', border: 'none', cursor: 'pointer',
              background: reqFilter === key ? C.navy : C.bg,
              color: reqFilter === key ? '#fff' : C.text,
              fontSize: '12px', fontWeight: reqFilter === key ? '700' : '400',
            }}>{label} <span style={{ opacity: 0.7 }}>({reqCounts[key] ?? 0})</span></button>
          ))}
        </div>
        {filteredReqs.length === 0
          ? <div style={{ textAlign: 'center', padding: '24px', color: C.muted, fontSize: '13px' }}>신청 내역이 없습니다</div>
          : filteredReqs.map(req => (
            <div key={req.id} style={{ border: `1px solid ${C.border}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ background: statusColor[req.status] + '22', color: statusColor[req.status],
                  fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>
                  {statusLabel[req.status]}
                </span>
                <span style={{ fontWeight: '700', color: C.navy }}>{req.reagent_name}</span>
                <span style={{ color: C.muted, fontSize: '12px', marginLeft: 'auto' }}>{req.requested_by} · {new Date(req.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: '13px', color: C.muted, marginBottom: '8px' }}>
                {req.from_location_name || '미지정'} → <strong style={{ color: '#276749' }}>{req.to_location_name}</strong>
                {req.notes && <span style={{ marginLeft: '8px' }}>({req.notes})</span>}
              </div>
              {req.status === 'pending' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => approveRequest(req)}
                    style={{ ...btnPrimary, background: '#38A169', padding: '5px 14px', fontSize: '12px' }}>✓ 승인</button>
                  <button onClick={() => rejectRequest(req)}
                    style={{ ...btnPrimary, background: C.danger, padding: '5px 14px', fontSize: '12px' }}>✗ 반려</button>
                </div>
              )}
              {req.approved_by && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>승인자: {req.approved_by}</div>}
            </div>
          ))}
      </Card>

      {/* 모드 전환 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => setBulkMode(false)} style={{
          ...btnPrimary, background: !bulkMode ? C.navy : C.bg,
          color: !bulkMode ? '#fff' : C.text, border: `1px solid ${C.border}`,
        }}>📍 단일 이동</button>
        <button onClick={() => setBulkMode(true)} style={{
          ...btnPrimary, background: bulkMode ? C.navy : C.bg,
          color: bulkMode ? '#fff' : C.text, border: `1px solid ${C.border}`,
        }}>📋 다량 이동</button>
      </div>

      {/* 단일 이동 */}
      {!bulkMode && (
        <Card title="📍 단일 시약 이동" sub="Single Move">
          <div style={{ marginBottom: '20px', padding: '12px 16px',
            background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
            <label style={labelStyle}>이동자 이름 *</label>
            <input value={movedBy} onChange={e => setMovedBy(e.target.value)}
              placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>시약 검색 *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={search}
                onChange={e => { setSearch(e.target.value); setSelectedReagent(null) }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="시약 이름으로 검색..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={handleSearch} style={{ ...btnPrimary, padding: '9px 18px', flexShrink: 0 }}>검색</button>
            </div>
          </div>
          {searchResults.length > 0 && !selectedReagent && (
            <div style={{ marginBottom: '16px', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
              {searchResults.map(r => (
                <div key={r.id} onClick={() => { setSelectedReagent(r); setSearchResults([]) }}
                  style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, fontSize: '13px' }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = C.white}>
                  <span style={{ fontWeight: '600', color: C.navy }}>{r.name}</span>
                  <span style={{ color: C.muted, marginLeft: '12px', fontSize: '12px' }}>
                    현재: {locText(r)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {selectedReagent && (
            <div style={{ marginBottom: '16px', padding: '12px 16px',
              background: '#EEF2FB', borderRadius: '8px', border: `1px solid ${C.navy}33`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '700', color: C.navy }}>{selectedReagent.name}</div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                  현재: {locText(selectedReagent)}
                </div>
              </div>
              <button onClick={() => setSelectedReagent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '16px' }}>✕</button>
            </div>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>이동할 위치 *</label>
            <select value={toLocationId} onChange={e => setToLocationId(e.target.value)} style={inputStyle}>
              <option value="">선택하세요</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>메모</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="선택사항" style={inputStyle} />
          </div>
          {selectedReagent && toLocationId && (
            <div style={{ marginBottom: '16px', padding: '10px 14px',
              background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
              <strong style={{ color: '#276749' }}>이동 미리보기:</strong>
              <div style={{ marginTop: '4px', color: '#2D6A4F' }}>
                {locText(selectedReagent)}
                {' → '}
                {(() => { const l = locations.find(l => l.id === toLocationId); return l ? `${l.room}${l.detail ? ' - ' + l.detail : ''}` : '' })()}
              </div>
            </div>
          )}
          <button onClick={moveReagent} style={{ ...btnPrimary, background: '#667EEA' }}>📍 위치 이동</button>
        </Card>
      )}

      {/* 다량 이동 */}
      {bulkMode && (
        <Card title="📋 다량 시약 이동" sub="Bulk Move">
          <div style={{ marginBottom: '20px', padding: '12px 16px',
            background: '#F0F4FF', borderRadius: '8px', border: '1px solid #C3D0F5' }}>
            <label style={labelStyle}>이동자 이름 *</label>
            <input value={bulkMovedBy} onChange={e => setBulkMovedBy(e.target.value)}
              placeholder="본인 이름" style={{ ...inputStyle, maxWidth: '240px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>시약 검색</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBulkSearch()}
                  placeholder="이름 검색 (빈칸=전체)"
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={handleBulkSearch} style={{ ...btnPrimary, padding: '9px 14px', flexShrink: 0 }}>검색</button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>이동할 위치 *</label>
              <select value={bulkLocation} onChange={e => setBulkLocation(e.target.value)} style={inputStyle}>
                <option value="">선택하세요</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
              </select>
            </div>
          </div>

          {bulkResults.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: C.muted }}>
                  <strong style={{ color: C.navy }}>{checkedIds.size}개</strong> 선택됨 / 총 {bulkResults.length}개
                </div>
                <button onClick={toggleAll} style={{ ...btnGhost, padding: '4px 12px', fontSize: '12px' }}>
                  {checkedIds.size === bulkResults.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' }}>
                {bulkResults.map(r => (
                  <div key={r.id} onClick={() => toggleCheck(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 16px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                      background: checkedIds.has(r.id) ? '#EEF2FB' : C.white,
                    }}
                    onMouseEnter={e => { if (!checkedIds.has(r.id)) e.currentTarget.style.background = C.bg }}
                    onMouseLeave={e => { if (!checkedIds.has(r.id)) e.currentTarget.style.background = C.white }}>
                    <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => {}} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: '600', color: C.navy, fontSize: '13px' }}>{r.name}</span>
                      <span style={{ color: C.muted, fontSize: '12px', marginLeft: '12px' }}>
                        {locText(r)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {checkedIds.size > 0 && bulkLocation && (
            <div style={{ marginBottom: '16px', padding: '10px 14px',
              background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
              <strong style={{ color: '#276749' }}>이동 미리보기:</strong>
              <div style={{ marginTop: '4px', color: '#2D6A4F' }}>
                선택된 {checkedIds.size}개 시약 →{' '}
                {(() => { const l = locations.find(l => l.id === bulkLocation); return l ? `${l.room}${l.detail ? ' - ' + l.detail : ''}` : '' })()}
              </div>
            </div>
          )}

          <button onClick={bulkMove} style={{ ...btnPrimary, background: '#667EEA' }}>
            📋 {checkedIds.size > 0 ? `${checkedIds.size}개 ` : ''}일괄 이동
          </button>
        </Card>
      )}

      {/* 이동 이력 */}
      <Card title="📋 위치 이동 이력" noPadding>
        {history.length === 0
          ? <div style={{ padding: '24px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>이동 이력이 없습니다</div>
          : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['일시','시약명','이전 위치','새 위치','이동자','메모'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={{ ...tdStyle, color: C.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                    <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{h.reagent_name}</td>
                    <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{h.from_location_name || '미지정'}</td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}><span style={{ color: '#276749', fontWeight: '600' }}>{h.to_location_name}</span></td>
                    <td style={{ ...tdStyle, fontSize: '12px' }}>{h.moved_by}</td>
                    <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{h.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
      </Card>
    </div>
  )
}
