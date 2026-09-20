import { C } from '../../design'

// 결과 수 한 줄 / 로딩·빈 상태 — 시약목록과 일괄정리가 같은 문구 스타일을 쓴다.
// 예: 검색결과 1,323개 시약 · 1,524개 Lot (전체 …)
export function ResultSummary({ children, total }) {
  return (
    <div style={{ margin: '0 0 12px', fontSize: '14px', color: C.text }}>
      {children}
      {total ? <span style={{ color: C.muted, fontSize: '12.5px' }}> {total}</span> : null}
    </div>
  )
}

export const Count = ({ n, unit }) => <strong style={{ color: C.navy }}>{Number(n).toLocaleString()}{unit}</strong>

export function ListState({ loading, children }) {
  return (
    <div role={loading ? 'status' : undefined} style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: '13px' }}>
      {loading ? '시약 목록을 불러오는 중…' : children}
    </div>
  )
}
