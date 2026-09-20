-- READ ONLY (집계만): 병 단위 모델 확인 — 개인정보/행 내용 없음
select jsonb_build_object(
  'lots', (select count(*) from reagent_lots),
  'by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from reagent_lots group by 1) s),
  'sealed_count_dist', (select jsonb_object_agg(sealed_count::text, n) from (select sealed_count, count(*) n from reagent_lots group by 1) s),
  'sealed_gt0_active', (select count(*) from reagent_lots where status='active' and sealed_count>0),
  'sealed_gt1_active', (select count(*) from reagent_lots where status='active' and sealed_count>1),
  'dup_reagent_lotno_groups', (select count(*) from (select 1 from reagent_lots where lot_no is not null group by reagent_id, lot_no having count(*)>1) x),
  'dup_reagent_lotno_max_rows', (select coalesce(max(c),0) from (select count(*) c from reagent_lots where lot_no is not null group by reagent_id, lot_no) x),
  'null_lotno', (select count(*) from reagent_lots where lot_no is null),
  'reagents_multi_active_lots', (select count(*) from (select 1 from reagent_lots where status='active' group by reagent_id having count(*)>1) x),
  'max_active_lots_per_reagent', (select coalesce(max(c),0) from (select count(*) c from reagent_lots where status='active' group by reagent_id) x),
  'active_lots_null_location', (select count(*) from reagent_lots where status='active' and location_id is null),
  'stock_dist_buckets', (select jsonb_object_agg(b, n) from (select case when current_stock=0 then '0' when current_stock<=20 then '1-20' when current_stock<=50 then '21-50' when current_stock<100 then '51-99' else '100' end b, count(*) n from reagent_lots where status='active' group by 1) s),
  'lots_with_null_location_id_requests', (select count(*) from location_requests where lot_id is null),
  'disposal_requests_null_lot', (select count(*) from disposal_requests where lot_id is null),
  'disposal_qty_dist', (select jsonb_object_agg(coalesce(quantity,'null'), n) from (select quantity, count(*) n from disposal_requests group by 1 order by 2 desc limit 10) s),
  'lot_sort_letter_col', (select count(*) from reagents where sort_letter is not null)
);
