-- 구매요청서 시약 항목: 필수정보(필요용량/사용처/구매목적)를 기존 '용도' 대신 세분화
alter table purchase_request_reagent_items
  add column if not exists needed_amount text,
  add column if not exists usage_place text,
  add column if not exists purchase_reason text;

-- 구매요청서 물품 항목: Cat No. 추가
alter table purchase_request_goods_items
  add column if not exists cat_no text;
