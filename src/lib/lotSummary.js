// 시약목록/상세의 "보유 N병 · N개 위치" 요약 계산 정본.
//  · 병(bottle) 수 = 보유중(active) Lot 행 하나하나(=병 1개). 묶음 행(sealed_count > 1: 한 행에 미개봉 병 여러 개)은
//    그 행의 미개봉 병 수만큼 센다 — 개봉 병(sealed_count 0)도 1병. 그래서 재고 열의 "미개봉 N병"과 어긋나지 않는다.
//  · 위치 수 = 보유중 Lot 들이 놓인 서로 다른 위치(location_id) 개수.
export function summarizeLots(activeLots) {
  const lots = activeLots || []
  return {
    bottles: lots.reduce((n, l) => n + Math.max(1, l.sealed_count || 0), 0),
    sealed: lots.reduce((n, l) => n + (l.sealed_count || 0), 0),
    locations: new Set(lots.map(l => l.location_id).filter(Boolean)).size,
  }
}

// "보유 4병 · 2개 위치" (위치가 1곳이면 위치 요약은 생략)
export function bottleSummaryText({ bottles, locations }) {
  return `보유 ${bottles}병${locations > 1 ? ` · ${locations}개 위치` : ''}`
}
