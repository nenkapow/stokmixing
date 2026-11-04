-- Run with psql against a disposable Supabase database after migration. All changes roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000001','admin-test@example.invalid'),('10000000-0000-0000-0000-000000000002','mandor-test@example.invalid');
insert into public.profiles values ('10000000-0000-0000-0000-000000000001','admin'),('10000000-0000-0000-0000-000000000002','mandor');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
insert into public.materials(code,name) values ('TEST-RLS','Mixing WIP OK');
insert into public.machines(number,name) values ('TEST-RLS','Test');
update public.materials set kg_per_bag = 20 where code = 'TEST-RLS';
select public.import_materials('[{"code":"TEST-RLS","name":"LP002 30 gr Clear Base Mixing WIP OK"}]'::jsonb, 'test.xlsx');
do $$ begin
 if not exists (select 1 from public.materials where code = 'TEST-RLS' and name = 'LP002 30 gr Clear Base Mixing WIP OK' and kg_per_bag = 20) then raise exception 'Nama atau standar material berubah salah'; end if;
 begin perform public.import_materials('[{"code":"REJ","name":"LP002 Mixing WIP Reject"}]'::jsonb, 'test.xlsx'); raise exception 'Kategori reject diterima'; exception when raise_exception then if sqlerrm <> 'Invalid material' then raise; end if; end;
end $$;
do $$ begin if not public.is_admin() then raise exception 'Admin tidak dikenali'; end if; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
do $$ declare n int; begin
 if public.is_admin() then raise exception 'Mandor terdeteksi sebagai admin'; end if;
 select count(*) into n from public.materials where code='TEST-RLS'; if n <> 1 then raise exception 'Mandor tidak dapat membaca'; end if;
 update public.materials set name='changed' where code='TEST-RLS'; get diagnostics n = row_count; if n <> 0 then raise exception 'Mandor dapat mengubah material'; end if;
 update public.machines set name='changed' where number='TEST-RLS'; get diagnostics n = row_count; if n <> 0 then raise exception 'Mandor dapat mengubah mesin'; end if;
 begin perform public.import_materials('[{"code":"TEST2","name":"Mixing WIP OK"}]'::jsonb,'test'); raise exception 'Mandor dapat impor'; exception when insufficient_privilege then null; end;
 begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Mandor dapat mengubah peran'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform count(*) from public.materials; raise exception 'Anon dapat membaca material'; exception when insufficient_privilege then null; end; end $$;
rollback;
