// 산업안전보건기준에 관한 규칙 [별표12] 특별관리물질 44종(2022.10.18 개정 37종 +
// 2023.10.19 시행 7종 추가). 이 물질을 취급하면 특수건강검진 대상이 되고, 취급일지를
// 작성해 30년 이상 보존해야 한다(사용량과 무관 — 아무리 짧은 시간·소량이어도 대상).
// 원본: 강원대학교 연구실안전관리시스템 제공 자료 > 특별관리물질 44종 (개정 221018).pdf
//
// CAS는 정확히 일치하는 경우만 본다. 문서에 "25321-14-6 등"처럼 이성질체/관련물질을
// 포괄하는 표기가 몇 개 있는데(디니트로톨루엔, 2,3-에폭시-1-프로판올, 1,2-에폭시프로판,
// 에피클로로히드린), 그 경우 대표 CAS 하나만 등록해뒀다.
// "및 그 화합물"류(납/니켈/수은/안티몬/카드뮴/크롬)는 원소 하나의 CAS만 있어서 CAS만으론
// 화합물 전체를 못 잡는다 — 이름 매칭(예: "Lead nitrate"에 "Lead" 포함)이 실질적으로 더
// 넓게 잡아준다. 다만 안티몬/크롬은 특정 형태만 해당(삼산화안티몬만, 6가크롬 화합물만)이라
// 이름만으론 확정할 수 없어 항상 "의심"으로만 뜬다(threshold에 표시해둠).
export const SPECIAL_MANAGEMENT_SUBSTANCES = [
  { name: '디니트로톨루엔', nameEn: 'Dinitrotoluene', cas: '25321-14-6', threshold: '0.1%이상' },
  { name: 'N,N-디메틸아세트아미드', nameEn: 'N,N-Dimethylacetamide', cas: '127-19-5', threshold: '0.3%이상' },
  { name: '디메틸포름아미드', nameEn: 'Dimethylformamide', cas: '68-12-2', threshold: '0.3%이상' },
  { name: '1,2-디클로로에탄', nameEn: '1,2-Dichloroethane', cas: '107-06-2', threshold: '0.1%이상' },
  { name: '1,2-디클로로프로판', nameEn: '1,2-Dichloropropane', cas: '78-87-5', threshold: '0.1%이상' },
  { name: '2-메톡시에탄올', nameEn: '2-Methoxyethanol', cas: '109-86-4', threshold: '0.3%이상' },
  { name: '2-메톡시에틸 아세테이트', nameEn: '2-Methoxyethyl acetate', cas: '110-49-6', threshold: '0.3%이상' },
  { name: '벤젠', nameEn: 'Benzene', cas: '71-43-2', threshold: '0.1%이상' },
  { name: '1,3-부타디엔', nameEn: '1,3-Butadiene', cas: '106-99-0', threshold: '0.1%이상' },
  { name: '1-브로모프로판', nameEn: '1-Bromopropane', cas: '106-94-5', threshold: '0.3%이상' },
  { name: '2-브로모프로판', nameEn: '2-Bromopropane', cas: '75-26-3', threshold: '0.3%이상' },
  { name: '사염화탄소', nameEn: 'Carbon tetrachloride', cas: '56-23-5', threshold: '0.1%이상' },
  { name: '스토다드 솔벤트', nameEn: 'Stoddard solvent', cas: '8052-41-3', threshold: '0.1%이상' },
  { name: '아크릴로니트릴', nameEn: 'Acrylonitrile', cas: '107-13-1', threshold: '0.1%이상' },
  { name: '아크릴아미드', nameEn: 'Acrylamide', cas: '79-06-1', threshold: '0.1%이상' },
  { name: '2-에톡시에탄올', nameEn: '2-Ethoxyethanol', cas: '110-80-5', threshold: '0.3%이상' },
  { name: '2-에톡시에틸 아세테이트', nameEn: '2-Ethoxyethyl acetate', cas: '111-15-9', threshold: '0.3%이상' },
  { name: '에틸렌이민', nameEn: 'Ethyleneimine', cas: '151-56-4', threshold: '0.1%이상' },
  { name: '2,3-에폭시-1-프로판올', nameEn: '2,3-Epoxy-1-propanol', cas: '556-52-5', threshold: '0.1%이상' },
  { name: '1,2-에폭시프로판', nameEn: '1,2-Epoxypropane', cas: '75-56-9', threshold: '0.1%이상', aliases: ['Propylene oxide', '프로필렌옥사이드'] },
  { name: '에피클로로히드린', nameEn: 'Epichlorohydrin', cas: '106-89-8', threshold: '0.1%이상' },
  { name: '트리클로로에틸렌', nameEn: 'Trichloroethylene', cas: '79-01-6', threshold: '0.1%이상' },
  { name: '1,2,3-트리클로로프로판', nameEn: '1,2,3-Trichloropropane', cas: '96-18-4', threshold: '0.1%이상' },
  { name: '퍼클로로에틸렌', nameEn: 'Perchloroethylene', cas: '127-18-4', threshold: '0.1%이상' },
  { name: '페놀', nameEn: 'Phenol', cas: '108-95-2', threshold: '0.3%이상' },
  { name: '포름알데히드', nameEn: 'Formaldehyde', cas: '50-00-0', threshold: '0.1%이상', aliases: ['Formalin', '포르말린'] },
  { name: '프로필렌이민', nameEn: 'Propyleneimine', cas: '75-55-8', threshold: '0.1%이상' },
  { name: '황산 디메틸', nameEn: 'Dimethyl sulfate', cas: '77-78-1', threshold: '0.1%이상' },
  { name: '히드라진 및 그 수화물', nameEn: 'Hydrazine', cas: '302-01-2', threshold: '0.1%이상' },
  { name: '납 및 그 무기화합물', nameEn: 'Lead', cas: '7439-92-1', threshold: '0.3%이상 (화합물 전체 해당)', isClass: true },
  { name: '니켈 및 그 무기화합물, 니켈 카르보닐', nameEn: 'Nickel', cas: '7440-02-0', threshold: '0.1%이상 (화합물 전체 해당)', isClass: true },
  { name: '수은 및 그 화합물', nameEn: 'Mercury', cas: '7439-97-6', threshold: '0.3%이상 (화합물 전체 해당)', isClass: true },
  { name: '안티몬 및 그 화합물', nameEn: 'Antimony', cas: '7440-36-0', threshold: '0.1%이상 (삼산화안티몬만 해당 — 형태 확인 필요)', isClass: true },
  { name: '카드뮴 및 그 화합물', nameEn: 'Cadmium', cas: '7440-43-9', threshold: '0.1%이상 (화합물 전체 해당)', isClass: true },
  { name: '크롬 및 그 화합물', nameEn: 'Chromium', cas: '7440-47-3', threshold: '0.1%이상 (6가크롬 화합물만 해당 — 형태 확인 필요)', isClass: true },
  { name: '황산', nameEn: 'Sulfuric acid', cas: '7664-93-9', threshold: '0.1%이상 (pH 2.0 이하 강산만 해당 — 농도 확인 필요)' },
  { name: '산화에틸렌', nameEn: 'Ethylene oxide', cas: '75-21-8', threshold: '0.1%이상' },
  // 2023.10.19 시행 추가 7종
  { name: '2-니트로톨루엔', nameEn: '2-Nitrotoluene', cas: '88-72-2', threshold: '0.1%이상' },
  { name: '디부틸 프탈레이트', nameEn: 'Dibutyl phthalate', cas: '84-74-2', threshold: '0.3%이상' },
  { name: '벤조(a)피렌', nameEn: 'Benzo(a)pyrene', cas: '50-32-8', threshold: '0.1%이상' },
  { name: '와파린', nameEn: 'Warfarin', cas: '81-81-2', threshold: '0.3%이상' },
  { name: '포름아미드', nameEn: 'Formamide', cas: '75-12-7', threshold: '0.3%이상' },
  { name: '산화붕소', nameEn: 'Boron oxide', cas: '1303-86-2', threshold: '0.3%이상' },
  { name: '사붕소산 나트륨', nameEn: 'Sodium tetraborate', cas: '1330-43-4', threshold: '0.3%이상 (무수물, 오수화물)' },
]

