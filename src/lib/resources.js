import { supabase, supabaseAdmin } from '../supabase'
import { validateResourceFile, buildStoragePath } from './resourceUpload'

export { validateResourceFile, RESOURCE_UPLOAD_HELP } from './resourceUpload'

// 자료 탭 공식 자료(resource_files) 조회 헬퍼. (Phase 5-h1: 인터페이스만. UI 연결은 5-h2)
// resource_type: 'form'(필수 양식) | 'official'(공식 지침·매뉴얼) | 'reference'(참고자료)
//
// 아래 write 헬퍼(5-h2b)는 전부 supabaseAdmin(별도 Supabase Auth 세션) 로만 실행해야
// RLS(is_admin()) 와 Storage RESTRICTIVE 정책(resources/ 경로)을 통과한다.

const BUCKET = 'documents'
const RESOURCE_TYPES = ['form', 'official', 'reference']

function toRow(fields, extra) {
  return {
    category_key: fields.categoryKey,
    section_key: fields.sectionKey,
    resource_key: fields.resourceKey?.trim() || null,
    title: (fields.title || '').trim(),
    resource_type: RESOURCE_TYPES.includes(fields.resourceType) ? fields.resourceType : 'reference',
    issuer: fields.issuer?.trim() || null,
    revision_date: fields.revisionDate || null,
    effective_date: fields.effectiveDate || null,
    version_label: fields.versionLabel?.trim() || null,
    sort_order: Number.isFinite(+fields.sortOrder) ? +fields.sortOrder : 0,
    notes: fields.notes?.trim() || null,
    file_url: null,
    ...extra,
  }
}

function friendlyInsertError(error, path) {
  if (error.code === '23505') {
    return '같은 분류에 이미 "현재 자료"가 있습니다. 기존 자료를 이전 버전으로 내리거나 "새 버전 등록"을 사용하세요.'
  }
  return '자료 등록 실패: ' + error.message + (path ? ` (업로드된 파일: ${path})` : '')
}

// 업로드 → INSERT. INSERT 실패 시 방금 올린 파일을 정리(고아 방지). 실패는 숨기지 않고 throw.
export async function createResource(fields, file) {
  const v = validateResourceFile(file)
  if (!v.ok) throw new Error(v.error)
  if (!fields.title?.trim()) throw new Error('제목을 입력해주세요.')

  const path = buildStoragePath({ ...fields, filename: file.name })
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    contentType: v.mime || 'application/octet-stream', upsert: false,
  })
  if (up.error) throw new Error('파일 업로드 실패: ' + up.error.message)

  const row = toRow(fields, {
    is_current: fields.isCurrent ?? true,
    storage_path: path,
    original_filename: file.name,
    mime_type: v.mime,
  })
  const ins = await supabaseAdmin.from('resource_files').insert(row).select('*').single()
  if (ins.error) {
    const rm = await supabaseAdmin.storage.from(BUCKET).remove([path])
    const tail = rm.error ? ` — 파일 정리도 실패했습니다(수동 삭제 필요): ${path}` : ''
    throw new Error(friendlyInsertError(ins.error, rm.error ? null : path) + tail)
  }
  return ins.data
}

// 메타데이터만 수정 — Storage 는 건드리지 않는다.
export async function updateResourceMeta(id, fields) {
  if (!fields.title?.trim()) throw new Error('제목을 입력해주세요.')
  const patch = toRow(fields, { updated_at: new Date().toISOString() })
  delete patch.category_key
  delete patch.section_key
  const { data, error } = await supabaseAdmin.from('resource_files').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.code === '23505'
    ? '버전 키 변경이 "현재 자료" 중복을 만듭니다. 먼저 기존 현재 자료를 정리하세요.'
    : '메타데이터 수정 실패: ' + error.message)
  return data
}

// 파일 교체: 새 파일 업로드 → DB storage_path 갱신 → 성공 시 옛 파일 삭제.
// DB 갱신 실패 → 새 파일 삭제 + 옛 파일 유지(throw). 옛 파일 삭제 실패 → warn 만.
export async function replaceResourceFile(row, file) {
  const v = validateResourceFile(file)
  if (!v.ok) throw new Error(v.error)
  const path = buildStoragePath({
    categoryKey: row.category_key, sectionKey: row.section_key,
    resourceKey: row.resource_key, filename: file.name,
  })
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, file, {
    contentType: v.mime || 'application/octet-stream', upsert: false,
  })
  if (up.error) throw new Error('파일 업로드 실패: ' + up.error.message)

  const { data, error } = await supabaseAdmin.from('resource_files').update({
    storage_path: path, original_filename: file.name, mime_type: v.mime, file_url: null,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).select('*').single()

  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path])
    throw new Error('파일 교체 실패 (기존 파일은 그대로 유지됩니다): ' + error.message)
  }
  let warn = null
  if (row.storage_path && row.storage_path !== path) {
    const rm = await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path])
    if (rm.error) warn = `이전 파일 삭제 실패 — 수동 정리 필요: ${row.storage_path}`
  }
  return { data, warn }
}

// 새 버전 등록: 기존 행 메타데이터를 복사한 새 행. resource_key 승계(없으면 생성 후 기존 행에도 backfill).
// 새 행은 is_current=false 로 시작 → 이후 setResourceCurrent 로 승격.
export async function addResourceVersion(baseRow, fields, file) {
  let rk = (fields.resourceKey || baseRow.resource_key || '').trim()
  if (!rk) {
    rk = `${baseRow.section_key}-${(baseRow.title || 'item').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'doc'}`
  }
  if (!baseRow.resource_key) {
    const { error } = await supabaseAdmin.from('resource_files')
      .update({ resource_key: rk, updated_at: new Date().toISOString() }).eq('id', baseRow.id)
    if (error) throw new Error('버전 그룹 설정 실패: ' + error.message)
  }
  return createResource({
    categoryKey: baseRow.category_key,
    sectionKey: baseRow.section_key,
    resourceKey: rk,
    title: fields.title ?? baseRow.title,
    resourceType: fields.resourceType ?? baseRow.resource_type,
    issuer: fields.issuer ?? baseRow.issuer,
    revisionDate: fields.revisionDate || null,
    effectiveDate: fields.effectiveDate || null,
    versionLabel: fields.versionLabel || null,
    sortOrder: fields.sortOrder ?? baseRow.sort_order ?? 0,
    notes: fields.notes ?? baseRow.notes,
    isCurrent: false,
  }, file)
}

// "현재 자료로 지정" — 반드시 RPC(단일 트랜잭션) 로만. 프론트에서 UPDATE 2번 금지.
export async function setResourceCurrent(id) {
  const { error } = await supabaseAdmin.rpc('set_resource_current', { target_resource_id: id })
  if (error) throw new Error('현재 자료 지정 실패: ' + error.message)
}

// 삭제: DB 행 먼저 → Storage 파일 그 다음. (파일을 먼저 지우면 DB 삭제 실패 시 "행만 남고 파일 없음"이 됨)
// DB 삭제 성공 + Storage 삭제 실패 → 고아 파일 warn 만 반환.
export async function deleteResource(row) {
  const { error } = await supabaseAdmin.from('resource_files').delete().eq('id', row.id)
  if (error) throw new Error('자료 삭제 실패: ' + error.message)
  let warn = null
  if (row.storage_path) {
    const rm = await supabaseAdmin.storage.from(BUCKET).remove([row.storage_path])
    if (rm.error) warn = `DB 행은 삭제됐지만 파일 삭제 실패 — 수동 정리 필요: ${row.storage_path}`
  }
  return { warn }
}

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
