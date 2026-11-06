import { confirmAction } from './dialog.js';
import { matchesMixing } from './calculation.js';
import { renderAdminSessions, sessionProgress } from './admin-sessions.js';
import Decimal from 'decimal.js';
export function numericValues(whole, open, hopper) {
 const values=[whole,open,hopper].map(v=>{
  if (v === null || v === undefined) throw Error('Masukkan angka yang valid.');
  const text=String(v).trim();
  if (text === '') return 0;
  const n=Number(text);
  if (!Number.isFinite(n) || n<0) throw Error('Masukkan angka nonnegatif yang valid.');
  return n;
 });
 if (!Number.isSafeInteger(values[0])) throw Error('Zak utuh harus berupa bilangan bulat.');
 return values;
}
export function calculate(whole, standard, open, hopper) {
 const [bags, remaining, hopperKg]=numericValues(whole,open,hopper);
 if (bags>0 && (standard == null || !Number.isFinite(Number(standard)) || Number(standard)<=0)) throw Error('Minta Admin melengkapi standar kg per zak.');
 const result=bags*Number(standard||0)+remaining+hopperKg;
 if (!Number.isFinite(result)) throw Error('Jumlah terlalu besar.');
 return result;
}
export function machineLabel(number) {
 const value=String(number ?? '').trim();
 return /^mesin(?:\s|$)/i.test(value) ? value : `Mesin ${value}`;
}
export function initialItemValues(editing) {
 const show=v => v == null || Number(v) === 0 ? '' : String(v);
 return {whole:show(editing?.whole_bags),open:show(editing?.open_kg),hopper:show(editing?.hopper_kg)};
}
export function itemsByMachine(items) {
 const grouped=new Map();
 for(const item of items){if(!grouped.has(item.opname_machine_id))grouped.set(item.opname_machine_id,[]);grouped.get(item.opname_machine_id).push(item)}
 return grouped;
}
export function responsibleName(profile) { return profile?.display_name?.trim() || 'Nama mandor belum tersedia'; }
export function summarize(machines,items) {
 const completed=new Map(machines.filter(m=>m.status==='COMPLETED').map(m=>[m.id,m]));
 const grouped=new Map();
 for(const item of items){const machine=completed.get(item.opname_machine_id);if(!machine)continue;let row=grouped.get(item.material_code);if(!row){row={code:item.material_code,name:item.material_name,total:0,locations:[]};grouped.set(item.material_code,row)} row.total+=Number(item.actual_kg);row.locations.push({machine:machineLabel(machine.machine_number),kg:Number(item.actual_kg)});}
 const notRunning=machines.filter(m=>m.status==='NOT_RUNNING');return {total:machines.length,completed:completed.size,notRunning,unfinished:machines.length-completed.size-notRunning.length,materials:[...grouped.values()].sort((a,b)=>a.code.localeCompare(b.code))};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=n=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:3}).format(n);
export function adminMachineTable(machines,grouped,names,sessionStatus) {
 const rows=machines.map(m=>{
  const items=grouped.get(m.id)||[],completed=m.status==='COMPLETED',notRunning=m.status==='NOT_RUNNING',claimed=Boolean(m.mandor_id);
  const state=!claimed?'Belum diperiksa':completed?'Selesai':notRunning?'Tidak Jalan':'Draft';
  const detail=notRunning?'Tidak diukur':items.length===0?(completed?'Kosong':'Belum ada material'):items.length===1?`<strong>${esc(items[0].material_code)}</strong><br>${esc(items[0].material_name)}`:`<details><summary>${items.length} material · lihat detail</summary><ul class="machine-material-list">${items.map(i=>`<li><strong>${esc(i.material_code)}</strong> · ${esc(i.material_name)}<br><span>${esc(format(i.actual_kg))} kg</span></li>`).join('')}</ul></details>`;
  const total=notRunning?'—':items.length?`${esc(format(items.reduce((sum,i)=>sum.plus(i.actual_kg),new Decimal(0)).toString()))} kg${completed?'':' <small>(sementara)</small>'}`:completed?'0 kg':'—';
  const action=sessionStatus==='OPEN'&&(completed||notRunning)?`<button class="machine-action secondary" data-id="${m.id}">Buka ulang</button>`:'—';
  return `<tr><td data-label="Mesin"><strong>${esc(machineLabel(m.machine_number))}</strong></td><td data-label="Material Mixing">${detail}</td><td data-label="Total aktual">${total}</td><td data-label="Penanggung jawab">${claimed?esc(responsibleName(names.get(m.mandor_id))):'—'}</td><td data-label="Status"><span class="badge ${completed?'badge-active':notRunning?'badge-neutral':claimed?'badge-warn':'badge-neutral'}">${state}</span></td><td data-label="Aksi">${action}</td></tr>`;
 });
 return `<div class="table-wrap"><table class="machine-detail-table"><thead><tr><th>MESIN</th><th>MATERIAL MIXING</th><th>TOTAL AKTUAL KG</th><th>PENANGGUNG JAWAB</th><th>STATUS</th><th>AKSI</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${rows.length?'':'<p class="compact-empty">Mesin tidak ditemukan.</p>'}`;
}
export function itemInputs(values) {
 return `<label>Zak utuh<input name="whole" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${esc(values.whole)}"></label><label>Sisa zak terbuka (kg)<input name="open" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(values.open)}"></label><label>Estimasi visual hopper (kg)<input name="hopper" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(values.hopper)}"></label>`;
}
export async function completeMachine({button,save,onSuccess,message}) {
 if(button.disabled)return;
 button.disabled=true;const label=button.textContent;button.textContent='Menyimpan…';
 try{await save()}catch(error){message(error?.message||'Pemeriksaan gagal diselesaikan.');button.disabled=false;button.textContent=label;return}
 message('Pemeriksaan selesai.');
 try{await onSuccess()}catch{message('Pemeriksaan selesai, tetapi daftar mesin gagal dimuat. Periksa koneksi dan muat ulang.')}
}
export function initOpname(db,role,userId,content,message){
 let selectedSession=null, selectedMachine=null, material=null, editing=null, materials=[];
 const rpc=async(name,args)=>{const {data,error}=await db.rpc(name,args);if(error)throw error;return data};
 const get=async(q)=>{const {data,error}=await q;if(error)throw error;return data};
 const getAll=async(build)=>{let rows=[],expected=null;for(;;){const {data,error,count}=await build().range(rows.length,rows.length+499);if(error)throw error;if(count==null||!Array.isArray(data))throw Error('Jumlah data pemeriksaan tidak tersedia');if(expected!==null&&expected!==count)throw Error('Data pemeriksaan berubah, muat ulang');expected=count;rows.push(...data);if(rows.length===count)return rows;if(rows.length>count||data.length===0)throw Error('Data pemeriksaan tidak lengkap')}};
 const fail=e=>message(e.message||'Operasi gagal');
 const btn=(id,fn)=>{const el=content.querySelector('#'+id);if(el)el.onclick=()=>Promise.resolve().then(fn).catch(fail)};
 async function sessions(){
  selectedMachine=null;
  if(role==='admin'){await renderAdminSessions({db,content,message,onOpen:session=>{selectedSession=session;machines().catch(fail)}});return}
  const list=await get(db.from('opname_sessions').select('*').order('created_at',{ascending:false}));
  content.innerHTML=`<h2>${role==='admin'?'Stock Opname':'Mulai Stock Opname'}</h2>${role==='admin'?'<form id="session-form"><label>Nama / periode<input name="name" required></label><label>Tanggal opname<input type="date" name="date" required></label><button>Buat sesi</button></form>':''}<h3>Daftar sesi</h3>${list.length?'':'<p>Belum ada sesi.</p>'}${list.map(s=>`<button class="wide secondary session" data-id="${s.id}">${esc(s.name)} · ${esc(s.opname_date)} · ${esc(s.status)}</button>`).join('')}`;
  content.querySelectorAll('.session').forEach(el=>el.onclick=()=>{selectedSession=list.find(s=>s.id===Number(el.dataset.id));machines().catch(fail)});
  const form=content.querySelector('#session-form');if(form)form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form);try{await rpc('opname_create_session',{p_name:f.get('name'),p_date:f.get('date')});message('Sesi berhasil dibuat.');await sessions()}catch(e){fail(e)}};
 }
 async function machines(){
  const sessionsNow=await get(db.from('opname_sessions').select('*').eq('id',selectedSession.id));if(!sessionsNow.length)throw Error('Sesi tidak lagi tersedia'); selectedSession=sessionsNow[0];
  const list=role==='admin'?await getAll(()=>db.from('opname_machines').select('*',{count:'exact'}).eq('session_id',selectedSession.id).order('machine_number').order('id')):await get(db.from('opname_machines').select('*').eq('session_id',selectedSession.id).order('machine_number'));
  const ids=list.map(m=>m.id);
  // RLS returns all results to admins and only owned results to mandor.
  const visibleItems=ids.length?(role==='admin'?await getAll(()=>db.from('opname_items').select('opname_machine_id,material_code,material_name,actual_kg',{count:'exact'}).in('opname_machine_id',ids).order('id')):await get(db.from('opname_items').select('opname_machine_id,material_code,material_name,actual_kg').in('opname_machine_id',ids))):[];
  const grouped=itemsByMachine(visibleItems);
  const profiles=role==='admin'?await get(db.from('profiles').select('id,display_name')):[];
  const names=new Map(profiles.map(p=>[p.id,p]));
  if(role==='mandor'&&list.some(m=>m.status==='NOT_RUNNING')){const people=await rpc('opname_not_running_people',{p_session:selectedSession.id});for(const person of people){const machine=list.find(m=>m.id===person.opname_machine_id);if(machine)names.set(machine.mandor_id,{display_name:person.display_name})}}
  const progress=sessionProgress(list),done=progress.handled;
  const adminHeader=()=>{const p=sessionProgress(list);return `<div class="compact-detail-head"><div><button id="back" class="text-button">← Daftar sesi</button><h2>Stock Opname <span class="detail-separator">/</span> ${esc(selectedSession.name)}</h2><div class="detail-meta"><span>${esc(selectedSession.opname_date)}</span><span class="badge ${selectedSession.status==='OPEN'?'badge-active':'badge-neutral'}">${selectedSession.status==='OPEN'?'Berlangsung':'Ditutup'}</span><span>Progres: <strong>${p.handled}/${p.total} ditangani (${p.percent===null?'—':p.percent+'%'}) · ${p.completed} selesai diperiksa · ${p.notRunning} tidak jalan</strong></span></div></div><div class="detail-actions"><button id="recap">Rekap</button>${selectedSession.status==='OPEN'?'<button id="close" class="secondary">Tutup sesi</button>':''}</div></div>`};
  content.innerHTML=role==='admin'?`${adminHeader()}<input id="machine-search" placeholder="Cari mesin"><div id="machine-list"></div>`:`<button id="back" class="secondary">← Daftar sesi</button><h2>${esc(selectedSession.name)}</h2><p>${esc(selectedSession.opname_date)} · ${esc(selectedSession.status)}</p><p>Total mesin: ${list.length} · Selesai diperiksa: ${progress.completed} · Tidak jalan: ${progress.notRunning} · Belum ditangani: ${progress.unfinished}</p><input id="machine-search" placeholder="Cari mesin"><div id="machine-list"></div>`;
  btn('back',sessions);btn('recap',recap);btn('close',async()=>{if(done<list.length){message(`Sesi belum dapat ditutup: ${list.length-done} mesin belum selesai.`);return}if(!await confirmAction({title:'Tutup sesi?',description:'Penghitungan tidak dapat diubah lagi setelah sesi ditutup.',confirmLabel:'Tutup sesi'}))return;await rpc('opname_close',{p_id:selectedSession.id});message('Sesi ditutup.');await machines()});
  const draw=()=>{const q=content.querySelector('#machine-search').value.toLowerCase();const filtered=list.filter(m=>machineLabel(m.machine_number).toLowerCase().includes(q));if(role==='admin'){content.querySelector('#machine-list').innerHTML=adminMachineTable(filtered,grouped,names,selectedSession.status)}else content.querySelector('#machine-list').innerHTML=filtered.map(m=>{const state=!m.mandor_id?'Belum diperiksa':m.status==='COMPLETED'?'Selesai':m.status==='NOT_RUNNING'?'Tidak Jalan':'Draft';const own=!m.mandor_id||m.mandor_id===userId;const pending=selectedSession.status==='OPEN'&&own&&m.status==='DRAFT';const declaration=m.status==='NOT_RUNNING'?`<p>Penanggung jawab: ${esc(responsibleName(names.get(m.mandor_id)))} · ${esc(new Date(m.completed_at).toLocaleString('id-ID'))}<br>Dinyatakan tidak beroperasi dan tidak ada Mixing yang perlu dihitung.</p>`:'';return `<div class="item"><strong>${esc(machineLabel(m.machine_number))}</strong><p>${state}</p>${declaration}${(grouped.get(m.id)||[]).map(i=>`<p>${esc(i.material_code)} · ${esc(i.material_name)}<br>Total: ${format(i.actual_kg)} kg</p>`).join('')}${pending?`<button class="machine-action" data-id="${m.id}">Periksa Mesin</button>${(grouped.get(m.id)||[]).length?'':` <button class="not-running secondary" data-id="${m.id}">Mesin Tidak Jalan</button>`}`:''}${selectedSession.status==='OPEN'&&m.status==='NOT_RUNNING'&&m.mandor_id===userId?`<button class="not-running-cancel secondary" data-id="${m.id}">Batalkan Tidak Jalan</button>`:''}</div>`}).join('');content.querySelectorAll('.not-running,.not-running-cancel').forEach(el=>el.onclick=async()=>{const buttons=[...el.closest('.item').querySelectorAll('button')];buttons.forEach(b=>{b.disabled=true});try{await rpc(el.classList.contains('not-running')?'opname_mark_not_running':'opname_cancel_not_running',{p_id:Number(el.dataset.id)});message(el.classList.contains('not-running')?'Mesin dicatat tidak jalan.':'Status tidak jalan dibatalkan.');await machines()}catch(e){fail(e);buttons.forEach(b=>{b.disabled=false})}});content.querySelectorAll('.machine-action').forEach(el=>el.onclick=async()=>{try{const m=list.find(x=>x.id===Number(el.dataset.id));if(role==='admin'){if(!await confirmAction({title:'Buka ulang pemeriksaan?',description:'Pemeriksaan mesin dapat diubah kembali selama sesi terbuka.',confirmLabel:'Buka ulang'}))return;await rpc('opname_reopen',{p_id:m.id});message('Pemeriksaan dibuka kembali.');await machines()}else{await rpc('opname_claim',{p_id:m.id});selectedMachine=m;await machine()}}catch(e){fail(e)}})};content.querySelector('#machine-search').oninput=draw;draw();
 }
 async function machine(){
  const list=await get(db.from('opname_items').select('*').eq('opname_machine_id',selectedMachine.id).order('created_at'));
  content.innerHTML=`<button id="back" class="secondary">← Daftar mesin</button><h2>${esc(machineLabel(selectedMachine.machine_number))}</h2><p>Draft · ${list.length} material</p><button id="add">Tambah material</button>${list.length?'':'<p>Belum ada material. Anda dapat menyelesaikan pemeriksaan sebagai kosong.</p>'}${list.map(i=>`<div class="item"><strong>${esc(i.material_code)} · ${esc(i.material_name)}</strong><p>${format(i.actual_kg)} kg · ${i.whole_bags} zak + ${format(i.open_kg)} kg terbuka + ${format(i.hopper_kg)} kg hopper</p><button class="edit" data-id="${i.id}">Edit</button> <button class="delete secondary" data-id="${i.id}">Hapus</button></div>`).join('')}<button id="complete" class="wide">Selesai Periksa Mesin</button>`;
  btn('back',machines);btn('add',choose);content.querySelector('#complete').onclick=()=>completeMachine({button:content.querySelector('#complete'),save:()=>rpc('opname_complete',{p_id:selectedMachine.id}),onSuccess:machines,message});
  content.querySelectorAll('.edit').forEach(el=>el.onclick=async()=>{try{editing=list.find(i=>i.id===Number(el.dataset.id));const current=editing.kg_per_bag==null?await get(db.from('materials').select('kg_per_bag').eq('code',editing.material_code).single()):null;material={code:editing.material_code,name:editing.material_name,kg_per_bag:editing.kg_per_bag??current?.kg_per_bag};form()}catch(e){fail(e)}});
  content.querySelectorAll('.delete').forEach(el=>el.onclick=async()=>{if(!await confirmAction({title:'Hapus material?',description:'Material ini akan dihapus dari pemeriksaan mesin.',confirmLabel:'Hapus'}))return;try{await rpc('opname_delete_item',{p_machine:selectedMachine.id,p_item:Number(el.dataset.id)});message('Material dihapus.');await machine()}catch(e){fail(e)}});
 }
 async function choose(){
  editing=null;materials=(await get(db.from('materials').select('code,name,kg_per_bag').eq('active',true).order('code'))).filter(m=>matchesMixing(m.name));
  content.innerHTML='<button id="back" class="secondary">← Mesin</button><h2>Cari material</h2><input id="search" placeholder="Cari kode atau nama" autocomplete="off"><div id="results"></div>';btn('back',machine);
  const draw=()=>{const q=content.querySelector('#search').value.toLowerCase().trim();content.querySelector('#results').innerHTML=materials.filter(m=>(m.code+' '+m.name).toLowerCase().includes(q)).slice(0,50).map(m=>`<button class="wide secondary material-choice" data-code="${esc(m.code)}"><strong>${esc(m.code)}</strong> · ${esc(m.name)}</button>`).join('');content.querySelectorAll('.material-choice').forEach(el=>el.onclick=()=>{material=materials.find(m=>m.code===el.dataset.code);form()})};content.querySelector('#search').oninput=draw;draw();
 }
 function form(){
  const key=`opname:${userId}:${selectedMachine.id}:${editing?.id||'new:'+material.code}`;
  let draft;try{draft=JSON.parse(sessionStorage.getItem(key))}catch{};
  const values=draft||initialItemValues(editing);
  content.innerHTML=`<button id="back" class="secondary">← Pemeriksaan</button><h2>${esc(material.code)}</h2><p>${esc(material.name)}</p><p>Standar: ${material.kg_per_bag==null?'Belum diisi Admin':esc(material.kg_per_bag)+' kg/zak'}</p><form id="item-form">${itemInputs(values)}<p>Total aktual: <strong id="total">—</strong> kg</p><button>Simpan Material</button></form><p>Input sementara tersimpan di tab ini jika jaringan bermasalah.</p>`;
  btn('back',machine);const f=content.querySelector('#item-form');const update=()=>{const d=Object.fromEntries(new FormData(f));try{sessionStorage.setItem(key,JSON.stringify(d))}catch{}try{if([...f.elements].some(el=>el.validity?.badInput))throw Error('Angka tidak valid');content.querySelector('#total').textContent=format(calculate(d.whole,material.kg_per_bag,d.open,d.hopper))}catch{content.querySelector('#total').textContent='—'}};f.oninput=update;update();
  f.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));try{if([...f.elements].some(el=>el.validity?.badInput))throw Error('Angka tidak valid');calculate(d.whole,material.kg_per_bag,d.open,d.hopper);const submit=f.querySelector('button');submit.disabled=true;try{await rpc('opname_save_item',{p_machine:selectedMachine.id,p_code:material.code,p_whole:Number(d.whole),p_open:Number(d.open),p_hopper:Number(d.hopper),p_item:editing?.id??null});sessionStorage.removeItem(key);message('Material tersimpan.');await machine()}finally{submit.disabled=false}}catch(e){fail(e)}};
 }
 async function recap(){
  const machinesList=await get(db.from('opname_machines').select('*').eq('session_id',selectedSession.id));const ids=machinesList.filter(m=>m.status==='COMPLETED').map(m=>m.id);const items=ids.length?await get(db.from('opname_items').select('*').in('opname_machine_id',ids)):[];const report=summarize(machinesList,items);
  content.innerHTML=`<button id="back" class="secondary">← Mesin</button><h2>Rekap ${esc(selectedSession.name)}</h2><p>Selesai diperiksa: ${report.completed} · Tidak jalan: ${report.notRunning.length} · Belum ditangani: ${report.unfinished} / ${report.total}</p>${report.notRunning.length?`<p role="alert">${report.notRunning.length} mesin dinyatakan tidak jalan dan tidak diukur secara fisik: ${report.notRunning.map(m=>esc(machineLabel(m.machine_number))).join(', ')}.</p>`:''}${report.unfinished?'<p role="alert">Rekap belum final: masih ada mesin yang belum selesai.</p>':''}${report.materials.length?'':'<p>Belum ada material dari mesin yang selesai.</p>'}${report.materials.map(r=>`<div class="item"><strong>${esc(r.code)} · ${esc(r.name)}</strong><p>${format(r.total)} kg · ${r.locations.length} lokasi</p><ul>${r.locations.map(l=>`<li>${esc(l.machine)}: ${format(l.kg)} kg</li>`).join('')}</ul></div>`).join('')}`;btn('back',machines);
 }
 sessions().catch(fail);
}
