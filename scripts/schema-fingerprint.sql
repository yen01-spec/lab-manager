-- READ ONLY: public 스키마 지문(테이블/컬럼/제약/인덱스/트리거/RLS 여부/시퀀스) — production 과 staging 비교용.
-- 이름이 다를 수 있는 제약/인덱스는 "정의 문자열"로 비교하도록 이름을 제외한 정규화 값을 함께 반환한다.
select jsonb_build_object(
  'tables', (
    select jsonb_object_agg(t.table_name, jsonb_build_object(
      'columns', (select jsonb_agg(jsonb_build_object(
                    'name', c.column_name, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
                    'default', pg_get_expr(d.adbin, d.adrelid), 'identity', a.attidentity, 'generated', a.attgenerated)
                  order by a.attnum)
                  from pg_attribute a
                  join information_schema.columns c on c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = a.attname
                  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = format('public.%I', t.table_name)::regclass and a.attnum > 0 and not a.attisdropped),
      'constraints', (select coalesce(jsonb_agg(jsonb_build_object('type', k.contype::text, 'def', pg_get_constraintdef(k.oid), 'name', k.conname) order by k.contype::text, pg_get_constraintdef(k.oid)), '[]'::jsonb)
                        from pg_constraint k where k.conrelid = format('public.%I', t.table_name)::regclass),
      'indexes', (select coalesce(jsonb_agg(regexp_replace(i.indexdef, 'INDEX \S+ ON', 'INDEX ON') order by regexp_replace(i.indexdef, 'INDEX \S+ ON', 'INDEX ON')), '[]'::jsonb)
                    from pg_indexes i where i.schemaname = 'public' and i.tablename = t.table_name),
      'triggers', (select coalesce(jsonb_agg(regexp_replace(pg_get_triggerdef(g.oid), 'CREATE (CONSTRAINT )?TRIGGER \S+', 'TRIGGER') order by g.tgname), '[]'::jsonb)
                     from pg_trigger g where g.tgrelid = format('public.%I', t.table_name)::regclass and not g.tgisinternal),
      'rls', (select relrowsecurity from pg_class where oid = format('public.%I', t.table_name)::regclass)
    ))
    from information_schema.tables t where t.table_schema = 'public' and t.table_type = 'BASE TABLE'),
  'sequences', (select coalesce(jsonb_agg(sequencename order by sequencename), '[]'::jsonb) from pg_sequences where schemaname = 'public'),
  'functions', (select coalesce(jsonb_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' order by p.proname), '[]'::jsonb)
                  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public')
);
