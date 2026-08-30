import { C, Card, thStyle, tdStyle } from '../../design'
import { smallBtnStyle } from '../../lib/inventoryUtils'

// 완료/중단된 회차 목록("실사 이력") — 완료된 회차는 관리자가 교차확인 모달을 열 수 있음.
export default function SessionHistoryTable({ sessions, isAdmin, onReview }) {
  const pastSessions = sessions.filter(s => s.status !== 'active' && s.status !== 'paused')
  if (pastSessions.length === 0) return null
  return (
    <Card title="📁 실사 이력">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['연도', '라벨', '시작일', '완료일', '시작자', '상태', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
        <tbody>
          {pastSessions.map(s => (
            <tr key={s.id}>
              <td style={tdStyle}>{s.year}년</td>
              <td style={tdStyle}>{s.label || <span style={{ color: C.muted }}>-</span>}</td>
              <td style={tdStyle}>{s.start_date}</td>
              <td style={{ ...tdStyle, color: C.muted }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '-'}</td>
              <td style={tdStyle}>{s.created_by}</td>
              <td style={tdStyle}>
                <span style={{ background: s.status === 'completed' ? '#E8F5E9' : '#F5F5F5', color: s.status === 'completed' ? '#2E7D32' : '#616161', padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '700' }}>
                  {s.status === 'completed' ? '완료' : '중단'}
                </span>
              </td>
              <td style={tdStyle}>
                {s.status === 'completed' && isAdmin && (
                  <button onClick={() => onReview(s)} style={{ ...smallBtnStyle(), whiteSpace: 'nowrap' }}>🔍 교차확인</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
