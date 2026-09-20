-- READ ONLY. Master Finish Phase 17 — production 최종 상태 확인(SELECT/catalog 만).
select jsonb_build_object(
  'reagents', (select count(*) from reagents),
  'reagent_lots_total', (select count(*) from reagent_lots),
  'reagent_lots_by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from reagent_lots group by status) s),
  'locations', (select count(*) from locations),
  'inventory_snapshot_syncs', (select count(*) from inventory_snapshot_syncs),
  'admin_logs_total', (select count(*) from admin_logs),
  'admin_logs_sync_rows', (select count(*) from admin_logs where action ilike '%동기화%' or action ilike '%snapshot%' or target_type = 'inventory_snapshot'),
  'security_functions_present', (select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and proname in ('student_check_login','student_register','student_session_refresh','student_logout','_resolve_student_session',
            'disposal_request_submit','reagent_change_request_submit','location_request_submit','disposal_request_review','reagent_change_request_review','location_request_review',
            'inventory_session_start','inventory_session_finalize','inventory_count_save','reagent_register','lot_add','admin_lot_update','purchase_request_submit','_admin_actor')),
  'students_rls', (select relrowsecurity from pg_class where oid = 'public.students'::regclass),
  'student_sessions_exists', (to_regclass('public.student_sessions') is not null),
  'allow_all_policies_remaining', (select count(*) from pg_policies where schemaname = 'public' and policyname = 'allow all'),
  'sync_inventory_snapshot_installed', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = 'sync_inventory_snapshot'),
  'applied_migrations_max', (select max(version) from supabase_migrations.schema_migrations)
) as result;
