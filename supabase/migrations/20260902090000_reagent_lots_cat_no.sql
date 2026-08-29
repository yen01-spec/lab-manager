-- reagent_lots에 Cat No.(제조사 카탈로그 번호) 컬럼 추가.
-- 시약 상세/목록/구매요청서에는 이미 있었지만 정작 실제 보유 Lot 정보에는 빠져 있었음.
alter table reagent_lots
  add column if not exists cat_no text;
