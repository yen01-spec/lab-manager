-- STAGING TEST ONLY (read-only verification query, not schema/migration)
select jsonb_build_object(
  'reagent_lots_status_check', (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conname = 'reagent_lots_status_check'
      and conrelid = 'public.reagent_lots'::regclass
  ),
  'inventory_snapshot_syncs_exists', (
    select exists(
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'inventory_snapshot_syncs'
    )
  ),
  'inventory_snapshot_syncs_rls_enabled', (
    select relrowsecurity from pg_class
    where oid = 'public.inventory_snapshot_syncs'::regclass
  ),
  'inventory_snapshot_syncs_policies', (
    select jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles))
    from pg_policies
    where schemaname = 'public' and tablename = 'inventory_snapshot_syncs'
  ),
  'sync_inventory_snapshot_function', (
    select jsonb_build_object(
      'exists', true,
      'security_type', case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
      'search_path', (
        select unnest(p.proconfig) from (select 1) x
        where p.proconfig is not null
      ),
      'return_type', pg_get_function_result(p.oid),
      'arg_types', pg_get_function_arguments(p.oid)
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_inventory_snapshot'
  ),
  'sync_inventory_snapshot_grants', (
    select jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type))
    from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'sync_inventory_snapshot'
  )
) as result;
