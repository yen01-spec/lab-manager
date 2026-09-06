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

// 5ℓ 미만은 "용기 표면적의 5%"라는 비율 기준이라 용기 실측 없이는 고정 ㎠로 환산할 수 없다 —
// 이 구간과 소량용기는 최소면적 검증(4-2) 대상에서 제외하고, 나머지 4구간만 고정 ㎠ 기준 적용.
const NUMERIC_AREA_BY_VOLUME = { '5to50': 90, '50to200': 180, '200to500': 300, gte500: 450 }
// 기본 가로×세로 제안값(cm) — 실측 검증이 안 되는 구간은 참고용 기본 사이즈만 채워줌.
const DEFAULT_SIZE_FALLBACK = { lt5: { w: 9, h: 6 }, small: { w: 5, h: 3 } }

function specFor(sizeRules, volumeKey) {
  if (volumeKey === 'small') return '제품명·그림문자·신호어·공급자정보만 기재(그 외는 "MSDS 참조"로 대체)'
  const map = { lt5: 2, '5to50': 25, '50to200': 100, '200to500': 300, gte500: 600 }
  const probe = map[volumeKey]
  const rule = sizeRules.find(r => (r.min_volume_l == null || probe >= r.min_volume_l) && (r.max_volume_l == null || probe < r.max_volume_l))
  return rule?.spec_text || '-'
}

