import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('preflight database gagal tidak menjalankan cleanup database', () => {
 const dir=mkdtempSync(join(tmpdir(),'opname-preflight-'));
 try {
  const log=join(dir,'calls');
  writeFileSync(join(dir,'psql'), '#!/bin/sh\ncat >> "$TEST_PSQL_LOG"\nprintf "\\nCALL\\n" >> "$TEST_PSQL_LOG"\nexit 1\n', {mode:0o755});
  const result=spawnSync('bash',['supabase/tests/concurrent_claim.sh'],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,SUPABASE_TEST_DATABASE_URL:'not-a-real-database',OPNAME_ALLOW_DESTRUCTIVE_TEST:'yes',TEST_PSQL_LOG:log}});
  assert.notEqual(result.status,0);
  const calls=readFileSync(log,'utf8');
  assert.equal((calls.match(/CALL/g)||[]).length,1);
  assert.doesNotMatch(calls,/\bdelete\b/i);
 } finally { rmSync(dir,{recursive:true,force:true}); }
});
