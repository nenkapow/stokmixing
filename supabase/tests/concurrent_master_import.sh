#!/usr/bin/env bash
# Only on a disposable Supabase database. Fixtures are unique per run.
set -euo pipefail
: "${SUPABASE_TEST_DATABASE_URL:?Set SUPABASE_TEST_DATABASE_URL to a disposable Supabase database}"
: "${OPNAME_ALLOW_DESTRUCTIVE_TEST:?Set OPNAME_ALLOW_DESTRUCTIVE_TEST=yes}"
[[ "$OPNAME_ALLOW_DESTRUCTIVE_TEST" = yes ]]
test_dir=$(mktemp -d)
actor=$(cat /proc/sys/kernel/random/uuid)
code="MASTER-RACE-$(cat /proc/sys/kernel/random/uuid)"
created=0
cleanup(){
 local result=$?;trap - EXIT
 if [[ "$created" = 1 ]]; then
  if ! psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" -v code="$code" <<'SQL'
begin;
delete from public.material_imports where imported_by=:'actor'::uuid;
delete from public.materials where code=:'code';
delete from public.profiles where id=:'actor'::uuid;
delete from auth.users where id=:'actor'::uuid;
commit;
SQL
  then echo 'Fixture cleanup failed; inspect the disposable test database.' >&2;result=1;fi
 fi
 rm -rf "$test_dir";exit "$result"
}
trap cleanup EXIT
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" <<'SQL'
begin;
insert into auth.users(id,email) values (:'actor'::uuid,:'actor' || '@example.invalid');
insert into public.profiles(id,role) values (:'actor'::uuid,'admin');
commit;
SQL
created=1
for i in 1 2; do
 psql "$SUPABASE_TEST_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v actor="$actor" -v code="$code" >"$test_dir/$i.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'actor',true);
select public.import_materials(jsonb_build_array(jsonb_build_object('code',:'code','name','Synthetic Mixing Blue WIP OK')),'concurrent-test.csv');
select pg_sleep(1);
commit;
SQL
 if [[ $i = 1 ]];then first=$!;else second=$!;fi
done
set +e
wait "$first"; a=$?
wait "$second"; b=$?
set -e
if [[ $a -ne 0 || $b -ne 0 ]];then cat "$test_dir/1.log" "$test_dir/2.log";echo 'Concurrent import failed' >&2;exit 1;fi
counts=$(cat "$test_dir/1.log" "$test_dir/2.log" | grep -E '^[01]$' | sort | tr '\n' ' ')
if [[ "$counts" != '0 1 ' ]];then cat "$test_dir/1.log" "$test_dir/2.log";echo 'Expected one inserted and one skipped' >&2;exit 1;fi
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v code="$code" <<'SQL'
select 1 / case when count(*)=1 then 1 else 0 end from public.materials where code=:'code';
SQL
echo 'Concurrent imports: one inserted, one skipped.'
