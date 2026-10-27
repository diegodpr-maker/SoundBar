export function playbackState(active){
 const selected=[...active.values()].filter(item=>!item.audio.ended);
 const audible=selected.filter(item=>item.playing&&!item.audio.paused);
 const paused=selected.filter(item=>item.pausedByUser||(item.ready===true&&item.audio.paused&&!item.resuming));
 return{selected,audible,paused,action:selected.length&&paused.length===selected.length?'resume':'pause'};
}
export function pauseTracks(active,ids=[...active.keys()]){
 for(const id of ids){
  const item=active.get(id);if(!item)continue;
  item.playbackVersion=(item.playbackVersion||0)+1;item.pausedByUser=true;item.resuming=false;item.playing=false;item.audio.pause();
 }
}
export async function resumeTracks(active,ids=[...active.keys()]){
 const starts=ids.map(id=>{
  const item=active.get(id);if(!item||item.audio.ended)return Promise.resolve(null);
  item.pausedByUser=false;
  if(item.ready===false)return Promise.resolve(null); // The original loader will start it once ready.
  const version=item.playbackVersion=(item.playbackVersion||0)+1;item.resuming=true;
  let started;try{started=item.audio.play()}catch(error){started=Promise.reject(error)}
  return Promise.resolve(started).then(()=>null,error=>{
   if(active.get(id)!==item||item.playbackVersion!==version)return null;
   item.pausedByUser=true;item.playing=false;return error;
  }).finally(()=>{if(item.playbackVersion===version)item.resuming=false});
 });
 return(await Promise.all(starts)).filter(Boolean);
}
