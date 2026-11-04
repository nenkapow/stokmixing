-- Apply after migrations 001, 002, and 003 in the dedicated project.
begin;
create table public.finac_snapshots (
 id bigint generated always as identity primary key,
 session_id bigint not null references public.opname_sessions(id),
 version integer not null check (version > 0), filename text not null check (length(trim(filename)) between 1 and 255),
 imported_by uuid not null references auth.users(id), imported_at timestamptz not null default now(),
 material_count integer not null check (material_count > 0), qty_is_kg boolean not null, cost_per_kg boolean not null,
 unique(session_id, version)
);
create table public.finac_snapshot_items (
 snapshot_id bigint not null references public.finac_snapshots(id), code text not null check (length(trim(code)) > 0),
 name text not null, system_qty numeric not null check (system_qty not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 average_cost numeric check (average_cost >= 0 and average_cost not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 total_value numeric check (total_value not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 primary key(snapshot_id,code)
);
alter table public.finac_snapshots enable row level security;
alter table public.finac_snapshot_items enable row level security;
revoke all on public.finac_snapshots,public.finac_snapshot_items from public,anon,authenticated;
grant select on public.finac_snapshots,public.finac_snapshot_items to authenticated;
create policy finac_snapshots_admin on public.finac_snapshots for select to authenticated using(public.is_admin());
create policy finac_items_admin on public.finac_snapshot_items for select to authenticated using(public.is_admin());
-- Append-only versions preserve the complete prior snapshot and its import metadata.
-- The session lock serializes concurrent imports and forces explicit replacement.
create function public.finac_import_snapshot(p_session bigint,p_filename text,p_qty_is_kg boolean,p_cost_per_kg boolean,p_replace boolean,p_expected_version integer,p_items jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare next_version integer; sid bigint; item jsonb; n integer;
begin
 if not public.is_admin() then raise exception 'Hanya Admin' using errcode='42501'; end if;
 if p_filename is null or length(trim(p_filename)) not between 1 and 255 or p_qty_is_kg is null or p_cost_per_kg is null or p_replace is null or p_expected_version is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Data impor tidak valid'; end if;
 perform 1 from public.opname_sessions where id=p_session for update;
 if not found then raise exception 'Sesi tidak ditemukan'; end if;
 select coalesce(max(version),0)+1 into next_version from public.finac_snapshots where session_id=p_session;
 if next_version-1 <> p_expected_version then raise exception 'Snapshot telah berubah; muat ulang sebelum impor'; end if;
 if next_version>1 and not p_replace then raise exception 'Konfirmasi penggantian snapshot diperlukan'; end if;
 n:=jsonb_array_length(p_items);
 insert into public.finac_snapshots(session_id,version,filename,imported_by,material_count,qty_is_kg,cost_per_kg) values(p_session,next_version,trim(p_filename),auth.uid(),n,p_qty_is_kg,p_cost_per_kg) returning id into sid;
 for item in select * from jsonb_array_elements(p_items) loop
  if nullif(trim(item->>'code'),'') is null or coalesce(item->>'name','') !~* '(^|[[:space:]])mixing[[:space:]]+wip[[:space:]]+ok($|[[:space:]])' or coalesce(item->>'system_qty','') !~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' or (item->>'average_cost' is not null and item->>'average_cost' !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$') or (item->>'total_value' is not null and item->>'total_value' !~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$') then raise exception 'Baris FINAC tidak valid'; end if;
  insert into public.finac_snapshot_items(snapshot_id,code,name,system_qty,average_cost,total_value) values(sid,trim(item->>'code'),item->>'name',(item->>'system_qty')::numeric,(item->>'average_cost')::numeric,(item->>'total_value')::numeric);
 end loop;
 return sid;
end $$;
revoke all on function public.finac_import_snapshot(bigint,text,boolean,boolean,boolean,integer,jsonb) from public,anon;
grant execute on function public.finac_import_snapshot(bigint,text,boolean,boolean,boolean,integer,jsonb) to authenticated;
-- One statement gives the report a consistent database snapshot and avoids row limits.
create function public.finac_report(p_session bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb;
begin
 if not public.is_admin() then raise exception 'Hanya Admin' using errcode='42501'; end if;
 select jsonb_build_object(
  'session',jsonb_build_object('id',s.id,'name',s.name,'opname_date',s.opname_date,'status',s.status),
  'machines',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'status',m.status,'number',m.machine_number,'mandor_name',p.display_name) order by m.id) from public.opname_machines m left join public.profiles p on p.id=m.mandor_id where m.session_id=s.id),'[]'::jsonb),
  'items',coalesce((select jsonb_agg(jsonb_build_object('machine_id',m.id,'machine_number',m.machine_number,'mandor_name',p.display_name,'code',i.material_code,'name',i.material_name,'whole',i.whole_bags,'standard',i.kg_per_bag::text,'open',i.open_kg::text,'hopper',i.hopper_kg::text,'actual',i.actual_kg::text) order by m.id,i.id) from public.opname_machines m join public.opname_items i on i.opname_machine_id=m.id left join public.profiles p on p.id=m.mandor_id where m.session_id=s.id and m.status='COMPLETED'),'[]'::jsonb),
  'snapshot',(select jsonb_build_object('id',f.id,'version',f.version,'filename',f.filename,'imported_at',f.imported_at,'imported_by',f.imported_by,'material_count',f.material_count,'qty_is_kg',f.qty_is_kg,'cost_per_kg',f.cost_per_kg,'items',coalesce((select jsonb_agg(jsonb_build_object('code',x.code,'name',x.name,'system_qty',x.system_qty::text,'average_cost',x.average_cost::text,'total_value',x.total_value::text) order by x.code) from public.finac_snapshot_items x where x.snapshot_id=f.id),'[]'::jsonb)) from public.finac_snapshots f where f.session_id=s.id order by f.version desc limit 1),
  'history',coalesce((select jsonb_agg(jsonb_build_object('version',f.version,'filename',f.filename,'imported_at',f.imported_at,'imported_by',f.imported_by,'material_count',f.material_count,'qty_is_kg',f.qty_is_kg,'cost_per_kg',f.cost_per_kg) order by f.version desc) from public.finac_snapshots f where f.session_id=s.id),'[]'::jsonb)
 ) into report from public.opname_sessions s where s.id=p_session;
 if report is null then raise exception 'Sesi tidak ditemukan'; end if;
 return report;
end $$;
revoke all on function public.finac_report(bigint) from public,anon;
grant execute on function public.finac_report(bigint) to authenticated;
commit;
