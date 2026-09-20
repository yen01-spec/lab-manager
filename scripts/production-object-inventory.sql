-- READ ONLY. Master Finish Phase 8 — Supabase object inventory (tables/row counts/views/functions/
-- triggers/policies/grants/FKs/storage). SELECT/catalog reads only; no DDL, no DML.
select jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'rows', (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int,
      'rls', c.relrowsecurity,
      'columns', (select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'views', (
    select jsonb_agg(jsonb_build_object('view', c.relname, 'kind', c.relkind) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object('fn', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'secdef', p.prosecdef,
                                        'anon_exec', has_function_privilege('anon', p.oid, 'execute'),
                                        'auth_exec', has_function_privilege('authenticated', p.oid, 'execute')) order by p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('table', c.relname, 'trigger', t.tgname, 'fn', p.proname) order by c.relname, t.tgname)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and not t.tgisinternal
  ),
  'policies', (
    select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'roles', roles, 'permissive', permissive, 'using', qual, 'check', with_check) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ),
  'grants', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'priv', privilege_type) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
  ),
  'fks', (
    select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'constraint', conname, 'refs', confrelid::regclass::text) order by conrelid::regclass::text, conname)
    from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace
  ),
  'storage_buckets', (select jsonb_agg(jsonb_build_object('id', id, 'public', public) order by id) from storage.buckets),
  'storage_policies', (
    select jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by policyname)
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
  ),
  'migrations', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
) as result;
