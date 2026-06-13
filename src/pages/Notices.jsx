import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner } from '../design'

export default function Notices() {
  const { isAdmin } = useOutletContext()
  const [notices, setNotices] = useState([])
  const [selected, setSelected] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', content: '' })
  const [editingId, setEditingId] = useState(null)

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    const { data } = await supabase
      .from('notices').select('*')
      .eq('type', 'notice')
      .order('created_at', { ascending: false })
    setNotices(data || [])
  }

  async function handleSubmit() {
    if (!form.title.trim()) return alert('제목을 입력하세요')
    if (editingId) {
      await supabase.from('notices').update({ title: form.title, content: form.content }).eq('id', editingId)
    } else {
      await supabase.from('notices').insert({ title: form.title, content: form.content, type: 'notice' })
    }
    setForm({ title: '', content: '' })
    setShowForm(false)
    setEditingId(null)
    fetchNotices()
  }

  async function handleDelete(id) {
    if (!confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    setSelected(null)
    fetchNotices()
  }

  function handleEdit(notice) {
    setForm({ title: notice.title, content: notice.content })
    setEditingId(notice.id)
    setShowForm(true)
    setSelected(null)
  }

  return (
    <div>
      <PageBanner title="공지사항" sub="Notices" breadcrumb={['홈', '공지사항']} />

      <div style={{ padding: '32px 40px', maxWidth: '960px', margin: '0 auto' }}>

        {/* 글쓰기 버튼 */}
        {isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ title: '', content: '' }) }} style={{
              background: C.navy, color: C.white, border: 'none',
              padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}>✏️ 글쓰기</button>
          </div>
        )}

        {/* 글쓰기 폼 */}
        {showForm && isAdmin && (
          <div style={{ background: C.white, borderRadius: '10px', padding: '24px', marginBottom: '20px', border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(26,42,94,0.08)' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: C.navy, marginBottom: '16px' }}>
              {editingId ? '✏️ 공지 수정' : '✏️ 새 공지 작성'}
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
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} style={{
                padding: '8px 18px', borderRadius: '8px', border: `1px solid ${C.border}`,
                background: C.white, cursor: 'pointer', fontSize: '13px',
              }}>취소</button>
              <button onClick={handleSubmit} style={{
                padding: '8px 18px', borderRadius: '8px', border: 'none',
                background: C.navy, color: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600',
              }}>저장</button>
            </div>
          </div>
        )}

        {/* 목록 테이블 */}
        <div style={{ background: C.white, borderRadius: '10px', border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,42,94,0.06)' }}>
          {/* 테이블 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px', background: C.bg, borderBottom: `2px solid ${C.border}`, padding: '12px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>번호</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>제목</div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>작성일</div>
            {isAdmin && <div style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>관리</div>}
          </div>

          {notices.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
              등록된 공지사항이 없습니다.
            </div>
          ) : (
            notices.map((notice, i) => (
              <div key={notice.id}>
                {/* 목록 행 */}
                <div
                  onClick={() => setSelected(selected?.id === notice.id ? null : notice)}
                  style={{
                    display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px',
                    padding: '14px 20px', cursor: 'pointer',
                    borderBottom: `1px solid ${C.border}`,
                    background: selected?.id === notice.id ? '#F0F4FF' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== notice.id) e.currentTarget.style.background = '#F5F7FC' }}
                  onMouseLeave={e => { if (selected?.id !== notice.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ fontSize: '13px', color: C.muted }}>{notices.length - i}</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: selected?.id === notice.id ? C.navy : C.text }}>
                    {notice.title}
                  </div>
                  <div style={{ fontSize: '12px', color: C.muted, textAlign: 'center' }}>
                    {new Date(notice.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleEdit(notice)} style={{
                        padding: '3px 8px', borderRadius: '4px', border: `1px solid ${C.border}`,
                        background: C.white, cursor: 'pointer', fontSize: '11px',
                      }}>수정</button>
                      <button onClick={() => handleDelete(notice.id)} style={{
                        padding: '3px 8px', borderRadius: '4px', border: '1px solid #FC8181',
                        background: '#FFF5F5', color: C.danger, cursor: 'pointer', fontSize: '11px',
                      }}>삭제</button>
                    </div>
                  )}
                </div>

                {/* 내용 펼치기 */}
                {selected?.id === notice.id && (
                  <div style={{
                    padding: '20px 24px', background: '#F8FAFF',
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ fontSize: '14px', color: C.text, lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
                      {notice.content || '내용이 없습니다.'}
                    </div>
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