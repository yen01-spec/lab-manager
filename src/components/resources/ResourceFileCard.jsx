import { supabase } from '../../supabase'
import { safeUrl } from '../../lib/appSettings'
import { C } from '../../design'

const TYPE_LABEL = { form: '필수 양식', official: '공식 지침·매뉴얼', reference: '참고자료' }
const VIEWABLE_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
const MIME_EXT = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/haansofthwp': 'hwp', 'application/x-hwp': 'hwp',
}

function extOf(row) {
  const fromName = (row.original_filename || '').split('.').pop()?.toLowerCase()
  if (fromName && fromName.length <= 5 && /^[a-z0-9]+$/.test(fromName)) return fromName
  if (MIME_EXT[row.mime_type]) return MIME_EXT[row.mime_type]
  if ((row.mime_type || '').startsWith('image/')) return row.mime_type.split('/')[1]
  return ''
}

// storage_path 를 source of truth 로 URL 생성. 없으면 legacy file_url(http/https만) fallback.
function fileUrl(row, forceDownload) {
  if (row.storage_path) {
    const opts = forceDownload ? { download: row.original_filename || true } : {}
    return supabase.storage.from('documents').getPublicUrl(row.storage_path, opts).data?.publicUrl || null
  }
  return safeUrl(row.file_url)
}

export default function ResourceFileCard({ row, dim = false }) {
  const ext = extOf(row)
  const isView = VIEWABLE_EXT.includes(ext)
  const url = fileUrl(row, !isView)
  const meta = [
    row.issuer,
    row.revision_date && `개정일 ${row.revision_date}`,
    row.effective_date && `시행일 ${row.effective_date}`,
    ext && ext.toUpperCase(),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px',
      background: dim ? C.bg : C.white, opacity: dim ? 0.85 : 1,
      display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy, wordBreak: 'break-all' }}>{row.title}</span>
          <span style={{ fontSize: 10, fontWeight: 700, background: '#EEF2FB', color: C.navy, padding: '1px 7px', borderRadius: 999 }}>{TYPE_LABEL[row.resource_type] || row.resource_type}</span>
          {row.version_label && <span style={{ fontSize: 10, fontWeight: 700, background: '#F0F0F0', color: C.text, padding: '1px 7px', borderRadius: 999 }}>{row.version_label}</span>}
          {row.is_current
            ? <span style={{ fontSize: 10, fontWeight: 700, background: '#E7F5EC', color: '#1E7A46', padding: '1px 7px', borderRadius: 999 }}>현재 자료</span>
            : <span style={{ fontSize: 10, fontWeight: 700, background: '#F3F4F6', color: C.muted, padding: '1px 7px', borderRadius: 999 }}>이전 자료</span>}
        </div>
        {meta && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{meta}</div>}
        {row.notes && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{row.notes}</div>}
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{
          fontSize: 12, fontWeight: 600, color: C.blue, textDecoration: 'none',
          border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 12px', whiteSpace: 'nowrap', flexShrink: 0,
        }}>{isView ? '보기 ↗' : '다운로드 ↓'}</a>
      ) : (
        <span style={{ fontSize: 11.5, color: C.danger, flexShrink: 0 }}>파일 경로를 확인할 수 없습니다.</span>
      )}
    </div>
  )
}
