-- STAGING ONLY read-only: effective grants + policies after 20260920100000_least_privilege_acl.sql
select jsonb_build_object(
  'grants', (select jsonb_agg(jsonb_build_object('t', table_name, 'g', grantee, 'p', privilege_type) order by table_name, grantee, privilege_type)
             from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated')),
  'policies', (select jsonb_agg(jsonb_build_object('t', tablename, 'p', policyname, 'cmd', cmd, 'roles', roles) order by tablename, policyname)
               from pg_policies where schemaname = 'public'),
  'storage', (select jsonb_agg(jsonb_build_object('p', policyname, 'cmd', cmd) order by policyname) from pg_policies where schemaname='storage' and tablename='objects')
) as result;
