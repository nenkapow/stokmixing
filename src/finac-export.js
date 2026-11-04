import Decimal from 'decimal.js';
import {reconcile,machineName} from './finac.js';
// Excel stores at most 15 significant digits. The database and calculations retain
// the source decimal; the workbook records exact strings in a separate audit sheet.
function excelNumber(value){if(value==null)return null;const d=new Decimal(value);if(!d.isFinite())throw Error('Angka laporan tidak valid.');const rounded=d.toSignificantDigits(15,Decimal.ROUND_HALF_UP);const result=rounded.toNumber();if(!Number.isFinite(result) || (!rounded.isZero() && result===0))throw Error('Angka di luar rentang Excel.');return result}
function addRoundingNote(cell, value){if(value==null)return;const d=new Decimal(value),rounded=d.toSignificantDigits(15,Decimal.ROUND_HALF_UP);if(!d.eq(rounded))cell.note=`Nilai sumber tepat: ${d.toFixed()}. Angka Excel dibulatkan menjadi 15 digit signifikan; lihat sheet Presisi Sumber.`;}
function numericFormat(value,money=false){if(value==null)return;const d=new Decimal(value).toSignificantDigits(15,Decimal.ROUND_HALF_UP);return money?'#,##0.00;[Red]-#,##0.00':d.decimalPlaces()>15?'0.##############E+00':'#,##0.###############;[Red]-#,##0.###############'}
export async function buildWorkbook(report){
 const r=reconcile(report);if(!r.ready)throw Error('Ekspor belum siap: periksa snapshot, satuan, penyelesaian mesin, dan standar berbeda.');
 const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();wb.creator='Stock Opname Injection';
 const sheet=wb.addWorksheet('Laporan PPIC',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 sheet.addRow(['STOCK OPNAME BAHAN MIX MINGGUAN']);sheet.mergeCells('A1:K1');sheet.getCell('A1').font={bold:true,size:16};
 sheet.addRow([`Periode: ${report.session.name} · Tanggal: ${report.session.opname_date}`]);sheet.mergeCells('A2:K2');
 sheet.addRow(['Pecahan mencakup hopper. Nilai >15 digit signifikan dibulatkan; lihat Presisi Sumber.']);sheet.mergeCells('A3:K3');
 sheet.addRow(['Code','Name','UoM','Material Cost','Total Price (IDR)','System Qty','Total Qty','Actual Qty - Zak','Actual Qty - Pecahan','Std Qty - Kg/Zak','Selisih']);
 let totalActual=new Decimal(0),totalPrice=new Decimal(0),totalSystem=new Decimal(0),totalDelta=new Decimal(0),hasPrice=true,hasSystem=true;
 for(const x of r.rows){const row=sheet.addRow([String(x.code),String(x.name),'KG',excelNumber(x.cost),excelNumber(x.totalPrice),excelNumber(x.system),excelNumber(x.actual),x.whole,excelNumber(new Decimal(x.open).plus(x.hopper).toFixed()),excelNumber(x.standard),excelNumber(x.delta)]);
  if(x.system===null)row.getCell(1).note='Kode tidak ditemukan dalam snapshot FINAC. System Qty dan selisih tidak tersedia.';
  if(x.cost===null)row.getCell(4).note='Harga per kg belum dikonfirmasi atau tidak tersedia.';
  for(const [col,value] of [[4,x.cost],[5,x.totalPrice],[6,x.system],[7,x.actual],[9,new Decimal(x.open).plus(x.hopper).toFixed()],[10,x.standard],[11,x.delta]]){addRoundingNote(row.getCell(col),value);row.getCell(col).numFmt=numericFormat(value,col===5)}
  totalActual=totalActual.plus(String(excelNumber(x.actual)));if(x.totalPrice!==null){totalPrice=totalPrice.plus(String(excelNumber(x.totalPrice)));}else hasPrice=false;if(x.system!==null){totalSystem=totalSystem.plus(String(excelNumber(x.system)));totalDelta=totalDelta.plus(String(excelNumber(x.delta)));}else hasSystem=false;
 }
 const first=5,last=sheet.rowCount;const total=sheet.addRow(['TOTAL']);
 if(last>=first){for(const [col,sum,available] of [[5,totalPrice,hasPrice],[6,totalSystem,hasSystem],[7,totalActual,true],[11,totalDelta,hasSystem]])if(available)total.getCell(col).value={formula:`SUM(${sheet.getColumn(col).letter}${first}:${sheet.getColumn(col).letter}${last})`,result:excelNumber(sum.toFixed())}}
 total.font={bold:true};sheet.columns.forEach((col,i)=>{col.width=[20,42,18,20,23,18,18,20,23,20,18][i]});
 sheet.getRow(4).font={bold:true};sheet.views=[{state:'frozen',ySplit:4}];sheet.autoFilter={from:'A4',to:'K4'};
 for(let i=4;i<=sheet.rowCount;i++)for(let j=1;j<=11;j++){const c=sheet.getRow(i).getCell(j);c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};if(i===sheet.rowCount&&[5,6,7,11].includes(j))c.numFmt=j===5?'#,##0.00;[Red]-#,##0.00':'#,##0.###############;[Red]-#,##0.###############'}
 const detail=wb.addWorksheet('Detail Per Mesin',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
 detail.addRow(['Mesin','Kode Material','Nama Material','Zak Utuh','Standar KG/Zak','Sisa Zak Terbuka','Hopper Estimasi','Total Aktual','Nama Mandor']);
 for(const i of report.items){const row=detail.addRow([String(machineName(i)),String(i.code),String(i.name),Number(i.whole),excelNumber(i.standard),excelNumber(i.open),excelNumber(i.hopper),excelNumber(i.actual),String(i.mandor_name||'Nama mandor belum tersedia')]);for(const [col,value] of [[5,i.standard],[6,i.open],[7,i.hopper],[8,i.actual]]){addRoundingNote(row.getCell(col),value);row.getCell(col).numFmt=numericFormat(value)}}
 detail.columns.forEach((col,i)=>{col.width=[18,20,42,15,20,22,20,20,30][i]});detail.getRow(1).font={bold:true};detail.views=[{state:'frozen',ySplit:1}];
 for(let i=1;i<=detail.rowCount;i++)for(let j=1;j<=9;j++){const c=detail.getRow(i).getCell(j);c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}}
 const audit=wb.addWorksheet('Presisi Sumber');
 audit.addRow(['Nilai desimal tepat sebagai teks; Total Price dan Nilai Selisih dibulatkan ke 2 desimal IDR.']);audit.addRow(['Kode','Nama','Material Cost','System Qty','Total Qty','Selisih','Total Price (IDR)','Nilai Selisih (IDR)']);
 for(const x of r.rows)audit.addRow([String(x.code),String(x.name),x.cost==null?'':String(x.cost),x.system==null?'':String(x.system),String(x.actual),x.delta==null?'':String(x.delta),x.totalPrice==null?'':String(x.totalPrice),x.differenceValue==null?'':String(x.differenceValue)]);
 audit.columns.forEach((col,i)=>{col.width=[20,42,30,30,30,30,30,30][i]});audit.getRow(2).font={bold:true};
 wb.calcProperties.fullCalcOnLoad=true;return wb;
}
