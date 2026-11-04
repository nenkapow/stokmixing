-- Apply after 202611040001_foundation.sql in the dedicated project only.
begin;
create table public.opname_sessions (
 id bigint generated always as identity primary key,
 name text not null check (length(trim(name)) > 0), opname_date date not null,
 status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create unique index opname_one_open on public.opname_sessions ((status)) where status = 'OPEN';
create table public.opname_machines (
 id bigint generated always as identity primary key, session_id bigint not null references public.opname_sessions(id),
 machine_id bigint not null references public.machines(id), machine_number text not null, machine_name text not null,
 mandor_id uuid references auth.users(id), status text not null default 'DRAFT' check (status in ('DRAFT','COMPLETED')),
 started_at timestamptz, completed_at timestamptz,
 unique(session_id,machine_id),
 check ((mandor_id is null and started_at is null and status = 'DRAFT' and completed_at is null) or
        (mandor_id is not null and started_at is not null and ((status = 'DRAFT' and completed_at is null) or (status = 'COMPLETED' and completed_at is not null))))
);
create table public.opname_items (
 id bigint generated always as identity primary key, opname_machine_id bigint not null references public.opname_machines(id),
 material_code text not null references public.materials(code), material_name text not null,
 whole_bags integer not null check (whole_bags >= 0), kg_per_bag numeric check (kg_per_bag > 0),
 open_kg numeric not null check (open_kg >= 0 and open_kg <> 'NaN'::numeric),
 hopper_kg numeric not null check (hopper_kg >= 0 and hopper_kg <> 'NaN'::numeric),
 actual_kg numeric generated always as (whole_bags * coalesce(kg_per_bag,0) + open_kg + hopper_kg) stored,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (whole_bags = 0 or kg_per_bag is not null), unique(opname_machine_id, material_code)
);
alter table public.opname_sessions enable row level security;
alter table public.opname_machines enable row level security;
alter table public.opname_items enable row level security;
revoke all on public.opname_sessions, public.opname_machines, public.opname_items from anon, authenticated;
grant select on public.opname_sessions, public.opname_machines, public.opname_items to authenticated;
create policy sessions_read on public.opname_sessions for select to authenticated using (public.is_admin() or (status = 'OPEN' and exists(select 1 from public.profiles where id=auth.uid())));
create policy machines_read on public.opname_machines for select to authenticated using (public.is_admin() or exists(select 1 from public.opname_sessions s where s.id=session_id and s.status='OPEN' and exists(select 1 from public.profiles where id=auth.uid())));
create policy items_read on public.opname_items for select to authenticated using (public.is_admin() or exists(select 1 from public.opname_machines m join public.opname_sessions s on s.id=m.session_id where m.id=opname_machine_id and m.mandor_id=auth.uid() and s.status='OPEN'));

-- Locks always take the session first, then the machine: closure and completion serialize with writes.
create function public.opname_create_session(p_name text, p_date date) returns bigint language plpgsql security definer set search_path='' as $$
declare sid bigint;
begin
 if not public.is_admin() then raise exception 'Hanya Admin'; end if;
 if nullif(trim(p_name),'') is null or p_date is null then raise exception 'Nama dan tanggal wajib diisi'; end if;
 insert into public.opname_sessions(name,opname_date,created_by) values(trim(p_name),p_date,auth.uid()) returning id into sid;
 insert into public.opname_machines(session_id,machine_id,machine_number,machine_name) select sid,id,number,name from public.machines where active;
 return sid;
end $$;
create function public.opname_lock_machine(p_id bigint) returns public.opname_machines language plpgsql security definer set search_path='' as $$
declare m public.opname_machines; sid bigint; s text;
begin
 select session_id into sid from public.opname_machines where id=p_id;
 select status into s from public.opname_sessions where id=sid for update;
 if s is distinct from 'OPEN' then raise exception 'Sesi tidak terbuka'; end if;
 select * into m from public.opname_machines where id=p_id for update;
 return m;
end $$;
create function public.opname_claim(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='mandor') then raise exception 'Hanya Mandor yang dapat mengklaim mesin' using errcode='42501'; end if;
 m:=public.opname_lock_machine(p_id);
 if m.mandor_id is null then update public.opname_machines set mandor_id=auth.uid(),started_at=now() where id=p_id;
 elsif m.mandor_id <> auth.uid() then raise exception 'Mesin sudah diklaim pengguna lain';
 elsif m.status <> 'DRAFT' then raise exception 'Pemeriksaan sudah selesai'; end if;
end $$;
create function public.opname_save_item(p_machine bigint, p_code text, p_whole integer, p_open numeric, p_hopper numeric, p_item bigint default null) returns bigint language plpgsql security definer set search_path='' as $$
declare m public.opname_machines; mat public.materials; result bigint;
begin
 m:=public.opname_lock_machine(p_machine);
 if auth.uid() is null or m.mandor_id is null or m.mandor_id is distinct from auth.uid() or m.status <> 'DRAFT' then raise exception 'Hanya penanggung jawab dapat mengubah draft'; end if;
 if p_whole is null or p_whole < 0 or p_open is null or p_hopper is null or p_open < 0 or p_hopper < 0 or p_open in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) or p_hopper in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then raise exception 'Jumlah tidak valid'; end if;
 select * into mat from public.materials where code=p_code and active and name ~* '(^|[[:space:]])mixing[[:space:]]+wip[[:space:]]+ok($|[[:space:]])';
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
create function public.opname_delete_item(p_machine bigint,p_item bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin m:=public.opname_lock_machine(p_machine); if auth.uid() is null or m.mandor_id is null or m.mandor_id is distinct from auth.uid() or m.status <> 'DRAFT' then raise exception 'Hanya penanggung jawab dapat mengubah draft'; end if; delete from public.opname_items where id=p_item and opname_machine_id=p_machine; if not found then raise exception 'Detail tidak ditemukan'; end if; end $$;
create function public.opname_complete(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin m:=public.opname_lock_machine(p_id); if auth.uid() is null or m.mandor_id is null or m.mandor_id is distinct from auth.uid() or m.status <> 'DRAFT' then raise exception 'Hanya penanggung jawab dapat menyelesaikan draft'; end if; update public.opname_machines set status='COMPLETED',completed_at=now() where id=p_id; end $$;
create function public.opname_reopen(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin if not public.is_admin() then raise exception 'Hanya Admin'; end if; m:=public.opname_lock_machine(p_id); if m.status <> 'COMPLETED' then raise exception 'Mesin belum selesai'; end if; update public.opname_machines set status='DRAFT',completed_at=null where id=p_id; end $$;
create function public.opname_close(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_status text; unfinished bigint;
begin
 if not public.is_admin() then raise exception 'Hanya Admin'; end if;
 -- The same session row is locked first by all machine mutations.
 select status into current_status from public.opname_sessions where id=p_id for update;
 if current_status is distinct from 'OPEN' then raise exception 'Sesi tidak terbuka'; end if;
 select count(*) into unfinished from public.opname_machines where session_id=p_id and status <> 'COMPLETED';
 if unfinished > 0 then raise exception 'Sesi belum dapat ditutup: % mesin belum selesai', unfinished; end if;
 update public.opname_sessions set status='CLOSED' where id=p_id;
end $$;
revoke all on function public.opname_lock_machine(bigint) from public, anon, authenticated;
revoke all on function public.opname_create_session(text,date), public.opname_claim(bigint), public.opname_save_item(bigint,text,integer,numeric,numeric,bigint), public.opname_delete_item(bigint,bigint), public.opname_complete(bigint), public.opname_reopen(bigint), public.opname_close(bigint) from public, anon;
grant execute on function public.opname_create_session(text,date), public.opname_claim(bigint), public.opname_save_item(bigint,text,integer,numeric,numeric,bigint), public.opname_delete_item(bigint,bigint), public.opname_complete(bigint), public.opname_reopen(bigint), public.opname_close(bigint) to authenticated;

commit;
