-- READ ONLY (집계만): "사용중/여분" 계산 가능성 확인 — 행 내용/개인정보 없음
with a as (
  select l.*, case when l.sealed_count > 0 then 100 else l.current_stock end as eff_remain
    from reagent_lots l where l.status = 'active'
), multi as (
  select reagent_id from a group by reagent_id having count(*) > 1
), ranked as (
  select a.*, min(eff_remain) over (partition by reagent_id) as min_remain,
         count(*) filter (where true) over (partition by reagent_id) as n_lots
    from a where reagent_id in (select reagent_id from multi)
), tie as (
  select reagent_id, count(*) filter (where eff_remain = min_remain) as n_min from ranked group by reagent_id
)
select jsonb_build_object(
  'multi_lot_reagents', (select count(*) from multi),
  'bottles_in_multi', (select count(*) from ranked),
  'spare_bottles_if_min_rule', (select count(*) from ranked) - (select count(*) from multi),
  'reagents_with_tie_at_min', (select count(*) from tie where n_min > 1),
  'tie_among_open_only', (select count(*) from (select reagent_id from ranked where eff_remain = min_remain and sealed_count = 0 group by reagent_id having count(*) > 1) x),
  'reagents_with_sealed_and_open', (select count(*) from (select reagent_id from ranked group by reagent_id having bool_or(sealed_count > 0) and bool_or(sealed_count = 0)) x),
  'reagents_all_sealed', (select count(*) from (select reagent_id from ranked group by reagent_id having bool_and(sealed_count > 0)) x),
  'sealed_rows_stock_dist', (select jsonb_object_agg(current_stock::text, n) from (select current_stock, count(*) n from a where sealed_count > 0 group by 1) s),
  'open_rows_zero_stock', (select count(*) from a where sealed_count = 0 and current_stock = 0),
  'received_date_null_in_multi', (select count(*) from ranked where received_date is null),
  'updated_at_distinct_in_multi', (select count(distinct updated_at) from ranked),
  'spare_locations', (select coalesce(jsonb_agg(jsonb_build_object('room', room, 'detail', detail, 'active_lots', (select count(*) from reagent_lots x where x.location_id = locations.id and x.status = 'active'))), '[]'::jsonb) from locations where room ilike '%여분%' or detail ilike '%여분%'),
  'locations_total', (select count(*) from locations),
  'lots_per_location_max', (select max(c) from (select count(*) c from reagent_lots where status='active' group by location_id) x),
  'lots_null_shelf', (select count(*) from reagent_lots where status='active' and shelf_position is null),
  'reagents_active', (select count(*) from reagents where status = 'active'),
  'reagents_sort_letter_null', (select count(*) from reagents where status = 'active' and sort_letter is null),
  'sort_letter_dist', (select jsonb_object_agg(coalesce(sort_letter,'null'), n) from (select sort_letter, count(*) n from reagents where status='active' group by 1) s)
);
