import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import ExcelJS from 'exceljs';
import { parseCsv } from './finac.js';
import { classifyMaterials, preview, rowsFromSheet } from './import.js';
const header=['Category','Description COA','Code','Name','Qty','Average','Total'];
const material=['WIP','Bahan','SYN-001','Synthetic Mixing Blue WIP OK',10,2,20];
const footer=['','','','',10,2,20];
const classify=rows=>classifyMaterials(rowsFromSheet(rows),[]);
test('CSV sintetis 225 material dan footer angka tanpa label',()=>{
 const data=Array.from({length:225},(_,i)=>`WIP,Bahan,SYN-${i},Synthetic Mixing Blue WIP OK,1,2,2`);
 const csv=[header.join(','),...data,',,,,225,2,450'].join('\n');
 const p=classify(parseCsv(csv));assert.equal(p.totalMixing,225);assert.equal(p.newMaterials.length,225);assert.equal(p.summaries.length,1);assert.equal(p.errors.length,0);assert.equal(p.summaries[0].line,227);
});
test('XLSX sintetis mengenali footer numerik dan mempertahankan data material',async()=>{
 const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('FINAC');sheet.addRow(header);sheet.addRow(material);sheet.addRow([]);sheet.addRow(footer);
 const saved=await wb.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(saved);const rows=[];loaded.worksheets[0].eachRow({includeEmpty:false},(row,rowNumber)=>{rows[rowNumber-1]=row.values.slice(1)});
 const p=classify(rows);assert.equal(p.newMaterials.length,1);assert.equal(p.newMaterials[0].name,material[3]);assert.equal(p.summaries.length,1);assert.equal(p.summaries[0].line,4);assert.equal(p.errors.length,0);
});
test('TOTAL dan GRAND TOTAL hanya pada kolom identitas lain dan ada angka',()=>{
 for(const label of ['TOTAL','Grand Total']){const p=classify([header,material,['',label,'','',null,null,20]]);assert.equal(p.summaries.length,1);assert.equal(p.errors.length,0)}
});
test('kode valid tanpa nama selalu bermasalah walau baris terakhir bernilai angka',()=>{
 for(const code of ['SYN-002','TOTAL']){const p=classify([header,material,['','',code,'',10,2,20]]);assert.equal(p.summaries.length,0);assert.equal(p.errors.length,1)}
});
test('baris kosong tanpa bukti kuat, identitas lain, atau angka tidak valid tetap bermasalah',()=>{
 for(const row of [['','','','',10,'',''],['','','','','','',''],['WIP','','','',10,2,20],['','','','',10,'tidak valid',20]]){const p=classify([header,material,row]);assert.equal(p.summaries.length,0,JSON.stringify(row));assert.equal(p.errors.length,1,JSON.stringify(row))}
 const only=classify([header,footer]);assert.equal(only.summaries.length,0);assert.equal(only.errors.length,1);
});
test('subtotal di tengah tidak dilewati dan tetap mencegah impor',()=>{
 const p=classify([header,material,footer,['WIP','Bahan','SYN-002','Synthetic Mixing White WIP OK',1,2,2]]);assert.equal(p.summaries.length,0);assert.equal(p.errors.length,1);
});
test('footer tidak mengubah klasifikasi insert-only dan filter Mixing',()=>{
 const rows=rowsFromSheet([header,material,['WIP','Bahan','SYN-002','Synthetic Injection WIP OK',1,2,2],footer]);
 const p=classifyMaterials(rows,['SYN-001']);assert.equal(p.totalMixing,1);assert.equal(p.existing.length,1);assert.equal(p.newMaterials.length,0);assert.equal(p.summaries.length,1);assert.equal(p.errors.length,0);
});

test('footer XLSX dengan hasil formula numerik dikenali tanpa mengevaluasi formula',()=>{const p=classify([header,material,['','','','',{formula:'SUM(E2:E2)',result:10},2,{formula:'SUM(G2:G2)',result:20}]]);assert.equal(p.summaries.length,1);assert.equal(p.errors.length,0)});
