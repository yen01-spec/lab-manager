import { supabase } from './supabase'

export const LOW_STOCK_THRESHOLD = 20

export function isLowStock(lot) {
  return Number(lot?.sealed_count ?? 0) === 0 && Number(lot?.current_stock ?? 0) <= LOW_STOCK_THRESHOLD
}

export async function sendAdminNotification({ title, body }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: { title, body, role: 'admin' },
    })
    if (error) {
      console.error('알림 발송 실패:', error)
      return { ok: false, error }
    }
    console.log('알림 발송 결과:', data)
    return { ok: true, data }
  } catch (err) {
    console.error('알림 발송 실패:', err)
    return { ok: false, error: err }
  }
}

export function notifyPurchaseRequest({ userName, targetName, quantity, appended = false }) {
  return sendAdminNotification({
    title: appended ? '📎 구매 요청 수량 추가' : '📦 새 구매 요청',
    body: appended
      ? `${userName}님이 기존 ${targetName} 요청에 ${quantity} 수량을 추가했습니다.`
      : `${userName}님이 ${targetName} ${quantity} 구매를 요청했습니다.`,
  })
}

export function notifyLowStockIfNeeded({ type = 'reagent', name, lotNo, before, after }) {
  if (isLowStock(before) || !isLowStock(after)) return Promise.resolve()

  const typeLabel = type === 'item' ? '물품' : '시약'
  const lotText = lotNo ? ` · Lot ${lotNo}` : ''
  return sendAdminNotification({
    title: `⚠️ ${typeLabel} 재고 부족`,
    body: `${name || typeLabel}${lotText} 재고가 부족합니다. 미개봉 ${after.sealed_count}, 잔량 ${after.current_stock}%.`,
  })
}
