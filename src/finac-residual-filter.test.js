import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import {buildWorkbook} from './finac-export.js';
const find=(sheet,code)=>{let result;sheet.eachRow(r=>{if(r.getCell(1).value===code)result=r});return result};
test('ambang 1 KG hanya menyaring saldo tanpa catatan opname',async()=>{
 const values=['0','0.01','0.15','0.5','0.9','0.99','1.00','1.01','-0.5','-1.00','-5.00'];const materials=[],items=[];
 values.forEach((qty,i)=>{for(const kind of ['ABS','ZERO','POS']){const code=`${kind}${i}`;materials.push({code,name:`${code} Mixing WIP OK`,system_qty:qty,average_cost:'1'});if(kind!=='ABS'){const actual=kind==='POS'?'4':'0';items.push({machine_id:1,machine_number:'1',code,name:`${code} Mixing WIP OK`,whole:0,standard:'25',open:actual,hopper:'0',actual})}}});
 const report={session:{id:1,name:'Sintetis',opname_date:'2026-11-09'},machines:[{id:1,status:'COMPLETED'}],items,snapshot:{id:4,qty_is_kg:true,cost_per_kg:true,items:materials},price_selection:{source:'FINAC',finac_snapshot_id:4,items:[]}};
 const wb=await buildWorkbook(report),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await wb.xlsx.writeBuffer());const summary=loaded.getWorksheet('Ringkasan Stok'),full=loaded.getWorksheet('Laporan PPIC'),audit=loaded.getWorksheet('Presisi Sumber');
 values.forEach((value,i)=>{const absent=find(summary,`ABS${i}`),recorded=find(summary,`ZERO${i}`),positive=find(summary,`POS${i}`);assert.equal(Boolean(absent),new Decimal(value).abs().gte(1),`saldo ${value}`);assert.ok(recorded,`catatan fisik nol ${value}`);assert.equal(recorded.getCell(7).value,0);assert.equal(positive.getCell(7).value,4);for(const prefix of ['ABS','ZERO','POS']){assert.ok(find(full,`${prefix}${i}`));assert.equal(find(audit,`${prefix}${i}`).getCell(4).value,value)}if(absent){assert.equal(absent.getCell(9).value,'Aktual Tidak Ada');assert.equal(absent.getCell(9).font.color.argb,'FFB42318');if(new Decimal(value).isNegative())assert.match(absent.getCell(9).note,/negatif/)}});
 assert.equal(summary.lastRow.getCell(7).value.result,44);assert.equal(full.lastRow.getCell(7).value.result,44);assert.match(summary.lastRow.getCell(7).value.formula,/^SUM\(G5:G\d+\)$/);assert.equal(find(summary,'ZERO0').getCell(9).font?.color?.argb,undefined);
});
