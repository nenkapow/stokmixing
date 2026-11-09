import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import ExcelJS from 'exceljs';
import {buildWorkbook} from './finac-export.js';
const find=(sheet,code)=>{let result;sheet.eachRow(r=>{if(r.getCell(1).value===code)result=r});return result};
test('toleransi hanya menyaring FINAC-only kecil, bukan catatan fisik',async()=>{
 const values=['0.000279','0.004296','-0.003','0.005','0.01','30.47','-0.005'];const materials=[],items=[];
 values.forEach((qty,i)=>{for(const recorded of [false,true]){const code=`${recorded?'REC':'ABS'}${i}`;materials.push({code,name:`${code} Mixing WIP OK`,system_qty:qty,average_cost:'1'});if(recorded)items.push({machine_id:1,machine_number:'1',code,name:`${code} Mixing WIP OK`,whole:0,standard:'25',open:'0',hopper:'0',actual:'0'})}});
 materials.push({code:'POSITIVE',name:'POSITIVE Mixing WIP OK',system_qty:'0.000279',average_cost:'1'});items.push({machine_id:1,machine_number:'1',code:'POSITIVE',name:'POSITIVE Mixing WIP OK',whole:0,standard:'25',open:'4',hopper:'0',actual:'4'});
 const report={session:{id:1,name:'Sintetis',opname_date:'2026-11-09'},machines:[{id:1,status:'COMPLETED'}],items,snapshot:{id:4,qty_is_kg:true,cost_per_kg:true,items:materials},price_selection:{source:'FINAC',finac_snapshot_id:4,items:[]}};
 const wb=await buildWorkbook(report),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await wb.xlsx.writeBuffer());const summary=loaded.getWorksheet('Ringkasan Stok'),full=loaded.getWorksheet('Laporan PPIC'),audit=loaded.getWorksheet('Presisi Sumber');
 values.forEach((value,i)=>{const absent=find(summary,`ABS${i}`),recorded=find(summary,`REC${i}`);assert.equal(Boolean(absent),i>=3,`saldo ${value}`);assert.ok(recorded,`catatan fisik ${value}`);assert.ok(find(full,`ABS${i}`));assert.equal(find(audit,`ABS${i}`).getCell(4).value,value);if(absent)assert.equal(absent.getCell(9).value,'Aktual Tidak Ada');if(i<3)assert.match(recorded.getCell(3).numFmt,/E\+00/)});
 assert.equal(find(summary,'POSITIVE').getCell(7).value,4);assert.equal(summary.lastRow.getCell(7).value.result,4);assert.equal(full.lastRow.getCell(7).value.result,4);assert.match(summary.lastRow.getCell(7).value.formula,/^SUM\(G5:G\d+\)$/);assert.match(find(summary,'ABS6').getCell(9).note,/negatif/);
});
