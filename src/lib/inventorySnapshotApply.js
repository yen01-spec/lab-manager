// 현재 재고 동기화 실제 적용 호출부 (Phase 4b-3a) — 코드는 완성하되, 호출부(UI 버튼)는
// 여전히 disabled로 막아둔다. supabaseAdmin(자료 CMS와 동일한 Supabase Auth 세션 +
// admin_users + is_admin() 구조)로만 RPC를 부른다. localStorage isAdmin은 여기서 아무
// 역할도 하지 않는다 — 세션이 없거나 관리자가 아니면 RPC 내부 is_admin() 체크에서 거부된다.
import { supabaseAdmin } from '../supabase'

// migration(20260914090000_inventory_snapshot_sync.sql)이 아직 운영에 적용되지 않았으므로
// 지금 호출하면 "function ... does not exist" 오류가 난다 — 이는 의도된 상태다(Phase 4b-3b
// 에서 migration을 적용한 뒤에만 실제로 성공할 수 있다).
export async function applyInventorySnapshotSync(payload) {
  const { data, error } = await supabaseAdmin.rpc('sync_inventory_snapshot', { payload })
  if (error) {
    // 원본 Postgres 오류 문구는 지우지 않고 앞에 사용자 안내를 붙인다(Phase 4b-3a.1 §28) —
    // "기술 오류를 숨기지 않는다"는 이 프로젝트 전반의 원칙과 동일.
    const friendly = mapSyncErrorMessage(error.message || '')
    const e = new Error(friendly ? `${friendly}\n\n(상세) ${error.message}` : (error.message || '현재 재고 동기화 적용 중 오류가 발생했습니다.'))
    e.raw = error.message
    throw e
  }
  return data
}

// RPC의 한국어 예외 메시지를 몇 가지 알려진 범주로만 안내문 접두어를 붙여준다(§28) —
// 원본 메시지는 항상 함께 남기고(위 applyInventorySnapshotSync), 여기서 임의로 걸러내거나
// 숨기지 않는다. 매칭되는 범주가 없으면 null(원본 메시지 그대로 사용).
export function mapSyncErrorMessage(raw) {
  const s = raw || ''
  if (s.includes('다른 관리자가 현재 재고 동기화를 진행 중')) {
    return '다른 관리자가 지금 현재 재고 동기화를 진행하고 있습니다. 잠시 후 다시 시도해주세요.'
  }
  if (s.includes('이미 적용된 재고 동기화 요청')) {
    return '이 미리보기는 이미 적용되었습니다. 새로고침해서 다시 시도하지 말고, 최신 상태로 새 미리보기를 만들어주세요.'
  }
  if (s.includes('미리보기 이후') || s.includes('동시에 변경') || s.includes('동시에 채워')) {
    return '미리보기를 만든 뒤 다른 곳에서 재고나 시약 정보가 바뀌었습니다. STEP 2부터 Excel을 다시 불러와 미리보기를 새로 만들어주세요.'
  }
  if (s.includes('복구할 수 없는 재고 상태')) {
    return '이미 사용완료·폐기·분실로 확정된 재고가 Excel에 포함되어 있습니다. 해당 항목은 정상 업무 절차(사용완료 취소, 폐기 취소 등)로 먼저 상태를 되돌린 뒤 다시 시도해주세요.'
  }
  if (s.includes('자료관리 권한이 없습니다')) {
    return '이 계정은 현재 재고 동기화 권한이 없습니다. 관리자 계정으로 다시 로그인해주세요.'
  }
  return null
}
