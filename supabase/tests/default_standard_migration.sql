-- Disposable database ONLY: requires 001-006, applies migration 007 and commits fixture data.
\set ON_ERROR_STOP on
insert into auth.users(id,email) values ('73000000-0000-0000-0000-000000000001','standard-migration@example.invalid');
insert into public.profiles(id,role) values ('73000000-0000-0000-0000-000000000001','admin');
insert into public.materials(code,name,kg_per_bag) values ('STD-NULL','Synthetic Mixing WIP OK',null),('STD-20','Synthetic Mixing Blue WIP OK',20),('STD-26','Synthetic Mixing White WIP OK',26),('STD-OTHER','Injection WIP OK',null);
insert into public.machines(number,name) values ('STD-TEST','test') returning id as machine_id \gset
insert into public.opname_sessions(name,opname_date,status,created_by) values ('STD-TEST',current_date,'CLOSED','73000000-0000-0000-0000-000000000001') returning id as session_id \gset
insert into public.opname_machines(session_id,machine_id,machine_number,machine_name,mandor_id,status,started_at,completed_at) values (:session_id,:machine_id,'STD-TEST','test','73000000-0000-0000-0000-000000000001','COMPLETED',now(),now()) returning id as opname_id \gset
insert into public.opname_items(opname_machine_id,material_code,material_name,whole_bags,kg_per_bag,open_kg,hopper_kg) values (:opname_id,'STD-NULL','Synthetic Mixing WIP OK',1,20,0,0);
\ir ../migrations/202611050007_default_material_standard.sql
do $$ begin
 if not exists(select 1 from public.materials where code='STD-NULL' and kg_per_bag=25) or not exists(select 1 from public.materials where code='STD-20' and kg_per_bag=20) or not exists(select 1 from public.materials where code='STD-26' and kg_per_bag=26) or not exists(select 1 from public.materials where code='STD-OTHER' and kg_per_bag is null) then raise exception 'Backfill mengubah nilai yang tidak sesuai'; end if;
 if not exists(select 1 from public.opname_items where material_code='STD-NULL' and kg_per_bag=20 and actual_kg=20) then raise exception 'Histori opname berubah';end if;
end $$;
