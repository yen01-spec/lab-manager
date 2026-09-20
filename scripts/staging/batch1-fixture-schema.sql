-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
create table if not exists reagent_change_requests (
  id uuid primary key default gen_random_uuid(),
  reagent_id uuid,
  requested_by text not null,
  field_name text not null,
  old_value text,
  new_value text not null,
  status text default 'pending',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now(),
  requested_by_student_id text,
  approved_by_student_id text
);
comment on table reagent_change_requests is 'STAGING TEST ONLY. Phase S-RLS3 fixture — production 실제 schema와 동일.';

create table if not exists location_requests (
  id uuid primary key default gen_random_uuid(),
  reagent_id uuid,
  reagent_name text,
  from_location_id uuid,
  from_location_name text,
  to_location_id uuid,
  to_location_name text,
  requested_by text,
  status text default 'pending',
  approved_by text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  lot_id uuid
);
comment on table location_requests is 'STAGING TEST ONLY. Phase S-RLS3 fixture — production 실제 schema와 동일.';

-- reagent_change_request_submit의 존재 검증용 최소 reagent 1건(reagents 테이블은
-- inventory-snapshot-fixture-schema.sql이 이미 만들어둠 — 여기서는 row만 추가).
insert into reagents (id, name, name_ko, reagent_type, status, data_source) values
  ('40000000-0000-0000-0000-000000000001', 'TEST Batch1 Reagent', 'TEST 배치1 시약', 'purchased', 'active', 'manual')
on conflict (id) do nothing;


-- 병 단위 요청 RPC 검증용: 위치 2곳 + 활성 병 1개 (location_request_submit / disposal_request_submit 의 대상)
insert into locations (id, room, detail) values
  ('40000000-0000-0000-0000-0000000000b1', 'TEST-B1-ROOM', 'Shelf-1'),
  ('40000000-0000-0000-0000-0000000000b2', 'TEST-B1-ROOM', 'Shelf-2')
on conflict (id) do nothing;
insert into reagent_lots (id, reagent_id, lot_no, sealed_count, current_stock, location_id, status) values
  ('40000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'TEST-B1-LOT', 0, 50, '40000000-0000-0000-0000-0000000000b1', 'active')
on conflict (id) do update set status = 'active', location_id = excluded.location_id, current_stock = 50, sealed_count = 0;
