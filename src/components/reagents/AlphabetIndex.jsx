import { C } from '../../design'

// 컴포넌트 밖(모듈 스코프)에 고정 정의 — ReagentList 안에 정의하면 리렌더될 때마다
// "새로운 컴포넌트"로 취급되어 표 전체 DOM이 매번 통째로 재생성된다(더블클릭 감지가
// 깨지는 원인이기도 했음). 필요한 값은 전부 props로 받는다.
export default function AlphabetIndex({ data, editMode, scrollToLetter }) {
  if (editMode) return null
  const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const availableLetters = new Set(data.map(r => r.name[0].toUpperCase()))
  // A~Z는 항상 표시(없으면 연하게, 있으면 J처럼 진하게) — 그 외 문자(숫자·한글 등)는
  // 실제 목록에 있을 때만 동적으로 추가되고, 사라지면 인덱스에서도 같이 사라짐.
  const extra = [...availableLetters].filter(l => !BASE.includes(l)).sort((a, b) => a.localeCompare(b, 'ko'))
  const allLetters = [...BASE, ...extra]
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
