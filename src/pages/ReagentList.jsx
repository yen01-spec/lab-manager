import { useEffect, useState, useRef, useCallback } from 'react'
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Card } from '../design'
import { exportReagents } from '../exportUtils'
import { lookupStudent, writeSession } from '../lib/session'
import { useReagentSearch } from '../hooks/useReagentSearch'
import { useBreakpoint } from '../hooks/useBreakpoint'
import AlphabetIndex from '../components/reagents/AlphabetIndex'
import ReagentTable from '../components/reagents/ReagentTable'
import MobileReagentCard from '../components/reagents/MobileReagentCard'
import ReagentToolbar from '../components/reagents/ReagentToolbar'
import ReagentFilters from '../components/reagents/ReagentFilters'
import BulkMoveModal from '../components/reagents/BulkMoveModal'
import BulkLookupModal from '../components/reagents/BulkLookupModal'
import RegisterReagentModal from '../components/reagents/RegisterReagentModal'
import PickedListModal from '../components/reagents/PickedListModal'

export default function ReagentList() {
  const { isAdmin, student, applySession } = useOutletContext?.() || {}
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isMobile } = useBreakpoint()

  const {
    locations, search, setSearch, roomFilter, setRoomFilter, detailFilter, setDetailFilter,
    results, totalCount, fetchResults,
  } = useReagentSearch({ initialSearch: searchParams.get('q') || '' })

  const [expandedIds, setExpandedIds] = useState(new Set())
  const [visibleCols, setVisibleCols] = useState({
    casNo: true, company: true, volume: true, stock: true, location: true, lastConfirmed: true,
    lot: false, expiry: false, category: false, ghs: false, status: false,
  })
  // 인화성(GHS02) 시약만 보기 — 인화성 시약을 한 시약장에 모으려는 실사용 계획을 위한 필터
  const [flammableOnly, setFlammableOnly] = useState(false)
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

  // 인라인 편집 (목록에서 재고 숫자 바로 수정)
  const [inlineEdit, setInlineEdit] = useState(null)

  // 시약 일괄조회 (여러 시약명을 한번에 붙여넣어 존재유무/위치 확인 — 학기 준비용)
  const [showBulkLookupModal, setShowBulkLookupModal] = useState(false)
  const [bulkLookupText, setBulkLookupText] = useState('')
  const [bulkLookupResults, setBulkLookupResults] = useState(null)
  const [bulkLookupLoading, setBulkLookupLoading] = useState(false)
  const [zippingMsds, setZippingMsds] = useState(false)

  // 신규 시약 등록 모달 — "신규 시약 등록"/"직접 제조 시약 등록" 두 탭을 하나의 모달에서 전환
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerTab, setRegisterTab] = useState('new') // 'new' | 'made'
  const [newReagentForm, setNewReagentForm] = useState({
    name: '', cas_no: '', company: '', category: '', volume: '', unit: '',
    cat_no: '', lot_no: '', location_id: '', sealed_count: '1', current_stock: '100',
    reagent_id: null,
  })
  // 시약명을 입력하고 칸을 벗어나면(blur) 카탈로그에서 같은 이름을 찾아 후보로 보여줌 —
  // 이미 있는 시약을 모르고 또 새로 등록하는 걸 막기 위함(재고실사/관리자 시약추가에
  // 이미 있는 "기존 시약에 Lot 추가" 흐름을 신규 시약 등록 모달에도 동일하게 적용).
  const [dupCandidates, setDupCandidates] = useState([])
  const [madeForm, setMadeForm] = useState({ name: '', volume: '', unit: '', made_date: new Date().toISOString().split('T')[0], made_purpose: '', location_id: '' })
  // 등록하기를 눌렀는데 로그인이 안 되어 있으면, 별도 로그인 버튼으로 보내는 대신
  // 이 모달 안에서 바로 학번/생년월일/이름을 확인 → 맞으면 로그인 처리와 동시에
  // 원래 누르려던 등록을 그대로 이어서 진행한다.
  const [showInlineLogin, setShowInlineLogin] = useState(false)
  const [inlineLoginForm, setInlineLoginForm] = useState({ student_id: '', birth_date: '', name: '' })
  const [inlineLoginError, setInlineLoginError] = useState('')
  const [inlineLoginLoading, setInlineLoginLoading] = useState(false)
  const [pendingRegisterTab, setPendingRegisterTab] = useState(null) // 로그인 확인 후 이어서 제출할 탭

  // 표시 열 체크박스를 기본값으로 되돌림(기존의 검색어/위치/제조사 초기화 기능을 대체)
  function resetFilters() {
    setVisibleCols({
      casNo: true, company: true, volume: true, stock: true, location: true, lastConfirmed: true,
      lot: false, expiry: false, category: false, ghs: false, status: false,
    })
    setFlammableOnly(false)
  }

  // 편집 모드 토글
  function toggleEditMode() {
    setEditMode(!editMode)
    setCheckedIds(new Set())
  }

  // 시프트 범위선택용 "마지막 클릭 id"는 화면에 영향 없는 부기용 값이라
  // state 대신 ref로 관리 — toggleCheck를 완전히 안정된(참조가 안 바뀌는)
  // 콜백으로 만들어서 행(ReagentRow) 메모이제이션이 깨지지 않도록 하기 위함.
  const lastCheckedRef = useRef(null)

  const toggleCheck = useCallback((id, e, allData) => {
    e.stopPropagation()
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (e.shiftKey && lastCheckedRef.current) {
        // Shift+클릭 범위 선택
        const ids = allData.map(r => r.id)
        const start = ids.indexOf(lastCheckedRef.current)
        const end = ids.indexOf(id)
        const range = ids.slice(Math.min(start, end), Math.max(start, end) + 1)
        const allSelected = range.every(rid => next.has(rid))
        range.forEach(rid => allSelected ? next.delete(rid) : next.add(rid))
      } else {
        next.has(id) ? next.delete(id) : next.add(id)
      }
      return next
    })
    lastCheckedRef.current = id
  }, [])

  function toggleAll(data) {
    if (checkedIds.size === data.length) setCheckedIds(new Set())
    else setCheckedIds(new Set(data.map(r => r.id)))
  }

  const togglePick = useCallback((r, e) => {
    e.stopPropagation()
    setPickedIds(prev => {
      const next = new Map(prev)
      next.has(r.id) ? next.delete(r.id) : next.set(r.id, r)
      return next
    })
  }, [])

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
      cat_no: '', needed_amount: '', usage_place: '', purchase_reason: '', note: '',
      spec: r.volume ? `${r.volume}${r.unit || ''}` : '', quantity: '1',
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

  // 일괄 검색 결과 중 MSDS 파일이 등록된 시약들의 MSDS를 하나의 ZIP으로 묶어서 다운로드.
  // JSZip은 이 버튼을 눌렀을 때만 필요하므로 동적 import — 안 쓰는 사용자의 초기 로딩엔
  // 영향 없게(번들에 항상 포함되지 않게) 함.
  async function downloadMsdsZip() {
    const items = []
    const seen = new Set()
    bulkLookupResults?.forEach(({ matches }) => matches.forEach(r => {
      if (r.msds_url && !seen.has(r.id)) { seen.add(r.id); items.push(r) }
    }))
    if (items.length === 0) { alert('조회 결과 중 등록된 MSDS 파일이 있는 시약이 없어요.'); return }
    setZippingMsds(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const usedNames = new Set()
      let failCount = 0
      await Promise.all(items.map(async r => {
        try {
          const res = await fetch(r.msds_url)
          if (!res.ok) throw new Error('fetch failed')
          const blob = await res.blob()
          const extMatch = r.msds_url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/)
          const ext = extMatch ? extMatch[1] : 'pdf'
          const baseName = r.name.replace(/[\\/:*?"<>|]/g, '_')
          let filename = `${baseName}.${ext}`
          let i = 2
          while (usedNames.has(filename)) { filename = `${baseName}_${i}.${ext}`; i++ }
          usedNames.add(filename)
          zip.file(filename, blob)
        } catch {
          failCount++
        }
      }))
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      const dateStr = new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')
      a.download = `MSDS_일괄다운로드_${dateStr}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      if (failCount > 0) alert(`${items.length - failCount}개 파일을 압축했어요. (${failCount}개는 다운로드에 실패해 제외됨)`)
    } catch (e) {
      alert('MSDS ZIP 생성 중 오류가 발생했습니다: ' + e.message)
    } finally {
      setZippingMsds(false)
    }
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
      const activeLots = r._activeLots || (r.reagent_lots || []).filter(l => l.status === 'active')
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

  // studentOverride: 인라인 로그인 확인 직후 곧바로 이어서 제출할 때, 아직 리액트 상태에
  // 반영 안 된(비동기라 한 틱 늦음) student 대신 방금 확인된 세션을 바로 써야 하므로 받음.
  async function submitMade(studentOverride) {
    const activeStudent = studentOverride || student
    if (!madeForm.name.trim()) { alert('시약명을 입력해주세요'); return }
    if (!madeForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    if (!activeStudent) { setPendingRegisterTab('made'); setShowInlineLogin(true); return }
    const { data: reagent, error } = await supabase.from('reagents').insert({
      name: madeForm.name, volume: madeForm.volume || null, unit: madeForm.unit || null,
      location_id: madeForm.location_id, reagent_type: 'self_made',
      made_date: madeForm.made_date, made_purpose: madeForm.made_purpose,
      registered_by: activeStudent.student_id, pending_confirm: true,
    }).select().single()
    if (error) { alert('등록 중 오류가 발생했습니다: ' + error.message); return }
    await supabase.from('reagent_lots').insert({
      reagent_id: reagent.id, sealed_count: 0, current_stock: 100, received_date: madeForm.made_date,
      pending_confirm: true,
    })
    alert('직접 제조 시약이 등록됐어요! 관리자가 최종 확인하기 전까지는 목록에 "검토대기"로 표시돼요.')
    setShowRegisterModal(false)
    setMadeForm({ name: '', volume: '', unit: '', made_date: new Date().toISOString().split('T')[0], made_purpose: '', location_id: '' })
    fetchResults()
  }

  // 시약명을 입력하고 칸을 벗어나면 카탈로그에서 같은 이름을 찾아 후보로 보여줌 —
  // "이미 있는 시약인데 모르고 또 등록"하는 걸 막기 위함(재고실사/관리자 시약추가와
  // 동일한 패턴). 후보를 고르면 나머지 필드가 그 시약 값으로 채워지고 잠기며,
  // 제출 시 reagents를 또 만들지 않고 그 시약에 새 Lot만 붙인다.
  async function searchDuplicateReagents() {
    const term = newReagentForm.name.trim()
    if (!term) { setDupCandidates([]); return }
    const { data } = await supabase.from('reagents')
      .select('id, name, cas_no, company, category, volume, unit, purity')
      .ilike('name', `%${term}%`).neq('status', 'archived').limit(5)
    setDupCandidates(data || [])
  }
  function pickDuplicateReagent(r) {
    setNewReagentForm(prev => ({
      ...prev, name: r.name, cas_no: r.cas_no || '', company: r.company || '',
      category: r.category || '', volume: r.volume != null ? String(r.volume) : '', unit: r.unit || '',
      reagent_id: r.id,
    }))
    setDupCandidates([])
  }
  function clearDuplicateMatch() {
    setNewReagentForm(prev => ({ ...prev, reagent_id: null }))
  }

  async function submitNewReagent(studentOverride) {
    const activeStudent = studentOverride || student
    if (!newReagentForm.name.trim()) { alert('시약명을 입력해주세요'); return }
    if (!newReagentForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    if (!activeStudent) { setPendingRegisterTab('new'); setShowInlineLogin(true); return }
    let reagentId = newReagentForm.reagent_id
    if (!reagentId) {
      const { data: reagent, error } = await supabase.from('reagents').insert({
        name: newReagentForm.name, cas_no: newReagentForm.cas_no || null, company: newReagentForm.company || null,
        category: newReagentForm.category || null, volume: newReagentForm.volume || null, unit: newReagentForm.unit || null,
        registered_by: activeStudent.student_id, pending_confirm: true,
      }).select().single()
      if (error) { alert('등록 중 오류가 발생했습니다: ' + error.message); return }
      reagentId = reagent.id
    }
    await supabase.from('reagent_lots').insert({
      reagent_id: reagentId, location_id: newReagentForm.location_id,
      lot_no: newReagentForm.lot_no || null, cat_no: newReagentForm.cat_no || null,
      sealed_count: Number(newReagentForm.sealed_count) || 0, current_stock: Number(newReagentForm.current_stock) || 0,
      received_date: new Date().toISOString().split('T')[0], pending_confirm: true,
    })
    alert(newReagentForm.reagent_id ? '기존 시약에 새 Lot이 등록됐어요! 관리자가 최종 확인하기 전까지는 "검토대기"로 표시돼요.' : '신규 시약이 등록됐어요! 관리자가 최종 확인하기 전까지는 목록에 "검토대기"로 표시돼요.')
    setShowRegisterModal(false)
    setNewReagentForm({ name: '', cas_no: '', company: '', category: '', volume: '', unit: '', cat_no: '', lot_no: '', location_id: '', sealed_count: '1', current_stock: '100', reagent_id: null })
    setDupCandidates([])
    fetchResults()
  }

  // 인라인 로그인란에 입력한 학번/생년월일/이름을 확인 → 맞으면 로그인 처리(전역 세션에도
  // 반영)와 동시에, 원래 누르려던 등록(신규/직접제조)을 그대로 이어서 제출한다.
  async function submitInlineLogin() {
    const { student_id, birth_date, name } = inlineLoginForm
    if (!student_id.trim() || !birth_date.trim() || !name.trim()) {
      setInlineLoginError('학번·생년월일·이름을 모두 입력하세요'); return
    }
    setInlineLoginLoading(true)
    setInlineLoginError('')
    try {
      const found = await lookupStudent(student_id.trim())
      if (!found) {
        setInlineLoginError('등록되지 않은 학번이에요. 처음이시면 상단의 "로그인" 버튼으로 먼저 등록해주세요.')
        return
      }
      if (found.name !== name.trim() || found.birth_date !== birth_date.trim()) {
        setInlineLoginError('등록된 정보와 달라요. 본인이 맞다면 관리자에게 문의하세요.')
        return
      }
      const session = { student_id: found.student_id, name: found.name, is_admin: false, is_super: false }
      writeSession(session)
      applySession?.(session)
      setShowInlineLogin(false)
      setInlineLoginForm({ student_id: '', birth_date: '', name: '' })
      if (pendingRegisterTab === 'new') await submitNewReagent(session)
      else if (pendingRegisterTab === 'made') await submitMade(session)
      setPendingRegisterTab(null)
    } catch (err) {
      setInlineLoginError(err.message || '처리 중 오류가 발생했습니다')
    } finally {
      setInlineLoginLoading(false)
    }
  }

  // 매 렌더마다 최신 fetchResults를 가리키게 갱신 — confirmPending을 useCallback([])으로
  // 고정해서 모든 행에 안정적으로 내려주면서도(메모이제이션 유지), 항상 최신 필터로
  // 다시 불러오게 하기 위함(ReagentDetail.jsx의 fetchResultsRef 패턴과 동일).
  const fetchResultsRef = useRef(fetchResults)
  useEffect(() => { fetchResultsRef.current = fetchResults })

  // 신규/직접제조 등록으로 pending_confirm=true가 된 시약을 관리자가 목록에서 바로
  // 최종 확인 처리 — "검토대기" 배지 클릭으로 호출됨.
  const confirmPending = useCallback(async (r) => {
    if (!window.confirm(`"${r.name}"의 등록 내용을 최종 확인 처리할까요?\n확인 후엔 "검토대기" 표시가 사라집니다.`)) return
    await supabase.from('reagents').update({ pending_confirm: false }).eq('id', r.id)
    const pendingLotIds = (r.reagent_lots || []).filter(l => l.pending_confirm).map(l => l.id)
    if (pendingLotIds.length > 0) {
      await supabase.from('reagent_lots').update({ pending_confirm: false }).in('id', pendingLotIds)
    }
    fetchResultsRef.current()
  }, [])

  const startInlineEdit = useCallback((lotId, reagentId, field, currentValue, e) => {
    e.stopPropagation()
    if (!isAdmin) return
    setInlineEdit({ lotId, reagentId, field, value: currentValue })
  }, [isAdmin])

  // advance: Enter로 저장한 경우 같은 항목(잔량/미개봉)을 목록의 다음 시약에서 바로 이어서 편집 —
  // 단일 Lot 시약만 인라인 편집 대상이라, 다음 항목 중 첫 단일 Lot 시약을 찾아서 연다.
  async function saveInlineEdit(lot, { advance = false, data } = {}) {
    if (!inlineEdit) return
    const { field, value, reagentId } = inlineEdit
    const lotId = inlineEdit.lotId
    const numVal = Number(value)
    if (isNaN(numVal)) { alert('숫자를 입력해주세요'); return }
    await supabase.from('reagent_lots').update({ [field]: numVal, needs_review: false }).eq('id', lotId)
    await supabase.from('stock_logs').insert({
      target_type: 'reagent', lot_id: lotId, user_name: student?.name || '',
      before_sealed: lot.sealed_count,
      after_sealed: field === 'sealed_count' ? numVal : lot.sealed_count,
      before_stock: lot.current_stock,
      after_stock: field === 'current_stock' ? numVal : lot.current_stock,
    })
    setInlineEdit(null)
    const fresh = await fetchResults()
    if (advance && data && fresh) {
      const idx = fresh.findIndex(r => r.id === reagentId)
      for (let i = idx + 1; i < fresh.length; i++) {
        const nextR = fresh[i]
        if (nextR._onlyLot) {
          const nextVal = field === 'sealed_count' ? nextR._onlyLot.sealed_count : nextR._onlyLot.current_stock
          setInlineEdit({ lotId: nextR._onlyLot.id, reagentId: nextR.id, field, value: nextVal })
          break
        }
      }
    }
  }

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // 행 클릭 = 바로 상세페이지 이동. Lot/위치별 목록 펼치기는 이름 옆 ▸ 아이콘이나
  // "N병" 배지를 눌러야만 동작(둘 다 stopPropagation으로 행 클릭과 분리돼 있음) —
  // 예전엔 한 번 클릭=펼치기·더블클릭=상세페이지로 나눴었는데, Lot이 1개뿐인 대부분의
  // 행에서는 한 번 클릭이 아무 반응도 없는 "죽은 클릭"이 돼서 오히려 헷갈렸음.
  const handleRowClick = useCallback((r) => {
    navigate(`/reagents/${r.id}`)
  }, [navigate])

  const scrollToLetter = (letter) => {
    const el = alphabetRefs.current[letter]
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
  }

  const rooms = [...new Set(locations.map(l => l.room))]

  // 시약 종류(마스터)는 보유중인 Lot이 하나도 없어도(전부 폐기/사용완료) 목록에서 사라지지 않고
  // "보유 0병"으로 계속 표시됨 — 다시 구매해서 재고를 등록할 때 신규 등록할 필요가 없도록
  const displayResults = flammableOnly ? results.filter(r => r._ghsList?.some(g => g.code === 'GHS02')) : results

  return (
    <div>
      <PageBanner title="시약 목록" sub="Reagent List" breadcrumb={['홈', '시약 관리', '시약 목록']}
        extra={<span style={{ fontSize: '12px', color: C.muted }}>전체 {totalCount.toLocaleString()}개 · 검색결과 {displayResults.length.toLocaleString()}개</span>} />
      <div style={{ padding: '8px 16px' }}>

        <ReagentToolbar
          search={search} setSearch={setSearch}
          onSearchSelect={r => navigate(`/reagents/${r.id}`)}
          onSearchEnter={() => fetchResults()}
          onOpenBulkLookup={() => { setShowBulkLookupModal(true); setBulkLookupResults(null) }}
          onOpenRegister={() => { setRegisterTab('new'); setShowRegisterModal(true) }}
          isAdmin={isAdmin} hasResults={displayResults.length > 0}
          editMode={editMode} onToggleEditMode={toggleEditMode}
          onExportExcel={() => {
            const activeLocationIds = detailFilter ? [detailFilter] : roomFilter ? locations.filter(l => l.room === roomFilter).map(l => l.id) : null
            const filterLabel = detailFilter
              ? (() => { const l = locations.find(x => x.id === detailFilter); return l ? `${l.room}${l.detail ? '_' + l.detail : ''}` : '' })()
              : roomFilter
            exportReagents(displayResults, locations, activeLocationIds, filterLabel)
          }}
        />

        <ReagentFilters
          rooms={rooms} roomFilter={roomFilter} setRoomFilter={setRoomFilter}
          detailFilter={detailFilter} setDetailFilter={setDetailFilter} locations={locations}
          visibleCols={visibleCols} setVisibleCols={setVisibleCols} onResetFilters={resetFilters}
          flammableOnly={flammableOnly} setFlammableOnly={setFlammableOnly}
        />

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
          : isMobile ? (
            // 모바일 — PC의 minWidth:900px 표는 휴대폰에서 계속 가로 스크롤이 생겨
            // 시약장을 돌아다니며 검색하기 불편함. 카드형 목록으로 대체(관리자 편집
            // 모드·일괄이동 등 관리 기능은 PC 전용으로 남기고 카드 탭 = 상세페이지,
            // 체크박스 = 선택목록 담기만 지원).
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayResults.map(r => (
                <MobileReagentCard key={r.id} r={r} locations={locations}
                  isPicked={pickedIds.has(r.id)} onTogglePick={togglePick}
                  onOpenDetail={r2 => navigate(`/reagents/${r2.id}`)} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Card noPadding>
                  <ReagentTable
                    data={displayResults} locations={locations} visibleCols={visibleCols}
                    checkedIds={checkedIds} pickedIds={pickedIds} editMode={editMode} isAdmin={isAdmin}
                    inlineEdit={inlineEdit} setInlineEdit={setInlineEdit} expandedIds={expandedIds} alphabetRefs={alphabetRefs}
                    toggleCheck={toggleCheck} togglePick={togglePick} toggleAll={toggleAll} togglePickAll={togglePickAll}
                    handleRowClick={handleRowClick} toggleExpand={toggleExpand}
                    startInlineEdit={startInlineEdit} saveInlineEdit={saveInlineEdit}
                    confirmPending={confirmPending} />
                </Card>
              </div>
              <AlphabetIndex data={displayResults} editMode={editMode} scrollToLetter={scrollToLetter} />
            </div>
          )}
      </div>

      {showBulkMoveModal && (
        <BulkMoveModal
          checkedCount={checkedIds.size} locations={locations}
          bulkMoveLocation={bulkMoveLocation} setBulkMoveLocation={setBulkMoveLocation}
          bulkMovedBy={bulkMovedBy} setBulkMovedBy={setBulkMovedBy}
          onClose={() => setShowBulkMoveModal(false)} onSubmit={submitBulkMove}
        />
      )}

      {showBulkLookupModal && (
        <BulkLookupModal
          locations={locations}
          bulkLookupText={bulkLookupText} setBulkLookupText={setBulkLookupText}
          bulkLookupResults={bulkLookupResults} bulkLookupLoading={bulkLookupLoading} zippingMsds={zippingMsds}
          onRun={runBulkLookup} onAddMatchesToPicked={addBulkLookupMatchesToPicked} onDownloadMsds={downloadMsdsZip}
          onClose={() => setShowBulkLookupModal(false)}
        />
      )}

      {showRegisterModal && (
        <RegisterReagentModal
          registerTab={registerTab} setRegisterTab={setRegisterTab}
          newReagentForm={newReagentForm} setNewReagentForm={setNewReagentForm}
          madeForm={madeForm} setMadeForm={setMadeForm}
          locations={locations}
          showInlineLogin={showInlineLogin} inlineLoginForm={inlineLoginForm} setInlineLoginForm={setInlineLoginForm}
          inlineLoginError={inlineLoginError} setInlineLoginError={setInlineLoginError}
          inlineLoginLoading={inlineLoginLoading} setPendingRegisterTab={setPendingRegisterTab} setShowInlineLogin={setShowInlineLogin}
          dupCandidates={dupCandidates} onSearchDuplicates={searchDuplicateReagents}
          onPickDuplicate={pickDuplicateReagent} onClearDuplicate={clearDuplicateMatch}
          onSubmitInlineLogin={submitInlineLogin} onSubmitNewReagent={submitNewReagent} onSubmitMade={submitMade}
          onClose={() => setShowRegisterModal(false)}
        />
      )}

      {showPickedModal && (
        <PickedListModal pickedIds={pickedIds} setPickedIds={setPickedIds} locations={locations} onClose={() => setShowPickedModal(false)} />
      )}

    </div>
  )
}
