-- 재고실사 중 시약 기본정보(시약명/CAS/회사/용량/단위/성상/유해정보) 수정도
-- 잔량/미개봉 병수와 동일한 2단계(1단계 즉시반영+검토대기 → 2단계 최종확정) 흐름을 타도록 확장.

alter table reagents
  add column if not exists pending_confirm boolean not null default false;

alter table inventory_counts
  add column if not exists staged_reagent_fields jsonb, -- 실사 중 입력한 시약 기본정보 스테이징(1단계에서 reagents에 반영)
  add column if not exists book_reagent_fields jsonb;    -- 실사 시작 시점의 원래 값 스냅샷(되돌리기용)
