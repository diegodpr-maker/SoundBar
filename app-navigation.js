export function initNavigation({document:doc=document,window:win=window}={}){
 const toggle=doc.querySelector('#menu-toggle'),sidebar=doc.querySelector('#app-sidebar'),close=doc.querySelector('#menu-close'),backdrop=doc.querySelector('#menu-backdrop'),main=doc.querySelector('.app-main'),transport=doc.querySelector('.transport');
 if(!toggle||!sidebar)return;
 const mobile=win.matchMedia('(max-width: 800px)');let opened=false,previous;
 function setOpen(value,restore=true){opened=!!value&&mobile.matches;doc.body.classList.toggle('menu-open',opened);toggle.setAttribute('aria-expanded',String(opened));sidebar.inert=mobile.matches&&!opened;main.inert=opened;if(transport)transport.inert=opened;backdrop.hidden=!opened;if(opened){previous=doc.activeElement;close.focus()}else if(restore&&previous?.isConnected){previous.focus();previous=null}}
 toggle.addEventListener('click',()=>setOpen(!opened));close.addEventListener('click',()=>setOpen(false));backdrop.addEventListener('click',()=>setOpen(false));sidebar.addEventListener('click',e=>{if(e.target.closest('a'))setOpen(false,false)});
 doc.addEventListener('keydown',e=>{if(!opened)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();setOpen(false);return}if(e.key==='Tab'){const nodes=[...sidebar.querySelectorAll('a[href],button:not([disabled])')].filter(n=>!n.hidden&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus()}}},true);
 mobile.addEventListener('change',()=>setOpen(false));win.addEventListener('hashchange',()=>setOpen(false,false));setOpen(false,false);
}
