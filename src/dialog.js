// Native dialog provides focus containment and Escape handling; all copy is text-only.
export function confirmAction({title,description,confirmLabel='Konfirmasi'}) {
 return new Promise(resolve=>{
  const previous=document.activeElement, dialog=document.createElement('dialog');
  dialog.className='stockmix-dialog';dialog.setAttribute('aria-labelledby','dialog-title');dialog.setAttribute('aria-describedby','dialog-description');
  const heading=document.createElement('h2');heading.id='dialog-title';heading.textContent=title;
  const body=document.createElement('p');body.id='dialog-description';body.textContent=description;
  const actions=document.createElement('div');actions.className='dialog-actions';
  const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='Batal';
  const accept=document.createElement('button');accept.textContent=confirmLabel;
  actions.append(cancel,accept);dialog.append(heading,body,actions);document.body.append(dialog);
  let accepted=false;cancel.onclick=()=>dialog.close();accept.onclick=()=>{accepted=true;dialog.close()};
  dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus();resolve(accepted)},{once:true});
  dialog.showModal();cancel.focus();
 });
}
