import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useOutletContext, useNavigate, useLocation, useNavigationType } from 'react-router-dom'
import { supabase, supabaseAdmin } from '../supabase'
import { C, PageBanner } from '../design'
import { exportReagents, exportPickedReagents } from '../exportUtils'
import { checkStudentLogin, writeSession } from '../lib/session'
import { computeSortLetter } from '../lib/sortLetter'
import { groupReagentsByName } from '../lib/nameGroup'
import { useReagentSearch } from '../hooks/useReagentSearch'
import { useReagentListParams } from '../hooks/useReagentListParams'
import { useBatchFilter } from '../hooks/useBatchFilter'
import { useBusyAction } from '../hooks/useBusyAction'
import { loadViewSnapshot, saveViewSnapshot } from '../lib/reagentListView'
import { useBreakpoint } from '../hooks/useBreakpoint'
import ReagentTable from '../components/reagents/ReagentTable'
import MobileReagentList from '../components/reagents/MobileReagentList'
import ReagentToolbar from '../components/reagents/ReagentToolbar'
import ReagentFilters from '../components/reagents/ReagentFilters'
import BulkLookupModal from '../components/reagents/BulkLookupModal'
import BatchFilterBar from '../components/reagents/BatchFilterBar'
import RegisterReagentModal from '../components/reagents/RegisterReagentModal'
import { invalidateReagentIndex } from '../lib/reagentSearch'
import PickedListModal from '../components/reagents/PickedListModal'
import { ResultSummary, Count, ListState } from '../components/reagents/ReagentListChrome'
import SelectedReagentActionBar from '../components/reagents/actions/SelectedReagentActionBar'
import LotSelectionDialog from '../components/reagents/actions/LotSelectionDialog'
import MultiReagentEditQueue from '../components/reagents/actions/MultiReagentEditQueue'

// 검색어·위치/유해분류/위험물유별/특별관리·CAS 필터는 URL 쿼리에 있다(useReagentListParams) — 상세
// 페이지에서 뒤로가기 하면 같은 URL로 돌아와 그대로 복원된다. 자료 탭 딥링크 ?preset=special|hazard|fire는
// 그 훅이 실제 필터 파라미터로 바꿔준다(이후 사용자가 자유롭게 더하거나 해제).

const DEFAULT_COLS = {
  casNo: true, company: true, volume: true, stock: true, location: true, lastConfirmed: true,
  lot: false, expiry: false, category: false, fireClass: false, special: false, casCheck: false, ghs: false, status: false,
}

