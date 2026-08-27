-- stock_logs 테이블에 타임스탬프 컬럼이 아예 없었다(id/target_type/lot_id/
-- user_name/before_*/after_* 뿐). 언제 일어난 변경인지 알 수 없어서
-- 변경이력 타임라인에 넣을 수 없었던 근본 원인. 다른 모든 테이블과 동일한
-- 컨벤션으로 추가.
alter table stock_logs
  add column if not exists created_at timestamptz not null default now();
