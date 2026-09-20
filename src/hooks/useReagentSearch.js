import { useEffect, useRef, useState } from 'react'
import { reagentOrFilter, searchTermVariants } from '../lib/reagentSearch'
import { supabase } from '../supabase'
import { fetchAllPages } from '../lib/fetchAllPages'
import { getHazardCategory } from '../lib/hazardCategory'
import { getSpecialManagementInfo } from '../lib/specialManagementSubstances'

// 국가유해물질정보(KECO) GHS 조회 API의 공식 픽토그램 코드(pctgrmCd) → 표시용 매핑.
// ReagentDetail.jsx의 GHS_PICTOGRAM_MAP과 동일 — 목록 화면 전용 훅이라 별도 파일에 둠.
const GHS_PICTOGRAM_MAP = {
  GHS01: { emoji: '💥', label: '폭발성' },
  GHS02: { emoji: '🔥', label: '인화성' },
  GHS03: { emoji: '🔥', label: '산화성' },
  GHS04: { emoji: '🫧', label: '고압가스' },
  GHS05: { emoji: '🧪', label: '부식성' },
  GHS06: { emoji: '💀', label: '급성독성' },
  GHS07: { emoji: '⚠️', label: '유해성·자극성' },
  GHS08: { emoji: '☣️', label: '건강유해성' },
  GHS09: { emoji: '🌊', label: '환경유해성' },
}

function getGhsPictograms(codes) {
  if (!codes) return []
  return codes.split('^').filter(Boolean).map(code => ({ code, ...(GHS_PICTOGRAM_MAP[code] || { emoji: '❓', label: code }) }))
}


// ── 재고실사 진행 중(시작~최종 반영 전) 미확정 실사값 오버레이 ───────────────────────────
// 실사 흐름: 학생이 Lot을 [완료]하면 실사값이 inventory_counts에 저장될 뿐 장부(reagents/reagent_lots)는
// 그대로다(최종 반영 때 서버가 한 번에 반영). 그래도 시약목록에서는 "실사에서 확인한 값"이 보이도록
// 완료된 항목의 값을 화면 표시용으로만 덮어쓰고, 어느 값이 미확정인지(_unconf)를 표시해 셀 배경색으로 알린다.
const R_KEYS = ['name', 'cas_no', 'company', 'hazard', 'category', 'volume', 'unit', 'purity']

async function fetchInventoryOverlay() {
  const { data: sess } = await supabase.from('inventory_sessions').select('id, status, label, year')
    .in('status', ['active', 'paused', 'reviewed']).order('created_at', { ascending: false }).limit(1)
  if (!sess || sess.length === 0) return null
  const rows = await fetchAllPages((from, to) => supabase.from('inventory_counts')
    .select('lot_id, reagent_id, actual_sealed, actual_stock, reported_missing, staged_location_id, staged_reagent_fields, staged_lot_fields')
    .eq('session_id', sess[0].id).not('actual_sealed', 'is', null).range(from, to))
  const byLot = new Map()
  const byReagent = new Map()
  for (const c of rows || []) {
    byLot.set(c.lot_id, c)
    if (c.staged_reagent_fields && !byReagent.has(c.reagent_id)) byReagent.set(c.reagent_id, c.staged_reagent_fields)
  }
  return { session: sess[0], byLot, byReagent, count: byLot.size }
}

function applyOverlay(r, overlay) {
  if (!overlay) return r
  const unconf = { stock: false, location: false, lotNo: false, missing: false, fields: {} }
  let touched = false
  const lots = (r.reagent_lots || []).map(l => {
    const c = overlay.byLot.get(l.id)
    if (!c) return l
    touched = true
    unconf.stock = true
    const nl = { ...l, sealed_count: c.actual_sealed, current_stock: c.actual_stock ?? l.current_stock }
    if (c.staged_location_id && c.staged_location_id !== l.location_id) { nl.location_id = c.staged_location_id; unconf.location = true }
    for (const k of ['lot_no', 'cat_no']) {
      const v = c.staged_lot_fields?.[k]
      if (v != null && v !== (l[k] ?? '')) { nl[k] = v; if (k === 'lot_no') unconf.lotNo = true }
    }
    if (c.reported_missing) unconf.missing = true
    return nl
  })
  if (!touched) return r
  const next = { ...r, reagent_lots: lots }
  const staged = overlay.byReagent.get(r.id)
  if (staged) {
    for (const k of R_KEYS) {
      if (k in staged && String(staged[k] ?? '') !== String(r[k] ?? '')) { next[k] = staged[k]; unconf.fields[k] = true }
    }
  }
  next._unconf = unconf
  return next
}

