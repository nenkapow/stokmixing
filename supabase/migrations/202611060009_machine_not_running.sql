-- Apply after 001-008 to the dedicated project, after review.
begin;
-- Replace only the two existing status-related checks, preserving all rows.
do $$ declare c record; n integer:=0; begin
 for c in select conname from pg_catalog.pg_constraint where conrelid='public.opname_machines'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%status%' loop
  execute format('alter table public.opname_machines drop constraint %I',c.conname); n:=n+1;
 end loop;
 if n<>2 then raise exception 'Unexpected opname_machines status constraints: %',n; end if;
end $$;
alter table public.opname_machines add constraint opname_machines_status_v2 check(status in ('DRAFT','COMPLETED','NOT_RUNNING'));
alter table public.opname_machines add constraint opname_machines_state_v2 check (
 (mandor_id is null and started_at is null and status='DRAFT' and completed_at is null) or
 (mandor_id is not null and started_at is not null and ((status='DRAFT' and completed_at is null) or (status in ('COMPLETED','NOT_RUNNING') and completed_at is not null)))
);
create table public.opname_status_audit (
 id bigint generated always as identity primary key, opname_machine_id bigint not null references public.opname_machines(id),
 actor_id uuid not null references auth.users(id), previous_status text not null, new_status text not null, changed_at timestamptz not null default now()
);
alter table public.opname_status_audit enable row level security;
revoke all on public.opname_status_audit from public,anon,authenticated;
grant select on public.opname_status_audit to authenticated;
create policy opname_status_audit_read on public.opname_status_audit for select to authenticated using(public.is_admin() or (actor_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid())));
-- All state transitions lock session first and machine second through opname_lock_machine.
create function public.opname_mark_not_running(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='mandor') then raise exception 'Hanya Mandor yang dapat mencatat' using errcode='42501'; end if;
 m:=public.opname_lock_machine(p_id);
 if m.mandor_id is not null and m.mandor_id<>auth.uid() then raise exception 'Mesin sudah diklaim pengguna lain'; end if;
 if m.status<>'DRAFT' then raise exception 'Mesin bukan draft'; end if;
 if exists(select 1 from public.opname_items where opname_machine_id=p_id) then raise exception 'Mesin memiliki material; periksa dan selesaikan opname'; end if;
 update public.opname_machines set mandor_id=coalesce(mandor_id,auth.uid()),started_at=coalesce(started_at,now()),status='NOT_RUNNING',completed_at=now() where id=p_id;
 insert into public.opname_status_audit(opname_machine_id,actor_id,previous_status,new_status) values(p_id,auth.uid(),'DRAFT','NOT_RUNNING');
end $$;
create function public.opname_cancel_not_running(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin
 m:=public.opname_lock_machine(p_id);
 if not public.is_admin() and not exists(select 1 from public.profiles where id=auth.uid() and role='mandor' and id=m.mandor_id) then raise exception 'Tidak berwenang' using errcode='42501'; end if;
 if m.status<>'NOT_RUNNING' then raise exception 'Mesin tidak berstatus tidak jalan'; end if;
 update public.opname_machines set status='DRAFT',completed_at=null where id=p_id;
 insert into public.opname_status_audit(opname_machine_id,actor_id,previous_status,new_status) values(p_id,auth.uid(),'NOT_RUNNING','DRAFT');
end $$;
create or replace function public.opname_reopen(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare m public.opname_machines;
begin
 if not public.is_admin() then raise exception 'Hanya Admin'; end if;
 m:=public.opname_lock_machine(p_id);
 if m.status not in ('COMPLETED','NOT_RUNNING') then raise exception 'Mesin belum selesai'; end if;
 update public.opname_machines set status='DRAFT',completed_at=null where id=p_id;
 insert into public.opname_status_audit(opname_machine_id,actor_id,previous_status,new_status) values(p_id,auth.uid(),m.status,'DRAFT');
end $$;
create or replace function public.opname_close(p_id bigint) returns void language plpgsql security definer set search_path='' as $$
declare current_status text; unfinished bigint;
begin
 if not public.is_admin() then raise exception 'Hanya Admin'; end if;
 select status into current_status from public.opname_sessions where id=p_id for update;
 if current_status is distinct from 'OPEN' then raise exception 'Sesi tidak terbuka'; end if;
 select count(*) into unfinished from public.opname_machines where session_id=p_id and status not in ('COMPLETED','NOT_RUNNING');
 if unfinished>0 then raise exception 'Sesi belum dapat ditutup: % mesin belum selesai',unfinished; end if;
 update public.opname_sessions set status='CLOSED' where id=p_id;
end $$;
-- Expose only the names for declarations in the selected open session, not profiles or prices.
create function public.opname_not_running_people(p_session bigint) returns table(opname_machine_id bigint,display_name text) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() and not exists(select 1 from public.profiles p join public.opname_sessions s on s.id=p_session where p.id=auth.uid() and p.role='mandor' and s.status='OPEN') then raise exception 'Tidak berwenang' using errcode='42501'; end if;
 return query select m.id,p.display_name from public.opname_machines m left join public.profiles p on p.id=m.mandor_id where m.session_id=p_session and m.status='NOT_RUNNING';
end $$;
revoke all on function public.opname_mark_not_running(bigint),public.opname_cancel_not_running(bigint),public.opname_not_running_people(bigint) from public,anon;
grant execute on function public.opname_mark_not_running(bigint),public.opname_cancel_not_running(bigint),public.opname_not_running_people(bigint) to authenticated;
commit;
