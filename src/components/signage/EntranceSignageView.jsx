import { useEffect, useState } from 'react'
import { C } from '../../design'
import { supabase } from '../../supabase'
import { getSpecialManagementInfo } from '../../lib/specialManagementSubstances'

// GHS 그림문자별 안내 문구 — 별표6 대응 코드가 없는 것들(고압가스/수생환경유해성/일반경고)
const NO_SIGNAGE_CODES = {
  GHS04: '고압가스 — 안전보건표지 대응 코드 없음(고압가스안전관리법 별도 적용)',
  GHS09: '수생환경유해성 — 안전보건표지 대응 코드 없음',
  GHS07: '경고(자극성 등) — 안전보건표지 특정 코드 없음',
}

// 부착완료 체크는 아직 일상점검일지 테이블이 없어 로컬(브라우저)에만 기억해둔다 —
// 추후 점검일지 기능이 생기면 그쪽 데이터로 교체 예정.
function loadCheckedState() {
  try { return JSON.parse(localStorage.getItem('signage_checked') || '{}') } catch { return {} }
}
function saveCheckedState(state) {
  try { localStorage.setItem('signage_checked', JSON.stringify(state)) } catch { /* 저장 실패해도 화면 동작엔 지장 없음 */ }
}

export default function EntranceSignageView({ reagents }) {
  const [signageList, setSignageList] = useState([])
  const [expandedCodes, setExpandedCodes] = useState(new Set())
  const [checked, setChecked] = useState(loadCheckedState)

  useEffect(() => {
    supabase.from('signage_master').select('*').order('priority').then(({ data }) => setSignageList(data || []))
  }, [])

  function toggleExpand(code) {
    setExpandedCodes(prev => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }
  function toggleChecked(code) {
    setChecked(prev => {
      const next = { ...prev, [code]: !prev[code] }
      saveCheckedState(next)
      return next
    })
  }

  // 각 GHS 그림문자 코드가 실제로 등록된 시약 중 몇 건에 있는지 집계 — 시약 하나가 여러 그림문자를
  // 가지면(예: 벤젠 = 인화성+발암성) 해당하는 모든 표지 카드에 전부 포함시킨다. 한 시약을 하나의
  // 대표 성상으로만 분류하면(보관 시약장 배정 때처럼) 일부 위험성이 표지 목록에서 누락될 수 있어,
  // 출입구 표지는 "빠짐없이 안내"가 우선이라 다중 매칭으로 처리함.
  const reagentsByCode = new Map()
  reagents.forEach(r => {
    if (!r.ghs_pictograms) return
    r.ghs_pictograms.split('^').filter(Boolean).forEach(code => {
      if (!reagentsByCode.has(code)) reagentsByCode.set(code, [])
      reagentsByCode.get(code).push(r)
    })
  })

  const specialCount = reagents.filter(r => getSpecialManagementInfo(r.name, r.cas_no)?.status === 'confirmed').length

  const cards = signageList
    .filter(s => s.trigger_type !== 'special_management')
    .map(s => ({ ...s, matched: (s.ghs_pictogram_codes || []).flatMap(code => reagentsByCode.get(code) || []) }))
    .filter(s => s.matched.length > 0)
    .sort((a, b) => a.priority - b.priority)

  const pinnedSignage = signageList.find(s => s.trigger_type === 'special_management')
  const unmatchedNoticeCodes = Object.keys(NO_SIGNAGE_CODES).filter(code => reagentsByCode.has(code))

  return (
    <div>
      <div style={{
        display: 'flex', gap: '20px', alignItems: 'center', padding: '16px 20px',
        background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', marginBottom: '20px',
      }}>
        <div style={{ fontFamily: 'monospace', fontSize: '32px', fontWeight: '800', color: C.navy }}>{cards.length}</div>
        <div style={{ fontSize: '13px', color: C.muted, maxWidth: '560px' }}>
          현재 등록된 시약 {reagents.length.toLocaleString()}건의 GHS 유해정보를 기준으로 자동 집계한 결과입니다.
          아래 표지가 연구실 출입구 및 취급 장소에 부착되어 있는지 확인하세요.
        </div>
      </div>

      {pinnedSignage && specialCount > 0 && (
        <div style={{
          border: `2px solid ${C.danger}`, background: '#FDECEC', borderRadius: '10px',
          padding: '16px 18px', marginBottom: '20px', display: 'flex', gap: '16px', alignItems: 'flex-start',
        }}>
          <div style={{ fontSize: '32px', flexShrink: 0 }}>☠️</div>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: C.danger, letterSpacing: '.03em' }}>
              {pinnedSignage.code} · {pinnedSignage.name} ({pinnedSignage.legal_basis})
            </div>
            <h3 style={{ margin: '4px 0 6px', fontSize: '16px', color: C.text }}>관계자외 출입금지 — 발암물질 취급 중</h3>
            <p style={{ margin: '0 0 6px', fontSize: '13px', lineHeight: 1.6, color: C.text }}>
              등록된 시약 중 특별관리물질(발암성·생식세포변이원성·생식독성 등)이 <b>{specialCount}건</b> 확인되어 최우선으로 표시합니다.
              문구: "관계자외 출입금지 / 발암물질 취급 중 / 보호구·보호복 착용 / 흡연 및 음식물 섭취 금지"
            </p>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', background: C.danger, color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>
              특별관리물질 44종 매칭 연동
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {cards.map(s => (
          <div key={s.code} style={{
            border: `1px solid ${C.border}`, background: C.white, borderRadius: '10px',
            display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: '16px', padding: '16px 18px', alignItems: 'start',
          }}>
            {s.image_path
              ? <img src={s.image_path} alt={s.name} style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
              : <div style={{ width: '64px', height: '64px' }} />}
            <div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', color: C.muted, letterSpacing: '.03em' }}>{s.code} · {s.name}</div>
              <h4 style={{ margin: '2px 0 6px', fontSize: '16px', color: C.text }}>{s.name}</h4>
              <div style={{ fontSize: '13px', color: C.muted, margin: '3px 0' }}><b style={{ color: C.text }}>근거</b> {s.legal_basis}</div>
              <div style={{ fontSize: '13px', color: C.muted, margin: '3px 0' }}><b style={{ color: C.text }}>부착위치</b> {s.location}</div>
              <div style={{ fontSize: '13px', color: C.muted, margin: '3px 0' }}><b style={{ color: C.text }}>형태</b> {s.shape_desc}</div>
              <div style={{ marginTop: '8px', fontSize: '13px' }}>
                <span onClick={() => toggleExpand(s.code)} style={{ cursor: 'pointer', color: '#8A5A16', fontWeight: '600', fontSize: '12.5px' }}>
                  해당 시약 {s.matched.length}건 {expandedCodes.has(s.code) ? '숨기기 ▴' : '보기 ▾'}
                </span>
                {expandedCodes.has(s.code) && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: '18px', columns: 2, color: C.muted, fontSize: '12.5px' }}>
                    {s.matched.map(r => <li key={r.id}>{r.name}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
              <label style={{ fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!checked[s.code]} onChange={() => toggleChecked(s.code)} /> 부착완료
              </label>
              {checked[s.code]
                ? <span style={{ color: '#00875A', fontWeight: '700', fontSize: '12px' }}>✓ 확인됨</span>
                : <span style={{ color: C.danger, fontWeight: '700', fontSize: '12px' }}>✕ 미부착</span>}
            </div>
          </div>
        ))}
        {cards.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
            현재 등록된 시약 기준으로 필요한 출입구 표지가 없습니다.
          </div>
        )}
      </div>

      {unmatchedNoticeCodes.length > 0 && (
        <div style={{ marginTop: '18px', padding: '14px 18px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', fontSize: '12.5px', color: C.muted }}>
          {unmatchedNoticeCodes.map(code => <div key={code}>ℹ️ {NO_SIGNAGE_CODES[code]}</div>)}
        </div>
      )}

      <div style={{ marginTop: '30px', fontSize: '12px', color: C.muted, borderTop: `1px dashed ${C.border}`, paddingTop: '14px' }}>
        ※ 부착상태 체크값은 현재 이 브라우저에만 저장됩니다(추후 일상점검일지 데이터와 연동 예정) · 근거: 산업안전보건법 시행규칙 별표6 / 제38~40조
      </div>
    </div>
  )
}
