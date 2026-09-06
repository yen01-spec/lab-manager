import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { C, inputStyle, labelStyle } from '../../design'
import { supabase } from '../../supabase'
import ReagentAutocomplete from '../ReagentAutocomplete'

const VOLUME_OPTIONS = [
  { key: 'lt5', label: '< 5 ℓ' },
  { key: '5to50', label: '5 ℓ ~ 50 ℓ' },
  { key: '50to200', label: '50 ℓ ~ 200 ℓ' },
  { key: '200to500', label: '200 ℓ ~ 500 ℓ' },
  { key: 'gte500', label: '≥ 500 ℓ' },
  { key: 'small', label: '소량용기 (100 g / 100 mL 이하)' },
]

function specFor(sizeRules, volumeKey) {
  if (volumeKey === 'small') return '제품명·그림문자·신호어·공급자정보만 기재(그 외는 "MSDS 참조"로 대체)'
  const map = { lt5: 2, '5to50': 25, '50to200': 100, '200to500': 300, gte500: 600 }
  const probe = map[volumeKey]
  const rule = sizeRules.find(r => (r.min_volume_l == null || probe >= r.min_volume_l) && (r.max_volume_l == null || probe < r.max_volume_l))
  return rule?.spec_text || '-'
}

const GHS_PICTOGRAM_LABEL = {
  GHS01: '폭발성', GHS02: '인화성', GHS03: '산화성', GHS04: '고압가스', GHS05: '부식성',
  GHS06: '급성독성', GHS07: '유해성·자극성', GHS08: '건강유해성', GHS09: '환경유해성',
}

