import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabase'
import { C, Card, btnPrimary, btnExcel, thStyle, tdStyle } from '../../design'
import { computeSortLetter } from '../../lib/sortLetter'
import { generateInternalLotNos } from '../../lib/lotNo'

// ══════════════════════════════════════════════
//  Excel 시약 일괄 추가 (수정방안 §16~20)
//  파일 선택 → 분석/검증 → 기존 시약 대조 → 미리보기 → 관리자 확인 → 일괄 등록
//  ※ 전체 목록 "교체"가 아니라 "추가"만. 기존 데이터는 건드리지 않음.
// ══════════════════════════════════════════════

// 헤더 이름 → 내부 필드. 여러 표기를 허용(엑셀마다 조금씩 다름).
const HEADER_MAP = {
  nameEn: ['영문명', '영문 시약명', 'name', 'english name', '시약명(영문)'],
  nameKo: ['국문명', '국문 시약명', '한글명', '시약명(국문)', '시약명'],
  casNo: ['cas no.', 'cas no', 'cas', 'cas번호', 'cas 번호'],
  company: ['제조사', '회사', '회사명', 'company', 'brand'],
  catNo: ['cat.no.', 'cat no.', 'cat no', 'cat.no', '카탈로그번호', 'catalog'],
  purity: ['순도/등급', '순도', '등급', 'purity', 'grade'],
  volume: ['규격', '용량', 'volume', 'size'],
  unit: ['단위', 'unit'],
  locationText: ['보관 위치', '보관위치', '위치', 'location'],
  lotNo: ['제조사 lot no.', '제조사 lot no', 'lot no.', 'lot no', 'lot', '로트번호', '제조번호'],
  sealedCount: ['미개봉 수량', '미개봉수량', '미개봉', '미개봉 병수', 'sealed'],
  remainPct: ['잔량(%)', '잔량', '잔량%', 'remain', 'stock'],
  bottleCount: ['시약병 수', '병수', '병 수', 'bottles'],
  receivedDate: ['입고일', '입고 날짜', 'received', '입고날짜'],
  expiryDate: ['유통기한', '유효기간', 'expiry', 'expiration'],
  note: ['비고', '메모', 'note', 'remark'],
}

const norm = s => (s ?? '').toString().normalize('NFKC').trim().toLowerCase()
const normKey = s => norm(s).replace(/[^a-z0-9가-힣]/g, '')
const blankDash = v => { const s = (v ?? '').toString().trim(); return (s === '' || s === '-') ? '' : s }

// (정규화 영문명, 순도, 제조사, 규격+단위) 4개가 모두 같아야 한 시약으로 묶음 — 기존 규칙과 동일
function groupKey(r) {
  return [normKey(r.nameEn || r.nameKo), norm(r.purity), norm(r.company), norm(r.volume), norm(r.unit)].join('|')
}

function excelDate(v) {
  if (v == null || v === '') return ''
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = v.toString().trim()
  const m = s.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return ''
}

