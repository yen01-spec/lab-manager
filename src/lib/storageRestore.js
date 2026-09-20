import { sha256Hex } from './backupZip.js'
import { objectKey, validateStorageLocation } from './storagePath.js'

// ── 전체 시스템 복원의 Storage 부분 ───────────────────────────────────────────────────────────────
// ⚠ Postgres 트랜잭션은 Storage 객체 쓰기를 묶지 못한다. "DB 와 Storage 전체가 한 트랜잭션"이 아니다.
// 그래서 안전 순서를 강제한다:
//   ① dry-run (ZIP 검증 + DB dry-run + Storage 충돌 검사) — 쓰기 0
//   ② Storage 업로드(덮어쓰기 금지: upsert=false) — 실패하면 올린 것만 정리하고 종료(DB 미변경)
//   ③ 업로드 검증(다시 내려받아 sha256) — 실패하면 올린 것 정리하고 종료(DB 미변경)
//   ④ DB 복원(단일 트랜잭션) — 실패하면 ②에서 올린 객체를 정리(삭제)
//   ⑤ 정리(삭제) 자체가 실패하면 남은 객체 목록을 보고(수동 정리/재시도 필요). 브라우저가 중간에 종료된 경우는
//      journal + cleanupInterruptedRestore() 로 복구한다(DB 가 비어 있고 sha256 이 같은 객체만 삭제).
// 이유: DB 행이 없는 고아 파일은 무해하고 지울 수 있지만, 파일 없는 DB 행(깨진 링크)은 사용자에게 바로 보인다.

const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '')
const baseOf = (p) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p)

export async function objectExists(client, bucket, path) {
  const { data, error } = await client.storage.from(bucket).list(dirOf(path), { limit: 100, search: baseOf(path) })
  if (error) throw new Error(`Storage 조회 실패(${objectKey(bucket, path)}): ${error.message}`)
  return (data || []).some(e => e.name === baseOf(path) && e.metadata != null)
}

export async function findConflicts(client, objects) {
  const conflicts = []
  for (const o of objects) if (await objectExists(client, o.bucket, o.path)) conflicts.push(objectKey(o.bucket, o.path))
  return conflicts
}

async function downloadHash(client, o) {
  const { data, error } = await client.storage.from(o.bucket).download(o.path)
  if (error) return { error: error.message }
  const bytes = new Uint8Array(await data.arrayBuffer())
  return { size: bytes.length, sha256: await sha256Hex(bytes) }
}

export async function removeObjects(client, objects) {
  const removed = [], failed = []
  for (const o of objects) {
    const { error } = await client.storage.from(o.bucket).remove([o.path])
    if (error) failed.push({ key: objectKey(o.bucket, o.path), error: error.message })
    else if (await objectExists(client, o.bucket, o.path).catch(() => true)) failed.push({ key: objectKey(o.bucket, o.path), error: '삭제 후에도 객체가 남아 있습니다(권한/정책 확인).' })
    else removed.push(objectKey(o.bucket, o.path))
  }
  return { removed, failed }
}

