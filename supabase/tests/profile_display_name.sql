-- Run only against a disposable Supabase database after migrations 1A, 1B and 003.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('40000000-0000-0000-0000-000000000001','profile-admin@example.invalid'),('40000000-0000-0000-0000-000000000002','profile-mandor-a@example.invalid'),('40000000-0000-0000-0000-000000000003','profile-mandor-b@example.invalid');
insert into public.profiles(id,role,display_name) values ('40000000-0000-0000-0000-000000000001','admin','Admin Test'),('40000000-0000-0000-0000-000000000002','mandor',null),('40000000-0000-0000-0000-000000000003','mandor','Mandor B');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000001',true);
update public.profiles set display_name='Mandor A' where id='40000000-0000-0000-0000-000000000002';
do $$ begin
 if not exists (select 1 from public.profiles where id='40000000-0000-0000-0000-000000000002' and display_name='Mandor A') then raise exception 'Admin tidak dapat mengelola nama'; end if;
 begin update public.profiles set role='admin' where id='40000000-0000-0000-0000-000000000002'; raise exception 'Admin dapat mengubah role melalui aplikasi'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','40000000-0000-0000-0000-000000000002',true);
do $$ declare changed int; begin
 if not exists(select 1 from public.profiles where id=auth.uid() and display_name='Mandor A') then raise exception 'Mandor tidak dapat membaca profilnya'; end if;
 if exists(select 1 from public.profiles where id='40000000-0000-0000-0000-000000000003') then raise exception 'Mandor dapat membaca profil pengguna lain'; end if;
 update public.profiles set display_name='Nama palsu' where id=auth.uid(); get diagnostics changed=row_count; if changed<>0 then raise exception 'Mandor dapat mengubah nama'; end if;
 begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Mandor dapat menaikkan peran'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform count(*) from public.profiles; raise exception 'Anon dapat membaca profil'; exception when insufficient_privilege then null; end; end $$;
rollback;
