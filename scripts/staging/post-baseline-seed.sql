-- STAGING TEST ONLY — NEVER APPLY TO PRODUCTION
-- production-baseline-scope.sql 이 범위 테이블을 재생성한 직후에 넣는 최소 시드(테스트 신원/대상 병).
insert into students (student_id, name, birth_date, is_admin) values
  ('TEST-STU-0001', 'TEST Student One', '2000-01-01', false),
  ('TEST-STU-0002', 'TEST Student Two', '2001-02-02', false)
on conflict (student_id) do nothing;

-- reagent_change_request_submit / location_request_submit / disposal_request_submit 검증용 시약 1건 + 병 1개 + 위치 2곳
insert into reagents (id, name, name_ko, reagent_type, status, data_source) values
  ('40000000-0000-0000-0000-000000000001', 'TEST Batch1 Reagent', 'TEST 배치1 시약', 'purchased', 'active', 'manual')
on conflict (id) do nothing;
insert into locations (id, room, detail) values
  ('40000000-0000-0000-0000-0000000000b1', 'TEST-B1-ROOM', 'Shelf-1'),
  ('40000000-0000-0000-0000-0000000000b2', 'TEST-B1-ROOM', 'Shelf-2')
on conflict (id) do nothing;
insert into reagent_lots (id, reagent_id, lot_no, sealed_count, current_stock, location_id, status) values
  ('40000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'TEST-B1-LOT', 0, 50, '40000000-0000-0000-0000-0000000000b1', 'active')
on conflict (id) do update set status = 'active', location_id = excluded.location_id, current_stock = 50, sealed_count = 0;
