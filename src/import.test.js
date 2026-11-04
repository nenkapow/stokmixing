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
