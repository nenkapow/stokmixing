import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {completeMachine} from './opname.js';

test('penyelesaian satu klik menahan submit ganda sampai request selesai',async()=>{
 let count=0,navigated=0,release;const pending=new Promise(resolve=>release=resolve),messages=[],button={disabled:false,textContent:'Selesai Periksa Mesin'};
 const args={button,save:async()=>{count++;await pending},onSuccess:async()=>{navigated++},message:x=>messages.push(x)};
 const first=completeMachine(args);assert.equal(button.disabled,true);assert.equal(button.textContent,'Menyimpan…');await completeMachine(args);assert.equal(count,1);release();await first;assert.equal(navigated,1);assert.deepEqual(messages,['Pemeriksaan selesai.']);
});
test('kegagalan penyelesaian tetap di detail dan tombol dapat dicoba lagi',async()=>{
 let navigated=false;const messages=[],button={disabled:false,textContent:'Selesai Periksa Mesin'};
 await completeMachine({button,save:async()=>{throw Error('Gagal menyimpan')},onSuccess:()=>{navigated=true},message:x=>messages.push(x)});
 assert.equal(navigated,false);assert.equal(button.disabled,false);assert.equal(button.textContent,'Selesai Periksa Mesin');assert.deepEqual(messages,['Gagal menyimpan']);
});
test('manifest PWA menggunakan subpath GitHub Pages dan ikon maskable',()=>{
 const m=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));assert.equal(m.name,'STOCKMIX');assert.equal(m.short_name,'STOCKMIX');assert.equal(m.start_url,'/stokmixing/');assert.equal(m.scope,'/stokmixing/');assert.equal(m.display,'standalone');assert.ok(m.icons.some(i=>i.sizes==='192x192'));assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));for(const i of m.icons)assert.ok(readFileSync('public/'+i.src.replace('/stokmixing/','')).length>0);
 const vite=readFileSync('vite.config.js','utf8');assert.match(vite,/request\.method!==\s*'GET'/);assert.match(vite,/url\.origin!==self\.location\.origin/);assert.match(vite,/ALLOWED\.has\(url\.pathname\)/);assert.match(vite,/skipWaiting/);
});
test('hapus material tetap meminta dialog khusus dan tidak memakai popup browser',()=>{
 const opname=readFileSync('src/opname.js','utf8'),finac=readFileSync('src/finac-ui.js','utf8');assert.match(opname,/await confirmAction\(\{title:'Hapus material\?'/);assert.doesNotMatch(opname+finac,/\b(?:confirm|alert|prompt)\s*\(/);
});
