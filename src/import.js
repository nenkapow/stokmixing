import { matchesMixing } from './calculation.js';
export function preview(rows) {
 const seen = new Set(), valid = [], errors = [], duplicates = [];
 for (let i=0;i<rows.length;i++) {
  const row=rows[i]; if (!matchesMixing(row.name)) continue;
  const code=String(row.code ?? '').trim(), qty=String(row.qty ?? '').trim();
  if (!code || (qty !== '' && (!Number.isFinite(Number(qty)) || Number(qty)<0))) { errors.push({line:i+2, reason: !code ? 'Kode kosong' : 'Qty tidak valid'}); continue; }
  if (seen.has(code)) { duplicates.push({line:i+2,code}); continue; }
  seen.add(code); valid.push({code,name:row.name});
 }
 return {valid,errors,duplicates};
}

export function rowsFromSheet(all) {
 const headers = Array.from(all[0] ?? [], cell => String(cell ?? '').trim().toLowerCase());
 for (const h of ['code', 'name', 'qty']) if (!headers.includes(h)) throw new Error('Kolom ' + h + ' tidak ditemukan');
 return all.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
