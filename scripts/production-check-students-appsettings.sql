-- READ ONLY.
select jsonb_build_object(
  'students_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name='students'
  ),
  'students_constraints', (
    select jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)))
    from pg_constraint where conrelid='public.students'::regclass
  ),
  'app_settings_columns', (
    select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
    from information_schema.columns where table_schema='public' and table_name='app_settings'
  ),
  'app_settings_constraints', (
    select jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)))
    from pg_constraint where conrelid='public.app_settings'::regclass
  ),
  'app_settings_row_count', (select count(*) from app_settings),
  'students_row_count', (select count(*) from students)
) as result;
