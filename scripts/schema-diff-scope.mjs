// 복원(백업) 범위 테이블 — supabase/migrations/20260924090000_backup_restore.sql 의 _backup_tables(mode) 와 같은 순서(FK 부모 → 자식).
//  core = 핵심 시약·재고 백업, FULL_EXTRA = 전체 시스템 백업에서 추가되는 테이블(app_settings 는 allowlist 키만이라 baseline 대상 아님).
export const SCOPE = ['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests', 'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history', 'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs']
export const FULL_EXTRA = ['purchase_request_logs', 'purchase_request_reagent_items', 'purchase_request_goods_items', 'purchase_requests', 'notices', 'notice_files', 'resource_files']
export const BASELINE_SCOPE = [...SCOPE, ...FULL_EXTRA]
