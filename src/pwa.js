import { confirmAction } from './dialog.js';
let installPrompt=null,installButton=null;
const installed=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
function updateInstall(){if(installButton)installButton.hidden=installed()}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;updateInstall()});
window.addEventListener('appinstalled',()=>{installPrompt=null;if(installButton)installButton.hidden=true});
export function setupInstall(button){installButton=button;if(!button)return;updateInstall();button.onclick=async()=>{if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;updateInstall()}else await confirmAction({title:'Install STOCKMIX',description:'Buka menu browser, lalu pilih “Tambahkan ke layar utama” atau “Instal aplikasi”.',confirmLabel:'Mengerti'})}}
export function setupPwa(){
 const banner=document.createElement('div');banner.className='connection-banner';banner.setAttribute('role','status');banner.textContent='Koneksi internet terputus. Stock opname memerlukan koneksi untuk menyimpan data.';document.body.prepend(banner);
 const update=()=>{banner.hidden=navigator.onLine};window.addEventListener('online',update);window.addEventListener('offline',update);update();
 if(import.meta.env.PROD&&'serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL,updateViaCache:'none'}).then(registration=>{registration.update().catch(()=>{});window.addEventListener('pageshow',()=>registration.update().catch(()=>{}))}).catch(()=>{}));
}
