-- READ ONLY.
select jsonb_build_object(
  'rls_status', (
    select jsonb_agg(jsonb_build_object('table', c.relname, 'rls_enabled', c.relrowsecurity))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('reagent_change_requests','location_requests')
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'with_check', with_check))
    from pg_policies where schemaname='public' and tablename in ('reagent_change_requests','location_requests')
  ),
  'grants', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type))
    from information_schema.role_table_grants
    where table_schema='public' and table_name in ('reagent_change_requests','location_requests') and grantee in ('anon','authenticated')
  )
) as result;
