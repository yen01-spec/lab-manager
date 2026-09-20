// 시약 목록 → 상세 → 뒤로가기 시 화면(스크롤 위치·펼침·표시 열)을 복원하기 위한 세션 한정 저장소.
// 검색/필터 상태는 URL 쿼리(useReagentListParams)가 들고 있고, 여기엔 URL로 표현하기 어려운
// "보고 있던 위치"만 sessionStorage에 잠깐 둔다 — 탭을 닫으면 사라지고 영구 저장(localStorage)은 안 쓴다.
const KEY = 'reagentList:view:v1'

function readRaw() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// 저장된 스냅샷이 "지금 URL 쿼리와 같은 목록"의 것일 때만 돌려준다.
export function loadViewSnapshot(search) {
  const snap = readRaw()
  return snap && snap.search === search ? snap : null
}

// 부분 갱신(merge) — 표(스크롤 앵커)와 페이지(펼침/열)가 각자 자기 몫만 쓴다.
export function saveViewSnapshot(search, patch) {
  try {
    const prev = readRaw()
    const base = prev && prev.search === search ? prev : { search }
    sessionStorage.setItem(KEY, JSON.stringify({ ...base, ...patch, search }))
  } catch { /* 저장 불가(사생활 보호 모드 등)면 복원만 포기 */ }
}
