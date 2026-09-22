import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { C, PageBanner } from '../design'
import ResourceLibraryTabs from '../components/resources/ResourceLibraryTabs'
import ResourceArticleCard from '../components/resources/ResourceArticleCard'
import ResourceTabManager from '../components/resources/ResourceTabManager'
import ResourceArticleEditor from '../components/resources/ResourceArticleEditor'
import { getResourceTabs, getAllResourceArticles, getAllArticleFiles, deleteResourceArticle, reorderResourceArticles } from '../lib/resources'

// 자료실 — DB 기반 CMS. 관리자: 탭 생성 → 그 탭 안에 글 작성 → 글 밑에 파일 첨부.
// 일반 사용자: 탭 선택 → 글 읽기 → 필요한 첨부파일 열기. 공지사항 개념은 여기 없다(공지 기능
// 자체가 퇴역했다 — Home/Layout에서도 제거됨). resourceGuides.js 하드코딩은 더 이상 쓰지 않는다.
export default function Resources() {
  const { isAdmin } = useOutletContext?.() || {}
  const [params, setParams] = useSearchParams()
  const [tabs, setTabs] = useState([])
  const [articles, setArticles] = useState([])
  const [filesState, setFilesState] = useState({ status: 'loading', rows: [] })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showTabManager, setShowTabManager] = useState(false)
  const [editorState, setEditorState] = useState(null) // null | { article? }

  const selected = params.get('t') || 'all'

  const loadTabsAndArticles = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([getResourceTabs(), getAllResourceArticles()])
      setTabs(t); setArticles(a); setLoadError('')
    } catch (e) {
      setLoadError(e.message || '자료실을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTabsAndArticles() }, [loadTabsAndArticles])

  // 글마다 따로 조회하지 않고 한 번에 가져와서 카드별로 나눠 쓴다.
  useEffect(() => {
    let alive = true
    getAllArticleFiles()
      .then(rows => { if (alive) setFilesState({ status: 'ok', rows }) })
      .catch(() => { if (alive) setFilesState({ status: 'error', rows: [] }) })
    return () => { alive = false }
  }, [])

  const filesByArticle = useMemo(() => {
    const m = new Map()
    for (const r of filesState.rows) {
      if (!m.has(r.article_id)) m.set(r.article_id, [])
      m.get(r.article_id).push(r)
    }
    return m
  }, [filesState.rows])

  const articleCountByTab = useMemo(() => {
    const m = new Map()
    for (const a of articles) m.set(a.tab_id, (m.get(a.tab_id) || 0) + 1)
    return m
  }, [articles])

  const visibleArticles = useMemo(
    () => (selected === 'all' ? articles : articles.filter(a => a.tab_id === selected)),
    [articles, selected],
  )

  function selectTab(id) { setParams(id === 'all' ? {} : { t: id }) }

  async function handleDelete(article) {
    if (!window.confirm(`"${article.title}"을(를) 삭제할까요?`)) return
    try {
      await deleteResourceArticle(article.id)
      await loadTabsAndArticles()
    } catch (e) {
      alert(e.message || String(e))
    }
  }

  async function reorderWithin(article, dir) {
    const siblings = articles.filter(a => a.tab_id === article.tab_id)
    const idx = siblings.findIndex(a => a.id === article.id)
    const j = idx + dir
    if (j < 0 || j >= siblings.length) return
    const next = [...siblings]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    try {
      await reorderResourceArticles(next.map(a => a.id))
      await loadTabsAndArticles()
    } catch (e) {
      alert(e.message || String(e))
    }
  }

  const canManage = !!isAdmin
  const withinTab = selected !== 'all'

  return (
    <div>
      <PageBanner title="자료실" sub="Resources" breadcrumb={['자료실']} />
      <div style={{ padding: '20px 24px 48px', maxWidth: 760, margin: '0 auto' }}>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.muted }}>연구실 업무에 필요한 안내와 서식을 확인합니다.</p>

        <ResourceLibraryTabs tabs={tabs} selected={selected} onSelect={selectTab} isAdmin={canManage} onManageTabs={() => setShowTabManager(true)} />

        {canManage && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setEditorState({ defaultTabId: withinTab ? selected : (tabs[0]?.id || '') })} disabled={tabs.length === 0}
              style={{
                padding: '9px 16px', minHeight: 44, borderRadius: 8, cursor: tabs.length ? 'pointer' : 'default', fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', border: 'none', background: tabs.length ? C.navy : '#F0F0F0', color: tabs.length ? '#fff' : C.muted,
              }}>+ 글 작성</button>
            {tabs.length === 0 && <span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>먼저 "탭 관리"에서 탭을 만들어주세요.</span>}
          </div>
        )}

        <div role="tabpanel" id="restab-panel" aria-labelledby={`restab-${selected}`}>
          {loading || filesState.status === 'loading' ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: C.muted, fontSize: 13 }}>불러오는 중...</div>
          ) : loadError ? (
            <div role="alert" style={{ padding: '20px', textAlign: 'center', color: C.dangerDark }}>{loadError}</div>
          ) : visibleArticles.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.muted, fontSize: 13.5 }}>
              {tabs.length === 0 ? '아직 등록된 자료가 없습니다.' : '이 탭에는 아직 자료가 없습니다.'}
            </div>
          ) : (
            visibleArticles.map((article, i) => (
              <ResourceArticleCard
                key={article.id} article={article} isAdmin={canManage} canManage={canManage}
                filesRows={filesByArticle.get(article.id) || []}
                onEdit={a => setEditorState({ article: a })} onDelete={handleDelete}
                onMoveUp={withinTab ? (a => reorderWithin(a, -1)) : undefined}
                onMoveDown={withinTab ? (a => reorderWithin(a, 1)) : undefined}
                isFirst={i === 0} isLast={i === visibleArticles.length - 1}
              />
            ))
          )}
        </div>
      </div>

      {showTabManager && (
        <ResourceTabManager tabs={tabs} articleCountByTab={articleCountByTab}
          onClose={() => setShowTabManager(false)} onChanged={loadTabsAndArticles} />
      )}

      {editorState && (
        <ResourceArticleEditor
          tabs={tabs} defaultTabId={editorState.defaultTabId} article={editorState.article}
          onClose={() => setEditorState(null)}
          onSaved={async () => { await loadTabsAndArticles(); setEditorState(null) }}
        />
      )}
    </div>
  )
}
