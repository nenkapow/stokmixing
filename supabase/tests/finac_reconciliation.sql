-- Disposable Supabase database only, after migrations 001 through 004. Rollback on completion.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('50000000-0000-0000-0000-000000000001','finac-admin@example.invalid'),('50000000-0000-0000-0000-000000000002','finac-mandor@example.invalid');
insert into public.profiles(id,role) values ('50000000-0000-0000-0000-000000000001','admin'),('50000000-0000-0000-0000-000000000002','mandor');
insert into public.opname_sessions(name,opname_date,status,created_by) values ('FINAC-TEST-A',current_date,'CLOSED','50000000-0000-0000-0000-000000000001'),('FINAC-TEST-B',current_date,'CLOSED','50000000-0000-0000-0000-000000000001');
update public.opname_sessions set status='OPEN' where name='FINAC-TEST-A';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select id as session_a from public.opname_sessions where name='FINAC-TEST-A' \gset
select id as session_b from public.opname_sessions where name='FINAC-TEST-B' \gset
select public.finac_import_snapshot(:session_a,'a.csv',true,true,false,0,'[{"code":"X","name":"X Mixing WIP OK","system_qty":"0","average_cost":"2.5","total_value":"0"}]');
reset role;
update public.opname_sessions set status='CLOSED' where name='FINAC-TEST-A';
update public.opname_sessions set status='OPEN' where name='FINAC-TEST-B';
set local role authenticated;
select public.finac_import_snapshot(:session_b,'b.csv',true,false,false,0,'[{"code":"X","name":"X Mixing WIP OK","system_qty":"9","average_cost":"3","total_value":"27"}]');
reset role;
update public.opname_sessions set status='CLOSED' where name='FINAC-TEST-B';
update public.opname_sessions set status='OPEN' where name='FINAC-TEST-A';
set local role authenticated;
do $$ declare a bigint; b bigint; begin
 select id into a from public.opname_sessions where name='FINAC-TEST-A'; select id into b from public.opname_sessions where name='FINAC-TEST-B';
 if (public.finac_report(a)->'snapshot'->'items'->0->>'system_qty') <> '0' or (public.finac_report(b)->'snapshot'->'items'->0->>'system_qty') <> '9' then raise exception 'Snapshot sesi tercampur'; end if;
 begin perform public.finac_import_snapshot(a,'a2.csv',true,true,false,1,'[{"code":"X","name":"X Mixing WIP OK","system_qty":"1"}]'); raise exception 'Penggantian tanpa konfirmasi diterima'; exception when raise_exception then if sqlerrm not like '%Konfirmasi%' then raise; end if; end;
 begin perform public.finac_import_snapshot(a,'a2.csv',true,true,true,0,'[{"code":"X","name":"X Mixing WIP OK","system_qty":"1"}]'); raise exception 'Versi lama diterima'; exception when raise_exception then if sqlerrm not like '%berubah%' then raise; end if; end;
 begin perform public.finac_import_snapshot(a,'bad.csv',true,true,true,1,'[{"code":"X","name":"X Mixing WIP OK","system_qty":"1"},{"code":"X","name":"X Mixing WIP OK","system_qty":"2"}]'); raise exception 'Duplikat diterima'; exception when unique_violation then null; end;
 if (select count(*) from public.finac_snapshots where session_id=a) <> 1 then raise exception 'Impor gagal tersimpan sebagian'; end if;
 perform public.finac_import_snapshot(a,'a2.csv',true,true,true,1,'[{"code":"X","name":"X Mixing WIP OK","system_qty":"3"}]');
 if (select count(*) from public.finac_snapshots where session_id=a) <> 2 or (public.finac_report(a)->'snapshot'->>'version')::int <> 2 then raise exception 'Histori snapshot tidak dipertahankan'; end if;
end $$;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
do $$ begin
 if exists(select 1 from public.finac_snapshot_items) or exists(select 1 from public.finac_snapshots) then raise exception 'Mandor dapat membaca FINAC'; end if;
 begin perform public.finac_report(0); raise exception 'Mandor dapat membaca laporan'; exception when insufficient_privilege then null; end;
 begin perform public.finac_import_snapshot(0,'x',true,true,false,0,'[]'); raise exception 'Mandor dapat mengimpor'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform count(*) from public.finac_snapshot_items; raise exception 'Anon dapat membaca harga'; exception when insufficient_privilege then null; end; begin perform public.finac_report(0); raise exception 'Anon dapat membaca laporan'; exception when insufficient_privilege then null; end; end $$;
rollback;
