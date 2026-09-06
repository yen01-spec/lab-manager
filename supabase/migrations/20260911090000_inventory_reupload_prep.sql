-- 2026-2 전수조사 데이터 재업로드 준비.
-- 1) 국문 시약명 별도 저장 — 기존 name은 영문명 그대로 유지, 국문명만 새 컬럼에 추가.
-- 2) 위치 세부정보 — locations 테이블 자체(room/detail)는 세분화하지 않고 그대로 두되,
--    시약 상세페이지에서 더 상세한 위치(예: "5층 배기형 시약장 2번 좌측"의 "좌측"처럼
--    locations에 없는 한 단계 더 세밀한 표기)를 Lot별로 보여주기 위한 자유 텍스트 컬럼.
alter table reagents
  add column if not exists name_ko text;
comment on column reagents.name_ko is '국문 시약명. name(영문)과 별개로 저장 — 2026-2 전수조사 엑셀의 국문시약명 컬럼 반영.';

alter table reagent_lots
  add column if not exists shelf_position text;
comment on column reagent_lots.shelf_position is 'locations(room/detail)보다 더 세밀한 위치 표기(예: "좌측", "2번 좌측", "3단") — locations 자체를 세분화하는 대신 Lot 단위로 자유 텍스트로만 기록해 상세페이지에 덧붙여 보여줌.';
