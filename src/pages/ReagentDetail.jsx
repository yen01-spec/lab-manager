import { useEffect, useState } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, inputStyle, labelStyle, btnPrimary, btnGhost } from '../design'

const GHS_MAP = [
  { keywords: ['인화', '발화', '가연', 'flammable', 'flame'],        emoji: '🔥', label: '인화성' },
  { keywords: ['독성', '독극', 'toxic', 'poison', '독'],              emoji: '💀', label: '독성' },
  { keywords: ['부식', '산', '염기', 'corrosive', 'acid', 'base'],    emoji: '🧪', label: '부식성' },
  { keywords: ['폭발', 'explosi', '폭'],                              emoji: '💥', label: '폭발성' },
  { keywords: ['산화', 'oxidiz', 'oxidis'],                           emoji: '🔶', label: '산화성' },
  { keywords: ['가스', '고압', 'gas', 'pressure'],                    emoji: '🫧', label: '고압가스' },
  { keywords: ['자극', '경고', 'irritant', 'warning', '유해'],        emoji: '⚠️', label: '유해성' },
  { keywords: ['환경', '수생', 'environment', 'aquatic'],             emoji: '🌊', label: '환경유해' },
  { keywords: ['발암', '생식', '변이', 'carcinogen', 'mutagen'],      emoji: '☣️', label: '발암성' },
]
function getGhsEmojis(hazard) {
  if (!hazard) return []
  const lower = hazard.toLowerCase()
  return GHS_MAP.filter(g => g.keywords.some(k => lower.includes(k)))
}

const FIELD_LABELS = {
  cas_no: 'CAS 번호', company: '제조사', category: '유별/성질', volume: '용량',
  manager: '담당자', msds_url: 'MSDS URL', notes: '비고',
}

function InfoRow({ label, value, sourceBadge }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13.5px', color: C.text }}>{value || '-'} {sourceBadge}</div>
    </div>
  )
}

