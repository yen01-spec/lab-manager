import { useEffect, useState, useRef, Fragment } from 'react'
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [locations, setLocations] = useState([])
  const [companies, setCompanies] = useState([])
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [locationFilter, setLocationFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [includeEmptyStock, setIncludeEmptyStock] = useState(false)
  const [visibleCols, setVisibleCols] = useState({
    casNo: true, company: true, volume: true, stock: true, location: true, lastConfirmed: true,
    lot: false, expiry: false, category: false, ghs: false, status: false,
  })
  const [results, setResults] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const alphabetRefs = useRef({})
  const fetchRequestRef = useRef(0)

  // 편집 모드
  const [editMode, setEditMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState(new Set())

  // 선택 목록 (검색결과에서 여러 시약을 체크해 모아보기 — 전체 사용자). id -> reagent row
  const [pickedIds, setPickedIds] = useState(new Map())
  const [showPickedModal, setShowPickedModal] = useState(false)
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false)
  const [bulkMoveLocation, setBulkMoveLocation] = useState('')
  const [bulkMovedBy, setBulkMovedBy] = useState('')

  // 인라인 편집 (목록에서 재고 숫자 바로 수정)
  const [inlineEdit, setInlineEdit] = useState(null)

  // 시약 일괄조회 (여러 시약명을 한번에 붙여넣어 존재유무/위치 확인 — 학기 준비용)
  const [showBulkLookupModal, setShowBulkLookupModal] = useState(false)
  const [bulkLookupText, setBulkLookupText] = useState('')
  const [bulkLookupResults, setBulkLookupResults] = useState(null)
  const [bulkLookupLoading, setBulkLookupLoading] = useState(false)

  // 직접제조시약
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
    const myRequestId = ++fetchRequestRef.current
    let query = supabase.from('reagents')
      .select('*, reagent_lots(*), locations(*)', { count: 'exact' })
      .neq('status', 'archived')
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    if (locationFilter) query = query.eq('location_id', locationFilter)
    if (companyFilter) query = query.eq('company', companyFilter)
    const { data, count } = await query.range(0, 4999)
    if (fetchRequestRef.current !== myRequestId) return // 늦게 도착한 응답이 최신 필터 결과를 덮어쓰지 않도록 함
    if (count > 4999) {
      alert(`⚠️ 시약이 ${count}개로 많아 일부만 표시됩니다. 관리자에게 문의하세요.`)
    }
    if (data) setResults(data.sort((a, b) => a.name.localeCompare(b.name)))
  }

  function resetFilters() {
    setSearch(''); setLocationFilter(''); setCompanyFilter('')
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

  function goToPurchaseRequestWithPicked() {
    const prefillReagentItems = Array.from(pickedIds.values()).map(r => ({
      reagent_id: r.id, name: r.name, company: r.company || '', cas_no: r.cas_no || '',
      cat_no: '', state: r.category === '고체' ? '고체' : '액체',
      spec: r.volume ? `${r.volume}${r.unit || ''}` : '', quantity: '1', unit_price: '', purpose: '', note: '',
    }))
    navigate('/purchase-request', { state: { prefillReagentItems } })
  }

  async function runBulkLookup() {
    const lines = [...new Set(bulkLookupText.split('\n').map(l => l.trim()).filter(Boolean))]
    if (lines.length === 0) return
    setBulkLookupLoading(true)
    const orFilter = lines.map(l => `name.ilike.%${l.replace(/[,()]/g, ' ').trim()}%`).join(',')
    const { data } = await supabase.from('reagents')
      .select('*, reagent_lots(*), locations(*)')
      .or(orFilter)
      .neq('status', 'archived')
    const pool = data || []
    const results = lines.map(line => {
      const lower = line.toLowerCase()
      const matches = pool.filter(r => r.name.toLowerCase().includes(lower))
      return { query: line, matches }
    })
    setBulkLookupResults(results)
    setBulkLookupLoading(false)
  }

  function addBulkLookupMatchesToPicked() {
    setPickedIds(prev => {
      const next = new Map(prev)
      bulkLookupResults?.forEach(({ matches }) => matches.forEach(r => next.set(r.id, r)))
      return next
    })
    setShowBulkLookupModal(false)
  }

  // 다량 위치 이동 — 선택한 시약들의 활성 Lot을 전부 새 위치로 이동(Lot별 위치이동과 동일한 방식)
  async function submitBulkMove() {
    if (!bulkMoveLocation) { alert('이동할 위치를 선택해주세요'); return }
    if (!bulkMovedBy.trim()) { alert('이름을 입력해주세요'); return }
    const toLoc = locations.find(l => l.id === bulkMoveLocation)
    const toLocName = toLoc ? `${toLoc.room}${toLoc.detail ? ' - ' + toLoc.detail : ''}` : ''
    const selected = results.filter(r => checkedIds.has(r.id))

    let movedLotCount = 0
    let skippedCount = 0
    for (const r of selected) {
      const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
      if (activeLots.length === 0) { skippedCount++; continue }
      for (const lot of activeLots) {
        const fromLoc = locations.find(l => l.id === lot.location_id)
        const fromLocName = fromLoc ? `${fromLoc.room}${fromLoc.detail ? ' - ' + fromLoc.detail : ''}` : '미지정'
        await supabase.from('reagent_lots').update({ location_id: bulkMoveLocation }).eq('id', lot.id)
        await supabase.from('location_history').insert({
          reagent_id: r.id, lot_id: lot.id, reagent_name: r.name,
          from_location_id: lot.location_id, from_location_name: fromLocName,
          to_location_id: bulkMoveLocation, to_location_name: toLocName,
          moved_by: bulkMovedBy,
        })
        movedLotCount++
      }
    }
    await supabase.from('admin_logs').insert({
      admin_name: bulkMovedBy, action: '다량 위치 이동',
      target_type: 'reagent',
      description: `${selected.length}개 시약(Lot ${movedLotCount}개) → ${toLocName}`,
    })
    alert(`✅ ${movedLotCount}개 Lot 이동 완료! → ${toLocName}` + (skippedCount > 0 ? `\n(보유중인 Lot이 없어 ${skippedCount}개 시약은 건너뜀)` : ''))
    setShowBulkMoveModal(false)
    setBulkMoveLocation('')
    setBulkMovedBy('')
    setCheckedIds(new Set())
    setEditMode(false)
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
      registered_by: student.student_id,
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

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
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

  const COLS = 2 // 체크박스 + 시약명 (항상 표시)
    + (visibleCols.casNo ? 1 : 0) + (visibleCols.company ? 1 : 0) + (visibleCols.volume ? 1 : 0)
    + (visibleCols.stock ? 1 : 0) + (visibleCols.location ? 1 : 0) + (visibleCols.lastConfirmed ? 1 : 0)
    + (visibleCols.lot ? 1 : 0) + (visibleCols.expiry ? 1 : 0)
    + (visibleCols.category ? 1 : 0) + (visibleCols.ghs ? 1 : 0) + (visibleCols.status ? 1 : 0)

  const ReagentTable = ({ data }) => {
    const groups = getGroupedReagents(data)
    const letters = Object.keys(groups).sort()
    const allChecked = data.length > 0 && checkedIds.size === data.length
    const allPicked = data.length > 0 && data.every(r => pickedIds.has(r.id))

    const LOT_STATUS_LABEL = { active: '보유중', used_up: '사용완료', disposed: '폐기', missing: '분실' }
    const LOT_STATUS_COLOR = { active: '#00875A', used_up: C.muted, disposed: C.danger, missing: '#B7791F' }

    const renderLotRow = (r, lot) => {
      const loc = locations.find(l => l.id === lot.location_id)
      const dimmed = lot.status !== 'active'
      return (
        <tr key={lot.id} onClick={e => e.stopPropagation()} style={{ background: '#F7F9FC', opacity: dimmed ? 0.6 : 1 }}>
          <td style={{ ...tdStyle, borderRight: `1px solid ${C.borderRow}` }}></td>
          <td style={{ ...tdStyle, fontSize: '12.5px', color: C.muted, whiteSpace: 'nowrap', paddingLeft: '30px', borderRight: `1px solid ${C.borderRow}` }}>
            ↳ Lot {lot.lot_no || '(번호 없음)'}
          </td>
          {visibleCols.casNo && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
          {visibleCols.company && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
          {visibleCols.volume && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
          {visibleCols.stock && (
            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
              {lot.sealed_count}병 / {lot.current_stock}%
            </td>
          )}
          {visibleCols.location && (
            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
              {loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}
            </td>
          )}
          {visibleCols.lot && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{lot.lot_no || '-'}</td>}
          {visibleCols.expiry && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>{lot.expiry_date || '-'}</td>}
          {visibleCols.category && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
          {visibleCols.ghs && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>-</td>}
          {visibleCols.lastConfirmed && <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', borderRight: visibleCols.status ? `1px solid ${C.borderRow}` : undefined }}>-</td>}
          {visibleCols.status && (
            <td style={{ ...tdStyle, fontSize: '12px', color: LOT_STATUS_COLOR[lot.status] || C.muted, fontWeight: '600' }}>
              {LOT_STATUS_LABEL[lot.status] || lot.status}
            </td>
          )}
        </tr>
      )
    }

    const renderRow = (r) => {
      const allLots = r.reagent_lots || []
      const activeLots = allLots.filter(l => l.status === 'active')
      const totalSealed = activeLots.reduce((s, l) => s + l.sealed_count, 0)
      const avgStock = activeLots.length > 0
        ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : 0
      const isLow = activeLots.some(l => l.sealed_count === 0 && l.current_stock <= 20)
      const ghsList = getGhsEmojis(r.hazard)
      const isChecked = checkedIds.has(r.id)
      const isPicked = pickedIds.has(r.id)
      const editingThisSealed = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'sealed_count'
      const editingThisStock = inlineEdit?.reagentId === r.id && inlineEdit?.field === 'current_stock'
      const onlyLot = activeLots.length === 1 ? activeLots[0] : null
      const isExpanded = expandedIds.has(r.id)
      const canExpand = allLots.length > 1

      const activeLocIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
      let loc = null
      if (activeLots.length > 0 && activeLocIds.size <= 1) {
        loc = locations.find(l => l.id === activeLots[0].location_id) || null
      }
      const multiLocation = activeLocIds.size > 1

      const baseBg = isLow ? '#FFF8F8' : C.white
      const selectedBg = '#EEF2FB'
      const isSelected = editMode ? isChecked : isPicked

      return (
      <Fragment key={r.id}>
        <tr
          onClick={e => editMode ? toggleCheck(r.id, e, data) : navigate(`/reagents/${r.id}`)}
          style={{
            background: isSelected ? selectedBg : baseBg,
            cursor: 'pointer',
            borderLeft: isSelected ? `3px solid ${C.navy}` : '3px solid transparent',
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isLow ? '#FFEFEF' : C.bg }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = baseBg }}>
          <td style={{ ...tdStyle, textAlign: 'center', borderRight: `1px solid ${C.borderRow}` }}
            onClick={e => editMode ? toggleCheck(r.id, e, data) : togglePick(r, e)}>
            <input type="checkbox" checked={isSelected} onChange={() => {}}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
          </td>
          <td style={{ ...tdStyle, fontWeight: '600', color: C.navy, minWidth: '160px', maxWidth: '300px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
            {canExpand && (
              <span onClick={e => { e.stopPropagation(); toggleExpand(r.id) }}
                style={{ marginRight: '5px', color: C.blue, fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>
                {isExpanded ? '▾' : '▸'}
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: '230px', verticalAlign: 'middle' }} title={r.name}>{r.name}</span>
            {canExpand && (
              <span onClick={e => { e.stopPropagation(); toggleExpand(r.id) }}
                style={{ marginLeft: '6px', fontSize: '10.5px', background: '#EEF2FB', color: C.navy,
                  padding: '2px 8px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>
                {activeLots.length}병{multiLocation ? ' · 위치별 보기' : ''}
              </span>
            )}
            {r.reagent_type === 'self_made' && <span style={{ marginLeft: '6px', fontSize: '9.5px', background: '#EAF1FB',
              color: '#1F4E96', padding: '1px 7px', borderRadius: '999px', fontWeight: '700' }}>직접제조</span>}
            {isLow && <span style={{ marginLeft: '6px', fontSize: '10px', background: '#FFEBEE',
              color: C.danger, padding: '1px 6px', borderRadius: '8px', fontWeight: '700' }}>부족</span>}
          </td>
          {visibleCols.casNo && (
            <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{r.cas_no || '-'}</td>
          )}
          {visibleCols.company && (
            <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px', borderRight: `1px solid ${C.borderRow}` }} title={r.company || ''}>{r.company || '-'}</td>
          )}
          {visibleCols.volume && (
            <td style={{ ...tdStyle, color: C.muted, fontSize: '12px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>
              {r.volume ? `${r.volume}${r.unit}` : '-'}
            </td>
          )}
          {visibleCols.stock && (
          <td style={{ ...tdStyle, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }} onClick={e => e.stopPropagation()}>
            {activeLots.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '36px', height: '6px', borderRadius: '3px', background: '#F0F2F6', overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: `${avgStock}%`, height: '100%', background: isLow ? '#E5484D' : '#1E9E6A' }} />
                </div>
                {editingThisSealed ? (
                  <input autoFocus type="number" min="0" value={inlineEdit.value}
                    onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(onlyLot); if (e.key === 'Escape') setInlineEdit(null) }}
                    onBlur={() => saveInlineEdit(onlyLot)}
                    style={{ width: '52px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                ) : (
                  <span onClick={e => !editMode && onlyLot && startInlineEdit(onlyLot.id, r.id, 'sealed_count', totalSealed, e)}
                    title={isAdmin && !editMode && onlyLot ? '클릭하여 수정' : !onlyLot ? '상세페이지에서 Lot별로 수정하세요' : ''}
                    style={{ cursor: isAdmin && !editMode && onlyLot ? 'text' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                      border: isAdmin && !editMode && onlyLot ? `1px dashed ${C.border}` : 'none', minWidth: '32px', display: 'inline-block', textAlign: 'center' }}>
                    {totalSealed}병
                  </span>
                )}
                <span style={{ color: C.muted, fontSize: '11px' }}>/</span>
                {editingThisStock ? (
                  <input autoFocus type="number" min="0" max="100" value={inlineEdit.value}
                    onChange={e => setInlineEdit({ ...inlineEdit, value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') saveInlineEdit(onlyLot); if (e.key === 'Escape') setInlineEdit(null) }}
                    onBlur={() => saveInlineEdit(onlyLot)}
                    style={{ width: '52px', padding: '3px 6px', borderRadius: '4px', border: `2px solid ${C.gold}`, fontSize: '13px', textAlign: 'center' }} />
                ) : (
                  <span onClick={e => !editMode && onlyLot && startInlineEdit(onlyLot.id, r.id, 'current_stock', avgStock, e)}
                    title={isAdmin && !editMode && onlyLot ? '클릭하여 수정' : !onlyLot ? '상세페이지에서 Lot별로 수정하세요' : ''}
                    style={{ cursor: isAdmin && !editMode && onlyLot ? 'text' : 'default', padding: '2px 6px', borderRadius: '4px', fontSize: '13px',
                      border: isAdmin && !editMode && onlyLot ? `1px dashed ${C.border}` : 'none', minWidth: '32px', display: 'inline-block', textAlign: 'center' }}>
                    {avgStock}%
                  </span>
                )}
              </div>
            ) : <span style={{ color: C.muted, fontSize: '12px' }}>보유 0병</span>}
          </td>
          )}
          {visibleCols.location && (
          <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px', borderRight: `1px solid ${C.borderRow}` }}
            title={loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : ''}>
            {multiLocation ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'}
          </td>
          )}
          {visibleCols.lot && (
            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{onlyLot?.lot_no || '-'}</td>
          )}
          {visibleCols.expiry && (
            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }}>{onlyLot?.expiry_date || '-'}</td>
          )}
          {visibleCols.category && (
            <td style={{ ...tdStyle, fontSize: '12px', borderRight: `1px solid ${C.borderRow}` }}>
              {r.category
                ? <span style={{ background: '#EEF2FB', color: C.navy, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>{r.category}</span>
                : <span style={{ color: C.muted }}>-</span>}
            </td>
          )}
          {visibleCols.ghs && (
            <td style={{ ...tdStyle, fontSize: '16px', whiteSpace: 'nowrap', borderRight: `1px solid ${C.borderRow}` }} onClick={e => e.stopPropagation()}>
              {ghsList.length > 0
                ? <span title={ghsList.map(g => g.label).join(', ')}>{ghsList.map(g => g.emoji).join('')}</span>
                : <span style={{ color: C.muted, fontSize: '12px' }}>-</span>}
            </td>
          )}
          {visibleCols.lastConfirmed && (
            <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted, whiteSpace: 'nowrap', borderRight: visibleCols.status ? `1px solid ${C.borderRow}` : undefined }}>
              {r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}
            </td>
          )}
          {visibleCols.status && (
            <td style={tdStyle}>
              {activeLots.length === 0
                ? <span style={{ color: C.muted, fontWeight: '600', fontSize: '12px' }}>보유없음</span>
                : isLow
                  ? <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>⚠ 부족</span>
                  : <span style={{ color: '#00875A', fontWeight: '600', fontSize: '12px' }}>✓ 정상</span>}
            </td>
          )}
        </tr>
        {isExpanded && allLots.map(lot => renderLotRow(r, lot))}
      </Fragment>
      )
    }

    return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, borderRight: `1px solid ${C.borderRow}` }}>
              <input type="checkbox" checked={editMode ? allChecked : allPicked}
                onChange={() => editMode ? toggleAll(data) : togglePickAll(data)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
            </th>
            {[
              '시약명',
              ...(visibleCols.casNo ? ['CAS No.'] : []),
              ...(visibleCols.company ? ['회사'] : []),
              ...(visibleCols.volume ? ['용량'] : []),
              ...(visibleCols.stock ? ['재고'] : []),
              ...(visibleCols.location ? ['위치'] : []),
              ...(visibleCols.lot ? ['Lot No.'] : []),
              ...(visibleCols.expiry ? ['유효기간'] : []),
              ...(visibleCols.category ? ['성상'] : []),
              ...(visibleCols.ghs ? ['GHS'] : []),
              ...(visibleCols.lastConfirmed ? ['최근확인'] : []),
              ...(visibleCols.status ? ['상태'] : []),
            ].map(h => (
              <th key={h} style={{ ...thStyle, borderRight: `1px solid ${C.borderRow}` }}>{h}</th>
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
              {groups[letter].map(r => renderRow(r))}
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

  // 보유중(active) Lot이 하나도 없는 시약은 기본적으로 숨김 — "재고 0 포함"을 켜면 노출
  const displayResults = includeEmptyStock
    ? results
    : results.filter(r => (r.reagent_lots || []).some(l => l.status === 'active'))

  return (
    <div>
      <PageBanner title="시약 목록" sub="Reagent List" breadcrumb={['홈', '시약 관리', '시약 목록']}
        extra={<span style={{ fontSize: '12px', color: C.muted }}>전체 {totalCount.toLocaleString()}개 · 검색결과 {displayResults.length.toLocaleString()}개</span>} />
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
          <button onClick={() => { setShowBulkLookupModal(true); setBulkLookupResults(null) }} style={{
            background: C.white, color: C.text, border: `1px solid ${C.border}`,
            padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600', flexShrink: 0,
          }}>📋 시약 일괄 검색</button>
          <button onClick={() => setShowMadeModal(true)} style={{
            background: '#F9FBFF', color: '#1F4E96', border: `1px dashed #C9DAF5`,
            padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600', flexShrink: 0,
          }}>🧪 직접 제조 시약 등록</button>
          {isAdmin && displayResults.length > 0 && (
            <button onClick={() => exportReagents(displayResults, locations)} style={{
              background: '#1D6F42', color: 'white', border: 'none',
              padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', flexShrink: 0,
            }}>📥 엑셀</button>
          )}
          {isAdmin && displayResults.length > 0 && (
            <button onClick={toggleEditMode} style={{
              background: editMode ? C.navy : C.white,
              color: editMode ? C.white : C.text,
              border: `1px solid ${editMode ? C.navy : C.border}`,
              padding: '9px 18px', borderRadius: '6px', cursor: 'pointer',
              fontSize: '13px', fontWeight: '600', flexShrink: 0,
            }}>✏️ {editMode ? '편집 종료' : '편집'}</button>
          )}
        </div>

        {/* 표시 열 선택 (기본 열 + 선택 열) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '2px 4px 12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', color: C.muted }}>시약명(고정)</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.casNo} onChange={() => setVisibleCols(v => ({ ...v, casNo: !v.casNo }))} />CAS
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.company} onChange={() => setVisibleCols(v => ({ ...v, company: !v.company }))} />제조사
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.volume} onChange={() => setVisibleCols(v => ({ ...v, volume: !v.volume }))} />규격
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.stock} onChange={() => setVisibleCols(v => ({ ...v, stock: !v.stock }))} />재고
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.location} onChange={() => setVisibleCols(v => ({ ...v, location: !v.location }))} />위치
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.lastConfirmed} onChange={() => setVisibleCols(v => ({ ...v, lastConfirmed: !v.lastConfirmed }))} />최근확인
          </label>
          <div style={{ width: '1px', alignSelf: 'stretch', background: C.border }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.lot} onChange={() => setVisibleCols(v => ({ ...v, lot: !v.lot }))} />Lot No.
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.expiry} onChange={() => setVisibleCols(v => ({ ...v, expiry: !v.expiry }))} />유효기간
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.category} onChange={() => setVisibleCols(v => ({ ...v, category: !v.category }))} />성상
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.ghs} onChange={() => setVisibleCols(v => ({ ...v, ghs: !v.ghs }))} />GHS
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={visibleCols.status} onChange={() => setVisibleCols(v => ({ ...v, status: !v.status }))} />상태
          </label>
          <div style={{ width: '1px', alignSelf: 'stretch', background: C.border }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: C.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeEmptyStock} onChange={() => setIncludeEmptyStock(v => !v)} />재고 0 포함
          </label>
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
              background: C.white, color: C.navy, border: `1px solid #C9DAF5`,
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}>선택 목록 보기</button>
            <button onClick={goToPurchaseRequestWithPicked} style={{
              background: C.navy, color: '#fff', border: 'none',
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>🛒 구매요청서에 담기</button>
            <button onClick={() => setPickedIds(new Map())} style={{
              background: C.white, color: C.muted, border: `1px solid ${C.border}`,
              padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
            }}>선택 해제</button>
          </div>
        )}

        {/* 결과 목록 */}
        {displayResults.length === 0
          ? <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: '13px' }}>
              {results.length > 0 ? '보유 재고가 있는 시약이 없습니다. "재고 0 포함"을 켜보세요.' : '조건에 맞는 시약이 없습니다.'}
            </div>
          : (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Card noPadding><ReagentTable data={displayResults} /></Card>
              </div>
              <AlphabetIndex data={displayResults} />
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

      {/* 시약 일괄조회 모달 */}
      {showBulkLookupModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,42,94,0.55)', zIndex: 400,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }} onClick={() => setShowBulkLookupModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.white, borderRadius: '14px', padding: '28px',
            width: '760px', maxWidth: '95vw', maxHeight: '86vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(26,42,94,0.25)',
          }}>
            <h3 style={{ margin: '0 0 4px', color: C.navy }}>📋 시약 일괄 검색</h3>
            <p style={{ margin: '0 0 16px', color: C.muted, fontSize: '12.5px' }}>
              필요한 시약명을 한 줄에 하나씩 붙여넣으면 목록에 있는지, 위치와 잔량이 어떤지 한번에 확인할 수 있어요.
            </p>
            <textarea value={bulkLookupText} onChange={e => setBulkLookupText(e.target.value)}
              placeholder={'예)\nAcetone\nHCl\nEDTA'} rows={6}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button onClick={runBulkLookup} disabled={bulkLookupLoading} style={{ ...btnPrimary, padding: '9px 20px', opacity: bulkLookupLoading ? 0.6 : 1 }}>
                {bulkLookupLoading ? '조회 중...' : '조회'}
              </button>
            </div>

            {bulkLookupResults && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: C.navy }}>
                    조회 결과 · 있음 {bulkLookupResults.filter(r => r.matches.length > 0).length}/{bulkLookupResults.length}건
                  </span>
                  {bulkLookupResults.some(r => r.matches.length > 0) && (
                    <button onClick={addBulkLookupMatchesToPicked} style={{
                      background: C.navy, color: '#fff', border: 'none', padding: '7px 14px',
                      borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', fontWeight: '600',
                    }}>찾은 시약 모두 선택 목록에 담기</button>
                  )}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{['입력한 이름', '결과', '위치', '잔량', '최근확인'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {bulkLookupResults.map(({ query, matches }) => (
                      matches.length === 0 ? (
                        <tr key={query}>
                          <td style={{ ...tdStyle, fontWeight: '600' }}>{query}</td>
                          <td style={{ ...tdStyle, color: C.danger, fontWeight: '700' }}>✕ 없음</td>
                          <td style={tdStyle}>-</td><td style={tdStyle}>-</td><td style={tdStyle}>-</td>
                        </tr>
                      ) : matches.map((r, i) => {
                        const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
                        const avgStock = activeLots.length > 0
                          ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : 0
                        const locIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
                        const loc = locIds.size === 1 ? locations.find(l => l.id === activeLots[0].location_id) : null
                        const locText = locIds.size > 1 ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'
                        return (
                          <tr key={r.id}>
                            <td style={{ ...tdStyle, fontWeight: '600' }}>{i === 0 ? query : ''}</td>
                            <td style={{ ...tdStyle, color: '#00875A', fontWeight: '700' }}>{i === 0 && matches.length > 1 ? `✓ ${matches.length}건` : '✓ 있음'}</td>
                            <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locText}</td>
                            <td style={{ ...tdStyle, fontSize: '12px' }}>{activeLots.length > 0 ? `${avgStock}%` : '-'}</td>
                            <td style={{ ...tdStyle, fontSize: '11.5px', color: C.muted }}>{r.last_confirmed_at ? new Date(r.last_confirmed_at).toLocaleDateString() : '-'}</td>
                          </tr>
                        )
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowBulkLookupModal(false)} style={{ ...btnPrimary, background: C.white, color: C.text, border: `1px solid ${C.border}`, padding: '9px 18px' }}>닫기</button>
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
                  const activeLots = (r.reagent_lots || []).filter(l => l.status === 'active')
                  const avgStock = activeLots.length > 0
                    ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : null
                  const locIds = new Set(activeLots.map(l => l.location_id).filter(Boolean))
                  const loc = locIds.size === 1 ? locations.find(l => l.id === activeLots[0].location_id) : null
                  const locText = locIds.size > 1 ? '위치별 상이' : loc ? `${loc.room}${loc.detail ? ' · ' + loc.detail : ''}` : '-'
                  return (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, fontWeight: '600', color: C.navy }}>{r.name}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{r.volume ? `${r.volume}${r.unit || ''}` : '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px' }}>{avgStock !== null ? `${avgStock}%` : '-'}</td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: C.muted }}>{locText}</td>
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
            <button onClick={() => {
              const withMsds = Array.from(pickedIds.values()).filter(r => r.msds_url)
              if (withMsds.length === 0) { alert('선택한 시약 중 등록된 MSDS 파일이 있는 항목이 없어요.'); return }
              withMsds.forEach(r => window.open(r.msds_url, '_blank'))
            }} style={{ padding: '9px 16px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              📄 MSDS 일괄 열기 ({Array.from(pickedIds.values()).filter(r => r.msds_url).length}건)
            </button>
            <button onClick={() => exportPickedReagents(Array.from(pickedIds.values()), locations)} style={{ padding: '9px 16px', borderRadius: '6px', border: 'none', background: '#1D6F42', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📥 Excel</button>
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