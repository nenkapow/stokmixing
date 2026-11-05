-- Run only in a disposable Supabase database after migrations 001-006. All changes roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('70000000-0000-0000-0000-000000000001','master-admin@example.invalid'),('70000000-0000-0000-0000-000000000002','master-mandor@example.invalid');
insert into public.profiles(id,role) values ('70000000-0000-0000-0000-000000000001','admin'),('70000000-0000-0000-0000-000000000002','mandor');
insert into public.materials(code,name,kg_per_bag,active,updated_at) values ('SAFE-OLD','Old Mixing WIP OK',25,false,'2020-01-01T00:00:00Z');
insert into public.machines(number,name) values ('SAFE-TEST','Test') returning id as machine_id \gset
insert into public.opname_sessions(name,opname_date,status,created_by) values ('SAFE-TEST','2026-01-01','CLOSED','70000000-0000-0000-0000-000000000001') returning id as session_id \gset
insert into public.opname_machines(session_id,machine_id,machine_number,machine_name,mandor_id,status,started_at,completed_at) values (:session_id,:machine_id,'SAFE-TEST','Test','70000000-0000-0000-0000-000000000002','COMPLETED',now(),now()) returning id as opname_machine_id \gset
insert into public.opname_items(opname_machine_id,material_code,material_name,whole_bags,kg_per_bag,open_kg,hopper_kg) values (:opname_machine_id,'SAFE-OLD','Old Mixing WIP OK',1,25,1,2);
insert into public.finac_snapshots(session_id,version,filename,imported_by,material_count,qty_is_kg,cost_per_kg) values (:session_id,1,'synthetic.csv','70000000-0000-0000-0000-000000000001',1,true,true) returning id as snapshot_id \gset
insert into public.finac_snapshot_items(snapshot_id,code,name,system_qty,average_cost,total_value) values (:snapshot_id,'SAFE-OLD','Old Mixing WIP OK',30,5,150);
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);
do $$ declare n integer; payload jsonb := '[{"code":"SAFE-A","name":"Base Mixing Blue WIP OK"},{"code":"SAFE-A","name":"Base Mixing Blue WIP OK"},{"code":"SAFE-B","name":"Cover Mixing WIP OK"},{"code":"SAFE-OLD","name":"Different Mixing WIP OK"}]'::jsonb;
begin
 n:=public.import_materials(payload,'first.csv');if n<>2 then raise exception 'Impor pertama: %',n; end if;
 n:=public.import_materials(payload,'second.csv');if n<>0 then raise exception 'Impor kedua: %',n; end if;
 n:=public.import_materials('[{"code":"SAFE-A","name":"Base Mixing Blue WIP OK"},{"code":"SAFE-1","name":"Mixing WIP OK"},{"code":"SAFE-2","name":"Mixing WIP OK"},{"code":"SAFE-3","name":"Mixing WIP OK"},{"code":"SAFE-4","name":"Mixing WIP OK"},{"code":"SAFE-5","name":"Mixing WIP OK"}]'::jsonb,'third.csv');if n<>5 then raise exception 'Impor ketiga: %',n; end if;
 if not exists(select 1 from public.materials where code='SAFE-OLD' and name='Old Mixing WIP OK' and kg_per_bag=25 and active=false and updated_at='2020-01-01T00:00:00Z'::timestamptz) then raise exception 'Master lama berubah'; end if;
 if (select count(*) from public.materials where code='SAFE-A')<>1 then raise exception 'Duplikat material'; end if;
 if (select array_agg(imported_count order by id) from public.material_imports where filename in ('first.csv','second.csv','third.csv')) <> array[2,0,5] then raise exception 'Jumlah histori impor salah'; end if;
 if not exists(select 1 from public.opname_items where material_code='SAFE-OLD' and material_name='Old Mixing WIP OK' and actual_kg=28) then raise exception 'Histori opname berubah'; end if;
 if not exists(select 1 from public.finac_snapshot_items where code='SAFE-OLD' and system_qty=30 and average_cost=5) then raise exception 'Snapshot FINAC berubah'; end if;
 begin perform public.import_materials('[{"code":"SAFE-SIDE","name":"Mixing WIP OK"},{"code":"SAFE-CONFLICT","name":"Mixing Blue WIP OK"},{"code":"SAFE-CONFLICT","name":"Mixing White WIP OK"}]','conflict.csv');raise exception 'Konflik diterima'; exception when raise_exception then if sqlerrm <> 'Conflicting names for material code' then raise; end if; end;
 if exists(select 1 from public.materials where code='SAFE-SIDE') then raise exception 'Impor konflik tersimpan sebagian'; end if;
 begin perform public.import_materials('[{"code":"SAFE-NON","name":"Injection WIP OK"}]','bad.csv');raise exception 'Non-Mixing diterima'; exception when raise_exception then if sqlerrm <> 'Invalid material' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',true);
do $$ begin begin perform public.import_materials('[{"code":"SAFE-M","name":"Mixing WIP OK"}]','bad.csv');raise exception 'Mandor dapat impor'; exception when insufficient_privilege then null; end; end $$;
rollback;
