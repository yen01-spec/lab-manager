-- STAGING TEST ONLY (read-only verification query, not schema/migration)
select jsonb_build_object(
  'tables', (
    select jsonb_object_agg(t, exists_)
    from (values ('locations'), ('reagents'), ('reagent_lots'), ('admin_users'), ('admin_logs')) as x(t)
    cross join lateral (
      select exists(
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = x.t
      ) as exists_
    ) e
  ),
  'row_counts', jsonb_build_object(
    'locations', (select count(*) from locations),
    'reagents', (select count(*) from reagents),
    'reagent_lots', (select count(*) from reagent_lots),
    'admin_users', (select count(*) from admin_users),
    'admin_logs', (select count(*) from admin_logs)
  ),
  'functions', (
    select jsonb_object_agg(f, exists_)
    from (values ('is_admin'), ('update_updated_at')) as x(f)
    cross join lateral (
      select exists(
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = x.f
      ) as exists_
    ) e
  ),
  'triggers', (
    select jsonb_agg(jsonb_build_object('table', event_object_table, 'trigger', trigger_name))
    from information_schema.triggers
    where trigger_schema = 'public' and trigger_name = 'set_updated_at'
  )
) as result;