const CAS_MAP = new Map(SPECIAL_MANAGEMENT_SUBSTANCES.map(s => [s.cas, s]))

// 소문자화 + 영숫자/한글만 남김 — 대소문자·공백·쉼표·마침표·괄호·하이픈 표기 차이를
// 흡수해서 "N,N-Dimethylformamide"와 "dried N,N-dimethyl formamide (DMF)"처럼 겉보기엔
// 달라도 실제로는 같은 화학명이 포함된 문자열을 비교할 수 있게 한다.
function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
}

// 시약명이 물질명 전체를 포함하는지만 본다(단방향) — "...formamide (DMF)"에
// "dimethylformamide" 포함되는 식. 반대 방향(물질명이 시약명을 포함)은 넣지 않는다 —
// "ethanol"이 "2-methoxyethanol"에 포함된다고 매칭시키면 완전히 다른 물질(에탄올)이
// 메톡시에탄올로 잘못 잡히는 문제가 있었음. 물질명이 짧으면(4자 이하) 우연히 겹칠
// 위험이 커서 매칭에서 제외한다.
function fuzzyNameMatch(reagentName, substance) {
  const rn = normalize(reagentName)
  if (!rn) return false
  // 규정 명칭 + 명백한 동의어/관용명(aliases)까지 비교 — "Formalin"↔"Formaldehyde",
  // "Propylene oxide"↔"1,2-Epoxypropane"처럼 CAS는 같은데 명칭 표기만 다른 경우 흡수.
  return [substance.name, substance.nameEn, ...(substance.aliases || [])].some(candidate => {
    const sn = normalize(candidate)
    return sn.length > 4 && rn.includes(sn)
  })
}

