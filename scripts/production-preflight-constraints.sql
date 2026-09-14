-- READ ONLY. Production Gate P0 — full constraint listing for reagents/reagent_lots
-- (not just the ones the migration touches) to catch anything unexpected.
select
  conrelid::regclass as table_name,
  conname,
  pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.reagents'::regclass, 'public.reagent_lots'::regclass)
order by conrelid::regclass::text, conname;
