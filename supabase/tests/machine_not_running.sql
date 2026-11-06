-- Disposable Supabase only, after migrations 001-009; all changes roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('90000000-0000-0000-0000-000000000001','nr-admin@example.invalid'),('90000000-0000-0000-0000-000000000002','nr-a@example.invalid'),('90000000-0000-0000-0000-000000000003','nr-b@example.invalid');
insert into public.profiles(id,role,display_name) values ('90000000-0000-0000-0000-000000000001','admin','Admin Uji'),('90000000-0000-0000-0000-000000000002','mandor','Mandor A'),('90000000-0000-0000-0000-000000000003','mandor','Mandor B');
insert into public.materials(code,name,kg_per_bag) values ('NR-TEST','Synthetic Mixing WIP OK',25);
insert into public.machines(number,name) values ('NR-1','Test'),('NR-2','Test'),('NR-3','Test'),('NR-4','Test');
insert into public.opname_sessions(name,opname_date,status,created_by) values ('NR-TEST',current_date,'OPEN','90000000-0000-0000-0000-000000000001') returning id as session_id \gset
insert into public.opname_machines(session_id,machine_id,machine_number,machine_name) select :session_id,id,number,name from public.machines where number in ('NR-1','NR-2','NR-3','NR-4');
select set_config('test.nr_session', :'session_id', true);
set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000002',true);
do $$ declare m1 bigint; begin
 select id into m1 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-1';
 perform public.opname_mark_not_running(m1);
 if not exists(select 1 from public.opname_machines where id=m1 and status='NOT_RUNNING' and mandor_id=auth.uid() and started_at is not null and completed_at is not null) then raise exception 'Klaim atomik gagal'; end if;
 if exists(select 1 from public.opname_items where opname_machine_id=m1) then raise exception 'Material palsu dibuat'; end if;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000003',true);
do $$ declare m1 bigint; begin select id into m1 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-1';
 begin perform public.opname_cancel_not_running(m1);raise exception 'Mandor lain dapat membatalkan';exception when insufficient_privilege then null;end;
 begin perform public.opname_mark_not_running(m1);raise exception 'Mandor lain dapat mengklaim';exception when raise_exception then if sqlerrm not like '%diklaim%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000002',true);
do $$ declare m1 bigint;m3 bigint;m4 bigint; begin
 select id into m1 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-1';
 perform public.opname_cancel_not_running(m1);if not exists(select 1 from public.opname_machines where id=m1 and status='DRAFT' and completed_at is null) then raise exception 'Pembatalan gagal';end if;
 perform public.opname_mark_not_running(m1);
 select id into m3 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-3';perform public.opname_claim(m3);perform public.opname_save_item(m3,'NR-TEST',1,0,0,null);
 begin perform public.opname_mark_not_running(m3);raise exception 'Mesin berisi material dilewati';exception when raise_exception then if sqlerrm not like '%memiliki material%' then raise;end if;end;
 perform public.opname_complete(m3);
 select id into m4 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-4';perform public.opname_claim(m4);perform public.opname_complete(m4);
 begin perform public.opname_mark_not_running(m4);raise exception 'Mesin selesai diubah';exception when raise_exception then if sqlerrm not like '%bukan draft%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000003',true);
do $$ declare m2 bigint; begin select id into m2 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-2';perform public.opname_mark_not_running(m2);end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
do $$ declare s bigint:=current_setting('test.nr_session')::bigint;m1 bigint;begin
 select id into m1 from public.opname_machines where session_id=s and machine_number='NR-1';perform set_config('test.nr_m1',m1::text,true);perform public.opname_reopen(m1);
 begin perform public.opname_close(s);raise exception 'Sesi draft ditutup';exception when raise_exception then if sqlerrm not like '%belum selesai%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000002',true);
do $$ declare m1 bigint;begin select id into m1 from public.opname_machines where session_id=current_setting('test.nr_session')::bigint and machine_number='NR-1';perform public.opname_mark_not_running(m1);end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
do $$ declare s bigint:=current_setting('test.nr_session')::bigint;begin
 if (select count(*) from public.opname_status_audit a join public.opname_machines m on m.id=a.opname_machine_id where m.session_id=s)<5 then raise exception 'Audit tidak lengkap';end if;
 perform public.opname_close(s);if not exists(select 1 from public.opname_sessions where id=s and status='CLOSED') then raise exception 'Sesi tidak tertutup';end if;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000002',true);
do $$ begin
 begin perform public.opname_cancel_not_running(current_setting('test.nr_m1')::bigint);raise exception 'Sesi tertutup dapat diubah';exception when raise_exception then if sqlerrm not like '%tidak terbuka%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','90000000-0000-0000-0000-000000000001',true);
do $$ begin begin perform public.opname_reopen(current_setting('test.nr_m1')::bigint);raise exception 'Admin mengubah sesi tertutup';exception when raise_exception then if sqlerrm not like '%tidak terbuka%' then raise;end if;end;end $$;
reset role;set local role anon;
do $$ begin begin perform public.opname_mark_not_running(0);raise exception 'Anon dapat mencatat';exception when insufficient_privilege then null;end;end $$;
rollback;
