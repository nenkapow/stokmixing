import { classifyMaterials, rowsFromSheet } from './import.js';
import { parseCsv } from './finac.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A capped PostgREST response must never be mistaken for the complete master.
export async function getMasterCodes(db){
 const codes=[];let expected=null;
 for(;;){
  const {data,error,count}=await db.from('materials').select('code',{count:'exact'}).order('code').range(codes.length,codes.length+499);
  if(error)throw error;if(count==null||!Array.isArray(data))throw Error('Jumlah master tidak tersedia; preview tidak dapat dibuat.');
  if(expected!==null&&expected!==count)throw Error('Master berubah saat dibaca; pilih ulang file.');expected=count;
  codes.push(...data.map(row=>row.code));if(codes.length===count)return codes;
  if(data.length===0||codes.length>count)throw Error('Data master tidak lengkap; preview tidak dapat dibuat.');
 }
}
export function initMasterImport(db,content,message){
 let generation=0,saving=false;
 content.innerHTML=`<div class="page-heading"><div><span class="eyebrow">MASTER DATA / FINAC</span><h2>Impor Master Material</h2><p>Tambahkan material Mixing WIP OK dari FINAC tanpa mengubah master yang sudah terdaftar.</p></div></div><section class="panel"><h3>Pilih file FINAC</h3><p>Gunakan CSV atau XLSX dengan kolom Code, Name dan Qty. Qty tidak disimpan dalam master.</p><label>File FINAC<input id="master-file" type="file" accept=".csv,.xlsx"></label><div id="master-preview" aria-live="polite"></div></section>`;
 const fileInput=content.querySelector('#master-file'),panel=content.querySelector('#master-preview');
 fileInput.onchange=async e=>{
  const token=++generation,file=e.target.files[0];panel.innerHTML='';message('');if(!file)return;panel.innerHTML='<p>Memeriksa file dan membandingkan master…</p>';
  try{
   let all;if(file.name.toLowerCase().endsWith('.csv'))all=parseCsv(await file.text());else if(file.name.toLowerCase().endsWith('.xlsx')){const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());if(!wb.worksheets[0])throw Error('Workbook kosong');all=[];wb.worksheets[0].eachRow({includeEmpty:false},row=>all.push(row.values.slice(1)))}else throw Error('Pilih file CSV atau XLSX.');
   const rows=rowsFromSheet(all),codes=await getMasterCodes(db);if(token!==generation||!content.isConnected||content.dataset.page!=='import')return;
   const p=classifyMaterials(rows,codes),blocked=p.errors.length>0||p.conflicts.length>0;
   const noNew=p.totalMixing===0?'Tidak ada material Mixing WIP OK dalam file.':!p.newMaterials.length&&!blocked?'Seluruh material sudah terdaftar. Tidak ada data baru untuk ditambahkan.':'';
   panel.innerHTML=`<h3>Preview impor</h3><p>Total Mixing: <strong>${p.totalMixing}</strong> · Material baru: <strong>${p.newMaterials.length}</strong> · Sudah terdaftar: <strong>${p.existing.length}</strong> · Duplikat file: <strong>${p.duplicates.length}</strong> · Bermasalah: <strong>${p.errors.length}</strong> · Konflik nama: <strong>${p.conflicts.length}</strong></p><p>Jumlah baru dan terdaftar adalah kode unik; duplikat dan bermasalah adalah jumlah baris. Konflik dihitung per kode.</p>${p.duplicates.length?`<details><summary>Detail duplikat file</summary><ul>${p.duplicates.map(x=>`<li>Baris ${x.line}: ${esc(x.code)}</li>`).join('')}</ul></details>`:''}${p.existing.length?`<details><summary>Lihat material yang sudah terdaftar</summary><ul>${p.existing.map(x=>`<li>${esc(x.code)} · ${esc(x.name)}</li>`).join('')}</ul></details>`:''}${p.conflicts.length?`<div role="alert"><p>Kode dengan nama berbeda perlu diperiksa:</p><ul>${p.conflicts.map(x=>`<li><strong>${esc(x.code)}</strong>: ${x.names.map(esc).join(' / ')}</li>`).join('')}</ul></div>`:''}${p.errors.length?`<p role="alert">${esc(p.errors.map(x=>`Baris ${x.line}: ${x.reason}`).join('; '))}</p>`:''}${p.newMaterials.length?`<h3>Material baru yang akan ditambahkan</h3><ul>${p.newMaterials.map(x=>`<li>${esc(x.code)} · ${esc(x.name)}</li>`).join('')}</ul>`:''}${noNew?`<p>${esc(noNew)}</p>`:''}${blocked?'<p>Perbaiki baris bermasalah atau konflik nama sebelum impor.</p>':''}<button id="master-confirm" ${!p.newMaterials.length||blocked?'disabled':''}>Impor Material Baru</button>`;
   panel.querySelector('#master-confirm').onclick=async()=>{
    if(saving||token!==generation)return;saving=true;const button=panel.querySelector('#master-confirm');button.disabled=true;fileInput.disabled=true;
    try{const {data,error}=await db.rpc('import_materials',{items:p.newMaterials,source_filename:file.name});if(error)throw error;if(!Number.isSafeInteger(data)||data<0||data>p.newMaterials.length)throw Error('Jumlah hasil impor tidak valid.');
     if(content.isConnected&&content.dataset.page==='import'){message(`Material baru tersimpan: ${data}.${data<p.newMaterials.length?' Sebagian kode sudah terdaftar saat impor berlangsung.':''}`);panel.insertAdjacentHTML('beforeend',`<p>Material baru tersimpan: <strong>${data}</strong>.</p>`)}
    }catch(err){if(content.isConnected&&content.dataset.page==='import'){message(err.message||'Impor gagal.');button.disabled=false}}
    finally{saving=false;fileInput.disabled=false}
   };
  }catch(err){if(token===generation&&content.isConnected&&content.dataset.page==='import'){panel.innerHTML='';message(err.message||'Preview gagal.')}}
 };
}