export default function BulkAddTab({ locations = [], student }) {
  const [rows, setRows] = useState(null)      // 분석된 행들 (검증 결과 포함)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [progress, setProgress] = useState('')
  const [doneMsg, setDoneMsg] = useState('')

  function locMatch(text) {
    const t = normKey(text)
    if (!t) return null
    // "room - detail" / "room detail" / "room" 순으로 느슨하게
    let hit = locations.find(l => normKey(`${l.room}${l.detail || ''}`) === t)
    if (!hit) hit = locations.find(l => normKey(l.room) === t && !l.detail)
    if (!hit) hit = locations.find(l => t.startsWith(normKey(l.room)) && l.detail && t.includes(normKey(l.detail)))
    if (!hit) hit = locations.find(l => normKey(l.room) && t.startsWith(normKey(l.room)))
    return hit || null
  }

  function downloadTemplate() {
    const headers = ['영문명', '국문명', 'CAS No.', '제조사', 'Cat.No.', '순도/등급', '규격', '단위', '보관 위치', '제조사 Lot No.', '미개봉 수량', '잔량(%)', '입고일', '유통기한', '비고']
    const example = ['Acetone', '아세톤', '67-64-1', 'Sigma-Aldrich', '179124', '99.9%', '500', 'mL', locations[0] ? `${locations[0].room}${locations[0].detail ? ' - ' + locations[0].detail : ''}` : '303-1 - 냉장 시약장', 'STBJ1234', '1', '100', '2026-09-11', '', '']
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '시약목록')
    XLSX.writeFile(wb, '시약_일괄추가_양식.xlsx')
  }

  async function handleFile(file) {
    if (!file) return
    setParsing(true); setRows(null); setDoneMsg(''); setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      // 헤더 행 찾기 (필드 별칭이 2개 이상 매칭되는 첫 행)
      const allAliases = Object.values(HEADER_MAP).flat()
      const headerIdx = aoa.findIndex(r => r.filter(c => allAliases.includes(norm(c))).length >= 2)
      if (headerIdx < 0) { alert('헤더 행을 찾지 못했어요. 양식(영문명·국문명·보관 위치 등)을 확인해주세요.'); setParsing(false); return }
      const headerRow = aoa[headerIdx].map(norm)
      const colOf = {}
      for (const [field, aliases] of Object.entries(HEADER_MAP)) {
        colOf[field] = headerRow.findIndex(h => aliases.includes(h))
      }
      const get = (r, field) => colOf[field] >= 0 ? blankDash(r[colOf[field]]) : ''

      // 기존 시약 (매칭용)
      const { data: existing } = await supabase.from('reagents')
        .select('id, name, name_ko, cas_no').neq('status', 'archived').range(0, 9999)
      const byCas = new Map()
      const byName = new Map()
      for (const e of existing || []) {
        if (e.cas_no) byCas.set(norm(e.cas_no), e)
        byName.set(normKey(e.name), e)
        if (e.name_ko) byName.set(normKey(e.name_ko), e)
      }

      const parsed = []
      for (let i = headerIdx + 1; i < aoa.length; i++) {
        const raw = aoa[i]
        if (!raw || raw.every(c => (c ?? '').toString().trim() === '')) continue
        const row = {
          _row: i + 1,
          nameEn: get(raw, 'nameEn'), nameKo: get(raw, 'nameKo'), casNo: get(raw, 'casNo'),
          company: get(raw, 'company'), catNo: get(raw, 'catNo'), purity: get(raw, 'purity'),
          volume: get(raw, 'volume'), unit: get(raw, 'unit'), locationText: get(raw, 'locationText'),
          lotNo: get(raw, 'lotNo'), sealedCount: get(raw, 'sealedCount'), remainPct: get(raw, 'remainPct'),
          bottleCount: get(raw, 'bottleCount'),
          receivedDate: excelDate(colOf.receivedDate >= 0 ? raw[colOf.receivedDate] : ''),
          expiryDate: excelDate(colOf.expiryDate >= 0 ? raw[colOf.expiryDate] : ''),
          note: get(raw, 'note'),
        }
        // 검증
        const problems = []
        if (!row.nameEn && !row.nameKo) problems.push('시약명(영문·국문 중 하나) 없음')
        const loc = locMatch(row.locationText)
        row._locId = loc?.id || null
        if (!row.locationText) problems.push('보관 위치 없음')
        else if (!loc) problems.push(`위치 "${row.locationText}" 를 찾지 못함`)
        const hasStock = row.sealedCount !== '' || row.remainPct !== '' || row.bottleCount !== ''
        if (!hasStock) problems.push('재고 정보(미개봉 수량·잔량·병수 중 하나) 없음')
        row._error = problems.length > 0
        row._problems = problems

        // 확인 필요(등록은 되지만 정보 부족)
        const warns = []
        if (!row.casNo) warns.push('CAS')
        if (!row.company) warns.push('제조사')
        if (!row.volume) warns.push('규격')
        if (!row.unit) warns.push('단위')
        if (!row.lotNo) warns.push('제조사 Lot No.')
        row._warns = warns

        // 기존 시약 매칭
        let match = null
        if (row.casNo && byCas.has(norm(row.casNo))) match = byCas.get(norm(row.casNo))
        else if (byName.has(normKey(row.nameEn || row.nameKo))) match = byName.get(normKey(row.nameEn || row.nameKo))
        row._matchId = match?.id || null
        row._matchName = match?.name || null

        parsed.push(row)
      }
      setRows(parsed)
    } catch (e) {
      alert('엑셀 분석 중 오류: ' + e.message)
    } finally {
      setParsing(false)
    }
  }

  const registerable = (rows || []).filter(r => !r._error)
  const newRows = registerable.filter(r => !r._matchId)
  const newGroups = new Map()
  for (const r of newRows) {
    const k = groupKey(r)
    if (!newGroups.has(k)) newGroups.set(k, [])
    newGroups.get(k).push(r)
  }
  const summary = rows && {
    total: rows.length,
    species: newGroups.size + new Set(registerable.filter(r => r._matchId).map(r => r._matchId)).size,
    lots: registerable.length,
    ok: rows.filter(r => !r._error && r._warns.length === 0).length,
    warn: rows.filter(r => !r._error && r._warns.length > 0).length,
    error: rows.filter(r => r._error).length,
  }

  async function apply() {
    if (registerable.length === 0) return
    if (!window.confirm(`정상/확인필요 ${registerable.length}건을 등록합니다.\n(신규 시약 ${newGroups.size}종 + 기존 시약에 Lot 추가)\n오류 ${summary.error}건은 제외됩니다. 계속할까요?`)) return
    setApplying(true); setDoneMsg('')
    try {
      // 1) 신규 마스터 생성 (그룹당 1개)
      setProgress('신규 시약 마스터 생성 중...')
      const groupToReagentId = new Map()
      const masterInserts = []
      for (const [k, grp] of newGroups) {
        const r = grp[0]
        masterInserts.push({
          key: k,
          master: {
            name: r.nameEn || r.nameKo,
            name_ko: r.nameKo || null,
            cas_no: r.casNo || null,
            company: r.company || null,
            purity: r.purity || null,
            volume: r.volume || null,
            unit: r.unit || null,
            registered_by: student?.student_id ?? null,
            sort_letter: computeSortLetter(r.nameEn || r.nameKo),
          },
        })
      }
      for (let i = 0; i < masterInserts.length; i += 100) {
        const chunk = masterInserts.slice(i, i + 100)
        const { data, error } = await supabase.from('reagents')
          .insert(chunk.map(c => c.master)).select('id')
        if (error) throw new Error('시약 등록 실패: ' + error.message)
        data.forEach((d, j) => groupToReagentId.set(chunk[j].key, d.id))
      }

      // 2) Lot 생성 — 제조사 Lot No. 없으면 내부번호 자동 부여
      setProgress('Lot(재고) 생성 중...')
      const needGen = registerable.filter(r => !r.lotNo).length
      const genNos = await generateInternalLotNos(needGen)
      let gi = 0
      const lotInserts = registerable.map(r => {
        const reagentId = r._matchId || groupToReagentId.get(groupKey(r))
        const sealed = r.sealedCount !== '' ? Number(r.sealedCount) || 0 : (Number(r.remainPct) >= 100 ? 1 : (r.bottleCount !== '' ? Number(r.bottleCount) || 0 : 0))
        const stock = r.remainPct !== '' ? Math.max(0, Math.min(100, Number(r.remainPct) || 0)) : 0
        return {
          reagent_id: reagentId,
          lot_no: r.lotNo || genNos[gi++],
          lot_source: r.lotNo ? 'manufacturer' : 'generated:unmarked',
          cat_no: r.catNo || null,
          sealed_count: sealed,
          current_stock: stock,
          location_id: r._locId,
          received_date: r.receivedDate || null,
          expiry_date: r.expiryDate || null,
          needs_review: r._warns.length > 0,
          review_note: r._warns.length > 0 ? `Excel 일괄추가 · 확인 필요: ${r._warns.join(', ')}` : null,
          status: 'active',
        }
      })
      for (let i = 0; i < lotInserts.length; i += 200) {
        const { error } = await supabase.from('reagent_lots').insert(lotInserts.slice(i, i + 200))
        if (error) throw new Error('Lot 등록 실패: ' + error.message)
      }

      await supabase.from('admin_logs').insert({
        admin_name: student?.name || '(관리자)', action: 'Excel 일괄 추가',
        target_type: 'reagent',
        description: `${fileName} — 신규 ${newGroups.size}종 / Lot ${lotInserts.length}개 추가`,
      })
      setProgress('')
      setDoneMsg(`✅ 완료: 신규 시약 ${newGroups.size}종, Lot ${lotInserts.length}개 추가됨.`)
      setRows(null); setFileName('')
    } catch (e) {
      setProgress('')
      alert(e.message + '\n\n일부만 반영됐을 수 있어요. 작업 기록/시약 목록을 확인해주세요.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card title="📥 Excel 시약 일괄 추가" sub="Bulk Add from Excel">
      <div style={{ fontSize: '12.5px', color: C.muted, lineHeight: 1.6, marginBottom: '16px' }}>
        여러 시약을 한 번에 등록해요. <b>기존 데이터는 그대로 두고 추가만</b> 합니다(전체 목록 교체 아님).
        엑셀의 시약이 이미 있으면(CAS 또는 시약명 일치) 그 시약에 새 Lot(병)만 붙여요.
        제조사 Lot No.가 비어 있으면 내부 관리번호가 자동 부여됩니다.
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <button onClick={downloadTemplate} style={btnExcel}>📊 양식 다운로드</button>
        <label style={{ ...btnPrimary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          📁 엑셀 파일 선택
          <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files?.[0])} />
        </label>
        {fileName && <span style={{ fontSize: '12.5px', color: C.text, alignSelf: 'center' }}>· {fileName}</span>}
      </div>

      {parsing && <div style={{ color: C.muted, fontSize: '13px' }}>분석 중...</div>}
      {doneMsg && (
        <div style={{ padding: '12px 16px', background: '#F0FFF4', border: '1px solid #9AE6B4', borderRadius: '8px', color: '#276749', fontSize: '13px', fontWeight: '600' }}>{doneMsg}</div>
      )}

      {rows && summary && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '4px 0 16px' }}>
            {[
              ['총 행 수', summary.total, C.text],
              ['등록될 시약 종류', summary.species, C.navy],
              ['등록될 Lot', summary.lots, C.navy],
              ['정상', summary.ok, '#1E9E6A'],
              ['확인 필요', summary.warn, '#B7791F'],
              ['등록 불가', summary.error, C.danger],
            ].map(([label, val, color]) => (
              <div key={label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', minWidth: 110 }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 2 }}>{val.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 460, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: 760 }}>
              <thead style={{ position: 'sticky', top: 0, background: C.bg }}>
                <tr>{['', '행', '시약명', '신규/기존', '위치', '재고', 'Lot No.', '문제'].map(h => <th key={h} style={{ ...thStyle, whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._row} style={{ background: r._error ? '#FFF5F5' : r._warns.length ? '#FFFBEB' : C.white }}>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{r._error ? '❌' : r._warns.length ? '⚠️' : '✅'}</td>
                    <td style={{ ...tdStyle, color: C.muted }}>{r._row}</td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: C.navy, whiteSpace: 'nowrap' }}>{r.nameEn || r.nameKo || <span style={{ color: C.danger }}>(없음)</span>}{r.nameKo && r.nameEn ? <span style={{ color: C.muted, fontWeight: 400 }}> · {r.nameKo}</span> : null}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r._error ? '-' : r._matchId ? <span style={{ color: '#276749' }}>기존({r._matchName})</span> : <span style={{ color: C.navy }}>신규</span>}</td>
                    <td style={{ ...tdStyle, color: r._locId ? C.text : C.danger, whiteSpace: 'nowrap' }}>{r.locationText || '-'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{r.sealedCount || 0}병 / {r.remainPct || 0}%</td>
                    <td style={{ ...tdStyle, color: r.lotNo ? C.text : C.muted, whiteSpace: 'nowrap' }}>{r.lotNo || '(자동부여)'}</td>
                    <td style={{ ...tdStyle, color: r._error ? C.danger : '#B7791F', fontSize: 11 }}>
                      {r._error ? r._problems.join(' · ') : r._warns.length ? `확인 필요: ${r._warns.join(', ')}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <button onClick={apply} disabled={applying || registerable.length === 0}
              style={{ ...btnPrimary, background: registerable.length === 0 ? C.muted : C.navy, opacity: applying ? 0.6 : 1 }}>
              {applying ? '등록 중...' : `${registerable.length}건 일괄 등록`}
            </button>
            {progress && <span style={{ fontSize: 12.5, color: C.muted }}>{progress}</span>}
            {summary.error > 0 && <span style={{ fontSize: 12, color: C.danger }}>❌ {summary.error}건은 제외됩니다</span>}
          </div>
        </>
      )}
    </Card>
  )
}
