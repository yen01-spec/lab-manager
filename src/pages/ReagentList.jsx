import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function ReagentList() {
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [reagents, setReagents] = useState([])
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [editingLot, setEditingLot] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editType, setEditType] = useState('')
  const [userName, setUserName] = useState('')

  useEffect(() => { fetchLocations() }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchReagentsByLocation(locationId) {
    const { data } = await supabase
      .from('reagents')
      .select('*, reagent_lots(*)')
      .eq('location_id', locationId)
    if (data) setReagents(data)
  }

  async function openReagent(reagent) {
    const { data } = await supabase
      .from('reagents')
      .select('*, locations(*), reagent_lots(*)')
      .eq('id', reagent.id)
      .single()
    if (data) {
      setSelectedReagent(data)
      setLots(data.reagent_lots || [])
    }
  }

  async function updateStock(lot, field, value) {
    if (!userName.trim()) { alert('이름을 입력해주세요'); return }
    await supabase.from('reagent_lots').update({ [field]: value }).eq('id', lot.id)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lot.id, user_name: userName,
      before_sealed: lot.sealed_count, after_sealed: field === 'sealed_count' ? value : lot.sealed_count,
      before_stock: lot.current_stock, after_stock: field === 'current_stock' ? value : lot.current_stock,
    })
    // 팝업 내 lots 갱신
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, [field]: value } : l))
    setEditingLot(null)
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <h1 style={{ color: '#1e3a5f', marginBottom: '24px' }}>📋 시약 목록</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px' }}>
        {/* 위치 목록 */}
        <div>
          {rooms.map(room => (
            <div key={room} style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: 'bold', color: '#4a5568', fontSize: '13px', marginBottom: '4px', padding: '0 8px' }}>{room}</div>
              {locations.filter(l => l.room === room).map(loc => (
                <div key={loc.id} onClick={() => { setSelectedLocation(loc); fetchReagentsByLocation(loc.id) }}
                  style={{
                    padding: '7px 12px', cursor: 'pointer', borderRadius: '4px', fontSize: '13px',
                    background: selectedLocation?.id === loc.id ? '#1e3a5f' : 'transparent',
                    color: selectedLocation?.id === loc.id ? 'white' : '#4a5568',
                  }}>
                  {loc.detail || loc.room}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 시약 리스트 */}
        <div>
          {selectedLocation ? (
            reagents.length === 0 ? (
              <p style={{ color: '#999' }}>이 위치에 시약이 없습니다.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f7fafc' }}>
                    {['시약명', '회사', '용량', 'Lot', '미개봉(병)', '잔량(%)', '변경'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: '13px', color: '#4a5568' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reagents.map(r =>
                    (r.reagent_lots?.length ? r.reagent_lots : [{ id: null }]).map((lot, i) => {
                      const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
                      return (
                        <tr key={lot.id || r.id} style={{ background: isLow ? '#fff5f5' : 'white' }}
                          onMouseEnter={e => e.currentTarget.style.background = isLow ? '#ffe4e4' : '#f7fafc'}
                          onMouseLeave={e => e.currentTarget.style.background = isLow ? '#fff5f5' : 'white'}>
                          {i === 0 && (
                            <td rowSpan={r.reagent_lots?.length || 1}
                              onClick={() => openReagent(r)}
                              style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', cursor: 'pointer', color: '#1e3a5f', fontSize: '14px' }}>
                              {r.name}
                              {isLow && <span style={{ color: '#e53e3e', fontSize: '11px', marginLeft: '6px' }}>⚠️부족</span>}
                            </td>
                          )}
                          {i === 0 && (
                            <td rowSpan={r.reagent_lots?.length || 1}
                              style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#666', fontSize: '13px' }}>
                              {r.company || '-'}
                            </td>
                          )}
                          {i === 0 && (
                            <td rowSpan={r.reagent_lots?.length || 1}
                              style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', color: '#666', fontSize: '13px' }}>
                              {r.volume}{r.unit}
                            </td>
                          )}
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>{lot.lot_no || '-'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>{lot.sealed_count ?? '-'}</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontSize: '13px' }}>{lot.current_stock ?? '-'}%</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
                            {lot.id && (
                              <button onClick={() => { setEditingLot(lot); setEditValue(''); setEditType('') }}
                                style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}>
                                수정
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            )
          ) : (
            <p style={{ color: '#999', marginTop: '48px', textAlign: 'center' }}>왼쪽에서 위치를 선택하세요</p>
          )}
        </div>
      </div>

      {/* 시약 상세 팝업 */}
      {selectedReagent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setSelectedReagent(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            width: '600px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e3a5f' }}>{selectedReagent.name}</h2>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
                  {selectedReagent.locations?.room}{selectedReagent.locations?.detail && ' - ' + selectedReagent.locations.detail}
                </p>
              </div>
              <button onClick={() => setSelectedReagent(null)} style={{
                background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999'
              }}>✕</button>
            </div>

            {/* 2열 정보 표 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <tbody>
                {[
                  ['CAS No.', selectedReagent.cas_no],
                  ['회사', selectedReagent.company],
                  ['유별/성질', selectedReagent.category],
                  ['용량', selectedReagent.volume + ' ' + selectedReagent.unit],
                  ['유해·위험성', selectedReagent.hazard],
                  ['비고', selectedReagent.notes],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: '10px 16px', background: '#f7fafc', fontWeight: 'bold', fontSize: '13px', color: '#4a5568', width: '35%', borderBottom: '1px solid #e2e8f0' }}>{label}</td>
                    <td style={{ padding: '10px 16px', fontSize: '14px', borderBottom: '1px solid #e2e8f0' }}>{value || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Lot 정보 */}
            <h3 style={{ color: '#1e3a5f', marginBottom: '12px' }}>재고 현황</h3>
            {lots.map(lot => (
              <div key={lot.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' }}>
                  <span>Lot No. <strong>{lot.lot_no || '-'}</strong></span>
                  <span>유통기한: {lot.expiry_date || '-'}</span>
                </div>
                <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
                  <span style={{ fontSize: '14px' }}>미개봉 <strong>{lot.sealed_count}병</strong></span>
                  <span style={{ fontSize: '14px' }}>잔량 <strong>{lot.current_stock}%</strong></span>
                  {lot.sealed_count === 0 && lot.current_stock <= 20 && (
                    <span style={{ color: '#e53e3e', fontWeight: 'bold', fontSize: '13px' }}>⚠️ 재고 부족</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 재고 수정 팝업 */}
      {editingLot && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setEditingLot(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '12px', padding: '32px',
            width: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0, color: '#1e3a5f' }}>재고 수정</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>이름 (필수)</label>
              <input value={userName} onChange={e => setUserName(e.target.value)}
                placeholder="본인 이름"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#666' }}>수정 항목</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setEditType('sealed')} style={{
                  flex: 1, padding: '8px', borderRadius: '4px', cursor: 'pointer',
                  background: editType === 'sealed' ? '#1e3a5f' : '#e2e8f0',
                  color: editType === 'sealed' ? 'white' : '#4a5568', border: 'none'
                }}>미개봉 병 수</button>
                <button onClick={() => setEditType('stock')} style={{
                  flex: 1, padding: '8px', borderRadius: '4px', cursor: 'pointer',
                  background: editType === 'stock' ? '#1e3a5f' : '#e2e8f0',
                  color: editType === 'stock' ? 'white' : '#4a5568', border: 'none'
                }}>잔량 (%)</button>
              </div>
            </div>
            {editType === 'sealed' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>미개봉 병 수</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button onClick={() => setEditValue(v => Math.max(0, (Number(v) || editingLot.sealed_count) - 1))}
                    style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #cbd5e0', cursor: 'pointer', fontSize: '18px', background: 'white' }}>-</button>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', minWidth: '32px', textAlign: 'center' }}>
                    {editValue === '' ? editingLot.sealed_count : editValue}
                  </span>
                  <button onClick={() => setEditValue(v => (Number(v === '' ? editingLot.sealed_count : v) + 1))}
                    style={{ width: '36px', height: '36px', borderRadius: '4px', border: '1px solid #cbd5e0', cursor: 'pointer', fontSize: '18px', background: 'white' }}>+</button>
                </div>
              </div>
            )}
            {editType === 'stock' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', color: '#666' }}>
                  잔량: {editValue === '' ? editingLot.current_stock : editValue}%
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                    <button key={v} onClick={() => setEditValue(v)} style={{
                      padding: '6px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px',
                      background: (editValue === '' ? editingLot.current_stock : editValue) === v ? '#1e3a5f' : '#e2e8f0',
                      color: (editValue === '' ? editingLot.current_stock : editValue) === v ? 'white' : '#4a5568',
                    }}>{v}%</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setEditingLot(null)} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e0',
                background: 'white', cursor: 'pointer'
              }}>취소</button>
              <button onClick={() => {
                if (!editType) { alert('수정 항목을 선택하세요'); return }
                const field = editType === 'sealed' ? 'sealed_count' : 'current_stock'
                const value = editValue === '' ? editingLot[field] : Number(editValue)
                updateStock(editingLot, field, value)
              }} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: '#1e3a5f', color: 'white', cursor: 'pointer', fontWeight: 'bold'
              }}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReagentList