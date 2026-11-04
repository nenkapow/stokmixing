import { matchesMixing } from './calculation.js';
export function calculate(whole, standard, open, hopper) {
 if ([whole,open,hopper].some(v=>v===null || String(v).trim()==='' || !Number.isFinite(Number(v)) || Number(v)<0) || !Number.isSafeInteger(Number(whole))) throw Error('Masukkan angka nonnegatif yang valid; zak utuh harus bulat.');
 if (Number(whole)>0 && (standard == null || !Number.isFinite(Number(standard)) || Number(standard)<=0)) throw Error('Minta Admin melengkapi standar kg per zak.');
 const result=Number(whole)*Number(standard||0)+Number(open)+Number(hopper);
 if (!Number.isFinite(result)) throw Error('Jumlah terlalu besar.');
 return result;
}
export function summarize(machines,items) {
 const completed=new Map(machines.filter(m=>m.status==='COMPLETED').map(m=>[m.id,m]));
 const grouped=new Map();
 for(const item of items){const machine=completed.get(item.opname_machine_id);if(!machine)continue;let row=grouped.get(item.material_code);if(!row){row={code:item.material_code,name:item.material_name,total:0,locations:[]};grouped.set(item.material_code,row)} row.total+=Number(item.actual_kg);row.locations.push({machine:`${machine.machine_number} — ${machine.machine_name}`,kg:Number(item.actual_kg)});}
 return {total:machines.length,completed:completed.size,unfinished:machines.length-completed.size,materials:[...grouped.values()].sort((a,b)=>a.code.localeCompare(b.code))};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(n);
export function initOpname(db,role,userId,content,message){
 let selectedSession=null, selectedMachine=null, material=null, editing=null, materials=[];
 const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw error;return data};
 const get=async(q)=>{const {data,error}=await q;if(error)throw error;return data};
 const fail=e=>message(e.message||'Operasi gagal');
 const btn=(id,fn)=>{const el=content.querySelector('#'+id);if(el)el.onclick=()=>Promise.resolve().then(fn).catch(fail)};
 async function sessions(){
  selectedMachine=null;
  const list=await get(db.from('opname_sessions').select('*').order('created_at',{ascending:false}));
  content.innerHTML=`<h2>${role==='admin'?'Stock Opname':'Mulai Stock Opname'}</h2>${role==='admin'?'<form id="session-form"><label>Nama / periode<input name="name" required></label><label>Tanggal opname<input type="date" name="date" required></label><button>Buat sesi</button></form>':''}<h3>Daftar sesi</h3>${list.length?'':'<p>Belum ada sesi.</p>'}${list.map(s=>`<button class="wide secondary session" data-id="${s.id}">${esc(s.name)} · ${esc(s.opname_date)} · ${esc(s.status)}</button>`).join('')}`;
  content.querySelectorAll('.session').forEach(el=>el.onclick=()=>{selectedSession=list.find(s=>s.id===Number(el.dataset.id));machines().catch(fail)});
  const form=content.querySelector('#session-form');if(form)form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);try{await rpc('opname_create_session',{p_name:f.get('name'),p_date:f.get('date')});message('Sesi berhasil dibuat.');await sessions()}catch(e){fail(e)}};
 }
 async function machines(){
  const sessionsNow=await get(db.from('opname_sessions').select('*').eq('id',selectedSession.id));if(!sessionsNow.length)throw Error('Sesi tidak lagi tersedia'); selectedSession=sessionsNow[0];
  const list=await get(db.from('opname_machines').select('*').eq('session_id',selectedSession.id).order('machine_number'));
  const done=list.filter(m=>m.status==='COMPLETED').length;
  content.innerHTML=`<button id="back" class="secondary">← Daftar sesi</button><h2>${esc(selectedSession.name)}</h2><p>${esc(selectedSession.opname_date)} · ${esc(selectedSession.status)}</p><p>Total mesin: ${list.length} · Selesai: ${done} · Belum selesai: ${list.length-done}</p>${role==='admin'?'<button id="recap">Rekap</button>':''}${role==='admin'&&selectedSession.status==='OPEN'?'<button id="close" class="secondary">Tutup sesi</button>':''}<input id="machine-search" placeholder="Cari mesin"><div id="machine-list"></div>`;
  btn('back',sessions);btn('recap',recap);btn('close',async()=>{if(!confirm('Tutup sesi? Penghitungan tidak dapat diubah lagi.'))return;await rpc('opname_close',{p_id:selectedSession.id});message('Sesi ditutup.');await machines()});
  const draw=()=>{const q=content.querySelector('#machine-search').value.toLowerCase();content.querySelector('#machine-list').innerHTML=list.filter(m=>(m.machine_number+' '+m.machine_name).toLowerCase().includes(q)).map(m=>{const state=!m.mandor_id?'Belum diperiksa':m.status==='COMPLETED'?'Selesai':'Draft';return `<div class="item"><strong>${esc(m.machine_number)} — ${esc(m.machine_name)}</strong><p>${state}${m.mandor_id?' · Penanggung jawab: '+esc(m.mandor_id):''}</p>${selectedSession.status==='OPEN' && ((role==='mandor' && (!m.mandor_id||m.mandor_id===userId)&&m.status==='DRAFT') || (role==='admin' && m.status==='COMPLETED'))?`<button class="machine-action" data-id="${m.id}">${role==='admin'?'Buka ulang':m.mandor_id?'Lanjutkan':'Mulai'}</button>`:''}</div>`}).join('');content.querySelectorAll('.machine-action').forEach(el=>el.onclick=async()=>{try{const m=list.find(x=>x.id===Number(el.dataset.id));if(role==='admin'){if(!confirm('Buka ulang pemeriksaan mesin ini?'))return;await rpc('opname_reopen',{p_id:m.id});message('Pemeriksaan dibuka kembali.');await machines()}else{await rpc('opname_claim',{p_id:m.id});selectedMachine=m;await machine()}}catch(e){fail(e)}})};content.querySelector('#machine-search').oninput=draw;draw();
 }
 async function machine(){
  const list=await get(db.from('opname_items').select('*').eq('opname_machine_id',selectedMachine.id).order('created_at'));
  content.innerHTML=`<button id="back" class="secondary">← Daftar mesin</button><h2>${esc(selectedMachine.machine_number)} — ${esc(selectedMachine.machine_name)}</h2><p>Draft · ${list.length} material</p><button id="add">Tambah material</button>${list.length?'':'<p>Belum ada material. Anda dapat menyelesaikan pemeriksaan sebagai kosong.</p>'}${list.map(i=>`<div class="item"><strong>${esc(i.material_code)} · ${esc(i.material_name)}</strong><p>${format(i.actual_kg)} kg · ${i.whole_bags} zak + ${format(i.open_kg)} kg terbuka + ${format(i.hopper_kg)} kg hopper</p><button class="edit" data-id="${i.id}">Edit</button> <button class="delete secondary" data-id="${i.id}">Hapus</button></div>`).join('')}<button id="complete" class="wide">Selesai Periksa Mesin</button>`;
  btn('back',machines);btn('add',choose);btn('complete',async()=>{if(!confirm(list.length?'Selesaikan pemeriksaan mesin ini?':'Konfirmasi mesin kosong dan selesaikan pemeriksaan?'))return;await rpc('opname_complete',{p_id:selectedMachine.id});message('Pemeriksaan selesai.');await machines()});
  content.querySelectorAll('.edit').forEach(el=>el.onclick=async()=>{try{editing=list.find(i=>i.id===Number(el.dataset.id));const current=editing.kg_per_bag==null?await get(db.from('materials').select('kg_per_bag').eq('code',editing.material_code).single()):null;material={code:editing.material_code,name:editing.material_name,kg_per_bag:editing.kg_per_bag??current?.kg_per_bag};form()}catch(e){fail(e)}});
  content.querySelectorAll('.delete').forEach(el=>el.onclick=async()=>{if(!confirm('Hapus material ini?'))return;try{await rpc('opname_delete_item',{p_machine:selectedMachine.id,p_item:Number(el.dataset.id)});message('Material dihapus.');await machine()}catch(e){fail(e)}});
 }
 async function choose(){
  editing=null;materials=(await get(db.from('materials').select('code,name,kg_per_bag').eq('active',true).order('code'))).filter(m=>matchesMixing(m.name));
  content.innerHTML='<button id="back" class="secondary">← Mesin</button><h2>Cari material</h2><input id="search" placeholder="Cari kode atau nama" autocomplete="off"><div id="results"></div>';btn('back',machine);
  const draw=()=>{const q=content.querySelector('#search').value.toLowerCase().trim();content.querySelector('#results').innerHTML=materials.filter(m=>(m.code+' '+m.name).toLowerCase().includes(q)).slice(0,50).map(m=>`<button class="wide secondary material-choice" data-code="${esc(m.code)}"><strong>${esc(m.code)}</strong> · ${esc(m.name)}</button>`).join('');content.querySelectorAll('.material-choice').forEach(el=>el.onclick=()=>{material=materials.find(m=>m.code===el.dataset.code);form()})};content.querySelector('#search').oninput=draw;draw();
 }
 function form(){
  const key=`opname:${userId}:${selectedMachine.id}:${editing?.id||'new:'+material.code}`;
  let draft;try{draft=JSON.parse(sessionStorage.getItem(key))}catch{};
  const values=draft||{whole:editing?.whole_bags??0,open:editing?.open_kg??0,hopper:editing?.hopper_kg??0};
  content.innerHTML=`<button id="back" class="secondary">← Pemeriksaan</button><h2>${esc(material.code)}</h2><p>${esc(material.name)}</p><p>Standar: ${material.kg_per_bag==null?'Belum diisi Admin':esc(material.kg_per_bag)+' kg/zak'}</p><form id="item-form"><label>Zak utuh<input name="whole" type="number" inputmode="numeric" min="0" step="1" required value="${esc(values.whole)}"></label><label>Sisa zak terbuka (kg)<input name="open" type="number" inputmode="decimal" min="0" step="any" required value="${esc(values.open)}"></label><label>Estimasi visual hopper (kg)<input name="hopper" type="number" inputmode="decimal" min="0" step="any" required value="${esc(values.hopper)}"></label><p>Total aktual: <strong id="total">—</strong> kg</p><button>Simpan Material</button></form><p>Input sementara tersimpan di tab ini jika jaringan bermasalah.</p>`;
  btn('back',machine);const f=content.querySelector('#item-form');const update=()=>{const d=Object.fromEntries(new FormData(f));try{sessionStorage.setItem(key,JSON.stringify(d))}catch{}try{content.querySelector('#total').textContent=format(calculate(d.whole,material.kg_per_bag,d.open,d.hopper))}catch{content.querySelector('#total').textContent='—'}};f.oninput=update;update();
  f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));try{calculate(d.whole,material.kg_per_bag,d.open,d.hopper);const submit=f.querySelector('button');submit.disabled=true;try{await rpc('opname_save_item',{p_machine:selectedMachine.id,p_code:material.code,p_whole:Number(d.whole),p_open:Number(d.open),p_hopper:Number(d.hopper),p_item:editing?.id??null});sessionStorage.removeItem(key);message('Material tersimpan.');await machine()}finally{submit.disabled=false}}catch(e){fail(e)}};
 }
 async function recap(){
  const machinesList=await get(db.from('opname_machines').select('*').eq('session_id',selectedSession.id));const ids=machinesList.filter(m=>m.status==='COMPLETED').map(m=>m.id);const items=ids.length?await get(db.from('opname_items').select('*').in('opname_machine_id',ids)):[];const report=summarize(machinesList,items);
  content.innerHTML=`<button id="back" class="secondary">← Mesin</button><h2>Rekap ${esc(selectedSession.name)}</h2><p>Selesai: ${report.completed} / ${report.total} · Belum selesai: ${report.unfinished}</p>${report.unfinished?'<p role="alert">Rekap belum final: masih ada mesin yang belum selesai.</p>':''}${report.materials.length?'':'<p>Belum ada material dari mesin yang selesai.</p>'}${report.materials.map(r=>`<div class="item"><strong>${esc(r.code)} · ${esc(r.name)}</strong><p>${format(r.total)} kg · ${r.locations.length} lokasi</p><ul>${r.locations.map(l=>`<li>${esc(l.machine)}: ${format(l.kg)} kg</li>`).join('')}</ul></div>`).join('')}`;btn('back',machines);
 }
 sessions().catch(fail);
}
