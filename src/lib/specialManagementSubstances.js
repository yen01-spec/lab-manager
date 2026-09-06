// 산업안전보건기준에 관한 규칙 [별표12] 특별관리물질 44종(2022.10.18 개정 37종 +
// 2023.10.19 시행 7종 추가). 이 물질을 취급하면 특수건강검진 대상이 되고, 취급일지를
// 작성해 30년 이상 보존해야 한다(사용량과 무관 — 아무리 짧은 시간·소량이어도 대상).
// 원본: 강원대학교 연구실안전관리시스템 제공 자료 > 특별관리물질 44종 (개정 221018).pdf
//
// CAS 매칭은 정확히 일치하는 경우만 본다. 문서에 "25321-14-6 등"처럼 이성질체/관련물질을
// 포괄하는 표기가 몇 개 있는데(디니트로톨루엔, 2,3-에폭시-1-프로판올, 1,2-에폭시프로판,
// 에피클로로히드린), 그 경우 대표 CAS 하나만 등록해뒀다 — 정밀 매칭이 필요하면 나중에 보완.
export const SPECIAL_MANAGEMENT_SUBSTANCES = [
  { name: '디니트로톨루엔', cas: '25321-14-6', threshold: '0.1%이상' },
  { name: 'N,N-디메틸아세트아미드', cas: '127-19-5', threshold: '0.3%이상' },
  { name: 'N,N-디메틸포름아미드', cas: '68-12-2', threshold: '0.3%이상' },
  { name: '1,2-디클로로에탄', cas: '107-06-2', threshold: '0.1%이상' },
  { name: '1,2-디클로로프로판', cas: '78-87-5', threshold: '0.1%이상' },
  { name: '2-메톡시에탄올', cas: '109-86-4', threshold: '0.3%이상' },
  { name: '2-메톡시에틸 아세테이트', cas: '110-49-6', threshold: '0.3%이상' },
  { name: '벤젠', cas: '71-43-2', threshold: '0.1%이상' },
  { name: '1,3-부타디엔', cas: '106-99-0', threshold: '0.1%이상' },
  { name: '1-브로모프로판', cas: '106-94-5', threshold: '0.3%이상' },
  { name: '2-브로모프로판', cas: '75-26-3', threshold: '0.3%이상' },
  { name: '사염화탄소', cas: '56-23-5', threshold: '0.1%이상' },
  { name: '스토다드 솔벤트', cas: '8052-41-3', threshold: '0.1%이상' },
  { name: '아크릴로니트릴', cas: '107-13-1', threshold: '0.1%이상' },
  { name: '아크릴아미드', cas: '79-06-1', threshold: '0.1%이상' },
  { name: '2-에톡시에탄올', cas: '110-80-5', threshold: '0.3%이상' },
  { name: '2-에톡시에틸 아세테이트', cas: '111-15-9', threshold: '0.3%이상' },
  { name: '에틸렌이민', cas: '151-56-4', threshold: '0.1%이상' },
  { name: '2,3-에폭시-1-프로판올', cas: '556-52-5', threshold: '0.1%이상' },
  { name: '1,2-에폭시프로판', cas: '75-56-9', threshold: '0.1%이상' },
  { name: '에피클로로히드린', cas: '106-89-8', threshold: '0.1%이상' },
  { name: '트리클로로에틸렌', cas: '79-01-6', threshold: '0.1%이상' },
  { name: '1,2,3-트리클로로프로판', cas: '96-18-4', threshold: '0.1%이상' },
  { name: '퍼클로로에틸렌', cas: '127-18-4', threshold: '0.1%이상' },
  { name: '페놀', cas: '108-95-2', threshold: '0.3%이상' },
  { name: '포름알데히드', cas: '50-00-0', threshold: '0.1%이상' },
  { name: '프로필렌이민', cas: '75-55-8', threshold: '0.1%이상' },
  { name: '황산 디메틸', cas: '77-78-1', threshold: '0.1%이상' },
  { name: '히드라진 및 그 수화물', cas: '302-01-2', threshold: '0.1%이상' },
  { name: '납 및 그 무기화합물', cas: '7439-92-1', threshold: '0.3%이상' },
  { name: '니켈 및 그 무기화합물, 니켈 카르보닐', cas: '7440-02-0', threshold: '0.1%이상' },
  { name: '수은 및 그 화합물', cas: '7439-97-6', threshold: '0.3%이상' },
  { name: '안티몬 및 그 화합물(삼산화안티몬만)', cas: '7440-36-0', threshold: '0.1%이상' },
  { name: '카드뮴 및 그 화합물', cas: '7440-43-9', threshold: '0.1%이상' },
  { name: '크롬 및 그 화합물(6가크롬 화합물만)', cas: '7440-47-3', threshold: '0.1%이상' },
  { name: '황산(pH 2.0 이하인 강산만)', cas: '7664-93-9', threshold: '0.1%이상' },
  { name: '산화에틸렌', cas: '75-21-8', threshold: '0.1%이상' },
  // 2023.10.19 시행 추가 7종
  { name: '2-니트로톨루엔', cas: '88-72-2', threshold: '0.1%이상' },
  { name: '디부틸 프탈레이트', cas: '84-74-2', threshold: '0.3%이상' },
  { name: '벤조(a)피렌', cas: '50-32-8', threshold: '0.1%이상' },
  { name: '와파린', cas: '81-81-2', threshold: '0.3%이상' },
  { name: '포름아미드', cas: '75-12-7', threshold: '0.3%이상' },
  { name: '산화붕소', cas: '1303-86-2', threshold: '0.3%이상' },
  { name: '사붕소산 나트륨(무수물, 오수화물)', cas: '1330-43-4', threshold: '0.3%이상' },
]

const CAS_MAP = new Map(SPECIAL_MANAGEMENT_SUBSTANCES.map(s => [s.cas, s]))

export function getSpecialManagementInfo(casNo) {
  if (!casNo) return null
  return CAS_MAP.get(casNo.trim()) || null
}
