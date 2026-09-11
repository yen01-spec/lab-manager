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
    // RPC가 던지는 한국어 예외 메시지(§7/§8/§9/§24의 stale-preview·중복실행 등)를 그대로 보여준다 —
    // 프론트가 임의로 뭉뚱그리지 않는다. 실패해도 호출부 state(선택한 파일/REVIEW/미리보기)는
    // 그대로 유지한다(초기화는 이 함수의 책임이 아님 — 호출부 컴포넌트가 담당).
    throw new Error(error.message || '현재 재고 동기화 적용 중 오류가 발생했습니다.')
  }
  return data
}
