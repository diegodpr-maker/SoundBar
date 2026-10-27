// Keep one visible, attached HTMLAudioElement and call play() in the user's click.
export function createPreviewPlayer(audio,onUpdate=()=>{}){
 let current=null,serial=0;
 const emit=(state,error=null)=>{if(current){current={...current,state,error};onUpdate({...current})}else onUpdate(null)};
 const failed=error=>emit(error?.name==='NotAllowedError'?'blocked':'error',error?.message||null);
 const events={playing:()=>{if(current&&!audio.paused)emit('playing')},pause:()=>{if(current&&audio.paused&&!audio.ended)emit('paused')},ended:()=>{if(current&&audio.ended)emit('ended')},error:()=>{if(current&&audio.error)emit('error',audio.error.message||null)}};
 for(const [event,handler] of Object.entries(events))audio.addEventListener(event,handler);
 async function toggle(item){
  if(current?.id===item.id&&!audio.paused&&!audio.ended){stop();return false}
  const token=++serial;
  if(current?.id!==item.id||current?.url!==item.url||current?.state==='error'){current=null;audio.pause();audio.src=item.url;audio.load();current={...item,state:'loading'}}
  else if(audio.ended)audio.currentTime=0;
  audio.muted=false;
  try{
   // No await, fetch, database request or DOM replacement before this call.
   const started=audio.play();emit('loading');await started;
   if(token===serial&&current){emit(audio.paused?'paused':'playing')}
   return token===serial&&!!current;
  }catch(error){if(token===serial&&current)failed(error);return false}
 }
 function stop(){serial++;current=null;audio.pause();audio.removeAttribute('src');audio.load();onUpdate(null)}
 return {toggle,stop,get current(){return current},destroy(){stop();for(const [event,handler] of Object.entries(events))audio.removeEventListener(event,handler)}};
}
export function previewMessage(state){return ({loading:'Carregando o exemplo…',playing:'Reproduzindo a prévia.',paused:'Prévia pausada. Toque no ▶ para continuar.',ended:'Prévia concluída. Toque no ▶ para ouvir novamente.',blocked:'Toque no ▶ deste player para liberar o áudio no navegador.',error:'Não foi possível carregar este áudio. Verifique a conexão ou tente outro exemplo.'})[state]||''}
