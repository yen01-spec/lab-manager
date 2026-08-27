-- 원본 엑셀 재구축 과정에서 잔량을 확신할 수 없어 100%로 임시 채운 Lot을
-- 표시하기 위한 컬럼. 앱에서 "확인 필요만 보기" 같은 필터에 쓸 수 있음.
alter table reagent_lots
  add column if not exists needs_review boolean not null default false,
  add column if not exists review_note text;

comment on column reagent_lots.needs_review is '원본 데이터에 잔량 정보가 없거나 애매해서 임시값(보통 100%)으로 채운 경우 true';
comment on column reagent_lots.review_note is 'needs_review인 경우 왜 확인이 필요한지에 대한 짧은 설명';
