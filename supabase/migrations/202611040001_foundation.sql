-- Apply only to the dedicated project after disabling public signups.
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, role text not null check (role in ('admin','mandor')));
create table public.materials (code text primary key check (length(trim(code)) > 0), name text not null, kg_per_bag numeric check (kg_per_bag > 0), active boolean not null default true, updated_at timestamptz not null default now());
create table public.machines (id bigint generated always as identity primary key, number text not null unique check (length(trim(number)) > 0), name text not null check (length(trim(name)) > 0), active boolean not null default true);
create table public.material_imports (id bigint generated always as identity primary key, imported_by uuid not null references auth.users(id), imported_at timestamptz not null default now(), filename text not null, imported_count integer not null check (imported_count >= 0));
alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.machines enable row level security;
alter table public.material_imports enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
create policy profile_self on public.profiles for select to authenticated using (id = auth.uid());
create policy materials_read on public.materials for select to authenticated using (exists (select 1 from public.profiles where id = auth.uid()));
create policy materials_admin on public.materials for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy machines_read on public.machines for select to authenticated using (exists (select 1 from public.profiles where id = auth.uid()) and (active or public.is_admin()));
create policy machines_admin on public.machines for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy imports_admin on public.material_imports for select to authenticated using (public.is_admin());
revoke all on public.profiles, public.materials, public.machines, public.material_imports from anon, authenticated;
grant select on public.profiles, public.materials, public.machines to authenticated;
grant insert, update, delete on public.materials, public.machines to authenticated;
grant select on public.material_imports to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- One transaction prevents partial imports and keeps existing bag standards.
create function public.import_materials(items jsonb, source_filename text) returns integer language plpgsql security definer set search_path = '' as $$
declare item jsonb; n integer := 0;
begin
 if not public.is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
 if jsonb_typeof(items) <> 'array' or length(trim(source_filename)) = 0 then raise exception 'Invalid import'; end if;
 for item in select * from jsonb_array_elements(items) loop
  if length(trim(coalesce(item->>'code',''))) = 0 or lower(regexp_replace(trim(coalesce(item->>'name','')), '\s+', ' ', 'g')) <> 'mixing wip ok' then raise exception 'Invalid material'; end if;
  insert into public.materials(code,name) values(trim(item->>'code'), 'Mixing WIP OK') on conflict(code) do update set name=excluded.name, active=true, updated_at=now();
  n := n + 1;
 end loop;
 insert into public.material_imports(imported_by,filename,imported_count) values(auth.uid(),left(source_filename,255),n);
 return n;
end $$;
revoke all on function public.import_materials(jsonb,text) from public, anon;
grant execute on function public.import_materials(jsonb,text) to authenticated;
