import {test} from 'node:test';import {strict as assert} from 'node:assert';import ExcelJS from 'exceljs';
import {parsePpicSheet,classifyPpic,ppicPrice} from './ppic-prices.js';import {reconcile} from './finac.js';import {buildWorkbook} from './finac-export.js';
test('pilihan worksheet, header baris tujuh dan kode panjang',async()=>{const w=new ExcelJS.Workbook();w.addWorksheet('Lain');const s=w.addWorksheet('21 Aug 26');for(let i=0;i<6;i++)s.addRow(['Judul']);s.addRow(['Code','Name','UoM','Material Cost','Total Price (IDR)']);s.addRow(['10620610114162','Synthetic Mixing WIP OK','KG',23561,999]);s.getCell('D8').numFmt='#,##0';const bytes=await w.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);const rows=parsePpicSheet(loaded.getWorksheet('21 Aug 26'));assert.equal(rows[0].code,'10620610114162');assert.equal(rows[0].price,'23561');assert.equal(rows[0].line,8);assert.throws(()=>parsePpicSheet(loaded.getWorksheet('Lain')))});
test('nilai numerik Excel dipakai sesuai isi; teks ambigu, negatif dan kosong ditolak',()=>{assert.equal(ppicPrice({value:23.561,numFmt:'#,##0.000'}),'23.561');assert.equal(ppicPrice({value:23561,numFmt:'#,##0'}),'23561');assert.equal(ppicPrice({value:'23,56'}),'23.56');for(const v of ['23.561','23,561','',-1,'abc'])assert.throws(()=>ppicPrice({value:v}))});
test('klasifikasi membedakan nama, kode, duplikat, konflik dan harga',()=>{const m=[{code:'A',name:'Mixing WIP OK'},{code:'B',name:'Nama B'}],old=[{code:'A',price:'20',version:2}],rows=[{code:'A',name:'Mixing WIP OK',price:'21',error:''},{code:'B',name:'Nama beda',price:'1',error:''},{code:'C',name:'X',price:'1',error:''},{code:'D',name:'X',price:'1',error:''},{code:'D',name:'X',price:'2',error:''},{code:'E',name:'X',price:null,error:'Harga kosong'}];const c=classifyPpic(rows,m,old);assert.deepEqual(c.map(x=>x.status),['MATCH','NAME REVIEW','NOT FOUND','CONFLICT','CONFLICT','INVALID']);assert.equal(c[0].change,'BERUBAH');assert.equal(c[0].expectedVersion,2);assert.equal(classifyPpic([{...rows[0],price:'20'}],m,old)[0].change,'SAMA')});
test('snapshot PPIC dipakai tanpa fallback dan tersimpan dalam audit XLSX',async()=>{const d={session:{id:1,name:'Uji',opname_date:'2026-11-05'},machines:[{id:1,status:'COMPLETED'}],items:[{machine_id:1,machine_number:'1',code:'A',name:'Mixing WIP OK',whole:1,standard:'25',open:'0',hopper:'0',actual:'25'}],snapshot:{id:4,qty_is_kg:true,cost_per_kg:true,items:[{code:'A',name:'Mixing WIP OK',system_qty:'30',average_cost:'100'}]},price_selection:{source:'PPIC',version:1,finac_snapshot_id:4,items:[{code:'A',price:'200',price_version:2,price_version_id:7}]}};let a=reconcile(d).rows[0];assert.equal(a.cost,'200');assert.equal(a.finacAverage,'100');assert.equal(a.totalPrice,'5000.00');assert.equal(a.differenceValue,'1000.00');const w=await buildWorkbook(d),bytes=await w.xlsx.writeBuffer(),read=new ExcelJS.Workbook();await read.xlsx.load(bytes);assert.equal(read.worksheets[0].getCell('D5').value,200);assert.equal(read.worksheets[2].getCell('I3').value,'PPIC');assert.equal(read.worksheets[2].getCell('J3').value,2);d.price_selection.items=[];a=reconcile(d).rows[0];assert.equal(a.cost,null);assert.equal(a.totalPrice,null);d.price_selection=null;a=reconcile(d).rows[0];assert.equal(a.cost,null);assert.equal(a.finacAverage,'100');delete d.price_selection;assert.equal(reconcile(d).rows[0].cost,null)});

