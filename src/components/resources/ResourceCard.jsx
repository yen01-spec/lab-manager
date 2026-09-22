import { useNavigate } from 'react-router-dom'
import { C } from '../../design'
import { safeUrl } from '../../lib/appSettings'
import { deriveResourceLinks } from '../../lib/resourceGuides'
import ResourceFiles from './ResourceFiles'

// 자료 카드 하나 — title / summary / 핵심 행동(steps) / 주의사항(notice) / 링크(최대 3개: 시약목록·다른 도구·공식 사이트) / 첨부파일.
// 예전 ResourceGuidePage(누가·언제 배지, 임베드, 여러 액션 버튼 목록)의 역할을 대신한다.
const OFFICIAL_LABEL = { school: '학교 시스템 열기 ↗', kosha: '공식 경고표지 작성 사이트 열기 ↗' }
const OFFICIAL_SETTING_KEY = { school: 'school_safety_system_url', kosha: 'kosha_label_url' }

const linkBtnBase = {
  padding: '9px 14px', minHeight: 44, borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
}

export default function ResourceCard({ section, categoryLabel, settings, isAdmin, filesRows }) {
  const navigate = useNavigate()
  const { reagentLink, officialLink, toolLink } = deriveResourceLinks(section)
  const headingId = `res-${section.categoryKey}-${section.key}`

  function openReagentList() {
    const qs = new URLSearchParams()
    if (reagentLink.q) qs.set('q', reagentLink.q)
    if (reagentLink.preset) qs.set('preset', reagentLink.preset)
    const query = qs.toString()
    navigate(query ? `/reagents/list?${query}` : '/reagents/list')
  }

  function openOfficial() {
    const url = safeUrl(settings[OFFICIAL_SETTING_KEY[officialLink.key]])
    if (!url) { alert('주소가 아직 설정되지 않았습니다. 관리자에게 문의해주세요.'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section aria-labelledby={headingId} style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '20px 22px', marginBottom: 16, boxShadow: '0 1px 3px rgba(16,24,40,.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id={headingId} style={{ margin: 0, fontSize: 16.5, color: C.navyDeep }}>{section.title}</h2>
        <span style={{ fontSize: 11, color: C.muted, background: C.bg, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{categoryLabel}</span>
      </div>

      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: C.text, lineHeight: 1.65 }}>{section.summary}</p>

      {section.steps?.length > 0 && (
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
          {section.steps.map((s, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{s}</li>)}
        </ul>
      )}

      {section.notice && (
        <div style={{ margin: '0 0 14px', padding: '9px 12px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 8, fontSize: 12.5, color: '#8A5A16', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          {section.notice}
        </div>
      )}

      {(reagentLink || toolLink || officialLink) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {reagentLink && (
            <button onClick={openReagentList} style={{ ...linkBtnBase, border: 'none', background: C.navy, color: '#fff' }}>시약 목록 열기 →</button>
          )}
          {toolLink && (
            <button onClick={() => navigate(toolLink.to)} style={{ ...linkBtnBase, border: `1px solid ${C.border}`, background: C.white, color: C.text }}>{toolLink.label} →</button>
          )}
          {officialLink && (
            <button onClick={openOfficial} style={{ ...linkBtnBase, border: `1px solid ${C.border}`, background: C.white, color: C.muted }}>
              {OFFICIAL_LABEL[officialLink.key] || '공식 사이트 열기 ↗'}
            </button>
          )}
        </div>
      )}

      <ResourceFiles categoryKey={section.categoryKey} sectionKey={section.key} isAdmin={isAdmin} initialRows={filesRows} />
    </section>
  )
}
