import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import ExcelJS from 'exceljs';
import {buildWorkbook} from './finac-export.js';
import {parsePpicSheet} from './ppic-prices.js';
const fixture=()=>({session:{id:1,name:'Uji sintetis',opname_date:'2026-11-09'},machines:[{id:1,status:'COMPLETED'},{id:2,status:'COMPLETED'},{id:3,status:'NOT_RUNNING',number:'3',mandor_name:'Mandor Sintetis'}],items:[
 {machine_id:1,machine_number:'1',code:'A',name:'A Mixing WIP OK',whole:1,standard:'25',open:'15',hopper:'5',actual:'45'},
 {machine_id:2,machine_number:'2',code:'A',name:'A Mixing WIP OK',whole:0,standard:'25',open:'5',hopper:'0',actual:'5'},
 {machine_id:1,machine_number:'1',code:'B',name:'B Mixing WIP OK',whole:2,standard:'25',open:'30',hopper:'20',actual:'100'},
 {machine_id:2,machine_number:'2',code:'B',name:'B Mixing WIP OK',whole:2,standard:'25',open:'20',hopper:'30',actual:'100'}],
 snapshot:{id:4,qty_is_kg:true,cost_per_kg:true,items:[{code:'A',name:'A Mixing WIP OK',system_qty:'50.0000000001',average_cost:'1.123456789123456789'},{code:'B',name:'B Mixing WIP OK',system_qty:'0.0000000001',average_cost:'2'},{code:'Z',name:'Z Mixing WIP OK',system_qty:'5',average_cost:'0'}]},
 price_selection:{source:'PPIC',version:1,finac_snapshot_id:4,items:[{code:'A',price:'39386.5957010719'},{code:'Z',price:'0'}]}});
const rowFor=(sheet,col,code)=>{let result;sheet.eachRow(r=>{if(r.getCell(col).value===code)result=r});return result};
test('empat sheet mempertahankan nilai, cakupan dan agregat lintas mesin',async()=>{
 const original=fixture(),book=await buildWorkbook(original),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());
 assert.deepEqual(loaded.worksheets.map(s=>s.name),['Ringkasan Stok','Laporan PPIC','Detail Per Mesin','Presisi Sumber']);
 const summary=loaded.getWorksheet('Ringkasan Stok'),full=loaded.getWorksheet('Laporan PPIC'),detail=loaded.getWorksheet('Detail Per Mesin'),audit=loaded.getWorksheet('Presisi Sumber');
 const a=rowFor(summary,1,'A'),b=rowFor(summary,1,'B');assert.equal(a.getCell(4).value,1);assert.equal(a.getCell(5).value,20);assert.equal(a.getCell(6).value,5);assert.equal(a.getCell(7).value,50);assert.equal(a.getCell(8).value,0.0000000001);assert.equal(b.getCell(4).value,4);assert.equal(b.getCell(5).value,50);assert.equal(b.getCell(6).value,50);assert.equal(b.getCell(7).value,200);assert.equal(b.getCell(8).value,-199.9999999999);
 assert.equal(rowFor(summary,1,'Z').getCell(9).value,'Tidak tercatat di opname');assert.equal(rowFor(full,1,'Z').getCell(7).value,0);assert.equal(rowFor(full,1,'Z').getCell(11).value,5);
 assert.equal(summary.getCell('B4').value,250);assert.equal(summary.getCell('D4').value,2);assert.equal(summary.getCell('F4').value,2);assert.equal(summary.getCell('H4').value,1);assert.equal(summary.getCell('B5').value,0);assert.equal(summary.getCell('G10').value.result,250);assert.equal(full.getCell('G8').value.result,250);
 assert.match(rowFor(full,1,'B').getCell(6).numFmt,/E\+00/);assert.match(a.getCell(8).numFmt,/E\+00/);assert.match(b.getCell(8).numFmt,/\[Red\]/);assert.equal(rowFor(audit,1,'A').getCell(3).value,'39386.5957010719');assert.equal(rowFor(audit,1,'A').getCell(16).value,'1.123456789123456789');
 assert.ok(detail.getSheetValues().flat().some(v=>typeof v==='string'&&v.includes('tidak diukur secara fisik')));assert.equal(detail.getCell('F2').value,15);assert.equal(detail.getCell('G2').value,5);
 assert.equal(summary.views[0].ySplit,6);assert.ok(summary.autoFilter);assert.ok(full.autoFilter);assert.ok(detail.autoFilter);assert.ok(audit.autoFilter);
 const parsed=parsePpicSheet(full);assert.equal(parsed.find(x=>x.code==='A').price,'39386.5957010719');assert.equal(parsed.find(x=>x.code==='Z').price,'0');assert.ok(!parsed.some(x=>x.code==='TOTAL'));
});
test('harga rupiah numerik mempertahankan nilai, kosong, nol dan histori presisi',async()=>{
 const report=fixture(),book=await buildWorkbook(report),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());const full=loaded.getWorksheet('Laporan PPIC'),audit=loaded.getWorksheet('Presisi Sumber'),a=rowFor(full,1,'A'),b=rowFor(full,1,'B'),z=rowFor(full,1,'Z');
 assert.equal(full.getCell('D4').value,'Harga Material (Rp/KG)');assert.equal(full.getCell('E4').value,'Total Nilai Aktual (Rp)');assert.equal(a.getCell(4).type,ExcelJS.ValueType.Number);assert.equal(a.getCell(4).value,39386.5957010719);assert.equal(a.getCell(5).value,1969329.79);assert.match(a.getCell(4).numFmt,/\[\$Rp-421\].*#,##0\.00/);assert.equal(a.getCell(4).numFmt,a.getCell(5).numFmt);assert.equal(b.getCell(4).value,null);assert.equal(b.getCell(5).value,null);assert.equal(z.getCell(4).value,0);assert.equal(z.getCell(5).value,0);assert.match(z.getCell(4).numFmt,/Rp-421/);assert.equal(rowFor(audit,1,'A').getCell(3).value,report.price_selection.items[0].price);assert.match(full.getCell('A3').value,/Harga kosong/);
});
