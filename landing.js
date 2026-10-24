import {sampleUrl,sampleById} from './samples.js?v=8';
import {createPreviewPlayer,previewMessage} from './audio-preview.js?v=8';
const audio=document.querySelector('#demo-audio');audio.volume=.85;
const preview=createPreviewPlayer(audio,status=>{document.querySelector('#demo-player').hidden=!status;document.querySelector('#demo-status').textContent=status?previewMessage(status.state):'Toque em um botão para ouvir. Toque de novo para parar.';for(const b of document.querySelectorAll('[data-sample]')){const playing=status?.id===b.dataset.sample&&!audio.paused&&!audio.ended;b.setAttribute('aria-pressed',String(playing));b.querySelector('span').textContent=playing?'■':'▶'}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-sample]');if(!b)return;document.querySelector('#demo-player').hidden=false;preview.toggle({id:b.dataset.sample,url:sampleUrl(b.dataset.sample),title:sampleById(b.dataset.sample).name})});
document.querySelector('#demo-close').onclick=()=>preview.stop();window.addEventListener('pagehide',()=>preview.stop());
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
