-- STAGING TEST ONLY — throwaway probe function to check whether `supabase db lint`
-- (plpgsql_check) can see local temporary tables created inside the same function body.
-- Dropped immediately after use, not part of the fixture baseline.
create or replace function public._lint_temp_table_probe()
returns integer
language plpgsql
as $$
declare
  v_count int;
begin
  create temporary table _lint_probe_tmp on commit drop as select 1 as x;
  select count(*) into v_count from _lint_probe_tmp;
  return v_count;
end;
$$;
