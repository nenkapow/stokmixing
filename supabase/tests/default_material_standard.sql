-- Run only on a disposable Supabase database AFTER migration 007.
-- To test the backfill itself, seed STD-NULL, STD-20, STD-26 and STD-OTHER
-- BEFORE migration 007; see README for the exact seed and expected values.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('71000000-0000-0000-0000-000000000001','standard-admin@example.invalid'),('71000000-0000-0000-0000-000000000002','standard-mandor@example.invalid');
insert into public.profiles(id,role) values ('71000000-0000-0000-0000-000000000001','admin'),('71000000-0000-0000-0000-000000000002','mandor');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
do $$ begin
 if public.import_materials('[{"code":"STD-NEW","name":"Synthetic Mixing Blue WIP OK"}]','test.csv')<>1 then raise exception 'Impor gagal'; end if;
 if not exists(select 1 from public.materials where code='STD-NEW' and kg_per_bag=25) then raise exception 'Standar baru bukan 25'; end if;
 update public.materials set kg_per_bag=20 where code='STD-NEW';
 if public.import_materials('[{"code":"STD-NEW","name":"Synthetic Mixing Blue WIP OK"}]','test.csv')<>0 then raise exception 'Impor ulang tidak dilewati'; end if;
 if not exists(select 1 from public.materials where code='STD-NEW' and kg_per_bag=20) then raise exception 'Standar lama berubah'; end if;
end $$;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000002',true);
do $$ declare n integer; begin update public.materials set kg_per_bag=26 where code='STD-NEW';get diagnostics n=row_count;if n<>0 then raise exception 'Mandor dapat mengubah standar';end if;end $$;
rollback;
