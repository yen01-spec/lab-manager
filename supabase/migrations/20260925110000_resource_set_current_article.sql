-- ════════════════════════════════════════════════════════════════════════
-- 자료실 CMS 3/4 — set_resource_current를 article_id 인지하도록 갱신.
--
-- "같은 문서의 여러 버전" 묶음 범위가 기존 (category_key, section_key, resource_key)에서
-- 새 행은 (article_id, resource_key)로 바뀐다. article_id가 없는 legacy 행은 기존 동작
-- (category_key/section_key 기준)을 그대로 유지 — 기존 RPC를 깨뜨리지 않는다.
--
-- ⚠️ staging 전용. production 미적용.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.set_resource_current(target_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if not public.is_admin() then
    raise exception '자료관리 권한이 없습니다.' using errcode = '42501';
  end if;

  select id, article_id, category_key, section_key, resource_key
    into t
    from public.resource_files
   where id = target_resource_id;

  if not found then
    raise exception '대상 자료를 찾을 수 없습니다: %', target_resource_id using errcode = 'P0002';
  end if;

  if t.resource_key is null then
    update public.resource_files
       set is_current = true, updated_at = now()
     where id = t.id
       and is_current is distinct from true;
    return;
  end if;

  if t.article_id is not null then
    update public.resource_files
       set is_current = false, updated_at = now()
     where article_id = t.article_id
       and resource_key = t.resource_key
       and id <> t.id
       and is_current;
  else
    update public.resource_files
       set is_current = false, updated_at = now()
     where article_id is null
       and category_key = t.category_key
       and section_key  = t.section_key
       and resource_key = t.resource_key
       and id <> t.id
       and is_current;
  end if;

  update public.resource_files
     set is_current = true, updated_at = now()
   where id = t.id
     and is_current is distinct from true;
end;
$$;
revoke all on function public.set_resource_current(uuid) from public;
grant execute on function public.set_resource_current(uuid) to authenticated;
