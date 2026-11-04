-- Apply after 001-004; no existing master records or opname histories are modified.
begin;
create function public.is_mixing_wip_ok(material_name text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(material_name, '') ~* '(^|[[:space:]])mixing([[:space:]]+(?!wip([[:space:]]|$))[^[:space:]]+)*[[:space:]]+wip[[:space:]]+ok($|[[:space:]])'
$$;
revoke all on function public.is_mixing_wip_ok(text) from public, anon;
grant execute on function public.is_mixing_wip_ok(text) to authenticated;

create or replace function public.import_materials(items jsonb, source_filename text) returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; n integer := 0;
begin
 if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
 if jsonb_typeof(items) <> 'array' or length(trim(source_filename)) = 0 then raise exception 'Invalid import'; end if;
 for item in select * from jsonb_array_elements(items) loop
  if length(trim(coalesce(item->>'code',''))) = 0 or not public.is_mixing_wip_ok(item->>'name') then raise exception 'Invalid material'; end if;
  insert into public.materials(code,name) values(trim(item->>'code'), item->>'name') on conflict(code) do update set name=excluded.name, active=true, updated_at=now();
  n := n + 1;
 end loop;
 insert into public.material_imports(imported_by,filename,imported_count) values(auth.uid(),left(source_filename,255),n);
 return n;
end $$;

create or replace function public.opname_save_item(p_machine bigint, p_code text, p_whole integer, p_open numeric, p_hopper numeric, p_item bigint default null) returns bigint language plpgsql security definer set search_path='' as $$
declare m public.opname_machines; mat public.materials; result bigint;
begin
 m:=public.opname_lock_machine(p_machine);
 if auth.uid() is null or m.mandor_id is null or m.mandor_id is distinct from auth.uid() or m.status <> 'DRAFT' then raise exception 'Hanya penanggung jawab dapat mengubah draft'; end if;
 if p_whole is null or p_whole < 0 or p_open is null or p_hopper is null or p_open < 0 or p_hopper < 0 or p_open in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_hopper in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'Jumlah tidak valid'; end if;
 select * into mat from public.materials where code=p_code and active and public.is_mixing_wip_ok(name);
 if not found then raise exception 'Material tidak aktif atau tidak ditemukan'; end if;
 if p_item is null then
  if mat.kg_per_bag in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'Standar kg per zak tidak valid'; end if;
  if p_whole > 0 and mat.kg_per_bag is null then raise exception 'Admin harus melengkapi standar kg per zak'; end if;
  insert into public.opname_items(opname_machine_id,material_code,material_name,whole_bags,kg_per_bag,open_kg,hopper_kg) values(p_machine,mat.code,mat.name,p_whole,mat.kg_per_bag,p_open,p_hopper) returning id into result;
 else
  if not exists(select 1 from public.opname_items where id=p_item and opname_machine_id=p_machine and material_code=p_code) then raise exception 'Detail tidak ditemukan'; end if;
  -- Preserve the recorded standard; only fill a missing standard from master.
  if mat.kg_per_bag in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'Standar kg per zak tidak valid'; end if;
  update public.opname_items set whole_bags=p_whole, kg_per_bag=coalesce(kg_per_bag,mat.kg_per_bag), open_kg=p_open, hopper_kg=p_hopper,updated_at=now() where id=p_item returning id into result;
 end if;
 return result;
end $$;

commit;
