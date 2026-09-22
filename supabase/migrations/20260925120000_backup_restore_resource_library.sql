-- ════════════════════════════════════════════════════════════════════════
-- 자료실 CMS 4/4 — 전체 시스템 백업(모드 B)에 resource_tabs / resource_articles 포함.
--
-- 복원 순서(FK 부모 → 자식): resource_tabs → resource_articles → resource_files.
-- resource_files는 이미 포함되어 있었다(순서만 이 두 테이블 뒤로 유지되도록 배치).
-- notices/notice_files/기존 resource_files는 그대로 유지 — 이번 변경은 배열에 이름 2개를
-- 추가하는 것뿐, 과거 데이터 백업 범위를 줄이지 않는다.
--
-- ⚠️ staging 전용. production 미적용.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public._backup_tables(p_mode text default 'core')
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_core text[] := array['students', 'locations', 'reagents', 'reagent_lots', 'location_history', 'location_requests',
               'disposal_requests', 'reagent_change_requests', 'stock_history', 'stock_logs', 'reagent_import_history',
               'special_material_logs', 'inventory_sessions', 'inventory_assignments', 'inventory_counts', 'admin_logs'];
begin
  if p_mode = 'core' then return v_core; end if;
  if p_mode = 'full' then
    return v_core || array['purchase_request_logs', 'purchase_request_reagent_items', 'purchase_request_goods_items', 'purchase_requests',
                           'notices', 'notice_files', 'resource_tabs', 'resource_articles', 'resource_files', 'app_settings'];
  end if;
  raise exception '알 수 없는 백업 모드입니다: % (core | full)', p_mode;
end;
$$;
