import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

export default function NoticeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useOutletContext()
  const [notice, setNotice] = useState(null)
  const [prev, setPrev] = useState(null)
  const [next, setNext] = useState(null)

  useEffect(() => { fetchNotice() }, [id])

  async function fetchNotice() {
    const { data } = await supabase.from('notices').select('*, notice_files(*)').eq('id', id).single()
    if (!data) return
    setNotice(data)

    // 조회수 증가
    await supabase.from('notices').update({ views: (data.views || 0) + 1 }).eq('id', id)

    const type = data.type

    // 이전글 (더 오래된 것)
    const { data: prevData } = await supabase.from('notices')
      .select('id, title').eq('type', type)
      .lt('created_at', data.created_at)
      .order('created_at', { ascending: false }).limit(1).single()
    setPrev(prevData || null)

    // 다음글 (더 최신)
    const { data: nextData } = await supabase.from('notices')
      .select('id, title').eq('type', type)
      .gt('created_at', data.created_at)
      .order('created_at', { ascending: true }).limit(1).single()
    setNext(nextData || null)
  }

  async function handleDelete() {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    const path = notice?.type === 'safety' ? '/safety' : '/notices'
    navigate(path)
  }

  if (!notice) return <div style={{ padding: '60px', textAlign: 'center', color: C.muted }}>로딩 중...</div>

  const listPath = notice.type === 'safety' ? '/safety' : '/notices'
  const title = notice.type === 'safety' ? '연구실 안전관리' : '공지사항'
  const sub = notice.type === 'safety' ? 'Safety Management' : 'Notices'

  return (
    <div>
      <PageBanner title={title} sub={sub} breadcrumb={['홈', title]} />

      <div style={{ padding: '32px 40px', maxWidth: '960px', margin: '0 auto' }}>

        {/* 제목 영역 */}
        <div style={{ background: C.white, borderRadius: '10px', border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: '0', boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: '700', color: C.navy }}>{notice.title}</h2>
            <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: C.muted }}>
              <span>작성자: <strong style={{ color: C.text }}>{notice.author || '-'}</strong></span>
              <span>작성일: <strong style={{ color: C.text }}>{new Date(notice.created_at).toLocaleDateString('ko-KR')}</strong></span>
              <span>조회수: <strong style={{ color: C.text }}>{(notice.views || 0) + 1}</strong></span>
            </div>
          </div>

          {/* 본문 */}
          <div style={{ padding: '28px', minHeight: '200px', fontSize: '14px', color: C.text, lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
            {notice.content || '내용이 없습니다.'}
          </div>

          {/* 첨부파일 */}
          {notice.notice_files?.length > 0 && (
            <div style={{ padding: '16px 28px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: C.muted, marginBottom: '8px' }}>📎 첨부파일</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notice.notice_files.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 14px', borderRadius: '6px', border: `1px solid ${C.border}`,
                      background: C.white, color: C.navy, fontSize: '13px', fontWeight: '600', textDecoration: 'none',
                    }}>📎 {f.file_name}</a>
                    <span style={{ fontSize: '12px', color: C.muted }}>({(f.file_size / 1024 / 1024).toFixed(1)}MB)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <button onClick={() => navigate(listPath)} style={{
            padding: '8px 20px', borderRadius: '8px', border: `1px solid ${C.border}`,
            background: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600',
          }}>목록으로</button>
          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => navigate(listPath, { state: { editId: notice.id } })} style={{
                padding: '8px 16px', borderRadius: '8px', border: `1px solid ${C.border}`,
                background: C.white, cursor: 'pointer', fontSize: '13px',
              }}>✏️ 수정</button>
              <button onClick={handleDelete} style={{
                padding: '8px 16px', borderRadius: '8px', border: '1px solid #FC8181',
                background: '#FFF5F5', color: C.danger, cursor: 'pointer', fontSize: '13px',
              }}>🗑️ 삭제</button>
            </div>
          )}
        </div>

        {/* 이전글/다음글 */}
        <div style={{ marginTop: '16px', background: C.white, borderRadius: '10px', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          {next && (
            <div onClick={() => navigate(`/${notice.type === 'safety' ? 'safety' : 'notices'}/${next.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F7FC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: '12px', color: C.muted, minWidth: '50px' }}>▲ 다음글</span>
              <span style={{ fontSize: '14px', color: C.text }}>{next.title}</span>
            </div>
          )}
          {prev && (
            <div onClick={() => navigate(`/${notice.type === 'safety' ? 'safety' : 'notices'}/${prev.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F5F7FC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: '12px', color: C.muted, minWidth: '50px' }}>▼ 이전글</span>
              <span style={{ fontSize: '14px', color: C.text }}>{prev.title}</span>
            </div>
          )}
          {!prev && !next && (
            <div style={{ padding: '14px 20px', color: C.muted, fontSize: '13px', textAlign: 'center' }}>다른 글이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  )
}