-- Disposable Supabase database, migrations 1A and 1B applied; transaction rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('20000000-0000-0000-0000-000000000001','op-admin@example.invalid'),('20000000-0000-0000-0000-000000000002','op-mandor-a@example.invalid'),('20000000-0000-0000-0000-000000000003','op-mandor-b@example.invalid');
insert into public.profiles(id,role) values ('20000000-0000-0000-0000-000000000001','admin'),('20000000-0000-0000-0000-000000000002','mandor'),('20000000-0000-0000-0000-000000000003','mandor');
insert into public.machines(number,name) values ('OP-TEST-1','Test 1'),('OP-TEST-2','Test 2');
insert into public.materials(code,name,kg_per_bag) values ('OP-A','A Mixing WIP OK',25),('OP-B','B Mixing WIP OK',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select public.opname_create_session('Test', current_date) as session_id \gset
select id as machine_a from public.opname_machines where session_id=:session_id and machine_number='OP-TEST-1' \gset
select id as machine_b from public.opname_machines where session_id=:session_id and machine_number='OP-TEST-2' \gset
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
select public.opname_claim(:machine_a);
select public.opname_save_item(:machine_a,'OP-A',4,7,8,null) as item_a \gset
select public.opname_save_item(:machine_a,'OP-B',0,3,1,null);
do $$ begin
 if not exists(select 1 from public.opname_items where material_code='OP-A' and actual_kg=115 and kg_per_bag=25) then raise exception 'Total salah'; end if;
 begin perform public.opname_save_item((select id from public.opname_machines where machine_number='OP-TEST-1'),'OP-A',1,0,0,null); raise exception 'Duplikat diterima'; exception when unique_violation then null; end;
 begin perform public.opname_save_item((select id from public.opname_machines where machine_number='OP-TEST-1'),'OP-B',1,0,0,null); raise exception 'Standar kosong diterima'; exception when raise_exception then if sqlerrm not like '%standar%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
do $$ begin
 begin perform public.opname_claim((select id from public.opname_machines where machine_number='OP-TEST-1')); raise exception 'Klaim orang lain diterima'; exception when raise_exception then if sqlerrm not like '%diklaim%' then raise; end if; end;
 if exists(select 1 from public.opname_items) then raise exception 'Mandor membaca item milik orang lain'; end if;
end $$;
select public.opname_claim(:machine_b);
select public.opname_save_item(:machine_b,'OP-A',2,0,0,null);
select public.opname_complete(:machine_b);
do $$ begin
 begin perform public.opname_save_item((select id from public.opname_machines where machine_number='OP-TEST-2'),'OP-B',0,0,0,null); raise exception 'Mesin selesai dapat diubah'; exception when raise_exception then if sqlerrm not like '%draft%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select public.opname_reopen(:machine_b);
select public.opname_close(:session_id);
do $$ begin
 begin perform public.opname_claim((select id from public.opname_machines where machine_number='OP-TEST-2')); raise exception 'Sesi tertutup dapat diubah'; exception when raise_exception then if sqlerrm not like '%terbuka%' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform count(*) from public.opname_sessions; raise exception 'Anon dapat membaca'; exception when insufficient_privilege then null; end; end $$;
rollback;
