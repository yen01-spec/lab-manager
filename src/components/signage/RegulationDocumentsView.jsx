import { useEffect, useRef, useState } from 'react'
import { C } from '../../design'
import { supabase } from '../../supabase'

const CATEGORIES = ['안전관리규정', '매뉴얼·가이드라인', '기타 문서']

// 화면 F — 안전관리규정 자료실. "안전관리규정 미비치" 지적사항 대응 — 실물 게시가 아니라
// 비치(보관) 여부가 핵심이라 PDF를 여기 보관해두는 것만으로 대응 가능(단순 파일 저장소).
// 기존 documents 스토리지 버킷(공지사항 첨부와 동일)을 재사용하고, 카테고리+버전관리만
// regulation_document 테이블로 새로 관리한다. "교체"해도 이전 버전 행은 지우지 않고
// previous_version_id로 이력만 연결 — 최신본은 아무도 previous_version_id로 가리키지 않는 행.
export default function RegulationDocumentsView({ student }) {
  const [docs, setDocs] = useState([])
  const [category, setCategory] = useState('전체')
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState(CATEGORIES[0])
  const fileRef = useRef(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('regulation_document').select('*').order('created_at', { ascending: false })
    setDocs(data || [])
  }

  const supersededIds = new Set(docs.map(d => d.previous_version_id).filter(Boolean))
  const latest = docs.filter(d => !supersededIds.has(d.id))
  const visible = latest.filter(d => (category === '전체' || d.category === category) && (!search.trim() || d.file_name.toLowerCase().includes(search.trim().toLowerCase())))

  async function handleUpload(file, replaceDoc) {
    if (!file) return
    if (!student) { alert('업로드하려면 로그인해주세요.'); return }
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `regulations/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
    if (upErr) { alert('업로드 실패: ' + upErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
    await supabase.from('regulation_document').insert({
      file_name: file.name, category: replaceDoc?.category || uploadCategory, file_url: urlData.publicUrl,
      file_size: file.size, uploaded_by: student.name,
      version: (replaceDoc?.version || 0) + 1, previous_version_id: replaceDoc?.id || null,
    })
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  return (
    <div>
      <div style={{ padding: '12px 16px', background: '#F7F8F4', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '13px', color: C.text, marginBottom: '20px' }}>
        "안전관리규정 미비치" 지적사항 대응 — 규정 문서를 여기 보관해두면 그 자체로 비치 증빙이 됩니다.
        일상점검일지는 실물 대장으로 관리 중이라 이 화면에 포함하지 않았습니다.
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['전체', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{
            fontFamily: 'monospace', fontSize: '12px', padding: '6px 14px', cursor: 'pointer',
            border: `1px solid ${C.text}`, background: category === c ? C.text : C.white, color: category === c ? '#fff' : C.text,
          }}>{c}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="파일명 검색" style={{ marginLeft: 'auto', padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: '6px', fontSize: '12.5px', width: '200px' }} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['파일명', '카테고리', '업로드일', '업로더', '버전', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: '11px', color: C.muted, borderBottom: `2px solid ${C.text}`, padding: '8px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: C.muted }}>등록된 문서가 없습니다.</td></tr>
            ) : visible.map(d => (
              <tr key={d.id}>
                <td style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 8px' }}>
                  <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: '#C8860A', fontWeight: '600', textDecoration: 'none' }}>{d.file_name}</a>
                </td>
                <td style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 8px', color: C.muted }}>{d.category}</td>
                <td style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 8px', color: C.muted, whiteSpace: 'nowrap' }}>{new Date(d.created_at).toLocaleDateString()}</td>
                <td style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 8px', color: C.muted }}>{d.uploaded_by || '-'}</td>
                <td style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 8px', fontFamily: 'monospace', fontSize: '11px', color: C.muted }}>v{d.version}{!supersededIds.has(d.id) && d.version === 1 ? '' : ' (최신)'}</td>
                <td style={{ borderBottom: `1px solid ${C.border}`, padding: '10px 8px', whiteSpace: 'nowrap' }}>
                  <a href={d.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: C.blue, marginRight: '10px' }}>다운로드</a>
                  <label style={{ fontSize: '11.5px', color: C.text, cursor: uploading ? 'default' : 'pointer' }}>
                    교체
                    <input type="file" accept="application/pdf" disabled={uploading} style={{ display: 'none' }}
                      onChange={e => handleUpload(e.target.files[0], d)} />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '22px', border: `2px dashed ${C.border}`, padding: '22px', textAlign: 'center', color: C.muted }}>
        <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ fontSize: '12.5px' }}>카테고리:</span>
          <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} style={{ padding: '5px 8px', border: `1px solid ${C.border}`, borderRadius: '5px', fontSize: '12.5px' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label style={{ fontSize: '13px', cursor: uploading ? 'default' : 'pointer' }}>
          {uploading ? '업로드 중...' : '＋ PDF 파일을 클릭해서 업로드'}
          <input ref={fileRef} type="file" accept="application/pdf" disabled={uploading} style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files[0], null)} />
        </label>
      </div>

      <div style={{ marginTop: '16px', fontSize: '12px', color: C.muted, borderTop: `1px dashed ${C.border}`, paddingTop: '14px' }}>
        ※ "교체" 시 이전 버전은 삭제되지 않고 이력으로 보관됩니다 · 검색은 파일명 기준
      </div>
    </div>
  )
}
