import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { C, PageBanner, Icon, SearchInput, btnPrimary, btnGhost, EmptyState } from '../design'

// 연구실 안전관리 게시판 — 지난 안전 공지 보관용(읽기 전용).
// 안전관리 절차·공식자료·양식은 [자료] 탭으로 이관되었고, 새 안전 공지는 [공지사항]에서 작성합니다.
// 기존 글(notices.type='safety') 열람을 위해 목록/상세만 남겨둡니다.
const PAGE_SIZE = 10

function BulletinTable({ rows, total, page, onRowClick, emptyMsg }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 100px 60px 40px', padding: '10px 20px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        {['번호', '제목', '작성자', '작성일', '조회', '파일'].map(h => (
          <div key={h} style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, textAlign: h === '제목' ? 'left' : 'center' }}>{h}</div>
        ))}
      </div>
      {rows.length === 0
        ? <EmptyState icon="health_and_safety" message={emptyMsg} />
        : rows.map((row, i) => (
          <div key={row.id} onClick={() => onRowClick(row)}
            style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 100px 60px 40px', padding: '13px 20px', cursor: 'pointer', borderBottom: `1px solid ${C.borderRow}`, transition: 'background 0.1s' }}
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
  // 읽기 전용 화면 — 관리자 여부와 무관하게 목록/상세만 제공한다.
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => { fetchItems() }, [page, search])

  async function fetchItems() {
    let q = supabase.from('notices').select('*, notice_files(*)', { count: 'exact' })
      .eq('type', 'safety').order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (search) q = q.ilike('title', `%${search}%`)
    const { data, count } = await q
    setItems(data || []); setTotal(count || 0)
  }

  return (
    <div>
      <PageBanner title="연구실 안전관리 (지난 게시글)" sub="Safety Notices — Archive" breadcrumb={['안전관리']} />
      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, padding: '12px 14px',
          background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 10, fontSize: 12.5, color: '#8A5A16', lineHeight: 1.6,
        }}>
          <Icon name="info" size={16} color="#B7791F" style={{ marginTop: 1, flexShrink: 0 }} />
          <div>
            안전관리 절차·공식자료·양식은 <b>[자료]</b> 탭으로 이관되었습니다. 이 화면은 지난 안전 공지 열람용(읽기 전용)이며,
            새 공지는 <b>[공지사항]</b>에서 작성합니다.
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button onClick={() => navigate('/resources')} style={{ ...btnPrimary, padding: '6px 14px' }}>자료 탭 열기</button>
              <button onClick={() => navigate('/notices')} style={{ ...btnGhost, padding: '6px 14px' }}>공지사항</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="제목으로 검색…" style={{ width: 300 }} />
          <button onClick={() => { setSearch(searchInput); setPage(1) }} style={{ ...btnPrimary, padding: '8px 18px' }}>검색</button>
          {search && <button onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} style={{ ...btnGhost, padding: '8px 14px' }}>초기화</button>}
        </div>

        <BulletinTable rows={items} total={total} page={page}
          onRowClick={item => navigate(`/safety/${item.id}`)}
          emptyMsg={search ? '검색 결과가 없습니다.' : '등록된 안전 공지가 없습니다.'} />
        <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} setPage={setPage} />
      </div>
    </div>
  )
}
