import Decimal from 'decimal.js';
const norm=x=>String(x??'').trim().replace(/\s+/g,' ').toLowerCase();
const headerMap={'code':'code','name':'name','uom':'uom','material cost':'price'};
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
export function parsePpicSheet(sheet){
 let header=null,headerRow=0;
 sheet.eachRow({includeEmpty:false},(row,n)=>{if(header)return;const found={};row.eachCell((cell,col)=>{const label=norm(scalar(cell));if(headerMap[label])found[headerMap[label]]=col});if(['code','name','uom','price'].every(k=>found[k])){header=found;headerRow=n}});
 if(!header)throw Error('Header Code, Name, UoM, dan Material Cost tidak ditemukan.');
 const rows=[];sheet.eachRow({includeEmpty:false},(row,n)=>{if(n<=headerRow)return;const rawCode=scalar(row.getCell(header.code)),name=scalar(row.getCell(header.name)),uom=scalar(row.getCell(header.uom)),priceCell=row.getCell(header.price);
  if((rawCode==null||String(rawCode).trim()==='')&&(name==null||String(name).trim()==='')&&(uom==null||String(uom).trim()==='')&&(priceCell.value==null||priceCell.value===''))return;
  if((rawCode==null||String(rawCode).trim()==='')&&typeof name==='string'&&/^(grand\s+)?total$/i.test(name.trim()))return;
  let code='',price=null,error='';try{if(typeof rawCode==='number'){if(!Number.isSafeInteger(rawCode)||rawCode<0||String(rawCode).length>15)throw Error('Kode numerik tidak aman; simpan sebagai teks');const pattern=row.getCell(header.code).numFmt||'';if(/^0+$/.test(pattern)&&pattern.length>String(rawCode).length)throw Error('Kode berformat nol depan perlu verifikasi');code=String(rawCode)}else if(typeof rawCode==='string')code=rawCode.trim();else throw Error('Kode kosong atau tidak valid');if(!code)throw Error('Kode kosong');if(typeof name!=='string'||!name.trim())throw Error('Nama tidak valid');if(norm(uom)!=='kg')throw Error('Satuan bukan KG');price=ppicPrice(priceCell);if(price.replace('.','').length>36)throw Error('Presisi harga terlalu besar')}catch(e){error=e.message}
  rows.push({line:n,code,name:typeof name==='string'?name:'',uom:String(uom??''),price,error});
 });return rows;
}
export function classifyPpic(rows,materials,latest){
 const master=new Map(materials.map(x=>[x.code,x])),prices=new Map(latest.map(x=>[x.code,x])),counts=new Map();
 for(const r of rows)if(r.code){if(!counts.has(r.code))counts.set(r.code,[]);counts.get(r.code).push(r)}
 return rows.map(r=>{const same=counts.get(r.code)||[],m=master.get(r.code),old=prices.get(r.code);let status='MATCH';if(same.length>1)status=new Set(same.map(x=>x.price)).size>1?'CONFLICT':'DUPLICATE';else if(r.error)status='INVALID';else if(!m)status='NOT FOUND';else if(norm(m.name)!==norm(r.name))status='NAME REVIEW';return {...r,status,masterName:m?.name??null,oldPrice:old?.price??null,expectedVersion:old?.version??0,change:!old?'BARU':r.price!=null&&new Decimal(old.price).eq(r.price)?'SAMA':'BERUBAH'}});
}
