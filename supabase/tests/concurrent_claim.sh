#!/usr/bin/env bash
# Only use a disposable test database. Creates and deletes dedicated synthetic fixtures.
set -euo pipefail
: "${SUPABASE_TEST_DATABASE_URL:?Set SUPABASE_TEST_DATABASE_URL to a disposable Supabase database}"
: "${OPNAME_ALLOW_DESTRUCTIVE_TEST:?Set OPNAME_ALLOW_DESTRUCTIVE_TEST=yes for a disposable database}"
[[ "$OPNAME_ALLOW_DESTRUCTIVE_TEST" = yes ]]
test_dir=$(mktemp -d)
cleanup() {
  psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
delete from public.opname_items where opname_machine_id in (select id from public.opname_machines where machine_number='RACE-TEST-20261104');
delete from public.opname_machines where machine_number='RACE-TEST-20261104';
delete from public.opname_sessions where name='RACE-TEST-20261104';
delete from public.machines where number='RACE-TEST-20261104';
delete from public.profiles where id in ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
delete from auth.users where id in ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
SQL
  rm -rf "$test_dir"
}
# Use only an empty test database; refuse to touch existing sessions or fixtures.
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin if exists(select 1 from public.opname_sessions where status='OPEN' or name='RACE-TEST-20261104') or exists(select 1 from public.machines where number='RACE-TEST-20261104') or exists(select 1 from auth.users where id in ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')) then raise exception 'Test database is not empty'; end if; end $$;
SQL
trap cleanup EXIT
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,email) values ('30000000-0000-0000-0000-000000000001','race-a@example.invalid'),('30000000-0000-0000-0000-000000000002','race-b@example.invalid');
insert into public.profiles values ('30000000-0000-0000-0000-000000000001','mandor'),('30000000-0000-0000-0000-000000000002','mandor');
insert into public.machines(number,name) values ('RACE-TEST-20261104','Race test');
insert into public.opname_sessions(name,opname_date,created_by) values ('RACE-TEST-20261104',current_date,'30000000-0000-0000-0000-000000000001');
insert into public.opname_machines(session_id,machine_id,machine_number,machine_name) select s.id,m.id,m.number,m.name from public.opname_sessions s cross join public.machines m where s.name='RACE-TEST-20261104' and m.number='RACE-TEST-20261104';
SQL
for actor in 1 2; do
  psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" >"$test_dir/$actor.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000' || :'actor', true);
select public.opname_claim((select id from public.opname_machines where machine_number='RACE-TEST-20261104'));
select pg_sleep(2);
commit;
SQL
  if [[ $actor = 1 ]]; then first=$!; else second=$!; fi
done
set +e
wait "$first"; a=$?
wait "$second"; b=$?
set -e
if ! { [[ $a -eq 0 && $b -ne 0 ]] || [[ $a -ne 0 && $b -eq 0 ]]; }; then cat "$test_dir/1.log" "$test_dir/2.log"; echo 'Expected exactly one successful claim' >&2; exit 1; fi
failed=1; [[ $a -eq 0 ]] && failed=2
if ! grep -q 'sudah diklaim' "$test_dir/$failed.log"; then cat "$test_dir/$failed.log"; echo 'Unexpected claim failure' >&2; exit 1; fi
echo 'Concurrent claim: exactly one claimant succeeded.'
