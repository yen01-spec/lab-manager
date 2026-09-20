import { supabaseAdmin } from '../supabase'

// 관리자 요청 처리 RPC 래퍼 — 전부 Supabase Auth 관리자 세션(supabaseAdmin)으로만 호출된다.
// 승인자 이름/변경 내용은 client가 보내지 않는다(서버가 auth.uid()와 DB의 요청 행으로 확정).
async function call(fn, args) {
  const { data, error } = await supabaseAdmin.rpc(fn, args)
  if (error) throw new Error(error.message || '처리 중 오류가 발생했습니다.')
  return data
}

export const reviewChangeRequest = (id, decision, reason = null) =>
  call('reagent_change_request_review', { p_request_id: id, p_decision: decision, p_reason: reason })
export const reviewLocationRequest = (id, decision, reason = null) =>
  call('location_request_review', { p_request_id: id, p_decision: decision, p_reason: reason })
// action: approve | reject | complete | approve_and_zero_lot | dispose_lot
export const reviewDisposalRequest = (id, action, reason = null) =>
  call('disposal_request_review', { p_request_id: id, p_action: action, p_reason: reason })
export const adminMoveLots = (lotIds, toLocationId) =>
  call('admin_move_lots', { p_lot_ids: lotIds, p_to_location_id: toLocationId })
export const adminDisposeLots = (lotIds, reason) =>
  call('admin_dispose_lots', { p_lot_ids: lotIds, p_reason: reason })
