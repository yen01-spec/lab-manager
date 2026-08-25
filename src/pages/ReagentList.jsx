import { useEffect, useState, useRef, Fragment } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card, inputStyle, labelStyle, btnPrimary, thStyle, tdStyle } from '../design'
import { exportReagents, exportPickedReagents } from '../exportUtils'

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

export default function ReagentList() {
  const { isAdmin, student } = useOutletContext?.() || {}
  const [searchParams] = useSearchParams()
  const [locations, setLocations] = useState([])
  const [companies, setCompanies] = useState([])
  const [selectedReagent, setSelectedReagent] = useState(null)
  const [lots, setLots] = useState([])
  const [expandedNames, setExpandedNames] = useState(new Set())
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [locationFilter, setLocationFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [showColMenu, setShowColMenu] = useState(false)
  const [visibleCols, setVisibleCols] = useState({ lot: false, expiry: false })
  const [results, setResults] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [stockHistory, setStockHistory] = useState([])
  const alphabetRefs = useRef({})

  // 편집 모드
  const [editMode, setEditMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState(new Set())

  // 선택 목록 (검색결과에서 여러 시약을 체크해 모아보기 — 전체 사용자). id -> reagent row
  const [pickedIds, setPickedIds] = useState(new Map())
  const [showPickedModal, setShowPickedModal] = useState(false)
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false)
  const [bulkMoveLocation, setBulkMoveLocation] = useState('')
  const [bulkMovedBy, setBulkMovedBy] = useState('')

  // 모달들
  const [showDisposalModal, setShowDisposalModal] = useState(false)
  const [disposalForm, setDisposalForm] = useState({ quantity: '1', reason: '', requested_by: '' })
  const [showStockModal, setShowStockModal] = useState(false)
  const [stockForm, setStockForm] = useState({ action: 'out', quantity: '', unit: '', user_name: '', notes: '' })
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveForm, setMoveForm] = useState({ to_location_id: '', requested_by: '', notes: '' })
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingField, setEditingField] = useState(null) // 현재 편집 중인 필드
  const [editingValue, setEditingValue] = useState('')
  const [editForm, setEditForm] = useState({})

  // 인라인 편집
  const [inlineEdit, setInlineEdit] = useState(null)

  // 학생 수정 대기중 / 확인 / 직접제조시약
  const [pendingChanges, setPendingChanges] = useState([])
  const [confirmedByName, setConfirmedByName] = useState('')
  const [showMadeModal, setShowMadeModal] = useState(false)
  const [madeForm, setMadeForm] = useState({ name: '', volume: '', unit: '', made_date: new Date().toISOString().split('T')[0], made_purpose: '', location_id: '' })

  useEffect(() => { fetchLocations(); fetchCompanies(); fetchTotalCount() }, [])

  // 검색어(홈 화면 ?q= 포함) 또는 필터가 바뀔 때마다 결과를 다시 불러온다
  useEffect(() => {
    fetchResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, companyFilter])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchCompanies() {
    const { data } = await supabase.from('reagents').select('company').neq('status', 'archived')
    const uniq = [...new Set((data || []).map(r => r.company).filter(Boolean))].sort()
    setCompanies(uniq)
  }

  async function fetchTotalCount() {
    const { count } = await supabase.from('reagents').select('*', { count: 'exact', head: true }).neq('status', 'archived')
    setTotalCount(count || 0)
  }

  async function fetchResults() {
    let query = supabase.from('reagents')
      .select('*, reagent_lots(*), locations(*)', { count: 'exact' })
      .neq('status', 'archived')
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    if (locationFilter) query = query.eq('location_id', locationFilter)
    if (companyFilter) query = query.eq('company', companyFilter)
    const { data, count } = await query.range(0, 4999)
    if (count > 4999) {
      alert(`⚠️ 시약이 ${count}개로 많아 일부만 표시됩니다. 관리자에게 문의하세요.`)
    }
    if (data) setResults(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  function resetFilters() {
    setSearch(''); setLocationFilter(''); setCompanyFilter('')
  }

  async function openReagent(reagent) {
  if (editMode) return
  const { data } = await supabase.from('reagents')
    .select('*, locations(*), reagent_lots(*)').eq('id', reagent.id).single()
  if (data) {
    setSelectedReagent(data)
    setLots(data.reagent_lots || [])
    setEditForm({ msds_url: data.msds_url || '', manager: data.manager || '' })
    setMoveForm({ to_location_id: '', requested_by: '', notes: '' })
    const { data: history } = await supabase.from('stock_history')
      .select('*').eq('reagent_id', reagent.id)
      .order('created_at', { ascending: false }).limit(20)
    if (history) setStockHistory(history)
    fetchPendingChanges(reagent.id)
    if (data.confirmed_by) {
      const { data: cs } = await supabase.from('students').select('name').eq('student_id', data.confirmed_by).maybeSingle()
      setConfirmedByName(cs?.name || data.confirmed_by)
    } else {
      setConfirmedByName('')
    }

    // CAS 번호로 GHS 자동 조회
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
            const hazard = first.hrmflnList
              ? first.hrmflnList.map(h => h.hrmflnClsfArtclNm).join(', ')
              : ''
            // DB에 없으면 API 데이터로 채워서 표시
            setSelectedReagent(prev => ({
              ...prev,
              name: prev.name || korName,
              hazard: prev.hazard || hazard,
              ghs_live: { korName, isYudok, hazard },
            }))
          }
        }
      } catch {}
    }
  }
}

  // 편집 모드 토글
  function toggleEditMode() {
    setEditMode(!editMode)
    setCheckedIds(new Set())
  }

  const [lastChecked, setLastChecked] = useState(null)

