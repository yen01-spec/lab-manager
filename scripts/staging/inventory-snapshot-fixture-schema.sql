-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- Phase 4b-3b-S1 — staging(vvafhcqypvejvsuksooi) 전용 최소 baseline schema.
--
-- 목적: supabase/migrations/20260914090000_inventory_snapshot_sync.sql(sync_inventory_snapshot
-- RPC)이 실제 PostgreSQL에서 생성되고 transaction 테스트가 가능하도록, 그 migration이 직접
-- 참조하는 object만 최소 재현한다. 앱 전체 schema를 재현하지 않는다.
--
-- production(ylvebibsevesazntalos)의 실제 데이터/Auth 사용자/기타 테이블은 전혀 건드리지
-- 않는다 — 이 파일은 오직 staging DB에 `supabase db query --linked --file ...`로만 실행한다.
-- `supabase/migrations/`에는 넣지 않는다(향후 production db push 대상이 되면 안 됨).
--
-- 컬럼/타입/constraint는 Phase 4b-1 조사와 inventory migration이 실제로 읽고 쓰는 필드만
-- 반영했다 — production을 "더 깨끗하게" 만드는 임의 constraint(cas_no UNIQUE, lot_no UNIQUE,
-- (reagent_id, lot_no) UNIQUE 등)는 절대 추가하지 않는다(production엔 실제로 중복 CAS/Lot No.가
-- 존재하므로 이런 제약을 넣으면 RPC 테스트 의미가 달라진다).


-- ════════════════════════════════════════════════════════════════
-- 1) locations — RPC는 존재 여부(id)만 확인하지만, S2에서 만들 fixture
--    위치(TEST-ROOM-A 등)가 실제 앱 화면과 같은 모양이 되도록 room/detail도 둔다.
-- ════════════════════════════════════════════════════════════════
create table if not exists locations (
  id         uuid primary key default gen_random_uuid(),
  room       text,
  detail     text,
  created_at timestamptz not null default now()
);
comment on table locations is 'STAGING TEST ONLY. Phase 4b-3b-S1 최소 fixture — production 14개 위치 데이터는 복사하지 않음(S2에서 TEST-ROOM-A/B 등 가짜 위치를 별도 생성).';


-- ════════════════════════════════════════════════════════════════
-- 2) reagents — RPC의 INSERT 컬럼 목록(§9, snapshot_new_reagents 삽입부)과
--    foundation migration의 reagent_type/status check를 그대로 반영.
--    RPC가 쓰지 않는 컬럼(last_confirmed_at/confirmed_by/made_date/made_purpose/
--    registered_by/pending_confirm 등)은 의도적으로 생략(최소 baseline 원칙, §5).
-- ════════════════════════════════════════════════════════════════
create table if not exists reagents (
  id             uuid primary key default gen_random_uuid(),
  name           text,
  name_ko        text,
  cas_no         text,
  company        text,
  purity         text,
  volume         numeric,
  unit           text,
  reagent_type   text not null default 'purchased'
    check (reagent_type in ('purchased', 'self_made')),
  status         text not null default 'active'
    check (status in ('active', 'archived')),
  data_source    text,
  cas_source     text,
  company_source text,
  volume_source  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table reagents is 'STAGING TEST ONLY. Phase 4b-3b-S1 최소 fixture — sync_inventory_snapshot RPC가 실제로 읽고 쓰는 컬럼만. cas_no에 UNIQUE 없음(production과 동일 — 의도적).';


-- ════════════════════════════════════════════════════════════════
-- 3) reagent_lots — RPC가 실제로 SELECT/UPDATE/INSERT하는 컬럼만(§9).
--    status check는 "inventory migration 적용 전 production 상태"와 동일하게
--    not_in_snapshot 없이 시작한다 — not_in_snapshot 추가는 4b migration
--    자신의 역할이므로(§9의 A절), 이 fixture가 미리 넣지 않는다. 그래야
--    17단계에서 migration을 실제 실행했을 때 그 DROP/ADD CONSTRAINT 문이
--    production과 동일한 "무언가를 바꾸는" 동작을 하는지까지 검증된다.
-- ════════════════════════════════════════════════════════════════
create table if not exists reagent_lots (
  id             uuid primary key default gen_random_uuid(),
  reagent_id     uuid not null references reagents(id),
  lot_no         text,
  lot_source     text,
  cat_no         text,
  sealed_count   integer not null default 0
    check (sealed_count >= 0),
  current_stock  integer not null default 0
    check (current_stock >= 0 and current_stock <= 100),
  location_id    uuid references locations(id),
  shelf_position text,
  status         text not null default 'active'
    check (status in ('active', 'used_up', 'disposed', 'missing')),
  needs_review   boolean not null default false,
  received_date  date,
  expiry_date    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table reagent_lots is 'STAGING TEST ONLY. Phase 4b-3b-S1 최소 fixture — status check는 not_in_snapshot 없이 시작(4b migration이 이를 추가하는 것 자체를 검증 대상으로 둠). lot_no/​(reagent_id,lot_no)에 UNIQUE 없음(production과 동일 — 의도적).';


-- ════════════════════════════════════════════════════════════════
-- 4) admin_users + public.is_admin() — 20260913100000_resource_files_rls.sql의
--    정의를 그대로 재사용(§11, 새 구현 임의 작성 금지). auth.users는 staging
--    프로젝트에 Supabase Auth로 이미 존재하므로 별도 CREATE하지 않는다.
-- ════════════════════════════════════════════════════════════════
create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
comment on table admin_users is 'STAGING TEST ONLY. 20260913100000_resource_files_rls.sql의 정의를 그대로 재사용.';

alter table admin_users enable row level security;
drop policy if exists admin_users_self_select on admin_users;
create policy admin_users_self_select on admin_users
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and active
  );
$$;
comment on function public.is_admin() is 'STAGING TEST ONLY. 20260913100000_resource_files_rls.sql과 동일 정의(재사용).';
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- 5) admin_logs — RPC가 §16에서 INSERT하는 컬럼만(admin_name/action/target_type/
--    description). 앱 전체 관리자 작업기록 화면 스키마는 재현하지 않는다(§10).
-- ════════════════════════════════════════════════════════════════
create table if not exists admin_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_name  text,
  action      text,
  target_type text,
  description text,
  created_at  timestamptz not null default now()
);
comment on table admin_logs is 'STAGING TEST ONLY. Phase 4b-3b-S1 최소 fixture — sync_inventory_snapshot RPC가 INSERT하는 컬럼만.';


-- ════════════════════════════════════════════════════════════════
-- 6) updated_at 자동 갱신 — Phase 4b-3a.1에서 확인한 production 정의와 동일한
--    의미(NEW.updated_at = now(); return new)로 재현(§12). reagents/reagent_lots
--    둘 다 BEFORE UPDATE 트리거를 걸어야 RPC의 optimistic lock
--    (updated_at is distinct from expected_*_updated_at) 테스트가 production과
--    같은 의미를 가진다.
-- ════════════════════════════════════════════════════════════════
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
comment on function public.update_updated_at() is 'STAGING TEST ONLY. Phase 4b-3a.1에서 확인한 production 정의와 동일한 의미로 재현.';

drop trigger if exists set_updated_at on reagents;
create trigger set_updated_at
  before update on reagents
  for each row execute function public.update_updated_at();

drop trigger if exists set_updated_at on reagent_lots;
create trigger set_updated_at
  before update on reagent_lots
  for each row execute function public.update_updated_at();
