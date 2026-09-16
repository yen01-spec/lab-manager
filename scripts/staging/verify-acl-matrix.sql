-- STAGING TEST ONLY (read-only)
select jsonb_build_object(
  'students_grants', (
    select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) order by grantee, privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants
    where table_schema='public' and table_name='students' and grantee in ('anon','authenticated','public')
  ),
  'app_settings_grants', (
    select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type) order by grantee, privilege_type), '[]'::jsonb)
    from information_schema.role_table_grants
    where table_schema='public' and table_name='app_settings' and grantee in ('anon','authenticated','public')
  ),
  'students_column_grants', (
    select coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'column', column_name, 'privilege', privilege_type) order by grantee, column_name), '[]'::jsonb)
    from information_schema.role_column_grants
    where table_schema='public' and table_name='students' and grantee in ('anon','authenticated','public')
  ),
  'rpc_grants', (
    select coalesce(jsonb_agg(jsonb_build_object('routine', routine_name, 'grantee', grantee, 'privilege', privilege_type) order by routine_name, grantee), '[]'::jsonb)
    from information_schema.routine_privileges
    where routine_schema='public' and routine_name in
      ('student_check_login','student_admin_login','student_register','student_session_refresh','student_admin_upgrade','admin_password_change')
  ),
  'rpc_defs', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'security_definer', p.prosecdef,
      'search_path', (select x from unnest(p.proconfig) x where x like 'search_path=%'),
      'owner', pg_get_userbyid(p.proowner)
    ) order by p.proname), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('student_check_login','student_admin_login','student_register','student_session_refresh','student_admin_upgrade','admin_password_change')
  )
) as result;
