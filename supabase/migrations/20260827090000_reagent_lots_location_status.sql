-- 시약 마스터/Lot 구조 분리 1단계: reagent_lots에 위치·상태 컬럼 추가.
--
-- 지금까지 위치(location_id)가 reagents(마스터)에 있어서, 같은 시약을 여러
-- 병으로 나눠 관리할 때 "이 병은 5층 시약장, 저 병은 냉장고" 같은 실제
-- 위치 차이를 표현할 수 없었다. reagent_lots 단위로 위치를 옮겨야
-- "위치별 보기"가 진짜 데이터가 된다.
--
-- status는 폐기 완료된 Lot을 삭제하는 대신 이력을 보존한 채로 표시하기
-- 위한 것 — 지금까지는 폐기 시 reagents 마스터 자체가 archived로 사라져서
-- 재구매하면 새 시약처럼 다시 등록해야 했던 문제의 근본 원인이었다.
--
-- 기존 컬럼/로직은 전혀 건드리지 않는 순수 추가 마이그레이션이라 안전하다.
-- 실제 데이터 이관(reagents.location_id → reagent_lots.location_id, 중복
-- 마스터 병합)은 별도 스크립트로 진행한다.
alter table reagent_lots
  add column if not exists location_id uuid references locations(id),
  add column if not exists status text not null default 'active';

comment on column reagent_lots.location_id is 'Lot(병) 단위 실제 위치. 마이그레이션 전까지는 비어있으며, reagents.location_id가 대신 쓰인다.';
comment on column reagent_lots.status is '''active'' 또는 ''disposed''. 폐기 완료된 Lot은 삭제하지 않고 이 값으로 표시해 이력을 보존한다.';
