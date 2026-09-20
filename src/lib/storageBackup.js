import { sha256Hex } from './backupZip.js'
import { objectKey } from './storagePath.js'

// 전체 시스템 백업의 Storage 수집. client = supabase-js 클라이언트(관리자 세션).
// refs = 서버(admin_backup_export)가 DB 행에서 뽑은 참조 [{bucket, path, refs:[{table,column,id}]}].
const isNotFound = (error) => !!error && (/not found|does not exist|no such/i.test(error.message || '') || [400, 404].includes(Number(error.statusCode || error.status)))

export async function collectStorage(client, refs, { base = null, onProgress } = {}) {
  const objects = [], missing = []
  let i = 0
  for (const r of refs) {
    onProgress?.({ phase: 'download', done: i++, total: refs.length, key: objectKey(r.bucket, r.path) })
    const { data, error } = await client.storage.from(r.bucket).download(r.path)
    if (error) {
      if (isNotFound(error)) { missing.push({ bucket: r.bucket, path: r.path, refs: r.refs }); continue }
      throw new Error(`Storage 다운로드 실패(${objectKey(r.bucket, r.path)}): ${error.message}`)
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    objects.push({ bucket: r.bucket, path: r.path, size: bytes.length, sha256: await sha256Hex(bytes), contentType: data.type || null, refs: r.refs, bytes })
  }
  onProgress?.({ phase: 'download', done: refs.length, total: refs.length })
  return { base, objects, missing }
}

// bucket 안의 모든 객체(재귀) — DB 가 참조하지 않는 "고아" 파일을 manifest 에 기록(백업 대상은 아님)하기 위함.
export async function listAllObjects(client, bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`Storage 목록 조회 실패(${bucket}/${prefix}): ${error.message}`)
    for (const e of data || []) {
      const p = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id === null || e.metadata == null) out.push(...await listAllObjects(client, bucket, p))   // 폴더
      else out.push({ bucket, path: p, size: Number(e.metadata?.size ?? 0) })
    }
    if (!data || data.length < 1000) break
  }
  return out
}

export async function findUnreferenced(client, buckets, referenced) {
  const set = new Set(referenced.map(r => objectKey(r.bucket, r.path)))
  const out = []
  for (const b of buckets) for (const o of await listAllObjects(client, b)) if (!set.has(objectKey(o.bucket, o.path))) out.push(o)
  return out
}
