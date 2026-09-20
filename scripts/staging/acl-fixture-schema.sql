-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
--
-- Master Finish Phase 3/4 — 20260920100000_least_privilege_acl.sql 검증용 fixture.
-- production에 있는 테이블 중 staging에 없는 것을 "권한 검증에 필요한 최소 모양"으로 만든다.
-- (ACL/RLS 검증이 목적이라 컬럼은 id + v 정도로 충분. 구매요청/재고 관련은 RPC가 쓰는 컬럼을 재현.)
-- production의 legacy 상태(allow all 정책 + 전체 grant)를 흉내내기 위해 생성 직후 allow-all 정책을 심어 둔다.
do $$
declare t text;
begin
  foreach t in array array[
    'lab_rules','safety_briefings','notice_files','calendar_events','label_phrase_template','label_size_rule',
    'signage_master','school_chemical_master','regulation_document','special_material_logs','items','item_lots',
    'item_locations','receipts','stock_history','purchase_requests','reagent_import_history','stock_logs',
    'inventory_sessions','inventory_counts','inventory_assignments','hazard_ledger_notes','fcm_tokens'
  ] loop
    execute format('create table if not exists public.%I (id uuid primary key default gen_random_uuid(), v text)', t);
  end loop;
end $$;

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text, type text, views int default 0, v text
);

create table if not exists public.purchase_request_logs (
  id uuid primary key default gen_random_uuid(),
  requested_by text references public.students(student_id),
  status text default 'pending',
  reject_note text, approved_by text,
  ordered_at timestamptz, tracking_number text, estimated_arrival date, delivered_at timestamptz,
  created_at timestamptz default now()
);
create table if not exists public.purchase_request_reagent_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.purchase_request_logs(id),
  reagent_id uuid, name text, purity text, cas_no text, state text, needed_amount text, usage_place text,
  purchase_reason text, company text, cat_no text, spec text, quantity text, note text
);
create table if not exists public.purchase_request_goods_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.purchase_request_logs(id),
  name text, cat_no text, spec text, quantity numeric, unit_price numeric, shipping_fee numeric, total_price numeric,
  purpose text, note text, link text
);

-- production legacy 흉내: 모든 fixture 테이블에 allow-all 정책 + 전체 grant (migration이 이걸 걷어내는지 검증)
do $$
declare t text;
begin
  foreach t in array array[
    'lab_rules','safety_briefings','notices','notice_files','calendar_events','label_phrase_template','label_size_rule',
    'signage_master','school_chemical_master','regulation_document','special_material_logs','items','item_lots',
    'item_locations','receipts','stock_history','purchase_requests','purchase_request_logs',
    'purchase_request_reagent_items','purchase_request_goods_items','reagent_import_history','stock_logs',
    'inventory_sessions','inventory_counts','inventory_assignments','hazard_ledger_notes','fcm_tokens',
    'admin_logs','reagents','reagent_lots','locations','location_history'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "allow all" on public.%I', t);
    execute format('create policy "allow all" on public.%I for all to public using (true) with check (true)', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;
