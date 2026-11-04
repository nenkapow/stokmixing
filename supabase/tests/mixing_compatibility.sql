-- Disposable Supabase only; apply migrations 001-005 first. This transaction rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('60000000-0000-0000-0000-000000000001','mix-admin@example.invalid'),('60000000-0000-0000-0000-000000000002','mix-mandor@example.invalid');
insert into public.profiles(id,role) values ('60000000-0000-0000-0000-000000000001','admin'),('60000000-0000-0000-0000-000000000002','mandor');
insert into public.machines(number,name) values ('MIX-COMPAT-TEST','test');
insert into public.materials(code,name,kg_per_bag) values ('MIX-COMPAT','LP002 Clear Base Mixing WIP OK',25);
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
do $$ begin
 if not public.is_mixing_wip_ok('PT208 Base Mixing Blue WIP OK') or not public.is_mixing_wip_ok('LP002 Clear Base Mixing WIP OK') or not public.is_mixing_wip_ok('PT207 Base Mixing Natural WIP OK') then raise exception 'Filter menolak material valid'; end if;
 if public.is_mixing_wip_ok('Mixing WIP Reject') or public.is_mixing_wip_ok('Mixing WIP Reject WIP OK') or public.is_mixing_wip_ok('Injection WIP OK') or public.is_mixing_wip_ok('Printing WIP OK') or public.is_mixing_wip_ok('Crushing WIP OK') then raise exception 'Filter menerima material tidak valid'; end if;
end $$;
select public.import_materials('[{"code":"MIX-COMPAT","name":"PT208 Base Mixing Blue WIP OK"}]','test.csv');
do $$ begin if not exists(select 1 from public.materials where code='MIX-COMPAT' and name='PT208 Base Mixing Blue WIP OK' and kg_per_bag=25) then raise exception 'Impor tidak mempertahankan standar atau nama'; end if; end $$;
select public.opname_create_session('MIX-COMPAT-TEST',current_date) as session_id \gset
select id as machine_id from public.opname_machines where session_id=:session_id and machine_number='MIX-COMPAT-TEST' \gset
select public.finac_import_snapshot(:session_id,'test.csv',true,true,false,0,'[{"code":"MIX-COMPAT","name":"PT208 Base Mixing Blue WIP OK","system_qty":"123.1234567891","average_cost":"10.1234567891","total_value":"1245.1234567891"}]');
do $$ declare sid bigint; begin
 select id into sid from public.opname_sessions where name='MIX-COMPAT-TEST';
 if (public.finac_report(sid)->'snapshot'->'items'->0->>'system_qty')::numeric <> 123.1234567891 or (public.finac_report(sid)->'snapshot'->'items'->0->>'average_cost')::numeric <> 10.1234567891 then raise exception 'Presisi snapshot berubah'; end if;
end $$;
select set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000002',true);
select public.opname_claim(:machine_id);
select public.opname_save_item(:machine_id,'MIX-COMPAT',1,0,0,null);
do $$ begin
 if not exists(select 1 from public.opname_items where material_code='MIX-COMPAT' and actual_kg=25 and kg_per_bag=25) then raise exception 'Penyimpanan opname material berwarna gagal'; end if;
 begin perform public.finac_report(0); raise exception 'Mandor dapat membaca FINAC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.finac_report(0); raise exception 'Anon dapat membaca FINAC'; exception when insufficient_privilege then null; end; end $$;
rollback;