export default function LabelBuilderView() {
  const [search, setSearch] = useState('')
  const [reagent, setReagent] = useState(null)
  const [template, setTemplate] = useState(null)
  const [templateStatus, setTemplateStatus] = useState('idle') // idle | loading | found | missing
  const [volumeKey, setVolumeKey] = useState('lt5')
  const [supplierInfo, setSupplierInfo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [sizeRules, setSizeRules] = useState([])
  const previewRef = useRef(null)

  useEffect(() => {
    supabase.from('label_size_rule').select('*').order('sort_order').then(({ data }) => setSizeRules(data || []))
  }, [])

  async function handleSelectReagent(r) {
    setReagent(r)
    setSearch(r.name)
    setTemplateStatus('loading')
    const { data } = await supabase.from('label_phrase_template').select('*').eq('cas_no', r.cas_no).maybeSingle()
    if (data) { setTemplate(data); setTemplateStatus('found') }
    else { setTemplate(null); setTemplateStatus('missing') }
  }

  async function exportPdf() {
    if (!previewRef.current) return
    setExporting(true)
    const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#ffffff' })
    setExporting(false)
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] })
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
    pdf.save(`경고표지_${reagent?.name || '라벨'}.pdf`)
  }

  const isSmall = volumeKey === 'small'
  const pictograms = (reagent?.ghs_pictograms || '').split('^').filter(Boolean)
  const nameKo = template?.name_ko || reagent?.name || ''
  const nameEn = template?.name_en || ''
  const signalWord = template?.signal_word_ko || '위험'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '28px' }}>
      <div style={{ border: `1px solid ${C.border}`, background: C.bg, padding: '20px', borderRadius: '10px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '15px', borderBottom: `1px solid ${C.border}`, paddingBottom: '10px' }}>라벨 정보 입력</h3>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>시약 검색 (물질명 / CAS No.)</label>
          <ReagentAutocomplete value={search} onChange={setSearch} onSelect={handleSelectReagent}
            inputStyle={inputStyle} placeholder="시약명 또는 CAS No." />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>CAS No.</label>
          <input value={reagent?.cas_no || ''} disabled style={{ ...inputStyle, background: '#F3F4F6' }} />
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>용기 용량</label>
          <select value={volumeKey} onChange={e => setVolumeKey(e.target.value)} style={inputStyle}>
            {VOLUME_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>공급자정보 (연구실/연락처)</label>
          <input value={supplierInfo} onChange={e => setSupplierInfo(e.target.value)} placeholder="예: 화학교육전공 303-1 / 033-xxx-xxxx" style={inputStyle} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '12.5px', background: '#F3E4C2', border: '1px solid #C8860A', padding: '10px 12px', borderRadius: '6px', lineHeight: 1.7 }}>
          규격 → {specFor(sizeRules, volumeKey)}
        </div>
        <div style={{ fontSize: '12px', color: C.muted, marginTop: '14px', lineHeight: 1.6 }}>
          문구 출처: 사전 확보한 14종 템플릿 DB 우선 매칭 → 없으면 수동 입력<br />
          (KOSHA MSDS 실시간 조회 연동은 추후 지원 예정)
        </div>
        {reagent && (
          templateStatus === 'found'
            ? <div style={{ fontFamily: 'monospace', fontSize: '10.5px', padding: '2px 6px', border: '1px solid #1F6F5C', color: '#1F6F5C', display: 'inline-block', marginTop: '10px', borderRadius: '4px' }}>✓ 템플릿 DB 매칭 ({reagent.name} {reagent.cas_no})</div>
            : templateStatus === 'missing'
              ? <div style={{ fontFamily: 'monospace', fontSize: '10.5px', padding: '2px 6px', border: `1px solid ${C.danger}`, color: C.danger, display: 'inline-block', marginTop: '10px', borderRadius: '4px' }}>템플릿 없음 — MSDS 참조 문구로 대체됨</div>
              : null
        )}
      </div>

      <div style={{ border: `1px solid ${C.border}`, background: C.white, padding: '24px', borderRadius: '10px' }}>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: C.muted, marginBottom: '14px' }}>
          미리보기 — {isSmall ? '소량용기' : '일반용기'} ({VOLUME_OPTIONS.find(o => o.key === volumeKey)?.label})
        </div>
        {!reagent ? (
          <div style={{ color: C.muted, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>왼쪽에서 시약을 검색해 선택하세요.</div>
        ) : (
          <>
            <div ref={previewRef} style={{ border: `2px solid ${C.text}`, padding: '18px', maxWidth: '440px', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '19px', fontWeight: '700' }}>{nameKo}{nameEn && ` (${nameEn})`}</div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: C.danger }}>{signalWord}</div>
              </div>
              {reagent.cas_no && <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>CAS No. {reagent.cas_no}</div>}
              {pictograms.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', margin: '12px 0' }}>
                  {pictograms.map(code => (
                    <div key={code} title={GHS_PICTOGRAM_LABEL[code] || code} style={{
                      width: '46px', height: '46px', border: `3px solid ${C.danger}`, transform: 'rotate(45deg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ transform: 'rotate(-45deg)', fontSize: '10px', fontWeight: '700', color: C.danger, textAlign: 'center' }}>{code.replace('GHS', '')}</span>
                    </div>
                  ))}
                </div>
              )}
              {!isSmall && template && (
                <>
                  {template.hazard_statements_ko.map((h, i) => (
                    <div key={i} style={{ fontSize: '12.5px', margin: '3px 0', paddingLeft: '14px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0 }}>—</span>{h}
                    </div>
                  ))}
                  {template.precautionary_statements_ko.map((p, i) => (
                    <div key={i} style={{ fontSize: '12px', color: C.muted, margin: '3px 0', paddingLeft: '14px', position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0 }}>—</span>{p}
                    </div>
                  ))}
                </>
              )}
              {!isSmall && !template && (
                <div style={{ fontSize: '12px', color: C.muted, margin: '10px 0' }}>
                  ※ 사전 확보된 문구가 없습니다. 기타 자세한 사항은 물질안전보건자료(MSDS)를 참조하시오.
                </div>
              )}
              <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: `1px solid ${C.border}`, fontSize: '11px', fontFamily: 'monospace', color: C.muted }}>
                공급자정보: {supplierInfo || '(미입력)'}
              </div>
            </div>
            <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
              <button onClick={exportPdf} disabled={exporting} style={{
                fontSize: '13px', fontWeight: '600', padding: '10px 18px', border: `1px solid ${C.text}`,
                background: C.text, color: '#fff', cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1,
              }}>{exporting ? '내보내는 중...' : '📥 라벨 출력 (PDF)'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
