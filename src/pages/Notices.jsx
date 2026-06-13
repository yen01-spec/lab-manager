import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

const C = {
  navy: '#1a2a5e', gold: '#E8A020', white: '#FFFFFF',
  bg: '#F0F2F7', border: '#DDE2EE', text: '#1C2B4A', muted: '#6B7A99', danger: '#D63031',
}

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
    <div style={{ padding: '32px 24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '11px', color: C.gold, fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>Notices</div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: C.navy }}>공지사항</h1>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ title: '', content: '' }) }} style={{
            background: C.navy, color: C.white, border: 'none',
            padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
          }}>✏️ 글쓰기</button>
        )}
      </div>

      {/* 글쓰기 폼 */}
      {showForm && isAdmin && (
        <div style={{ background: C.white, borderRadius: '12px', padding: '20px', marginBottom: '20px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: C.navy, marginBottom: '12px' }}>
            {editingId ? '공지 수정' : '새 공지 작성'}
          </div>
          <input
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="제목을 입력하세요"
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' }}
          />
          <textarea
            value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            placeholder="내용을 입력하세요"
            rows={6}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${C.border}`, fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} style={{
              padding: '8px 16px', borderRadius: '8px', border: `1px solid ${C.border}`,
              background: C.white, cursor: 'pointer', fontSize: '13px',
            }}>취소</button>
            <button onClick={handleSubmit} style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              background: C.navy, color: C.white, cursor: 'pointer', fontSize: '13px', fontWeight: '600',
            }}>저장</button>
          </div>
        </div>
      )}

      {/* 공지 목록 */}
      <div style={{ background: C.white, borderRadius: '12px', border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {notices.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: C.muted, fontSize: '14px' }}>
            등록된 공지사항이 없습니다.
          </div>
        ) : (
          notices.map((notice, i) => (
            <div key={notice.id}>
              {i > 0 && <div style={{ borderTop: `1px solid ${C.border}` }} />}
              <div
                onClick={() => setSelected(selected?.id === notice.id ? null : notice)}
                style={{ padding: '16px 20px', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F7FC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: C.text }}>{notice.title}</div>
                  <div style={{ fontSize: '12px', color: C.muted }}>
                    {new Date(notice.created_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
                {selected?.id === notice.id && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '14px', color: C.text, lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                      {notice.content}
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button onClick={e => { e.stopPropagation(); handleEdit(notice) }} style={{
                          padding: '6px 12px', borderRadius: '6px', border: `1px solid ${C.border}`,
                          background: C.white, cursor: 'pointer', fontSize: '12px',
                        }}>✏️ 수정</button>
                        <button onClick={e => { e.stopPropagation(); handleDelete(notice.id) }} style={{
                          padding: '6px 12px', borderRadius: '6px', border: `1px solid #FC8181`,
                          background: '#FFF5F5', color: C.danger, cursor: 'pointer', fontSize: '12px',
                        }}>🗑️ 삭제</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}