-- STAGING TEST ONLY (read-only verification query, not schema/migration)
select jsonb_build_object(
  'function_source_has_55P03', (
    select pg_get_functiondef(p.oid) like '%55P03%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_inventory_snapshot'
  ),
  'function_source_has_LOCKED', (
    select pg_get_functiondef(p.oid) like '%''LOCKED''%'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_inventory_snapshot'
  ),
  'anon_execute', has_function_privilege('anon', 'public.sync_inventory_snapshot(jsonb)', 'EXECUTE'),
  'authenticated_execute', has_function_privilege('authenticated', 'public.sync_inventory_snapshot(jsonb)', 'EXECUTE'),
  'security_definer', (
    select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_inventory_snapshot'
  ),
  'inventory_snapshot_syncs_rls_enabled', (
    select relrowsecurity from pg_class where oid = 'public.inventory_snapshot_syncs'::regclass
  ),
  'inventory_snapshot_syncs_policies', (
    select jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles))
    from pg_policies where schemaname = 'public' and tablename = 'inventory_snapshot_syncs'
  ),
  'reagent_lots_status_check', (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'reagent_lots_status_check' and conrelid = 'public.reagent_lots'::regclass
  ),
  'regression_other_functions', (
    select jsonb_object_agg(f, jsonb_build_object(
      'anon_execute', has_function_privilege('anon', 'public.' || f, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
    ))
    from (values ('is_admin()')) as x(f)
  )
) as result;
