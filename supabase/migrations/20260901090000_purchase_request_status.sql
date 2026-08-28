-- 구매요청서(다건 항목) 요청 단위 승인/발주 상태 추적 — 기존 purchase_requests(단건)의
-- pending/approved/rejected/ordered/delivered/done 흐름과 동일한 어휘를 사용.
alter table purchase_request_logs
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'ordered', 'delivered', 'done')),
  add column if not exists reject_note text,
  add column if not exists approved_by text,
  add column if not exists ordered_at timestamptz,
  add column if not exists tracking_number text,
  add column if not exists estimated_arrival date,
  add column if not exists delivered_at timestamptz;
