import { C } from '../../design'

// 자료 세부 페이지 공통 템플릿 (수정방안 §8, §9, §13).
// section: resourceGuides.js의 한 섹션 객체. schoolUrl: 학교 시스템 URL. onAction(key): 앱 지원 버튼.
const SYS = '강원대학교 연구실안전관리시스템'
const FILE_GROUPS = [
  { key: 'form', label: '필수 양식' },
  { key: 'official', label: '공식 지침·매뉴얼' },
  { key: 'reference', label: '참고자료' },
]
// 학교 연구실안전관리 업무상의 역할 — 앱 로그인 권한(일반/관리자)과는 별개.
const ROLE_LABELS = {
  worker: '연구활동종사자',
  manager: '연구실안전관리담당자',
  director: '연구실책임자',
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

export default function ResourceGuidePage({ section, schoolUrl, isAdmin, onAction, embedNode }) {
  if (!section) return null
  const openSchool = () => { if (schoolUrl) window.open(schoolUrl, '_blank', 'noopener') }
  const runAction = (a) => {
    if (a.key === 'school') return openSchool()
    onAction ? onAction(a) : alert('이 기능은 다음 단계에서 연결됩니다.')
  }

  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '22px 24px', boxShadow: '0 1px 3px rgba(16,24,40,.06)' }}>

      {/* ① 제목 및 핵심 설명 */}
      <h2 style={{ margin: '0 0 6px', fontSize: 18, color: C.navyDeep }}>{section.title}</h2>
      <p style={{ margin: '0 0 18px', fontSize: 13.5, color: C.text, lineHeight: 1.65 }}>{section.summary}</p>

      {/* 이 섹션에 붙는 실제 업무지원 도구(예: 학교 화학물질 등록 Excel) */}
      {embedNode && (
        <div style={{ margin: '0 0 22px', padding: '16px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg }}>
          {embedNode}
        </div>
      )}

      {/* ② 누가 / 언제 (+ 학교 안전관리 역할 배지) */}
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

      {/* ③ 어디에서 수행하는가 */}
      <Section title="이 업무는 어디에서 하나요?">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.navy }}>{section.officialLocation || SYS}</span>
          {schoolUrl && (
            <button onClick={openSchool} style={{
              padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.navy}`, background: C.white,
              color: C.navy, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
            }}>학교 시스템 열기 ↗</button>
          )}
        </div>
      </Section>

      {/* ④ 실제 수행 절차 */}
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

      {/* ⑤ 시약관리 앱에서 준비할 수 있는 정보 */}
      {section.actions?.length > 0 && (
        <Section title="시약관리 앱에서 준비하기">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {section.actions.map(a => (
              <button key={a.key} onClick={() => runAction(a)} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', background: C.navy, color: '#fff',
                cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
              }}>{a.label}</button>
            ))}
          </div>
        </Section>
      )}

      {/* ⑦ 공식 자료 및 양식 */}
      <Section title="공식 자료 및 양식">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FILE_GROUPS.map(g => (
            <div key={g.key}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 4 }}>{g.label}</div>
              <div style={{ fontSize: 12, color: C.muted, padding: '8px 12px', background: C.bg, borderRadius: 8 }}>
                현재 등록된 자료가 없습니다. {isAdmin && '· 자료 추가는 다음 단계에서 지원됩니다.'}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
