import { test } from 'node:test'; import { strict as assert } from 'node:assert'; import { preview, classifyMaterials } from './import.js';
test('master mengabaikan Qty, menerima nol, dan menandai kode kosong atau duplikat',()=>{const p=preview([{code:'A',name:' mixing  WIP ok ',qty:0},{code:'A',name:'Mixing WIP OK',qty:2},{code:'',name:'Mixing WIP OK',qty:1},{code:'B',name:'Mixing WIP OK',qty:'rusak'},{code:'C',name:'Lain',qty:2}]);assert.equal(p.valid.length,2);assert.equal(p.duplicates.length,1);assert.equal(p.errors.length,1)});

test('header FINAC XLSX dan nama lengkap dipertahankan', async () => {
 const { default: ExcelJS } = await import('exceljs');
 const { rowsFromSheet } = await import('./import.js');
 const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('FINAC');
 sheet.addRow(['Category','Description COA','Code','Name','Qty','Average','Total']);
 sheet.addRow(['WIP','Bahan','LP002','LP002 30 gr Clear Base Mixing WIP OK',0,0,0]);
 sheet.addRow(['WIP','Bahan','REJ','LP002 Mixing WIP Reject',1,1,1]);
 const bytes = await wb.xlsx.writeBuffer(); const loaded = new ExcelJS.Workbook(); await loaded.xlsx.load(bytes);
 const rows = []; loaded.worksheets[0].eachRow({includeEmpty:false}, row => rows.push(row.values.slice(1)));
 assert.deepEqual(preview(rowsFromSheet(rows)).valid, [{code:'LP002',name:'LP002 30 gr Clear Base Mixing WIP OK'}]);
});

test('master menerima Mixing berwarna dan mempertahankan nama lengkap',()=>{
 const names=['PT208 Base Mixing Blue WIP OK','PT206 Cover Mixing White WIP OK','PT207 Base Mixing Natural WIP OK','LP002 Clear Base Mixing WIP OK'];
 const rows=names.map((name,i)=>({code:`K${i}`,name,qty:0}));
 rows.push({code:'REJ',name:'Mixing WIP Reject',qty:1},{code:'INJ',name:'Injection WIP OK',qty:1});
 const result=preview(rows);assert.deepEqual(result.valid.map(x=>x.name),names);assert.equal(result.errors.length,0);
});


test('perbandingan master: impor pertama, berulang, dan lima kode baru',()=>{
 const first=Array.from({length:3},(_,i)=>({code:'K'+i,name:'Mixing Blue WIP OK',qty:0}));
 let p=classifyMaterials(first,[]);assert.equal(p.totalMixing,3);assert.equal(p.newMaterials.length,3);
 const known=p.newMaterials.map(x=>x.code);p=classifyMaterials(first,known);assert.equal(p.newMaterials.length,0);assert.equal(p.existing.length,3);
 const expanded=first.concat(Array.from({length:5},(_,i)=>({code:'N'+i,name:'Mixing White WIP OK'})));p=classifyMaterials(expanded,known);assert.equal(p.newMaterials.length,5);assert.equal(p.existing.length,3);
});
test('duplikat yang sama dilewati dan nama berbeda dikarantina',()=>{
 const p=classifyMaterials([{code:'A',name:'Base Mixing Blue WIP OK'},{code:'A',name:' base mixing blue WIP OK '},{code:'B',name:'Cover Mixing White WIP OK'},{code:'B',name:'Cover Mixing Black WIP OK'},{code:'C',name:'Mixing WIP Reject'},{code:'D',name:'Injection WIP OK'},{code:'',name:'Mixing WIP OK'}],['A']);
 assert.equal(p.totalMixing,5);assert.equal(p.duplicates.length,2);assert.equal(p.conflicts[0].code,'B');assert.deepEqual(p.conflicts[0].names,['Cover Mixing White WIP OK','Cover Mixing Black WIP OK']);assert.equal(p.existing.length,1);assert.equal(p.newMaterials.length,0);assert.equal(p.errors.length,1);
});
test('kode sama di kategori lain dengan nama berbeda dilaporkan konflik',()=>{const p=classifyMaterials([{code:'Z',name:'Mixing Blue WIP OK'},{code:'Z',name:'Injection WIP OK'}],[]);assert.equal(p.conflicts.length,1);assert.equal(p.newMaterials.length,0)});
