import { supabase } from '../supabase'

// 병 1개 = reagent_lots 1행. 요청 처리 화면에서 "어느 병인지" 보여주기 위한 조회/표시 유틸.
// (lot_no 는 제조사 배치 번호라 병 식별키가 아니다 — 화면에 병 ID(reagent_lots.id 앞 8자리)를 함께 보여준다.)
export const locationText = (loc) => loc ? `${loc.room}${loc.detail ? ' - ' + loc.detail : ''}` : '미지정'

export function bottleState(lot) {
  if (!lot) return null
  if (lot.status !== 'active') return { open: null, text: `상태: ${lot.status}` }
  return lot.sealed_count > 0
    ? { open: false, text: '미개봉' }
    : { open: true, text: `개봉 · 잔량 ${lot.current_stock}%` }
}

export const shortLotId = (id) => (id ? String(id).slice(0, 8) : '-')

export async function fetchBottleInfo(lotIds) {
  const ids = [...new Set((lotIds || []).filter(Boolean))]
  const out = new Map()
  if (ids.length === 0) return out
  const { data } = await supabase
    .from('reagent_lots')
    .select('id, lot_no, sealed_count, current_stock, status, location_id, reagents(name, company, volume, unit), locations(room, detail)')
    .in('id', ids)
  for (const l of data || []) out.set(l.id, l)
  return out
}
