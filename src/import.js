import { matchesMixing } from './calculation.js';
const normalizeName = name => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
// Duplicate counts are file rows; candidates are distinct codes. Conflicting codes are excluded.
export function preview(rows) {
 const byCode=new Map(), errors=[],duplicates=[],conflicts=[], allNames=new Map(); let totalMixing=0;
 rows.forEach(row=>{const code=String(row.code??'').trim();if(code && typeof row.name==='string' && row.name.trim()){if(!allNames.has(code))allNames.set(code,new Map());const normalized=normalizeName(row.name);if(!allNames.get(code).has(normalized))allNames.get(code).set(normalized,row.name);}});
 rows.forEach((row,i)=>{
  if(typeof row.name!=='string' || !row.name.trim()){errors.push({line:i+2,reason:'Nama tidak valid'});return}
  if(!matchesMixing(row.name))return;totalMixing++;
  const code=String(row.code??'').trim();
  if(!code || !['string','number'].includes(typeof row.code) || (typeof row.code==='number'&&!Number.isFinite(row.code))){errors.push({line:i+2,reason:!code?'Kode kosong':'Kode tidak valid'});return}
  if(byCode.has(code)){duplicates.push({line:i+2,code});return}
  byCode.set(code,{code,name:row.name});
 });
 const valid=[];
 for(const [code,item] of byCode){if(allNames.get(code)?.size>1)conflicts.push({code,names:[...allNames.get(code).values()]});else valid.push(item)}
 return {totalMixing,valid,errors,duplicates,conflicts};
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
