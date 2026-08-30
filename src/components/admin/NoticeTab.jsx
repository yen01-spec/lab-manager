import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import { C, Card, inputStyle, labelStyle, btnPrimary, btnGhost } from '../../design'

// ══════════════════════════════════════════════
//  공지 / 안전정보
// ══════════════════════════════════════════════
export default function NoticeTab() {
  const [form, setForm] = useState({ title: '', content: '', type: 'notice' })
  const [notices, setNotices] = useState([])
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => { fetchNotices() }, [])

  async function fetchNotices() {
    const { data } = await supabase.from('notices').select('*').order('created_at', { ascending: false })
    if (data) setNotices(data)
  }

  async function save() {
    if (!form.title.trim()) { alert('제목을 입력해주세요'); return }
    if (editTarget) {
      await supabase.from('notices').update({ title: form.title, content: form.content, type: form.type }).eq('id', editTarget)
    } else {
      await supabase.from('notices').insert(form)
    }
    setForm({ title: '', content: '', type: 'notice' })
    setEditTarget(null)
    fetchNotices()
  }

  async function del(id) {
    if (!window.confirm('삭제하시겠습니까?')) return
    await supabase.from('notices').delete().eq('id', id)
    fetchNotices()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <Card title={editTarget ? '✏️ 수정 중' : '📢 새 글 작성'}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '16px', marginBottom: '12px' }}>
          <div><label style={labelStyle}>제목 *</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} /></div>
          <div><label style={labelStyle}>분류</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="notice">공지사항</option>
              <option value="safety">안전관리</option>
            </select></div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>내용</label>
          <textarea value={form.content} rows={4}
            onChange={e => setForm({ ...form, content: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} style={btnPrimary}>{editTarget ? '수정 저장' : '등록'}</button>
          {editTarget && <button onClick={() => { setEditTarget(null); setForm({ title: '', content: '', type: 'notice' }) }} style={btnGhost}>취소</button>}
        </div>
      </Card>
      <Card title="📋 등록된 글 목록">
        {notices.length === 0 ? <p style={{ color: C.muted }}>등록된 글이 없습니다.</p>
          : notices.map(n => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px',
                    background: n.type === 'safety' ? '#FEF3C7' : '#EBF8FF',
                    color: n.type === 'safety' ? '#92400E' : '#1A56DB',
                    padding: '1px 8px', borderRadius: '10px', fontWeight: '700' }}>
                    {n.type === 'safety' ? '안전관리' : '공지'}
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '14px' }}>{n.title}</span>
                  <span style={{ color: C.muted, fontSize: '12px' }}>{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
                {n.content && <p style={{ margin: 0, color: C.muted, fontSize: '13px' }}>{n.content}</p>}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                <button onClick={() => { setEditTarget(n.id); setForm({ title: n.title, content: n.content || '', type: n.type || 'notice' }) }}
                  style={{ ...btnGhost, padding: '4px 10px', fontSize: '12px' }}>수정</button>
                <button onClick={() => del(n.id)} style={{ background: '#FFF5F5', color: C.danger,
                  border: `1px solid #FC8181`, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>삭제</button>
              </div>
            </div>
          ))}
      </Card>
    </div>
  )
}
