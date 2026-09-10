// 공식 자료 업로드 검증 + Storage 경로 규칙 (Phase 5-h2b). Supabase 의존 없는 순수 모듈 —
// resources.js 의 write 헬퍼가 여기서 검증/경로 생성을 가져다 쓴다.

// 허용 확장자 → 정상 MIME 후보. HWP/HWPX 는 브라우저가 빈 문자열/octet-stream 을 주는 경우가 많아
// NEUTRAL_MIME 도 허용하되, 실행/스크립트 계열 MIME 은 확장자와 무관하게 거부한다.
export const ALLOWED_EXT = {
  pdf: ['application/pdf'],
  hwp: ['application/haansofthwp', 'application/x-hwp', 'application/vnd.hancom.hwp'],
  hwpx: ['application/hwp+zip', 'application/vnd.hancom.hwpx'],
  xls: ['application/vnd.ms-excel'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
}
const NEUTRAL_MIME = ['', 'application/octet-stream', 'application/zip', 'application/x-zip-compressed']
const BLOCKED_MIME = /(msdownload|msdos-program|executable|x-sh|shellscript|javascript|java-archive|x-msi|x-bat|portable-executable)/i
const MAX_BYTES = 20 * 1024 * 1024

export const RESOURCE_UPLOAD_HELP = `허용 형식: ${Object.keys(ALLOWED_EXT).join(', ').toUpperCase()} · 최대 20MB`

// { ok, ext, mime } | { ok:false, error }
export function validateResourceFile(file) {
  if (!file) return { ok: false, error: '파일을 선택해주세요.' }
  const name = file.name || ''
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  if (!ext || !ALLOWED_EXT[ext]) {
    return { ok: false, error: `허용되지 않는 형식입니다. (${Object.keys(ALLOWED_EXT).join(', ')} 만 가능)` }
  }
  const mime = (file.type || '').toLowerCase()
  if (BLOCKED_MIME.test(mime)) return { ok: false, error: '실행·스크립트 파일은 업로드할 수 없습니다.' }
  if (!ALLOWED_EXT[ext].includes(mime) && !NEUTRAL_MIME.includes(mime)) {
    return { ok: false, error: `파일 형식(${mime})이 확장자 .${ext} 와 맞지 않습니다.` }
  }
  if (!file.size) return { ok: false, error: '빈 파일은 업로드할 수 없습니다.' }
  if (file.size > MAX_BYTES) return { ok: false, error: '파일 크기는 20MB 이하만 가능합니다.' }
  return { ok: true, ext, mime: mime || null }
}

function sanitizeSeg(s) {
  return String(s || '').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 80) || 'x'
}

// resources/{category}/{section}/{resourceKey|standalone}/{unique}__{원본이름} — storage_path 가 진실.
export function buildStoragePath({ categoryKey, sectionKey, resourceKey, filename }) {
  const uid = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const group = resourceKey ? sanitizeSeg(resourceKey) : 'standalone'
  return `resources/${sanitizeSeg(categoryKey)}/${sanitizeSeg(sectionKey)}/${group}/${uid}__${sanitizeSeg(filename)}`
}
