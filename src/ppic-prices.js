import Decimal from 'decimal.js';
const norm=x=>String(x??'').trim().replace(/\s+/g,' ').toLowerCase();
const headerMap={'code':'code','name':'name','uom':'uom','material cost':'price','harga material (rp/kg)':'price'};
function scalar(cell){const v=cell?.value;if(v&&typeof v==='object'&&Array.isArray(v.richText))return v.richText.map(x=>x.text).join('');return v}
function priceValue(value){const text=new Decimal(value).toFixed();if(!/^\d{1,18}(?:\.\d{1,18})?$/.test(text))throw Error('Presisi harga melebihi batas database');return text}
export function ppicPrice(cell){
 const v=scalar(cell);if(v==null||v==='')throw Error('Harga kosong');
 if(typeof v==='number'){if(!Number.isFinite(v)||v<0||/%/.test(cell.numFmt||''))throw Error('Harga tidak valid');return priceValue(v)}
 if(typeof v!=='string')throw Error('Harga formula atau format tidak dapat diverifikasi');
 const s=v.trim();if(!s)throw Error('Harga kosong');if(/^\d+$/.test(s))return priceValue(s);
 if(/^\d+[.,]\d{3}$/.test(s))throw Error('Format harga ambigu; verifikasi nilai numerik Excel');
 if(/^\d+[.,]\d{1,18}$/.test(s))return priceValue(s.replace(',','.'));
 throw Error('Harga tidak valid atau ambigu');
}
const blank=value=>value==null||(typeof value==='string'&&value.trim()==='');
// A formula with an explicit empty cached result is blank; a missing cache is unknown.
const blankRelevant=value=>blank(value)||(value&&typeof value==='object'&&'formula' in value&&'result' in value&&blank(value.result));
const totalLabel=value=>typeof value==='string'&&/^(?:grand\s+)?total$/i.test(value.trim());
const aggregateNumber=value=>typeof value==='number'?Number.isFinite(value):typeof value==='string'?/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)$/.test(value.trim()):Boolean(value&&typeof value==='object'&&typeof value.result==='number'&&Number.isFinite(value.result));
export function parsePpicSheet(sheet){
 let header=null,headerRow=0,aggregateColumns=[];
 sheet.eachRow({includeEmpty:false},(row,n)=>{if(header)return;const found={},aggregates=[];row.eachCell((cell,col)=>{const label=norm(scalar(cell));if(headerMap[label])found[headerMap[label]]=col;if(['total price (idr)','total price','system qty','total qty','selisih','total nilai aktual (rp)','stok finac (kg)','total aktual (kg)','finac - aktual (kg)'].includes(label))aggregates.push(col)});if(['code','name','uom','price'].every(k=>found[k])){header=found;headerRow=n;aggregateColumns=aggregates}});
 if(!header)throw Error('Header Code, Name, UoM, dan Material Cost tidak ditemukan.');
 let lastPopulated=headerRow;sheet.eachRow({includeEmpty:false},(row,n)=>{if(n>headerRow){let populated=false;row.eachCell({includeEmpty:false},cell=>{if(!blank(scalar(cell)))populated=true});if(populated)lastPopulated=n}});
 const rows=[],skipped={header:0,separator:0,footer:0};let seenMaterial=false;
 sheet.eachRow({includeEmpty:true},(row,n)=>{if(n<=headerRow||n>lastPopulated)return;const rawCode=scalar(row.getCell(header.code)),name=scalar(row.getCell(header.name)),uom=scalar(row.getCell(header.uom)),priceCell=row.getCell(header.price);
  if(norm(rawCode)==='code'&&norm(name)==='name'&&norm(uom)==='uom'&&(blankRelevant(scalar(priceCell))||headerMap[norm(scalar(priceCell))]==='price')){skipped.header++;return}
  if([rawCode,name,uom,scalar(priceCell)].every(blankRelevant)){skipped.separator++;return}
  // Only a terminal, explicitly labelled total with an aggregate in a separate
  // report column is safe to discard; a code alone is never sufficient.
  let labels=0,otherText=false;row.eachCell({includeEmpty:false},cell=>{const value=scalar(cell);if(blank(value))return;if(totalLabel(value))labels++;else if(!aggregateNumber(value))otherText=true});
  const footer=n===lastPopulated&&seenMaterial&&labels>0&&(blank(rawCode)||totalLabel(rawCode))&&(blank(name)||totalLabel(name))&&blank(uom)&&!otherText&&aggregateColumns.some(col=>aggregateNumber(scalar(row.getCell(col))));
  if(footer){skipped.footer++;return}
  let code='',price=null,error='';try{if(typeof rawCode==='number'){if(!Number.isSafeInteger(rawCode)||rawCode<0||String(rawCode).length>15)throw Error('Kode numerik tidak aman; simpan sebagai teks');const pattern=row.getCell(header.code).numFmt||'';if(/^0+$/.test(pattern)&&pattern.length>String(rawCode).length)throw Error('Kode berformat nol depan perlu verifikasi');code=String(rawCode)}else if(typeof rawCode==='string')code=rawCode.trim();else throw Error('Kode kosong atau tidak valid');if(!code)throw Error('Kode kosong');if(typeof name!=='string'||!name.trim())throw Error('Nama tidak valid');if(norm(uom)!=='kg')throw Error('Satuan bukan KG');price=ppicPrice(priceCell);if(price.replace('.','').length>36)throw Error('Presisi harga terlalu besar')}catch(e){error=e.message}
  if(code&&typeof name==='string'&&name.trim()&&!totalLabel(code)&&!totalLabel(name))seenMaterial=true;
  rows.push({line:n,code,name:typeof name==='string'?name:'',uom:String(uom??''),price,error});
 });Object.defineProperty(rows,'skipped',{value:skipped,enumerable:false});return rows;
}
export function classifyPpic(rows,materials,latest){
 const master=new Map(materials.map(x=>[x.code,x])),prices=new Map(latest.map(x=>[x.code,x])),counts=new Map();
 for(const r of rows)if(r.code){if(!counts.has(r.code))counts.set(r.code,[]);counts.get(r.code).push(r)}
 return rows.map(r=>{const same=counts.get(r.code)||[],m=master.get(r.code),old=prices.get(r.code);let status='MATCH';if(same.length>1)status=new Set(same.map(x=>x.price)).size>1?'CONFLICT':'DUPLICATE';else if(r.error)status='INVALID';else if(!m)status='NOT FOUND';else if(norm(m.name)!==norm(r.name))status='NAME REVIEW';return {...r,status,masterName:m?.name??null,oldPrice:old?.price??null,expectedVersion:old?.version??0,change:!old?'BARU':r.price!=null&&new Decimal(old.price).eq(r.price)?'SAMA':'BERUBAH'}});
}

