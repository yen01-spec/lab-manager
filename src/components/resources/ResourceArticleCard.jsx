import { useNavigate } from 'react-router-dom'
import { C } from '../../design'
import ResourceArticleFiles from './ResourceArticleFiles'

// 자료실 글 카드 — 제목 / [누가·언제](있을 때만) / 안내 / 해야 할 일 / 참고·주의사항(있을 때만) /
// 관련 링크(있으면 1개) / 첨부파일. "앱에서 준비하기" 같은 기능 설명 섹션은 없다 — 자료실은
// 자료를 읽고 파일을 여는 곳이지 업무 도구 launcher가 아니다.
const linkBtnBase = {
  padding: '9px 14px', minHeight: 44, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
  border: `1px solid ${C.border}`, background: C.white, color: C.text,
}

export default function ResourceArticleCard({ article, isAdmin, filesRows, canManage, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const navigate = useNavigate()
  const headingId = `article-${article.id}`
  const isExternal = /^https?:\/\//i.test(article.link_url || '')

  function openLink() {
    if (!article.link_url) return
    if (isExternal) window.open(article.link_url, '_blank', 'noopener,noreferrer')
    else navigate(article.link_url)
  }

  return (
    <section aria-labelledby={headingId} style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '20px 22px', marginBottom: 16, boxShadow: '0 1px 3px rgba(16,24,40,.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <h2 id={headingId} style={{ margin: 0, fontSize: 16.5, color: C.navyDeep }}>{article.title}</h2>
        {canManage && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {(onMoveUp || onMoveDown) && (
              <>
                <button onClick={() => onMoveUp?.(article)} disabled={isFirst} aria-label="위로 이동" title="위로 이동"
                  style={{ ...cardAdminBtn, opacity: isFirst ? 0.35 : 1, cursor: isFirst ? 'default' : 'pointer' }}>↑</button>
                <button onClick={() => onMoveDown?.(article)} disabled={isLast} aria-label="아래로 이동" title="아래로 이동"
                  style={{ ...cardAdminBtn, opacity: isLast ? 0.35 : 1, cursor: isLast ? 'default' : 'pointer' }}>↓</button>
              </>
            )}
            <button onClick={() => onEdit(article)} style={cardAdminBtn}>수정</button>
            <button onClick={() => onDelete(article)} style={{ ...cardAdminBtn, color: C.dangerDark, borderColor: '#F3D6D6' }}>삭제</button>
          </div>
        )}
      </div>

      {(article.audience || article.timing) && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 12, fontSize: 12.5 }}>
          {article.audience && (
            <div style={{ minWidth: 0 }}>
              <span style={{ color: C.muted, fontWeight: 700, marginRight: 6 }}>누가</span>
              <span style={{ color: C.text, overflowWrap: 'anywhere' }}>{article.audience}</span>
            </div>
          )}
          {article.timing && (
            <div style={{ minWidth: 0 }}>
              <span style={{ color: C.muted, fontWeight: 700, marginRight: 6 }}>언제</span>
              <span style={{ color: C.text, overflowWrap: 'anywhere' }}>{article.timing}</span>
            </div>
          )}
        </div>
      )}

      {article.summary && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: C.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{article.summary}</p>
      )}

      {article.steps?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>해야 할 일</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
            {article.steps.map((s, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{s}</li>)}
          </ul>
        </div>
      )}

      {article.notice && (
        <div style={{ margin: '0 0 14px', padding: '9px 12px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 8, fontSize: 12.5, color: '#8A5A16', lineHeight: 1.6, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
          {article.notice}
        </div>
      )}

      {article.link_url && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={openLink} style={linkBtnBase}>{article.link_label || (isExternal ? '관련 링크 열기 ↗' : '이동 →')}</button>
        </div>
      )}

      <ResourceArticleFiles articleId={article.id} isAdmin={isAdmin} initialRows={filesRows} />
    </section>
  )
}

const cardAdminBtn = {
  fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  background: C.white, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px', minHeight: 30,
}
