import JSZip from 'jszip'
import { objectKey, objectKeyFolded, validateStorageLocation } from './storagePath.js'

// 복원용 백업 = JSON ZIP:  manifest.json + tables/<table>.json (테이블당 행 배열) + (전체 시스템 모드) storage/<bucket>/<path>.
// Excel 은 사람이 보는 사본일 뿐 복원에 쓰지 않는다(backupExcel.js).
//  manifest: backup_version, backup_mode(core|full), created_at, app_version, schema_version, table_counts, table_digests, table_columns,
//            files{path: sha256}, (full) storage{ base, objects[{bucket,path,size,sha256,content_type,refs}], missing[], unreferenced[] }
export const BACKUP_VERSION = 1
export const MODES = { core: '핵심 시약·재고 백업', full: '전체 시스템 백업' }
const enc = new TextEncoder()

export async function sha256Hex(bytes) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// snapshot = admin_backup_export(mode) 결과. storage(full 모드) = { base, objects:[{bucket,path,size,sha256,contentType,refs,bytes}], missing, unreferenced }
export async function buildBackupZip(snapshot, { appVersion = 'unknown', storage = null } = {}) {
  const mode = snapshot.backup_mode || 'core'
  const zip = new JSZip()
  const files = {}
  for (const t of snapshot.table_order) {
    const bytes = enc.encode(JSON.stringify(snapshot.tables[t]))
    zip.file(`tables/${t}.json`, bytes)
    files[`tables/${t}.json`] = await sha256Hex(bytes)
  }
  const manifest = {
    backup_version: snapshot.backup_version,
    backup_mode: mode,
    created_at: snapshot.created_at,
    app_version: appVersion,
    schema_version: snapshot.schema_version,
    table_counts: snapshot.table_counts,
    table_order: snapshot.table_order,
    table_digests: snapshot.table_digests,
    table_columns: snapshot.table_columns,
    files,
    scope_note: mode === 'full'
      ? '전체 시스템: 핵심 시약·재고 + 구매요청 + 공지/첨부 + 자료(resource_files) + 허용된 설정(allowlist) + Storage 파일. Auth 사용자, admin_users, fcm_tokens, student_sessions, school_chemical_master, 비밀번호/토큰성 설정은 포함하지 않음. students 는 개인정보(생년월일)를 포함하므로 보관에 주의.'
      : '핵심 시약·재고: 시약/재고/위치/관리이력. Auth 사용자, admin_users, fcm_tokens, student_sessions, app_settings, Storage 파일은 포함하지 않음. students 는 개인정보(생년월일)를 포함하므로 보관에 주의.',
  }
  if (mode === 'full') {
    const st = storage || { base: null, objects: [], missing: [], unreferenced: [] }
    const objects = []
    for (const o of st.objects) {
      const err = validateStorageLocation(o.bucket, o.path)
      if (err) throw new Error(`백업할 수 없는 Storage 경로: ${err}`)
      zip.file(`storage/${o.bucket}/${o.path}`, o.bytes, { compression: 'STORE' })
      objects.push({ bucket: o.bucket, path: o.path, size: o.size, sha256: o.sha256, content_type: o.contentType || null, refs: o.refs || [] })
    }
    manifest.storage = { base: st.base, objects, missing: st.missing || [], unreferenced: st.unreferenced || [] }
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('README.txt', '연구실 시약관리 — 백업(JSON ZIP)\n복원 화면(관리자 > 백업/복원)에서만 사용하세요. 파일을 직접 수정하면 sha256/digest 검증에서 거부됩니다.\n')
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// ZIP → 복원 RPC 에 넘길 payload + Storage 객체 목록. 파일 sha256 / 행 수 / Storage 객체(경로·중복·누락·초과·크기·sha256)를
// 여기서 먼저 검증해 problems 로 돌려준다(DB/Storage 는 건드리지 않음).
export async function readBackupZip(bytes) {
  const problems = []
  let zip
  try { zip = await JSZip.loadAsync(bytes) } catch { return { payload: null, problems: ['ZIP 파일을 열 수 없습니다.'] } }
  const mf = zip.file('manifest.json')
  if (!mf) return { payload: null, problems: ['manifest.json 이 없습니다.'] }
  let manifest
  try { manifest = JSON.parse(await mf.async('string')) } catch { return { payload: null, problems: ['manifest.json 이 올바른 JSON 이 아닙니다.'] } }
  if (manifest.backup_version !== BACKUP_VERSION) problems.push(`지원하지 않는 backup_version: ${manifest.backup_version}`)
  const mode = manifest.backup_mode || 'core'
  if (!MODES[mode]) problems.push(`알 수 없는 백업 모드: ${mode}`)
  const tables = {}
  for (const t of manifest.table_order || []) {
    const f = zip.file(`tables/${t}.json`)
    if (!f) { problems.push(`tables/${t}.json 이 없습니다.`); continue }
    const raw = await f.async('uint8array')
    if ((await sha256Hex(raw)) !== manifest.files?.[`tables/${t}.json`]) problems.push(`tables/${t}.json 의 sha256 이 manifest 와 다릅니다(파일이 변경되었거나 손상됨).`)
    try { tables[t] = JSON.parse(new TextDecoder().decode(raw)) } catch { problems.push(`tables/${t}.json 이 올바른 JSON 이 아닙니다.`); continue }
    if (!Array.isArray(tables[t]) || tables[t].length !== manifest.table_counts?.[t]) problems.push(`${t}: 행 수가 manifest 와 다릅니다.`)
  }

  // ── Storage 객체(전체 시스템 모드) ────────────────────────────────────────────
  const storageObjects = []
  const zipStorageEntries = Object.keys(zip.files).filter(n => n.startsWith('storage/') && !zip.files[n].dir)
  if (mode !== 'full') {
    if (zipStorageEntries.length > 0) problems.push(`핵심 백업인데 storage/ 파일이 ${zipStorageEntries.length}개 들어 있습니다(manifest 에 없는 객체).`)
  } else {
    const list = manifest.storage?.objects
    if (!Array.isArray(list)) problems.push('전체 시스템 백업인데 manifest.storage.objects 가 없습니다.')
    else {
      const seen = new Set(), seenFolded = new Set(), declared = new Set()
      for (const o of list) {
        const where = `storage/${o?.bucket}/${o?.path}`
        const err = validateStorageLocation(o?.bucket, o?.path)
        if (err) { problems.push(`Storage 경로 오류 — ${err}`); continue }
        const key = objectKey(o.bucket, o.path)
        if (seen.has(key)) { problems.push(`중복된 Storage 경로: ${key}`); continue }
        if (seenFolded.has(objectKeyFolded(o.bucket, o.path))) { problems.push(`대소문자만 다른 중복 Storage 경로: ${key}`); continue }
        seen.add(key); seenFolded.add(objectKeyFolded(o.bucket, o.path)); declared.add(where)
        const entry = zip.file(where)
        if (!entry) { problems.push(`manifest 에는 있지만 ZIP 에 없는 Storage 객체: ${key}`); continue }
        const raw = await entry.async('uint8array')
        if (raw.length !== o.size) problems.push(`Storage 객체 크기가 manifest 와 다릅니다: ${key} (파일 ${raw.length} / manifest ${o.size})`)
        if ((await sha256Hex(raw)) !== o.sha256) problems.push(`Storage 객체 sha256 불일치(변조/손상): ${key}`)
        storageObjects.push({ ...o, bytes: raw })
      }
      for (const n of zipStorageEntries) if (!declared.has(n)) problems.push(`ZIP 에는 있지만 manifest 에 없는 Storage 객체: ${n}`)
    }
  }
  // 알 수 없는 최상위 파일(예상 밖 항목)
  for (const n of Object.keys(zip.files)) {
    if (zip.files[n].dir) continue
    if (n === 'manifest.json' || n === 'README.txt' || n.startsWith('tables/') || n.startsWith('storage/')) continue
    problems.push(`ZIP 에 예상하지 못한 파일이 있습니다: ${n.slice(0, 80)}`)
  }
  const payload = {
    backup_version: manifest.backup_version, backup_mode: mode, created_at: manifest.created_at, app_version: manifest.app_version,
    schema_version: manifest.schema_version, table_counts: manifest.table_counts, table_digests: manifest.table_digests,
    table_columns: manifest.table_columns, tables,
  }
  return { payload, manifest, storageObjects, problems }
}
