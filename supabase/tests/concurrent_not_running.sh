#!/usr/bin/env bash
# Only a disposable Supabase database; creates uniquely named synthetic fixtures.
set -euo pipefail
: "${SUPABASE_TEST_DATABASE_URL:?Set a disposable Supabase URL}" "${OPNAME_ALLOW_DESTRUCTIVE_TEST:?Set OPNAME_ALLOW_DESTRUCTIVE_TEST=yes}"
[[ "$OPNAME_ALLOW_DESTRUCTIVE_TEST" = yes ]]
test_dir=$(mktemp -d); a=$(cat /proc/sys/kernel/random/uuid); b=$(cat /proc/sys/kernel/random/uuid); run=$(cat /proc/sys/kernel/random/uuid); created=0
cleanup(){ local result=$?;trap - EXIT
 if [[ "$created" = 1 ]];then
  if ! psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v sid="$sid" -v a="$a" -v b="$b" -v run="$run" <<'SQL'
begin;
delete from public.opname_status_audit where opname_machine_id in(select id from public.opname_machines where session_id=:'sid'::bigint);
delete from public.opname_items where opname_machine_id in(select id from public.opname_machines where session_id=:'sid'::bigint);
delete from public.opname_machines where session_id=:'sid'::bigint;
delete from public.opname_sessions where id=:'sid'::bigint and created_by=:'a'::uuid;
delete from public.machines where number in (:'run'||'-1',:'run'||'-2');
delete from public.materials where code=:'run';
delete from public.profiles where id in (:'a'::uuid,:'b'::uuid);
delete from auth.users where id in (:'a'::uuid,:'b'::uuid);
commit;
SQL
  then echo 'Cleanup gagal; periksa database sementara.' >&2;result=1;fi
 fi
 rm -rf "$test_dir";exit "$result"
}
trap cleanup EXIT
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin if exists(select 1 from public.opname_sessions where status='OPEN') then raise exception 'Test database already has an open session';end if;end $$;
SQL
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v a="$a" -v b="$b" -v run="$run" >"$test_dir/ids" <<'SQL'
begin;
insert into auth.users(id,email) values (:'a'::uuid,:'a'||'@example.invalid'),(:'b'::uuid,:'b'||'@example.invalid');
insert into public.profiles(id,role) values (:'a'::uuid,'mandor'),(:'b'::uuid,'mandor');
insert into public.materials(code,name,kg_per_bag) values (:'run','Synthetic Mixing WIP OK',25);
insert into public.machines(number,name) values (:'run'||'-1','Test'),(:'run'||'-2','Test');
insert into public.opname_sessions(name,opname_date,status,created_by) values (:'run',current_date,'OPEN',:'a'::uuid) returning id as sid \gset
insert into public.opname_machines(session_id,machine_id,machine_number,machine_name) select :'sid'::bigint,id,number,name from public.machines where number in (:'run'||'-1',:'run'||'-2');
select :'sid';
commit;
SQL
read -r sid < "$test_dir/ids";[[ "$sid" =~ ^[0-9]+$ ]];created=1
# Competing mandors: only one declaration can own the machine.
for actor in "$a" "$b";do
 psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" -v sid="$sid" -v number="$run-1" >"$test_dir/$actor.log" 2>&1 <<'SQL' &
begin;set local role authenticated;
select set_config('request.jwt.claim.sub',:'actor',true);
select public.opname_mark_not_running((select id from public.opname_machines where session_id=:'sid'::bigint and machine_number=:'number'));
select pg_sleep(1);commit;
SQL
 if [[ "$actor" = "$a" ]];then first=$!;else second=$!;fi
done
set +e;wait "$first";x=$?;wait "$second";y=$?;set -e
if ! { [[ $x -eq 0 && $y -ne 0 ]] || [[ $x -ne 0 && $y -eq 0 ]]; };then cat "$test_dir/$a.log" "$test_dir/$b.log";exit 1;fi
failed=$a;[[ $x -eq 0 ]] && failed=$b
if ! grep -q 'diklaim' "$test_dir/$failed.log";then cat "$test_dir/$failed.log";exit 1;fi
# Claim the second machine; race adding a material against declaring it not running.
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$a" -v sid="$sid" -v number="$run-2" <<'SQL'
begin;set local role authenticated;
select set_config('request.jwt.claim.sub',:'actor',true);
select public.opname_claim((select id from public.opname_machines where session_id=:'sid'::bigint and machine_number=:'number'));
commit;
SQL
for action in mark item;do
 psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$a" -v sid="$sid" -v number="$run-2" -v code="$run" -v mark="$([[ "$action" = mark ]] && echo true || echo false)" >"$test_dir/$action.log" 2>&1 <<'SQL' &
begin;set local role authenticated;
select set_config('request.jwt.claim.sub',:'actor',true);
\if :mark
select public.opname_mark_not_running((select id from public.opname_machines where session_id=:'sid'::bigint and machine_number=:'number'));
\else
select public.opname_save_item((select id from public.opname_machines where session_id=:'sid'::bigint and machine_number=:'number'),:'code',1,0,0,null);
\endif
select pg_sleep(1);commit;
SQL
 if [[ "$action" = mark ]];then first=$!;else second=$!;fi
done
set +e;wait "$first";x=$?;wait "$second";y=$?;set -e
if ! { [[ $x -eq 0 && $y -ne 0 ]] || [[ $x -ne 0 && $y -eq 0 ]]; };then cat "$test_dir/mark.log" "$test_dir/item.log";exit 1;fi
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v sid="$sid" -v number="$run-2" <<'SQL'
select set_config('test.nr_race_session',:'sid',false);
select set_config('test.nr_race_number',:'number',false);
do $$ declare m public.opname_machines; n integer; a integer; begin
 select * into m from public.opname_machines where session_id=current_setting('test.nr_race_session')::bigint and machine_number=current_setting('test.nr_race_number');
 select count(*) into n from public.opname_items where opname_machine_id=m.id;
 select count(*) into a from public.opname_status_audit where opname_machine_id=m.id and new_status='NOT_RUNNING';
 if not ((m.status='NOT_RUNNING' and n=0 and a=1) or (m.status='DRAFT' and n=1 and a=0)) then raise exception 'Partial race state';end if;
end $$;
SQL
echo 'Klaim dan penyimpanan bersamaan menghasilkan satu keadaan konsisten.'
