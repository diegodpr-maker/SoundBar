/* Apply before the page is painted. Existing account and audio storage keys stay intact. */
(()=>{
 const key='sysmacom-harmony-theme';let preference='system';
 try{const saved=localStorage.getItem(key);if(['light','dark','system'].includes(saved))preference=saved}catch{}
 const media=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
 const resolved=()=>preference==='system'?(media?.matches?'dark':'light'):preference;
 function apply(){const theme=resolved();document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#080f1c':'#f4f7fc';const select=document.querySelector('#harmony-theme');if(select)select.value=preference}
 apply();
 function mount(){if(document.querySelector('#harmony-theme'))return;const label=document.createElement('label');label.className='theme-control';label.innerHTML='<span>Tema</span><select id="harmony-theme" aria-label="Tema de cores"><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select>';const host=document.querySelector('.app-top')||document.querySelector('.nav')||document.querySelector('.head');if(!host)label.classList.add('floating');(host||document.body).append(label);const select=document.querySelector('#harmony-theme');select.value=preference;select.addEventListener('change',()=>{preference=select.value;try{localStorage.setItem(key,preference)}catch{}apply()})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 const onSystem=()=>{if(preference==='system')apply()};if(media?.addEventListener)media.addEventListener('change',onSystem);else media?.addListener?.(onSystem);
 window.addEventListener('storage',event=>{if(event.key===key){preference=['light','dark','system'].includes(event.newValue)?event.newValue:'system';apply()}});
})();
