-- ════════════════════════════════════════════════════════════════════════
-- Master Finish Phase 8 — production 정리 후보(준비만, 적용 금지)
--
-- ⚠️ 이 파일은 supabase/migrations/ 가 아니라 pending-cleanup/ 에 둔다.
--    production 관리자 계정이 준비되고 별도 Gate 승인이 난 뒤에만 migrations/ 로 옮겨 적용한다.
--    staging 에서 적용 후 전체 회귀(인증/세션/요청/리뷰/재고실사/시약도메인/재고동기화)를 통과한 것을 확인함.
--
-- 대상(모두 production 확인: 행 0개, src/·scripts/ 참조 0, 다른 테이블의 FK 참조 0):
--   receipts            — 어떤 migration/코드에도 정의·사용 흔적 없음
--   calendar_events     — 달력 화면(라우트 없음)이 삭제됨
--   regulation_document — resource_files(20260913090000)로 대체됨
-- 가드: 행이 하나라도 있으면 예외로 중단(데이터 손실 방지).
-- 제외(사유): stock_history — 유지보수 스크립트(rebuild/backup/consolidate)가 참조.
--            items/item_lots/item_locations — 화면은 삭제됐지만 실데이터 26/26/3행(사용자 결정 필요).
--            special_material_logs·hazard_ledger_notes·lab_rules·safety_briefings — 화면이 실제로 사용.
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['receipts', 'calendar_events', 'regulation_document'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then raise exception '% 에 데이터가 % 행 있어 삭제를 중단합니다.', t, n; end if;
  end loop;
end $$;

drop table if exists public.receipts;
drop table if exists public.calendar_events;
drop table if exists public.regulation_document;
