-- READ ONLY. Production Gate P1.5 — admin_users schema + current rows.
select jsonb_build_object(
  'columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name='admin_users'
  ),
  'primary_key', (
    select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.admin_users'::regclass and contype='p'
  ),
  'foreign_keys', (
    select jsonb_agg(jsonb_build_object('constraint', conname, 'def', pg_get_constraintdef(oid)))
    from pg_constraint where conrelid='public.admin_users'::regclass and contype='f'
  ),
  'row_count', (select count(*) from admin_users),
  'rows', (
    select coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'active', active, 'note', note, 'created_at', created_at)), '[]'::jsonb)
    from admin_users
  )
) as result;
