import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

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
  return {
    ...r,
    _activeLots: activeLots,
    _totalSealed: totalSealed,
    _avgStock: avgStock,
    _isLow: isLow,
    _hasPendingConfirm: hasPendingConfirm,
    _ghsList: getGhsPictograms(r.ghs_pictograms),
    _hazardClassNames: (r.hazard_classifications || []).map(c => c.name),
    _onlyLot: activeLots.length === 1 ? activeLots[0] : null,
    _canExpand: allLots.length > 1,
    _activeLocIds: activeLocIds,
    _multiLocation: activeLocIds.length > 1,
  }
}

// 시약목록 화면의 데이터 조회 부분(위치 목록/전체 개수/검색·필터 결과)만 떼어낸 훅 —
// ReagentList.jsx 쪽은 이 훅이 내려주는 데이터/상태를 "어떻게 보여줄지"만 신경 쓰면 됨.
export function useReagentSearch({ initialSearch = '' } = {}) {
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState(initialSearch)
  // 위치 필터 — 방(room) 탭 + (세부위치가 있는 방이면) 세부위치 알약 2단계 구조.
  // roomFilter=''(전체) | 방 이름. detailFilter=''(그 방 전체) | 특정 위치 id.
  const [roomFilter, setRoomFilter] = useState('')
  const [detailFilter, setDetailFilter] = useState('')
  const [results, setResults] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const fetchRequestRef = useRef(0)

  useEffect(() => { fetchLocations(); fetchTotalCount() }, [])

  // 검색어(홈 화면 ?q= 포함) 또는 필터가 바뀔 때마다 결과를 다시 불러온다
  useEffect(() => {
    fetchResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomFilter, detailFilter])

  async function fetchLocations() {
    const { data } = await supabase.from('locations').select('*').order('room')
    if (data) setLocations(data)
  }

  async function fetchTotalCount() {
    const { count } = await supabase.from('reagents').select('*', { count: 'exact', head: true }).neq('status', 'archived')
    setTotalCount(count || 0)
  }

  async function fetchResults() {
    const myRequestId = ++fetchRequestRef.current
    // 목록 화면에서 실제로 쓰는 컬럼만 select — 예전엔 '*'로 모든 컬럼 + 위치 join까지
    // 통째로 가져와서(안 쓰는 locations(*) join 포함) 1,500여 개 시약 응답이 5MB가
    // 넘었음. 그게 페이지 진입마다 체감되는 지연의 큰 원인이라 필요한 것만 좁힘.
    let query = supabase.from('reagents')
      .select('id, name, cas_no, company, purity, volume, unit, category, hazard, ghs_pictograms, hazard_classifications, reagent_type, pending_confirm, msds_url, last_confirmed_at, reagent_lots(id, status, sealed_count, current_stock, location_id, lot_no, expiry_date, cat_no, pending_confirm)', { count: 'exact' })
      .neq('status', 'archived')
    if (search.trim()) query = query.or(`name.ilike.%${search.trim()}%,cas_no.ilike.%${search.trim()}%`)
    // detailFilter(특정 위치 하나) > roomFilter(그 방에 속한 모든 위치) > 전체(필터 없음) 순.
    const activeLocationIds = detailFilter
      ? [detailFilter]
      : roomFilter ? locations.filter(l => l.room === roomFilter).map(l => l.id) : null
    if (activeLocationIds) {
      // 마스터(reagents.location_id)가 아니라 실제 보유중인(active) Lot의 위치를 기준으로 찾음
      const { data: matchLots } = await supabase.from('reagent_lots')
        .select('reagent_id').in('location_id', activeLocationIds).eq('status', 'active')
      const matchIds = [...new Set((matchLots || []).map(l => l.reagent_id))]
      if (fetchRequestRef.current !== myRequestId) return
      if (matchIds.length === 0) { setResults([]); return [] }
      query = query.in('id', matchIds)
    }
    const { data, count } = await query.range(0, 4999)
    if (fetchRequestRef.current !== myRequestId) return // 늦게 도착한 응답이 최신 필터 결과를 덮어쓰지 않도록 함
    if (count > 4999) {
      alert(`⚠️ 시약이 ${count}개로 많아 일부만 표시됩니다. 관리자에게 문의하세요.`)
    }
    if (data) {
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name)).map(enrichReagent)
      setResults(sorted)
      return sorted
    }
  }

  return {
    locations, search, setSearch, roomFilter, setRoomFilter, detailFilter, setDetailFilter,
    results, setResults, totalCount, fetchResults, fetchLocations,
  }
}