// Lot 필터링/평균 계산/GHS 매칭처럼 시약 데이터 자체(Lot 목록·유해성 문구)에만 좌우되고
// 화면 상태(체크/선택/컬럼 표시 등)와는 무관한 값들을 "불러올 때 딱 한 번만" 계산해서
// 각 시약 객체에 붙여둔다. 이 값들을 매 렌더링마다 새로 계산하던 게(특히 컬럼 체크박스를
// 켜고 끌 때 1,500여 개 행 전부를 다시 계산) 화면이 멈춘 것처럼 보이던 주요 원인이었음.
function enrichReagent(r) {
  const allLots = r.reagent_lots || []
  const activeLots = allLots.filter(l => l.status === 'active')
  const totalSealed = activeLots.reduce((s, l) => s + l.sealed_count, 0)
  const avgStock = activeLots.length > 0
    ? Math.round(activeLots.reduce((s, l) => s + l.current_stock, 0) / activeLots.length) : 0
  const isLow = activeLots.some(l => l.sealed_count === 0 && l.current_stock <= 20)
  const hasPendingConfirm = r.pending_confirm || activeLots.some(l => l.pending_confirm)
  const activeLocIds = [...new Set(activeLots.map(l => l.location_id).filter(Boolean))]
  const hazardCategory = getHazardCategory(r.hazard_classifications)
  return {
    ...r,
    _activeLots: activeLots,
    _totalSealed: totalSealed,
    _avgStock: avgStock,
    _isLow: isLow,
    _hasPendingConfirm: hasPendingConfirm,
    _ghsList: getGhsPictograms(r.ghs_pictograms),
    _hazardClassNames: (r.hazard_classifications || []).map(c => c.name),
    _hazardCategory: hazardCategory.category,
    _fireSafetyClass: hazardCategory.fireSafetyClass,
    _specialManagement: getSpecialManagementInfo(r.name, r.cas_no),
    _casMismatch: r.cas_verification_status === 'mismatch',
    _onlyLot: activeLots.length === 1 ? activeLots[0] : null,
    _canExpand: allLots.length > 1,
    _activeLocIds: activeLocIds,
    _multiLocation: activeLocIds.length > 1,
  }
}

