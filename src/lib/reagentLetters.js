// 시약 목록 A–Z 그룹핑의 정본 — 시약목록(ReagentTable/MobileReagentList/AlphabetIndex)과 일괄정리가 같은 기준을 쓴다.
//  · 그룹 글자 = sort_letter(화학명 앞 위치번호·입체이성질체 접두어를 무시한 시약장 정렬 기준) 우선, 없으면 이름 첫 글자.
//  · 그룹 순서 = 글자 코드 포인트순(숫자 → A~Z → 한글 …). 그룹 안 순서는 입력 순서(=영문명 정렬 결과)를 그대로 유지한다.
//  · 바로가기 인덱스는 A~Z 를 항상 표시하고, 그 외 글자는 실제 목록에 있을 때만 덧붙인다.
export const BASE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export const letterOf = (r) => String(r.sort_letter || (r.name || '')[0] || '#').toUpperCase()

// data → [{ letter, items }] (letter 코드 포인트순)
export function groupByLetter(data) {
  const groups = {}
  for (const r of data) (groups[letterOf(r)] ||= []).push(r)
  return Object.keys(groups).sort().map(letter => ({ letter, items: groups[letter] }))
}

export const availableLetterSet = (data) => new Set(data.map(letterOf))
export const allLetters = (available) => [...new Set([...BASE_LETTERS, ...available])].sort()
