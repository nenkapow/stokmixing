import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { total, matchesMixing } from './calculation.js';
test('menghitung stok dengan standar material', () => { assert.equal(total(3, 20, 2.5, 4), 66.5); assert.throws(() => total(-1, 25, 0, 0)); assert.throws(() => total(1, 0, 0, 0)); assert.throws(() => total(1.5, 25, 0, 0)); });
test('filter material toleran spasi dan huruf', () => { assert.equal(matchesMixing('  mixing   WIP ok '), true); assert.equal(matchesMixing('Mixing WIP reject'), false); });
test('kategori Mixing WIP OK di dalam nama FINAC lengkap', () => {
 assert.equal(matchesMixing('LP002 30 gr Clear Base Mixing WIP OK'), true);
 assert.equal(matchesMixing('LP002 30 gr Clear Base mIxInG   wIp\tOk'), true);
 assert.equal(matchesMixing('LP002 Mixing WIP Reject'), false);
 assert.equal(matchesMixing('LP002 Injection WIP OK'), false);
 assert.equal(matchesMixing('LP002 Mixing WIP OKAY'), false);
 assert.equal(matchesMixing('LP002 Premixing WIP OK'), false);
});