// 면적(㎠)으로부터 3:2 비율의 권장 가로×세로(cm)를 역산 — 원본 14종 스티커 이미지의 가로형
// 비율을 참고한 값. w*h = area, w/h = 1.5 → h = sqrt(area/1.5), w = h*1.5.
// 소수점을 절상(ceil)해야 한다 — 그냥 반올림하면(예: 90㎠ → 11.6×7.7=89.3㎠) 계산기 자체가
// 만든 "권장값"이 스스로 기준 미달 경고를 띄우는 모순이 생김.
function defaultSizeForArea(areaCm2) {
  const h = Math.ceil(Math.sqrt(areaCm2 / 1.5) * 10) / 10
  const w = Math.ceil(h * 1.5 * 10) / 10
  return { w, h }
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
  const [widthCm, setWidthCm] = useState('9')
  const [heightCm, setHeightCm] = useState('6')
  const [outputMode, setOutputMode] = useState('single') // single | grid
  const previewRef = useRef(null)

  useEffect(() => {
    supabase.from('label_size_rule').select('*').order('sort_order').then(({ data }) => setSizeRules(data || []))
  }, [])

  // 용량 선택 시 규격표 기준 권장 크기를 기본값으로 채움(4-2) — 이후 사용자가 직접 덮어쓸 수 있음.
  function handleVolumeChange(key) {
    setVolumeKey(key)
    const minArea = NUMERIC_AREA_BY_VOLUME[key]
    const size = minArea ? defaultSizeForArea(minArea) : DEFAULT_SIZE_FALLBACK[key]
    if (size) { setWidthCm(String(size.w)); setHeightCm(String(size.h)) }
  }

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
    const canvas = await html2canvas(previewRef.current, { scale: 3, backgroundColor: '#ffffff' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210, pageH = 297, margin = 5
    const wMm = (parseFloat(widthCm) || 9) * 10
    const hMm = (parseFloat(heightCm) || 6) * 10
    pdf.setLineDashPattern([1.5, 1], 0)

    if (outputMode === 'single') {
      const x = (pageW - wMm) / 2
      const y = (pageH - hMm) / 2
      pdf.addImage(imgData, 'PNG', x, y, wMm, hMm)
      pdf.rect(x, y, wMm, hMm)
    } else {
      const cols = Math.max(1, Math.floor((pageW - margin) / (wMm + margin)))
      const rows = Math.max(1, Math.floor((pageH - margin) / (hMm + margin)))
      const totalW = cols * wMm + (cols - 1) * margin
      const totalH = rows * hMm + (rows - 1) * margin
      const startX = (pageW - totalW) / 2
      const startY = (pageH - totalH) / 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = startX + c * (wMm + margin)
          const y = startY + r * (hMm + margin)
          pdf.addImage(imgData, 'PNG', x, y, wMm, hMm)
          pdf.rect(x, y, wMm, hMm)
        }
      }
    }
    pdf.setLineDashPattern([], 0)
    pdf.setFontSize(8)
    pdf.setTextColor(140)
    pdf.text('※ 전면 접착 A4 시트에 100% 배율(실제 크기)로 인쇄하세요 · 점선을 따라 가위로 오려 부착', pageW / 2, pageH - 6, { align: 'center' })

    setExporting(false)
    pdf.save(`경고표지_${reagent?.name || '라벨'}.pdf`)
  }

  const isSmall = volumeKey === 'small'
  const pictograms = (reagent?.ghs_pictograms || '').split('^').filter(Boolean)
  const nameKo = template?.name_ko || reagent?.name || ''
  const nameEn = template?.name_en || ''
  const signalWord = template?.signal_word_ko || '위험'

  const minArea = NUMERIC_AREA_BY_VOLUME[volumeKey]
  const areaCm2 = Math.round((parseFloat(widthCm) || 0) * (parseFloat(heightCm) || 0) * 10) / 10
  const meetsMin = minArea == null || areaCm2 >= minArea
  const recommended = minArea ? defaultSizeForArea(minArea) : null
  const previewScale = Math.max(0.6, Math.min(1.4, (parseFloat(widthCm) || 9) / 9))

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
          <select value={volumeKey} onChange={e => handleVolumeChange(e.target.value)} style={inputStyle}>
            {VOLUME_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>공급자정보 (연구실/연락처)</label>
          <input value={supplierInfo} onChange={e => setSupplierInfo(e.target.value)} placeholder="예: 화학교육전공 303-1 / 033-xxx-xxxx" style={inputStyle} />
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: '12.5px', background: '#F3E4C2', border: '1px solid #C8860A', padding: '10px 12px', borderRadius: '6px', lineHeight: 1.7 }}>
          법적 최소 규격 → {specFor(sizeRules, volumeKey)}
          {recommended && <><br />권장 크기(자동 계산) → <b>{recommended.w} cm × {recommended.h} cm</b> (≈ {minArea}㎠)</>}
        </div>
        <div style={{ marginTop: '14px' }}>
          <label style={labelStyle}>직접 입력 (가로 × 세로, cm)</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input value={widthCm} onChange={e => setWidthCm(e.target.value)} style={{ ...inputStyle, width: '70px' }} />
            <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>×</span>
            <input value={heightCm} onChange={e => setHeightCm(e.target.value)} style={{ ...inputStyle, width: '70px' }} />
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: C.muted }}>= {areaCm2}㎠</span>
          </div>
        </div>
        {minArea != null && (
          meetsMin ? (
            <div style={{ fontSize: '11.5px', color: '#1F6F5C', marginTop: '8px' }}>✓ 법적 최소 기준({minArea}㎠) 충족</div>
          ) : (
            <div style={{ fontFamily: 'monospace', fontSize: '12px', background: '#FDECEC', border: `1px solid ${C.danger}`, color: C.danger, padding: '8px 10px', borderRadius: '6px', marginTop: '8px', lineHeight: 1.6 }}>
              ⚠ 최소 {minArea}㎠ 필요, 현재 {areaCm2}㎠로 기준 미달. 크기를 키우거나 용기 규격을 다시 확인하세요.
              (출력은 가능하지만 경고가 계속 표시됩니다)
            </div>
          )
        )}
        {minArea == null && (
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '8px' }}>
            {isSmall ? '소량용기는 면적 기준이 별도로 없습니다.' : '이 구간은 "용기 표면적의 5%"가 기준이라 자동 검증이 어려워요 — 실제 용기 크기를 보고 직접 확인해주세요.'}
          </div>
        )}
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
          미리보기 — {isSmall ? '소량용기' : '일반용기'} ({VOLUME_OPTIONS.find(o => o.key === volumeKey)?.label}) · {widthCm}×{heightCm}cm
        </div>
        {!reagent ? (
          <div style={{ color: C.muted, fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>왼쪽에서 시약을 검색해 선택하세요.</div>
        ) : (
          <>
            <div ref={previewRef} style={{
              border: `2px dashed ${C.text}`, padding: '18px', width: `${440 * previewScale}px`, maxWidth: '100%', background: '#fff',
            }}>
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
                공급자정보: {supplierInfo || '(미입력)'} · {widthCm}×{heightCm}cm
              </div>
            </div>

            <div style={{ marginTop: '18px' }}>
              <label style={labelStyle}>출력 방식 (전면 접착 A4 시트 기준)</label>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginTop: '4px' }}>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={outputMode === 'single'} onChange={() => setOutputMode('single')} /> 1장씩 (중앙 배치)
                </label>
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="radio" checked={outputMode === 'grid'} onChange={() => setOutputMode('grid')} /> 모아찍기 (그리드)
                </label>
              </div>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
              <button onClick={exportPdf} disabled={exporting} style={{
                fontSize: '13px', fontWeight: '600', padding: '10px 18px', border: `1px solid ${C.text}`,
                background: C.text, color: '#fff', cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1,
              }}>{exporting ? '내보내는 중...' : '📥 라벨 출력 (PDF · 100% 배율 안내 포함)'}</button>
              {!isSmall && (
                <button onClick={() => handleVolumeChange('small')} style={{
                  fontSize: '13px', fontWeight: '600', padding: '10px 18px', border: `1px solid ${C.border}`,
                  background: C.white, color: C.text, cursor: 'pointer',
                }}>소량용기 서식으로 전환</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