// 시약목록 화면의 데이터 조회 부분(위치 목록/전체 개수/검색·필터 결과)만 떼어낸 훅 —
// ReagentList.jsx 쪽은 이 훅이 내려주는 데이터/상태를 "어떻게 보여줄지"만 신경 쓰면 됨.
// search/roomFilter/detailFilter는 URL 쿼리(useReagentListParams)가 들고 있고 여기선 받아서 쓰기만 한다.
// 위치 필터 — 방(room) 탭 + (세부위치가 있는 방이면) 세부위치 알약 2단계 구조.
// roomFilter=''(전체) | 방 이름. detailFilter=''(그 방 전체) | 특정 위치 id.
export function useReagentSearch({ search = '', roomFilter = '', detailFilter = '' } = {}) {
  const [locations, setLocations] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [overlayInfo, setOverlayInfo] = useState(null) // 진행 중 실사가 있을 때 { status, label, year, count }
  const [totalCount, setTotalCount] = useState(0)
  const fetchRequestRef = useRef(0)

  useEffect(() => { fetchLocations(); fetchTotalCount() }, [])

  // 확정된 검색어(홈 화면 ?q= 포함) 또는 필터가 바뀔 때마다 결과를 다시 불러온다.
  // search는 "입력 중"이 아니라 Enter/검색 버튼으로 확정된 값만 담기므로(ReagentToolbar가
  // 입력 상태를 따로 들고 있음), 타이핑 한 글자마다 재조회되지 않는다.
  // 방 필터가 URL로 복원돼 들어오면(뒤로가기·링크) 위치 목록이 아직 비어 있을 수 있다 —
  // 방→위치 id 변환에 필요하므로 locations가 도착할 때까지 조회를 미룬다.
  const locationsReady = !(roomFilter && !detailFilter) || locations.length > 0
  useEffect(() => {
    if (!locationsReady) return
    fetchResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roomFilter, detailFilter, locationsReady])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  // 홈 화면의 "전체 시약 N종"과 기준을 맞추기 위해(제조사/순도 무시, 이름만 중복 제거)
  // 단순 행 개수가 아니라 고유 이름 수를 센다.
  async function fetchTotalCount() {
    const { data } = await supabase.from('reagents').select('name').neq('status', 'archived')
    const uniqueNames = new Set((data || []).map(r => r.name.trim().toLowerCase()))
    setTotalCount(uniqueNames.size)
  }

  async function fetchResults() {
    const myRequestId = ++fetchRequestRef.current
    setLoading(true)
    // 목록 화면에서 실제로 쓰는 컬럼만 select — 예전엔 '*'로 모든 컬럼 + 위치 join까지
    // 통째로 가져와서(안 쓰는 locations(*) join 포함) 1,500여 개 시약 응답이 5MB가
    // 넘었음. 그게 페이지 진입마다 체감되는 지연의 큰 원인이라 필요한 것만 좁힘.
    // 목록/필터/행에서 실제로 쓰는 컬럼만. (raw 'hazard' 텍스트는 목록에서 안 쓰고
    // 유해분류는 hazard_classifications만 사용 — payload를 줄이려 select에서 뺐다.)
    const SELECT = 'id, name, name_ko, cas_no, company, purity, volume, unit, category, ghs_pictograms, hazard_classifications, reagent_type, pending_confirm, msds_url, last_confirmed_at, cas_verification_status, cas_verification_note, sort_letter, reagent_lots(id, status, sealed_count, current_stock, location_id, lot_no, expiry_date, cat_no, pending_confirm)'
    // detailFilter(특정 위치 하나) > roomFilter(그 방에 속한 모든 위치) > 전체(필터 없음) 순.
    const activeLocationIds = detailFilter
      ? [detailFilter]
      : roomFilter ? locations.filter(l => l.room === roomFilter).map(l => l.id) : null
    let matchIds = null
    if (activeLocationIds) {
      // 마스터(reagents.location_id)가 아니라 실제 보유중인(active) Lot의 위치를 기준으로 찾음
      const { data: matchLots } = await supabase.from('reagent_lots')
        .select('reagent_id').in('location_id', activeLocationIds).eq('status', 'active')
      matchIds = [...new Set((matchLots || []).map(l => l.reagent_id))]
      if (fetchRequestRef.current !== myRequestId) return
      if (matchIds.length === 0) { setResults([]); setLoading(false); return [] }
    }
    const runQuery = (term) => {
      let q = supabase.from('reagents').select(SELECT, { count: 'exact' }).neq('status', 'archived')
      // 국문명(name_ko)·영문명(name)·CAS 통합 검색 — "에탄올" / "Ethanol" / "64-17-5" 모두 매칭
      if (term) q = q.or(reagentOrFilter(term))   // 자동추천과 같은 검색 규칙(lib/reagentSearch)
      if (matchIds) q = q.in('id', matchIds)
      return q.range(0, 4999)
    }
    let { data, count } = await runQuery(search.trim())
    // 원문으로 아무것도 못 찾았고 "이름(약어)" 꼴이면, 자동추천/일괄검색과 같은 괄호 대체 검색어로 한 번씩 더 찾는다(원문 결과는 넓히지 않음).
    if (data && data.length === 0 && search.trim()) {
      for (const v of searchTermVariants(search).slice(1)) {
        if (fetchRequestRef.current !== myRequestId) return
        const r = await runQuery(v)
        if (r.data && r.data.length > 0) { data = r.data; count = r.count; break }
      }
    }
    if (fetchRequestRef.current !== myRequestId) return // 늦게 도착한 응답이 최신 필터 결과를 덮어쓰지 않도록 함
    if (count > 4999) {
      alert(`⚠️ 시약이 ${count}개로 많아 일부만 표시됩니다. 관리자에게 문의하세요.`)
    }
    if (data) {
      let overlay = null
      try { overlay = await fetchInventoryOverlay() } catch { overlay = null }
      if (fetchRequestRef.current !== myRequestId) return
      // 정렬은 장부 이름 기준(실사 중 이름 수정으로 목록 순서가 튀지 않게), 표시값만 오버레이
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name)).map(r => enrichReagent(applyOverlay(r, overlay)))
      setOverlayInfo(overlay ? { status: overlay.session.status, label: overlay.session.label, year: overlay.session.year, count: overlay.count } : null)
      setResults(sorted)
      setLoading(false)
      return sorted
    }
    setLoading(false)
  }

  return {
    locations, results, setResults, loading, overlayInfo, totalCount, fetchResults, fetchLocations,
  }
}