export default function ReagentDetail() {
  const { id } = useParams()
  const { isAdmin, student } = useOutletContext?.() || {}

  const [reagent, setReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [pendingChanges, setPendingChanges] = useState([])
  const [confirmedByName, setConfirmedByName] = useState('')
  const [registeredByName, setRegisteredByName] = useState('')
  const [stockHistory, setStockHistory] = useState([])
  const [disposalPending, setDisposalPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploadingMsds, setUploadingMsds] = useState(false)

  const [editMode, setEditMode] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [inlineEdit, setInlineEdit] = useState(null)

  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalForm, setDisposalForm] = useState({ quantity: '1', reason: '', requested_by: '' })
  const [showStockModal, setShowStockModal] = useState(false)
  const [stockForm, setStockForm] = useState({ action: 'out', quantity: '', unit: '', user_name: '', notes: '' })
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveForm, setMoveForm] = useState({ to_location_id: '', requested_by: '', notes: '' })
  const [locations, setLocations] = useState([])

  useEffect(() => { fetchAll() }, [id])
  useEffect(() => { supabase.from('locations').select('*').order('room').then(({ data }) => data && setLocations(data)) }, [])

  async function fetchAll() {
    const { data } = await supabase.from('reagents')
      .select('*, locations(*), reagent_lots(*)').eq('id', id).single()
    if (data) {
      setReagent(data)
      setLots(data.reagent_lots || [])
      const { data: history } = await supabase.from('stock_history')
        .select('*').eq('reagent_id', id).order('created_at', { ascending: false }).limit(20)
      if (history) setStockHistory(history)
      fetchPendingChanges()
      if (data.confirmed_by) {
        const { data: cs } = await supabase.from('students').select('name').eq('student_id', data.confirmed_by).maybeSingle()
        setConfirmedByName(cs?.name || data.confirmed_by)
      } else setConfirmedByName('')
      if (data.registered_by) {
        const { data: rs } = await supabase.from('students').select('name').eq('student_id', data.registered_by).maybeSingle()
        setRegisteredByName(rs?.name || data.registered_by)
      } else setRegisteredByName('')
      const { data: disposal } = await supabase.from('disposal_requests')
        .select('*').eq('reagent_id', id).eq('status', 'pending').maybeSingle()
      setDisposalPending(disposal || null)

      if (data.cas_no) {
        try {
          const GHS_KEY = 'e9bf2e5bc508d370a9660687c34a6730eae5237e78bad04e08f66705be15d597'
          const ghsRes = await fetch(
            `https://apis.data.go.kr/B552584/kecoapi/ncisghs/ghsList?serviceKey=${GHS_KEY}&searchGubun=2&searchNm=${encodeURIComponent(data.cas_no)}&pageNo=1&numOfRows=1&returnType=JSON`
          )
          if (ghsRes.ok) {
            const ghsData = await ghsRes.json()
            const items = ghsData?.body?.items
            const first = Array.isArray(items) ? items[0] : items
            if (first) {
              const korName = first.sbstnNmKor || ''
              const isYudok = first.sbstnTypeUnqno ? first.sbstnTypeUnqno.split('^')[0] : ''
              const hazard = first.hrmflnList ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ') : ''
              setReagent(prev => ({ ...prev, hazard: prev.hazard || hazard, ghs_live: { korName, isYudok, hazard } }))
            }
          }
        } catch { /* GHS 조회 실패 시 무시 — DB 값만 표시 */ }
      }
    }
    setLoading(false)
  }

  async function fetchPendingChanges() {
    const { data } = await supabase.from('reagent_change_requests')
      .select('*').eq('reagent_id', id).eq('status', 'pending')
    setPendingChanges(data || [])
  }

  async function saveField(field, value, sourceField) {
    if (isAdmin) {
      const updateData = { [field]: value }
      if (sourceField) updateData[sourceField] = 'manual'
      await supabase.from('reagents').update(updateData).eq('id', id)
      setReagent(prev => ({ ...prev, [field]: value, ...(sourceField ? { [sourceField]: 'manual' } : {}) }))
    } else {
      await supabase.from('reagent_change_requests').insert({
        reagent_id: id, field_name: field,
        old_value: String(reagent[field] ?? ''), new_value: String(value),
        requested_by: student?.name || '', requested_by_student_id: student?.student_id ?? null,
        status: 'pending',
      })
      alert('수정 신청 완료! 관리자 승인 후 반영됩니다.')
      fetchPendingChanges()
    }
    setEditingField(null)
  }

  async function confirmReagent() {
    if (!student) { alert('로그인 후 이용해주세요'); return }
    const now = new Date().toISOString()
    await supabase.from('reagents').update({ last_confirmed_at: now, confirmed_by: student.student_id }).eq('id', id)
    setReagent(prev => ({ ...prev, last_confirmed_at: now, confirmed_by: student.student_id }))
    setConfirmedByName(student.name)
  }

  async function uploadMsds(file) {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { alert('20MB 이하 파일만 업로드할 수 있어요'); return }
    setUploadingMsds(true)
    const ext = file.name.split('.').pop()
    const path = `msds/${id}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, file)
    if (error) { alert('업로드 중 오류가 발생했습니다: ' + error.message); setUploadingMsds(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    await supabase.from('reagents').update({ msds_url: urlData.publicUrl, msds_source: 'manual' }).eq('id', id)
    setReagent(prev => ({ ...prev, msds_url: urlData.publicUrl, msds_source: 'manual' }))
    setUploadingMsds(false)
  }

  function startInlineEdit(lotId, field, currentValue, e) {
    e.stopPropagation()
    if (!isAdmin) return
    setInlineEdit({ lotId, field, value: currentValue })
  }

  async function saveInlineEdit(lot) {
    if (!inlineEdit) return
    const { lotId, field, value } = inlineEdit
    const numVal = Number(value)
    if (isNaN(numVal)) { alert('숫자를 입력해주세요'); return }
    await supabase.from('reagent_lots').update({ [field]: numVal }).eq('id', lotId)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lotId, user_name: student?.name || '',
      before_sealed: lot.sealed_count,
      after_sealed: field === 'sealed_count' ? numVal : lot.sealed_count,
      before_stock: lot.current_stock,
      after_stock: field === 'current_stock' ? numVal : lot.current_stock,
    })
    setInlineEdit(null)
    fetchAll()
  }

  async function submitDisposal() {
    if (!disposalForm.requested_by.trim()) { alert('신청자 이름을 입력해주세요'); return }
    if (!disposalForm.reason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    const firstLot = lots[0]
    await supabase.from('disposal_requests').insert({
      reagent_id: id, lot_id: firstLot?.id || null,
      reagent_name: reagent.name, lot_no: firstLot?.lot_no || null,
      quantity: disposalForm.quantity, reason: disposalForm.reason,
      requested_by: disposalForm.requested_by, requested_by_student_id: student?.student_id ?? null,
      status: 'pending',
    })
    alert('폐기 신청이 완료됐어요!')
    setShowDisposalModal(false)
    setDisposalForm({ quantity: '1', reason: '', requested_by: '' })
    fetchAll()
  }

  async function resolveDisposal(action) {
    if (!disposalPending) return
    if (action === 'confirm') {
      await supabase.from('disposal_requests').update({ status: 'approved', approved_by_student_id: student?.student_id ?? null }).eq('id', disposalPending.id)
      const firstLot = lots[0]
      if (firstLot) await supabase.from('reagent_lots').update({
        sealed_count: 0, current_stock: 0, disposal_date: new Date().toISOString().split('T')[0],
      }).eq('id', firstLot.id)
    } else {
      await supabase.from('disposal_requests').update({ status: 'rejected' }).eq('id', disposalPending.id)
    }
    fetchAll()
  }

  async function submitStock() {
    if (!stockForm.user_name.trim()) { alert('이름을 입력해주세요'); return }
    if (!stockForm.quantity) { alert('수량을 입력해주세요'); return }
    const firstLot = lots[0]
    if (!firstLot) { alert('Lot 정보가 없습니다'); return }
    const qty = Number(stockForm.quantity)
    let newSealed = firstLot.sealed_count
    let newStock = firstLot.current_stock
    if (stockForm.action === 'in') newSealed = firstLot.sealed_count + qty
    else if (stockForm.action === 'out') newStock = Math.max(0, firstLot.current_stock - qty)
    else if (stockForm.action === 'open') {
      newSealed = Math.max(0, firstLot.sealed_count - 1)
      newStock = 100
      await supabase.from('reagent_lots').update({ opened_date: new Date().toISOString().split('T')[0] }).eq('id', firstLot.id)
    }
    await supabase.from('reagent_lots').update({ sealed_count: newSealed, current_stock: newStock }).eq('id', firstLot.id)
    await supabase.from('stock_history').insert({
      reagent_id: id, lot_id: firstLot.id,
      reagent_name: reagent.name, action: stockForm.action,
      quantity: qty, unit: stockForm.unit || reagent.unit || '',
      before_stock: firstLot.current_stock, after_stock: newStock,
      user_name: stockForm.user_name, notes: stockForm.notes,
    })
    alert('기록되었습니다!')
    setShowStockModal(false)
    setStockForm({ action: 'out', quantity: '', unit: '', user_name: '', notes: '' })
    fetchAll()
  }

  async function submitMove() {
    if (!moveForm.requested_by.trim()) { alert('이름을 입력해주세요'); return }
    if (!moveForm.to_location_id) { alert('이동할 위치를 선택해주세요'); return }
    if (reagent.location_id === moveForm.to_location_id) { alert('현재 위치와 같습니다'); return }
    const toLoc = locations.find(l => l.id === moveForm.to_location_id)
    const fromLocName = reagent.locations
      ? `${reagent.locations.room}${reagent.locations.detail ? ' - ' + reagent.locations.detail : ''}` : '미지정'
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    if (isAdmin) {
      await supabase.from('reagents').update({ location_id: moveForm.to_location_id }).eq('id', id)
      await supabase.from('location_history').insert({
        reagent_id: id, reagent_name: reagent.name,
        from_location_id: reagent.location_id, from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        moved_by: moveForm.requested_by, notes: moveForm.notes,
      })
      alert(`✅ 위치 이동 완료!\n${fromLocName} → ${toLocName}`)
      setShowMoveModal(false)
      fetchAll()
    } else {
      await supabase.from('location_requests').insert({
        reagent_id: id, reagent_name: reagent.name,
        from_location_id: reagent.location_id, from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        requested_by: moveForm.requested_by, notes: moveForm.notes, status: 'pending',
      })
      alert('위치 이동 신청 완료! 관리자 승인 후 처리됩니다.')
      setShowMoveModal(false)
    }
  }

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>
  if (!reagent) return <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>시약을 찾을 수 없습니다.</div>

  const ghsList = getGhsEmojis(reagent.hazard || reagent.ghs_live?.hazard)
  const cardStyle = { background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 1px 3px rgba(16,24,40,.06)', overflow: 'hidden' }
  const cardHeadStyle = { padding: '14px 20px', borderBottom: `1px solid ${C.border}`, fontSize: '13.5px', fontWeight: '700', color: C.navy }

  const fieldRows = [
    ['cas_no', 'CAS 번호', reagent.cas_no, reagent.cas_source],
    ['company', '제조사', reagent.company, reagent.company_source],
    ['category', '유별/성질', reagent.category, reagent.category_source],
    ['volume', '용량', reagent.volume ? `${reagent.volume} ${reagent.unit || ''}` : '', reagent.volume_source],
  ]

  return (
    <div>
      <PageBanner
        title={reagent.name}
        sub={reagent.volume ? `${reagent.volume}${reagent.unit || ''}` : undefined}
        breadcrumb={['시약', reagent.name]}
        extra={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setShowDisposalModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #F3D6D6', background: '#FDECEC', fontSize: '13px', color: '#C13B3F', fontWeight: '600', cursor: 'pointer' }}>🗑️ 폐기 신청</button>
            <button onClick={() => setShowStockModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.white, fontSize: '13px', color: '#586173', cursor: 'pointer' }}>📦 입출고</button>
            <button onClick={() => setShowMoveModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.white, fontSize: '13px', color: '#586173', cursor: 'pointer' }}>📍 위치 이동{!isAdmin && ' 신청'}</button>
            {student && (
              <button onClick={() => setEditMode(v => !v)} style={{
                padding: '9px 16px', borderRadius: '8px', border: `1px solid ${editMode ? C.navy : C.border}`,
                background: editMode ? C.navy : C.white, fontSize: '13px', color: editMode ? '#fff' : '#586173',
                cursor: 'pointer', fontWeight: '600',
              }}>✏️ {editMode ? '수정 완료' : isAdmin ? '정보 수정' : '수정 신청'}</button>
            )}
            {student && (
              <button onClick={confirmReagent} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: C.blue, fontSize: '13px', color: '#fff', fontWeight: '600', cursor: 'pointer' }}>✓ 정보 맞음 · 확인만 하기</button>
            )}
          </div>
        }
      />
      <div style={{ padding: '20px 32px' }}>

      {editMode && !isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FBF0DF', border: '1px solid #F0DBAE', borderRadius: '10px', padding: '11px 16px', marginBottom: '18px', fontSize: '12.5px', color: '#8A5A16' }}>
          ⚠️ 노란 배경으로 표시된 항목은 <b>수정 제안이 대기중</b>이에요. 관리자가 최종반영해야 실제로 바뀝니다. 값을 입력하고 포커스를 옮기면 신청이 접수돼요.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* 기본정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>기본정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', padding: '18px 20px' }}>
              {fieldRows.map(([field, label, value, source]) => {
                const pending = pendingChanges.find(p => p.field_name === field)
                const isEditing = editMode && editingField === field
                return (
                  <div key={field} style={{ background: pending ? '#FBF0DF' : 'transparent', borderRadius: '8px', padding: pending ? '8px 10px' : 0, margin: pending ? '-8px -10px' : 0 }}>
                    {pending && (
                      <div style={{ fontSize: '10.5px', color: '#8A5A16', marginBottom: '3px', fontWeight: '600' }}>
                        {isAdmin ? `${pending.requested_by} 제안 · 대기중` : '수정 제안됨 · 대기중'}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>{label}</div>
                    {isEditing ? (
                      <input autoFocus value={editingValue} onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveField(field, editingValue, source ? `${field}_source` : null) }}
                        onBlur={() => saveField(field, editingValue, source ? `${field}_source` : null)}
                        style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }} />
                    ) : (
                      <div style={{ fontSize: '13.5px', color: C.text, cursor: editMode ? 'text' : 'default' }}
                        onClick={() => { if (editMode) { setEditingField(field); setEditingValue(value || '') } }}>
                        {value || '-'}
                        {pending && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#8A5A16' }}>→ {pending.new_value}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 재고정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>재고정보 {lots.length > 1 && <span style={{ fontWeight: 400, color: C.muted, fontSize: '12px' }}>· Lot {lots.length}개</span>}</div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {lots.map(lot => {
                const editingSealed = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'sealed_count'
                const editingStock = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'current_stock'
                const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
                return (
                  <div key={lot.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 20px', paddingBottom: lots.length > 1 ? '12px' : 0, borderBottom: lots.length > 1 ? `1px solid ${C.borderRow}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted, marginBottom: '4px' }}>미개봉 병 수</div>
                      {editingSealed ? (
                        <input autoFocus type="number" min="0" value={inlineEdit.value}
                          onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                          onBlur={() => saveInlineEdit(lot)}
                          style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13.5px' }} />
                      ) : (
                        <div onClick={e => isAdmin && startInlineEdit(lot.id, 'sealed_count', lot.sealed_count, e)}
                          style={{ fontSize: '13.5px', color: C.text, cursor: isAdmin ? 'text' : 'default' }}>{lot.sealed_count}병</div>
                      )}
                    </div>
                    <div style={{ background: isLow ? '#FDECEC' : 'transparent', borderRadius: '8px', padding: isLow ? '8px 10px' : 0, margin: isLow ? '-8px -10px' : 0 }}>
                      <div style={{ fontSize: '11px', color: isLow ? '#C13B3F' : C.muted, marginBottom: '4px', fontWeight: isLow ? '600' : '400' }}>개봉 병 잔량{isLow ? ' · 부족' : ''}</div>
                      {editingStock ? (
                        <input autoFocus type="number" min="0" max="100" value={inlineEdit.value}
                          onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                          onBlur={() => saveInlineEdit(lot)}
                          style={{ width: '60px', padding: '4px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13.5px' }} />
                      ) : (
                        <div onClick={e => isAdmin && startInlineEdit(lot.id, 'current_stock', lot.current_stock, e)}
                          style={{ fontSize: '13.5px', color: C.text, cursor: isAdmin ? 'text' : 'default' }}>{lot.current_stock}%</div>
                      )}
                    </div>
                    <InfoRow label="Lot" value={lot.lot_no} />
                    <InfoRow label="입고일" value={lot.received_date} />
                    <InfoRow label="개봉일" value={lot.opened_date} />
                    <InfoRow label="유효기간" value={lot.expiry_date} />
                    {lot.disposal_date && <InfoRow label="폐기일" value={lot.disposal_date} />}
                  </div>
                )
              })}
              {lots.length === 0 && <div style={{ color: C.muted, fontSize: '13px' }}>등록된 Lot이 없습니다.</div>}
            </div>
          </div>

          {/* 안전정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>안전정보</div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {ghsList.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ghsList.map(g => (
                    <span key={g.label} style={{ background: '#FDECEC', color: '#C13B3F', fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '999px' }}>{g.emoji} {g.label}</span>
                  ))}
                </div>
              )}
              {reagent.ghs_live?.isYudok && (
                <span style={{ background: '#FDECEC', color: '#C13B3F', border: '1px solid #F3D6D6', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', width: 'fit-content' }}>⚠️ {reagent.ghs_live.isYudok}</span>
              )}
              {ghsList.length === 0 && !reagent.ghs_live?.isYudok && <div style={{ fontSize: '12.5px', color: C.muted }}>등록된 위험정보가 없습니다.</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {reagent.msds_url ? (
                  <a href={reagent.msds_url} target="_blank" rel="noreferrer" style={{ fontSize: '12.5px' }}>📄 MSDS 문서 보기</a>
                ) : (
                  <span style={{ fontSize: '12.5px', color: C.muted }}>등록된 MSDS 파일이 없습니다.</span>
                )}
                {reagent.cas_no && (
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(reagent.cas_no + ' MSDS')}`} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: C.muted }}>
                    🔍 CAS 번호로 MSDS 검색
                  </a>
                )}
                {isAdmin && (
                  <label style={{ fontSize: '11.5px', color: C.blue, cursor: uploadingMsds ? 'default' : 'pointer' }}>
                    {uploadingMsds ? '업로드 중...' : (reagent.msds_url ? '📤 파일 교체' : '📤 MSDS 파일 업로드')}
                    <input type="file" accept="application/pdf" disabled={uploadingMsds}
                      onChange={e => uploadMsds(e.target.files[0])} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 위치정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>위치정보</div>
            <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EAF1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '18px' }}>📍</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy }}>
                  {reagent.locations ? `${reagent.locations.room}${reagent.locations.detail ? ' ' + reagent.locations.detail : ''}` : '미지정'}
                </div>
              </div>
            </div>
          </div>

          {/* 관리정보 */}
          <div style={cardStyle}>
            <div style={cardHeadStyle}>관리정보</div>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: C.muted }}>최종확인일</span>
                <span style={{ fontSize: '13px', color: C.text, fontWeight: '600' }}>
                  {reagent.last_confirmed_at
                    ? isAdmin
                      ? `${new Date(reagent.last_confirmed_at).toLocaleDateString()} · ${confirmedByName || reagent.confirmed_by}`
                      : new Date(reagent.last_confirmed_at).toLocaleDateString()
                    : '확인 기록 없음'}
                </span>
              </div>
              {isAdmin && reagent.registered_by && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: C.muted }}>등록자</span>
                  <span style={{ fontSize: '13px', color: C.text, fontWeight: '600' }}>
                    {new Date(reagent.created_at).toLocaleDateString()} · {registeredByName || reagent.registered_by}
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: C.muted }}>비고</span>
                <span style={{ fontSize: '13px', color: C.text }}>{reagent.notes || '-'}</span>
              </div>
            </div>
          </div>

          {/* 대기중 변경 */}
          {pendingChanges.length > 0 && (
            <div style={{ ...cardStyle, border: '1px solid #F0DBAE' }}>
              <div style={{ ...cardHeadStyle, borderBottom: '1px solid #F0DBAE', background: '#FBF0DF', color: '#8A5A16' }}>대기중인 수정 제안 · {pendingChanges.length}건</div>
              <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pendingChanges.map(p => (
                  <div key={p.id}>
                    <div style={{ fontSize: '12.5px', color: C.text }}>{FIELD_LABELS[p.field_name] || p.field_name}: <b>{p.old_value || '-'} → {p.new_value}</b></div>
                    {isAdmin && <div style={{ fontSize: '11px', color: C.muted }}>제안: {p.requested_by} · {new Date(p.created_at).toLocaleDateString()}</div>}
                  </div>
                ))}
                {isAdmin && <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>관리자 메뉴 &gt; 변경 요청에서 승인/반려할 수 있어요.</div>}
              </div>
            </div>
          )}

          {/* 폐기 신청 대기중 */}
          {disposalPending && (
            <div style={{ ...cardStyle, border: '1px solid #F3D6D6' }}>
              <div style={{ ...cardHeadStyle, borderBottom: '1px solid #F3D6D6', background: '#FDECEC', color: '#C13B3F' }}>🗑️ 폐기 신청 대기중</div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: '12.5px', color: C.text, marginBottom: '4px' }}>사유: {disposalPending.reason}</div>
                {isAdmin && <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>신청: {disposalPending.requested_by} · {new Date(disposalPending.created_at).toLocaleDateString()}</div>}
                {isAdmin ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => resolveDisposal('reject')} style={{ flex: 1, padding: '8px 0', borderRadius: '7px', border: `1px solid ${C.border}`, background: C.white, fontSize: '12px', color: '#586173', cursor: 'pointer' }}>보류</button>
                    <button onClick={() => resolveDisposal('confirm')} style={{ flex: 1, padding: '8px 0', borderRadius: '7px', border: 'none', background: '#E5484D', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>폐기 확정</button>
                  </div>
                ) : (
                  <div style={{ fontSize: '10.5px', color: C.muted }}>관리자만 처리 가능합니다.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {stockHistory.length > 0 && (
        <div style={{ marginTop: '20px', ...cardStyle }}>
          <div style={cardHeadStyle}>입출고 이력</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['일시', '구분', '수량', ...(isAdmin ? ['담당자'] : []), '메모'].map(h => (
              <th key={h} style={{ padding: '9px 20px', textAlign: 'left', fontSize: '11px', color: C.muted, fontWeight: '600', borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {stockHistory.map(h => (
                <tr key={h.id}>
                  <td style={{ padding: '9px 20px', fontSize: '11px', color: C.muted, borderBottom: `1px solid ${C.borderRow}` }}>{new Date(h.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: '9px 20px', borderBottom: `1px solid ${C.borderRow}` }}>
                    <span style={{ background: h.action === 'in' ? '#E6F5EE' : h.action === 'open' ? '#EAF1FB' : '#FDECEC', color: h.action === 'in' ? '#1A8757' : h.action === 'open' ? '#1F4E96' : '#C13B3F', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                      {h.action === 'in' ? '입고' : h.action === 'open' ? '개봉' : '출고'}
                    </span>
                  </td>
                  <td style={{ padding: '9px 20px', fontSize: '12px', borderBottom: `1px solid ${C.borderRow}` }}>{h.quantity}{h.unit}</td>
                  {isAdmin && <td style={{ padding: '9px 20px', fontSize: '12px', borderBottom: `1px solid ${C.borderRow}` }}>{h.user_name}</td>}
                  <td style={{ padding: '9px 20px', fontSize: '12px', color: C.muted, borderBottom: `1px solid ${C.borderRow}` }}>{h.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 폐기 신청 모달 */}
      {showDisposalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowDisposalModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>🗑️ 폐기 신청</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{reagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={labelStyle}>신청자 이름 *</label>
                <input value={disposalForm.requested_by} onChange={e => setDisposalForm({ ...disposalForm, requested_by: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>수량</label>
                <input value={disposalForm.quantity} onChange={e => setDisposalForm({ ...disposalForm, quantity: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>폐기 사유 *</label>
                <textarea value={disposalForm.reason} rows={3} onChange={e => setDisposalForm({ ...disposalForm, reason: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowDisposalModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitDisposal} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.danger, color: '#fff', cursor: 'pointer', fontWeight: '700' }}>신청하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 입출고 모달 */}
      {showStockModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowStockModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📦 입출고 기록</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{reagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[['out', '📤 사용/출고'], ['in', '📥 입고'], ['open', '🔓 개봉']].map(([val, label]) => (
                  <button key={val} onClick={() => setStockForm({ ...stockForm, action: val })} style={{
                    flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                    background: stockForm.action === val ? C.navy : C.bg, color: stockForm.action === val ? '#fff' : C.text,
                    border: `1px solid ${stockForm.action === val ? C.navy : C.border}`,
                  }}>{label}</button>
                ))}
              </div>
              {stockForm.action !== 'open' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <div><label style={labelStyle}>{stockForm.action === 'in' ? '입고 수량' : '사용량'}</label>
                    <input value={stockForm.quantity} onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} style={inputStyle} /></div>
                  <div><label style={labelStyle}>단위</label>
                    <input value={stockForm.unit} onChange={e => setStockForm({ ...stockForm, unit: e.target.value })} placeholder="mL, g" style={inputStyle} /></div>
                </div>
              )}
              <div><label style={labelStyle}>이름 *</label>
                <input value={stockForm.user_name} onChange={e => setStockForm({ ...stockForm, user_name: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>메모</label>
                <input value={stockForm.notes} onChange={e => setStockForm({ ...stockForm, notes: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowStockModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitStock} style={{ ...btnPrimary, flex: 1 }}>기록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 위치 이동 모달 */}
      {showMoveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,42,94,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowMoveModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '420px', maxWidth: '92vw' }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📍 위치 이동{!isAdmin && ' 신청'}</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{reagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div><label style={labelStyle}>이동할 위치 *</label>
                <select value={moveForm.to_location_id} onChange={e => setMoveForm({ ...moveForm, to_location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select></div>
              <div><label style={labelStyle}>{isAdmin ? '이동자' : '신청자'} 이름 *</label>
                <input value={moveForm.requested_by} onChange={e => setMoveForm({ ...moveForm, requested_by: e.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle}>메모</label>
                <input value={moveForm.notes} onChange={e => setMoveForm({ ...moveForm, notes: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowMoveModal(false)} style={{ ...btnGhost, flex: 1 }}>취소</button>
              <button onClick={submitMove} style={{ ...btnPrimary, flex: 1 }}>{isAdmin ? '이동' : '신청하기'}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
