export function createAdminNotifications({getClient,window:win=globalThis.window,navigator:nav=globalThis.navigator}){
 const supported=()=>!!win?.Notification&&!!win?.PushManager&&!!nav?.serviceWorker;
 const rpc=async(action,data={})=>{const client=await getClient();const r=await client.rpc('sb_admin_notifications',{action,data});if(r.error)throw Error(r.error.message||'Não foi possível atualizar as notificações.');return r.data};
 const registration=async()=>{
  let timer;
  try{await nav.serviceWorker.register('./sw.js');return await Promise.race([nav.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Reabra o Harmony e tente novamente.')),10000)})])}finally{clearTimeout(timer)}
 };
 const subscription=async()=>supported()?(await registration()).pushManager.getSubscription():null;
 async function status(){
  if(!supported())return{status:'unsupported'};
  if(win.Notification.permission==='denied')return{status:'blocked'};
  const sub=await subscription();const data=await rpc('config',{endpoint:sub?.endpoint||''});
  return{status:data.enabled&&win.Notification.permission==='granted'?'enabled':'disabled'};
 }
 async function enable(){
  if(!supported())throw Error('Instale o Harmony e abra pelo ícone para ativar as notificações.');
  // Must be called directly from a user click, before waiting for network requests.
  const permission=win.Notification.permission==='granted'?'granted':await win.Notification.requestPermission();
  if(permission!=='granted')throw Error(permission==='denied'?'Permita as notificações nas configurações do navegador.':'A permissão de notificações não foi concedida.');
  const config=await rpc('config');if(!config.publicKey)throw Error('Tente ativar novamente em instantes.');
  const reg=await registration();let sub=await reg.pushManager.getSubscription(),created=false;
  if(!sub){const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});created=true}
  const json=sub.toJSON();
  try{await rpc('subscribe',{endpoint:sub.endpoint,p256dh:json.keys.p256dh.replace(/=+$/,''),auth:json.keys.auth.replace(/=+$/,'')})}catch(error){if(created)await sub.unsubscribe().catch(()=>{});throw error}
  return{status:'enabled'};
 }
 async function disable(){
  const sub=await subscription();if(!sub)return{status:'disabled'};
  let removed=false,local=false;
  try{await rpc('unsubscribe',{endpoint:sub.endpoint});removed=true}catch{}
  local=await sub.unsubscribe().catch(()=>false);if(!removed&&!local)throw Error('Não foi possível desativar. Confira a conexão e tente novamente.');
  return{status:'disabled'};
 }
 async function localUnsubscribe(){try{const reg=await nav?.serviceWorker?.getRegistration('./');const sub=await reg?.pushManager.getSubscription();await sub?.unsubscribe()}catch{}}
 async function test(){const sub=await subscription();if(!sub)throw Error('Ative as notificações primeiro.');await rpc('test',{endpoint:sub.endpoint})}
 return{status,enable,disable,test,localUnsubscribe};
}
