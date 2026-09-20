// 입력칸 아래(공간이 모자라면 위)에 띄우는 팝오버의 viewport 안전 위치 계산 — position:fixed + 포털 전용.
// 자동추천(ReagentSearchInput)과 제조사 선택(CompanyPicker)이 같은 규칙을 쓴다.
//  · 좌우: 화면(visualViewport) 밖으로 나가지 않게 clamp(모바일 확대/키보드 포함)
//  · 상하: 아래 공간이 minBelow 이상이거나 위보다 크면 아래, 아니면 위. maxHeight 를 넘으면 내부 세로 스크롤.
const MARGIN = 8

export function computePlacement(rect, { width: want, minWidth = 280, minBelow = 220, maxHeightCap = 360 } = {}) {
  const vv = window.visualViewport
  const vw = vv?.width ?? window.innerWidth
  const vTop = vv?.offsetTop ?? 0
  const vLeft = vv?.offsetLeft ?? 0
  const vh = vv?.height ?? window.innerHeight
  const width = Math.min(want ?? Math.max(rect.width, minWidth), vw - MARGIN * 2)
  const left = Math.min(Math.max(rect.left, vLeft + MARGIN), vLeft + vw - width - MARGIN)
  const below = vTop + vh - rect.bottom - MARGIN
  const above = rect.top - vTop - MARGIN
  const placeBelow = below >= minBelow || below >= above
  const maxHeight = Math.max(120, Math.min(maxHeightCap, placeBelow ? below : above))
  return placeBelow
    ? { left, width, top: rect.bottom + 4, maxHeight, placeBelow }
    : { left, width, bottom: window.innerHeight - rect.top + 4, maxHeight, placeBelow }
}
