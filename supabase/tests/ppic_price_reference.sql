-- Disposable Supabase database only after 001-008; changes roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values ('72000000-0000-0000-0000-000000000001','price-admin@example.invalid'),('72000000-0000-0000-0000-000000000002','price-mandor@example.invalid');
insert into public.profiles(id,role) values ('72000000-0000-0000-0000-000000000001','admin'),('72000000-0000-0000-0000-000000000002','mandor');
insert into public.materials(code,name,kg_per_bag) values ('PPIC-TEST','Synthetic Mixing WIP OK',25),('PPIC-EXTRA','Synthetic Mixing WIP OK',25);
insert into public.opname_sessions(name,opname_date,status,created_by) values ('PPIC-TEST',current_date,'OPEN','72000000-0000-0000-0000-000000000001') returning id as session_id \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);
select set_config('test.session', :'session_id',true);
do $$ declare s bigint:=current_setting('test.session')::bigint; result jsonb; n integer; begin
 n:=public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Synthetic Mixing WIP OK","price":"34.4841234567","expected_version":0}]');if n<>1 then raise exception 'Harga awal gagal';end if;
 n:=public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Synthetic Mixing WIP OK","price":"34.4841234567","expected_version":1}]');if n<>0 then raise exception 'Harga identik menambah versi';end if;
 perform public.finac_import_snapshot(s,'test.csv',true,true,false,0,'[{"code":"PPIC-TEST","name":"Synthetic Mixing WIP OK","system_qty":"30","average_cost":"9"}]');
 perform public.ppic_set_session_prices(s,'PPIC',true,0);
 n:=public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Synthetic Mixing WIP OK","price":"36","expected_version":1,"confirm_changed":true}]');if n<>1 then raise exception 'Harga baru gagal';end if;
 result:=public.ppic_session_price_report(s);if result->'items'->0->>'price'<>'34.4841234567' then raise exception 'Snapshot berubah setelah master diperbarui';end if;
 if (select count(*) from public.ppic_price_versions where code='PPIC-TEST')<>2 then raise exception 'Histori versi salah';end if;
 begin perform public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-EXTRA","name":"Synthetic Mixing WIP OK","price":"10","expected_version":0},{"code":"NOT-FOUND","name":"Synthetic Mixing WIP OK","price":"10","expected_version":0}]');raise exception 'Impor rusak diterima';exception when raise_exception then if sqlerrm not like '%perlu diperiksa%' then raise;end if;end;
 if exists(select 1 from public.ppic_price_versions where code='PPIC-EXTRA') then raise exception 'Impor gagal tersimpan sebagian';end if;
 begin perform public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Synthetic Mixing WIP OK","price":"40","expected_version":2}]');raise exception 'Perubahan tanpa konfirmasi diterima';exception when raise_exception then if sqlerrm not like '%Konfirmasi%' then raise;end if;end;
 begin perform public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Synthetic Mixing WIP OK","price":"40","expected_version":1,"confirm_changed":true}]');raise exception 'Versi lama diterima';exception when raise_exception then if sqlerrm not like '%muat ulang%' then raise;end if;end;

 begin perform public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Nama berbeda","price":"36","expected_version":2}]');raise exception 'Nama berbeda tanpa konfirmasi diterima';exception when raise_exception then if sqlerrm not like '%perbedaan nama%' then raise;end if;end;
 n:=public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[{"code":"PPIC-TEST","name":"Nama berbeda","price":"36","expected_version":2,"confirm_name":true}]');if n<>0 then raise exception 'Harga sama berubah';end if;
 perform public.ppic_set_session_prices(s,'FINAC',true,1);result:=public.ppic_session_price_report(s);if result->>'source'<>'FINAC' or result->'items'->0->>'price'<>'9' then raise exception 'Pemilihan FINAC eksplisit gagal';end if;
 perform public.opname_close(s);
 begin perform public.ppic_set_session_prices(s,'FINAC',true,2);raise exception 'Sesi tertutup diubah';exception when raise_exception then if sqlerrm not like '%tidak terbuka%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000002',true);
do $$ begin if exists(select 1 from public.ppic_price_versions) then raise exception 'Mandor membaca harga';end if;begin perform public.ppic_admin_catalog();raise exception 'Mandor membaca katalog';exception when insufficient_privilege then null;end;begin perform public.ppic_import_prices('test.xlsx','sheet',current_date,true,'[]');raise exception 'Mandor dapat impor';exception when insufficient_privilege then null;end;end $$;
reset role;set local role anon;
do $$ begin begin perform count(*) from public.ppic_price_versions;raise exception 'Anon membaca harga';exception when insufficient_privilege then null;end;end $$;
rollback;
