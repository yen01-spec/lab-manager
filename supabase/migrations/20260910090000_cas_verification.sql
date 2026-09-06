-- 전체 카탈로그 대상 CAS-이름 정합성 검증 결과 저장.
-- 44종 특별관리물질 교차검증(specialManagementSubstances.js)과는 별개 — 그건 44개
-- CAS 공간에서만 우연히 오류를 잡아주는 것이고, 이건 CAS 있는 시약 전체를 PubChem
-- 동의어 목록과 대조해서 검증한다(scripts/verify-cas-consistency.mjs).
alter table reagents
  add column if not exists cas_verification_status text,
  add column if not exists cas_verification_note text;
comment on column reagents.cas_verification_status is 'ok(동의어 매칭됨) | mismatch(CAS는 있는데 이름이 그 물질과 안 맞음) | not_found(PubChem에 그 CAS 자체가 없음) | null(미검증)';
comment on column reagents.cas_verification_note is '매칭된 동의어 또는 PubChem이 실제로 알고 있는 물질명(불일치 시 확인용)';
