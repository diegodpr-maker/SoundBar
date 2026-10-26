export function createEventFader({active,stop,levels,pause=id=>{const item=active.get(id);if(item){item.pausedByUser=true;item.playing=false;item.audio.pause()}},now=()=>performance.now(),schedule=fn=>setInterval(fn,25),cancel=clearInterval,duration=2000,onChange=()=>{}}){
 let pair=null,timer=null,paused=false,waiting=false;
 const level=item=>item.fadeLevel??1;
 function clearTimer(){if(timer!==null)cancel(timer);timer=null}
 function update(){
  if(!pair?.started||paused||waiting)return;
  const ratio=Math.min(1,Math.max(0,(now()-pair.at)/pair.duration));
  const incoming=active.get(pair.incoming),outgoing=active.get(pair.outgoing);
  const target=pair.kind==='pause'?0:1;
  if(incoming)levels.progress(incoming,pair.into+(target-pair.into)*ratio);
  if(outgoing)levels.progress(outgoing,pair.from*(1-ratio));
  if(ratio>=1){const {outgoing:previous,incoming:id,kind}=pair;pair=null;clearTimer();if(incoming)levels.set(incoming,target);if(kind==='pause')pause(id);if(active.has(previous))stop(previous);onChange()}
 }
 function hold(){
  update();clearTimer();if(!pair)return;
  if(pair.started&&!paused&&!waiting){pair.duration=Math.max(1,pair.duration-(now()-pair.at));pair.into=level(active.get(pair.incoming)||{});pair.from=level(active.get(pair.outgoing)||{})}
  for(const id of [pair.incoming,pair.outgoing]){const item=active.get(id);if(item)levels.set(item,level(item))}
 }
 function run(){
  if(!pair?.started||paused||waiting)return;pair.at=now();
  const incoming=active.get(pair.incoming),outgoing=active.get(pair.outgoing);
  if(incoming)levels.ramp(incoming,pair.kind==='pause'?0:1,pair.duration);if(outgoing)levels.ramp(outgoing,0,pair.duration);
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
  if(previous){active.get(previous).pausedByCard=false;pair={incoming:id,outgoing:previous,started:false};onChange();return 0}
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
 function pauseAll(){hold();if(pair?.kind==='pause'){const id=pair.incoming;pair=null;const item=active.get(id);if(item)levels.set(item,0);pause(id)}paused=true}
 function resume(){if(!paused)return;paused=false;run()}
 function buffering(id){if(pair?.started&&pair.incoming===id&&!waiting){if(pair.kind==='pause'){pauseCard(id,true);return}hold();waiting=true}}
 function cardFade(id,kind){
  hold();pair=null;paused=false;waiting=false;
  for(const key of [...active.keys()])if(key!==id)stop(key);
  const item=active.get(id);if(!item)return;
  pair={kind,incoming:id,started:true,into:level(item),from:0,at:now(),duration};run();onChange();
 }
 function pauseCard(id,immediate=false){
  const item=active.get(id);if(!item)return;item.pausedByCard=true;
  if(immediate||item.audio.paused||!item.playing){hold();pair=null;clearTimer();paused=false;waiting=false;for(const key of [...active.keys()])if(key!==id)stop(key);levels.set(item,0);pause(id);onChange();return}
  cardFade(id,'pause');
 }
 function resumeCard(id){const item=active.get(id);if(item){item.pausedByCard=false;cardFade(id,'resume')}}
 function settle(){
  if(pair?.kind==='pause'){pauseCard(pair.incoming,true);return}
  hold();pair=null;paused=false;waiting=false;const keep=survivor();for(const id of [...active.keys()])if(id!==keep)stop(id);
  if(keep){const item=active.get(keep);levels.set(item,item.pausedByCard&&item.audio.paused?0:1)}onChange();
 }
 function reset(){clearTimer();pair=null;paused=false;waiting=false}
 return{prepare,started,buffering,removing,pause:pauseAll,pauseCard,resumeCard,resume,settle,reset,setDuration:ms=>{if([1000,2000,3000,5000].includes(ms))duration=ms},state:()=>pair?{...pair,paused,waiting}:null};
}
