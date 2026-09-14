-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- Phase 4b-3b-S2 fixture 초기화. inventory-snapshot-fixture-data.sql이 만든 고정 UUID
-- row만 정확히 삭제(범위 없는 TRUNCATE 아님). inventory_snapshot_syncs/admin_logs는 이
-- staging 프로젝트에서 오직 sync_inventory_snapshot 테스트만 기록을 남기므로 전체 삭제해도
-- 안전하다(다른 정당한 데이터가 있을 수 없음 — 실제 운영 기록이 아님).
delete from inventory_snapshot_syncs;
delete from admin_logs;

delete from reagent_lots where id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000009'
);

-- 테스트 중 생성된 신규 Lot/신규 reagent(고정 UUID 없이 gen_random_uuid()로 생성됨)도
-- 정리 — reagent_id가 fixture 시약이거나, TEST- 접두 lot_no/name을 가진 행만 대상으로
-- 좁혀서 삭제한다(범위 없는 삭제 금지).
delete from reagent_lots where lot_no like 'TEST-%';
delete from reagent_lots where reagent_id in (
  select id from reagents where name like 'TEST %' or name_ko like 'TEST %'
);

delete from reagents where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000007',
  '20000000-0000-0000-0000-000000000008'
);
delete from reagents where name like 'TEST %' or name_ko like 'TEST %';

delete from locations where id in (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);
