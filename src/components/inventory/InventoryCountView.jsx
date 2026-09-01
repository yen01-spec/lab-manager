import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabase'
import { C, PageBanner, btnPrimary, btnGhost, inputStyle, labelStyle, thStyle, tdStyle } from '../../design'
import { fetchAllPages } from '../../lib/fetchAllPages'
import { smallBtnStyle, diffCellStyle } from '../../lib/inventoryUtils'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import CompanyPicker from '../CompanyPicker'
import StagedCompanyField from './StagedCompanyField'
import ActionModal from './ActionModal'
import NewRegistrationSummary from './NewRegistrationSummary'

// ════════════════════════════════════════════════════════════
//  실사 입력 화면 (학생/관리자 공용)
// ════════════════════════════════════════════════════════════
export default function InventoryCountView({ session, myName, student, isAdmin, onBack }) {
  const { isMobile } = useBreakpoint()
  const [lots, setLots] = useState([])
  const [counts, setCounts] = useState({})
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('') // ← 목록 필터링/하이라이트용(디바운스)
  const [compareLot, setCompareLot] = useState(null)  // ← 검색어 정확히 일치 시 상단에 뜨는 대조 입력 패널 대상
  const [sliderDisplay, setSliderDisplay] = useState(null) // ← 상단 패널 잔량 슬라이더의 현재 값(퍼센트 표시용)
  const [compareCandidates, setCompareCandidates] = useState([]) // ← 같은 이름의 Lot이 여러 개라 특정 못했을 때 고를 후보들
  const [savedMsg, setSavedMsg] = useState(false)      // ← "✓ 수정되었습니다" 인라인 메시지
  const [searchOpen, setSearchOpen] = useState(false)  // ← 검색창 아래 후보 드롭다운 열림 여부
  // 모바일 목록 화면은 "완료/미완료" 두 탭만 쓰므로(PC의 '전체' 탭 없음) 처음부터 미완료로 시작.
  const [filter, setFilter] = useState(isMobile ? 'undone' : 'all')
  const [locationFilter, setLocationFilter] = useState('')
  const [capStart, setCapStart] = useState(0) // 렌더 캡 윈도우 시작 인덱스 — 알파벳 인덱스 점프 시 이동
  const [saving, setSaving] = useState({})
  // "기타조치"(폐기신청/위치 내 시약 미확인) 모달 — actionModalLot이 있으면 열림
  const [actionModalLot, setActionModalLot] = useState(null)
  const [actionStep, setActionStep] = useState('choose') // 'choose' | 'disposal'
  const [disposalReasonInput, setDisposalReasonInput] = useState('')
  const [disposalByLot, setDisposalByLot] = useState({}) // lot_id -> { reason } (대기중인 폐기신청)
  // 검색해도 기존 목록에 전혀 없을 때, 상단 패널 안에서 바로 미등록 시약을 입력하는 모드
  // (예전엔 별도 모달이었는데, 검색→대조/수정 패널과 자연스럽게 이어지도록 통합함)
  const [newEntryMode, setNewEntryMode] = useState(false)
  const [newEntryForm, setNewEntryForm] = useState({ name: '', purity: '', cas_no: '', company: '', cat_no: '', lot_no: '', category: '', volume: '', unit: '', location_id: '', current_stock: '100', abnormal_note: '', reagent_id: null })
  const inputRefs = useRef({})
  const rowRefs = useRef({})       // ← 알파벳 인덱스용 행 ref
  const searchInputRef = useRef(null)
  const searchBoxRef = useRef(null)   // ← 후보 드롭다운 바깥 클릭 감지용
  const comparePanelInputRef = useRef(null)
  const completeButtonRef = useRef(null)
  const searchDebounceRef = useRef(null)
  const savedMsgTimerRef = useRef(null)

  useEffect(() => { fetchLots(); fetchLocations(); fetchDisposals() }, [])

  // 모바일 화면 전환(목록↔입력, 다음 항목으로 이동) 때마다 새 화면의 맨 위부터 보이게—
  // setState가 아니라 DOM 스크롤 위치만 맞추는 것이라 effect 안에서 호출해도 무방함.
  useEffect(() => { if (isMobile) window.scrollTo(0, 0) }, [isMobile, compareLot?.id, newEntryMode])

  // "폐기신청됨" 버튼 표시용 — 대기중인 폐기신청만 필요하므로(처리 완료된 건 다시 신청 가능해야
  // 함) status=pending만 가져옴. lot_id로 필터링하면 담당구역 수천 개를 URL에 나열하게 될 수
  // 있어(앞서 재고실사 로딩 최적화 때 겪은 문제) 필터 없이 전체를 가져와 화면에서 매칭한다 —
  // 폐기신청 대기 건수 자체는 시약 목록 규모와 무관하게 적을 것으로 예상됨.
  async function fetchDisposals() {
    const { data } = await supabase.from('disposal_requests').select('lot_id, reason').eq('status', 'pending')
    const map = {}
    ;(data || []).forEach(d => { map[d.lot_id] = { reason: d.reason } })
    setDisposalByLot(map)
  }

  // 검색 후보 드롭다운 바깥을 클릭하면 닫음
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  // 검색어 입력은 즉시 반영하되, 목록 필터링/하이라이트는 살짝 디바운스해서 렌더 부담을 줄임.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(searchDebounceRef.current)
  }, [search])

  async function fetchLots() {
    setLoading(true)
    // 구역 배정 기능이 없어지면서 누구나(관리자/학생 구분 없이) 세션 전체를 본다 —
    // 배정에 따른 서버측 필터링은 더 이상 필요 없음.
    const countData = await fetchAllPages((from, to) => supabase.from('inventory_counts')
      .select('*').eq('session_id', session.id).range(from, to))
    const lotIds = (countData || []).map(c => c.lot_id)
    if (lotIds.length === 0) { setLots([]); setCounts({}); setLoading(false); return }
    const idChunks = []
    for (let i = 0; i < lotIds.length; i += 500) idChunks.push(lotIds.slice(i, i + 500))
    const chunkResults = await Promise.all(idChunks.map(chunk => supabase.from('reagent_lots')
      .select('id, reagent_id, location_id, lot_no, cat_no, sealed_count, current_stock, reagents(id, name, cas_no, company, category, hazard, volume, unit, purity), locations(room, detail)')
      .in('id', chunk)))
    const lotData = chunkResults.flatMap(r => r.data || [])
    if (lotData) {
      setLots(lotData.sort((a, b) => (a.reagents?.name || '').localeCompare(b.reagents?.name || '', 'ko')))
    }
    if (countData) {
      const map = {}
      countData.forEach(c => { map[c.lot_id] = c })
      setCounts(map)
    }
    setLoading(false)
  }

  // Lot 단위로 이미 한 행 = 한 병이므로("미개봉 병 수"를 따로 세는 건 의미가 없음 — 같은
  // 시약이라도 병이 여러 개면 각각 별도 Lot으로 등록돼 있어야 함), 실사에서 입력받는 실측값은
  // "잔량(%)" 하나뿐. 미개봉 병 수(sealed_count)는 장부값 그대로 자동으로 같이 저장해서
  // (반영 로직이 계속 sealed_count도 갱신하므로) 다른 화면에는 영향이 없게 함.
  async function saveStock(lot, value) {
    const numVal = Number(value)
    if (isNaN(numVal) || numVal < 0) return
    setSaving(prev => ({ ...prev, [lot.id]: true }))
    const existing = counts[lot.id]
    const bookSealed = existing?.book_sealed ?? lot.sealed_count
    const updateData = { actual_stock: numVal, actual_sealed: bookSealed, counted_by: myName, counted_by_student_id: student?.student_id ?? null, counted_at: new Date().toISOString() }
    if (existing) {
      await supabase.from('inventory_counts').update(updateData).eq('id', existing.id)
      setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], ...updateData } }))
    }
    setSaving(prev => ({ ...prev, [lot.id]: false }))
  }

  // 잔량 입력칸은 장부값이 이미 채워진 채로 시작 — 병을 확인해서 장부랑 같으면
  // 아무것도 고치지 않고 Enter 한 번으로 그 값 그대로 저장 + 바로 다음 행으로 이동.
  // 다르면 그 칸만 고쳐 쓰고 Enter를 누르면 됨(엑셀에서 맞는 셀은 그냥 넘어가는 것과 동일한 흐름).
  function confirmRow(lot, idx, currentList, bookStock) {
    const stockEl = inputRefs.current[`stock_${lot.id}`]
    // 고쳐 쓴 값을 지워서 빈 칸이 되면 장부값으로 되돌린 것으로 보고 그 값을 저장
    if (stockEl) saveStock(lot, stockEl.value !== '' ? stockEl.value : bookStock)
    const nextLot = currentList[idx + 1]
    if (nextLot && inputRefs.current[`stock_${nextLot.id}`]) inputRefs.current[`stock_${nextLot.id}`].focus()
  }

  // 미확인(분실) 표시 — 스테이징만(실사 완료 처리 시점에 reagent_lots.status='missing'으로 반영)
  async function setMissing(lot, value) {
    const existing = counts[lot.id]
    if (!existing) return
    await supabase.from('inventory_counts').update({ reported_missing: value }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], reported_missing: value } }))
  }

  // 이상기록도 잔량/미개봉처럼 열에 바로 입력하는 칸(Tab/Enter로 이동) — 모달 없음.
  async function saveAbnormalNote(lot, value) {
    const existing = counts[lot.id]
    if (!existing) return
    const trimmed = value.trim() || null
    if (trimmed === (existing.abnormal_note || null)) return
    await supabase.from('inventory_counts').update({ abnormal_note: trimmed }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], abnormal_note: trimmed } }))
  }

  // 폐기 신청 — 실사 완료 처리 흐름과 무관하게 기존 disposal_requests 신청→승인 구조 그대로 재사용.
  // window.prompt() 대신 표를 벗어나지 않는 사유 칩 선택으로 한 번에 제출.
  async function requestDisposal(lot, reason) {
    if (!myName.trim()) { alert('로그인 후 이용해주세요'); return }
    await supabase.from('disposal_requests').insert({
      reagent_id: lot.reagent_id, lot_id: lot.id, lot_no: lot.lot_no,
      reagent_name: lot.reagents?.name, requested_by: myName, requested_by_student_id: student?.student_id ?? null,
      reason, status: 'pending',
    })
    setDisposalByLot(prev => ({ ...prev, [lot.id]: { reason } }))
  }

  // "기타조치" 모달 — 폐기신청/위치 내 시약 미확인을 한 곳에서 고르게 함(예전엔 폐기신청만
  // 표에서 바로 골랐는데, 미확인 표시도 여기로 합쳐서 "조치" 버튼 하나로 통일).
  function openActionModal(lot) {
    setActionModalLot(lot)
    setActionStep('choose')
    setDisposalReasonInput('')
  }
  function closeActionModal() {
    setActionModalLot(null)
    setActionStep('choose')
    setDisposalReasonInput('')
  }
  async function submitDisposalFromModal() {
    if (!actionModalLot || !disposalReasonInput.trim()) return
    await requestDisposal(actionModalLot, disposalReasonInput.trim())
    closeActionModal()
  }
  async function selectMissingFromModal() {
    if (!actionModalLot) return
    await setMissing(actionModalLot, true)
    closeActionModal()
  }
  async function cancelMissingFromModal() {
    if (!actionModalLot) return
    await setMissing(actionModalLot, false)
    closeActionModal()
  }

  // 위치 변경(종합실사 전용) — 스테이징만(실사 완료 처리 시점에 location_id 반영 + location_history 기록).
  // 열에 있는 select에서 고르는 즉시 저장(별도 저장 버튼 없음).
  async function changeLocation(lot, locationId) {
    const existing = counts[lot.id]
    if (!existing) return
    await supabase.from('inventory_counts').update({ staged_location_id: locationId || null }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], staged_location_id: locationId || null } }))
  }

  // 시약 기본정보(시약명/CAS/회사/용량/단위/성상/유해정보) 실사 중 수정 — 잔량/미개봉과 같은
  // 스테이징 방식: inventory_counts.staged_reagent_fields에 모아뒀다가 구역 완료 처리(1단계)
  // 시점에 reagents에 반영 + pending_confirm(검토대기 표시).
  // 값이 장부와 같아도(=고친 게 없어도) 일단 확인은 한 것이므로 staged에 그대로 적어둔다 —
  // 그래야 "파란 테두리 = 확인했고 장부값과 일치"를 표시할 수 있음(직접 고친 값과 구분하려면
  // "이미 staged에 적힌 값과 또 같은지"만 보고, 그럴 때만 재저장을 건너뜀).
  async function saveReagentField(lot, field, value) {
    const existing = counts[lot.id]
    if (!existing) return
    const alreadyStaged = existing.staged_reagent_fields || {}
    if (field in alreadyStaged && alreadyStaged[field] === value) return
    const nextStaged = { ...alreadyStaged, [field]: value }
    await supabase.from('inventory_counts').update({ staged_reagent_fields: nextStaged }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], staged_reagent_fields: nextStaged } }))
  }

  // Lot 고유정보(Cat No./Lot No.) 실사 중 수정 — saveReagentField와 동일한 스테이징 방식이지만
  // reagents가 아니라 이 Lot 자체(reagent_lots)에 반영되는 필드라 book/staged 스냅샷을 따로 둠.
  async function saveLotField(lot, field, value) {
    const existing = counts[lot.id]
    if (!existing) return
    const alreadyStaged = existing.staged_lot_fields || {}
    if (field in alreadyStaged && alreadyStaged[field] === value) return
    const nextStaged = { ...alreadyStaged, [field]: value }
    await supabase.from('inventory_counts').update({ staged_lot_fields: nextStaged }).eq('id', existing.id)
    setCounts(prev => ({ ...prev, [lot.id]: { ...prev[lot.id], staged_lot_fields: nextStaged } }))
  }

  // 신규(미등록) 시약 등록 — 검색해서 기존 목록에 전혀 없으면 상단 검색창 아래 드롭다운에
  // "기존 목록에 없습니다"를 띄우고, 그걸 누르면 대조 패널이 신규 입력 모드로 바뀜.
  // 입력한 시약명을 그대로 넣어두고 나머지 정보를 채운 뒤 "등록 완료"를 누르면
  // 즉시 reagents/reagent_lots를 생성하고, 이번 세션 inventory_counts에도 바로 편입시켜
  // 진행률에 포함 + "완료" 상태로 시작(실사에서 방금 발견/확인한 값이므로).
  // "기존 목록에 없습니다"는 이번 세션의 Lot 중에는 없다는 뜻일 뿐, reagents 카탈로그
  // 자체엔 이미 있을 수 있음(예: Lot 데이터가 통째로 초기화된 뒤 처음 시작한 세션이라면
  // 세션 안엔 항상 아무 Lot도 없음). 여기서 카탈로그를 한 번 더 검색해서, 정확히 일치하는
  // 시약이 있으면 그 시약에 새 Lot만 붙이고 reagents를 또 만들지 않게 함(중복 등록 방지).
  async function startNewEntry() {
    setCompareLot(null)
    setCompareCandidates([])
    setSearchOpen(false)
    const term = search.trim()
    const { data: matches } = await supabase.from('reagents')
      .select('id, name, cas_no, company, category, volume, unit, purity')
      .ilike('name', term).neq('status', 'archived').limit(5)
    const m = matches && matches.length > 0 ? matches[0] : null
    setNewEntryForm({
      name: m?.name ?? term, purity: m?.purity ?? '', cas_no: m?.cas_no ?? '', company: m?.company ?? '',
      cat_no: '', lot_no: '', category: m?.category ?? '', volume: m?.volume != null ? String(m.volume) : '', unit: m?.unit ?? '',
      location_id: '', current_stock: '100', abnormal_note: '', reagent_id: m?.id ?? null,
    })
    setNewEntryMode(true)
  }
  function cancelNewEntry() {
    setNewEntryMode(false)
    setSearch('')
    setDebouncedSearch('')
  }
  async function submitInlineNewReagent() {
    if (!myName.trim()) { alert('로그인 후 이용해주세요'); return }
    if (!newEntryForm.name.trim()) { alert('화학물질명을 입력해주세요'); return }
    if (!newEntryForm.location_id) { alert('위치를 선택해주세요'); return }
    let reagentId = newEntryForm.reagent_id
    if (!reagentId) {
      const { data: r, error } = await supabase.from('reagents').insert({
        name: newEntryForm.name.trim(), purity: newEntryForm.purity || null, cas_no: newEntryForm.cas_no || null, company: newEntryForm.company || null,
        category: newEntryForm.category || null, volume: newEntryForm.volume || null, unit: newEntryForm.unit || null,
        reagent_type: 'purchased', status: 'active', registered_by: student?.student_id ?? null,
      }).select().single()
      if (error) { alert('시약 등록 실패: ' + error.message); return }
      reagentId = r.id
    }
    const stockNum = Number(newEntryForm.current_stock) || 0
    const { data: newLot, error: lotErr } = await supabase.from('reagent_lots').insert({
      reagent_id: reagentId, lot_no: newEntryForm.lot_no || null, cat_no: newEntryForm.cat_no || null,
      sealed_count: 1, current_stock: stockNum, location_id: newEntryForm.location_id, status: 'active',
    }).select().single()
    if (lotErr) { alert('Lot 등록 실패: ' + lotErr.message); return }
    await supabase.from('inventory_counts').insert({
      session_id: session.id, reagent_id: reagentId, lot_id: newLot.id,
      book_sealed: 0, book_stock: 0, book_status: 'active', book_location_id: newEntryForm.location_id,
      actual_sealed: 1, actual_stock: stockNum,
      abnormal_note: newEntryForm.abnormal_note.trim() || null,
      counted_by: myName, counted_by_student_id: student?.student_id ?? null, counted_at: new Date().toISOString(),
      is_new_registration: true,
    })
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: newLot.id, user_name: `[실사] ${myName}`,
      before_sealed: 0, after_sealed: 1, before_stock: 0, after_stock: stockNum,
    })
    alert(newEntryForm.reagent_id ? '기존 시약에 새 Lot이 등록되었습니다!' : '미등록 시약이 입력되었습니다!')
    setNewEntryMode(false)
    setSearch('')
    setDebouncedSearch('')
    fetchLots()
  }

  // 알파벳 인덱스 — 실제 존재하는 첫 글자만 추출
  const availableLetters = [...new Set(lots.map(l => {
    const first = l.reagents?.name?.[0]?.toUpperCase() || ''
    return first.match(/[A-Z가-힣]/) ? first : '#'
  }))].sort()

  // 캡에 걸려 대상 행이 안 그려졌을 수 있으니, 전체를 다 풀지 않고 대상 주변으로
  // 캡 윈도우(capStart~capStart+RENDER_CAP)를 옮긴 뒤 스크롤한다 — 큰 범위에서도 가볍게 유지.
  function scrollToLetter(letter) {
    const idx = lots.findIndex(l => {
      const first = l.reagents?.name?.[0]?.toUpperCase() || ''
      return first === letter
    })
    if (idx === -1) return
    const target = lots[idx]
    setSearch('')
    setFilter('all')
    setCapStart(Math.max(0, idx - 20))
    setTimeout(() => {
      if (rowRefs.current[target.id]) rowRefs.current[target.id].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  // 검색창에서 Enter — 시약명/CAS/Lot No.가 검색어와 "정확히" 일치하는 항목이 딱 1건이면
  // 상단 대조 입력 패널에 띄운다. 없거나(부분일치만 있음) 여러 건이면 패널은 비워두고 목록 필터만 유지.
  function handleSearchEnter() {
    const term = search.trim().toLowerCase()
    if (!term) return
    setSearchOpen(false)
    const matches = locationScopedLots.filter(l =>
      (l.reagents?.name || '').toLowerCase() === term
      || (l.reagents?.cas_no || '').toLowerCase() === term
      || (l.lot_no || '').toLowerCase() === term
    )
    if (matches.length === 1) {
      openComparePanel(matches[0])
    } else if (matches.length > 1) {
      // 같은 시약명인데 Lot이 여러 개라 특정할 수 없음 — 어떤 Lot을 고치는 건지 사용자가 직접 고르게 함
      setCompareLot(null)
      setCompareCandidates(matches)
    } else if (dropdownLots.length === 0) {
      // 부분일치조차 전혀 없음 — 기존 목록에 없는 시약이므로 바로 신규 입력 모드로
      startNewEntry()
    }
  }

  function openComparePanel(lot) {
    setCompareCandidates([])
    setCompareLot(lot)
    setNewEntryMode(false)
    setSearchOpen(false)
    const c = counts[lot.id]
    setSliderDisplay(c?.actual_stock ?? c?.book_stock ?? lot.current_stock)
    // 모바일에서는 이 ref가 화면 아래쪽 잔량 슬라이더라 자동 포커스하면 브라우저가
    // 그 위치로 스크롤해버려 화학물질명 등 위쪽 정보를 못 보고 시작하게 됨 — PC에서만 포커스.
    if (!isMobile) setTimeout(() => { comparePanelInputRef.current?.focus() }, 50)
  }

  function saveComparePanel() {
    if (!compareLot) return
    if (!window.confirm(`'${compareLot.reagents?.name}' 정보를 확인 완료하시겠습니까?`)) return
    const count = counts[compareLot.id]
    const bookStock = count?.book_stock ?? compareLot.current_stock
    const value = comparePanelInputRef.current?.value
    saveStock(compareLot, value !== '' && value != null ? value : bookStock)
    setSavedMsg(true)
    if (savedMsgTimerRef.current) clearTimeout(savedMsgTimerRef.current)
    savedMsgTimerRef.current = setTimeout(() => setSavedMsg(false), 2500)
    setSearch('')
    setDebouncedSearch('')
    setCompareLot(null)
    setSearchOpen(false)
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  // 모바일 입력 화면 전용 — 확인창 없이 바로 저장하고, 지금 보던 목록(진입 당시의
  // 필터/검색 범위인 filteredLots) 안에서 다음 항목으로 자동 이동. 마지막 항목이면
  // 목록 화면으로 돌아간다(PC의 saveComparePanel과 달리 검색어를 지우지 않음 —
  // 같은 검색 결과 안에서 여러 개를 순서대로 처리하는 상황도 있을 수 있어서).
  function saveAndAdvanceMobile(list) {
    if (!compareLot) return
    const count = counts[compareLot.id]
    const bookStock = count?.book_stock ?? compareLot.current_stock
    const value = comparePanelInputRef.current?.value
    saveStock(compareLot, value !== '' && value != null ? value : bookStock)
    const idx = list.findIndex(l => l.id === compareLot.id)
    const next = idx >= 0 ? list[idx + 1] : null
    if (next) {
      openComparePanel(next)
    } else {
      setCompareLot(null)
      setSavedMsg(true)
      if (savedMsgTimerRef.current) clearTimeout(savedMsgTimerRef.current)
      savedMsgTimerRef.current = setTimeout(() => setSavedMsg(false), 2500)
    }
  }

  // 지금 실사 중인 시약장(위치) 하나로 화면을 좁혀서 보는 필터 — 관리자/담당자 구분 없이
  // 누구나 쓸 수 있는, 이 화면 안에서만 적용되는 클라이언트 사이드 보기 필터(구역 배정과는 별개).
  const sessionLocationGroups = {}
  lots.forEach(l => {
    if (!l.location_id || !l.locations) return
    const room = l.locations.room
    if (!sessionLocationGroups[room]) sessionLocationGroups[room] = new Map()
    if (!sessionLocationGroups[room].has(l.location_id)) {
      sessionLocationGroups[room].set(l.location_id, l.locations.detail || l.locations.room)
    }
  })

  // 위치 필터가 걸려 있으면 검색도 그 범위 안에서만 — 지금 서 있는 시약장과 무관한 결과가 뜨지 않게
  const locationScopedLots = locationFilter ? lots.filter(l => l.location_id === locationFilter) : lots

  // 검색창 아래 후보 드롭다운 — 전체 시약 DB가 아니라 이번 실사에 배정된(하단 목록과 같은 범위) Lot 중에서만 찾음
  const dropdownLots = search.trim()
    ? locationScopedLots.filter(l => {
        const term = search.trim().toLowerCase()
        return (l.reagents?.name || '').toLowerCase().includes(term)
          || (l.reagents?.cas_no || '').toLowerCase().includes(term)
          || (l.lot_no || '').toLowerCase().includes(term)
      }).slice(0, 15)
    : []

  // 실제로 병을 무작위로 꺼내며 라벨의 시약명/CAS/Lot 번호 중 뭐가 보이든 그걸로 바로 찾을 수 있어야 하므로
  // 목록 필터링도 셋 다 대상으로 함(디바운스된 검색어 기준, 위치 필터 범위 안에서).
  const searchTerm = debouncedSearch.trim().toLowerCase()
  const filteredLots = locationScopedLots.filter(lot => {
    const matchSearch = !searchTerm
      || (lot.reagents?.name || '').toLowerCase().includes(searchTerm)
      || (lot.reagents?.cas_no || '').toLowerCase().includes(searchTerm)
      || (lot.lot_no || '').toLowerCase().includes(searchTerm)
    const count = counts[lot.id]
    const isDone = count?.actual_stock != null
    if (filter === 'undone' && isDone) return false
    if (filter === 'done' && !isDone) return false
    return matchSearch
  })

  // 범위가 넓은 실사(예: 전체)에서 수백~수천 행을 한꺼번에 그리면 페이지가 멈춘 것처럼 느려짐 —
  // 검색/필터 없이 볼 때는 캡 윈도우(capStart~capStart+RENDER_CAP)만 렌더링.
  // 알파벳 인덱스로 점프하면 전체를 다 풀지 않고 이 윈도우를 대상 근처로 옮긴다(성능 유지).
  const RENDER_CAP = 300
  const isCapped = !searchTerm && filter === 'all' && filteredLots.length > RENDER_CAP
  const cappedStart = Math.min(capStart, Math.max(0, filteredLots.length - RENDER_CAP))
  const visibleLots = isCapped ? filteredLots.slice(cappedStart, cappedStart + RENDER_CAP) : filteredLots

  const doneCnt = lots.filter(l => counts[l.id]?.actual_stock != null).length
  const pct = lots.length > 0 ? Math.round(doneCnt / lots.length * 100) : 0
  // 모바일 목록 화면에서 "내가 확인한 수"를 보여주기 위함 — 여러 명이 동시에 나눠서
  // 실사할 때 "나는 얼마나 했지"를 전체 진행률과 별도로 확인할 수 있게.
  const myDoneCnt = student?.student_id
    ? lots.filter(l => counts[l.id]?.actual_stock != null && counts[l.id]?.counted_by_student_id === student.student_id).length
    : 0

  // 상태 배지: 일치(장부=실측, 초록) / 미입력(회색) / 차이있음(장부≠실측, 빨강)
  function rowStatus(lot) {
    const count = counts[lot.id]
    const isDone = count?.actual_stock != null
    if (!isDone) return 'empty'
    const bookStock = count?.book_stock ?? lot.current_stock
    const stockDiff = Math.abs(count.actual_stock - bookStock)
    return stockDiff !== 0 ? 'diff' : 'ok'
  }
  const STATUS_BADGE = {
    ok:    { label: '일치', bg: '#E8F5E9', color: '#2E7D32' },
    empty: { label: '미입력', bg: '#F1EFE8', color: '#888780' },
    diff:  { label: '차이있음', bg: '#FCEBEB', color: '#791F1F' },
  }

  // 시약 정보 열 — 잔량과 같은 방식으로 Tab/Enter 이동하며 직접입력, 장부값과 다르면 파란 테두리.
  // scope='reagent'면 시약 자체(이름/CAS/회사/성상/용량/단위, 여러 Lot이 공유)를 고치는 거고,
  // scope='lot'이면 이 Lot 고유정보(Cat No./Lot No.)만 고치는 거라 book/staged 스냅샷이 따로 있음.
  function fieldInputCell(lot, idx, field, width = 90, scope = 'reagent') {
    const c = counts[lot.id]
    const isLot = scope === 'lot'
    const book = (isLot ? c?.book_lot_fields : c?.book_reagent_fields) || {}
    const staged = (isLot ? c?.staged_lot_fields : c?.staged_reagent_fields) || {}
    const bookVal = book[field] ?? (isLot ? lot[field] : lot.reagents?.[field]) ?? ''
    const touched = field in staged
    const current = touched ? staged[field] : bookVal
    // volume처럼 장부값이 숫자로 저장된 필드는 입력칸에서 항상 문자열로 들어오므로,
    // 값 자체가 같아도 타입이 달라 "!==" 비교로는 다르다고 잘못 판정됨 — 문자열로 맞춰 비교.
    const differs = touched && String(staged[field] ?? '') !== String(bookVal ?? '')
    const saveFn = isLot ? saveLotField : saveReagentField
    // 지워서 빈 칸으로 두고 넘어가면 "장부값 그대로"로 확인 처리 — 빈 칸일 땐 장부값이
    // 연한 회색 placeholder로 보여서 원래 뭐였는지 알 수 있게 함.
    if (field === 'company') {
      return (
        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <StagedCompanyField
            value={current} bookVal={bookVal} touched={touched} differs={differs} width={width}
            inputRef={el => inputRefs.current[`${field}_${lot.id}`] = el}
            onSave={v => saveFn(lot, field, v)}
            onEnter={() => {
              const nextLot = visibleLots[idx + 1]
              if (nextLot && inputRefs.current[`${field}_${nextLot.id}`]) inputRefs.current[`${field}_${nextLot.id}`].focus()
            }}
          />
        </td>
      )
    }
    return (
      <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <input
          ref={el => inputRefs.current[`${field}_${lot.id}`] = el}
          defaultValue={current}
          placeholder={bookVal}
          onBlur={e => saveFn(lot, field, e.target.value !== '' ? e.target.value : bookVal)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              saveFn(lot, field, e.target.value !== '' ? e.target.value : bookVal)
              const nextLot = visibleLots[idx + 1]
              if (nextLot && inputRefs.current[`${field}_${nextLot.id}`]) inputRefs.current[`${field}_${nextLot.id}`].focus()
            }
          }}
          style={{
            width: `${width}px`, padding: '5px 8px', borderRadius: '6px', fontSize: '12px',
            ...diffCellStyle(touched, differs),
          }}
        />
      </td>
    )
  }

  function renderActionModal() {
    return (
      <ActionModal
        actionModalLot={actionModalLot}
        reportedMissing={actionModalLot ? counts[actionModalLot.id]?.reported_missing : false}
        disposalInfo={actionModalLot ? disposalByLot[actionModalLot.id] : null}
        actionStep={actionStep} setActionStep={setActionStep}
        disposalReasonInput={disposalReasonInput} setDisposalReasonInput={setDisposalReasonInput}
        onClose={closeActionModal}
        onSubmitDisposal={submitDisposalFromModal}
        onSelectMissing={selectMissingFromModal}
        onCancelMissing={cancelMissingFromModal}
      />
    )
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: C.muted }}>불러오는 중...</div>

  // ════════════════════════════════════════════════════════════
  //  모바일 — "한 병씩 처리하는 작업 화면". 전수조사/현재목록 재고실사 두 모드가
  //  똑같은 목록/입력 화면을 쓴다(시작 방식만 다름). 관리 기능(구역/일시중단/최종반영
  //  등)은 PC 전용이라 여기 없음 — compareLot 상태로 목록↔입력 화면을 그대로 오간다.
  // ════════════════════════════════════════════════════════════
  if (isMobile) {
    const mobileSub = `${session.year}년 · ${session.purpose === 'full_census' ? '전수조사' : '현재목록 재고실사'}`

    // ── (c) 신규 미등록 시약 등록 화면 ──
    if (newEntryMode) {
      return (
        <div>
          <PageBanner title="신규 시약 등록" sub={mobileSub} breadcrumb={['홈', '재고 실사', '신규 등록']} />
          <div style={{ padding: '16px 16px 100px' }}>
            <button onClick={cancelNewEntry} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px', marginBottom: '14px' }}>← 취소하고 목록으로</button>
            {newEntryForm.reagent_id ? (
              <div style={{ fontSize: '12.5px', color: '#276749', marginBottom: '14px', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', padding: '10px 12px' }}>
                ✓ "{newEntryForm.name}" — 이미 카탈로그에 있는 시약이에요. 새로 만들지 않고 새 Lot만 추가돼요.
              </div>
            ) : (
              <div style={{ fontSize: '12.5px', color: '#92400E', marginBottom: '14px' }}>
                "{newEntryForm.name}" — 기존 목록에 없는 시약이에요. 정보를 입력하고 등록 완료를 눌러주세요.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div><label style={labelStyle}>화학물질명 *</label>
                <input value={newEntryForm.name} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, name: e.target.value })}
                  style={{ ...inputStyle, minHeight: '44px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
              <div><label style={labelStyle}>순도</label>
                <input value={newEntryForm.purity} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, purity: e.target.value })} placeholder="예: 98%"
                  style={{ ...inputStyle, minHeight: '44px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
              <div><label style={labelStyle}>CAS No.</label>
                <input value={newEntryForm.cas_no} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, cas_no: e.target.value })}
                  style={{ ...inputStyle, minHeight: '44px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
              <div><label style={labelStyle}>회사</label>
                <CompanyPicker value={newEntryForm.company} disabled={!!newEntryForm.reagent_id} onChange={v => setNewEntryForm({ ...newEntryForm, company: v })}
                  style={{ minHeight: '44px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
              <div><label style={labelStyle}>Cat No.</label>
                <input value={newEntryForm.cat_no} onChange={e => setNewEntryForm({ ...newEntryForm, cat_no: e.target.value })} style={{ ...inputStyle, minHeight: '44px' }} /></div>
              <div><label style={labelStyle}>Lot No.</label>
                <input value={newEntryForm.lot_no} onChange={e => setNewEntryForm({ ...newEntryForm, lot_no: e.target.value })} style={{ ...inputStyle, minHeight: '44px' }} /></div>
              <div><label style={labelStyle}>성상</label>
                <input value={newEntryForm.category} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, category: e.target.value })}
                  style={{ ...inputStyle, minHeight: '44px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
              <div>
                <label style={labelStyle}>규격</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input value={newEntryForm.volume} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, volume: e.target.value })} placeholder="용량"
                    style={{ ...inputStyle, flex: 1, minHeight: '44px', background: newEntryForm.reagent_id ? C.bg : C.white }} />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['mL', 'L', 'g', 'kg'].map(u => (
                      <button key={u} type="button" disabled={!!newEntryForm.reagent_id} onClick={() => setNewEntryForm({ ...newEntryForm, unit: u })} style={{
                        padding: '10px 12px', borderRadius: '8px', fontSize: '13px', minHeight: '44px',
                        border: `1px solid ${newEntryForm.unit === u ? '#1565C0' : C.border}`,
                        background: newEntryForm.unit === u ? '#EAF1FB' : C.white,
                        color: newEntryForm.unit === u ? '#1565C0' : C.text, fontWeight: newEntryForm.unit === u ? '700' : '400',
                      }}>{u}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div><label style={labelStyle}>위치 *</label>
                <select value={newEntryForm.location_id} onChange={e => setNewEntryForm({ ...newEntryForm, location_id: e.target.value })} style={{ ...inputStyle, minHeight: '44px' }}>
                  <option value="">선택하세요</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                </select></div>
              <div>
                <label style={labelStyle}>잔량(%)</label>
                <input type="range" min="0" max="100" step="10" value={newEntryForm.current_stock}
                  onChange={e => setNewEntryForm({ ...newEntryForm, current_stock: e.target.value })}
                  style={{ width: '100%', accentColor: '#1565C0' }} />
                <div style={{ fontSize: '13px', fontWeight: '700', color: C.navy, textAlign: 'center' }}>{newEntryForm.current_stock}%</div>
              </div>
              <div><label style={labelStyle}>비고</label>
                <input value={newEntryForm.abnormal_note} onChange={e => setNewEntryForm({ ...newEntryForm, abnormal_note: e.target.value })} placeholder="메모" style={{ ...inputStyle, minHeight: '44px' }} /></div>
            </div>
            <button onClick={submitInlineNewReagent} style={{ ...btnPrimary, width: '100%', minHeight: '48px', fontSize: '15px', marginTop: '20px' }}>🆕 등록 완료</button>
          </div>
        </div>
      )
    }

    // ── (b) 입력 화면(한 병씩 확인) ──
    if (compareLot || compareCandidates.length > 0) {
      const count = compareLot ? counts[compareLot.id] : null
      const bookStock = compareLot ? (count?.book_stock ?? compareLot.current_stock) : null
      const book = count?.book_reagent_fields || {}
      const staged = count?.staged_reagent_fields || {}
      const unitBookVal = book['unit'] ?? compareLot?.reagents?.unit ?? ''
      const unitTouched = 'unit' in staged
      const unitCurrent = unitTouched ? staged['unit'] : unitBookVal
      const volBookVal = book['volume'] ?? compareLot?.reagents?.volume ?? ''
      const volTouched = 'volume' in staged
      const volDiffers = volTouched && String(staged['volume'] ?? '') !== String(volBookVal ?? '')
      const locTouched = count?.staged_location_id !== undefined && count?.staged_location_id !== null
      const locBookId = count?.book_location_id ?? compareLot?.location_id ?? ''
      const locDiffers = locTouched && count.staged_location_id !== locBookId

      function mField(field, label, scope = 'reagent', placeholder) {
        const isLot = scope === 'lot'
        const b = isLot ? (count?.book_lot_fields || {}) : book
        const st = isLot ? (count?.staged_lot_fields || {}) : staged
        const bookVal = b[field] ?? (isLot ? compareLot[field] : compareLot.reagents?.[field]) ?? ''
        const touched = field in st
        const current = touched ? st[field] : bookVal
        const differs = touched && String(st[field] ?? '') !== String(bookVal ?? '')
        const saveFn = isLot ? saveLotField : saveReagentField
        if (field === 'company') {
          return (
            <div key={field}><label style={labelStyle}>{label}</label>
              <StagedCompanyField value={current} bookVal={bookVal} touched={touched} differs={differs}
                baseStyle={{ ...inputStyle, minHeight: '44px' }} onSave={v => saveFn(compareLot, field, v)} />
            </div>
          )
        }
        return (
          <div key={field}><label style={labelStyle}>{label}</label>
            <input defaultValue={current} placeholder={placeholder ?? bookVal}
              onBlur={e => saveFn(compareLot, field, e.target.value !== '' ? e.target.value : bookVal)}
              style={{ ...inputStyle, minHeight: '44px', ...diffCellStyle(touched, differs) }} />
          </div>
        )
      }

      return (
        <div>
          <PageBanner title="실사 입력" sub={mobileSub} breadcrumb={['홈', '재고 실사', '실사 입력']} />
          <div style={{ padding: '16px 16px 100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <button onClick={() => { setCompareLot(null); setCompareCandidates([]) }} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>← 목록으로</button>
              <span style={{ fontSize: '12.5px', color: C.muted }}>완료 {doneCnt} / {lots.length}</span>
            </div>

            {compareCandidates.length > 0 ? (
              <div>
                <div style={{ fontSize: '12.5px', color: '#92400E', marginBottom: '10px' }}>
                  같은 이름으로 등록된 Lot이 {compareCandidates.length}개예요 — 어떤 Lot을 확인할지 골라주세요.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {compareCandidates.map(c => (
                    <div key={c.id} onClick={() => openComparePanel(c)} style={{ padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: '10px', fontSize: '13.5px', minHeight: '44px' }}>
                      <div>Lot {c.lot_no || '(번호 없음)'}</div>
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                        {c.locations?.room || '-'}{c.locations?.detail ? ` · ${c.locations.detail}` : ''} · 장부 잔량 {counts[c.id]?.book_stock ?? c.current_stock}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '16px', fontWeight: '700', color: C.navy, marginBottom: '2px' }}>{compareLot.reagents?.name}</div>
                <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>
                  {compareLot.locations?.room || '-'}{compareLot.locations?.detail ? ` · ${compareLot.locations.detail}` : ''}{compareLot.lot_no ? ` · Lot ${compareLot.lot_no}` : ''}
                </div>
                {disposalByLot[compareLot.id] ? (
                  <button onClick={() => openActionModal(compareLot)} style={{ ...smallBtnStyle(), background: C.dangerTint, borderColor: '#F3D6D6', color: C.dangerDark, marginBottom: '14px' }}>폐기신청됨</button>
                ) : count?.reported_missing ? (
                  <button onClick={() => openActionModal(compareLot)} style={{ ...smallBtnStyle(), background: '#FFF3E0', borderColor: '#FFCC80', color: '#E65100', marginBottom: '14px' }}>위치 내 미확인</button>
                ) : (
                  <button onClick={() => openActionModal(compareLot)} style={{ ...smallBtnStyle(), marginBottom: '14px' }}>⚠️ 기타조치(폐기신청/미확인)</button>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {mField('name', '화학물질명')}
                  {mField('purity', '순도', 'reagent', '예: 98%')}
                  {mField('cas_no', 'CAS No.')}
                  {mField('company', '회사')}
                  {mField('cat_no', 'Cat No.', 'lot')}
                  {mField('lot_no', 'Lot No.', 'lot')}
                  {mField('category', '성상')}
                  <div>
                    <label style={labelStyle}>규격</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input defaultValue={volTouched ? staged['volume'] : volBookVal} placeholder={volBookVal}
                        onBlur={e => saveReagentField(compareLot, 'volume', e.target.value !== '' ? e.target.value : volBookVal)}
                        style={{ ...inputStyle, flex: 1, minHeight: '44px', ...diffCellStyle(volTouched, volDiffers) }} />
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['mL', 'L', 'g', 'kg'].map(u => (
                          <button key={u} type="button" onClick={() => saveReagentField(compareLot, 'unit', u)} style={{
                            padding: '10px 12px', borderRadius: '8px', fontSize: '13px', minHeight: '44px',
                            border: `1px solid ${unitCurrent === u ? '#1565C0' : C.border}`,
                            background: unitCurrent === u ? '#EAF1FB' : C.white,
                            color: unitCurrent === u ? '#1565C0' : C.text, fontWeight: unitCurrent === u ? '700' : '400',
                          }}>{u}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>위치</label>
                    <select value={count?.staged_location_id ?? compareLot.location_id ?? ''} onChange={e => changeLocation(compareLot, e.target.value)}
                      style={{ ...inputStyle, minHeight: '44px', ...diffCellStyle(locTouched, locDiffers) }}>
                      <option value="">(위치 없음)</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>잔량(%)</label>
                    <div style={{ padding: '10px 12px', borderRadius: '10px', ...diffCellStyle(count?.actual_stock != null, count?.actual_stock != null && count.actual_stock !== bookStock) }}>
                      <input key={compareLot.id} ref={comparePanelInputRef} type="range" min="0" max="100" step="10"
                        defaultValue={count?.actual_stock ?? bookStock}
                        onInput={e => setSliderDisplay(Number(e.target.value))}
                        style={{ width: '100%', accentColor: '#1565C0' }} />
                      <div style={{ fontSize: '15px', fontWeight: '700', color: C.navy, textAlign: 'center' }}>{sliderDisplay ?? (count?.actual_stock ?? bookStock)}%</div>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>비고</label>
                    <input defaultValue={count?.abnormal_note || ''} placeholder="메모" onBlur={e => saveAbnormalNote(compareLot, e.target.value)} style={{ ...inputStyle, minHeight: '44px' }} />
                  </div>
                </div>
              </>
            )}
          </div>

          {compareLot && compareCandidates.length === 0 && (
            <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '10px 16px', background: C.white, borderTop: `1px solid ${C.border}`, boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' }}>
              <button onClick={() => saveAndAdvanceMobile(filteredLots)} style={{ ...btnPrimary, width: '100%', minHeight: '48px', fontSize: '15px' }}>저장 및 다음</button>
            </div>
          )}
          {renderActionModal()}
        </div>
      )
    }

    // ── (a) 목록 화면 ──
    const mobileCapped = filteredLots.length > RENDER_CAP
    const mobileVisible = mobileCapped ? filteredLots.slice(0, capStart + RENDER_CAP) : filteredLots
    return (
      <div>
        <PageBanner title="실사 입력" sub={mobileSub} breadcrumb={['홈', '재고 실사', '실사 입력']} />
        <div style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <button onClick={onBack} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>← 재고실사로</button>
          </div>

          {savedMsg && (
            <div style={{ fontSize: '13px', color: '#2E7D32', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
              ✓ 저장되었습니다 — 목록의 마지막 항목이에요
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12.5px' }}>
              <span style={{ color: C.muted }}>전체 진행률{myDoneCnt > 0 ? ` · 내가 확인 ${myDoneCnt}개` : ''}</span>
              <span style={{ fontWeight: '700', color: C.navy }}>{doneCnt} / {lots.length}개 ({pct}%)</span>
            </div>
            <div style={{ height: '8px', background: C.bg, borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '4px', background: pct === 100 ? '#38A169' : C.navy, width: `${pct}%`, transition: 'width 0.2s' }} />
            </div>
          </div>

          <div ref={searchBoxRef} style={{ position: 'relative', marginBottom: '14px' }}>
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setCompareLot(null); setCompareCandidates([]); setNewEntryMode(false); setSearchOpen(true) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEnter(); e.target.blur() } }}
              placeholder="시약명 / CAS / Lot No. 검색"
              style={{ ...inputStyle, minHeight: '44px', fontSize: '14px' }}
            />
            {searchOpen && search.trim() && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', overflowY: 'auto',
              }}>
                {dropdownLots.length > 0 ? dropdownLots.map(lot => {
                  const s = STATUS_BADGE[rowStatus(lot)]
                  return (
                    <div key={lot.id} onClick={() => openComparePanel(lot)}
                      style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '44px' }}>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: '600', color: C.navy }}>{lot.reagents?.name}</div>
                        <div style={{ fontSize: '11px', color: C.muted }}>
                          Lot {lot.lot_no || '(번호 없음)'} · {lot.locations?.room || '-'}{lot.locations?.detail ? ` · ${lot.locations.detail}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '12px', fontWeight: '700', background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                  )
                }) : (
                  <div onClick={startNewEntry} style={{ padding: '14px', cursor: 'pointer', fontSize: '13px', color: '#92400E', minHeight: '44px' }}>
                    "{search.trim()}" 기존 목록에 없습니다 — 눌러서 신규 등록하기
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            {[['undone', `미완료 ${lots.length - doneCnt}`], ['done', `완료 ${doneCnt}`]].map(([key, label]) => (
              <button key={key} onClick={() => { setFilter(key); setCapStart(0) }} style={{
                flex: 1, padding: '10px 8px', borderRadius: '10px', minHeight: '44px', cursor: 'pointer',
                border: `1.5px solid ${filter === key ? C.navy : C.border}`,
                background: filter === key ? C.bg : C.white,
                fontSize: '13.5px', fontWeight: filter === key ? '700' : '500',
                color: filter === key ? C.navy : C.muted,
              }}>{label}</button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {mobileVisible.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>해당하는 항목이 없습니다.</div>
            ) : mobileVisible.map(lot => {
              const c = counts[lot.id]
              const isDone = c?.actual_stock != null
              return (
                <div key={lot.id} onClick={() => openComparePanel(lot)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                    padding: '12px 14px', minHeight: '44px', background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', cursor: 'pointer',
                  }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '600', color: C.navy }}>
                      {lot.reagents?.name}{lot.reagents?.purity ? ` (${lot.reagents.purity})` : ''}
                    </div>
                    <div style={{ fontSize: '11.5px', color: C.muted, marginTop: '2px' }}>
                      {lot.locations?.room || '-'}{lot.locations?.detail ? ` · ${lot.locations.detail}` : ''}
                      {lot.lot_no ? ` · Lot ${lot.lot_no}` : ''}
                    </div>
                  </div>
                  {isDone && <span style={{ fontSize: '16px', color: '#38A169' }}>✓</span>}
                </div>
              )
            })}
          </div>

          {mobileCapped && (
            <button onClick={() => setCapStart(capStart + RENDER_CAP)} style={{ ...btnGhost, width: '100%', minHeight: '44px', marginTop: '12px' }}>
              더 보기 ({mobileVisible.length} / {filteredLots.length})
            </button>
          )}
        </div>
        {renderActionModal()}
      </div>
    )
  }

  return (
    <div>
      <PageBanner title="실사 입력" sub={`${session.year}년 재고 실사 · ${myName}`} breadcrumb={['홈', '재고 실사', '실사 입력']} />

      <div style={{ padding: '20px 40px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
          <button onClick={onBack} style={{ ...btnGhost, padding: '8px 14px', fontSize: '13px' }}>← 뒤로</button>
        </div>

        {/* ── ① 검색 & 대조/수정 영역 (상단) ── */}
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
          <div ref={searchBoxRef} style={{ position: 'relative' }}>
            <input
              ref={searchInputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setCompareLot(null); setCompareCandidates([]); setNewEntryMode(false); setSearchOpen(true) }}
              onFocus={() => { if (search.trim()) setSearchOpen(true) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchEnter() } }}
              placeholder="시약명 / CAS / Lot No. 검색 후 Enter"
              style={{ ...inputStyle, fontSize: '14px', padding: '9px 12px' }}
            />
            {searchOpen && search.trim() && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', overflowY: 'auto',
              }}>
                {dropdownLots.length > 0 ? dropdownLots.map(lot => {
                  const s = STATUS_BADGE[rowStatus(lot)]
                  return (
                    <div key={lot.id} onClick={() => openComparePanel(lot)}
                      style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = C.white}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: C.navy }}>{lot.reagents?.name}</div>
                        <div style={{ fontSize: '11px', color: C.muted }}>
                          Lot {lot.lot_no || '(번호 없음)'} · {lot.locations?.room || '-'}{lot.locations?.detail ? ` · ${lot.locations.detail}` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '12px', fontWeight: '700', background: s.bg, color: s.color }}>{s.label}</span>
                    </div>
                  )
                }) : (
                  <div onClick={startNewEntry} style={{ padding: '12px 14px', cursor: 'pointer', fontSize: '13px', color: '#92400E' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FFF8E7'}
                    onMouseLeave={e => e.currentTarget.style.background = C.white}>
                    "{search.trim()}" 기존 목록에 없습니다 — 클릭해서 신규 등록하기
                  </div>
                )}
              </div>
            )}
          </div>
          {savedMsg && <div style={{ fontSize: '12px', color: '#2E7D32', marginTop: '8px' }}>✓ 수정되었습니다 · 다음 시약으로 이동</div>}

          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '12px', paddingTop: '12px' }}>
            {compareCandidates.length > 0 ? (
              <div>
                <div style={{ fontSize: '12.5px', color: '#92400E', marginBottom: '8px' }}>
                  같은 이름으로 등록된 Lot이 {compareCandidates.length}개예요 — 어떤 Lot을 확인/수정할지 골라주세요.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {compareCandidates.map(c => (
                    <div key={c.id} onClick={() => openComparePanel(c)}
                      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span>Lot {c.lot_no || '(번호 없음)'} · {c.locations?.room || '-'}{c.locations?.detail ? ` · ${c.locations.detail}` : ''}</span>
                      <span style={{ color: C.muted }}>장부 잔량 {counts[c.id]?.book_stock ?? c.current_stock}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : newEntryMode ? (
              <>
                {newEntryForm.reagent_id ? (
                  <div style={{ fontSize: '12.5px', color: '#276749', marginBottom: '10px', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', padding: '8px 12px' }}>
                    ✓ "{newEntryForm.name}" — 이미 카탈로그에 있는 시약이에요. 새로 만들지 않고 이 시약에 새 Lot만 추가돼요(기본 정보는 카탈로그 값을 그대로 씀).
                  </div>
                ) : (
                  <div style={{ fontSize: '12.5px', color: '#92400E', marginBottom: '10px' }}>
                    "{newEntryForm.name}" — 기존 목록에 없는 시약이에요. 정보를 입력하고 등록 완료를 누르세요.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 16px', fontSize: '13px' }}>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>화학물질명 *</div>
                    <input value={newEntryForm.name} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, name: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>순도</div>
                    <input value={newEntryForm.purity} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, purity: e.target.value })} placeholder="예: 98%"
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>CAS No.</div>
                    <input value={newEntryForm.cas_no} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, cas_no: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>회사</div>
                    <CompanyPicker value={newEntryForm.company} disabled={!!newEntryForm.reagent_id} onChange={v => setNewEntryForm({ ...newEntryForm, company: v })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>Cat No.</div>
                    <input value={newEntryForm.cat_no} onChange={e => setNewEntryForm({ ...newEntryForm, cat_no: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>Lot No.</div>
                    <input value={newEntryForm.lot_no} onChange={e => setNewEntryForm({ ...newEntryForm, lot_no: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }} /></div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>성상</div>
                    <input value={newEntryForm.category} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, category: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: newEntryForm.reagent_id ? C.bg : C.white }} /></div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted }}>규격</div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '2px', alignItems: 'center' }}>
                      <input value={newEntryForm.volume} disabled={!!newEntryForm.reagent_id} onChange={e => setNewEntryForm({ ...newEntryForm, volume: e.target.value })} placeholder="용량"
                        style={{ ...inputStyle, width: '60px', padding: '5px 8px', fontSize: '13px', background: newEntryForm.reagent_id ? C.bg : C.white }} />
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {['mL', 'L', 'g', 'kg'].map(u => (
                          <button key={u} type="button" disabled={!!newEntryForm.reagent_id} onClick={() => setNewEntryForm({ ...newEntryForm, unit: u })} style={{
                            padding: '5px 7px', borderRadius: '6px', fontSize: '11px', cursor: newEntryForm.reagent_id ? 'default' : 'pointer',
                            border: `1px solid ${newEntryForm.unit === u ? '#1565C0' : C.border}`,
                            background: newEntryForm.unit === u ? '#EAF1FB' : C.white,
                            color: newEntryForm.unit === u ? '#1565C0' : C.text, fontWeight: newEntryForm.unit === u ? '700' : '400',
                          }}>{u}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted }}>위치 *</div>
                    <select value={newEntryForm.location_id} onChange={e => setNewEntryForm({ ...newEntryForm, location_id: e.target.value })}
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px' }}>
                      <option value="">선택하세요</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: C.muted }}>잔량(%)</div>
                    <input type="range" min="0" max="100" step="10" value={newEntryForm.current_stock}
                      onChange={e => setNewEntryForm({ ...newEntryForm, current_stock: e.target.value })}
                      style={{ width: '90px', marginTop: '4px', accentColor: '#1565C0' }} />
                    <div style={{ fontSize: '12px', fontWeight: '700', color: C.navy, textAlign: 'center' }}>{newEntryForm.current_stock}%</div>
                  </div>
                  <div><div style={{ fontSize: '11px', color: C.muted }}>비고</div>
                    <input value={newEntryForm.abnormal_note} onChange={e => setNewEntryForm({ ...newEntryForm, abnormal_note: e.target.value })} placeholder="메모"
                      style={{ ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '12px' }} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                  <button onClick={cancelNewEntry} style={{ ...btnGhost, padding: '7px 16px', fontSize: '13px' }}>취소</button>
                  <button onClick={submitInlineNewReagent} style={{ ...btnPrimary, padding: '7px 16px', fontSize: '13px' }}>🆕 등록 완료</button>
                </div>
              </>
            ) : (() => {
              const count = compareLot ? counts[compareLot.id] : null
              const bookStock = compareLot ? (count?.book_stock ?? compareLot.current_stock) : null
              const book = count?.book_reagent_fields || {}
              const staged = count?.staged_reagent_fields || {}
              const disabledBoxStyle = { ...inputStyle, padding: '5px 8px', marginTop: '2px', fontSize: '13px', background: C.bg, color: C.muted }

              // 시약명/CAS/회사도 실측값처럼 담당자가 직접 확인해서 고칠 수 있는 입력칸으로 표시(단, "-" 텍스트가 아니라 네모 입력칸)
              function panelMasterField(field, width, scope = 'reagent') {
                if (!compareLot) return <input disabled placeholder="-" style={{ ...disabledBoxStyle, width: `${width}px` }} />
                const isLot = scope === 'lot'
                const b = isLot ? (count?.book_lot_fields || {}) : book
                const st = isLot ? (count?.staged_lot_fields || {}) : staged
                const bookVal = b[field] ?? (isLot ? compareLot[field] : compareLot.reagents?.[field]) ?? ''
                const touched = field in st
                const current = touched ? st[field] : bookVal
                const differs = touched && String(st[field] ?? '') !== String(bookVal ?? '')
                const saveFn = isLot ? saveLotField : saveReagentField
                if (field === 'company') {
                  return (
                    <StagedCompanyField
                      key={`${compareLot.id}_${field}`}
                      value={current} bookVal={bookVal} touched={touched} differs={differs} width={width}
                      baseStyle={{ ...inputStyle, marginTop: '2px' }}
                      onSave={v => saveFn(compareLot, field, v)}
                    />
                  )
                }
                return (
                  <input key={`${compareLot.id}_${field}`} defaultValue={current} placeholder={bookVal}
                    onBlur={e => saveFn(compareLot, field, e.target.value !== '' ? e.target.value : bookVal)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveFn(compareLot, field, e.target.value !== '' ? e.target.value : bookVal) } }}
                    style={{ ...inputStyle, width: `${width}px`, padding: '5px 8px', marginTop: '2px', fontSize: '13px', ...diffCellStyle(touched, differs) }} />
                )
              }

              const unitBookVal = book['unit'] ?? compareLot?.reagents?.unit ?? ''
              const unitTouched = 'unit' in staged
              const unitCurrent = unitTouched ? staged['unit'] : unitBookVal

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px 16px', fontSize: '13px' }}>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>화학물질명</div>{panelMasterField('name', 150)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>순도</div>{panelMasterField('purity', 90)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>CAS No.</div>{panelMasterField('cas_no', 120)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>회사</div>{panelMasterField('company', 120)}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>Cat No.</div>{panelMasterField('cat_no', 100, 'lot')}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>Lot No.</div>{panelMasterField('lot_no', 100, 'lot')}</div>
                    <div><div style={{ fontSize: '11px', color: C.muted }}>성상</div>{panelMasterField('category', 100)}</div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>규격</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px', alignItems: 'center' }}>
                        {panelMasterField('volume', 55)}
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {['mL', 'L', 'g', 'kg'].map(u => (
                            <button key={u} type="button" disabled={!compareLot} onClick={() => saveReagentField(compareLot, 'unit', u)} style={{
                              padding: '5px 7px', borderRadius: '6px', fontSize: '11px', cursor: compareLot ? 'pointer' : 'default',
                              border: `1px solid ${unitCurrent === u ? '#1565C0' : C.border}`,
                              background: unitCurrent === u ? '#EAF1FB' : C.white,
                              color: unitCurrent === u ? '#1565C0' : C.text, fontWeight: unitCurrent === u ? '700' : '400',
                            }}>{u}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>위치</div>
                      {compareLot ? (() => {
                        const locTouched = counts[compareLot.id]?.staged_location_id !== undefined && counts[compareLot.id]?.staged_location_id !== null
                        const locBookId = counts[compareLot.id]?.book_location_id ?? compareLot.location_id ?? ''
                        const locDiffers = locTouched && counts[compareLot.id].staged_location_id !== locBookId
                        return (
                          <select value={counts[compareLot.id]?.staged_location_id ?? compareLot.location_id ?? ''} onChange={e => changeLocation(compareLot, e.target.value)}
                            style={{ ...inputStyle, width: '140px', padding: '5px 8px', marginTop: '2px', fontSize: '13px', ...diffCellStyle(locTouched, locDiffers) }}>
                            <option value="">(위치 없음)</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                          </select>
                        )
                      })() : (
                        <select disabled style={{ ...disabledBoxStyle, width: '140px' }}><option>-</option></select>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>잔량(%)</div>
                      {compareLot ? (
                        <div style={{
                          width: '100px', marginTop: '2px', padding: '4px 8px', borderRadius: '8px',
                          ...diffCellStyle(count?.actual_stock != null, count?.actual_stock != null && count.actual_stock !== bookStock),
                        }}>
                          <input key={compareLot.id} ref={comparePanelInputRef} type="range" min="0" max="100" step="10"
                            defaultValue={count?.actual_stock ?? bookStock}
                            onInput={e => setSliderDisplay(Number(e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); completeButtonRef.current?.focus() } }}
                            style={{ width: '100%', accentColor: '#1565C0' }} />
                          <div style={{ fontSize: '12px', fontWeight: '700', color: C.navy, textAlign: 'center' }}>{sliderDisplay ?? (count?.actual_stock ?? bookStock)}%</div>
                        </div>
                      ) : (
                        <input disabled placeholder="-" style={{ ...disabledBoxStyle, width: '80px' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: C.muted }}>비고</div>
                      {compareLot ? (
                        <input defaultValue={count?.abnormal_note || ''} placeholder="메모"
                          onBlur={e => saveAbnormalNote(compareLot, e.target.value)}
                          style={{ ...inputStyle, width: '140px', padding: '5px 8px', marginTop: '2px', fontSize: '12px' }} />
                      ) : (
                        <input disabled placeholder="-" style={{ ...disabledBoxStyle, width: '140px' }} />
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
                    <button ref={completeButtonRef} onClick={saveComparePanel} disabled={!compareLot} style={{ ...btnPrimary, padding: '7px 16px', fontSize: '13px', opacity: compareLot ? 1 : 0.4, cursor: compareLot ? 'pointer' : 'default' }}>완료</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>

        {/* ── ② 진행률 · 필터 · 목록 영역 ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>전체 구역</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '18px', fontWeight: '700', color: C.navy }}>{doneCnt} / {lots.length}</span>
              <span style={{ fontSize: '12px', color: C.muted }}>완료 ({pct}%)</span>
            </div>
            <div style={{ height: '6px', background: C.bg, borderRadius: '3px', overflow: 'hidden', marginTop: '6px', width: '220px' }}>
              <div style={{ height: '100%', borderRadius: '3px', background: pct === 100 ? '#38A169' : C.navy, width: `${pct}%`, transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${C.border}` }}>
              {[['all', '전체'], ['done', '완료'], ['undone', '미완료']].map(([key, label]) => (
                <button key={key} onClick={() => { setFilter(key); setCapStart(0) }} style={{
                  padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: '13px', fontFamily: 'inherit', fontWeight: filter === key ? 700 : 500,
                  color: filter === key ? C.blueDark : C.muted,
                  borderBottom: filter === key ? `2px solid ${C.blue}` : '2px solid transparent',
                  marginBottom: '-1px', whiteSpace: 'nowrap',
                }}>{label}</button>
              ))}
            </div>
            {Object.keys(sessionLocationGroups).length > 0 && (
              <select value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setCapStart(0) }}
                style={{ ...inputStyle, width: 'auto', maxWidth: '190px' }}>
                <option value="">📍 전체 위치</option>
                {Object.entries(sessionLocationGroups).map(([room, locMap]) => (
                  <optgroup key={room} label={room}>
                    {[...locMap.entries()].map(([locId, label]) => (
                      <option key={locId} value={locId}>{label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>
          {searchTerm && (
            <span style={{ fontSize: '12px', color: C.muted }}>
              "{debouncedSearch.trim()}" 검색 결과 <b style={{ color: C.blue }}>{filteredLots.length}건</b>{' '}
              <button onClick={() => { setSearch(''); setDebouncedSearch(''); setCompareLot(null); setCompareCandidates([]); setNewEntryMode(false); setSearchOpen(false) }}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}>✕ 초기화</button>
            </span>
          )}
        </div>

        {isAdmin && (
          <NewRegistrationSummary session={session} />
        )}

        {session.purpose === 'full_census' ? (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflow: 'hidden' }}>
            {visibleLots.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: C.muted }}>해당하는 항목이 없습니다.</div>
            ) : visibleLots.map(lot => {
              const count = counts[lot.id]
              const s = STATUS_BADGE[rowStatus(lot)]
              const displayLocation = count?.staged_location_id
                ? locations.find(l => l.id === count.staged_location_id)
                : lot.locations
              return (
                <div key={lot.id} ref={el => rowRefs.current[lot.id] = el} onClick={() => openComparePanel(lot)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: '600', color: C.navy }}>
                      {lot.reagents?.name}{lot.reagents?.purity ? ` (${lot.reagents.purity})` : ''}
                    </div>
                    <div style={{ fontSize: '11.5px', color: C.muted, marginTop: '2px' }}>
                      {displayLocation?.room || '-'}{displayLocation?.detail ? ` · ${displayLocation.detail}` : ''}
                      {lot.lot_no ? ` · Lot ${lot.lot_no}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '12px', fontWeight: '700', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '18px', alignItems: 'center', marginBottom: '10px', fontSize: '12px', color: C.muted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '13px', height: '13px', borderRadius: '4px', border: `2px solid ${C.border}` }} />
                회색 테두리: 아직 확인 안 함
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '13px', height: '13px', borderRadius: '4px', border: '2px solid #1565C0', background: '#EAF1FB' }} />
                파란색 테두리: 장부값과 일치 확인됨
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '13px', height: '13px', borderRadius: '4px', border: `2px solid ${C.danger}`, background: C.dangerTint }} />
                빨강 테두리: 장부값과 차이 있음 — 실제 값으로 고쳐졌어요
              </span>
              <span style={{ fontWeight: '600', color: C.navy }}>💡 병을 확인했는데 숫자가 맞으면 아무것도 고치지 말고 Enter만 누르세요. 그대로 저장되고 다음 항목으로 넘어갑니다.</span>
            </div>

            {isCapped && (
          <div style={{ background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#92400E' }}>
            ⚠️ 범위가 넓어 {filteredLots.length}개 중 {cappedStart + 1}~{cappedStart + visibleLots.length}번째만 표시하고 있어요. 오른쪽 알파벳 인덱스로 이동하거나, 검색·"완료"/"미완료" 탭을 사용하세요.
          </div>
        )}

        {/* ── 테이블 + 알파벳 인덱스 ── */}
        {/* 시약 목록 화면과 행 높이를 맞추기 위해 이 표 안의 셀/입력칸 패딩만 좁게(className으로 스코프) */}
        <style>{`
          .inv-count-table td { padding: 4px 8px !important; }
          .inv-count-table input, .inv-count-table select { padding: 3px 6px !important; margin-top: 0 !important; font-size: 12.5px !important; }
        `}</style>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, background: C.white, border: `1px solid ${C.border}`, borderRadius: '10px', overflowX: 'auto', overflowY: 'hidden' }}>
            <table className="inv-count-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>화학물질명</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>순도</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>CAS No.</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>회사</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Cat No.</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>Lot No.</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>성상</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }} colSpan={2}>규격</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>위치</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>잔량(%)</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>비고</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>{isAdmin ? '입력자' : '입력일'}</th>
                  <th style={{ ...thStyle, whiteSpace: 'nowrap' }}>조치</th>
                </tr>
              </thead>
              <tbody>
                {visibleLots.length === 0
                  ? <tr><td colSpan={14} style={{ padding: '32px', textAlign: 'center', color: C.muted }}>해당하는 항목이 없습니다.</td></tr>
                  : visibleLots.map((lot, idx) => {
                    const count = counts[lot.id]
                    const bookStock = count?.book_stock ?? lot.current_stock
                    const actualStock = count?.actual_stock
                    const isDone = actualStock != null
                    const hasStockDiff = actualStock != null && actualStock !== bookStock
                    const isSavingNow = saving[lot.id]
                    const rowBg = count?.reported_missing ? '#FFF3E0' : hasStockDiff ? '#FFF8F8' : isDone ? '#F0FFF4' : C.white

                    const nameBookVal = count?.book_reagent_fields?.name ?? lot.reagents?.name ?? ''
                    const nameTouched = !!count?.staged_reagent_fields && 'name' in count.staged_reagent_fields
                    const nameDiffers = nameTouched && count.staged_reagent_fields.name !== nameBookVal

                    return (
                      <tr key={lot.id} ref={el => rowRefs.current[lot.id] = el}
                        style={{ background: rowBg }}>
                        <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <input
                              ref={el => inputRefs.current[`name_${lot.id}`] = el}
                              defaultValue={nameTouched ? count.staged_reagent_fields.name : nameBookVal}
                              placeholder={nameBookVal}
                              onBlur={e => saveReagentField(lot, 'name', e.target.value !== '' ? e.target.value : nameBookVal)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  saveReagentField(lot, 'name', e.target.value !== '' ? e.target.value : nameBookVal)
                                  const nextLot = visibleLots[idx + 1]
                                  if (nextLot && inputRefs.current[`name_${nextLot.id}`]) inputRefs.current[`name_${nextLot.id}`].focus()
                                }
                              }}
                              style={{
                                width: '150px', padding: '5px 8px', borderRadius: '6px', fontWeight: '600', color: C.navy,
                                fontSize: '13px', ...diffCellStyle(nameTouched, nameDiffers),
                              }}
                            />
                          </div>
                        </td>
                        {fieldInputCell(lot, idx, 'purity', 70)}
                        {fieldInputCell(lot, idx, 'cas_no', 100)}
                        {fieldInputCell(lot, idx, 'company', 100)}
                        {fieldInputCell(lot, idx, 'cat_no', 90, 'lot')}
                        {fieldInputCell(lot, idx, 'lot_no', 90, 'lot')}
                        {fieldInputCell(lot, idx, 'category', 80)}
                        {fieldInputCell(lot, idx, 'volume', 55)}
                        {fieldInputCell(lot, idx, 'unit', 50)}
                        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          {(() => {
                            const locTouched = counts[lot.id]?.staged_location_id !== undefined && counts[lot.id]?.staged_location_id !== null
                            const locBookId = counts[lot.id]?.book_location_id ?? lot.location_id ?? ''
                            const locDiffers = locTouched && counts[lot.id].staged_location_id !== locBookId
                            return (
                              <select value={counts[lot.id]?.staged_location_id ?? lot.location_id ?? ''} onChange={e => changeLocation(lot, e.target.value)}
                                style={{ fontSize: '11px', padding: '4px 6px', borderRadius: '6px', maxWidth: '130px', ...diffCellStyle(locTouched, locDiffers) }}>
                                <option value="">(위치 없음)</option>
                                {locations.map(l => <option key={l.id} value={l.id}>{l.room}{l.detail ? ' - ' + l.detail : ''}</option>)}
                              </select>
                            )
                          })()}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <input
                            key={`stock_${lot.id}_${actualStock ?? 'x'}`}
                            ref={el => inputRefs.current[`stock_${lot.id}`] = el}
                            type="number" min="0" max="100"
                            defaultValue={actualStock ?? bookStock}
                            placeholder={String(bookStock)}
                            onBlur={e => saveStock(lot, e.target.value !== '' ? e.target.value : bookStock)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); confirmRow(lot, idx, visibleLots, bookStock) }
                            }}
                            style={{
                              width: '72px', padding: '5px 8px', borderRadius: '6px', textAlign: 'center',
                              fontSize: '14px', fontWeight: '600',
                              ...(isDone ? diffCellStyle(true, hasStockDiff) : { border: `2px solid ${C.border}`, background: C.white }),
                              ...(isSavingNow ? { background: '#FFF8E7' } : {}),
                            }}
                          />
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <input
                            ref={el => inputRefs.current[`abnormal_${lot.id}`] = el}
                            type="text" defaultValue={count?.abnormal_note || ''} placeholder="메모"
                            onBlur={e => saveAbnormalNote(lot, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                saveAbnormalNote(lot, e.target.value)
                                const nextLot = visibleLots[idx + 1]
                                if (nextLot && inputRefs.current[`abnormal_${nextLot.id}`]) inputRefs.current[`abnormal_${nextLot.id}`].focus()
                              }
                            }}
                            style={{
                              width: '110px', padding: '5px 8px', borderRadius: '6px',
                              border: `1px solid ${count?.abnormal_note ? C.danger : C.border}`,
                              fontSize: '12px', background: C.white,
                            }}
                          />
                        </td>
                        <td style={{ ...tdStyle, fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>
                          {isAdmin ? (
                            <>
                              {count?.counted_by || '-'}
                              {count?.counted_at && <span style={{ fontSize: '10px', marginLeft: '4px' }}>· {new Date(count.counted_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>}
                            </>
                          ) : (
                            count?.counted_at ? new Date(count.counted_at).toLocaleDateString('ko-KR') : '-'
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          {count?.reported_missing ? (
                            <button onClick={() => openActionModal(lot)} style={{ ...smallBtnStyle(), background: '#FFF3E0', borderColor: '#FFCC80', color: '#E65100', whiteSpace: 'nowrap' }}>위치 내 미확인</button>
                          ) : disposalByLot[lot.id] ? (
                            <button onClick={() => openActionModal(lot)} style={{ ...smallBtnStyle(), background: C.dangerTint, borderColor: '#F3D6D6', color: C.dangerDark, whiteSpace: 'nowrap' }}>폐기신청됨</button>
                          ) : (
                            <button onClick={() => openActionModal(lot)} style={{ ...smallBtnStyle(), whiteSpace: 'nowrap' }}>기타조치</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          {/* ── 알파벳 인덱스 ── */}
          <div style={{
            position: 'sticky', top: '80px', display: 'flex', flexDirection: 'column',
            gap: '2px', background: C.white, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '6px 4px', minWidth: '28px', alignItems: 'center',
          }}>
            {availableLetters.map(letter => (
              <button key={letter} onClick={() => scrollToLetter(letter)} style={{
                width: '22px', height: '22px', borderRadius: '4px', border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0,
              }}
                onMouseEnter={e => e.currentTarget.style.background = C.bg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{letter}</button>
            ))}
          </div>
        </div>
          </>
        )}
      </div>

      {renderActionModal()}
    </div>
  )
}
