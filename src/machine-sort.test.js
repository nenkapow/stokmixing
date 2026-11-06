import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {compareMachineNumbers,sortMachines} from './machine-sort.js';
const numbers=items=>sortMachines(items,x=>x.number).map(x=>x.number);
test('urutan natural 1 hingga 36 tanpa mengubah sumber',()=>{const original=[36,10,3,20,2,11,9,1].map(number=>({number}));const before=original.map(x=>x.number);assert.deepEqual(numbers(original),[1,2,3,9,10,11,20,36]);assert.deepEqual(original.map(x=>x.number),before)});
test('nomor tidak berurutan dan format teks diurutkan secara natural',()=>{assert.deepEqual(numbers(['Mesin 20','2','Mesin 10','mesin 3','Mesin 1'].map(number=>({number}))),['Mesin 1','2','mesin 3','Mesin 10','Mesin 20']);assert.deepEqual(['B11','A10','A2','B2','A1'].sort(compareMachineNumbers),['A1','A2','A10','B2','B11'])});
test('pencarian mempertahankan urutan natural',()=>{const ordered=sortMachines(['11','2','10','21','1'].map(number=>({number})),x=>x.number);assert.deepEqual(ordered.filter(x=>x.number.includes('1')).map(x=>x.number),['1','10','11','21'])});
