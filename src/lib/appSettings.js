import { supabase } from '../supabase'

// app_settings(key-value 테이블) 단건 조회/저장 헬퍼. 새 스키마 없이 설정값을 늘린다.
export async function getSetting(key, fallback = '') {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return data?.value ?? fallback
}

// 있으면 update, 없으면 insert (마이그레이션 없이 새 키 추가 허용)
export async function setSetting(key, value) {
  const { data } = await supabase.from('app_settings').select('key').eq('key', key).maybeSingle()
  if (data) return supabase.from('app_settings').update({ value }).eq('key', key)
  return supabase.from('app_settings').insert({ key, value })
}

// http/https 형태만 통과 — javascript: 등 비정상 URL 실행 방지
export function safeUrl(u) {
  const s = (u || '').toString().trim()
  return /^https?:\/\//i.test(s) ? s : null
}

// 관리자가 설정에서 바꿀 수 있는 외부 링크들 (app_settings key-value, 마이그레이션 없음)
export const SCHOOL_SAFETY_SYSTEM_FALLBACK = 'https://safety.kangwon.ac.kr/'
// KOSHA MSDS 경고표지 작성 — 소분용기 경고표지는 앱 자체 생성 대신 이 공식 기능을 사용
export const KOSHA_LABEL_FALLBACK = 'https://msds.kosha.or.kr/'
