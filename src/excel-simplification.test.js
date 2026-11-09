import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import {buildWorkbook} from './finac-export.js';
const material=(code,system_qty)=>({code,name:`${code} Mixing WIP OK`,system_qty,average_cost:'39386.5957010719'});
const item=(code,actual)=>({machine_id:1,machine_number:'1',code,name:`${code} Mixing WIP OK`,whole:0,standard:'25',open:actual,hopper:'0',actual});
const find=(sheet,code)=>{let found;sheet.eachRow(row=>{if(row.getCell(1).value===code)found=row});return found};
test('keterangan, format tampilan dan presisi sumber pada workbook',async()=>{
 const d={session:{id:1,name:'Sintetis',opname_date:'2026-11-09'},machines:[{id:1,status:'COMPLETED'},{id:2,status:'NOT_RUNNING',number:'2'}],items:[item('ACTUAL','50'),item('EQUAL','42.1254215'),item('FINAC','3'),item('NEG','1'),item('MISSING','1'),item('TINY','0.004999')],snapshot:{id:7,qty_is_kg:true,cost_per_kg:true,items:[material('ACTUAL','30.86932'),material('EQUAL','42.1254215'),material('FINAC','284.538408'),material('NEG','-5'),material('NONE','100'),material('TINY','0.005')]},price_selection:{source:'FINAC',finac_snapshot_id:7,items:[{code:'EQUAL',price:'39386.5957010719'},{code:'NEG',price:'0'}]}};
 const book=await buildWorkbook(d),wb=new ExcelJS.Workbook();await wb.xlsx.load(await book.xlsx.writeBuffer());const summary=wb.getWorksheet('Ringkasan Stok'),full=wb.getWorksheet('Laporan PPIC'),audit=wb.getWorksheet('Presisi Sumber'),detail=wb.getWorksheet('Detail Per Mesin');
 for(const [code,label] of [['ACTUAL','Aktual lebih besar'],['EQUAL','Sesuai'],['FINAC','FINAC lebih besar'],['NEG','Saldo FINAC negatif'],['NONE','Aktual Tidak Ada'],['MISSING','Tidak ada di FINAC']])assert.equal(find(summary,code).getCell(9).value,label);
 assert.equal(summary.getCell('I4').value,'Keterangan');assert.equal(summary.views[0].ySplit,4);assert.match(find(summary,'NONE').getCell(7).note,/bukan bukti stok fisik nol/);assert.equal(summary.getCell('H3').value,1);
 const q=find(summary,'EQUAL').getCell(3),delta=find(summary,'ACTUAL').getCell(8),small=find(summary,'TINY').getCell(7);assert.equal(q.type,ExcelJS.ValueType.Number);assert.equal(q.value,42.1254215);assert.match(q.numFmt,/#,##0\.00/);assert.equal(new Decimal(q.value).toFixed(2),'42.13');assert.equal(new Decimal(find(summary,'FINAC').getCell(3).value).toFixed(2),'284.54');assert.equal(new Decimal(delta.value).toFixed(2),'-19.13');assert.match(delta.numFmt,/\[Red\]/);assert.equal(small.value,0.004999);assert.match(small.numFmt,/E\+00/);assert.match(find(summary,'TINY').getCell(3).numFmt,/#,##0\.00/);
 assert.match(find(full,'EQUAL').getCell(6).numFmt,/#,##0\.00/);assert.match(detail.getCell('E2').numFmt,/#,##0\.00/);assert.equal(find(full,'EQUAL').getCell(4).value,39386.5957010719);assert.match(find(full,'EQUAL').getCell(4).numFmt,/Rp-421/);assert.equal(find(full,'NONE').getCell(4).value,null);assert.equal(find(full,'NEG').getCell(4).value,0);assert.equal(find(audit,'EQUAL').getCell(3).value,'39386.5957010719');assert.equal(find(audit,'EQUAL').getCell(4).value,'42.1254215');assert.equal(find(audit,'TINY').getCell(4).value,'0.005');
 assert.equal(summary.lastRow.getCell(7).value.result,full.lastRow.getCell(7).value.result);assert.ok(detail.getSheetValues().flat().some(x=>typeof x==='string'&&x.includes('tidak diukur secara fisik')));
});
