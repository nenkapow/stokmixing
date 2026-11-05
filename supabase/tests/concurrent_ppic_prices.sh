#!/usr/bin/env bash
# Disposable test database only. Creates unique synthetic fixtures.
set -euo pipefail
: "${SUPABASE_TEST_DATABASE_URL:?Set a disposable database URL}" "${OPNAME_ALLOW_DESTRUCTIVE_TEST:?Set OPNAME_ALLOW_DESTRUCTIVE_TEST=yes}"
[[ "$OPNAME_ALLOW_DESTRUCTIVE_TEST" = yes ]]
test_dir=$(mktemp -d); actor=$(cat /proc/sys/kernel/random/uuid); code="PPIC-RACE-$(cat /proc/sys/kernel/random/uuid)"; created=0
cleanup(){ local result=$?;trap - EXIT;if [[ "$created" = 1 ]];then
 if ! psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" -v code="$code" <<'SQL'
begin;
delete from public.ppic_price_versions where code=:'code';
delete from public.materials where code=:'code';
delete from public.profiles where id=:'actor'::uuid;
delete from auth.users where id=:'actor'::uuid;
commit;
SQL
 then echo 'Cleanup gagal; periksa database sementara.' >&2;result=1;fi;fi;rm -rf "$test_dir";exit "$result";}
trap cleanup EXIT
psql "$SUPABASE_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v actor="$actor" -v code="$code" <<'SQL'
begin;
insert into auth.users(id,email) values (:'actor'::uuid,:'actor'||'@example.invalid');
insert into public.profiles(id,role) values (:'actor'::uuid,'admin');
insert into public.materials(code,name,kg_per_bag) values (:'code','Synthetic Mixing WIP OK',25);
commit;
SQL
created=1
for i in 1 2;do
 psql "$SUPABASE_TEST_DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 -v actor="$actor" -v code="$code" >"$test_dir/$i.log" 2>&1 <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub',:'actor',true);
select public.ppic_import_prices('test.xlsx','Sheet',current_date,true,jsonb_build_array(jsonb_build_object('code',:'code','name','Synthetic Mixing WIP OK','price','25','expected_version',0)));
select pg_sleep(1);
commit;
SQL
 if [[ $i = 1 ]];then first=$!;else second=$!;fi
done
set +e;wait "$first";a=$?;wait "$second";b=$?;set -e
if ! { [[ $a -eq 0 && $b -ne 0 ]] || [[ $a -ne 0 && $b -eq 0 ]]; };then cat "$test_dir/1.log" "$test_dir/2.log";exit 1;fi
failed=1;[[ $a -eq 0 ]] && failed=2
if ! grep -q 'muat ulang preview' "$test_dir/$failed.log";then cat "$test_dir/$failed.log";exit 1;fi
echo 'Satu impor berhasil dan satu preview kedaluwarsa ditolak.'
