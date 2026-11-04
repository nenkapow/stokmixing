import { matchesMixing } from './calculation.js';
export function preview(rows) {
 const seen = new Set(), valid = [], errors = [], duplicates = [];
 for (let i=0;i<rows.length;i++) {
  const row=rows[i]; if (!matchesMixing(row.name)) continue;
  const code=String(row.code ?? '').trim(), qty=String(row.qty ?? '').trim();
  if (!code || (qty !== '' && (!Number.isFinite(Number(qty)) || Number(qty)<0))) { errors.push({line:i+2, reason: !code ? 'Kode kosong' : 'Qty tidak valid'}); continue; }
  if (seen.has(code)) { duplicates.push({line:i+2,code}); continue; }
  seen.add(code); valid.push({code,name:'Mixing WIP OK'});
 }
 return {valid,errors,duplicates};
}
