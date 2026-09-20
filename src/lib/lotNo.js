import { supabaseAdmin } from '../supabase'

// ── 제조사 Lot No. / 내부 관리번호 ────────────────────────────────
// 원칙(수정방안 §12~15):
//  - 제조사 Lot No.가 있으면 그대로 사용하고 내부번호를 만들지 않는다.
//  - 제품에 표기가 없거나 확인 불가하면(라벨 훼손 등) 그때만 내부 관리번호를
//    KNU-YYYYMMDD-NNN (등록일 + 당일 순번) 형식으로 자동 부여한다.
//  - 그냥 입력 안 한 것(단순 누락)과 "정보 부재"를 구분하기 위해 lot_source에 기록한다.
//    lot_source: 'manufacturer' | 'generated:unmarked' | 'generated:unknown' | 'unspecified'
//
// 번호 생성은 서버(admin_next_internal_lot_nos RPC — 원자 카운터 + 유일 인덱스)가 전담한다. 예전엔 클라이언트가
// "오늘자 최대 순번+1"을 계산해서 동시에 등록하면 같은 번호가 나올 수 있었다. 이 파일의 생성 함수는 관리자
// 화면(시약 1건 추가/Excel 일괄 추가)용이고, 학생 화면은 각 등록 RPC가 서버 안에서 번호를 직접 부여한다.

export const NO_LOT_REASONS = [
  { key: 'unmarked', label: '제품에 Lot No. 표기 없음' },
  { key: 'unknown', label: '확인 불가 (라벨 훼손 등)' },
]

// 화면 안내문용(실제 번호는 서버가 부여). 서버와 같은 한국시간 날짜 기준.
export function internalLotPrefix(d = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replaceAll('-', '')
  return `KNU-${day}-`
}

export async function generateInternalLotNos(count) {
  if (count <= 0) return []
  const { data, error } = await supabaseAdmin.rpc('admin_next_internal_lot_nos', { p_count: count })
  if (error) throw new Error(error.message || '내부 관리번호 생성에 실패했습니다.')
  return data
}

export async function generateInternalLotNo() {
  return (await generateInternalLotNos(1))[0]
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

// Lot 표시 규칙(§55): 제조사 Lot No.가 있으면 그것만, 없고 내부 관리번호가 있으면 그것만.
export function lotLabel(lot) {
  if (!lot?.lot_no) return '(번호 없음)'
  return isGeneratedLot(lot.lot_source) ? `내부관리 ${lot.lot_no}` : `Lot ${lot.lot_no}`
}