function toggleCheck(id, e, allData) {
  e.stopPropagation()
  const next = new Set(checkedIds)

  if (e.shiftKey && lastChecked) {
    // Shift+클릭 범위 선택
    const ids = allData.map(r => r.id)
    const start = ids.indexOf(lastChecked)
    const end = ids.indexOf(id)
    const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1)
    const allSelected = range.every(rid => next.has(rid))
    range.forEach(rid => allSelected ? next.delete(rid) : next.add(rid))
  } else {
    next.has(id) ? next.delete(id) : next.add(id)
  }
  setLastChecked(id)
  setCheckedIds(next)
}

  function toggleAll(data) {
    if (checkedIds.size === data.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(data.map(r => r.id)))
  }

  function togglePick(r, e) {
    e.stopPropagation()
    setPickedIds(prev => {
      const next = new Map(prev)
      next.has(r.id) ? next.delete(r.id) : next.set(r.id, r)
      return next
    })
  }

  function togglePickAll(data) {
    const allPicked = data.length > 0 && data.every(r => pickedIds.has(r.id))
    setPickedIds(prev => {
      const next = new Map(prev)
      data.forEach(r => allPicked ? next.delete(r.id) : next.set(r.id, r))
      return next
    })
  }

  // 다량 위치 이동
  async function submitBulkMove() {
    if (!bulkMoveLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (!bulkMovedBy.trim()) { alert('이름을 입력해주세요'); return }
    const toLoc = locations.find(l => l.id === bulkMoveLocation)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    const selected = results.filter(r => checkedIds.has(r.id))

    for (const r of selected) {
      const fromLocName = r.locations
        ? `${r.locations.room}${r.locations.detail ? ' - ' + r.locations.detail : ''}` : '미지정'
      await supabase.from('reagents').update({ location_id: bulkMoveLocation }).eq('id', r.id)
      await supabase.from('location_history').insert({
        reagent_id: r.id, reagent_name: r.name,
        from_location_id: r.location_id, from_location_name: fromLocName,
        to_location_id: bulkMoveLocation, to_location_name: toLocName,
        moved_by: bulkMovedBy,
      })
    }
    await supabase.from('admin_logs').insert({
      admin_name: bulkMovedBy, action: '다량 위치 이동',
      target_type: 'reagent', target_id: null,
      description: `${selected.length}개 시약 → ${toLocName}`,
    })
    alert(`✅ ${selected.length}개 시약 이동 완료! → ${toLocName}`)
    setShowBulkMoveModal(false)
    setBulkMoveLocation('')
    setBulkMovedBy('')
    setCheckedIds(new Set())
    setEditMode(false)
    fetchResults()
  }

  async function submitDisposal() {
    if (!disposalForm.requested_by.trim()) { alert('신청자 이름을 입력해주세요'); return }
    if (!disposalForm.reason.trim()) { alert('폐기 사유를 입력해주세요'); return }
    const firstLot = lots[0]
    await supabase.from('disposal_requests').insert({
      reagent_id: selectedReagent.id, lot_id: firstLot?.id || null,
      reagent_name: selectedReagent.name, lot_no: firstLot?.lot_no || null,
      quantity: disposalForm.quantity, reason: disposalForm.reason,
      requested_by: disposalForm.requested_by, requested_by_student_id: student?.student_id ?? null,
      status: 'pending',
    })
    alert('폐기 신청이 완료됐어요!')
    setShowDisposalModal(false)
    setDisposalForm({ quantity: '1', reason: '', requested_by: '' })
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
      reagent_id: selectedReagent.id, lot_id: firstLot.id,
      reagent_name: selectedReagent.name, action: stockForm.action,
      quantity: qty, unit: stockForm.unit || selectedReagent.unit || '',
      before_stock: firstLot.current_stock, after_stock: newStock,
      user_name: stockForm.user_name, notes: stockForm.notes,
    })
    alert('기록되었습니다!')
    setShowStockModal(false)
    setStockForm({ action: 'out', quantity: '', unit: '', user_name: '', notes: '' })
    openReagent(selectedReagent)
    fetchResults()
  }

  async function submitMade() {
    if (!madeForm.name.trim()) { alert('시약명을 입력해주세요'); return }
    if (!madeForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    if (!student) { alert('로그인 후 이용해주세요'); return }
    const { data: reagent, error } = await supabase.from('reagents').insert({
      name: madeForm.name, volume: madeForm.volume || null, unit: madeForm.unit || null,
      location_id: madeForm.location_id, reagent_type: 'self_made',
      made_date: madeForm.made_date, made_purpose: madeForm.made_purpose,
    }).select().single()
    if (error) { alert('등록 중 오류가 발생했습니다: ' + error.message); return }
    await supabase.from('reagent_lots').insert({
      reagent_id: reagent.id, sealed_count: 0, current_stock: 100, received_date: madeForm.made_date,
    })
    alert('직접 제조 시약이 등록되었어요!')
    setShowMadeModal(false)
    setMadeForm({ name: '', volume: '', unit: '', made_date: new Date().toISOString().split('T')[0], made_purpose: '', location_id: '' })
    fetchResults()
  }

  async function submitMove() {
    if (!moveForm.requested_by.trim()) { alert('이름을 입력해주세요'); return }
    if (!moveForm.to_location_id) { alert('이동할 위치를 선택해주세요'); return }
    if (selectedReagent.location_id === moveForm.to_location_id) { alert('현재 위치와 같습니다'); return }
    const toLoc = locations.find(l => l.id === moveForm.to_location_id)
    const fromLocName = selectedReagent.locations
      ? `${selectedReagent.locations.room}${selectedReagent.locations.detail ? ' - ' + selectedReagent.locations.detail : ''}` : '미지정'
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    if (isAdmin) {
      await supabase.from('reagents').update({ location_id: moveForm.to_location_id }).eq('id', selectedReagent.id)
      await supabase.from('location_history').insert({
        reagent_id: selectedReagent.id, reagent_name: selectedReagent.name,
        from_location_id: selectedReagent.location_id, from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        moved_by: moveForm.requested_by, notes: moveForm.notes,
      })
      alert(`✅ 위치 이동 완료!\n${fromLocName} → ${toLocName}`)
      setShowMoveModal(false)
      openReagent(selectedReagent)
      fetchResults()
    } else {
      await supabase.from('location_requests').insert({
        reagent_id: selectedReagent.id, reagent_name: selectedReagent.name,
        from_location_id: selectedReagent.location_id, from_location_name: fromLocName,
        to_location_id: moveForm.to_location_id, to_location_name: toLocName,
        requested_by: moveForm.requested_by, notes: moveForm.notes, status: 'pending',
      })
      alert('위치 이동 신청 완료! 관리자 승인 후 처리됩니다.')
      setShowMoveModal(false)
    }
  }

 async function saveReagentInfo() {
  await supabase.from('reagents').update({
    msds_url: editForm.msds_url,
    manager: editForm.manager,
    msds_source: editForm.msds_url ? 'manual' : null,
    manager_source: editForm.manager ? 'manual' : null,
  }).eq('id', selectedReagent.id)
  setSelectedReagent({ ...selectedReagent, ...editForm,
    msds_source: editForm.msds_url ? 'manual' : null,
    manager_source: editForm.manager ? 'manual' : null,
  })
  setShowEditModal(false)
  alert('저장되었습니다!')
}
async function saveField(field, value, sourceField) {
  if (isAdmin) {
    const updateData = { [field]: value }
    if (sourceField) updateData[sourceField] = 'manual'
    await supabase.from('reagents').update(updateData).eq('id', selectedReagent.id)
    setSelectedReagent(prev => ({ ...prev, [field]: value, ...(sourceField ? { [sourceField]: 'manual' } : {}) }))
  } else {
    await supabase.from('reagent_change_requests').insert({
      reagent_id: selectedReagent.id, field_name: field,
      old_value: String(selectedReagent[field] ?? ''), new_value: String(value),
      requested_by: student?.name || '', requested_by_student_id: student?.student_id ?? null,
      status: 'pending',
    })
    alert('수정 신청 완료! 관리자 승인 후 반영됩니다.')
    fetchPendingChanges(selectedReagent.id)
  }
  setEditingField(null)
}

async function fetchPendingChanges(reagentId) {
  const { data } = await supabase.from('reagent_change_requests')
    .select('*').eq('reagent_id', reagentId).eq('status', 'pending')
  setPendingChanges(data || [])
}

async function confirmReagent() {
  if (!student) { alert('로그인 후 이용해주세요'); return }
  const now = new Date().toISOString()
  await supabase.from('reagents').update({ last_confirmed_at: now, confirmed_by: student.student_id }).eq('id', selectedReagent.id)
  setSelectedReagent(prev => ({ ...prev, last_confirmed_at: now, confirmed_by: student.student_id }))
  setConfirmedByName(student.name)
  fetchResults()
}

  function startInlineEdit(lotId, reagentId, field, currentValue, e) {
    e.stopPropagation()
    if (!isAdmin) return
    setInlineEdit({ lotId, reagentId, field, value: currentValue })
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
    fetchResults()
    if (selectedReagent) {
      const { data } = await supabase.from('reagents')
        .select('*, locations(*), reagent_lots(*)').eq('id', selectedReagent.id).single()
      if (data) { setSelectedReagent(data); setLots(data.reagent_lots || []) }
    }
  }

  const getGroupedReagents = (data) => {
    const groups = {}
    data.forEach(r => {
      const letter = r.name[0].toUpperCase()
      if (!groups[letter]) groups[letter] = []
      groups[letter].push(r)
    })
    return groups
  }

  const groupByName = (rows) => {
    const groups = {}
    rows.forEach(r => {
      const key = r.name.trim().toLowerCase()
      if (!groups[key]) groups[key] = []
      groups[key].push(r)
    })
    return groups
  }

  function toggleNameGroup(key) {
    setExpandedNames(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const scrollToLetter = (letter) => {
    const el = alphabetRefs.current[letter]
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }

  // 카드(overflow:hidden) 밖에 형제로 렌더링해야 position:sticky가 실제로 뷰포트 기준으로 붙는다
  const AlphabetIndex = ({ data }) => {
    if (editMode) return null
    const availableLetters = new Set(data.map(r => r.name[0].toUpperCase()))
    return (
      <div style={{
        width: '18px', flexShrink: 0, marginLeft: '4px',
        position: 'sticky', top: '96px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
          <button key={letter} onClick={() => scrollToLetter(letter)}
            disabled={!availableLetters.has(letter)} style={{
              width: '18px', height: '14px', border: 'none', background: 'transparent',
              cursor: availableLetters.has(letter) ? 'pointer' : 'default',
              color: availableLetters.has(letter) ? C.muted : '#E2E5EA',
              fontSize: '9px', fontWeight: availableLetters.has(letter) ? '700' : '400', padding: 0,
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { if (availableLetters.has(letter)) e.currentTarget.style.color = C.blue }}
            onMouseLeave={e => { if (availableLetters.has(letter)) e.currentTarget.style.color = C.muted }}
          >{letter}</button>
        ))}
      </div>
    )
  }

  const COLS = 11 + (visibleCols.lot ? 1 : 0) + (visibleCols.expiry ? 1 : 0)

  const ReagentTable = ({ data }) => {
    const groups = getGroupedReagents(data)
    const letters = Object.keys(groups).sort()
    const allChecked = data.length > 0 && checkedIds.size === data.length
    const allPicked = data.length > 0 && data.every(r => pickedIds.has(r.id))

    const renderRow = (r, indent) => {
      const lotList = r.reagent_lots || []
      const totalSealed = lotList.reduce((s, l) => s + l.sealed_count, 0)
      const avgStock = lotList.length > 0
        ? Math.round(lotList.reduce((s, l) => s + l.current_stock, 0) / lotList.length) : 0
      const isLow = lotList.some(l => l.sealed_count === 0 && l.current_stock <= 20)
      const ghsList = getGhsEmojis(r.hazard)
      const loc = r.locations
      const isChecked = checkedIds.has(r.id)
      const isPicked = pickedIds.has(r.id)
      const editingThisSealed = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'sealed_count'
      const editingThisStock = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'current_stock'
      const firstLot = lotList[0]

      return (
        <tr key={r.id}
          onClick={e => editMode ? toggleCheck(r.id, e, data) : openReagent(r)}
          style={{
            background: (editMode ? isChecked : isPicked) ? '#EEF2FB' : isLow ? '#FFF8F8' : C.white,
            cursor: 'pointer',
            borderLeft: (editMode ? isChecked : isPicked) ? `3px solid ${C.navy}` : indent ? `3px solid ${C.borderRow}` : '3px solid transparent',
          }}
          onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = isLow ? '#FFEFEF' : C.bg }}
          onMouseLeave={e => { if (!isChecked) e.currentTarget.style.background = isLow ? '#FFF8F8' : C.white }}>
          <td style={{ ...tdStyle, textAlign: 'center' }}
            onClick={e => editMode ? toggleCheck(r.id, e, data) : togglePick(r, e)}>
            <input type="checkbox" checked={editMode ? isChecked : isPicked} onChange={() => {}}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          </td>
          <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px', paddingLeft: indent ? '32px' : undefined }}>
            {r.name}
            {r.reagent_type === 'self_made' && <span style={{ marginLeft: '6px', fontSize: '9.5px', background: '#EAF1FB',
              color: '#1F4E96', padding: '1px 7px', borderRadius: '999px', fontWeight: '700' }}>직접제조</span>}
            {isLow && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#FFEBEE',
              color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>부족</span>}
          </td>
          <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{r.cas_no || '-'}</td>
          <td style={{ ...tdStyle, color: C.muted, fontSize: '12px' }}>{r.company || '-'}</td>
          <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>
            {r.volume ? `${r.volume}${r.unit}` : '-'}
          </td>
          <td style={{ ...tdStyle, fontSize: '12px' }}>
            {r.category
              ? <span style={{ background: '#EEF2FB', color: C.navy, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{r.category}</span>
              : <span style={{ color: C.muted }}>-</span>}
          </td>
          <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>
            {loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}
          </td>
          <td style={{ ...tdStyle, fontSize: '16px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
            {ghsList.length > 0
              ? <span title={ghsList.map(g => g.label).join(', ')}>{ghsList.map(g => g.emoji).join('')}</span>
              : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
          </td>
          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
            {firstLot ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '36px', height: '6px', borderRadius: '3px', background: '#F0F2F6', overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${avgStock}%`, height: '100%', background: (firstLot.sealed_count === 0 && avgStock <= 20) ? '#E5484D' : '#1E9E6A' }} />
                </div>
                {editingThisSealed ? (
                  <input autoFocus type="number" min="0" value={inlineEdit.value}
                    onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(firstLot); if (e.key === 'Escape') setInlineEdit(null) }}
                    onBlur={() => saveInlineEdit(firstLot)}
                    style={{ width: '52px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                ) : (
                  <span onClick={e => !editMode && firstLot && startInlineEdit(firstLot.id, r.id, 'sealed_count', totalSealed, e)}
                    title={isAdmin && !editMode ? '클릭하여 수정' : ''}
                    style={{ cursor: isAdmin && !editMode ? 'text' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                      border: isAdmin && !editMode ? `1px dashed ${C.border}` : 'none', minWidth: '32px', display: 'inline-block', textAlign: 'center' }}>
                    {totalSealed}병
                  </span>
                )}
                <span style={{ color: C.muted, fontSize: '11px' }}>/</span>
                {editingThisStock ? (
                  <input autoFocus type="number" min="0" max="100" value={inlineEdit.value}
                    onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(firstLot); if (e.key === 'Escape') setInlineEdit(null) }}
                    onBlur={() => saveInlineEdit(firstLot)}
                    style={{ width: '52px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                ) : (
                  <span onClick={e => !editMode && firstLot && startInlineEdit(firstLot.id, r.id, 'current_stock', avgStock, e)}
                    title={isAdmin && !editMode ? '클릭하여 수정' : ''}
                    style={{ cursor: isAdmin && !editMode ? 'text' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                      border: isAdmin && !editMode ? `1px dashed ${C.border}` : 'none', minWidth: '32px', display: 'inline-block', textAlign: 'center' }}>
                    {avgStock}%
                  </span>
                )}
              </div>
            ) : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
          </td>
          {visibleCols.lot && (
            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{firstLot?.lot_no || '-'}</td>
          )}
          {visibleCols.expiry && (
            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>{firstLot?.expiry_date || '-'}</td>
          )}
          <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted, whiteSpace: 'nowrap' }}>
            {r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}
          </td>
          <td style={tdStyle}>
            {isLow
              ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
              : <span style={{ color: '#00875A', fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
          </td>
        </tr>
      )
    }

    return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
        <thead>
          <tr>
            <th style={thStyle}>
              <input type="checkbox" checked={editMode ? allChecked : allPicked}
                onChange={() => editMode ? toggleAll(data) : togglePickAll(data)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            </th>
            {[
              '시약명', 'CAS No.', '회사', '용량', '성상', '위치', 'GHS', '재고',
              ...(visibleCols.lot ? ['Lot No.'] : []),
              ...(visibleCols.expiry ? ['유효기간'] : []),
              '최근확인', '상태',
            ].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {letters.map(letter => (
            <Fragment key={letter}>
              <tr key={letter + '_header'} ref={el => alphabetRefs.current[letter] = el}>
                <td colSpan={COLS} style={{
                  padding: '8px 14px',
                  background: `linear-gradient(90deg, ${C.navy}11, transparent)`,
                  fontWeight: '800', fontSize: '13px', color: C.navy,
                  borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`,
                }}>{letter}</td>
              </tr>
              {Object.entries(groupByName(groups[letter])).map(([nameKey, rowsForName]) => {
                if (editMode || rowsForName.length === 1) {
                  return <Fragment key={nameKey}>{rowsForName.map(r => renderRow(r, false))}</Fragment>
                }
                const isExpanded = expandedNames.has(nameKey)
                const sample = rowsForName[0]
                const ghsList = getGhsEmojis(sample.hazard)
                return (
                  <Fragment key={nameKey}>
                    <tr onClick={() => toggleNameGroup(nameKey)}
                      style={{ cursor: 'pointer', background: C.white }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}>
                      <td colSpan={COLS} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ marginRight: '8px', color: C.muted, fontSize: '11px' }}>{isExpanded ? '▾' : '▸'}</span>
                        <span style={{ fontWeight: '700', color: C.navy }}>{sample.name}</span>
                        <span style={{ marginLeft: '8px', fontSize: '11px', background: '#EEF2FB', color: C.navy,
                          padding: '2px 9px', borderRadius: '10px', fontWeight: '700' }}>
                          {rowsForName.length}병
                        </span>
                        {ghsList.length > 0 && (
                          <span style={{ marginLeft: '8px', fontSize: '14px' }} title={ghsList.map(g => g.label).join(', ')}>
                            {ghsList.map(g => g.emoji).join('')}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && rowsForName.map(r => renderRow(r, true))}
                  </Fragment>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
      {isAdmin && !editMode && (
        <div style={{ padding: '8px 14px', fontSize: '11px', color: C.muted, borderTop: `1px solid ${C.border}` }}>
          💡 재고 숫자를 클릭하면 바로 수정할 수 있어요.
        </div>
      )}
    </div>
)
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  return (
    <div>
      <PageBanner title="시약 목록" sub="Reagent List" breadcrumb={['홈', '시약 관리', '시약 목록']}
        extra={<span style={{ fontSize: '12px', color: C.muted }}>전체 {totalCount.toLocaleString()}개 · 검색결과 {results.length.toLocaleString()}개</span>} />
      <div style={{ padding: '8px 16px' }}>

        {/* 검색 + 필터 바 */}
        <div style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
          padding: '12px 16px', boxShadow: '0 1px 3px rgba(16,24,40,.06)',
          display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '200px' }}>
            <input value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchResults()}
              placeholder="시약 이름으로 검색..."
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={() => fetchResults()} style={{ ...btnPrimary, padding: '9px 20px', flexShrink: 0 }}>검색</button>
          </div>
          <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', maxWidth: '160px' }}>
            <option value="">전체 위치</option>
            {rooms.map(room => (
              <optgroup key={room} label={room}>
                {locations.filter(l => l.room === room).map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.detail || loc.room}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', maxWidth: '160px' }}>
            <option value="">전체 제조사</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={resetFilters} style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: '6px',
            padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: C.muted, flexShrink: 0,
          }}>필터 초기화</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowColMenu(v => !v)} style={{
              background: C.white, border: `1px solid ${C.border}`, borderRadius: '6px',
              padding: '9px 14px', cursor: 'pointer', fontSize: '13px', color: C.text, flexShrink: 0,
            }}>표시 열 ▾</button>
            {showColMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 100,
                background: C.white, border: `1px solid ${C.border}`, borderRadius: '8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '10px 14px', minWidth: '140px',
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: C.text, marginBottom: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleCols.lot} onChange={() => setVisibleCols(v => ({ ...v, lot: !v.lot }))} />Lot No.
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: C.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={visibleCols.expiry} onChange={() => setVisibleCols(v => ({ ...v, expiry: !v.expiry }))} />유효기간
                </label>
              </div>
            )}
          </div>
          {student && (
            <button onClick={() => setShowMadeModal(true)} style={{
              background: '#F9FBFF', color: '#1F4E96', border: `1px dashed #C9DAF5`,
              padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', flexShrink: 0,
            }}>🧪 직접 제조 시약 등록</button>
          )}
          {isAdmin && results.length > 0 && (
            <button onClick={() => exportReagents(results)} style={{
              background: '#1D6F42', color: 'white', border: 'none',
              padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', flexShrink: 0,
            }}>📥 엑셀</button>
          )}
          {isAdmin && results.length > 0 && (
            <button onClick={toggleEditMode} style={{
              background: editMode ? C.navy : C.white,
              color: editMode ? C.white : C.text,
              border: `1px solid ${editMode ? C.navy : C.border}`,
              padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', flexShrink: 0,
            }}>✏️ {editMode ? '편집 종료' : '편집'}</button>
          )}
        </div>

        {/* 편집 모드 액션 바 */}
        {editMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', marginBottom: '16px',
            background: checkedIds.size > 0 ? '#EEF2FB' : C.bg,
            border: `1px solid ${checkedIds.size > 0 ? C.navy : C.border}`,
            borderRadius: '8px', transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: C.navy, minWidth: '80px' }}>
              {checkedIds.size > 0 ? `${checkedIds.size}개 선택됨` : '시약을 선택하세요'}
            </span>
            {checkedIds.size > 0 && (
              <>
                <button onClick={() => setShowBulkMoveModal(true)} style={{
                  background: '#667EEA', color: '#fff', border: 'none',
                  padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                }}>📍 위치 이동</button>
                <button onClick={() => { setCheckedIds(new Set()) }} style={{
                  background: C.white, color: C.muted, border: `1px solid ${C.border}`,
                  padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                }}>선택 해제</button>
              </>
            )}
          </div>
        )}

        {/* 선택 목록 액션 바 */}
        {!editMode && pickedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', marginBottom: '16px',
            background: '#EEF2FB', border: `1px solid ${C.navy}`,
            borderRadius: '8px',
          }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>
              📋 {pickedIds.size}개 선택됨
            </span>
            <button onClick={() => setShowPickedModal(true)} style={{
              background: C.navy, color: '#fff', border: 'none',
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}>선택 목록 보기</button>
            <button onClick={() => setPickedIds(new Map())} style={{
              background: C.white, color: C.muted, border: `1px solid ${C.border}`,
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
            }}>선택 해제</button>
          </div>
        )}

        {/* 결과 목록 */}
        {results.length === 0
          ? <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: '13px' }}>조건에 맞는 시약이 없습니다.</div>
          : (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Card noPadding><ReagentTable data={results} /></Card>
              </div>
              <AlphabetIndex data={results} />
            </div>
          )}
      </div>

      {/* 다량 위치 이동 모달 */}
      {showBulkMoveModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.55)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowBulkMoveModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📍 위치 이동</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{checkedIds.size}개 시약 선택됨</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이동할 위치 *</label>
                <select value={bulkMoveLocation} onChange={e => setBulkMoveLocation(e.target.value)} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이동자 이름 *</label>
                <input value={bulkMovedBy} onChange={e => setBulkMovedBy(e.target.value)} placeholder="본인 이름" style={inputStyle} />
              </div>
            </div>
            {bulkMoveLocation && (
              <div style={{ marginTop: '14px', padding: '10px 14px', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', fontSize: '13px' }}>
                <strong style={{ color: '#276749' }}>이동 미리보기:</strong>
                <div style={{ marginTop: '4px', color: '#2D6A4F' }}>
                  {checkedIds.size}개 시약 → {(() => { const l = locations.find(l => l.id === bulkMoveLocation); return l ? `${l.room}${l.detail ? ' - ' + l.detail : ''}` : '' })()}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowBulkMoveModal(false)} style={{
                flex: 1, padding: '10px', borderRadius: '6px',
                border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px',
              }}>취소</button>
              <button onClick={submitBulkMove} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: '#667EEA', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
              }}>이동하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 위치 이동 모달 */}
      {showMoveModal && selectedReagent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.55)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowMoveModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📍 위치 이동{!isAdmin && ' 신청'}</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{selectedReagent.name}</p>
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: C.bg, borderRadius: '8px', fontSize: '13px' }}>
              <span style={{ color: C.muted, fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>현재 위치</span>
              <div style={{ marginTop: '4px', fontWeight: '600', color: C.navy }}>
                {selectedReagent.locations ? `${selectedReagent.locations.room}${selectedReagent.locations.detail ? ' - ' + selectedReagent.locations.detail : ''}` : '미지정'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이동할 위치 *</label>
                <select value={moveForm.to_location_id} onChange={e => setMoveForm({ ...moveForm, to_location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>{isAdmin ? '이동자' : '신청자'} 이름 *</label>
                <input value={moveForm.requested_by} onChange={e => setMoveForm({ ...moveForm, requested_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>메모</label>
                <input value={moveForm.notes} onChange={e => setMoveForm({ ...moveForm, notes: e.target.value })} placeholder="선택사항" style={inputStyle} />
              </div>
            </div>
            {!isAdmin && (
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                ⚠️ 학생 신청은 관리자 승인 후 반영됩니다.
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowMoveModal(false)} style={{
                flex: 1, padding: '10px', borderRadius: '6px',
                border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px',
              }}>취소</button>
              <button onClick={submitMove} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: '#667EEA', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px',
              }}>{isAdmin ? '📍 이동' : '📍 신청하기'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 직접 제조 시약 등록 모달 */}
      {showMadeModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.55)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowMadeModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h3 style={{ margin: 0, color: C.navy }}>🧪 직접 제조 시약 등록</h3>
              <span style={{ background: '#EAF1FB', color: '#1F4E96', fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px' }}>직접제조</span>
            </div>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '12px' }}>구매 시약과 달리 CAS·회사 정보가 없어요. 필요한 정보만 입력하세요.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>제조한 시약명 *</label>
                <input value={madeForm.name} onChange={e => setMadeForm({ ...madeForm, name: e.target.value })} placeholder="예) pH 7.0 인산완충용액" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>용량</label>
                  <input value={madeForm.volume} onChange={e => setMadeForm({ ...madeForm, volume: e.target.value })} placeholder="예: 500" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>단위</label>
                  <input value={madeForm.unit} onChange={e => setMadeForm({ ...madeForm, unit: e.target.value })} placeholder="mL" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>제조일</label>
                <input type="date" value={madeForm.made_date} onChange={e => setMadeForm({ ...madeForm, made_date: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>용도</label>
                <input value={madeForm.made_purpose} onChange={e => setMadeForm({ ...madeForm, made_purpose: e.target.value })} placeholder="예: 분광광도계 실험용 완충용액" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>보관 위치 *</label>
                <select value={madeForm.location_id} onChange={e => setMadeForm({ ...madeForm, location_id: e.target.value })} style={inputStyle}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowMadeModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={submitMade} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>등록하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 폐기 신청 모달 */}
      {showDisposalModal && selectedReagent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.55)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowDisposalModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>🗑️ 폐기 신청</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{selectedReagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>신청자 이름 *</label>
                <input value={disposalForm.requested_by} onChange={e => setDisposalForm({ ...disposalForm, requested_by: e.target.value })} placeholder="본인 이름" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>수량</label>
                <input value={disposalForm.quantity} onChange={e => setDisposalForm({ ...disposalForm, quantity: e.target.value })} placeholder="예: 1병" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>폐기 사유 *</label>
                <textarea value={disposalForm.reason} rows={3} onChange={e => setDisposalForm({ ...disposalForm, reason: e.target.value })}
                  placeholder="예: 유효기간 만료, 오염 등" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowDisposalModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={submitDisposal} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.danger, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>신청하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 입출고 기록 모달 */}
      {showStockModal && selectedReagent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.55)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowStockModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '420px', maxWidth: '92vw', boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📦 입출고 기록</h3>
            <p style={{ margin: '0 0 20px', color: C.muted, fontSize: '13px' }}>{selectedReagent.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>구분 *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[['out','📤 사용/출고'],['in','📥 입고'],['open','🔓 개봉']].map(([val, label]) => (
                    <button key={val} onClick={() => setStockForm({ ...stockForm, action: val })} style={{
                      flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                      background: stockForm.action === val ? C.navy : C.bg,
                      color: stockForm.action === val ? '#fff' : C.text,
                      border: `1px solid ${stockForm.action === val ? C.navy : C.border}`,
                    }}>{label}</button>
                  ))}
                </div>
              </div>
              {stockForm.action !== 'open' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>
                      {stockForm.action === 'in' ? '입고 수량' : selectedReagent.volume ? '사용량' : '사용량 (%)'}
                    </label>
                    <input
                      inputMode="decimal"
                      value={stockForm.quantity}
                      onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })}
                      placeholder={stockForm.action === 'in' ? '예: 3' : selectedReagent.volume ? '예: 50' : '예: 10'}
                      style={{ ...inputStyle, MozAppearance: 'textfield' }} />
                    {stockForm.action === 'out' && selectedReagent.volume && stockForm.quantity && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: C.muted }}>
                        {(() => {
                          const totalVol = Number(selectedReagent.volume)
                          const currentMl = (lots[0]?.current_stock / 100) * totalVol
                          const remainMl = Math.max(0, currentMl - Number(stockForm.quantity))
                          const remainPct = Math.round((remainMl / totalVol) * 100)
                          return `잔량: ${remainMl.toFixed(1)}${selectedReagent.unit || 'mL'} (${remainPct}%)`
                        })()}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>단위</label>
                    <input
                      list="unit-options"
                      value={stockForm.unit}
                      onChange={e => setStockForm({ ...stockForm, unit: e.target.value })}
                      placeholder="mL, g ..."
                      style={inputStyle} />
                    <datalist id="unit-options">
                      <option value="mL" />
                      <option value="g" />
                    </datalist>
                  </div>
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>이름 *</label>
                <input value={stockForm.user_name} onChange={e => setStockForm({ ...stockForm, user_name: e.target.value })} placeholder="본인 이름" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, marginBottom: '6px', textTransform: 'uppercase' }}>메모</label>
                <input value={stockForm.notes} onChange={e => setStockForm({ ...stockForm, notes: e.target.value })} placeholder="선택사항" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setShowStockModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={submitStock} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: C.navy, color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>기록하기</button>
            </div>
          </div>
        </div>
      )}


      {/* 시약 상세 모달 */}
      {selectedReagent && (
        <Modal onClose={() => { setSelectedReagent(null); setShowDisposalModal(false); setShowStockModal(false); setShowMoveModal(false) }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>시약 상세</div>
            <h2 style={{ margin: 0, color: C.navy, fontSize: '20px', fontWeight: '800' }}>{selectedReagent.name}</h2>
            <p style={{ margin: '4px 0 0', color: C.muted, fontSize: '13px' }}>
              {selectedReagent.locations?.room}{selectedReagent.locations?.detail && ' — ' + selectedReagent.locations.detail}
            </p>
          </div>
          <button onClick={() => setSelectedReagent(null)} style={{ background: 'transparent', border: 'none', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#CBD5E0' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {student && (
            <button onClick={confirmReagent} style={{ background: '#E6F5EE', color: '#1A8757', border: '1px solid #A9DDC4', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✅ 정보 맞음 · 확인만 하기</button>
          )}
          <button onClick={() => setShowStockModal(true)} style={{ background: '#EBF8FF', color: '#2B6CB0', border: '1px solid #90CDF4', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🔵 입출고</button>
          <button onClick={() => setShowMoveModal(true)} style={{ background: '#EEF2FB', color: '#667EEA', border: '1px solid #C3D0F5', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🔵 위치 이동</button>
          <button onClick={() => setShowDisposalModal(true)} style={{ background: '#FFF5F5', color: C.danger, border: '1px solid #FC8181', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🗑️ 폐기 신청</button>
          {student && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setShowEditModal(!showEditModal)} style={{
                background: showEditModal ? C.navy : '#F0FFF4',
                color: showEditModal ? '#fff' : '#276749',
                border: `1px solid ${showEditModal ? C.navy : '#9AE6B4'}`,
                padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
              }}>✏️ {showEditModal ? '수정 완료' : isAdmin ? '수정' : '수정 신청'}</button>
              {showEditModal && (
                <button onClick={() => { setShowEditModal(false); setEditingField(null) }} style={{
                  background: '#FFF5F5', color: C.danger, border: '1px solid #FC8181',
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                }}>✕ 취소</button>
              )}
            </div>
          )}
        </div>

          {(selectedReagent.hazard || selectedReagent.ghs_live?.hazard) && (
  <div style={{ marginBottom: '16px' }}>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
      {getGhsEmojis(selectedReagent.hazard || selectedReagent.ghs_live?.hazard).map(g => (
        <span key={g.label} style={{ background: '#FFF8E7', border: '1px solid #F6C343',
          borderRadius: '6px', padding: '4px 10px', fontSize: '13px' }}>{g.emoji} {g.label}</span>
      ))}
    </div>
    {selectedReagent.ghs_live?.isYudok && (
      <span style={{ background: '#FFF5F5', color: C.danger, border: '1px solid #FC8181',
        padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
        ⚠️ {selectedReagent.ghs_live.isYudok}
      </span>
    )}
  </div>
)}

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <tbody>
{[
  ['CAS NO.', 'cas_no', selectedReagent.cas_no, selectedReagent.cas_source, 'cas_source'],
  ['회사', 'company', selectedReagent.company, selectedReagent.company_source, 'company_source'],
  ['유별/성질', 'category', selectedReagent.category, selectedReagent.category_source, 'category_source'],
  ['용량', 'volume', `${selectedReagent.volume || ''} ${selectedReagent.unit || ''}`, selectedReagent.volume_source, 'volume_source'],
  ['담당자', 'manager', selectedReagent.manager, selectedReagent.manager_source, 'manager_source'],
  ['Lot No.', null, lots[0]?.lot_no, lots[0]?.lot_source, null],
  ['MSDS URL', 'msds_url', selectedReagent.msds_url, selectedReagent.msds_source, 'msds_source'],
  ['비고', 'notes', selectedReagent.notes, selectedReagent.notes_source, 'notes_source'],
].map(([label, field, value, source, sourceField]) => {
  const pending = field ? pendingChanges.find(p => p.field_name === field) : null
  return (
  <tr key={label}>
    <td style={{ padding: '9px 14px', background: C.bg, fontWeight: '700',
      fontSize: '11px', color: C.muted, width: '35%', borderBottom: `1px solid ${C.border}`,
      textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</td>
    <td style={{ padding: '9px 14px', fontSize: '13px', borderBottom: `1px solid ${C.border}`, color: C.text,
      background: pending ? C.warningTint : 'transparent' }}>
      {pending && (
        <div style={{ fontSize: '10.5px', color: '#8A5A16', marginBottom: '3px' }}>
          {isAdmin
            ? `⏳ ${pending.requested_by} 제안: "${pending.new_value}" · 관리자 승인 대기중`
            : `⏳ 수정 제안됨: "${pending.new_value}" ${pending.created_at ? '· ' + new Date(pending.created_at).toLocaleDateString() : ''} · 관리자 승인 대기중`}
        </div>
      )}
      {showEditModal && field && editingField === field ? (
        <input
          autoFocus
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveField(field, editingValue, sourceField)
            if (e.key === 'Escape') setEditingField(null)
          }}
          onBlur={() => saveField(field, editingValue, sourceField)}
          style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => {
            if (showEditModal && field) {
              setEditingField(field)
              setEditingValue(value || '')
            }
          }}
          title={showEditModal && field ? '클릭하여 수정' : ''}
        >
          <span style={{
            cursor: showEditModal && field ? 'text' : 'default',
            padding: showEditModal && field ? '2px 6px' : '0',
            borderRadius: '4px',
            border: showEditModal && field ? `1px dashed ${C.border}` : 'none',
            minWidth: '40px', display: 'inline-block'
          }}>{value || '-'}</span>
          {source && value && (
            <span style={{
              fontSize: '10px', padding: '1px 6px', borderRadius: '8px', fontWeight: '600',
              background: source === 'ghs_api' ? '#EBF8FF' : source === 'excel' ? '#F0FFF4' : source === 'pubchem' ? '#EEF2FB' : '#F7FAFC',
              color: source === 'ghs_api' ? '#2B6CB0' : source === 'excel' ? '#276749' : source === 'pubchem' ? '#553C9A' : C.muted,
            }}>
              {source === 'ghs_api' ? '🇰🇷 GHS DB' : source === 'excel' ? '📊 엑셀' : source === 'pubchem' ? '🌐 PubChem' : '✏️ 직접입력'}
            </span>
          )}
        </div>
      )}
    </td>
  </tr>
  )})}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '10px 14px', background: C.bg, borderRadius: '8px', fontSize: '12px' }}>
            <span style={{ color: C.muted }}>최종 확인</span>
            <span style={{ color: C.text, fontWeight: '600' }}>
              {selectedReagent.last_confirmed_at
                ? isAdmin
                  ? `${new Date(selectedReagent.last_confirmed_at).toLocaleDateString()} · ${confirmedByName || selectedReagent.confirmed_by}`
                  : new Date(selectedReagent.last_confirmed_at).toLocaleDateString()
                : '확인 기록 없음'}
            </span>
          </div>

          {showEditModal && !isAdmin && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
              ⚠️ 학생 수정은 관리자 승인 후 반영됩니다. 값을 입력하고 Enter/포커스 이동하면 신청이 접수돼요.
            </div>
          )}

          <div style={{ fontSize: '12px', fontWeight: '700', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>재고 현황 (Lot별)</div>
          {lots.map(lot => {
            const isLow = lot.sealed_count === 0 && lot.current_stock <= 20
            const editingSealed = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'sealed_count'
            const editingStock = inlineEdit?.lotId === lot.id && inlineEdit?.field === 'current_stock'
            return (
              <div key={lot.id} style={{ border: `1px solid ${isLow ? '#FFCDD2' : C.border}`, borderRadius: '8px', padding: '14px 16px', marginBottom: '8px', background: isLow ? '#FFF8F8' : C.white }}>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '8px' }}>
                  Lot <strong style={{ color: C.text }}>{lot.lot_no || '-'}</strong>
                  &nbsp;·&nbsp; 유통기한 {lot.expiry_date || '-'}
                  {lot.opened_date && <>&nbsp;·&nbsp; 개봉일 <strong style={{ color: C.navy }}>{lot.opened_date}</strong></>}
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '13px', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>미개봉</span>
                    {editingSealed ? (
                      <input autoFocus type="number" min="0" value={inlineEdit.value}
                        onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                        onBlur={() => saveInlineEdit(lot)}
                        style={{ width: '60px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                    ) : (
                      <strong onClick={e => isAdmin && startInlineEdit(lot.id, selectedReagent.id, 'sealed_count', lot.sealed_count, e)}
                        style={{ cursor: isAdmin ? 'text' : 'default', padding: '1px 6px', borderRadius: '4px', border: isAdmin ? `1px dashed ${C.border}` : 'none' }}>
                        {lot.sealed_count}병
                      </strong>
                    )}
                  </div>
                  <div>
                    <span style={{ color: C.muted, fontSize: '11px', marginRight: '4px' }}>잔량</span>
                    {editingStock ? (
                      <input autoFocus type="number" min="0" max="100" value={inlineEdit.value}
                        onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(lot); if (e.key === 'Escape') setInlineEdit(null) }}
                        onBlur={() => saveInlineEdit(lot)}
                        style={{ width: '60px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                    ) : (
                      <strong onClick={e => isAdmin && startInlineEdit(lot.id, selectedReagent.id, 'current_stock', lot.current_stock, e)}
                        style={{ cursor: isAdmin ? 'text' : 'default', padding: '1px 6px', borderRadius: '4px', border: isAdmin ? `1px dashed ${C.border}` : 'none' }}>
                        {lot.current_stock}%
                      </strong>
                    )}
                  </div>
                  {isLow && <span style={{ color: C.danger, fontWeight: '700' }}>⚠ 재고 부족</span>}
                </div>
              </div>
            )
          })}

          {stockHistory.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>입출고 이력</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['일시','구분','수량', ...(isAdmin ? ['담당자'] : []),'메모'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {stockHistory.map(h => (
                    <tr key={h.id}>
                      <td style={{ ...tdStyle, color: C.muted, fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleDateString()}</td>
                      <td style={tdStyle}>
                        <span style={{ background: h.action === 'in' ? '#F0FFF4' : h.action === 'open' ? '#EBF8FF' : '#FFF5F5', color: h.action === 'in' ? '#276749' : h.action === 'open' ? '#2B6CB0' : C.danger, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                          {h.action === 'in' ? '입고' : h.action === 'open' ? '개봉' : '출고'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{h.quantity}{h.unit}</td>
                      {isAdmin && <td style={{ ...tdStyle, fontSize: '12px' }}>{h.user_name}</td>}
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{h.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* 선택 목록 모달 */}
      {showPickedModal && (
        <Modal onClose={() => setShowPickedModal(false)}>
          <div className="picked-print-target">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '10px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>선택 목록</div>
                <h2 style={{ margin: 0, color: C.navy, fontSize: '18px', fontWeight: '800' }}>선택한 시약 {pickedIds.size}개</h2>
              </div>
              <button className="no-print" onClick={() => setShowPickedModal(false)} style={{ background: 'transparent', border: 'none', borderRadius: '6px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '18px', color: '#CBD5E0' }}>×</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
              <thead>
                <tr>
                  {['시약명', '규격/용량', '잔량', '위치', '최근 확인', ''].map(h => (
                    <th key={h} style={thStyle} className={h === '' ? 'no-print' : undefined}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(pickedIds.values()).map(r => {
                  const lot = (r.reagent_lots || [])[0]
                  const loc = r.locations
                  return (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.volume ? `${r.volume}${r.unit || ''}` : '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{lot ? `${lot.current_stock}%` : '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted }}>{r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}</td>
                      <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                        <button onClick={() => setPickedIds(prev => { const next = new Map(prev); next.delete(r.id); return next })}
                          style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: '13px' }}>제거</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowPickedModal(false)} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>닫기</button>
            <button onClick={() => {
              document.body.classList.add('printing-picked-list')
              window.print()
              setTimeout(() => document.body.classList.remove('printing-picked-list'), 200)
            }} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🖨️ 인쇄/PDF</button>
            <button onClick={() => exportPickedReagents(Array.from(pickedIds.values()))} style={{ padding: '9px 16px', borderRadius: '6px', border: 'none', background: '#1D6F42', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📥 Excel</button>
          </div>
        </Modal>
      )}

    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(26,42,94,0.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: '14px', padding: '28px', width: '640px', maxWidth: '92vw', maxHeight: '82vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(26,42,94,0.25)' }}>
        {children}
      </div>
    </div>
  )
}