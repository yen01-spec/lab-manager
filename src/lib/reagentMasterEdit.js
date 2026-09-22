// 시약 기본정보 저장/신청 — 관리자는 직접 저장, 일반 사용자는 항목별 신청(서버 RPC).
// ReagentDetail(단일 편집)과 MultiReagentEditQueue(여러 시약 순차 편집)가 공유한다.
import { supabase, supabaseAdmin } from '../supabase'
import { getSessionToken } from './session'
import { MASTER_KEYS, SOURCE_COL, FIELD_LABELS } from './reagentMasterFields'

const norm = (v) => String(v ?? '').trim()

export async function saveReagentMasterFields({ id, isAdmin, student, draft, reagent, pendingChanges }) {
  const cur = (k) => (reagent && reagent[k] != null ? String(reagent[k]) : '')
  const keys = MASTER_KEYS.filter(k => draft[k] !== undefined && norm(draft[k]) !== norm(cur(k)) && (isAdmin || !(pendingChanges || []).some(p => p.field_name === k)))
  if (keys.length === 0) return { ok: false, reason: 'nochange' }
  if (keys.includes('volume')) {
    const v = norm(draft.volume)
    if (v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return { ok: false, reason: 'badvolume' }
  }
  if (isAdmin) {
    const update = {}
    for (const k of keys) {
      const t = norm(draft[k])
      update[k] = t === '' ? null : (k === 'volume' ? Number(t) : t)
      if (SOURCE_COL[k]) update[SOURCE_COL[k]] = 'manual'
    }
    const { error } = await supabaseAdmin.from('reagents').update(update).eq('id', id)
    if (error) return { ok: false, reason: 'error', message: error.message || '저장 중 오류가 발생했어요' }
    return { ok: true, mode: 'admin', update, keys }
  }
  if (!student) return { ok: false, reason: 'nologin' }
  let okN = 0
  const errs = []
  for (const k of keys) {
    // requested_by 등 신원은 client 가 보내지 않는다 — 서버가 session_token 으로 확정한다.
    const { error } = await supabase.rpc('reagent_change_request_submit', {
      p_session_token: getSessionToken(), p_reagent_id: id, p_field_name: k, p_old_value: cur(k), p_new_value: norm(draft[k]),
    })
    if (error) errs.push(`${FIELD_LABELS[k] || k}: ${error.message || '신청 중 오류가 발생했어요'}`); else okN++
  }
  return { ok: okN > 0, mode: 'student', okN, errs, keys }
}
