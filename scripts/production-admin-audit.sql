-- READ ONLY. 관리자 권한 점검 — is_admin() 정의, admin_users 상태, 쓰기 연산 정책/grant 현황 (SELECT/catalog 만).
select jsonb_build_object(
  'is_admin_def', (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin'),
  'is_admin_props', (select jsonb_build_object('secdef', p.prosecdef, 'config', p.proconfig, 'volatility', p.provolatile, 'anon_exec', has_function_privilege('anon', p.oid, 'execute'), 'public_exec', has_function_privilege('public', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin'),
  'admin_users', (select jsonb_build_object('rows', count(*), 'active', count(*) filter (where active)) from admin_users),
  'admin_users_policies', (select jsonb_agg(jsonb_build_object('p', policyname, 'cmd', cmd, 'roles', roles, 'using', qual)) from pg_policies where schemaname = 'public' and tablename = 'admin_users'),
  'write_policies', (select jsonb_agg(jsonb_build_object('t', tablename, 'p', policyname, 'cmd', cmd, 'roles', roles, 'permissive', permissive, 'using', qual, 'check', with_check) order by tablename, policyname)
                     from pg_policies where schemaname = 'public' and cmd <> 'SELECT'),
  'rls_off', (select jsonb_agg(c.relname order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'anon_write_grants', (select jsonb_agg(jsonb_build_object('t', table_name, 'privs', privs) order by table_name) from (
      select table_name, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE') group by table_name) x),
  'definer_functions', (select jsonb_agg(jsonb_build_object('fn', p.proname, 'config', p.proconfig, 'anon_exec', has_function_privilege('anon', p.oid, 'execute'))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef)
) as result;
