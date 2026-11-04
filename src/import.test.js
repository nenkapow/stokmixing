import { test } from 'node:test'; import { strict as assert } from 'node:assert'; import { preview } from './import.js';
test('impor: nol diterima, duplikat dan kerusakan ditandai',()=>{const p=preview([{code:'A',name:' mixing  WIP ok ',qty:0},{code:'A',name:'Mixing WIP OK',qty:2},{code:'',name:'Mixing WIP OK',qty:1},{code:'B',name:'Mixing WIP OK',qty:'rusak'},{code:'C',name:'Lain',qty:2}]);assert.equal(p.valid.length,1);assert.equal(p.duplicates.length,1);assert.equal(p.errors.length,2)});

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
