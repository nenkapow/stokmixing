-- Dedicated project, after migrations 001-007. Review and test before applying.
begin;
create table public.ppic_price_versions (
 id bigint generated always as identity primary key, code text not null references public.materials(code), source_name text not null,
 price numeric not null check(price>=0 and price not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)), unit text not null check(unit='KG'),
 source_date date not null, filename text not null, worksheet text not null, imported_at timestamptz not null default now(), imported_by uuid not null references auth.users(id), version integer not null check(version>0), unique(code,version)
);
create table public.ppic_session_selections (
 id bigint generated always as identity primary key, session_id bigint not null references public.opname_sessions(id), version integer not null check(version>0), source text not null check(source in ('PPIC','FINAC','LEGACY_FINAC')),
 finac_snapshot_id bigint references public.finac_snapshots(id), selected_by uuid references auth.users(id), selected_at timestamptz not null default now(), unique(session_id,version)
);
create table public.ppic_session_prices (
 selection_id bigint not null references public.ppic_session_selections(id), code text not null, price numeric, price_version_id bigint references public.ppic_price_versions(id), primary key(selection_id,code),
 check(price is null or (price>=0 and price not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)))
);
alter table public.ppic_price_versions enable row level security;
alter table public.ppic_session_selections enable row level security;
alter table public.ppic_session_prices enable row level security;
revoke all on public.ppic_price_versions,public.ppic_session_selections,public.ppic_session_prices from public,anon,authenticated;
grant select on public.ppic_price_versions,public.ppic_session_selections,public.ppic_session_prices to authenticated;
create policy ppic_versions_admin on public.ppic_price_versions for select to authenticated using(public.is_admin());
create policy ppic_selections_admin on public.ppic_session_selections for select to authenticated using(public.is_admin());
create policy ppic_session_prices_admin on public.ppic_session_prices for select to authenticated using(public.is_admin());
-- Freeze existing closed sessions' previously confirmed FINAC prices for backward compatibility.
with legacy as (
 insert into public.ppic_session_selections(session_id,version,source,finac_snapshot_id)
 select s.id,1,'LEGACY_FINAC',f.id from public.opname_sessions s join lateral (select id from public.finac_snapshots where session_id=s.id order by version desc limit 1) f on true where s.status='CLOSED'
 returning id,finac_snapshot_id
)
insert into public.ppic_session_prices(selection_id,code,price)
select l.id,i.code,case when f.cost_per_kg then i.average_cost else null end from legacy l join public.finac_snapshots f on f.id=l.finac_snapshot_id join public.finac_snapshot_items i on i.snapshot_id=f.id;
create function public.ppic_import_prices(p_filename text,p_worksheet text,p_date date,p_confirm_per_kg boolean,p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb; current_version integer; old_price numeric; n integer:=0;
begin
 if not public.is_admin() then raise exception 'Hanya Admin' using errcode='42501'; end if;
 if nullif(trim(p_filename),'') is null or nullif(trim(p_worksheet),'') is null or p_date is null or p_confirm_per_kg is distinct from true or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Konfirmasi atau data tidak valid'; end if;
 if jsonb_array_length(p_rows)=0 then raise exception 'Data kosong'; end if;
 perform pg_catalog.pg_advisory_xact_lock(810070008);
 if exists(select 1 from jsonb_array_elements(p_rows) x group by trim(x->>'code') having count(*)>1) then raise exception 'Kode duplikat'; end if;
 for r in select * from jsonb_array_elements(p_rows) loop
  if nullif(trim(r->>'code'),'') is null or nullif(trim(r->>'name'),'') is null or coalesce(r->>'price','') !~ '^[0-9]{1,18}(\.[0-9]{1,18})?$' or coalesce(r->>'expected_version','') !~ '^[0-9]{1,9}$' or not exists(select 1 from public.materials m where m.code=trim(r->>'code')) then raise exception 'Harga atau material perlu diperiksa'; end if;
  if exists(select 1 from public.materials m where m.code=trim(r->>'code') and lower(regexp_replace(trim(m.name),'[[:space:]]+',' ','g'))<>lower(regexp_replace(trim(r->>'name'),'[[:space:]]+',' ','g'))) and coalesce((r->>'confirm_name')::boolean,false)=false then raise exception 'Konfirmasi perbedaan nama diperlukan'; end if;
  select version,price into current_version,old_price from public.ppic_price_versions where code=trim(r->>'code') order by version desc limit 1;
  current_version:=coalesce(current_version,0);
  if current_version<>(r->>'expected_version')::integer then raise exception 'Harga berubah; muat ulang preview'; end if;
  if current_version>0 and old_price<>(r->>'price')::numeric and coalesce((r->>'confirm_changed')::boolean,false)=false then raise exception 'Konfirmasi perubahan harga diperlukan'; end if;
  if current_version=0 or old_price<>(r->>'price')::numeric then
   insert into public.ppic_price_versions(code,source_name,price,unit,source_date,filename,worksheet,imported_by,version) values(trim(r->>'code'),r->>'name',(r->>'price')::numeric,'KG',p_date,left(trim(p_filename),255),left(trim(p_worksheet),255),auth.uid(),current_version+1);n:=n+1;
  end if;
 end loop;
 return n;
end $$;
create function public.ppic_set_session_prices(p_session bigint,p_source text,p_confirm boolean,p_expected_version integer) returns bigint language plpgsql security definer set search_path='' as $$
declare selection bigint; v integer; status text; chosen_snapshot_id bigint; confirmed boolean;
begin
 if not public.is_admin() then raise exception 'Hanya Admin' using errcode='42501'; end if;
 if p_source not in ('PPIC','FINAC') or p_confirm is distinct from true or p_expected_version is null then raise exception 'Konfirmasi sumber harga diperlukan'; end if;
 select s.status into status from public.opname_sessions s where s.id=p_session for update;
 if status is distinct from 'OPEN' then raise exception 'Sesi tidak terbuka'; end if;
 select coalesce(max(version),0) into v from public.ppic_session_selections where session_id=p_session;
 if v<>p_expected_version then raise exception 'Pilihan harga berubah; muat ulang'; end if;
 select id,cost_per_kg into chosen_snapshot_id,confirmed from public.finac_snapshots where session_id=p_session order by version desc limit 1;
 if p_source='FINAC' and (chosen_snapshot_id is null or confirmed is distinct from true) then raise exception 'Harga FINAC per KG belum dikonfirmasi'; end if;
 insert into public.ppic_session_selections(session_id,version,source,finac_snapshot_id,selected_by) values(p_session,v+1,p_source,chosen_snapshot_id,auth.uid()) returning id into selection;
 with codes as (select i.code from public.finac_snapshot_items i where i.snapshot_id=chosen_snapshot_id union select i.material_code from public.opname_items i join public.opname_machines m on m.id=i.opname_machine_id where m.session_id=p_session)
 insert into public.ppic_session_prices(selection_id,code,price,price_version_id)
 select selection,c.code,case when p_source='PPIC' then pv.price else fi.average_cost end,case when p_source='PPIC' then pv.id else null end from codes c
 left join lateral (select id,price from public.ppic_price_versions where code=c.code order by version desc limit 1) pv on true
 left join public.finac_snapshot_items fi on fi.snapshot_id=chosen_snapshot_id and fi.code=c.code;
 return selection;
end $$;
create function public.ppic_session_price_report(p_session bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Hanya Admin' using errcode='42501'; end if;
 if not exists(select 1 from public.opname_sessions where id=p_session) then raise exception 'Sesi tidak ditemukan'; end if;
 select jsonb_build_object('version',s.version,'source',s.source,'selected_at',s.selected_at,'selected_by',s.selected_by,'finac_snapshot_id',s.finac_snapshot_id,'finac_snapshot_version',(select f.version from public.finac_snapshots f where f.id=s.finac_snapshot_id),'items',coalesce((select jsonb_agg(jsonb_build_object('code',i.code,'price',i.price::text,'price_version_id',i.price_version_id,'price_version',v.version) order by i.code) from public.ppic_session_prices i left join public.ppic_price_versions v on v.id=i.price_version_id where i.selection_id=s.id),'[]'::jsonb)) into result from public.ppic_session_selections s where s.session_id=p_session order by s.version desc limit 1;
 return result;
end $$;
create function public.ppic_admin_catalog() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Hanya Admin' using errcode='42501'; end if;
 return jsonb_build_object('materials',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name) order by code) from public.materials),'[]'::jsonb),'prices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'code',code,'source_name',source_name,'price',price::text,'version',version,'source_date',source_date,'filename',filename,'worksheet',worksheet,'imported_at',imported_at,'imported_by',imported_by) order by code,version desc) from public.ppic_price_versions),'[]'::jsonb));
end $$;
revoke all on function public.ppic_admin_catalog() from public,anon;
grant execute on function public.ppic_admin_catalog() to authenticated;
revoke all on function public.ppic_import_prices(text,text,date,boolean,jsonb),public.ppic_set_session_prices(bigint,text,boolean,integer),public.ppic_session_price_report(bigint) from public,anon;
grant execute on function public.ppic_import_prices(text,text,date,boolean,jsonb),public.ppic_set_session_prices(bigint,text,boolean,integer),public.ppic_session_price_report(bigint) to authenticated;
commit;