// ① 검증 전용(쓰기 0). rpc(name, args) → { data, error } (supabase.rpc 형태). parsed = readBackupZip 결과.
export async function dryRunAll({ client, rpc, parsed, targetBase, log = () => {} }) {
  const issues = []
  if (!parsed?.payload) return { ok: false, issues: [{ code: 'zip', message: (parsed?.problems || ['ZIP 을 읽지 못했습니다.'])[0] }] }
  for (const p of parsed.problems) issues.push({ code: 'zip', message: p })
  if (issues.length) return { ok: false, issues }
  const mode = parsed.payload.backup_mode
  const objects = parsed.storageObjects || []
  for (const o of objects) { const e = validateStorageLocation(o.bucket, o.path); if (e) issues.push({ code: 'storage_path', message: e }) }
  if (issues.length) return { ok: false, issues }

  log('DB dry-run…')
  const { data: db, error } = await rpc('admin_restore_full', {
    p_payload: parsed.payload, p_dry_run: true, p_confirm: null,
    p_storage_base_from: mode === 'full' ? (parsed.manifest.storage?.base ?? null) : null, p_storage_base_to: mode === 'full' ? targetBase : null,
  })
  if (error) return { ok: false, issues: [{ code: 'rpc', message: error.message }] }
  if (!db.ok) return { ok: false, db, issues: db.issues?.length ? db.issues : [{ code: 'db', message: db.error || '복원 검증 실패' }] }

  if (mode === 'full') {
    const declared = new Set(objects.map(o => objectKey(o.bucket, o.path)))
    const missingDeclared = new Set((parsed.manifest.storage?.missing || []).map(o => objectKey(o.bucket, o.path)))
    const refKeys = new Set()
    for (const r of db.storage_refs || []) {
      const key = objectKey(r.bucket, r.path); refKeys.add(key)
      const e = validateStorageLocation(r.bucket, r.path); if (e) issues.push({ code: 'storage_path', message: `DB 행이 가리키는 경로 오류 — ${e}` })
      else if (!declared.has(key) && !missingDeclared.has(key)) issues.push({ code: 'storage_ref_without_object', message: `DB 행이 가리키는 파일이 백업(manifest)에 없습니다: ${key}` })
    }
    for (const k of declared) if (!refKeys.has(k)) issues.push({ code: 'storage_object_unreferenced', message: `manifest 에는 있지만 어떤 DB 행도 참조하지 않는 Storage 객체: ${k}` })
    if (issues.length) return { ok: false, db, issues }
    log('Storage 충돌 검사…')
    let conflicts
    try { conflicts = await findConflicts(client, objects) } catch (e) { return { ok: false, db, issues: [{ code: 'storage_unavailable', message: e.message }] } }
    for (const k of conflicts) issues.push({ code: 'storage_conflict', message: `대상 Storage 에 이미 같은 경로의 객체가 있습니다(덮어쓰지 않음): ${k}` })
    if (issues.length) return { ok: false, db, issues, conflicts }
  }
  return { ok: true, db, issues: [], mode, storageCount: objects.length, missingRefs: parsed.manifest.storage?.missing || [] }
}

