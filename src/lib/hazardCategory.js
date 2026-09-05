// 강원대학교 연구실안전관리시스템 "연구실 내 화학약품 성상별 분류 방법" 기준.
// GHS-MSDS 유해분류명(hazard_classifications[].name, KECO API의 hrmflnClsfArtclNm)을
// 학교 분류체계의 성상구분(보관 시약장 단위) + 위험물안전관리법 유별로 매핑한다.
//
// 문서의 우선순위 규칙: 물리적 위험성이 인체유해성보다 우선, 그 중에서도 위험물관리법에
// 해당류가 있는 것(자연발화성·폭발성·인화성·산화성)을 먼저 본다. CATEGORY_PRIORITY 순서가
// 그 기준이고, 시약 하나가 여러 유해분류를 동시에 가지면 이 순서상 가장 앞선 것을 대표
// 성상구분으로 채택한다(문서 3쪽 예시들과 동일한 방식).
//
// 인화성/산화성은 문서 표엔 고체·액체 구분 없이 "제2,4류"/"제1,6류"로 뭉쳐 있지만, 우리
// GHS 데이터는 "인화성 가스/고체/액체"로 이미 세분화돼 있어서 더 정확하게 갈라 매핑했다:
// 인화성 고체→제2류, 인화성 액체→제4류, 인화성 가스는 위험물안전관리법이 아니라
// 고압가스안전관리법 소관이라 유별 없음. 산화성 고체→제1류, 산화성 액체→제6류.
export const GHS_NAME_TO_CATEGORY = {
  '물반응성 물질 및 혼합물': { category: '자연발화성 및 금수성', fireSafetyClass: '제3류' },
  '유기과산화물': { category: '폭발성', fireSafetyClass: '제5류' },
  '인화성 가스': { category: '인화성', fireSafetyClass: null },
  '인화성 고체': { category: '인화성', fireSafetyClass: '제2류' },
  '인화성 액체': { category: '인화성', fireSafetyClass: '제4류' },
  '산화성 고체': { category: '산화성', fireSafetyClass: '제1류' },
  '산화성 액체': { category: '산화성', fireSafetyClass: '제6류' },
  '금속부식성 물질': { category: '부식성', fireSafetyClass: null },
  '피부 부식성/자극성': { category: '부식성', fireSafetyClass: null },
  '급성독성-경구': { category: '독성', fireSafetyClass: null },
  '급성독성-경피': { category: '독성', fireSafetyClass: null },
  '급성독성-흡입': { category: '독성', fireSafetyClass: null },
  '급성독성-흡입(>70%)': { category: '독성', fireSafetyClass: null },
  '급성독성-흡입(≤70%)': { category: '독성', fireSafetyClass: null },
  '흡인 유해성': { category: '독성', fireSafetyClass: null },
  '발암성': { category: '발암성', fireSafetyClass: null },
  '심한 눈 손상/눈 자극성': { category: '자극성', fireSafetyClass: null },
  '피부 과민성': { category: '자극성', fireSafetyClass: null },
  '호흡기 과민성': { category: '자극성', fireSafetyClass: null },
  '수생환경 유해성 급성': { category: '수생환경 유해성', fireSafetyClass: null },
  '수생환경 유해성 만성': { category: '수생환경 유해성', fireSafetyClass: null },
  '오존층 유해성': { category: '수생환경 유해성', fireSafetyClass: null },
  '고압가스': { category: '고압가스', fireSafetyClass: null },
  // 문서 표에 별도 항목으로 명시돼 있지 않은 세부 GHS 구분 — 일단 "기타 인체유해성"으로 묶어둠
  '생식독성': { category: '기타 인체유해성', fireSafetyClass: null },
  '생식세포 변이원성': { category: '기타 인체유해성', fireSafetyClass: null },
  '특정 표적장기 독성-1회 노출': { category: '기타 인체유해성', fireSafetyClass: null },
  '특정 표적장기 독성-반복 노출': { category: '기타 인체유해성', fireSafetyClass: null },
}

// 대표 성상구분을 정할 때의 우선순위 — 문서: "물리적 위험성 - 인체 유해성 순으로 구분"
export const CATEGORY_PRIORITY = [
  '자연발화성 및 금수성', '폭발성', '인화성', '산화성', '부식성',
  '고압가스', '독성', '발암성', '자극성', '수생환경 유해성', '기타 인체유해성',
]

// classifications: reagents.hazard_classifications 배열([{name, hCode, grade, pCodes}, ...])
// 매칭되는 게 하나도 없으면(문서의 "유해 위험성 없는 것") category '일반', fireSafetyClass null.
export function getHazardCategory(classifications) {
  if (!classifications || classifications.length === 0) return { category: '일반', fireSafetyClass: null, matchedName: null }
  const mapped = classifications
    .map(c => ({ ...GHS_NAME_TO_CATEGORY[c.name], matchedName: c.name }))
    .filter(m => m.category)
  if (mapped.length === 0) return { category: '일반', fireSafetyClass: null, matchedName: null }
  mapped.sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category))
  return mapped[0]
}
