-- 2026-2 전수조사 엑셀의 '수정이력'/'검토의견' 시트를 시약 상세페이지의 기존 "변경이력"
-- 타임라인에 합쳐서 보여주기 위한 테이블. location_history/stock_logs 등과 달리 이 시트들엔
-- 정확한 수정 시각이 없어서(날짜 컬럼 자체가 없음), 임포트 시점에 파일 작성일 기준의
-- 대표 날짜 하나로 기록하고 실제 편차는 없다는 점을 감안해서 봐야 함.
create table if not exists reagent_import_history (
  id            uuid primary key default gen_random_uuid(),
  reagent_id    uuid references reagents(id) on delete cascade,
  source        text not null check (source in ('수정이력', '검토의견')),
  category      text,       -- 수정이력의 '구분' 또는 검토의견의 '구분'+'처리상태'
  field_name    text,       -- 수정이력의 '수정 항목' (검토의견은 null)
  old_value     text,       -- 수정이력의 '수정 전'
  new_value     text,       -- 수정이력의 '수정 후' 또는 검토의견의 '기재값'
  note          text,       -- 검토의견의 '검토 의견' 원문
  location_text text,       -- 원본 시트의 '위치' 컬럼 원문(정리 당시 표기 그대로)
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_reagent_import_history_reagent on reagent_import_history(reagent_id);

comment on table reagent_import_history is '2026-2 전수조사 엑셀 수정이력/검토의견 시트 원문 — 시약 상세 변경이력 타임라인에 합쳐서 표시.';
