-- STAGING TEST ONLY — NEVER APPLY TO PRODUCTION. production 스키마에서 생성(gen-scope-baseline.mjs), 데이터 없음.
-- 범위 테이블을 지우고 production 과 같은 구조로 다시 만든다. (staging guard 통과 후에만 실행)
create or replace function public.update_updated_at()
 returns trigger
 language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
drop table if exists public."students", public."locations", public."reagents", public."reagent_lots", public."location_history", public."location_requests", public."disposal_requests", public."reagent_change_requests", public."stock_history", public."stock_logs", public."reagent_import_history", public."special_material_logs", public."inventory_sessions", public."inventory_assignments", public."inventory_counts", public."admin_logs", public."purchase_request_logs", public."purchase_request_reagent_items", public."purchase_request_goods_items", public."purchase_requests", public."notices", public."notice_files", public."resource_files" cascade;
create table public."students" (
  "student_id" text not null,
  "name" text not null,
  "birth_date" date not null,
  "is_admin" boolean default false not null,
  "password_hash" text,
  "created_at" timestamp with time zone default now() not null,
  "is_super" boolean default false not null,
  constraint "students_pkey" PRIMARY KEY (student_id)
);
create table public."locations" (
  "id" uuid default gen_random_uuid() not null,
  "room" text not null,
  "detail" text,
  constraint "locations_pkey" PRIMARY KEY (id)
);
alter table public."locations" enable row level security;
create table public."reagents" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "cas_no" text,
  "company" text,
  "hazard" text,
  "category" text,
  "volume" numeric,
  "unit" text,
  "location_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "msds_url" text,
  "manager" text,
  "data_source" text default 'manual'::text,
  "cas_source" text default 'manual'::text,
  "hazard_source" text default 'manual'::text,
  "msds_source" text default 'manual'::text,
  "manager_source" text default 'manual'::text,
  "company_source" text default 'manual'::text,
  "category_source" text default 'manual'::text,
  "volume_source" text default 'manual'::text,
  "notes_source" text default 'manual'::text,
  "last_confirmed_at" timestamp with time zone,
  "confirmed_by" text,
  "reagent_type" text default 'purchased'::text not null,
  "made_date" date,
  "made_purpose" text,
  "status" text default 'active'::text not null,
  "registered_by" text,
  "pending_confirm" boolean default false not null,
  "purity" text,
  "ghs_pictograms" text,
  "hazard_classifications" jsonb,
  "is_yudok" text,
  "cas_verification_status" text,
  "cas_verification_note" text,
  "name_ko" text,
  "sort_letter" text,
  constraint "reagents_reagent_type_check" CHECK ((reagent_type = ANY (ARRAY['purchased'::text, 'self_made'::text]))),
  constraint "reagents_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
  constraint "reagents_pkey" PRIMARY KEY (id)
);
create index if not exists "reagents_pi0_idx" on public.reagents USING btree (location_id);
create index if not exists "reagents_pi1_idx" on public.reagents USING btree (name);
create index if not exists "reagents_pi2_idx" on public.reagents USING btree (reagent_type);
create index if not exists "reagents_pi3_idx" on public.reagents USING btree (status);
create trigger "reagents_pt0" BEFORE UPDATE ON public.reagents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
alter table public."reagents" enable row level security;
create table public."reagent_lots" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid not null,
  "lot_no" text,
  "sealed_count" integer default 0 not null,
  "current_stock" integer default 100 not null,
  "expiry_date" date,
  "received_date" date,
  "disposal_date" date,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "opened_date" date,
  "lot_source" text default 'manual'::text,
  "location_id" uuid,
  "status" text default 'active'::text not null,
  "needs_review" boolean default false not null,
  "review_note" text,
  "pending_confirm" boolean default false not null,
  "cat_no" text,
  "shelf_position" text,
  "registered_by_name" text,
  "needs_action" boolean default false not null,
  "action_note" text,
  constraint "reagent_lots_current_stock_check" CHECK (((current_stock >= 0) AND (current_stock <= 100))),
  constraint "reagent_lots_sealed_count_check" CHECK ((sealed_count >= 0)),
  constraint "reagent_lots_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'used_up'::text, 'disposed'::text, 'missing'::text, 'not_in_snapshot'::text]))),
  constraint "reagent_lots_pkey" PRIMARY KEY (id)
);
create index if not exists "reagent_lots_pi0_idx" on public.reagent_lots USING btree (reagent_id);
create trigger "reagent_lots_pt0" BEFORE UPDATE ON public.reagent_lots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
alter table public."reagent_lots" enable row level security;
create table public."location_history" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "reagent_name" text,
  "from_location_id" uuid,
  "from_location_name" text,
  "to_location_id" uuid,
  "to_location_name" text,
  "moved_by" text,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "lot_id" uuid,
  constraint "location_history_pkey" PRIMARY KEY (id)
);
alter table public."location_history" enable row level security;
create table public."location_requests" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "reagent_name" text,
  "from_location_id" uuid,
  "from_location_name" text,
  "to_location_id" uuid,
  "to_location_name" text,
  "requested_by" text,
  "status" text default 'pending'::text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "lot_id" uuid,
  constraint "location_requests_pkey" PRIMARY KEY (id)
);
alter table public."location_requests" enable row level security;
create table public."disposal_requests" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "lot_id" uuid,
  "reagent_name" text,
  "lot_no" text,
  "quantity" text,
  "reason" text,
  "requested_by" text,
  "status" text default 'pending'::text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "disposed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "requested_by_student_id" text,
  "approved_by_student_id" text,
  constraint "disposal_requests_pkey" PRIMARY KEY (id)
);
alter table public."disposal_requests" enable row level security;
create table public."reagent_change_requests" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "requested_by" text not null,
  "field_name" text not null,
  "old_value" text,
  "new_value" text not null,
  "status" text default 'pending'::text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "requested_by_student_id" text,
  "approved_by_student_id" text,
  constraint "reagent_change_requests_pkey" PRIMARY KEY (id)
);
create table public."stock_history" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "lot_id" uuid,
  "reagent_name" text,
  "action" text,
  "quantity" numeric,
  "unit" text,
  "before_stock" numeric,
  "after_stock" numeric,
  "user_name" text,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  constraint "stock_history_pkey" PRIMARY KEY (id)
);
alter table public."stock_history" enable row level security;
create table public."stock_logs" (
  "id" uuid default gen_random_uuid() not null,
  "target_type" text not null,
  "lot_id" uuid not null,
  "user_name" text not null,
  "before_sealed" integer,
  "after_sealed" integer,
  "before_stock" integer,
  "after_stock" integer,
  "notes" text,
  "changed_at" timestamp with time zone default now(),
  "created_at" timestamp with time zone default now() not null,
  constraint "stock_logs_target_type_check" CHECK ((target_type = ANY (ARRAY['reagent'::text, 'item'::text]))),
  constraint "stock_logs_pkey" PRIMARY KEY (id)
);
alter table public."stock_logs" enable row level security;
create table public."reagent_import_history" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "source" text not null,
  "category" text,
  "field_name" text,
  "old_value" text,
  "new_value" text,
  "note" text,
  "location_text" text,
  "occurred_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "reagent_import_history_source_check" CHECK ((source = ANY (ARRAY['수정이력'::text, '검토의견'::text]))),
  constraint "reagent_import_history_pkey" PRIMARY KEY (id)
);
create index if not exists "reagent_import_history_pi0_idx" on public.reagent_import_history USING btree (reagent_id);
alter table public."reagent_import_history" enable row level security;
create table public."special_material_logs" (
  "id" uuid default gen_random_uuid() not null,
  "reagent_id" uuid,
  "substance_name" text not null,
  "cas_no" text,
  "handling_date" date not null,
  "amount" text,
  "work_description" text,
  "ppe_worn" text,
  "incident_details" text,
  "handler_student_id" text,
  "handler_name" text not null,
  "confirmed_by_student_id" text,
  "confirmed_by_name" text,
  "confirmed_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "initial_amount" text,
  "deleted_at" timestamp with time zone,
  "deleted_by_student_id" text,
  "deleted_by_name" text,
  "delete_reason" text,
  constraint "special_material_logs_pkey" PRIMARY KEY (id)
);
create index if not exists "special_material_logs_pi0_idx" on public.special_material_logs USING btree (handling_date);
create index if not exists "special_material_logs_pi1_idx" on public.special_material_logs USING btree (reagent_id);
create sequence if not exists public.inventory_sessions_id_seq;
create table public."inventory_sessions" (
  "id" bigint default nextval('inventory_sessions_id_seq'::regclass) not null,
  "year" integer not null,
  "start_date" date not null,
  "status" text default 'active'::text,
  "created_by" text not null,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "paused_at" timestamp with time zone,
  "paused_by" text,
  "label" text,
  "purpose" text default 'current_list'::text not null,
  "zones" text[],
  constraint "inventory_sessions_purpose_check" CHECK ((purpose = ANY (ARRAY['full_census'::text, 'current_list'::text]))),
  constraint "inventory_sessions_pkey" PRIMARY KEY (id)
);
alter sequence public.inventory_sessions_id_seq owned by public."inventory_sessions"."id";
create sequence if not exists public.inventory_assignments_id_seq;
create table public."inventory_assignments" (
  "id" bigint default nextval('inventory_assignments_id_seq'::regclass) not null,
  "session_id" bigint,
  "zone" text not null,
  "assigned_to" text not null,
  "status" text default 'pending'::text,
  "created_at" timestamp with time zone default now(),
  "completed_at" timestamp with time zone,
  "assigned_student_id" text,
  constraint "inventory_assignments_pkey" PRIMARY KEY (id)
);
alter sequence public.inventory_assignments_id_seq owned by public."inventory_assignments"."id";
create sequence if not exists public.inventory_counts_id_seq;
create table public."inventory_counts" (
  "id" bigint default nextval('inventory_counts_id_seq'::regclass) not null,
  "session_id" bigint,
  "reagent_id" uuid,
  "lot_id" uuid,
  "book_sealed" integer,
  "book_stock" integer,
  "actual_sealed" integer,
  "actual_stock" integer,
  "counted_by" text,
  "counted_at" timestamp with time zone,
  "is_locked" boolean default false,
  "lock_by" text,
  "created_at" timestamp with time zone default now(),
  "counted_by_student_id" text,
  "reported_missing" boolean default false not null,
  "abnormal_note" text,
  "is_new_registration" boolean default false not null,
  "staged_location_id" uuid,
  "book_status" text,
  "book_location_id" uuid,
  "staged_reagent_fields" jsonb,
  "book_reagent_fields" jsonb,
  "staged_lot_fields" jsonb,
  "book_lot_fields" jsonb,
  constraint "inventory_counts_pkey" PRIMARY KEY (id),
  constraint "inventory_counts_session_id_lot_id_key" UNIQUE (session_id, lot_id)
);
alter sequence public.inventory_counts_id_seq owned by public."inventory_counts"."id";
create index if not exists "inventory_counts_pi0_idx" on public.inventory_counts USING btree (lot_id);
create index if not exists "inventory_counts_pi1_idx" on public.inventory_counts USING btree (session_id);
create sequence if not exists public.admin_logs_id_seq;
create table public."admin_logs" (
  "id" bigint default nextval('admin_logs_id_seq'::regclass) not null,
  "admin_name" text not null,
  "action" text not null,
  "target_type" text,
  "target_id" bigint,
  "description" text,
  "created_at" timestamp with time zone default now(),
  constraint "admin_logs_pkey" PRIMARY KEY (id)
);
alter sequence public.admin_logs_id_seq owned by public."admin_logs"."id";
alter table public."admin_logs" enable row level security;
create table public."purchase_request_logs" (
  "id" uuid default gen_random_uuid() not null,
  "requested_by" text,
  "note" text,
  "created_at" timestamp with time zone default now() not null,
  "status" text default 'pending'::text not null,
  "reject_note" text,
  "approved_by" text,
  "ordered_at" timestamp with time zone,
  "tracking_number" text,
  "estimated_arrival" date,
  "delivered_at" timestamp with time zone,
  constraint "purchase_request_logs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'ordered'::text, 'delivered'::text, 'done'::text]))),
  constraint "purchase_request_logs_pkey" PRIMARY KEY (id)
);
create table public."purchase_request_reagent_items" (
  "id" uuid default gen_random_uuid() not null,
  "request_id" uuid not null,
  "reagent_id" uuid,
  "name" text not null,
  "company" text,
  "cas_no" text,
  "cat_no" text,
  "state" text,
  "spec" text,
  "quantity" text,
  "purpose" text,
  "note" text,
  "needed_amount" text,
  "usage_place" text,
  "purchase_reason" text,
  "purity" text,
  constraint "purchase_request_reagent_items_pkey" PRIMARY KEY (id)
);
create index if not exists "purchase_request_reagent_items_pi0_idx" on public.purchase_request_reagent_items USING btree (request_id);
create table public."purchase_request_goods_items" (
  "id" uuid default gen_random_uuid() not null,
  "request_id" uuid not null,
  "name" text not null,
  "spec" text,
  "quantity" numeric,
  "unit_price" numeric,
  "shipping_fee" numeric,
  "total_price" numeric,
  "note" text,
  "link" text,
  "purpose" text,
  "cat_no" text,
  constraint "purchase_request_goods_items_pkey" PRIMARY KEY (id)
);
create index if not exists "purchase_request_goods_items_pi0_idx" on public.purchase_request_goods_items USING btree (request_id);
create table public."purchase_requests" (
  "id" uuid default gen_random_uuid() not null,
  "user_name" text not null,
  "target_type" text not null,
  "target_id" uuid,
  "target_name" text,
  "quantity" text,
  "reason" text,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "reject_note" text,
  "ordered_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "tracking_number" text,
  "estimated_arrival" date,
  "cas_no" text,
  "company" text,
  "product_name" text,
  "product_volume" text,
  "unit_price" text,
  "shipping_cost" text,
  "total_price" text,
  "product_link" text,
  "usage_place" text,
  "purpose" text,
  "spec" text,
  "notes" text,
  constraint "purchase_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'done'::text]))),
  constraint "purchase_requests_target_type_check" CHECK ((target_type = ANY (ARRAY['reagent'::text, 'item'::text, 'new'::text]))),
  constraint "purchase_requests_pkey" PRIMARY KEY (id)
);
create trigger "purchase_requests_pt0" BEFORE UPDATE ON public.purchase_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
alter table public."purchase_requests" enable row level security;
create table public."notices" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "content" text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "type" text default 'notice'::text,
  "file_url" text,
  "file_name" text,
  "views" integer default 0,
  constraint "notices_pkey" PRIMARY KEY (id)
);
create trigger "notices_pt0" BEFORE UPDATE ON public.notices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
alter table public."notices" enable row level security;
create table public."notice_files" (
  "id" uuid default gen_random_uuid() not null,
  "notice_id" uuid,
  "file_url" text not null,
  "file_name" text not null,
  "file_size" bigint,
  "created_at" timestamp with time zone default now(),
  constraint "notice_files_pkey" PRIMARY KEY (id)
);
alter table public."notice_files" enable row level security;
create table public."resource_files" (
  "id" uuid default gen_random_uuid() not null,
  "category_key" text not null,
  "section_key" text not null,
  "resource_key" text,
  "title" text not null,
  "resource_type" text not null,
  "issuer" text,
  "revision_date" date,
  "effective_date" date,
  "version_label" text,
  "is_current" boolean default true not null,
  "storage_path" text not null,
  "file_url" text,
  "original_filename" text,
  "mime_type" text,
  "sort_order" integer default 0 not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "resource_files_resource_type_check" CHECK ((resource_type = ANY (ARRAY['form'::text, 'official'::text, 'reference'::text]))),
  constraint "resource_files_pkey" PRIMARY KEY (id)
);
create index if not exists "resource_files_pi0_idx" on public.resource_files USING btree (category_key, section_key, is_current, sort_order);
create UNIQUE index if not exists "resource_files_pi1_idx" on public.resource_files USING btree (category_key, section_key, resource_key) WHERE (is_current AND (resource_key IS NOT NULL));
alter table public."resource_files" enable row level security;
-- FK (범위 안 테이블끼리 + production FK 그대로)
alter table public."reagents" add constraint "reagents_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES students(student_id);
alter table public."reagents" add constraint "reagents_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;
alter table public."reagents" add constraint "reagents_registered_by_fkey" FOREIGN KEY (registered_by) REFERENCES students(student_id);
alter table public."reagent_lots" add constraint "reagent_lots_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
alter table public."reagent_lots" add constraint "reagent_lots_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id) ON DELETE CASCADE;
alter table public."location_history" add constraint "location_history_from_location_id_fkey" FOREIGN KEY (from_location_id) REFERENCES locations(id);
alter table public."location_history" add constraint "location_history_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES reagent_lots(id);
alter table public."location_history" add constraint "location_history_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."location_history" add constraint "location_history_to_location_id_fkey" FOREIGN KEY (to_location_id) REFERENCES locations(id);
alter table public."location_requests" add constraint "location_requests_from_location_id_fkey" FOREIGN KEY (from_location_id) REFERENCES locations(id);
alter table public."location_requests" add constraint "location_requests_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES reagent_lots(id);
alter table public."location_requests" add constraint "location_requests_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."location_requests" add constraint "location_requests_to_location_id_fkey" FOREIGN KEY (to_location_id) REFERENCES locations(id);
alter table public."disposal_requests" add constraint "disposal_requests_approved_by_student_id_fkey" FOREIGN KEY (approved_by_student_id) REFERENCES students(student_id);
alter table public."disposal_requests" add constraint "disposal_requests_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES reagent_lots(id);
alter table public."disposal_requests" add constraint "disposal_requests_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."disposal_requests" add constraint "disposal_requests_requested_by_student_id_fkey" FOREIGN KEY (requested_by_student_id) REFERENCES students(student_id);
alter table public."reagent_change_requests" add constraint "reagent_change_requests_approved_by_student_id_fkey" FOREIGN KEY (approved_by_student_id) REFERENCES students(student_id);
alter table public."reagent_change_requests" add constraint "reagent_change_requests_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id) ON DELETE CASCADE;
alter table public."reagent_change_requests" add constraint "reagent_change_requests_requested_by_student_id_fkey" FOREIGN KEY (requested_by_student_id) REFERENCES students(student_id);
alter table public."stock_history" add constraint "stock_history_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES reagent_lots(id);
alter table public."stock_history" add constraint "stock_history_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."reagent_import_history" add constraint "reagent_import_history_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id) ON DELETE CASCADE;
alter table public."special_material_logs" add constraint "special_material_logs_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."inventory_assignments" add constraint "inventory_assignments_assigned_student_id_fkey" FOREIGN KEY (assigned_student_id) REFERENCES students(student_id);
alter table public."inventory_assignments" add constraint "inventory_assignments_session_id_fkey" FOREIGN KEY (session_id) REFERENCES inventory_sessions(id);
alter table public."inventory_counts" add constraint "inventory_counts_book_location_id_fkey" FOREIGN KEY (book_location_id) REFERENCES locations(id);
alter table public."inventory_counts" add constraint "inventory_counts_counted_by_student_id_fkey" FOREIGN KEY (counted_by_student_id) REFERENCES students(student_id);
alter table public."inventory_counts" add constraint "inventory_counts_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES reagent_lots(id);
alter table public."inventory_counts" add constraint "inventory_counts_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."inventory_counts" add constraint "inventory_counts_session_id_fkey" FOREIGN KEY (session_id) REFERENCES inventory_sessions(id);
alter table public."inventory_counts" add constraint "inventory_counts_staged_location_id_fkey" FOREIGN KEY (staged_location_id) REFERENCES locations(id);
alter table public."purchase_request_logs" add constraint "purchase_request_logs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES students(student_id);
alter table public."purchase_request_reagent_items" add constraint "purchase_request_reagent_items_reagent_id_fkey" FOREIGN KEY (reagent_id) REFERENCES reagents(id);
alter table public."purchase_request_reagent_items" add constraint "purchase_request_reagent_items_request_id_fkey" FOREIGN KEY (request_id) REFERENCES purchase_request_logs(id) ON DELETE CASCADE;
alter table public."purchase_request_goods_items" add constraint "purchase_request_goods_items_request_id_fkey" FOREIGN KEY (request_id) REFERENCES purchase_request_logs(id) ON DELETE CASCADE;
alter table public."notice_files" add constraint "notice_files_notice_id_fkey" FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE;
-- 범위 밖 테이블 → 범위 안 테이블 FK 복구(테이블이 있을 때만)
do $$ begin if to_regclass('public.items') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'items' and column_name = 'location_id') and not exists (select 1 from pg_constraint where conname = 'items_location_id_fkey' and conrelid = 'public.items'::regclass) then alter table public."items" add constraint "items_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL; end if; end $$;
