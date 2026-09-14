-- READ ONLY. Production Gate P1 final verification.
select jsonb_build_object(
  'inventory_snapshot_syncs_row_count', (select count(*) from inventory_snapshot_syncs),
  'anon_execute', has_function_privilege('anon', 'public.sync_inventory_snapshot(jsonb)', 'EXECUTE'),
  'authenticated_execute', has_function_privilege('authenticated', 'public.sync_inventory_snapshot(jsonb)', 'EXECUTE'),
  'function_source_has_is_admin_gate', (
    select pg_get_functiondef(p.oid) like '%if not public.is_admin() then%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_inventory_snapshot'
  ),
  'admin_logs_inventory_sync_rows', (
    select count(*) from admin_logs where action = '현재 재고 동기화'
  ),
  'inventory_snapshot_syncs_write_policies', (
    select coalesce(jsonb_agg(policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public' and tablename = 'inventory_snapshot_syncs' and cmd in ('INSERT','UPDATE','DELETE')
  ),
  'function_def_sha256', (
    select encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_inventory_snapshot'
  )
) as result;
