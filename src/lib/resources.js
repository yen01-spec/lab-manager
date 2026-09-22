import { supabase, supabaseAdmin } from '../supabase'
import { validateResourceFile, buildStoragePath, buildArticleStoragePath } from './resourceUpload'

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
  const path = row.article_id
    ? buildArticleStoragePath({ articleId: row.article_id, filename: file.name })
    : buildStoragePath({ categoryKey: row.category_key, sectionKey: row.section_key, resourceKey: row.resource_key, filename: file.name })
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

// 자료 화면이 모든 항목을 한 목록으로 펼쳐 보여줄 때(각 항목마다 첨부파일이 바로 보임) 쓰는 일괄 조회 —
// 항목 수만큼 따로 조회하지 않고 한 번에 가져와 항목별로 나눠 쓴다.
export async function getAllResources() {
  const { data } = await supabase.from('resource_files')
    .select('*')
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

// ══════════════════════════════════════════════════════════════
//  자료실 CMS — resource_tabs / resource_articles (자료실 단순화 Phase).
//  관리자: 탭 생성 → 그 탭 안에 글 작성 → 글 밑에 파일 첨부. 일반 사용자는 읽기 전용.
//  write 는 전부 supabaseAdmin(Supabase Auth + admin_users + public.is_admin())만 통과한다.
// ══════════════════════════════════════════════════════════════

export async function getResourceTabs() {
  const { data, error } = await supabase.from('resource_tabs').select('*').order('sort_order', { ascending: true })
  if (error) throw new Error('탭 목록을 불러오지 못했습니다: ' + error.message)
  return data || []
}

export async function createResourceTab(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('탭 이름을 입력해주세요.')
  const { data: last } = await supabase.from('resource_tabs').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = (last?.sort_order ?? -1) + 1
  const { data, error } = await supabaseAdmin.from('resource_tabs').insert({ name: trimmed, sort_order: nextOrder }).select('*').single()
  if (error) throw new Error(error.code === '23505' ? '이미 같은 이름의 탭이 있습니다.' : '탭 생성 실패: ' + error.message)
  return data
}

export async function renameResourceTab(id, name) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('탭 이름을 입력해주세요.')
  const { data, error } = await supabaseAdmin.from('resource_tabs').update({ name: trimmed, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error) throw new Error(error.code === '23505' ? '이미 같은 이름의 탭이 있습니다.' : '탭 이름 수정 실패: ' + error.message)
  return data
}

// 순서만 바꾼다(↑/↓) — orderedIds: 원하는 최종 순서의 탭 id 배열.
export async function reorderResourceTabs(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseAdmin.from('resource_tabs').update({ sort_order: i, updated_at: new Date().toISOString() }).eq('id', orderedIds[i])
    if (error) throw new Error('탭 순서 변경 실패: ' + error.message)
  }
}

// 글이 1개라도 있으면 차단(조용한 cascade 금지) — DB도 FK restrict 로 한 번 더 막는다.
export async function deleteResourceTab(id) {
  const { count } = await supabase.from('resource_articles').select('id', { count: 'exact', head: true }).eq('tab_id', id)
  if (count > 0) throw new Error(`이 탭에 자료 ${count}개가 있습니다. 자료를 다른 탭으로 이동하거나 삭제한 후 탭을 삭제하세요.`)
  const { error } = await supabaseAdmin.from('resource_tabs').delete().eq('id', id)
  if (error) throw new Error(error.code === '23503' ? '이 탭에 아직 자료가 있어 삭제할 수 없습니다.' : '탭 삭제 실패: ' + error.message)
}

export async function getAllResourceArticles() {
  const { data, error } = await supabase.from('resource_articles').select('*').order('tab_id', { ascending: true }).order('sort_order', { ascending: true })
  if (error) throw new Error('자료 목록을 불러오지 못했습니다: ' + error.message)
  return data || []
}

function articleRow(fields) {
  const steps = Array.isArray(fields.steps) ? fields.steps.map(s => String(s).trim()).filter(Boolean) : []
  return {
    tab_id: fields.tabId,
    title: (fields.title || '').trim(),
    summary: fields.summary?.trim() || null,
    audience: fields.audience?.trim() || null,
    timing: fields.timing?.trim() || null,
    steps,
    notice: fields.notice?.trim() || null,
    link_label: fields.linkLabel?.trim() || null,
    link_url: fields.linkUrl?.trim() || null,
    sort_order: Number.isFinite(+fields.sortOrder) ? +fields.sortOrder : 0,
  }
}

