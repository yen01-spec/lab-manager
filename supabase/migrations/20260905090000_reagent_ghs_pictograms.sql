-- KECO GHS 조회 API 응답에 이미 포함되어 있던 공식 GHS 픽토그램 코드(pctgrmCd,
-- 예: "GHS02^GHS07^GHS08")를 지금까지는 안 쓰고 버리고 있었음. hazard 텍스트에서
-- 키워드를 추측해서 이모지를 붙이던 방식(getGhsEmojis) 대신, 이 공식 코드를
-- 그대로 저장해서 정확한 픽토그램을 보여주기 위한 컬럼 추가.
alter table reagents
  add column if not exists ghs_pictograms text;
comment on column reagents.ghs_pictograms is '국가유해물질정보 GHS API의 pctgrmCd 원본 값(예: "GHS02^GHS07^GHS08"). hazard/hazard_source와 같은 조회 시점에 함께 채워짐.';
