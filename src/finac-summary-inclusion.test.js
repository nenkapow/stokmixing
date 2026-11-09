import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import ExcelJS from 'exceljs';
import {buildWorkbook} from './finac-export.js';
const material=(code,system_qty)=>({code,name:`${code} Mixing WIP OK`,system_qty,average_cost:'1'});
const item=(code,actual)=>({machine_id:1,machine_number:'1',code,name:`${code} Mixing WIP OK`,whole:0,standard:'25',open:String(actual),hopper:'0',actual:String(actual)});
const row=(sheet,code)=>{let found;sheet.eachRow(r=>{if(r.getCell(1).value===code)found=r});return found};
test('ringkasan mencakup FINAC-only positif dan negatif, serta membedakan catatan fisik',async()=>{
 const report={session:{id:1,name:'Sintetis',opname_date:'2026-11-09'},machines:[{id:1,status:'COMPLETED'},{id:2,status:'NOT_RUNNING',number:'2',mandor_name:'Mandor Uji'}],items:[item('ACTUAL50',50),item('NOFINAC',25)],snapshot:{id:4,qty_is_kg:true,cost_per_kg:true,items:[material('FINAC100','100'),material('NEGATIVE','-3'),material('ZERO','0'),material('ACTUAL50','0')]},price_selection:{source:'FINAC',finac_snapshot_id:4,items:[]}};
 const wb=await buildWorkbook(report),read=new ExcelJS.Workbook();await read.xlsx.load(await wb.xlsx.writeBuffer());const summary=read.getWorksheet('Ringkasan Stok'),full=read.getWorksheet('Laporan PPIC'),detail=read.getWorksheet('Detail Per Mesin');
 const p=row(summary,'FINAC100'),negative=row(summary,'NEGATIVE'),physical=row(summary,'ACTUAL50'),missing=row(summary,'NOFINAC');
 assert.equal(p.getCell(3).value,100);assert.equal(p.getCell(7).value,0);assert.equal(p.getCell(8).value,100);assert.equal(p.getCell(9).value,'Aktual Tidak Ada');assert.match(p.getCell(7).note,/bukan bukti stok fisik nol/);assert.match(p.getCell(8).note,/indikatif/);
 assert.equal(negative.getCell(3).value,-3);assert.equal(negative.getCell(8).value,-3);assert.match(negative.getCell(8).numFmt,/\[Red\]/);assert.equal(negative.getCell(9).value,'Aktual Tidak Ada');assert.match(negative.getCell(9).note,/Saldo FINAC negatif/);assert.match(negative.getCell(7).note,/bukan bukti stok fisik nol/);
 assert.equal(row(summary,'ZERO'),undefined);assert.equal(row(full,'ZERO').getCell(7).value,0);assert.equal(physical.getCell(7).value,50);assert.equal(physical.getCell(9).value,'Aktual lebih besar');assert.equal(missing.getCell(3).value,null);assert.equal(missing.getCell(7).value,25);assert.equal(missing.getCell(9).value,'Tidak ada di FINAC');
 assert.equal(summary.getCell('B3').value,75);assert.match(summary.getCell('C3').note,/2 material/);assert.equal(summary.getCell('F3').value,1);assert.equal(summary.getCell('H3').value,1);assert.equal(summary.getCell('G9').value.result,75);assert.equal(full.getCell('G10').value.result,75);assert.match(p.getCell(7).note,/bukan bukti stok fisik nol/);assert.match(p.getCell(8).note,/indikatif/);assert.ok(detail.getSheetValues().flat().some(v=>typeof v==='string'&&v.includes('tidak diukur secara fisik')));assert.equal(summary.views[0].ySplit,4);assert.equal(summary.autoFilter,'A4:I8');
});
