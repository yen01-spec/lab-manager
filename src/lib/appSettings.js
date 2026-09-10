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

// 강원대학교 연구실안전관리시스템 — 관리자가 설정에서 바꿀 수 있음(school_safety_system_url).
export const SCHOOL_SAFETY_SYSTEM_FALLBACK = 'https://safety.kangwon.ac.kr/'
