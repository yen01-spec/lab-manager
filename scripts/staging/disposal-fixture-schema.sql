-- STAGING TEST ONLY
-- NEVER APPLY TO PRODUCTION
-- NOT A PRODUCTION MIGRATION
create table if not exists disposal_requests (
  id uuid primary key default gen_random_uuid(),
  reagent_id uuid,
  lot_id uuid,
  reagent_name text,
  lot_no text,
  quantity text,
  reason text,
  requested_by text,
  status text default 'pending',
  approved_by text,
  approved_at timestamptz,
  disposed_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  requested_by_student_id text,
  approved_by_student_id text
);
comment on table disposal_requests is 'STAGING TEST ONLY. Phase S-RLS2 fixture — production 실제 schema와 동일(read-only 확인 완료).';
