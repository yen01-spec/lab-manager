-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- Phase 4b-3b-S2 — sync_inventory_snapshot RPC 실제 transaction 테스트용 fixture 데이터.
-- 고정 UUID를 써서 재실행/재현이 가능하게 한다(inventory-snapshot-fixture-reset.sql로
-- 삭제 후 이 파일을 다시 실행하면 항상 같은 시작 상태로 복원됨).
--
-- 이름/Lot No.에 전부 TEST- 접두어를 붙여 실제 연구실 데이터와 구분한다.

-- ── 위치 2개 ──────────────────────────────────────────────────
insert into locations (id, room, detail) values
  ('10000000-0000-0000-0000-000000000001', 'TEST-ROOM-A', 'Cabinet-A'),
  ('10000000-0000-0000-0000-000000000002', 'TEST-ROOM-B', 'Cabinet-B')
on conflict (id) do nothing;

-- ── 시약 8종 ──────────────────────────────────────────────────
-- A: company 있음, active (active Lot 2개)
-- B: active (active Lot 1개)
-- C: archived (Lot 1개, not_in_snapshot — 재활성화 테스트용)
-- D: archived (Lot 1개, disposed — 차단 테스트용)
-- E: archived (Lot 1개, used_up — 차단 테스트용)
-- F: archived (Lot 1개, missing — 차단 테스트용)
-- G: company NULL, active (fill_if_empty 정상 케이스)
-- H: company 있음, active (fill_if_empty 충돌 케이스)
insert into reagents (id, name, name_ko, company, purity, volume, unit, reagent_type, status, data_source) values
  ('20000000-0000-0000-0000-000000000001', 'TEST Reagent A', 'TEST 시약 A', 'TEST-COMPANY-A', '95%', 500, 'mL', 'purchased', 'active', 'manual'),
  ('20000000-0000-0000-0000-000000000002', 'TEST Reagent B', 'TEST 시약 B', 'TEST-COMPANY-B', '99%', 500, 'g',  'purchased', 'active', 'manual'),
  ('20000000-0000-0000-0000-000000000003', 'TEST Reagent C', 'TEST 시약 C', 'TEST-COMPANY-C', '98%', 500, 'g',  'purchased', 'archived', 'manual'),
  ('20000000-0000-0000-0000-000000000004', 'TEST Reagent D', 'TEST 시약 D', 'TEST-COMPANY-D', '98%', 500, 'g',  'purchased', 'archived', 'manual'),
  ('20000000-0000-0000-0000-000000000005', 'TEST Reagent E', 'TEST 시약 E', 'TEST-COMPANY-E', '98%', 500, 'g',  'purchased', 'archived', 'manual'),
  ('20000000-0000-0000-0000-000000000006', 'TEST Reagent F', 'TEST 시약 F', 'TEST-COMPANY-F', '98%', 500, 'g',  'purchased', 'archived', 'manual'),
  ('20000000-0000-0000-0000-000000000007', 'TEST Reagent G', 'TEST 시약 G', null,              '97%', 500, 'mL', 'purchased', 'active', 'manual'),
  ('20000000-0000-0000-0000-000000000008', 'TEST Reagent H', 'TEST 시약 H', 'TEST-EXISTING',   '97%', 500, 'mL', 'purchased', 'active', 'manual')
on conflict (id) do nothing;

-- ── Lot 9개 ───────────────────────────────────────────────────
insert into reagent_lots (id, reagent_id, lot_no, lot_source, current_stock, sealed_count, location_id, status) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'TEST-A1', 'manufacturer', 60, 0, '10000000-0000-0000-0000-000000000001', 'active'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'TEST-A2', 'manufacturer', 0,  1, '10000000-0000-0000-0000-000000000001', 'active'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'TEST-B1', 'manufacturer', 50, 0, '10000000-0000-0000-0000-000000000001', 'active'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'TEST-C1', 'manufacturer', 20, 0, '10000000-0000-0000-0000-000000000001', 'not_in_snapshot'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000004', 'TEST-D1', 'manufacturer', 0,  0, '10000000-0000-0000-0000-000000000001', 'disposed'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000005', 'TEST-E1', 'manufacturer', 0,  0, '10000000-0000-0000-0000-000000000001', 'used_up'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000006', 'TEST-F1', 'manufacturer', 10, 0, '10000000-0000-0000-0000-000000000001', 'missing'),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000007', 'TEST-G1', 'manufacturer', 40, 0, '10000000-0000-0000-0000-000000000002', 'active'),
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000008', 'TEST-H1', 'manufacturer', 40, 0, '10000000-0000-0000-0000-000000000002', 'active')
on conflict (id) do nothing;