// Display rounding does not mutate source values or versioned database prices.
export function formatPpicPrice(value){
 if(value==null)return '—';
 const [whole,fraction]=new Decimal(value).toFixed(2).split('.');
 return `Rp${whole.replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${fraction}/kg`;
}
export function summarizePpic(rows,skipped={}){
 const count=status=>rows.filter(r=>r.status===status).length;
 const eligible=rows.filter(r=>r.status==='MATCH'||r.status==='NAME REVIEW');
 return {total:rows.length,matched:count('MATCH')+count('NAME REVIEW'),newPrice:eligible.filter(r=>r.change==='BARU').length,changed:eligible.filter(r=>r.change==='BERUBAH').length,same:eligible.filter(r=>r.change==='SAMA').length,notFound:count('NOT FOUND'),nameReview:count('NAME REVIEW'),duplicates:count('DUPLICATE')+count('CONFLICT'),invalid:count('INVALID'),skipped:{header:skipped.header||0,separator:skipped.separator||0,footer:skipped.footer||0}};
}
export function ppicImportRows(rows,{confirmPartial=false,confirmedNames=[],confirmChanged=false}={}){
 const eligible=rows.filter(r=>r.status==='MATCH'||r.status==='NAME REVIEW'),excluded=rows.filter(r=>r.status!=='MATCH'&&r.status!=='NAME REVIEW');
 if(!eligible.length)throw Error('Tidak ada baris valid yang cocok untuk diimpor');
 if(excluded.length&&!confirmPartial)throw Error('Konfirmasi impor sebagian diperlukan');
 if(eligible.some(r=>r.change==='BERUBAH')&&!confirmChanged)throw Error('Konfirmasi perubahan harga wajib diisi');
 if(eligible.some(r=>r.status==='NAME REVIEW'&&!confirmedNames.includes(r.line)))throw Error('Periksa dan konfirmasi setiap perbedaan nama');
 return eligible.map(x=>({code:x.code,name:x.name,price:x.price,expected_version:x.expectedVersion,confirm_changed:x.change==='BERUBAH',confirm_name:x.status==='NAME REVIEW'}));
}
