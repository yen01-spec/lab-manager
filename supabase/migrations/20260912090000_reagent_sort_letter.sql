-- 2026-2 전수조사 파일의 "시약장 알파벳 정렬 기준" 컬럼(화학명 앞의 위치번호·입체이성질체
-- 접두어 등을 무시하고 실제 알파벳순으로 정렬하기 위한 값, 예: "D-Raffinose"→R,
-- "n-Butyl alcohol"→B)을 반영 — 실제 시약장이 이 기준으로 물리적으로 정렬돼있어서,
-- 앱의 알파벳 인덱스도 시약명 첫 글자만 보는 대신 이 값을 우선 쓰도록 함.
-- 값이 없는(수동 등록 등) 시약은 프론트엔드에서 name[0]으로 폴백.
alter table reagents
  add column if not exists sort_letter text;
comment on column reagents.sort_letter is '실제 시약장 알파벳 정렬 기준 글자(화학명 접두어 무시) — 2026-2 전수조사 파일 "알파벳" 컬럼 반영. 없으면 프론트엔드에서 name[0]으로 폴백.';
