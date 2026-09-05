-- KECO GHS 조회 API의 hrmflnList(유해분류 배열: 이름/H코드/등급/예방조치문구)를
-- 지금까지는 이름만 뽑아 hazard 텍스트 하나로 뭉쳐 저장했음. "인화성 액체만",
-- "급성독성만" 처럼 유해분류별로 필터링/조회하려면 구조 그대로 저장해야 해서 추가.
-- 기존 hazard(표시용 텍스트, 수동입력도 가능)는 그대로 유지 — 병행해서 채움.
alter table reagents
  add column if not exists hazard_classifications jsonb;
comment on column reagents.hazard_classifications is 'KECO GHS API hrmflnList 원본 구조 보존: [{name, hCode, grade, pCodes}, ...]. hazard/ghs_pictograms와 같은 조회 시점에 함께 채워짐.';
