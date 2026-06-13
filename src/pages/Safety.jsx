import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

export default function Safety() {
  const { isAdmin } = useOutletContext()
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [editingId, setEditingId] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from('notices').select('*, notice_files(*)')
      .eq('type', 'safety')
      .order('created_at', { ascending: false })
    setItems(data || [])
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
      await supabase.from('notices').update({ title: form.title, content: form.content }).eq('id', editingId)
    } else {
      const { data } = await supabase.from('notices').insert({ title: form.title, content: form.content, type: 'safety' }).select().single()
      noticeId = data.id
    }

    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `safety/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documents').upload(path, file)
      if (!error) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
        await supabase.from('notice_files').insert({
          notice_id: noticeId,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_size: file.size,
        })
      }
    }

    setForm({ title: '', content: '' })
    setFiles([])
    setShowForm(false)
    setEditingId(null)
    setUploading(false)
    fetchItems()
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    setSelected(null)
    fetchItems()
  }

  async function handleFileDelete(fileId) {
    if (!confirm('첨부파일을 삭제하시겠습니까?')) return
    await supabase.from('notice_files').delete().eq('id', fileId)
    fetchItems()
  }

  function handleEdit(item) {
    setForm({ title: item.title, content: item.content })
    setEditingId(item.id)
    setShowForm(true)
    setSelected(null)
    setFiles([])
  }

  return (
    <div>
      <PageBanner title="연구실 안전관리" sub="Safety Management" breadcrumb={['홈', '연구실 안전관리']} />

      <div style={{ padding: '32px 40px', maxWidth: '960px', margin: '0 auto' }}>

        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ title: '', content: '' }); setFiles([]) }} style={{
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
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="제목을 입력하세요"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <textarea
              value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="내용을 입력하세요"
              rows={6}
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', marginBottom: '12px' }}
            />

            {/* 파일 첨부 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: C.muted, fontWeight: '600' }}>📎 파일 첨부</span>
                <label style={{
                  padding: '5px 12px', borderRadius: '6px', border: `1px solid ${C.border}`,
                  background: C.white, cursor: 'pointer', fontSize: '12px', color: C.navy, fontWeight: '600',
                }}>
                  + 파일 추가
                  <input type="file" multiple onChange={handleFileAdd} style={{ display: 'none' }} />
                </label>
              </div>
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px', background: C.bg, border: `1px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize: '13px', flex: 1 }}>📎 {f.name}</span>
                      <span style={{ fontSize: '12px', color: C.muted }}>({(f.size / 1024 / 1024).toFixed(1)}MB)</span>
                      <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '18px', lineHeight: 1,
                      }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '12px', color: C.muted }}>📌 최대 50MB까지 첨부 가능합니다. (PDF, 이미지 등)</div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingId(null); setFiles([]) }} style={{
                padding: '8px 18px', borderRadius: '8px', border: `1px solid ${C.border}`,
                background: C.white, cursor: 'pointer', fontSize: '13px',
              }}>취소</button>
              <button onClick={handleSubmit} disabled={uploading} style={{
                padding: '8px 18px', borderRadius: '8px', border: 'none',
                background: C.navy, color: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              }}>{uploading ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        )}

        <div style={{ background: C.white, borderRadius: '10px', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 40px 100px' + (isAdmin ? ' 80px' : ''), background: C.bg, borderBottom: `2px solid ${C.border}`, padding: '12px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase' }}>번호</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase' }}>제목</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', textAlign: 'center' }}>파일</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', textAlign: 'center' }}>작성일</div>
            {isAdmin && <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', textAlign: 'center' }}>관리</div>}
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
              등록된 안전 정보가 없습니다.
            </div>
          ) : (
            items.map((item, i) => (
              <div key={item.id}>
                <div
                  onClick={() => setSelected(selected?.id === item.id ? null : item)}
                  style={{
                    display: 'grid', gridTemplateColumns: '60px 1fr 40px 100px' + (isAdmin ? ' 80px' : ''),
                    padding: '14px 20px', cursor: 'pointer',
                    borderBottom: `1px solid ${C.border}`,
                    background: selected?.id === item.id ? '#F0F4FF' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== item.id) e.currentTarget.style.background = '#F5F7FC' }}
                  onMouseLeave={e => { if (selected?.id !== item.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: '13px', color: C.muted }}>{items.length - i}</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: selected?.id === item.id ? C.navy : C.text }}>{item.title}</div>
                  <div style={{ textAlign: 'center' }}>
                    {item.notice_files?.length > 0 && (
                      <span style={{ fontSize: '13px' }}>📎{item.notice_files.length > 1 ? item.notice_files.length : ''}</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: C.muted, textAlign: 'center' }}>
                    {new Date(item.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleEdit(item)} style={{ padding: '3px 8px', borderRadius: '4px', border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: '11px' }}>수정</button>
                      <button onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid #FC8181', background: '#FFF5F5', color: C.danger, cursor: 'pointer', fontSize: '11px' }}>삭제</button>
                    </div>
                  )}
                </div>

                {selected?.id === item.id && (
                  <div style={{ padding: '20px 24px', background: '#F8FAFF', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: '14px', color: C.text, lineHeight: '1.8', whiteSpace: 'pre-wrap', marginBottom: item.notice_files?.length > 0 ? '12px' : 0 }}>
                      {item.content || '내용이 없습니다.'}
                    </div>
                    {item.notice_files?.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {item.notice_files.map(f => (
                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <a href={f.file_url} target="_blank" rel="noopener noreferrer" style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '6px 14px', borderRadius: '6px', border: `1px solid ${C.border}`,
                              background: C.white, color: C.navy, fontSize: '13px', fontWeight: '600', textDecoration: 'none',
                            }}>📎 {f.file_name}</a>
                            <span style={{ fontSize: '12px', color: C.muted }}>({(f.file_size / 1024 / 1024).toFixed(1)}MB)</span>
                            {isAdmin && (
                              <button onClick={() => handleFileDelete(f.id)} style={{
                                background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '16px',
                              }}>×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}