import { C } from '../design'

export function smallBtnStyle(active, activeColor = C.navy, activeBg = C.bg) {
  return {
    padding: '4px 9px', borderRadius: '6px', border: `1px solid ${active ? activeColor : C.border}`,
    background: active ? activeBg : C.white, cursor: 'pointer', fontSize: '11px',
    color: active ? activeColor : C.navy, fontWeight: '600',
  }
}

// 확인칸(장부값과 같은지 다른지)에 공통으로 쓰는 테두리/배경 —
// 아직 확인 안 함(투명) / 확인했고 장부값과 일치(파랑) / 확인했는데 장부값과 다름(빨강)
export function diffCellStyle(touched, differs) {
  if (!touched) return { border: '1px solid transparent', background: 'transparent' }
  return differs
    ? { border: `1px solid ${C.danger}`, background: C.dangerTint }
    : { border: '1px solid #1565C0', background: '#EAF1FB' }
}