// ②~⑤ 실행. hooks(테스트용 장애 주입): { beforeUpload(i, obj), afterUpload(), beforeDb() } — throw 하면 해당 단계 실패로 취급.
export async function executeRestore({ client, rpc, parsed, targetBase, confirm, onProgress = () => {}, journal = { save() {}, clear() {} }, hooks = {} }) {
  const pre = await dryRunAll({ client, rpc, parsed, targetBase })
  if (!pre.ok) return { ok: false, stage: 'dry-run', issues: pre.issues }
  const mode = pre.mode
  // 업로드 전에 "DB 복원이 허용되는가"부터 확인한다 — 어차피 DB 단계에서 거부될 복원을 위해 파일을 올렸다 지우지 않는다.
  const st = await rpc('admin_restore_status')
  if (st.error) return { ok: false, stage: 'preflight', error: st.error.message }
  if (!st.data?.enabled) return { ok: false, stage: 'disabled', error: '이 환경에서는 복원 실행이 비활성화되어 있습니다(Storage/DB 모두 변경하지 않았습니다).' }
  if (confirm !== 'RESTORE') return { ok: false, stage: 'confirm', error: '확인 문구(RESTORE)가 필요합니다(Storage/DB 모두 변경하지 않았습니다).' }
  const objects = mode === 'full' ? parsed.storageObjects : []
  const uploaded = []

  const cleanup = async (why) => {
    if (uploaded.length === 0) return { removed: [], failed: [] }
    onProgress({ phase: 'cleanup', why })
    const r = await removeObjects(client, uploaded)
    if (r.failed.length === 0) journal.clear()
    return r
  }

  // ② 업로드
  journal.save({ mode, startedAt: new Date().toISOString(), objects: objects.map(o => ({ bucket: o.bucket, path: o.path, sha256: o.sha256 })), phase: 'uploading' })
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i]
    onProgress({ phase: 'upload', done: i, total: objects.length, key: objectKey(o.bucket, o.path) })
    try {
      await hooks.beforeUpload?.(i, o)
      const { error } = await client.storage.from(o.bucket).upload(o.path, new Blob([o.bytes], { type: o.content_type || 'application/octet-stream' }), { upsert: false, contentType: o.content_type || undefined })
      if (error) throw new Error(error.message)
      uploaded.push(o)
    } catch (e) {
      // 응답만 실패하고 서버에는 올라갔을 수 있다 → 우리가 올린 것(내용 sha256 동일)이면 정리 대상에 포함
      try { if (await objectExists(client, o.bucket, o.path)) { const h = await downloadHash(client, o); if (h.sha256 === o.sha256) uploaded.push(o) } } catch { /* 확인 불가 — 아래 보고에 포함 */ }
      const c = await cleanup('upload-failed')
      return { ok: false, stage: 'storage-upload', error: `Storage 업로드 실패(${objectKey(o.bucket, o.path)}): ${e.message}`, uploaded: uploaded.length, cleanup: c, dbChanged: false }
    }
  }
  // ③ 업로드 검증
  try {
    await hooks.afterUpload?.()
    for (let i = 0; i < uploaded.length; i++) {
      onProgress({ phase: 'verify', done: i, total: uploaded.length })
      const h = await downloadHash(client, uploaded[i])
      if (h.error || h.sha256 !== uploaded[i].sha256 || h.size !== uploaded[i].size) throw new Error(`업로드 검증 실패: ${objectKey(uploaded[i].bucket, uploaded[i].path)} ${h.error || '(sha256/크기 불일치)'}`)
    }
  } catch (e) {
    const c = await cleanup('verify-failed')
    return { ok: false, stage: 'storage-verify', error: e.message, uploaded: uploaded.length, cleanup: c, dbChanged: false }
  }
  // ④ DB 복원(단일 트랜잭션)
  journal.save({ mode, startedAt: new Date().toISOString(), objects: uploaded.map(o => ({ bucket: o.bucket, path: o.path, sha256: o.sha256 })), phase: 'db' })
  onProgress({ phase: 'db' })
  let db
  try {
    await hooks.beforeDb?.()
    const r = await rpc('admin_restore_full', {
      p_payload: parsed.payload, p_dry_run: false, p_confirm: confirm,
      p_storage_base_from: mode === 'full' ? (parsed.manifest.storage?.base ?? null) : null, p_storage_base_to: mode === 'full' ? targetBase : null,
    })
    if (r.error) throw new Error(r.error.message)
    db = r.data
    if (!db?.ok || !db.committed) throw new Error((db?.issues?.[0]?.message) || db?.error || 'DB 복원이 완료되지 않았습니다.')
  } catch (e) {
    const c = await cleanup('db-failed')      // ⑤ DB 는 롤백됨 → 올린 객체 정리
    return { ok: false, stage: 'db', error: e.message, uploaded: uploaded.length, cleanup: c, dbChanged: false }
  }
  journal.clear()
  return { ok: true, mode, db, storageUploaded: uploaded.length, missingRefs: pre.missingRefs }
}

// 브라우저 종료/네트워크 단절 등으로 중단된 복원의 Storage 잔여물 정리.
// 안전 조건: ① DB 대상이 "비어 있음"(= 복원이 커밋되지 않았음) ② 객체의 sha256 이 manifest 와 같음(우리가 올린 것). 그 외 객체는 건드리지 않는다.
export async function cleanupInterruptedRestore({ client, rpc, parsed }) {
  if (!parsed?.payload || parsed.payload.backup_mode !== 'full') return { ok: false, error: '전체 시스템 백업 ZIP 이 필요합니다.' }
  const st = await rpc('admin_restore_target_state', { p_mode: 'full' })
  if (st.error) return { ok: false, error: st.error.message }
  if (!st.data.empty) return { ok: false, error: '대상 DB 가 비어 있지 않아(복원이 이미 커밋되었을 수 있음) Storage 정리를 거부합니다.' }
  const removed = [], kept = [], failed = []
  for (const o of parsed.storageObjects || []) {
    if (!(await objectExists(client, o.bucket, o.path))) continue
    const h = await downloadHash(client, o)
    if (!h.error && h.sha256 === o.sha256) {
      const r = await removeObjects(client, [o]); removed.push(...r.removed); failed.push(...r.failed)
    } else kept.push(objectKey(o.bucket, o.path))
  }
  return { ok: failed.length === 0, removed, kept, failed }
}
