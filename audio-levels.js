const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
// A GainNode is needed on iOS, where HTMLMediaElement.volume is read-only.
export function createAudioLevels({AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,master=.8}={}){
 const nodes=new WeakMap();let context,bus;master=clamp(master);
 function unlock(){
  if(!AudioContext)return Promise.resolve();
  try{if(!context){context=new AudioContext();bus=context.createGain();bus.gain.value=master;bus.connect(context.destination)}return context.state==='running'?Promise.resolve():context.resume()}
  catch(error){return Promise.reject(error)}
 }
 function attach(item){
  let node=nodes.get(item.audio);if(!node&&context){
   const source=context.createMediaElementSource(item.audio),gain=context.createGain();
   gain.gain.value=clamp(item.fadeLevel??1);node={source,gain,connected:false};nodes.set(item.audio,node);
  }
  if(node&&!node.connected){node.source.connect(node.gain);node.gain.connect(bus);node.connected=true}
  if(node)item.audio.volume=1;return node;
 }
 function set(item,value){item.fadeLevel=clamp(value);const node=attach(item);if(node){const gain=node.gain.gain;gain.cancelScheduledValues(context.currentTime);gain.setValueAtTime(item.fadeLevel,context.currentTime)}else item.audio.volume=master*item.fadeLevel}
 function ramp(item,to,milliseconds){const node=attach(item);if(node){const gain=node.gain.gain,time=context.currentTime;gain.cancelScheduledValues(time);gain.setValueAtTime(clamp(item.fadeLevel??1),time);gain.linearRampToValueAtTime(clamp(to),time+milliseconds/1000)}}
 // Web Audio runs its envelope independently of background timer throttling.
 function progress(item,value){item.fadeLevel=clamp(value);if(!nodes.has(item.audio))item.audio.volume=master*item.fadeLevel}
 function setMaster(value,items=[]){master=clamp(value);if(bus)bus.gain.setValueAtTime(master,context.currentTime);for(const item of items)if(!nodes.has(item.audio))item.audio.volume=master*clamp(item.fadeLevel??1)}
 function release(item){const node=nodes.get(item.audio);if(node?.connected){node.source.disconnect();node.gain.disconnect();node.connected=false}}
 return{unlock,wake:()=>context?unlock():Promise.resolve(),set,ramp,progress,setMaster,release};
}