export async function createResourceArticle(fields) {
  const row = articleRow(fields)
  if (!row.title) throw new Error('제목을 입력해주세요.')
  if (!row.tab_id) throw new Error('탭을 선택해주세요.')
  if ((row.link_label && !row.link_url) || (!row.link_label && row.link_url)) throw new Error('관련 링크는 이름과 주소를 함께 입력해주세요.')
  // 에디터가 새 글에 sortOrder를 넘기지 않으면(항상 0) 그 탭에 글이 이미 있을 때 전부 sort_order=0으로
  // 겹쳐 화면 순서가 삽입 순서가 아니라 DB가 동률을 반환하는 임의 순서가 된다(실브라우저 QA로 발견,
  // reorderResourceArticles 테스트 중 A,B를 순서대로 작성했는데 B,A로 나옴) — 같은 탭 안 최대값+1로
  // 끝에 붙인다(createResourceTab과 같은 패턴), 명시적으로 sortOrder를 넘긴 경우는 그대로 존중.
  if (!Number.isFinite(+fields.sortOrder)) {
    const { data: last } = await supabaseAdmin.from('resource_articles').select('sort_order').eq('tab_id', row.tab_id).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    row.sort_order = (last?.sort_order ?? -1) + 1
  }
  const { data, error } = await supabaseAdmin.from('resource_articles').insert(row).select('*').single()
  if (error) throw new Error('글 작성 실패: ' + error.message)
  return data
}

export async function updateResourceArticle(id, fields) {
  const row = articleRow(fields)
  if (!row.title) throw new Error('제목을 입력해주세요.')
  if ((row.link_label && !row.link_url) || (!row.link_label && row.link_url)) throw new Error('관련 링크는 이름과 주소를 함께 입력해주세요.')
  row.updated_at = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('resource_articles').update(row).eq('id', id).select('*').single()
  if (error) throw new Error('글 수정 실패: ' + error.message)
  return data
}

export async function moveResourceArticle(id, tabId) {
  const { error } = await supabaseAdmin.from('resource_articles').update({ tab_id: tabId, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error('탭 이동 실패: ' + error.message)
}

export async function reorderResourceArticles(orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabaseAdmin.from('resource_articles').update({ sort_order: i, updated_at: new Date().toISOString() }).eq('id', orderedIds[i])
    if (error) throw new Error('글 순서 변경 실패: ' + error.message)
  }
}

// 첨부파일이 1개라도 있으면 차단(조용한 cascade 금지) — DB도 FK restrict 로 한 번 더 막는다.
export async function deleteResourceArticle(id) {
  const { count } = await supabase.from('resource_files').select('id', { count: 'exact', head: true }).eq('article_id', id)
  if (count > 0) throw new Error(`이 글에 첨부파일 ${count}개가 있습니다. 첨부파일을 먼저 삭제한 후 글을 삭제하세요.`)
  const { error } = await supabaseAdmin.from('resource_articles').delete().eq('id', id)
  if (error) throw new Error(error.code === '23503' ? '이 글에 아직 첨부파일이 있어 삭제할 수 없습니다.' : '글 삭제 실패: ' + error.message)
}

// 글 하나의 첨부파일 전체(버전 이력 포함) — sort_order → created_at 순.
export async function getArticleFiles(articleId) {
  const { data } = await supabase.from('resource_files').select('*')
    .eq('article_id', articleId).order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  return data || []
}

// 자료실 카드 30여 개가 한 화면에 동시에 보이므로 글마다 따로 조회하지 않고 한 번에 가져온다.
export async function getAllArticleFiles() {
  const { data } = await supabase.from('resource_files').select('*').not('article_id', 'is', null)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  return data || []
}

// 새 자료실 파일의 단순 업로드 — 파일 + 표시 제목(선택, 기본 파일명)만 받는다(복잡한 버전/유형
// 메타데이터는 요구하지 않음). 기존 legacy 파일의 메타데이터는 손대지 않고 그대로 보존한다.
export async function createArticleFile(articleId, file, title) {
  const v = validateResourceFile(file)
  if (!v.ok) throw new Error(v.error)
  const path = buildArticleStoragePath({ articleId, filename: file.name })
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, file, { contentType: v.mime || 'application/octet-stream', upsert: false })
  if (up.error) throw new Error('파일 업로드 실패: ' + up.error.message)
  const row = {
    article_id: articleId, category_key: null, section_key: null, resource_key: null,
    title: (title || file.name || '').trim() || file.name,
    resource_type: 'reference', issuer: null, revision_date: null, effective_date: null,
    version_label: null, sort_order: 0, notes: null,
    is_current: true, storage_path: path, original_filename: file.name, mime_type: v.mime, file_url: null,
  }
  const ins = await supabaseAdmin.from('resource_files').insert(row).select('*').single()
  if (ins.error) {
    const rm = await supabaseAdmin.storage.from(BUCKET).remove([path])
    const tail = rm.error ? ` — 파일 정리도 실패했습니다(수동 삭제 필요): ${path}` : ''
    throw new Error('자료 등록 실패: ' + ins.error.message + tail)
  }
  return ins.data
}
