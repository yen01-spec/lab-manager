import { useRef } from 'react'
import { C } from '../../design'
import { safeUrl } from '../../lib/appSettings'
import ResourceFiles from './ResourceFiles'

// 자료 세부 페이지 공통 템플릿 (수정방안 §8, §9, §13).
// section: resourceGuides.js의 한 섹션 객체.
// settings: { school_safety_system_url, kosha_label_url } — 외부 링크는 여기서만 읽음(hard-code 금지).
// onAction(a): 외부 링크가 아닌 앱 내부 액션(goto/reagent-search/contact 등) 처리 → 상위(Resources)에서.
const SYS = '강원대학교 연구실안전관리시스템'
const ROLE_LABELS = {
  worker: '연구활동종사자',
  manager: '연구실안전관리담당자',
  director: '연구실책임자',
}
const EXT_KEY = { school: 'school_safety_system_url', kosha: 'kosha_label_url' }
const EXT_NAME = { school_safety_system_url: '학교 연구실안전관리시스템', kosha_label_url: '공식 경고표지 작성 사이트' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

export default function ResourceGuidePage({ section, categoryKey, sectionKey, settings = {}, isAdmin, onAction, embedNode }) {
  const filesRef = useRef(null)
  if (!section) return null

  function openExternal(settingKey) {
    const url = safeUrl(settings[settingKey])
    if (!url) {
      alert(`${EXT_NAME[settingKey] || '해당 사이트'} 주소가 설정되지 않았습니다.` +
        (isAdmin ? '\n관리자 메뉴 > 설정 > 외부 링크 URL 에서 등록해주세요.' : ' 관리자에게 문의해주세요.'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const runAction = (a) => {
    if (a.type === 'external' || a.key === 'school' || a.key === 'kosha') {
      return openExternal(a.settingKey || EXT_KEY[a.key] || 'school_safety_system_url')
    }
    if (a.type === 'files') {
      filesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    onAction ? onAction(a) : alert('관련 자료 영역에서 확인해주세요.')
  }

  const schoolReady = !!safeUrl(settings.school_safety_system_url)

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 24px', boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>

      <h2 style={{ margin: '0 0 6px', fontSize: 18, color: C.navyDeep }}>{section.title}</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.text, lineHeight: 1.65 }}>{section.summary}</p>

      {embedNode && (
        <div style={{ margin: '0 0 22px', padding: '16px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg }}>
          {embedNode}
        </div>
      )}

      {(section.audience || section.timing || section.roles?.length) && (
        <Section title="누가 / 언제">
          {section.roles?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {section.roles.map(role => (
                <span key={role} style={{ fontSize: 11, fontWeight: 700, background: '#EEF2FB', color: C.navy, padding: '3px 10px', borderRadius: 999 }}>
                  {ROLE_LABELS[role] || role}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: 13, color: C.text }}>
            {section.audience && <div><b>누가</b> · {section.audience}</div>}
            {section.timing && <div style={{ marginTop: 2 }}><b>언제</b> · {section.timing}</div>}
          </div>
        </Section>
      )}

      <Section title="이 업무는 어디에서 하나요?">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{section.officialLocation || SYS}</span>
          <button onClick={() => openExternal('school_safety_system_url')} style={{
            padding: '6px 14px', borderRadius: 8, border: `1px solid ${schoolReady ? C.navy : C.border}`, background: C.white,
            color: schoolReady ? C.navy : C.muted, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
          }}>학교 시스템 열기 ↗</button>
          {!schoolReady && <span style={{ fontSize: 11, color: C.muted }}>· 주소 미설정</span>}
        </div>
      </Section>

      {section.steps?.length > 0 && (
        <Section title="해야 할 일">
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
            {section.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </Section>
      )}

      {section.notice && (
        <div style={{ margin: '0 0 22px', padding: '10px 14px', background: '#FFF8E7', border: '1px solid #F6C343', borderRadius: 8, fontSize: 12.5, color: '#8A5A16', lineHeight: 1.6 }}>
          {section.notice}
        </div>
      )}

      {section.actions?.length > 0 && (
        <Section title="시약관리 앱에서 준비하기">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {section.actions.map(a => (
              <button key={a.key || a.label} onClick={() => runAction(a)} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', background: C.navy, color: '#fff',
                cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              }}>{a.label}</button>
            ))}
          </div>
        </Section>
      )}

      <div ref={filesRef} style={{ marginBottom: 22 }}>
        <ResourceFiles categoryKey={categoryKey} sectionKey={sectionKey} />
      </div>
    </div>
  )
}