// 반환값: null(해당없음) | { status: 'confirmed'|'suspected', substance, reason }
// confirmed = CAS 일치 + 이름도 부합(교차검증 통과)
// suspected = CAS는 일치하지만 이름이 안 맞음(CAS 오기입 의심) — 또는 —
//             "및 그 화합물"류(금속)에서 이름은 부합하지만 CAS가 다르거나 없음
//
// 이름만으로 찾는 검색(CAS 불일치/없음일 때)은 isClass:true인 금속류 6종에만 적용한다.
// 벤젠/페놀/히드라진/아크릴로니트릴 같은 개별 분자는 "니트로벤젠", "페놀프탈레인",
// "페닐히드라진염산염"처럼 완전히 다른 물질명에 모체 이름이 그대로 들어가는 경우가
// 화학명명법상 흔해서, 이름만으로 폭넓게 찾으면 관련없는 유도체가 대량으로 걸린다
// (실제 테스트: 136건 중 대부분이 이런 오탐). 반면 금속류는 "니켈 및 그 무기화합물"처럼
// 규정 자체가 화합물 전체를 포괄해서, 이름에 "Nickel"이 들어가면 실제로 대부분 해당됨.
export function getSpecialManagementInfo(reagentName, casNo) {
  const casMatch = casNo ? CAS_MAP.get(casNo.trim()) : null
  const nameMatch = SPECIAL_MANAGEMENT_SUBSTANCES.find(s => s.isClass && fuzzyNameMatch(reagentName, s))

  if (casMatch) {
    const nameAgrees = fuzzyNameMatch(reagentName, casMatch)
    if (nameAgrees) return { status: 'confirmed', substance: casMatch, reason: null }
    return { status: 'suspected', substance: casMatch, reason: `CAS(${casMatch.cas})는 "${casMatch.name}"와 일치하지만 시약명이 달라 확인이 필요합니다.` }
  }
  if (nameMatch) {
    return { status: 'suspected', substance: nameMatch, reason: `시약명이 "${nameMatch.name}(${nameMatch.nameEn})"와 유사하지만 CAS(${casNo || '미기재'})가 달라 확인이 필요합니다.` }
  }
  return null
}
