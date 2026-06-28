import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Icon, btnGhost, btnDanger } from '../design'

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
    await supabase.from('notices').update({ views: (data.views || 0) + 1 }).eq('id', id)
    const type = data.type
    const { data: prevData } = await supabase.from('notices').select('id, title').eq('type', type)
      .lt('created_at', data.created_at).order('created_at', { ascending: false }).limit(1).single()
    const { data: nextData } = await supabase.from('notices').select('id, title').eq('type', type)
      .gt('created_at', data.created_at).order('created_at', { ascending: true }).limit(1).single()
    setPrev(prevData || null); setNext(nextData || null)
  }

  async function handleDelete() {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    navigate(notice?.type === 'safety' ? '/safety' : '/notices')
  }

  if (!notice) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: C.muted }}>
      <Icon name="refresh" size={20} color={C.muted} />
    </div>
  )

  const listPath = notice.type === 'safety' ? '/safety' : '/notices'
  const detailPath = notice.type === 'safety' ? 'safety' : 'notices'
  const title = notice.type === 'safety' ? '연구실 안전관리' : '공지사항'
  const sub = notice.type === 'safety' ? 'Safety Management' : 'Notices'

  return (
    <div>
      <PageBanner title={title} sub={sub} breadcrumb={[title]} />

      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>

        {/* 본문 카드 */}
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,.06)', marginBottom: 12 }}>
          {/* 헤더 */}
          <div style={{ padding: '22px 28px', borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: C.navyDeep, lineHeight: 1.4 }}>{notice.title}</h2>
            <div style={{ display: 'flex', gap: 20, fontSize: 13, color: C.muted }}>
              <span>작성자: <strong style={{ color: C.textSub }}>{notice.author || '-'}</strong></span>
              <span>작성일: <strong style={{ color: C.textSub }}>{new Date(notice.created_at).toLocaleDateString('ko-KR')}</strong></span>
              <span>조회수: <strong style={{ color: C.textSub }}>{(notice.views || 0) + 1}</strong></span>
            </div>
          </div>

          {/* 본문 */}
          <div style={{ padding: '28px', minHeight: 200, fontSize: 14, color: C.text, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            {notice.content || '내용이 없습니다.'}
          </div>

          {/* 첨부파일 */}
          {notice.notice_files?.length > 0 && (
            <div style={{ padding: '16px 28px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon name="attach_file" size={14} color={C.muted} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>첨부파일</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {notice.notice_files.map(f => (
                  <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px', borderRadius: 7, border: `1px solid ${C.border}`,
                    background: C.white, color: C.blue, fontSize: 13, fontWeight: 600,
                    textDecoration: 'none', width: 'fit-content',
                  }}>
                    <Icon name="description" size={15} color={C.blue} />
                    {f.file_name}
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>({(f.file_size / 1024 / 1024).toFixed(1)}MB)</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 버튼 행 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button onClick={() => navigate(listPath)} style={{ ...btnGhost, padding: '7px 18px' }}>
            <Icon name="arrow_back" size={15} color={C.textSub} /> 목록
          </button>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDelete} style={{ ...btnDanger, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="delete" size={15} color={C.dangerDark} /> 삭제
              </button>
            </div>
          )}
        </div>

        {/* 이전글/다음글 */}
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>
          {next && (
            <div onClick={() => navigate(`/${detailPath}/${next.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 20px', cursor: 'pointer', borderBottom: `1px solid ${C.borderRow}` }}
              onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 12, color: C.muted, minWidth: 50, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="expand_less" size={14} color={C.muted} /> 다음글
              </span>
              <span style={{ fontSize: 13.5, color: C.text }}>{next.title}</span>
            </div>
          )}
          {prev && (
            <div onClick={() => navigate(`/${detailPath}/${prev.id}`)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 20px', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 12, color: C.muted, minWidth: 50, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name="expand_more" size={14} color={C.muted} /> 이전글
              </span>
              <span style={{ fontSize: 13.5, color: C.text }}>{prev.title}</span>
            </div>
          )}
          {!prev && !next && (
            <div style={{ padding: '14px 20px', color: C.muted, fontSize: 13, textAlign: 'center' }}>다른 글이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  )
}