test('duplikat harga identik tetap ditandai dan satuan tidak valid ditolak',()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost']);s.addRow(['A','Mixing WIP OK','PCS',10]);s.addRow(['B','Mixing WIP OK','KG',10]);s.addRow(['B','Mixing WIP OK','KG',10]);const r=parsePpicSheet(s),c=classifyPpic(r,[{code:'A',name:'Mixing WIP OK'},{code:'B',name:'Mixing WIP OK'}],[]);assert.equal(c[0].status,'INVALID');assert.equal(c[1].status,'DUPLICATE');assert.equal(c[2].status,'DUPLICATE')});

test('kode Excel numerik lebih dari 15 digit tidak ditebak',()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost']);s.addRow([1234567890123456,'Mixing WIP OK','KG',10]);const r=parsePpicSheet(s);assert.match(r[0].error,/kode numerik tidak aman/i)});

test('footer TOTAL atau GRAND TOTAL hanya dibuang pada posisi akhir dengan angka agregat',()=>{
 for(const [column,label] of [[1,'TOTAL'],[1,'GRAND TOTAL'],[2,'TOTAL']]){
  const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost','Total Price (IDR)']);s.addRow(['PT001','Synthetic Mixing WIP OK','KG',10,20]);const footer=s.addRow([]);footer.getCell(column).value=label;footer.getCell(5).value=20;
  const rows=parsePpicSheet(s);assert.equal(rows.length,1);assert.equal(rows[0].code,'PT001');
 }
});
test('kode tanpa nama dan baris TOTAL ambigu tidak diam-diam dilewati',()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost','Total Price (IDR)']);s.addRow(['PT001','Synthetic Mixing WIP OK','KG',10,20]);s.addRow(['TOTAL','','',10,null]);s.addRow(['PT002','','KG',10,20]);const rows=parsePpicSheet(s);assert.equal(rows.length,3);assert.match(rows[1].error,/Nama tidak valid/);assert.match(rows[2].error,/Nama tidak valid/);
});
test('kode material TOTAL dengan nama valid tetap diproses',()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost','Total Price (IDR)']);s.addRow(['TOTAL','Synthetic Mixing WIP OK','KG',10,20]);const r=parsePpicSheet(s);assert.equal(r.length,1);assert.equal(r[0].code,'TOTAL');assert.equal(r[0].error,'')});

test('harga snapshot versi lama tidak dipakai atau diekspor setelah FINAC berubah',async()=>{
 const d={session:{id:1,name:'Uji',opname_date:'2026-11-05'},machines:[{id:1,status:'COMPLETED'}],items:[{machine_id:1,machine_number:'1',code:'A',name:'Mixing WIP OK',whole:1,standard:'25',open:'0',hopper:'0',actual:'25'}],snapshot:{id:1,version:1,qty_is_kg:true,cost_per_kg:true,items:[{code:'A',name:'Mixing WIP OK',system_qty:'30',average_cost:'10'}]},price_selection:{source:'PPIC',version:1,finac_snapshot_id:1,items:[{code:'A',price:'200'}]}};
 assert.equal(reconcile(d).pricesStale,false);assert.equal(reconcile(d).rows[0].cost,'200');await buildWorkbook(d);
 d.snapshot={...d.snapshot,id:2,version:2};let result=reconcile(d);assert.equal(result.pricesStale,true);assert.equal(result.ready,false);assert.equal(result.rows[0].cost,null);assert.equal(result.rows[0].differenceValue,null);await assert.rejects(buildWorkbook(d),/tetapkan kembali/i);
 d.price_selection={source:'FINAC',version:2,finac_snapshot_id:2,items:[{code:'A',price:'10'}]};result=reconcile(d);assert.equal(result.pricesStale,false);assert.equal(result.rows[0].cost,'10');await buildWorkbook(d);
 d.snapshot={...d.snapshot,id:3,version:3};result=reconcile(d);assert.equal(result.pricesStale,true);assert.equal(result.rows[0].cost,null);await assert.rejects(buildWorkbook(d),/tetapkan kembali/i);
});

test('subtotal di tengah dan footer tanpa bukti agregat tetap diperiksa',()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost','Total Price (IDR)']);s.addRow(['A','Mixing WIP OK','KG',10,20]);s.addRow(['TOTAL','','',null,20]);s.addRow(['B','Mixing Blue WIP OK','KG',10,20]);s.addRow(['GRAND TOTAL','','',null,null]);const rows=parsePpicSheet(s);assert.equal(rows.length,4);assert.match(rows[1].error,/Nama tidak valid/);assert.match(rows[3].error,/Nama tidak valid/)});

test('fixture XLSX sintetis melewati header berulang dan pemisah tanpa menyembunyikan baris rusak',async()=>{
 const wb=new ExcelJS.Workbook(),s=wb.addWorksheet('25 Sept 26');
 for(let i=0;i<6;i++)s.addRow(['Judul laporan sintetis']);
 const header=['Code','Name','UoM','Material Cost','Total Price (IDR)'];s.addRow(header);
 s.addRow(['10620610114162','Material A Mixing WIP OK','KG',26283.105556740258,100]);
 s.addRow(['Code','Name','UoM']);
 const separator=s.addRow([]);separator.getCell(5).value=0;
 s.addRow(['MISSING','Material B Mixing WIP OK','KG',12.34,10]);
 s.addRow(['BAD','','KG',10,10]);
 s.addRow(['','', '',{formula:'IF(A1="","",1)'},null]);
 s.addRow(['TOTAL','','',null,110]);
 const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await wb.xlsx.writeBuffer());const rows=parsePpicSheet(loaded.getWorksheet('25 Sept 26'));
 assert.deepEqual(rows.map(r=>r.line),[8,11,12,13]);assert.deepEqual(rows.skipped,{header:1,separator:1,footer:1});assert.equal(rows[0].code,'10620610114162');assert.equal(rows[0].price,'26283.105556740258');assert.match(rows[2].error,/Nama tidak valid/);assert.ok(rows[3].error);
});

test('ringkasan konsisten dan impor sebagian harus dikonfirmasi bersama nama dan perubahan',async()=>{
 const {summarizePpic,ppicImportRows,formatPpicPrice}=await import('./ppic-prices.js');
 const m=[{code:'A',name:'Nama A'},{code:'B',name:'Nama B'}],old=[{code:'A',price:'20',version:4}],rows=[
 {line:8,code:'A',name:'Nama A',price:'26283.105556740258',error:''},
 {line:9,code:'B',name:'Nama lain',price:'5',error:''},
 {line:10,code:'C',name:'Nama C',price:'6',error:''},
 {line:11,code:'D',name:'',price:null,error:'Nama tidak valid'},
 {line:12,code:'E',name:'E',price:'1',error:''},{line:13,code:'E',name:'E',price:'1',error:''}];
 const classified=classifyPpic(rows,m,old),summary=summarizePpic(classified,{header:1,separator:1,footer:1});
 assert.deepEqual(summary,{total:6,matched:2,newPrice:1,changed:1,same:0,notFound:1,nameReview:1,duplicates:2,invalid:1,skipped:{header:1,separator:1,footer:1}});
 assert.equal(formatPpicPrice(rows[0].price),'Rp26.283,11/kg');assert.equal(rows[0].price,'26283.105556740258');
 assert.throws(()=>ppicImportRows(classified),/sebagian/);assert.throws(()=>ppicImportRows(classified,{confirmPartial:true}),/perubahan/);assert.throws(()=>ppicImportRows(classified,{confirmPartial:true,confirmChanged:true}),/nama/i);
 const result=ppicImportRows(classified,{confirmPartial:true,confirmChanged:true,confirmedNames:[9]});assert.deepEqual(result.map(x=>x.code),['A','B']);assert.equal(result[0].price,'26283.105556740258');assert.equal(result[0].expected_version,4);assert.equal(result[1].confirm_name,true);assert.equal(old[0].price,'20');assert.equal(old[0].version,4);
});

test('formula tanpa cache yang dapat diverifikasi tetap bermasalah',()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('Uji');s.addRow(['Code','Name','UoM','Material Cost']);const a=s.addRow([]);a.getCell(4).value={formula:'IF(1=1,"",1)',result:''};const b=s.addRow([]);b.getCell(4).value={formula:'IF(1=1,"",1)'};s.addRow(['A','Synthetic Mixing WIP OK','KG',5]);const rows=parsePpicSheet(s);assert.equal(rows.skipped.separator,0);assert.equal(rows[0].line,2);assert.ok(rows[0].error);assert.ok(rows[1].error);assert.equal(rows[2].code,'A');
});
