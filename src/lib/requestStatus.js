// 시약 상세/홈/관리자 요청 화면이 같이 쓰는 "요청 3종" 상태 문구·색상 — 화면마다 표현이 달라지지 않게 한 곳에 둔다.
//   위치 변경 / 시약정보 수정 / 폐기 는 모두 같은 흐름이다:
//     학생 신청(pending: 실제 master/Lot 불변) → 관리자 승인(실제 반영) 또는 반려(실제 변화 0)
//   폐기는 승인 = 즉시 폐기 완료(status 'disposed'), 별도 "폐기 완료" 2단계 없음.
export const REQUEST_NOUN = { location: '위치 변경', change: '시약정보 수정', disposal: '폐기' }

export const SUBMIT_SUCCESS = {
  location: '위치 변경 신청이 완료되었습니다.',
  change: '시약정보 수정 신청이 완료되었습니다.',
  disposal: '폐기 신청이 완료되었습니다.',
}

// 관리자 처리 직후 안내
export const REVIEW_RESULT = {
  location: { approve: '위치 변경이 완료되었습니다.', reject: '위치 변경 신청이 반려되었습니다.' },
  change: { approve: '시약정보 수정이 완료되었습니다.', reject: '시약정보 수정 신청이 반려되었습니다.' },
  disposal: { approve: '폐기가 완료되었습니다.', reject: '폐기 신청이 반려되었습니다.' },
}

// audience: 'student'(신청한 사람 관점) | 'admin'(처리하는 사람 관점) — 같은 pending row 를 서로 다른 말로 부르되 의미는 같다.
export function requestStatusLabel(kind, status, audience = 'student') {
  const noun = REQUEST_NOUN[kind]
  if (status === 'pending') return audience === 'admin' ? `${noun} 요청 대기` : `${noun} 신청 완료 · 관리자 검토 대기`
  if (status === 'rejected') return `${noun} 반려`
  if (kind === 'disposal') {
    if (status === 'disposed') return '폐기 완료'
    if (status === 'approved') return '폐기 승인 · 처리 대기(이전 방식 잔재)'
  }
  if (status === 'approved') return `${noun} 완료`
  return status
}

const COLORS = {
  pending: { bg: '#FFF3E0', fg: '#B45F06' },
  done: { bg: '#E8F5E9', fg: '#2E7D32' },
  rejected: { bg: '#FFEBEE', fg: '#C62828' },
}
export function requestStatusColor(status) {
  if (status === 'pending' || (status === 'approved')) return COLORS.pending
  if (status === 'rejected') return COLORS.rejected
  return COLORS.done
}
// 위치/수정은 approved, 폐기는 disposed 가 "완료" — 색은 그걸 반영
export function requestStatusColorFor(kind, status) {
  if (kind !== 'disposal' && status === 'approved') return COLORS.done
  return requestStatusColor(status)
}

export const DUPLICATE_PENDING_MESSAGE = {
  location: '이 Lot은 이미 위치 변경 신청이 접수되어 관리자 검토 대기 중입니다.',
  change: '이 항목은 이미 수정 신청이 접수되어 관리자 검토 대기 중입니다.',
  disposal: '이 Lot은 이미 폐기 신청이 접수되어 관리자 검토 대기 중입니다.',
}

// 최근 14일 안에 반려된 신청만, 최신순 상위 n개 — 반려 사유를 학생에게 잠깐 보여주기 위함(영구 표시 아님).
export function pickRecentRejected(items, n = 3, days = 14) {
  const since = Date.now() - days * 86400000
  const at = x => new Date(x.r.approved_at || x.r.created_at).getTime()
  return items.filter(x => at(x) >= since).sort((a, b) => at(b) - at(a)).slice(0, n)
}
