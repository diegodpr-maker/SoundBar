export function createEventWakeLock({navigator=globalThis.navigator,document=globalThis.document,onChange=()=>{}}={}){
 let active=false,sentinel=null,pending=null,generation=0,status='off';
 const visible=()=>document.visibilityState==='visible';
 const report=value=>{status=value;onChange(value)};
 const release=async lock=>{try{await lock?.release()}catch{}};
 async function ensure(){
  if(!active||!visible())return false;
  if(sentinel&&!sentinel.released)return true;
  if(!navigator?.wakeLock?.request){report('unsupported');return false}
  if(pending)return pending;
  const version=generation;report('requesting');
  const task=(async()=>{
   try{
    const lock=await navigator.wakeLock.request('screen');
    if(version!==generation||!active||!visible()){await release(lock);return false}
    sentinel=lock;report('held');
    lock.addEventListener('release',()=>{if(sentinel===lock){sentinel=null;report(active?'released':'off')}});
    return true;
   }catch{if(version===generation&&active&&visible())report('blocked');return false}
  })();pending=task;
  try{return await task}finally{if(pending===task){pending=null;if(version!==generation&&active&&visible())void ensure()}}
 }
 async function suspend(){generation++;const lock=sentinel;sentinel=null;report(active?'suspended':'off');await release(lock)}
 async function setActive(value){active=!!value;if(!active){await suspend();return false}return ensure()}
 const visibility=()=>{if(visible()){if(active)void ensure()}else void suspend()};
 document.addEventListener('visibilitychange',visibility);
 return{setActive,ensure,state:()=>status,dispose:async()=>{document.removeEventListener('visibilitychange',visibility);await setActive(false)}};
}
