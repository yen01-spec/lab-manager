import { supabase } from '../supabase'

// ── 제조사 Lot No. / 내부 관리번호 ────────────────────────────────
// 원칙(수정방안 §12~15):
//  - 제조사 Lot No.가 있으면 그대로 사용하고 내부번호를 만들지 않는다.
//  - 제품에 표기가 없거나 확인 불가하면(라벨 훼손 등) 그때만 내부 관리번호를
//    KNU-YYYYMMDD-NNN (등록일 + 당일 순번) 형식으로 자동 부여한다.
//  - 그냥 입력 안 한 것(단순 누락)과 "정보 부재"를 구분하기 위해 lot_source에 기록한다.
//    lot_source: 'manufacturer' | 'generated:unmarked' | 'generated:unknown' | 'unspecified'

export const NO_LOT_REASONS = [
  { key: 'unmarked', label: '제품에 Lot No. 표기 없음' },
  { key: 'unknown', label: '확인 불가 (라벨 훼손 등)' },
]

const INSTITUTION_CODE = 'KNU'

export function internalLotPrefix(d = new Date()) {
  const code = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${INSTITUTION_CODE}-${code}-`
}

// 오늘자 KNU-YYYYMMDD-NNN 중 가장 큰 순번 +1. (연구실 1곳·저동시성이라 클라이언트 계산으로 충분)
export async function generateInternalLotNo() {
  const prefix = internalLotPrefix()
  const { data } = await supabase.from('reagent_lots').select('lot_no').ilike('lot_no', `${prefix}%`)
  let maxN = 0
  for (const r of data || []) {
    const m = (r.lot_no || '').match(/-(\d{3,})$/)
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  return `${prefix}${String(maxN + 1).padStart(3, '0')}`
}

// Excel 일괄 등록처럼 한 번에 여러 개가 필요할 때 — DB를 한 번만 조회하고
// 로컬에서 순번을 이어붙인다(각 행마다 조회하면 같은 번호가 중복됨).
export async function generateInternalLotNos(count) {
  if (count <= 0) return []
  const prefix = internalLotPrefix()
  const { data } = await supabase.from('reagent_lots').select('lot_no').ilike('lot_no', `${prefix}%`)
  let maxN = 0
  for (const r of data || []) {
    const m = (r.lot_no || '').match(/-(\d{3,})$/)
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${String(maxN + 1 + i).padStart(3, '0')}`)
}

// 폼 상태({ lotNo, noLotReason }) → reagent_lots에 저장할 { lot_no, lot_source }
export async function resolveLotNo({ lotNo = '', noLotReason = '' } = {}) {
  if (noLotReason) {
    return { lot_no: await generateInternalLotNo(), lot_source: `generated:${noLotReason}` }
  }
  const v = (lotNo || '').trim()
  if (v) return { lot_no: v, lot_source: 'manufacturer' }
  return { lot_no: null, lot_source: 'unspecified' }
}

export function isGeneratedLot(lotSource) {
  return typeof lotSource === 'string' && lotSource.startsWith('generated')
}
