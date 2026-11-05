import { matchesMixing } from './calculation.js';
const normalizeName = name => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const blank=value => value == null || (typeof value === 'string' && value.trim() === '');
const explicitTotal=value => typeof value === 'string' && /^(?:grand\s+)?total$/i.test(value.trim());
// Numeric cell syntax is only used as structural evidence, never as a material quantity.
const numericCell=value => typeof value === 'number' ? Number.isFinite(value) : value && typeof value === 'object' && typeof value.formula === 'string' ? typeof value.result === 'number' && Number.isFinite(value.result) : typeof value === 'string' && /^[+-]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
const nonempty=row=>row && Object.values(row).some(value=>!blank(value));
export function isFinacSummaryRow(row,index,rows) {
 if(!row || !blank(row.code) || !blank(row.name))return false;
 const required=['category','description coa','qty','average','total'];
 if(required.some(key=>!Object.hasOwn(row,key)))return false;
 // Only the last populated row is eligible; do not hide subtotals inside the data.
 for(let i=index+1;i<rows.length;i++)if(nonempty(rows[i]))return false;
 if(!rows.slice(0,index).some(previous=>previous && !blank(previous.code) && typeof previous.name==='string' && previous.name.trim()))return false;
 const identity=[row.category,row['description coa']];
 if(identity.some(value=>!blank(value)&&!explicitTotal(value)))return false;
 const allowed=new Set(['category','description coa','code','name','qty','average','total']);
 if(Object.entries(row).some(([key,value])=>!allowed.has(key)&&!blank(value)))return false;
 const numeric=[row.qty,row.average,row.total];
 if(numeric.some(value=>!blank(value)&&!numericCell(value)))return false;
 const count=numeric.filter(value=>!blank(value)&&numericCell(value)).length;
 const hasLabel=identity.some(explicitTotal);
 // An unlabelled footer needs two numeric fields, including Qty or Total.
 return hasLabel ? count>=1 : count>=2 && (!blank(row.qty)||!blank(row.total));
}

// Duplicate counts are file rows; candidates are distinct codes. Conflicting codes are excluded.
export function preview(rows) {
 const byCode=new Map(), errors=[],duplicates=[],conflicts=[],summaries=[], allNames=new Map(); let totalMixing=0;
 rows.forEach(row=>{const code=String(row.code??'').trim();if(code && typeof row.name==='string' && row.name.trim()){if(!allNames.has(code))allNames.set(code,new Map());const normalized=normalizeName(row.name);if(!allNames.get(code).has(normalized))allNames.get(code).set(normalized,row.name);}});
 rows.forEach((row,i)=>{
  if(isFinacSummaryRow(row,i,rows)){summaries.push({line:i+2});return}
  if(typeof row.name!=='string' || !row.name.trim()){errors.push({line:i+2,reason:'Nama tidak valid'});return}
  if(!matchesMixing(row.name))return;totalMixing++;
  const code=String(row.code??'').trim();
  if(!code || !['string','number'].includes(typeof row.code) || (typeof row.code==='number'&&!Number.isFinite(row.code))){errors.push({line:i+2,reason:!code?'Kode kosong':'Kode tidak valid'});return}
  if(byCode.has(code)){duplicates.push({line:i+2,code});return}
  byCode.set(code,{code,name:row.name});
 });
 const valid=[];
 for(const [code,item] of byCode){if(allNames.get(code)?.size>1)conflicts.push({code,names:[...allNames.get(code).values()]});else valid.push(item)}
 return {totalMixing,valid,errors,duplicates,conflicts,summaries};
}
export function classifyMaterials(rows,existingCodes){
 const result=preview(rows),known=new Set(existingCodes),existing=[],newMaterials=[];
 for(const material of result.valid)(known.has(material.code)?existing:newMaterials).push(material);
 return {...result,existing,newMaterials};
}
export function rowsFromSheet(all) {
 const headers = Array.from(all[0] ?? [], cell => String(cell ?? '').trim().toLowerCase());
 for (const h of ['code', 'name', 'qty']) if (!headers.includes(h)) throw new Error('Kolom ' + h + ' tidak ditemukan');
 return all.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
