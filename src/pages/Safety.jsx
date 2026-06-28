import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Icon, SearchInput, Modal, inputStyle, btnPrimary, btnGhost, EmptyState } from '../design'

const PAGE_SIZE = 10

function BulletinTable({ rows, total, page, isAdmin, onRowClick, onEdit, onDelete, emptyMsg }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `60px 1fr 80px 100px 60px 40px${isAdmin ? ' 90px' : ''}`, padding: '10px 20px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        {['번호', '제목', '작성자', '작성일', '조회', '파일', ...(isAdmin ? ['관리'] : [])].map(h => (
          <div key={h} style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textAlign: h === '제목' ? 'left' : 'center' }}>{h}</div>
        ))}
      </div>
      {rows.length === 0
        ? <EmptyState icon="health_and_safety" message={emptyMsg} />
        : rows.map((row, i) => (
          <div key={row.id} onClick={() => onRowClick(row)}
            style={{ display: 'grid', gridTemplateColumns: `60px 1fr 80px 100px 60px 40px${isAdmin ? ' 90px' : ''}`, padding: '13px 20px', cursor: 'pointer', borderBottom: `1px solid ${C.borderRow}`, transition: 'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#FAFBFC'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ fontSize: 13, color: C.muted, textAlign: 'center' }}>{total - (page - 1) * PAGE_SIZE - i}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{row.title}</div>
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{row.author || '-'}</div>
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{new Date(row.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}</div>
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center' }}>{row.views || 0}</div>
            <div style={{ textAlign: 'center' }}>
              {row.notice_files?.length > 0 && <Icon name="attach_file" size={15} color={C.muted} />}
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                <button onClick={() => onEdit(row)} style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', color: C.textSub }}>수정</button>
                <button onClick={() => onDelete(row.id)} style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid #F3D6D6`, background: C.dangerTint, color: C.dangerDark, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>삭제</button>
              </div>
            )}
          </div>
        ))
      }
    </div>
  )
}

function Pagination({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 20 }}>
      {[{ label: '«', to: 1 }, { label: '‹', to: page - 1 }].map(b => (
        <button key={b.label} onClick={() => setPage(Math.max(1, b.to))} disabled={page === 1}
          style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, cursor: page === 1 ? 'default' : 'pointer', fontSize: 13, opacity: page === 1 ? 0.4 : 1, fontFamily: 'inherit' }}>{b.label}</button>
      ))}
      {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
        const p = Math.max(1, Math.min(page - 4, totalPages - 9)) + i
        return p <= totalPages ? (
          <button key={p} onClick={() => setPage(p)} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${page === p ? C.blue : C.border}`, background: page === p ? C.blue : C.white, color: page === p ? C.white : C.text, cursor: 'pointer', fontSize: 13, fontWeight: page === p ? 700 : 400, fontFamily: 'inherit' }}>{p}</button>
        ) : null
      })}
      {[{ label: '›', to: page + 1 }, { label: '»', to: totalPages }].map(b => (
        <button key={b.label} onClick={() => setPage(Math.min(totalPages, b.to))} disabled={page === totalPages}
          style={{ padding: '6px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.white, cursor: page === totalPages ? 'default' : 'pointer', fontSize: 13, opacity: page === totalPages ? 0.4 : 1, fontFamily: 'inherit' }}>{b.label}</button>
      ))}
    </div>
  )
}

export default function Safety() {
  const { isAdmin } = useOutletContext()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', author: '' })
  const [editingId, setEditingId] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchItems() }, [page, search])

  async function fetchItems() {
    let q = supabase.from('notices').select('*, notice_files(*)', { count: 'exact' })
      .eq('type', 'safety').order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) q = q.ilike('title', `%${search}%`)
    const { data, count } = await q
    setItems(data || []); setTotal(count || 0)
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
    setForm({ title: '', content: '', author: '' }); setFiles([]); setShowModal(false); setEditingId(null); setUploading(false)
    fetchItems()
  }

  function handleEdit(item) {
    setForm({ title: item.title, content: item.content || '', author: item.author || '' })
    setEditingId(item.id); setFiles([]); setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchItems()
  }

  return (
    <div>
      <PageBanner title="연구실 안전관리" sub="Safety Management" breadcrumb={['안전관리']}
        extra={isAdmin && (
          <button onClick={() => { setShowModal(true); setEditingId(null); setForm({ title: '', content: '', author: '' }); setFiles([]) }}
            style={{ ...btnPrimary, padding: '7px 16px' }}>
            <Icon name="edit" size={15} color={C.white} /> 글쓰기
          </button>
        )}
      />
      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="제목으로 검색…" style={{ width: 300 }} />
          <button onClick={() => { setSearch(searchInput); setPage(1) }} style={{ ...btnPrimary, padding: '8px 18px' }}>검색</button>
          {search && <button onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ ...btnGhost, padding: '8px 14px' }}>초기화</button>}
        </div>

        <BulletinTable rows={items} total={total} page={page} isAdmin={isAdmin}
          onRowClick={item => navigate(`/safety/${item.id}`)}
          onEdit={handleEdit} onDelete={handleDelete}
          emptyMsg={search ? '검색 결과가 없습니다.' : '등록된 안전 정보가 없습니다.'} />
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} setPage={setPage} />
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{ background: C.white, borderRadius: 14, boxShadow: '0 16px 44px rgba(16,24,40,.14)', width: '100%', maxWidth: 600, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.navyDeep }}>{editingId ? '안전정보 수정' : '새 안전정보 작성'}</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                <Icon name="close" size={20} color={C.muted} />
              </button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))} placeholder="작성자" style={{ ...inputStyle, width: 160 }} />
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="제목" style={{ ...inputStyle, flex: 1 }} />
              </div>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="내용" rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name="attach_file" size={15} color={C.muted} />
                  <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>파일 첨부</span>
                  <label style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, fontFamily: 'inherit' }}>
                    + 파일 추가 <input type="file" multiple onChange={e => {
                      const newFiles = Array.from(e.target.files).filter(f => f.size <= 50*1024*1024)
                      setFiles(p => [...p, ...newFiles]); e.target.value = ''
                    }} style={{ display: 'none' }} />
                  </label>
                </div>
                {files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 4 }}>
                    <Icon name="description" size={14} color={C.muted} />
                    <span style={{ fontSize: 12.5, flex: 1 }}>{f.name}</span>
                    <button onClick={() => setFiles(p => p.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Icon name="close" size={15} color={C.muted} />
                    </button>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: C.muted }}>최대 50MB까지 첨부 가능합니다.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ ...btnGhost, padding: '8px 18px' }}>취소</button>
                <button onClick={handleSubmit} disabled={uploading} style={{ ...btnPrimary, padding: '8px 18px', opacity: uploading ? 0.6 : 1 }}>{uploading ? '저장 중…' : '저장'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
