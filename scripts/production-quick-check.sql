-- READ ONLY quick status check.
select
  (select count(*) from admin_users) as admin_users_count,
  (select count(*) from inventory_snapshot_syncs) as syncs_count,
  (select count(*) from admin_logs where action = '현재 재고 동기화') as sync_log_count;
