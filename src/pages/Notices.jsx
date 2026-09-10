import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Icon, SearchInput, Modal, inputStyle, btnPrimary, btnGhost, EmptyState } from '../design'

const PAGE_SIZE = 10

function BulletinTable({ rows, total, page, isAdmin, onRowClick, onEdit, onDelete, emptyMsg }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>
      {/* 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: `60px 1fr 80px 100px 60px 40px${isAdmin ? ' 90px' : ''}`, padding: '10px 20px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        {['번호', '제목', '작성자', '작성일', '조회', '파일', ...(isAdmin ? ['관리'] : [])].map(h => (
          <div key={h} style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textAlign: h === '제목' ? 'left' : 'center' }}>{h}</div>
        ))}
      </div>
      {rows.length === 0
        ? <EmptyState icon="article" message={emptyMsg} />
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

function WriteModal({ open, onClose, form, setForm, files, setFiles, onSubmit, uploading, editing }) {
  function handleFileAdd(e) {
    const newFiles = Array.from(e.target.files).filter(f => {
      if (f.size > 50 * 1024 * 1024) { alert(`${f.name}: 50MB 초과`); return false }
      return true
    })
    setFiles(prev => [...prev, ...newFiles])
    e.target.value = ''
  }
  return (
    <Modal open={open} onClose={onClose} title={editing ? '공지 수정' : '새 공지 작성'} width={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={form.author} onChange={e => setForm(f => ({ ...f, author: e.target.value }))}
            placeholder="작성자" style={{ ...inputStyle, width: 160 }} />
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="제목" style={{ ...inputStyle, flex: 1 }} />
        </div>
        <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          placeholder="내용" rows={8}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
        {/* 파일 첨부 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="attach_file" size={15} color={C.muted} />
            <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>파일 첨부</span>
            <label style={{ padding: '4px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 12, color: C.blue, fontWeight: 600, fontFamily: 'inherit' }}>
              + 파일 추가 <input type="file" multiple onChange={handleFileAdd} style={{ display: 'none' }} />
            </label>
          </div>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 4 }}>
              <Icon name="description" size={14} color={C.muted} />
              <span style={{ fontSize: 12.5, flex: 1 }}>{f.name}</span>
              <span style={{ fontSize: 11, color: C.muted }}>({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
              <button onClick={() => setFiles(p => p.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <Icon name="close" size={15} color={C.muted} />
              </button>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: C.muted }}>최대 50MB까지 첨부 가능합니다.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button onClick={onClose} style={{ ...btnGhost, padding: '8px 18px' }}>취소</button>
          <button onClick={onSubmit} disabled={uploading} style={{ ...btnPrimary, padding: '8px 18px', opacity: uploading ? 0.6 : 1 }}>
            {uploading ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function Notices() {
  const { isAdmin } = useOutletContext()
  const navigate = useNavigate()
  const [notices, setNotices] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', author: '' })
  const [editingId, setEditingId] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchNotices() }, [page, search])

  async function fetchNotices() {
    let q = supabase.from('notices').select('*, notice_files(*)', { count: 'exact' })
      .eq('type', 'notice').order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) q = q.ilike('title', `%${search}%`)
    const { data, count } = await q
    setNotices(data || []); setTotal(count || 0)
  }

  async function handleSubmit() {
    if (!form.title.trim()) return alert('제목을 입력하세요')
    setUploading(true)
    let noticeId = editingId
    if (editingId) {
      await supabase.from('notices').update({ title: form.title, content: form.content, author: form.author }).eq('id', editingId)
    } else {
      const { data } = await supabase.from('notices').insert({ title: form.title, content: form.content, author: form.author, type: 'notice', views: 0 }).select().single()
      noticeId = data.id
    }
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `notices/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file)
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        await supabase.from('notice_files').insert({ notice_id: noticeId, file_url: urlData.publicUrl, file_name: file.name, file_size: file.size })
      }
    }
    setForm({ title: '', content: '', author: '' }); setFiles([]); setShowModal(false); setEditingId(null); setUploading(false)
    fetchNotices()
  }

  function handleEdit(notice) {
    setForm({ title: notice.title, content: notice.content || '', author: notice.author || '' })
    setEditingId(notice.id); setFiles([]); setShowModal(true)
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchNotices()
  }

  return (
    <div>
      <PageBanner title="공지사항" sub="Notices" breadcrumb={['공지사항']}
        extra={isAdmin && (
          <button onClick={() => { setShowModal(true); setEditingId(null); setForm({ title: '', content: '', author: '' }); setFiles([]) }}
            style={{ ...btnPrimary, padding: '7px 16px' }}>
            <Icon name="edit" size={15} color={C.white} /> 글쓰기
          </button>
        )}
      />
      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        {/* 검색 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <SearchInput value={searchInput} onChange={setSearchInput}
            placeholder="제목으로 검색…"
            style={{ width: 300 }}
          />
          <button onClick={() => { setSearch(searchInput); setPage(1) }} style={{ ...btnPrimary, padding: '8px 18px' }}>검색</button>
          {search && <button onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ ...btnGhost, padding: '8px 14px' }}>초기화</button>}
        </div>

        <BulletinTable rows={notices} total={total} page={page} isAdmin={isAdmin}
          onRowClick={n => navigate(`/notices/${n.id}`)}
          onEdit={handleEdit} onDelete={handleDelete}
          emptyMsg={search ? '검색 결과가 없습니다.' : '등록된 공지사항이 없습니다.'} />
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} setPage={setPage} />
      </div>

      <WriteModal open={showModal} onClose={() => setShowModal(false)}
        form={form} setForm={setForm} files={files} setFiles={setFiles}
        onSubmit={handleSubmit} uploading={uploading} editing={!!editingId} />
    </div>
  )
}
