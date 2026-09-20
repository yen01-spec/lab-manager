-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- Master Finish Phase 1 — 관리자 리뷰 RPC 테스트용 fixture 보강.
-- inventory-snapshot-fixture-schema.sql / auth·disposal·batch1 fixture 위에 얹는다.
-- production 실제 컬럼과 동일 이름만 추가(add column if not exists).
alter table reagents add column if not exists last_confirmed_at timestamptz;
alter table reagents add column if not exists confirmed_by text;
alter table reagents add column if not exists category text;
alter table reagents add column if not exists manager text;
alter table reagents add column if not exists msds_url text;
alter table reagents add column if not exists notes text;
alter table reagents add column if not exists hazard text;

alter table reagent_lots add column if not exists disposal_date date;

create table if not exists location_history (
  id uuid primary key default gen_random_uuid(),
  reagent_id uuid,
  lot_id uuid,
  reagent_name text,
  from_location_id uuid,
  from_location_name text,
  to_location_id uuid,
  to_location_name text,
  moved_by text,
  notes text,
  created_at timestamptz default now()
);
comment on table location_history is 'STAGING TEST ONLY. Master Finish Phase 1 fixture.';
