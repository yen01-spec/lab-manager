import { supabase } from '../supabase'

// 자료 탭 공식 자료(resource_files) 조회 헬퍼. (Phase 5-h1: 인터페이스만. UI 연결은 5-h2)
// resource_type: 'form'(필수 양식) | 'official'(공식 지침·매뉴얼) | 'reference'(참고자료)

// 한 section 의 모든 자료(현재 + 이전 버전 전부). sort_order → created_at 순.
export async function getResources(categoryKey, sectionKey) {
  const { data } = await supabase.from('resource_files')
    .select('*')
    .eq('category_key', categoryKey)
    .eq('section_key', sectionKey)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
  return data || []
}

// 현재 사용 자료만 (is_current=true).
export async function getCurrentResources(categoryKey, sectionKey) {
  return (await getResources(categoryKey, sectionKey)).filter(r => r.is_current)
}

// 유형(form/official/reference)별로 그룹핑 — 파일 카드 3분류 UI(5-h2)에서 사용.
export function groupResourcesByType(rows) {
  return {
    form: rows.filter(r => r.resource_type === 'form'),
    official: rows.filter(r => r.resource_type === 'official'),
    reference: rows.filter(r => r.resource_type === 'reference'),
  }
}

// storage_path → 공개 URL. file_url 이 저장돼 있으면 그걸 우선(앱 관행), 없으면 버킷에서 생성.
export function resourceFileUrl(row) {
  if (row?.file_url) return row.file_url
  if (!row?.storage_path) return null
  return supabase.storage.from('documents').getPublicUrl(row.storage_path).data?.publicUrl || null
}
