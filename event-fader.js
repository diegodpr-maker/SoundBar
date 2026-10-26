export function createEventFader({active,stop,levels,now=()=>performance.now(),schedule=fn=>setInterval(fn,25),cancel=clearInterval,duration=2000,onChange=()=>{}}){
 let pair=null,timer=null,paused=false,waiting=false;
 const level=item=>item.fadeLevel??1;
 function clearTimer(){if(timer!==null)cancel(timer);timer=null}
 function update(){
  if(!pair?.started||paused||waiting)return;
  const ratio=Math.min(1,Math.max(0,(now()-pair.at)/pair.duration));
  const incoming=active.get(pair.incoming),outgoing=active.get(pair.outgoing);
  if(incoming)levels.progress(incoming,pair.into+(1-pair.into)*ratio);
  if(outgoing)levels.progress(outgoing,pair.from*(1-ratio));
  if(ratio>=1){const previous=pair.outgoing;pair=null;clearTimer();if(incoming)levels.set(incoming,1);if(active.has(previous))stop(previous);onChange()}
 }
 function hold(){
  update();clearTimer();if(!pair)return;
  if(pair.started&&!paused&&!waiting){pair.duration=Math.max(1,pair.duration-(now()-pair.at));pair.into=level(active.get(pair.incoming)||{});pair.from=level(active.get(pair.outgoing)||{})}
  for(const id of [pair.incoming,pair.outgoing]){const item=active.get(id);if(item)levels.set(item,level(item))}
 }
 function run(){
  if(!pair?.started||paused||waiting)return;pair.at=now();
  const incoming=active.get(pair.incoming),outgoing=active.get(pair.outgoing);
  if(incoming)levels.ramp(incoming,1,pair.duration);if(outgoing)levels.ramp(outgoing,0,pair.duration);
  timer=schedule(update);
 }
 function survivor(){
  const items=[...active.entries()],audible=items.filter(([,item])=>item.playing&&!item.audio.paused&&!item.audio.ended);
  return(audible.length?audible:items.filter(([,item])=>!item.audio.ended)).sort((a,b)=>level(a[1])-level(b[1])).at(-1)?.[0];
 }
 function prepare(id){
  hold();pair=null;paused=false;waiting=false;const previous=[...active.values()].some(item=>item.playing&&!item.audio.paused&&!item.audio.ended)?survivor():undefined;
  // Remove superseded loads/quiet tracks BEFORE the next audio is registered.
  for(const key of [...active.keys()])if(key!==previous)stop(key);
  if(previous){pair={incoming:id,outgoing:previous,started:false};onChange();return 0}
  return 1;
 }
 function started(id){
  if(!pair||pair.incoming!==id)return;
  if(pair.started){if(waiting){waiting=false;run();onChange()}return}
  const incoming=active.get(id),outgoing=active.get(pair.outgoing);if(!incoming)return;
  if(!outgoing){pair=null;levels.set(incoming,1);onChange();return}
  pair={...pair,started:true,into:level(incoming),from:level(outgoing),at:now(),duration};run();onChange();
 }
 function removing(id){
  if(!pair||![pair.incoming,pair.outgoing].includes(id))return;
  hold();if(!pair)return;const other=id===pair.incoming?pair.outgoing:pair.incoming;pair=null;
  const item=active.get(other);if(item)levels.set(item,1);onChange();
 }
 function pause(){hold();paused=true}
 function resume(){if(!paused)return;paused=false;run()}
 function buffering(id){if(pair?.started&&pair.incoming===id&&!waiting){hold();waiting=true}}
 function settle(){
  hold();pair=null;paused=false;waiting=false;const keep=survivor();for(const id of [...active.keys()])if(id!==keep)stop(id);
  if(keep)levels.set(active.get(keep),1);onChange();
 }
 function reset(){clearTimer();pair=null;paused=false;waiting=false}
 return{prepare,started,buffering,removing,pause,resume,settle,reset,setDuration:ms=>{if([1000,2000,3000,5000].includes(ms))duration=ms},state:()=>pair?{...pair,paused,waiting}:null};
}
