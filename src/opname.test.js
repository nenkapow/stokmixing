import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {calculate, numericValues, initialItemValues, itemInputs, machineLabel, itemsByMachine, responsibleName, summarize} from './opname.js';
test('input kosong dihitung nol tanpa mengubah nilai yang diketik',()=>{
 assert.deepEqual(initialItemValues(null),{whole:'',open:'',hopper:''});
 assert.deepEqual(initialItemValues({whole_bags:0,open_kg:1.25,hopper_kg:0}),{whole:'',open:'1.25',hopper:''});
 assert.deepEqual(numericValues('', '', ''),[0,0,0]);
 assert.equal(calculate('',null,'',''),0);assert.equal(calculate('1',25,'2.5','.25'),27.75);
 const typed='25';const html=itemInputs({whole:typed,open:'',hopper:''});assert.match(html,/name="whole"[^>]*value="25"/);assert.doesNotMatch(html,/value="025"/);assert.equal((itemInputs(initialItemValues(null)).match(/value=""/g)||[]).length,3);
});
test('input tidak valid dan negatif ditolak',()=>{assert.equal(calculate(4,25,7,8),115);for(const args of [[-1,25,0,0],[1,null,0,0],[1.5,25,0,0],[1,25,'rusak',0],[1,25,Infinity,0],[1,25,-1,0]])assert.throws(()=>calculate(...args))});
test('rekap per kode, beberapa material dan beberapa mesin',()=>{const machines=[{id:1,status:'COMPLETED',machine_number:'1',machine_name:'Nissei'},{id:2,status:'COMPLETED',machine_number:'26',machine_name:'Toshiba'},{id:3,status:'DRAFT',machine_number:'29',machine_name:'C'}];const items=[{opname_machine_id:1,material_code:'A',material_name:'A Mixing WIP OK',actual_kg:115},{opname_machine_id:1,material_code:'B',material_name:'B Mixing WIP OK',actual_kg:5},{opname_machine_id:2,material_code:'A',material_name:'Nama lama',actual_kg:50},{opname_machine_id:3,material_code:'A',material_name:'A Mixing WIP OK',actual_kg:999}];const grouped=itemsByMachine(items);assert.equal(grouped.get(1).length,2);assert.equal(grouped.get(2).length,1);const r=summarize(machines,items);assert.equal(r.unfinished,1);assert.equal(r.materials.length,2);assert.equal(r.materials[0].total,165);assert.deepEqual(r.materials[0].locations.map(x=>x.machine),['Mesin 1','Mesin 26']);assert.equal(r.materials[1].total,5)});
test('label mesin lama dan fallback nama profil',()=>{assert.equal(machineLabel('1'),'Mesin 1');assert.equal(machineLabel('Mesin 26'),'Mesin 26');assert.equal(responsibleName({display_name:' Mandor Shift 1 '}),'Mandor Shift 1');assert.equal(responsibleName(null),'Nama mandor belum tersedia')});
