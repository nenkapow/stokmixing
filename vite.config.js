import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
const base='/stokmixing/';
function safeServiceWorker(){return {name:'stockmix-safe-sw',generateBundle(_options,bundle){
 const files=Object.keys(bundle).filter(name=>/^assets\/.*\.(?:js|css)$/.test(name));
 const version=createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0,16);
 const allowed=[...files,'manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'].map(x=>base+x);
 const code=`const CACHE=${JSON.stringify('stockmix-static-'+version)}, BASE=${JSON.stringify(base)}, ALLOWED=new Set(${JSON.stringify(allowed)});\n`+String.raw`
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.add(BASE+'offline.html');await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('stockmix-static-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'&&url.pathname.startsWith(BASE)){event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>await caches.match(BASE+'offline.html')||Response.error()));return}
 if(url.search||!ALLOWED.has(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok&&response.type==='basic')await cache.put(request,response.clone());return response})());
});`;
 this.emitFile({type:'asset',fileName:'sw.js',source:code});
 }};}
export default defineConfig({base,plugins:[safeServiceWorker()]});
