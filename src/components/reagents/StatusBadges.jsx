import { C } from '../../design'

// 목록/상세의 작은 알약 배지 — "색 하나가 여러 의미를 갖지 않도록" 종류를 고정한다.
//  neutral : 정보 요약(보유 N병 · N개 위치 · 제조사 N곳) — 회색, 상태가 아님
//  warning : 조치가 필요한 상태(재고 부족)               — 붉은색
//  pending : 검토/확정 대기(검토대기)                     — 파란색
//  notice  : 주의 보고(미확인 보고, 확인필요)              — 노란색
//  info    : 분류 표시(직접제조)                          — 연한 파랑
const KINDS = {
  neutral: { background: C.chipNeutral, color: C.chipText },
  warning: { background: '#FFEBEE', color: C.dangerDark },
  pending: { background: '#E3F2FD', color: '#1565C0' },
  notice: { background: '#FFF3CD', color: '#8A5A16' },
  info: { background: '#EAF1FB', color: '#1F4E96' },
}

export function Badge({ kind = 'neutral', title, onClick, style, children, ...rest }) {
  return (
    <span title={title} onClick={onClick} data-badge={kind} {...rest} style={{
      display: 'inline-block', fontSize: '10.5px', fontWeight: 700, lineHeight: 1.5, padding: '1px 8px', borderRadius: '999px',
      whiteSpace: 'nowrap', marginLeft: '6px', verticalAlign: 'middle', ...KINDS[kind], ...style,
    }}>{children}</span>
  )
}

export const LOW_STOCK_TITLE = '미개봉 병이 없고, 개봉한 병의 잔량이 20% 이하인 병이 있어요'