export default function ReagentList() {
  const { isAdmin, student, applySession } = useOutletContext?.() || {}
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const { isMobile } = useBreakpoint()

  const {
    search, roomFilter, detailFilter, hazardClassFilter, fireClassFilter, specialOnly, casMismatchOnly,
    hazardPresetPending, batchFlag,
    setSearch, setRoomFilter, setDetailFilter, setHazardClassFilter, setFireClassFilter,
    setSpecialOnly, setCasMismatchOnly, setBatchFlag,
  } = useReagentListParams()
  const { batch, idSet: batchIds, apply: applyBatch, clear: clearBatchFilter } = useBatchFilter({ flag: batchFlag, setFlag: setBatchFlag })
  const {
    locations, results, loading, loadError, overlayInfo, totalCount, fetchResults,
  } = useReagentSearch({ search, roomFilter, detailFilter })

  // 뒤로가기(POP)로 돌아왔을 때만 펼침/표시 열 복원 — 스크롤 위치는 목록(useVirtualListRestore)이 복원.
  const [restored] = useState(() => (navType === 'POP' ? loadViewSnapshot(location.search) : null))
  const [expandedIds, setExpandedIds] = useState(() => new Set(restored?.expanded || []))
  const [visibleCols, setVisibleCols] = useState(() => ({ ...DEFAULT_COLS, ...(restored?.cols || {}) }))
  const viewRef = useRef({})
  useEffect(() => { viewRef.current = { search: location.search, expandedIds, visibleCols } })
  useEffect(() => () => {
    const v = viewRef.current
    saveViewSnapshot(v.search, { expanded: [...v.expandedIds], cols: v.visibleCols })
  }, [])

  // 선택 목록 (검색결과에서 여러 시약을 체크해 모아보기 — 전체 사용자). id -> reagent row
  const [pickedIds, setPickedIds] = useState(new Map())
  const [showPickedModal, setShowPickedModal] = useState(false)
  // 선택(reagents.id) 후 고르는 작업 — 구매요청/Excel은 즉시 실행, 위치이동/폐기는 2단계 병 선택, 정보수정은 1종=상세페이지·여러종=순차 큐.
  const [lotDialogMode, setLotDialogMode] = useState(null) // null | 'move' | 'dispose'
  const [showEditQueue, setShowEditQueue] = useState(false)

  // 인라인 편집 (목록에서 재고 숫자 바로 수정)
  const [inlineEdit, setInlineEdit] = useState(null)

  // 시약 일괄검색 — 입력 모달만 있고 결과는 아래 시약목록 자체에 필터로 적용된다(useBatchFilter).
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  const [zippingMsds, setZippingMsds] = useState(false)
  const batchBarRef = useRef(null)
  const [focusBarNext, setFocusBarNext] = useState(false)

  // 신규 시약 등록 모달 — "신규 시약 등록"/"직접 제조 시약 등록" 두 탭을 하나의 모달에서 전환
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerTab, setRegisterTab] = useState('new') // 'new' | 'made'
  const [newReagentForm, setNewReagentForm] = useState({
    name: '', cas_no: '', company: '', category: '', volume: '', unit: '',
    cat_no: '', lot_no: '', noLotReason: '', location_id: '', sealed_count: '1', current_stock: '100',
    reagent_id: null,
  })
  // 시약명을 입력하고 칸을 벗어나면(blur) 카탈로그에서 같은 이름을 찾아 후보로 보여줌 —
  // 이미 있는 시약을 모르고 또 새로 등록하는 걸 막기 위함(재고실사/관리자 시약추가에
  // 이미 있는 "기존 시약에 Lot 추가" 흐름을 신규 시약 등록 모달에도 동일하게 적용).
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
  // useCallback — memo된 ReagentFilters로 안정적으로 내려주기 위함.
  const resetFilters = useCallback(() => {
    setVisibleCols({ ...DEFAULT_COLS })
    setHazardClassFilter(new Set())
    setFireClassFilter(new Set())
    setSpecialOnly(false)
    setCasMismatchOnly(false)
  }, [setHazardClassFilter, setFireClassFilter, setSpecialOnly, setCasMismatchOnly])

  const togglePick = useCallback((r, e) => {
    e.stopPropagation()
    setPickedIds(prev => {
      const next = new Map(prev)
      next.has(r.id) ? next.delete(r.id) : next.set(r.id, r)
      return next
    })
  }, [])

  const togglePickAll = useCallback((data) => {
    setPickedIds(prev => {
      const allPicked = data.length > 0 && data.every(r => prev.has(r.id))
      const next = new Map(prev)
      data.forEach(r => allPicked ? next.delete(r.id) : next.set(r.id, r))
      return next
    })
  }, [])

  function goToPurchaseRequestWithPicked() {
    const prefillReagentItems = Array.from(pickedIds.values()).map(r => ({
      reagent_id: r.id, name: r.name, company: r.company || '', cas_no: r.cas_no || '',
      cat_no: '', needed_amount: '', usage_place: '', purchase_reason: '', note: '',
      spec: r.volume ? `${r.volume}${r.unit || ''}` : '', quantity: '1',
    }))
    navigate('/purchase-request', { state: { prefillReagentItems } })
  }

  function handlePickedAction(key) {
    if (key === 'purchase') { goToPurchaseRequestWithPicked(); return }
    if (key === 'list') { setShowPickedModal(true); return }
    if (key === 'excel') { exportPickedReagents(Array.from(pickedIds.values()), locations); return }
    if (key === 'move') { setLotDialogMode('move'); return }
    if (key === 'dispose') { setLotDialogMode('dispose'); return }
    if (key === 'edit') {
      if (pickedIds.size === 1) {
        const [onlyId] = pickedIds.keys()
        navigate(`/reagents/${onlyId}`, { state: { from: 'list', autoEdit: true } })
      } else {
        setShowEditQueue(true)
      }
    }
  }

  function afterLotAction() {
    setLotDialogMode(null)
    setPickedIds(new Map())
    fetchResults()
  }
  function afterEditQueue(changedCount) {
    setShowEditQueue(false)
    setPickedIds(new Map())
    fetchResults()
    if (changedCount > 0) alert(`${changedCount}종 ${isAdmin ? '정보를 저장했어요' : '정보 수정을 신청했어요'}.`)
  }

  // 현재 목록(일괄검색 결과 포함)에서 MSDS 파일이 등록된 시약들의 MSDS를 하나의 ZIP으로 묶어서 다운로드.
  // JSZip은 이 버튼을 눌렀을 때만 필요하므로 동적 import — 안 쓰는 사용자의 초기 로딩엔
  // 영향 없게(번들에 항상 포함되지 않게) 함.
  async function downloadMsdsZip(list) {
    const items = list.filter(r => r.msds_url)
    if (items.length === 0) { alert('현재 목록 중 등록된 MSDS 파일이 있는 시약이 없어요.'); return }
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

  // studentOverride: 인라인 로그인 확인 직후 곧바로 이어서 제출할 때, 아직 리액트 상태에
  // 반영 안 된(비동기라 한 틱 늦음) student 대신 방금 확인된 세션을 바로 써야 하므로 받음.
  async function submitMadeImpl(studentOverride) {
    const activeStudent = studentOverride || student
    if (!madeForm.name.trim()) { alert('시약명을 입력해주세요'); return }
    if (!madeForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    if (!activeStudent) { setPendingRegisterTab('made'); setShowInlineLogin(true); return }
    // 서버 RPC가 등록자를 세션으로 확정하고 미확정(검토대기)으로 등록한다.
    const { error } = await supabase.rpc('reagent_register', {
      p_session_token: activeStudent.session_token, p_kind: 'self_made', p_reagent_id: null,
      p_reagent: { name: madeForm.name, volume: madeForm.volume, unit: madeForm.unit, made_date: madeForm.made_date, made_purpose: madeForm.made_purpose, sort_letter: computeSortLetter(madeForm.name) },
      p_lot: { location_id: madeForm.location_id },
    })
    if (error) { alert('등록 중 오류가 발생했습니다: ' + error.message); return }
    alert('직접 제조 시약이 등록됐어요! 관리자가 최종 확인하기 전까지는 목록에 "검토대기"로 표시돼요.')
    invalidateReagentIndex()
    setShowRegisterModal(false)
    setMadeForm({ name: '', volume: '', unit: '', made_date: new Date().toISOString().split('T')[0], made_purpose: '', location_id: '' })
    fetchResults()
  }

  // 시약명 입력 중 자동추천(ReagentSearchInput)에서 이미 있는 시약을 고르면 나머지 필드가 그 시약 값으로 채워지고 잠기며,
  // 제출 시 reagents를 또 만들지 않고 그 시약에 새 Lot만 붙인다. (새 이름은 그대로 자유 입력)
  function pickDuplicateReagent(r) {
    setNewReagentForm(prev => ({
      ...prev, name: r.name, cas_no: r.cas_no || '', company: r.company || '',
      category: r.category || '', volume: r.volume != null ? String(r.volume) : '', unit: r.unit || '',
      reagent_id: r.id,
    }))
  }
  function clearDuplicateMatch() {
    setNewReagentForm(prev => ({ ...prev, reagent_id: null }))
  }

  async function submitNewReagentImpl(studentOverride) {
    const activeStudent = studentOverride || student
    if (!newReagentForm.name.trim()) { alert('시약명을 입력해주세요'); return }
    if (!newReagentForm.location_id) { alert('보관 위치를 선택해주세요'); return }
    if (!activeStudent) { setPendingRegisterTab('new'); setShowInlineLogin(true); return }
    // 시약/Lot 생성 + 내부 관리번호(KNU-날짜-순번) 부여를 서버가 한 트랜잭션으로 처리한다.
    const { data: reg, error } = await supabase.rpc('reagent_register', {
      p_session_token: activeStudent.session_token, p_kind: 'purchased', p_reagent_id: newReagentForm.reagent_id,
      p_reagent: newReagentForm.reagent_id ? null : {
        name: newReagentForm.name, cas_no: newReagentForm.cas_no, company: newReagentForm.company, category: newReagentForm.category,
        volume: newReagentForm.volume, unit: newReagentForm.unit, sort_letter: computeSortLetter(newReagentForm.name),
      },
      p_lot: {
        location_id: newReagentForm.location_id, lot_no: newReagentForm.lot_no, no_lot_reason: newReagentForm.noLotReason || null,
        cat_no: newReagentForm.cat_no, sealed_count: newReagentForm.sealed_count, current_stock: newReagentForm.current_stock,
      },
    })
    if (error) { alert('등록 중 오류가 발생했습니다: ' + error.message); return }
    const genNote = reg.lot_source?.startsWith('generated') ? `\n내부 관리번호: ${reg.lot_no}` : ''
    alert((newReagentForm.reagent_id ? '기존 시약에 새 Lot이 등록됐어요! 관리자가 최종 확인하기 전까지는 "검토대기"로 표시돼요.' : '신규 시약이 등록됐어요! 관리자가 최종 확인하기 전까지는 목록에 "검토대기"로 표시돼요.') + genNote)
    invalidateReagentIndex()
    setShowRegisterModal(false)
    setNewReagentForm({ name: '', cas_no: '', company: '', category: '', volume: '', unit: '', cat_no: '', lot_no: '', noLotReason: '', location_id: '', sealed_count: '1', current_stock: '100', reagent_id: null })
    fetchResults()
  }

  const [submitMade] = useBusyAction(submitMadeImpl)
  const [submitNewReagent] = useBusyAction(submitNewReagentImpl)

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
      let session
      try {
        session = await checkStudentLogin({ student_id: student_id.trim(), name: name.trim(), birth_date: birth_date.trim() })
      } catch {
        setInlineLoginError('등록된 정보와 달라요. 본인이 맞다면 관리자에게 문의하세요.')
        return
      }
      if (!session) {
        setInlineLoginError('등록되지 않은 학번이에요. 처음이시면 상단의 "로그인" 버튼으로 먼저 등록해주세요.')
        return
      }
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
    await supabaseAdmin.from('reagents').update({ pending_confirm: false }).eq('id', r.id)
    const pendingLotIds = (r.reagent_lots || []).filter(l => l.pending_confirm).map(l => l.id)
    if (pendingLotIds.length > 0) {
      await supabaseAdmin.from('reagent_lots').update({ pending_confirm: false }).in('id', pendingLotIds)
    }
    fetchResultsRef.current()
  }, [])

  const startInlineEdit = useCallback((lotId, reagentId, field, currentValue, e) => {
    e.stopPropagation()
    if (!isAdmin) return
    setInlineEdit({ lotId, reagentId, field, value: currentValue })
  }, [isAdmin])

  // advance: Enter로 저장한 경우 같은 항목(잔량/미개봉)을 목록의 다음 시약에서 바로 이어서 편집 —
  // 단일 Lot 시약만 인라인 편집 대상이라, 재조회한 목록(fresh)에서 다음 단일 Lot 시약을 찾아 연다.
  async function saveInlineEdit(lot, { advance = false } = {}) {
    if (!inlineEdit) return
    const { field, value, reagentId } = inlineEdit
    const lotId = inlineEdit.lotId
    const numVal = Number(value)
    if (isNaN(numVal)) { alert('숫자를 입력해주세요'); return }
    const { error } = await supabaseAdmin.rpc('admin_lot_update', { p_lot_id: lotId, p_fields: { [field]: numVal } })
    if (error) { alert(error.message); return }
    setInlineEdit(null)
    const fresh = await fetchResults()
    if (advance && fresh) {
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
  // state.from='list' — 상세 페이지의 "← 목록으로"가 navigate(-1)로 정확히 이 목록 화면으로 돌아가게 한다.
  const openDetail = useCallback((r) => navigate(`/reagents/${r.id}`, { state: { from: 'list' } }), [navigate])
  const handleRowClick = openDetail

  // 아래 콜백들은 memo된 ReagentToolbar에 내려가므로 참조를 고정한다 — 체크박스 선택 등
  // 무관한 리렌더에 검색창/버튼줄이 함께 리렌더되지 않게.
  const handleSearchSelect = openDetail
  const openBulkLookup = useCallback(() => setShowBatchModal(true), [])
  const openRegister = useCallback(() => { setRegisterTab('new'); setShowRegisterModal(true) }, [])

  const rooms = useMemo(() => [...new Set(locations.map(l => l.room))], [locations])

  // [조회] → 필터 저장 → 모달 닫기 → 요약 줄로 포커스/스크롤(목록 상단)
  async function handleBatchApply(text) {
    const r = await applyBatch(text)
    if (!r.ok) return r
    setShowBatchModal(false); setUnmatchedOpen(false)
    setFocusBarNext(true)
    return r
  }
  // 적용된 필터 요약 줄이 화면에 나타나고 모달이 닫힌 뒤에 그 줄로 포커스/스크롤(모달의 "열었던 버튼으로 포커스 복귀"보다 나중)
  useEffect(() => {
    if (!focusBarNext || !batch || showBatchModal || !batchBarRef.current) return
    batchBarRef.current.focus({ preventScroll: true })
    batchBarRef.current.scrollIntoView({ block: 'start' })
    setFocusBarNext(false)
  }, [focusBarNext, batch, showBatchModal])
  function handleBatchClear() { clearBatchFilter(); setUnmatchedOpen(false) }

  // 아래 파생값들은 조회 결과(results)나 필터 상태에만 좌우되는데, 예전엔 검색창 타이핑 등
  // 무관한 리렌더에도 매번 다시 계산됐다(각각 1,300여 개 순회 + Set/그룹 Map 생성).
  // useMemo로 실제 입력이 바뀔 때만 재계산하도록 고정한다.
  const allHazardClassNames = useMemo(
    () => [...new Set(results.flatMap(r => r._hazardClassNames || []))].sort(),
    [results],
  )
  // preset=hazard: 결과가 로드되고 나면(=allHazardClassNames를 알 수 있게 되면) "존재하는 모든
  // 유해분류"를 한 번만 채워 넣는다 — hazardClassFilter가 모든 이름을 담고 있으면 filter 조건
  // (.some(name => hazardClassFilter.has(name)))이 "유해분류가 하나라도 있으면 통과"와 같아진다.
  // 이후 사용자가 개별 유해분류를 해제하면 그 다음부턴 정상적인 다중선택 필터로 동작(1회성 초기화).
  const applyHazardPreset = useCallback(() => {
    setHazardClassFilter(new Set(allHazardClassNames))
  }, [allHazardClassNames, setHazardClassFilter])
  useEffect(() => { if (hazardPresetPending && allHazardClassNames.length > 0) applyHazardPreset() }, [hazardPresetPending, allHazardClassNames, applyHazardPreset])
  const displayResults = useMemo(() => results.filter(r => {
    if (batchIds && !batchIds.has(r.id)) return false   // 일괄검색 = 다른 필터와 AND
    if (hazardClassFilter.size > 0 && !(r._hazardClassNames || []).some(name => hazardClassFilter.has(name))) return false
    if (fireClassFilter.size > 0 && !fireClassFilter.has(r._fireSafetyClass)) return false
    if (specialOnly && !r._specialManagement) return false
    if (casMismatchOnly && !r._casMismatch) return false
    return true
  }), [results, batchIds, hazardClassFilter, fireClassFilter, specialOnly, casMismatchOnly])
  const shownLots = useMemo(() => displayResults.reduce((n, r) => n + r._activeLots.length, 0), [displayResults])
  // 홈 화면 "전체 시약 N종"과 기준을 맞추려 제조사/순도 무시하고 이름만으로 센 값 —
  // ReagentTable도 내부에서 letter별로 다시 그룹핑하므로 여기선 개수만 필요.
  const groupedResultCount = useMemo(() => groupReagentsByName(displayResults).length, [displayResults])
  // 필터를 바꿔도 선택은 유지된다 — 현재 필터 밖으로 숨겨진 선택이 있으면 그 수를 액션바에 안내(Phase Q).
  const pickedHiddenCount = useMemo(() => {
    if (pickedIds.size === 0) return 0
    const shown = new Set(displayResults.map(r => r.id))
    return [...pickedIds.keys()].filter(id => !shown.has(id)).length
  }, [pickedIds, displayResults])

  const handleExportExcel = useCallback(() => {
    const activeLocationIds = detailFilter ? [detailFilter] : roomFilter ? locations.filter(l => l.room === roomFilter).map(l => l.id) : null
    const filterLabel = detailFilter
      ? (() => { const l = locations.find(x => x.id === detailFilter); return l ? `${l.room}${l.detail ? '_' + l.detail : ''}` : '' })()
      : roomFilter
    exportReagents(displayResults, locations, activeLocationIds, filterLabel)
  }, [displayResults, locations, detailFilter, roomFilter])

  return (
    <div>
      <PageBanner title="시약 목록" sub="Reagent List" breadcrumb={['시약 목록']} />
      <div style={{ padding: '8px 16px' }}>

        <ReagentToolbar
          initialSearch={search}
          onSubmitSearch={setSearch}
          onSearchSelect={handleSearchSelect}
          onOpenBulkLookup={openBulkLookup}
          onOpenRegister={openRegister}
          isAdmin={isAdmin} hasResults={displayResults.length > 0}
          onExportExcel={handleExportExcel}
        />

        <ReagentFilters
          rooms={rooms} roomFilter={roomFilter} setRoomFilter={setRoomFilter}
          detailFilter={detailFilter} setDetailFilter={setDetailFilter} locations={locations}
          visibleCols={visibleCols} setVisibleCols={setVisibleCols} onResetFilters={resetFilters}
          hazardClassOptions={allHazardClassNames} hazardClassFilter={hazardClassFilter} setHazardClassFilter={setHazardClassFilter}
          fireClassFilter={fireClassFilter} setFireClassFilter={setFireClassFilter}
          specialOnly={specialOnly} setSpecialOnly={setSpecialOnly}
          casMismatchOnly={casMismatchOnly} setCasMismatchOnly={setCasMismatchOnly}
        />

        {batch && (
          <BatchFilterBar ref={batchBarRef} batch={batch} shownLots={loading ? null : shownLots}
            unmatchedOpen={unmatchedOpen} onToggleUnmatched={() => setUnmatchedOpen(v => !v)}
            onEdit={() => setShowBatchModal(true)} onClear={handleBatchClear}
            canDownloadMsds={displayResults.some(r => r.msds_url)} onDownloadMsds={() => downloadMsdsZip(displayResults)} zippingMsds={zippingMsds} />
        )}

        {/* 필터를 조작한 시선이 바로 이어지도록, 결과 개수를 필터 바로 아래·표 바로 위에 표시.
            홈 화면 "전체 시약 N종"과 기준을 맞추기 위해 제조사/순도 무시하고 이름만으로 센다. */}
        <ResultSummary total={`(전체 ${totalCount.toLocaleString()}개)`}>
          검색결과 <Count n={groupedResultCount} unit="개" />
        </ResultSummary>

        {overlayInfo && (
          <div role="status" style={{ margin: '0 0 12px', padding: '9px 14px', borderRadius: '8px', background: '#EEF5FF', border: '1px solid #B9D2F5', color: '#1F4E96', fontSize: '12.5px', lineHeight: 1.6 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: '#DDEBFF', border: '1px solid #9DBEF0', verticalAlign: '-2px', marginRight: 6 }} />
            <b>{overlayInfo.year}년 재고실사{overlayInfo.label ? ` · ${overlayInfo.label}` : ''}</b>
            {overlayInfo.status === 'reviewed' ? ' 검토 중' : overlayInfo.status === 'paused' ? ' 일시중단' : ' 진행 중'} — 실사에서 확인된 {overlayInfo.count}개 Lot의 값이 <b>파란 배경(미확정)</b>으로 표시됩니다.
            실제 재고 장부는 관리자가 &quot;DB 최종 반영&quot;을 하기 전까지 바뀌지 않아요.
          </div>
        )}

        {/* 선택 후 작업 액션 바 — 체크박스는 "이 시약을 선택"만 의미, 작업은 선택 후 여기서 고른다 */}
        {pickedIds.size > 0 && (
          <SelectedReagentActionBar
            count={pickedIds.size} hiddenCount={pickedHiddenCount} isAdmin={isAdmin}
            onAction={handlePickedAction} onClear={() => setPickedIds(new Map())}
          />
        )}

        {/* 결과 목록 */}
        {displayResults.length === 0
          ? <ListState loading={loading}>
              {loadError ? (
                <div role="alert" data-testid="list-load-error">
                  <div style={{ fontSize: 14, color: '#C13B3F', marginBottom: 12 }}>시약 목록을 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.</div>
                  <button onClick={() => fetchResults()} style={{ background: C.blue, color: '#fff', border: 'none', padding: '8px 16px', minHeight: 44, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>다시 시도</button>
                </div>
              ) : batch && batch.matchedIds.length === 0 ? (
                <div data-testid="batch-empty">
                  <div style={{ fontSize: 14, color: C.text, marginBottom: 12 }}>일괄검색 결과가 없습니다.</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {batch.unmatched.length > 0 && <button onClick={() => setUnmatchedOpen(true)} style={{ background: C.white, color: C.text, border: `1px solid ${C.border}`, padding: '8px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>미확인 {batch.unmatched.length}개 보기</button>}
                    <button onClick={handleBatchClear} style={{ background: C.blue, color: '#fff', border: 'none', padding: '8px 14px', minHeight: 40, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>일괄검색 해제</button>
                  </div>
                </div>
              ) : results.length > 0 ? '조건에 맞는 시약이 없습니다. 필터를 조정해 보세요.' : '조건에 맞는 시약이 없습니다.'}
            </ListState>
          : isMobile ? (
            // 모바일 — PC의 minWidth:900px 표는 휴대폰에서 계속 가로 스크롤이 생겨 카드형 목록으로 대체
            // (카드 탭 = 상세페이지, 체크박스 = 선택목록 담기). 카드는 가상 스크롤로 화면에 보이는 것만 그린다.
            <MobileReagentList data={displayResults} locations={locations}
              pickedIds={pickedIds} togglePick={togglePick} onOpenDetail={openDetail} />
          ) : (
            <ReagentTable
              data={displayResults} locations={locations} visibleCols={visibleCols}
              pickedIds={pickedIds} isAdmin={isAdmin}
              inlineEdit={inlineEdit} setInlineEdit={setInlineEdit} expandedIds={expandedIds}
              togglePick={togglePick} togglePickAll={togglePickAll}
              handleRowClick={handleRowClick} toggleExpand={toggleExpand}
              startInlineEdit={startInlineEdit} saveInlineEdit={saveInlineEdit}
              confirmPending={confirmPending} />
          )}
      </div>

      {showBatchModal && (
        <BulkLookupModal initialText={batch?.text || ''} onApply={handleBatchApply} onClose={() => setShowBatchModal(false)} />
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
          onPickDuplicate={pickDuplicateReagent} onClearDuplicate={clearDuplicateMatch}
          onSubmitInlineLogin={submitInlineLogin} onSubmitNewReagent={submitNewReagent} onSubmitMade={submitMade}
          onClose={() => setShowRegisterModal(false)}
        />
      )}

      {showPickedModal && (
        <PickedListModal pickedIds={pickedIds} setPickedIds={setPickedIds} locations={locations} onClose={() => setShowPickedModal(false)} />
      )}

      {lotDialogMode && (
        <LotSelectionDialog
          reagentIds={[...pickedIds.keys()]} mode={lotDialogMode} locations={locations} isAdmin={isAdmin} student={student}
          onClose={() => setLotDialogMode(null)} onDone={afterLotAction}
        />
      )}

      {showEditQueue && (
        <MultiReagentEditQueue
          reagentIds={[...pickedIds.keys()]} isAdmin={isAdmin} student={student}
          onClose={() => setShowEditQueue(false)} onDone={afterEditQueue}
        />
      )}

    </div>
  )
}
