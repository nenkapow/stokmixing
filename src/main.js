import './style.css';
import { createClient } from '@supabase/supabase-js';
import { preview, rowsFromSheet } from './import.js';
const app = document.querySelector('#app');
const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if (!url || !key) app.innerHTML = '<main><h1>Opname Mixing</h1><p>Konfigurasi Supabase belum tersedia.</p></main>';
else {
 const db=createClient(url,key); let role, page='home';
 const message = text => {document.querySelector('#message').textContent=text};
 async function render() {
  const {data:{session}}=await db.auth.getSession();
  if(!session){app.innerHTML='<main><h1>Opname Mixing</h1><p>Stock opname mingguan Injection</p><form id="login"><label>Email<input name="email" type="email" required></label><label>Kata sandi<input name="password" type="password" required></label><button>Masuk</button></form><p id="message" role="alert"></p></main>';document.querySelector('#login').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)message(error.message);else render()};return;}
  const {data:profile,error}=await db.from('profiles').select('role').eq('id',session.user.id).maybeSingle(); role=profile?.role;
  app.innerHTML=`<main><header><h1>Opname Mixing</h1><button id="logout" class="secondary">Keluar</button></header><p>${role?'Peran: '+esc(role):'Akun belum diizinkan.'}</p><nav>${role?'<button data-page="home">Beranda</button><button data-page="machines">Mesin</button>':''}${role==='admin'?'<button data-page="materials">Material</button><button data-page="import">Impor</button>':''}</nav><p id="message" role="alert">${esc(error?.message||'')}</p><section id="content"></section></main>`;
  document.querySelector('#logout').onclick=async()=>{await db.auth.signOut();page='home';render()};document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;show()}); if(role)show();
 }
 async function show(){const content=document.querySelector('#content'); message('');
  if(page==='home'){content.innerHTML='<h2>Beranda</h2><p>Pilih menu untuk mengelola data master.</p>';return}
  if(page==='materials' && role==='admin'){
   const {data,error}=await db.from('materials').select('*').order('code');if(error){message(error.message);return}
   content.innerHTML='<h2>Master Material</h2><input id="search" placeholder="Cari kode atau nama material"><div id="list"></div>';
   const list=()=>{document.querySelector('#list').innerHTML=data.filter(x=>(x.code+' '+x.name).toLowerCase().includes(document.querySelector('#search').value.toLowerCase())).map(x=>`<form class="item material" data-code="${esc(x.code)}"><strong>${esc(x.code)}</strong><p>${esc(x.name)}</p><label>Kg per zak <input name="kg" type="number" min="0.001" step="any" value="${esc(x.kg_per_bag??'')}" placeholder="Belum dilengkapi"></label><button>Simpan</button></form>`).join('');document.querySelectorAll('.material').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const v=new FormData(f).get('kg');const {error}=await db.from('materials').update({kg_per_bag:v===''?null:Number(v)}).eq('code',f.dataset.code);message(error?.message||'Standar disimpan')})};document.querySelector('#search').oninput=list;list();return;
  }
  if(page==='machines'){
   const {data,error}=await db.from('machines').select('*').order('number');if(error){message(error.message);return}
   content.innerHTML=`<h2>Master Mesin</h2><input id="search" placeholder="Cari mesin">${role==='admin'?'<form id="new"><label>Nomor<input name="number" required></label><label>Nama<input name="name" required></label><button>Tambah mesin</button></form>':''}<div id="list"></div>`;
   const list=()=>{const q=document.querySelector('#search').value.toLowerCase();document.querySelector('#list').innerHTML=data.filter(x=>(x.number+' '+x.name).toLowerCase().includes(q)).map(x=>role==='admin'?`<form class="item machine" data-id="${x.id}"><label>Nomor<input name="number" value="${esc(x.number)}" required></label><label>Nama<input name="name" value="${esc(x.name)}" required></label><label><input type="checkbox" name="active" ${x.active?'checked':''}> Aktif</label><button>Simpan</button></form>`:`<div class="item">${esc(x.number)} — ${esc(x.name)}</div>`).join('');document.querySelectorAll('.machine').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);const {error}=await db.from('machines').update({number:d.get('number').trim(),name:d.get('name').trim(),active:d.has('active')}).eq('id',f.dataset.id);if(error)message(error.message);else show()})};document.querySelector('#search').oninput=list;list();const nf=document.querySelector('#new');if(nf)nf.onsubmit=async e=>{e.preventDefault();const d=new FormData(nf);const {error}=await db.from('machines').insert({number:d.get('number').trim(),name:d.get('name').trim()});if(error)message(error.message);else show()};return;
  }
  if(page==='import' && role==='admin'){
   content.innerHTML='<h2>Impor FINAC</h2><p>Kolom wajib: code, name, qty. Qty hanya divalidasi, bukan dianggap kg.</p><input id="file" type="file" accept=".csv,.xlsx"><div id="result"></div>';
   document.querySelector('#file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();let ws;if(file.name.toLowerCase().endsWith('.csv')){const text=await file.text();const lines=text.split(/\r?\n/).filter(Boolean);const parse=line=>{const a=[];let v='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){v+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){a.push(v);v=''}else v+=c}if(quoted)throw Error('CSV tidak valid');a.push(v);return a};var all=lines.map(parse)}else{await wb.xlsx.load(await file.arrayBuffer());ws=wb.worksheets[0];if(!ws)throw Error('Workbook kosong');var all=[];ws.eachRow({includeEmpty:false},r=>all.push(r.values.slice(1)))}const rows=rowsFromSheet(all);const p=preview(rows);document.querySelector('#result').innerHTML=`<p>Lolos: ${p.valid.length}; duplikat: ${p.duplicates.length}; bermasalah: ${p.errors.length}</p><p>${esc([...p.duplicates.map(x=>`Baris ${x.line}: duplikat ${x.code}`),...p.errors.map(x=>`Baris ${x.line}: ${x.reason}`)].join('; '))}</p><ul>${p.valid.map(x=>`<li>${esc(x.code)} — ${esc(x.name)}</li>`).join('')}</ul><button id="confirm" ${!p.valid.length||p.errors.length||p.duplicates.length?'disabled':''}>Konfirmasi impor</button>`;document.querySelector('#confirm').onclick=async()=>{const {error}=await db.rpc('import_materials',{items:p.valid,source_filename:file.name});message(error?.message||'Impor selesai');if(!error)document.querySelector('#confirm').disabled=true}}catch(err){message(err.message)}};
  }
 }
 render();
}
