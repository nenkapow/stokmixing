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

test('menerima warna dan deskripsi di antara Mixing dan WIP OK',()=>{
 for(const name of ['PT208 Base Mixing Blue WIP OK','PT206 Cover Mixing White WIP OK','PT207 Base Mixing Natural WIP OK','LP002 Clear Base Mixing WIP OK','mixing   navy blue  WIP  OK'])assert.equal(matchesMixing(name),true,name);
 for(const name of ['Mixing WIP Reject','Injection WIP OK','Printing WIP OK','Crushing WIP OK','Mixing WIP Reject WIP OK'])assert.equal(matchesMixing(name),false,name);
});
