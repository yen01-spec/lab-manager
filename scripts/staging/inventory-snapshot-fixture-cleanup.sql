-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- Phase 4b-3b-S1 fixture 전체 제거. inventory-snapshot-fixture-schema.sql +
-- supabase/migrations/20260914090000_inventory_snapshot_sync.sql이 staging에
-- 만든 모든 object를 역순으로 삭제한다.
--
-- 이번 Phase가 성공하면 실행하지 않는다(§23 — 다음 fixture 테스트를 위해 schema
-- 유지). 재구성이 필요할 때만, 그리고 staging(vvafhcqypvejvsuksooi)에만 실행한다.

drop function if exists public.sync_inventory_snapshot(jsonb);
drop table if exists inventory_snapshot_syncs;

drop trigger if exists set_updated_at on reagent_lots;
drop trigger if exists set_updated_at on reagents;
drop function if exists public.update_updated_at();

drop table if exists admin_logs;

drop function if exists public.is_admin();
drop policy if exists admin_users_self_select on admin_users;
drop table if exists admin_users;

drop table if exists reagent_lots;
drop table if exists reagents;
drop table if exists locations;
