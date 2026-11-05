-- Apply after migration 006 in the dedicated project.
begin;
-- Only Mixing materials without a standard are backfilled; opname snapshots are untouched.
update public.materials set kg_per_bag=25 where kg_per_bag is null and public.is_mixing_wip_ok(name);
create or replace function public.import_materials(items jsonb, source_filename text)
returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; inserted integer; total_inserted integer := 0;
begin
 if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
 if jsonb_typeof(items) is distinct from 'array' or source_filename is null or length(trim(source_filename)) = 0 then raise exception 'Invalid import'; end if;
 if jsonb_array_length(items) = 0 then raise exception 'Import must not be empty'; end if;
 -- Validate the whole batch before inserting. A conflicting name must never be chosen silently.
 for item in select * from jsonb_array_elements(items) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'code') is distinct from 'string' or jsonb_typeof(item->'name') is distinct from 'string' or nullif(trim(item->>'code'),'') is null or not public.is_mixing_wip_ok(item->>'name') then raise exception 'Invalid material'; end if;
 end loop;
 if exists (
  select 1 from jsonb_array_elements(items) as entry(value)
  group by trim(value->>'code')
  having count(distinct lower(regexp_replace(trim(value->>'name'), '[[:space:]]+', ' ', 'g'))) > 1
 ) then raise exception 'Conflicting names for material code'; end if;
 for item in select * from jsonb_array_elements(items) loop
  insert into public.materials(code,name,kg_per_bag) values(trim(item->>'code'),item->>'name',25) on conflict(code) do nothing;
  get diagnostics inserted = row_count;
  total_inserted := total_inserted + inserted;
 end loop;
 insert into public.material_imports(imported_by,filename,imported_count) values(auth.uid(),left(trim(source_filename),255),total_inserted);
 return total_inserted;
end $$;
-- Preserve the existing RPC contract and restrict execution to authenticated users.
revoke all on function public.import_materials(jsonb,text) from public, anon;
grant execute on function public.import_materials(jsonb,text) to authenticated;
commit;
