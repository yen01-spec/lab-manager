// Storage 객체 경로 검증(순수 함수) — 백업 ZIP 안의 경로를 믿지 않는다.
//  · 경로 traversal(.., 절대경로, 백슬래시, 제어문자, 빈 세그먼트, 드라이브 문자) 거부
//  · bucket 은 허용 목록만(현재 앱은 documents 하나)
//  · Supabase Storage 가 실제로 허용하는 ASCII 안전 문자만 통과(한글·이모지 키는 'Invalid key' 로 업로드 거부됨을 staging 에서 확인)
export const ALLOWED_BUCKETS = ['documents']
const MAX_PATH = 900
const SAFE_KEY = /^[A-Za-z0-9!_.*'() &$@=;:+,/-]+$/
const CONTROL = /[\x00-\x1f\x7f]/   // eslint-disable-line no-control-regex

export function validateStorageLocation(bucket, path) {
  if (typeof bucket !== 'string' || !ALLOWED_BUCKETS.includes(bucket)) return `허용되지 않은 bucket: ${String(bucket).slice(0, 40)}`
  if (typeof path !== 'string' || path.length === 0) return '경로가 비어 있습니다.'
  if (path.length > MAX_PATH) return '경로가 너무 깁니다.'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return `절대 경로는 허용되지 않습니다: ${path.slice(0, 60)}`
  if (path.includes('\\')) return `백슬래시가 들어 있는 경로: ${path.slice(0, 60)}`
  if (CONTROL.test(path)) return '제어 문자가 들어 있는 경로입니다.'
  if (path.normalize('NFC') !== path) return `정규화되지 않은 유니코드 경로: ${path.slice(0, 60)}`
  if (!SAFE_KEY.test(path)) return `Storage 가 허용하지 않는 문자가 들어 있는 경로입니다: ${path.slice(0, 60)}`
  const segs = path.split('/')
  if (segs.some(s => s === '')) return `빈 경로 구간(//) 또는 끝 슬래시: ${path.slice(0, 60)}`
  if (segs.some(s => s === '.' || s === '..')) return `경로 traversal(.. / .) 이 들어 있습니다: ${path.slice(0, 60)}`
  if (segs.some(s => /%2e|%2f/i.test(s))) return `인코딩된 traversal 문자가 들어 있는 경로: ${path.slice(0, 60)}`
  return null
}

export const objectKey = (bucket, path) => `${bucket}/${path}`
// 대소문자만 다른 경로 충돌(대소문자 구분 안 하는 파일시스템/사용자 혼동 방지)까지 잡기 위한 비교 키
export const objectKeyFolded = (bucket, path) => `${bucket}/${path}`.normalize('NFC').toLowerCase()
