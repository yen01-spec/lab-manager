import { C } from '../../design'

// 컴포넌트 밖(모듈 스코프)에 고정 정의 — ReagentList 안에 정의하면 리렌더될 때마다
// "새로운 컴포넌트"로 취급되어 표 전체 DOM이 매번 통째로 재생성된다(더블클릭 감지가
// 깨지는 원인이기도 했음). 필요한 값은 전부 props로 받는다.
export default function AlphabetIndex({ data, scrollToLetter }) {
  const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  // sort_letter가 있으면 우선 사용 — 화학명 앞의 위치번호·입체이성질체 접두어(예:
  // "D-Raffinose"→R, "n-Butyl alcohol"→B)를 무시하고 실제 시약장에 정렬된 알파벳
  // 기준과 맞추기 위함(2026-2 전수조사 파일의 "알파벳" 컬럼). 없으면(수동 등록 등) name[0]으로 폴백.
  const availableLetters = new Set(data.map(r => (r.sort_letter || r.name[0]).toUpperCase()))
  // A~Z는 항상 표시(없으면 연하게, 있으면 J처럼 진하게) — 그 외 문자(숫자·한글 등)는
  // 실제 목록에 있을 때만 동적으로 추가되고, 사라지면 인덱스에서도 같이 사라짐.
  // ReagentTable의 그룹 순서(Object.keys(groups).sort() — 코드 포인트 기준 기본 정렬)와
  // 똑같이 정렬해야 한다. 예전엔 항상 "A~Z 먼저, 숫자/한글은 뒤에" 순서로 고정해뒀는데,
  // 실제 목록은 숫자(0-9)가 코드 포인트상 A보다 작아서 0/1/2... 그룹이 맨 앞에 오는 반면
  // 인덱스는 A가 먼저 나와서 순서가 어긋나 있었음.
  const allLetters = [...new Set([...BASE, ...availableLetters])].sort()
  return (
    <div style={{
      width: '22px', flexShrink: 0, marginLeft: '4px',
      position: 'sticky', top: '96px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {allLetters.map(letter => (
        <button key={letter} onClick={() => scrollToLetter(letter)}
          disabled={!availableLetters.has(letter)} style={{
            width: '22px', height: '18px', border: 'none', background: 'transparent',
            cursor: availableLetters.has(letter) ? 'pointer' : 'default',
            color: availableLetters.has(letter) ? C.navy : '#D5D9E0',
            fontSize: '11px', fontWeight: availableLetters.has(letter) ? '700' : '400', padding: 0,
            transition: 'color 0.1s, background 0.1s', borderRadius: '4px',
          }}
          onMouseEnter={e => { if (availableLetters.has(letter)) { e.currentTarget.style.color = C.white; e.currentTarget.style.background = C.blue } }}
          onMouseLeave={e => { if (availableLetters.has(letter)) { e.currentTarget.style.color = C.navy; e.currentTarget.style.background = 'transparent' } }}
        >{letter}</button>
      ))}
    </div>
  )
}
