// 시약 일괄검색(여러 줄)의 "임시 화면 상태" 저장소 — sessionStorage.
// 여러 줄 검색어를 URL 에 통째로 넣지 않는다(URL 에는 bs=1 표시만). 상세 → 뒤로가기 / 새로고침에서는 유지되고,
// 탭을 닫으면(새 브라우저 세션) 사라진다. 영구 저장(localStorage)은 쓰지 않는다.
const KEY = 'reagentList:batch:v1'

export function loadBatch() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const b = raw ? JSON.parse(raw) : null
    return b && b.v === 1 && Array.isArray(b.matchedIds) && Array.isArray(b.unmatched) && Array.isArray(b.terms) ? b : null
  } catch { return null }
}
export function saveBatch(batch) {
  try { sessionStorage.setItem(KEY, JSON.stringify(batch)) } catch { /* 저장 불가(사생활 보호 모드 등)면 새로고침 복원만 포기 */ }
}
export function clearBatch() {
  try { sessionStorage.removeItem(KEY) } catch { /* 무시 */ }
}
