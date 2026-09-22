// 시약 기본정보(reagent 단위) 수정 공통 정의 — ReagentDetail의 단일 편집과
// MultiReagentEditQueue의 여러 시약 순차 편집이 같은 필드 목록/저장 규칙을 쓴다.
export const FIELD_LABELS = {
  name: '시약명', name_ko: '국문 시약명', purity: '순도', cas_no: 'CAS 번호', company: '제조사', category: '성상', volume: '용량', unit: '단위', hazard: '유해정보',
  manager: '담당자', msds_url: 'MSDS URL', notes: '비고',
}

// 영문 시약명(name: 정렬·묶음의 기준)은 화면에서 고치지 않는다. 용량(numeric)과 단위(text)는 별개 컬럼이라 따로 입력한다.
export const MASTER_ROWS = [
  { key: 'name_ko', label: '국문 시약명', keys: ['name_ko'] },
  { key: 'cas_no', label: 'CAS 번호', keys: ['cas_no'], source: 'cas_source' },
  { key: 'company', label: '제조사', keys: ['company'], source: 'company_source' },
  { key: 'purity', label: '순도', keys: ['purity'] },
  { key: 'category', label: '성상', keys: ['category'], source: 'category_source' },
  { key: 'volume', label: '용량 · 단위', keys: ['volume', 'unit'], source: 'volume_source' },
  { key: 'hazard', label: '유해정보', keys: ['hazard'], source: 'hazard_source' },
]
export const MASTER_KEYS = MASTER_ROWS.flatMap(r => r.keys)
// 항목별 "입력 출처" 컬럼(cas_no 의 출처 컬럼은 cas_source 다)
export const SOURCE_COL = { cas_no: 'cas_source', company: 'company_source', category: 'category_source', volume: 'volume_source', hazard: 'hazard_source' }
