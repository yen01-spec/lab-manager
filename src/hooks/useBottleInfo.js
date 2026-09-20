import { useEffect, useMemo, useState } from 'react'
import { fetchBottleInfo } from '../lib/bottleInfo'

// 요청 목록(lot_id 보유)에 해당하는 병 정보를 한 번에 조회한다. 실패 시 빈 Map(화면은 요청 행의 저장값만 표시).
export function useBottleInfo(requests) {
  const key = useMemo(() => [...new Set((requests || []).map(r => r.lot_id).filter(Boolean))].sort().join(','), [requests])
  const [map, setMap] = useState(() => new Map())
  useEffect(() => {
    let alive = true
    fetchBottleInfo(key ? key.split(',') : []).then(m => { if (alive) setMap(m) }).catch(() => { if (alive) setMap(new Map()) })
    return () => { alive = false }
  }, [key])
  return map
}
