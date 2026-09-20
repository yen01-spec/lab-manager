import JSZip from 'jszip'

// 복원용 백업 = JSON ZIP:  manifest.json + tables/<table>.json (테이블당 행 배열).
// Excel 은 사람이 보는 사본일 뿐 복원에 쓰지 않는다(backupExcel.js).
// manifest: backup_version, created_at, app_version, schema_version, table_counts + (파일 sha256, 서버 digest, 컬럼, 순서)
export const BACKUP_VERSION = 1
const enc = new TextEncoder()

export async function sha256Hex(bytes) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// snapshot = admin_backup_export() 결과
export async function buildBackupZip(snapshot, { appVersion = 'unknown' } = {}) {
  const zip = new JSZip()
  const files = {}
  for (const t of snapshot.table_order) {
    const bytes = enc.encode(JSON.stringify(snapshot.tables[t]))
    zip.file(`tables/${t}.json`, bytes)
    files[`tables/${t}.json`] = await sha256Hex(bytes)
  }
  const manifest = {
    backup_version: snapshot.backup_version,
    created_at: snapshot.created_at,
    app_version: appVersion,
    schema_version: snapshot.schema_version,
    table_counts: snapshot.table_counts,
    table_order: snapshot.table_order,
    table_digests: snapshot.table_digests,
    table_columns: snapshot.table_columns,
    files,
    scope_note: '시약/재고/위치/관리이력. Auth 사용자, admin_users, fcm_tokens, student_sessions, app_settings, Storage 파일은 포함하지 않음. students 는 개인정보(생년월일)를 포함하므로 보관에 주의.',
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('README.txt', '연구실 시약관리 — 전체 백업(JSON ZIP)\n복원 화면(관리자 > 백업/복원)에서만 사용하세요. 파일을 직접 수정하면 sha256/digest 검증에서 거부됩니다.\n')
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

// ZIP → 복원 RPC 에 넘길 payload. 파일 sha256 / 행 수를 여기서 먼저 검증하고 problems 로 돌려준다(DB 는 건드리지 않음).
export async function readBackupZip(bytes) {
  const problems = []
  let zip
  try { zip = await JSZip.loadAsync(bytes) } catch { return { payload: null, problems: ['ZIP 파일을 열 수 없습니다.'] } }
  const mf = zip.file('manifest.json')
  if (!mf) return { payload: null, problems: ['manifest.json 이 없습니다.'] }
  let manifest
  try { manifest = JSON.parse(await mf.async('string')) } catch { return { payload: null, problems: ['manifest.json 이 올바른 JSON 이 아닙니다.'] } }
  if (manifest.backup_version !== BACKUP_VERSION) problems.push(`지원하지 않는 backup_version: ${manifest.backup_version}`)
  const tables = {}
  for (const t of manifest.table_order || []) {
    const f = zip.file(`tables/${t}.json`)
    if (!f) { problems.push(`tables/${t}.json 이 없습니다.`); continue }
    const raw = await f.async('uint8array')
    if ((await sha256Hex(raw)) !== manifest.files?.[`tables/${t}.json`]) problems.push(`tables/${t}.json 의 sha256 이 manifest 와 다릅니다(파일이 변경되었거나 손상됨).`)
    try { tables[t] = JSON.parse(new TextDecoder().decode(raw)) } catch { problems.push(`tables/${t}.json 이 올바른 JSON 이 아닙니다.`); continue }
    if (!Array.isArray(tables[t]) || tables[t].length !== manifest.table_counts?.[t]) problems.push(`${t}: 행 수가 manifest 와 다릅니다.`)
  }
  const payload = {
    backup_version: manifest.backup_version, created_at: manifest.created_at, app_version: manifest.app_version,
    schema_version: manifest.schema_version, table_counts: manifest.table_counts, table_digests: manifest.table_digests,
    table_columns: manifest.table_columns, tables,
  }
  return { payload, manifest, problems }
}
