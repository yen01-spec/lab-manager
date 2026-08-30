-- 1) 시약 기본정보에 "순도" 필드 추가 — 지금까지는 이름 뒤에 "98%"처럼 붙여쓰던 걸
--    구조화된 필드로 분리(시약목록/재고실사/구매요청서에서 공통으로 사용).
alter table reagents
  add column if not exists purity text;
comment on column reagents.purity is '순도(예: 98%, ACS 등급 등) — 화학물질명과 분리해서 관리';

-- purchase_request_reagent_items에도 동일하게 순도 입력칸 추가(구매요청서 화면).
alter table purchase_request_reagent_items
  add column if not exists purity text;
comment on column purchase_request_reagent_items.purity is '구매요청 시 입력한 순도';

-- 2) 재고실사 시작 모드 — 기존 purpose 컬럼(quantity_status/comprehensive, 실제로는 한 번도
--    구분해서 안 씀)을 "전수조사(full_census)"/"현재목록 재고실사(current_list)" 두 가지로
--    재정의. 전수조사는 상단 검색·대조 패널만으로 입력하고 하단엔 완료/미완료 목록만 보여주는
--    가벼운 화면, 현재목록 재고실사는 기존처럼 전체 데이터를 편집 가능한 표로 보여주는 화면.
alter table inventory_sessions drop constraint if exists inventory_sessions_purpose_check;
-- 지금까지 있던 회차는 전부 purpose='comprehensive'(항상 고정값이었음, 실제로 구분해서 쓴 적
-- 없음) — 기존 화면 동작(상단+전체 편집 표)과 그대로 대응되는 current_list로 변환.
update inventory_sessions set purpose = 'current_list' where purpose not in ('full_census', 'current_list');
alter table inventory_sessions
  alter column purpose set default 'current_list',
  add constraint inventory_sessions_purpose_check check (purpose in ('full_census', 'current_list'));
comment on column inventory_sessions.purpose is '전수조사(full_census) 또는 현재목록 재고실사(current_list)';
