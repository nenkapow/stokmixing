#!/usr/bin/env bash
# Only use a disposable test database. Each run uses unique fixtures.
set -euo pipefail
: "${SUPABASE_TEST_DATABASE_URL:?Set SUPABASE_TEST_DATABASE_URL to a disposable Supabase database}"
: "${OPNAME_ALLOW_DESTRUCTIVE_TEST:?Set OPNAME_ALLOW_DESTRUCTIVE_TEST=yes for a disposable database}"
[[ "$OPNAME_ALLOW_DESTRUCTIVE_TEST" = yes ]]
test_dir=$(mktemp -d)
actor_a=$(cat /proc/sys/kernel/random/uuid)
actor_b=$(cat /proc/sys/kernel/random/uuid)
run_id=$(cat /proc/sys/kernel/random/uuid)
fixture_created=0
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$fixture_created" = 1 ]]; then
    if ! psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v aid="$actor_a" -v bid="$actor_b" -v sid="$session_id" -v mid="$machine_id" <<'SQL'
begin;
delete from public.opname_machines where session_id=:'sid'::bigint and machine_id=:'mid'::bigint;
delete from public.opname_sessions where id=:'sid'::bigint and created_by=:'aid'::uuid;
delete from public.machines where id=:'mid'::bigint;
delete from public.profiles where id in (:'aid'::uuid,:'bid'::uuid);
delete from auth.users where id in (:'aid'::uuid,:'bid'::uuid);
commit;
SQL
    then
      echo 'Fixture cleanup failed; inspect the disposable test database.' >&2
      result=1
    fi
  fi
  rm -rf "$test_dir"
  exit "$result"
}
trap cleanup EXIT
# Never set fixture_created when preflight or the single fixture transaction fails.
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin if exists(select 1 from public.opname_sessions where status='OPEN') then raise exception 'Test database already has an open session'; end if; end $$;
SQL
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v aid="$actor_a" -v bid="$actor_b" -v run="$run_id" >"$test_dir/ids" <<'SQL'
begin;
insert into auth.users(id,email) values (:'aid'::uuid, :'aid' || '@example.invalid'),(:'bid'::uuid, :'bid' || '@example.invalid');
insert into public.profiles(id,role) values (:'aid'::uuid,'mandor'),(:'bid'::uuid,'mandor');
insert into public.machines(number,name) values (:'run', 'Race test') returning id as machine_id \gset
insert into public.opname_sessions(name,opname_date,created_by) values (:'run',current_date,:'aid'::uuid) returning id as session_id \gset
insert into public.opname_machines(session_id,machine_id,machine_number,machine_name) values (:'session_id'::bigint,:'machine_id'::bigint,:'run','Race test');
select :'session_id' || ' ' || :'machine_id';
commit;
SQL
read -r session_id machine_id < "$test_dir/ids"
[[ "$session_id" =~ ^[0-9]+$ && "$machine_id" =~ ^[0-9]+$ ]]
fixture_created=1
for actor in "$actor_a" "$actor_b"; do
  psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" -v sid="$session_id" -v mid="$machine_id" >"$test_dir/$actor.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'actor', true);
select public.opname_claim((select id from public.opname_machines where session_id=:'sid'::bigint and machine_id=:'mid'::bigint));
select pg_sleep(2);
commit;
SQL
  if [[ "$actor" = "$actor_a" ]]; then first=$!; else second=$!; fi
done
set +e
wait "$first"; a=$?
wait "$second"; b=$?
set -e
if ! { [[ $a -eq 0 && $b -ne 0 ]] || [[ $a -ne 0 && $b -eq 0 ]]; }; then cat "$test_dir/$actor_a.log" "$test_dir/$actor_b.log"; echo 'Expected exactly one successful claim' >&2; exit 1; fi
failed=$actor_a; [[ $a -eq 0 ]] && failed=$actor_b
if ! grep -q 'sudah diklaim' "$test_dir/$failed.log"; then cat "$test_dir/$failed.log"; echo 'Unexpected claim failure' >&2; exit 1; fi
echo 'Concurrent claim: exactly one claimant succeeded.'
