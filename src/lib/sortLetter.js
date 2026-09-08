// 실제 시약장에 물리적으로 알파벳순으로 정렬할 때 쓰는 기준 글자 계산.
// 2026-2 전수조사 파일 "시약장 알파벳 정렬 기준" 시트에 있던 Excel LET 수식을
// 그대로 옮김 — 화학명 앞의 위치번호·입체이성질체 접두어(D-/L-/DL-/그리스문자/
// n-,o-,p- 등)는 무시하고, 남은 문자열에서 처음 나오는 알파벳 한 글자를 찾는다.
// (숫자·쉼표·하이픈은 "알파벳이 아님"이라 자동으로 건너뛰어짐 — 그래서 "4-Aminobenzoic
// acid"가 별도 규칙 없이 A로 계산됨.) tert-/iso-/trans- 같은 접두어는 원본 파일도
// 무시하지 않고 그대로 첫 글자로 쓰길래(IUPAC 정석은 아니지만) 기존 데이터와의
// 일관성을 위해 똑같이 유지함.
const CHAR_SUBSTITUTIONS = [['，', ','], ['ａ', 'a'], ['α', 'a'], ['β', 'b'], ['’', "'"], ['′', "'"]]
const STRIP_PREFIXES = [
  'a-', 'b-', "a,a'-", 'a,a,a-', 'dl-', 'd,l-', 'l,d-', 'd(+)', 'd(-)', 'l(+)', 'l(-)',
  'd-', 'l-', 'n-', 'o-', 'p-', 'ff-', '(r)-', '(s)-', '(r,s)-', '(s,r)-', '(±)-', '(+)-', '(-)-',
]

export function computeSortLetter(rawName) {
  const x = (rawName || '').trim()
  if (x === '' || x === '-') return null
  let n = x
  for (const [from, to] of CHAR_SUBSTITUTIONS) n = n.split(from).join(to)
  n = n.toLowerCase()
  let y = n
  for (const prefix of STRIP_PREFIXES) {
    const trimmed = y.trim()
    if (trimmed.startsWith(prefix)) y = trimmed.slice(prefix.length).trim()
  }
  const m = y.match(/[a-z]/i)
  return m ? m[0].toUpperCase() : null
}
