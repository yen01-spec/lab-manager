import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

const PAGE_SIZE = 10

export default function Safety() {
  const { isAdmin } = useOutletContext()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', author: '' })
  const [editingId, setEditingId] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchItems() }, [page, search])

  async function fetchItems() {
    let query = supabase.from('notices').select('*, notice_files(*)', { count: 'exact' })
      .eq('type', 'safety')
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) query = query.ilike('title', `%${search}%`)
    const { data, count } = await query
    setItems(data || [])
    setTotal(count || 0)
  }

  function handleFileAdd(e) {
    const newFiles = Array.from(e.target.files)
    const oversized = newFiles.filter(f => f.size > 50 * 1024 * 1024)
    if (oversized.length > 0) {
      alert(`파일 크기가 너무 큽니다.\n최대 50MB까지 업로드할 수 있어요.\n\n초과 파일: ${oversized.map(f => f.name).join(', ')}`)
      e.target.value = ''
      return
    }
    setFiles(prev => [...prev, ...newFiles])
    e.target.value = ''
  }

  async function handleSubmit() {
    if (!form.title.trim()) return alert('제목을 입력하세요')
    setUploading(true)
    let noticeId = editingId
    if (editingId) {
      await supabase.from('notices').update({ title: form.title, content: form.content, author: form.author }).eq('id', editingId)
    } else {
      const { data } = await supabase.from('notices').insert({ title: form.title, content: form.content, author: form.author, type: 'safety', views: 0 }).select().single()
      noticeId = data.id
    }
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `safety/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file)
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        await supabase.from('notice_files').insert({ notice_id: noticeId, file_url: urlData.publicUrl, file_name: file.name, file_size: file.size })
      }
    }
    setForm({ title: '', content: '', author: '' })
    setFiles([])
    setShowForm(false)
    setEditingId(null)
    setUploading(false)
    fetchItems()
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchItems()
  }

  function handleEdit(item, e) {
    e.stopPropagation()
    setForm({ title: item.title, content: item.content || '', author: item.author || '' })
    setEditingId(item.id)
    setShowForm(true)
    setFiles([])
    window.scrollTo(0, 0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <PageBanner title="연구실 안전관리" sub="Safety Management" breadcrumb={['홈', '연구실 안전관리']} />

      <div style={{ padding: '32px 40px', maxWidth: '960px', margin: '0 auto' }}>

        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ title: '', content: '', author: '' }); setFiles([]) }} style={{
              background: C.navy, color: C.white, border: 'none',
              padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}>✏️ 글쓰기</button>
          </div>
        )}

        {showForm && isAdmin && (
          <div style={{ background: C.white, borderRadius: '10px', padding: '24px', marginBottom: '20px', border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(26,42,94,0.08)' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: C.navy, marginBottom: '16px' }}>
              {editingId ? '✏️ 안전정보 수정' : '✏️ 새 안전정보 작성'}
            </div>
            <input
              value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
              placeholder="작성자 이름"
              style={{ width: '200px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <input
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="제목을 입력하세요"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <textarea
              value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="내용을 입력하세요"
              rows={8}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' }}
            />
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: C.muted, fontWeight: '600' }}>📎 파일 첨부</span>
                <label style={{ padding: '5px 12px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '12px', color: C.navy, fontWeight: '600' }}>
                  + 파일 추가
                  <input type="file" multiple onChange={handleFileAdd} style={{ display: 'none' }} />
                </label>
              </div>
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: C.bg, border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: '13px', flex: 1 }}>📎 {f.name}</span>
                      <span style={{ fontSize: '12px', color: C.muted }}>({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
                      <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '18px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '12px', color: C.muted }}>📌 최대 50MB까지 첨부 가능합니다.</div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingId(null); setFiles([]) }} style={{ padding: '8px 18px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '13px' }}>취소</button>
              <button onClick={handleSubmit} disabled={uploading} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: C.navy, color: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>{uploading ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        )}

        {/* 검색 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
          <input
            value={searchInput} onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1) } }}
            placeholder="검색어를 입력해 주세요"
            style={{ padding: '9px 14px', borderRadius: '6px', border: `1px solid ${C.border}`, fontSize: '14px', width: '300px' }}
          />
          <button onClick={() => { setSearch(searchInput); setPage(1) }} style={{
            padding: '9px 20px', borderRadius: '6px', border: 'none',
            background: C.navy, color: C.white, cursor: 'pointer', fontSize: '14px', fontWeight: '600',
          }}>검색</button>
          {search && <button onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{
            padding: '9px 14px', borderRadius: '6px', border: `1px solid ${C.border}`,
            background: C.white, cursor: 'pointer', fontSize: '13px',
          }}>초기화</button>}
        </div>

        {/* 테이블 */}
        <div style={{ background: C.white, borderRadius: '10px', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 60px 40px' + (isAdmin ? ' 80px' : ''), background: C.bg, borderBottom: `2px solid ${C.border}`, padding: '12px 20px' }}>
            {['번호', '제목', '작성자', '작성일', '조회', '파일', ...(isAdmin ? ['관리'] : [])].map(h => (
              <div key={h} style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', textAlign: h === '제목' ? 'left' : 'center' }}>{h}</div>
            ))}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
              {search ? '검색 결과가 없습니다.' : '등록된 안전 정보가 없습니다.'}
            </div>
          ) : (
            items.map((item, i) => (
              <div key={item.id}
                onClick={() => navigate(`/safety/${item.id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 60px 40px' + (isAdmin ? ' 80px' : ''),
                  padding: '14px 20px', cursor: 'pointer',
                  borderBottom: `1px solid ${C.border}`,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F7FC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: '13px', color: C.muted, textAlign: 'center' }}>{total - (page - 1) * PAGE_SIZE - i}</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: C.text }}>{item.title}</div>
                <div style={{ fontSize: '12px', color: C.muted, textAlign: 'center' }}>{item.author || '-'}</div>
                <div style={{ fontSize: '12px', color: C.muted, textAlign: 'center' }}>{new Date(item.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
                <div style={{ fontSize: '12px', color: C.muted, textAlign: 'center' }}>{item.views || 0}</div>
                <div style={{ textAlign: 'center' }}>{item.notice_files?.length > 0 && <span style={{ fontSize: '13px' }}>📎</span>}</div>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                    <button onClick={e => handleEdit(item, e)} style={{ padding: '3px 8px', borderRadius: '4px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '11px' }}>수정</button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(item.id) }} style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #FC8181', background: '#FFF5F5', color: C.danger, cursor: 'pointer', fontSize: '11px' }}>삭제</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '24px' }}>
            <button onClick={() => setPage(1)} disabled={page === 1} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: page === 1 ? 'default' : 'pointer', fontSize: '13px', opacity: page === 1 ? 0.4 : 1 }}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: page === 1 ? 'default' : 'pointer', fontSize: '13px', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
            {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 4, totalPages - 9)) + i
              return p <= totalPages ? (
                <button key={p} onClick={() => setPage(p)} style={{
                  padding: '6px 12px', borderRadius: '6px', border: `1px solid ${page === p ? C.navy : C.border}`,
                  background: page === p ? C.navy : C.white, color: page === p ? C.white : C.text,
                  cursor: 'pointer', fontSize: '13px', fontWeight: page === p ? '700' : '400',
                }}>{p}</button>
              ) : null
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: page === totalPages ? 'default' : 'pointer', fontSize: '13px', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${C.border}`, background: C.white, cursor: page === totalPages ? 'default' : 'pointer', fontSize: '13px', opacity: page === totalPages ? 0.4 : 1 }}>»</button>
          </div>
        )}
      </div>
    </div>
  )
}