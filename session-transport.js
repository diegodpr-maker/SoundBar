const SESSION_KEY='soundbar-supabase-session';
const failure=(message,status=503,code='CONNECTION_TIMEOUT')=>Object.assign(Error(message),{status,code,retryable:false});
function deadline(task,ms,message){let timer;return Promise.race([Promise.resolve().then(task),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure(message,503,'SESSION_BUSY')),ms)})]).finally(()=>clearTimeout(timer))}
export function boundedFetch(fetcher=fetch,{timeout=15000}={}){return async(input,options={})=>{
 const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url).pathname,upload=/\/storage\/v1\/(?:object|upload)/.test(path)&&['POST','PUT','PATCH'].includes(options.method||'GET'),wait=upload?120000:path.includes('/storage/')?60000:timeout;
 const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason);if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});let expired=false;const timer=setTimeout(()=>{expired=true;controller.abort()},wait);
 try{return await fetcher(input,{...options,signal:controller.signal})}catch(error){if(expired)throw failure('Tempo esgotado na conexão. Tente novamente.');throw error}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort)}
}}
// Auth still owns login/refresh and the same persisted session. Data requests use
// the existing access token without waiting on Auth's cross-tab mutex. The server
// validates that token on every request; no role is trusted from local metadata.
export function createSessionTransport(createClient,{url,key},{storage=globalThis.localStorage,fetcher=globalThis.fetch,now=()=>Date.now(),sessionTimeout=12000,requestTimeout=15000,events=globalThis.window}={}){
 let disabled=false,refreshing=null;const listeners=new Set();
 const adapter={getItem:k=>disabled&&k===SESSION_KEY?null:storage.getItem(k),setItem:(k,v)=>{if(!disabled||k!==SESSION_KEY)storage.setItem(k,v)},removeItem:k=>storage.removeItem(k)};
 const network=boundedFetch(fetcher,{timeout:requestTimeout});
 const authClient=createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:SESSION_KEY,storage:adapter,flowType:'pkce'},global:{fetch:network}});
 function read(){try{const s=JSON.parse(adapter.getItem(SESSION_KEY)||'null');return s&&typeof s.access_token==='string'&&s.access_token&&s.user?.id&&Number.isFinite(Number(s.expires_at))?s:null}catch{return null}}
 let lastUser=read()?.user.id||null;
 function emit(event,session){for(const callback of listeners)setTimeout(()=>{try{callback(event,session)}catch(error){globalThis.harmonyReportError?.('authentication',error)}},0)}
 authClient.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){disabled=true;lastUser=null}else if(session){if(disabled)return;lastUser=session.user.id}emit(event,session)});
 events?.addEventListener('storage',event=>{if(event.key!==SESSION_KEY)return;const s=read(),id=s?.user.id||null;if(!s){disabled=true;void authClient.auth.stopAutoRefresh().catch(()=>{})}if(id!==lastUser){lastUser=id;emit(id?'SIGNED_IN':'SIGNED_OUT',s)}});
 async function getSession(){try{let s=read();if(!s)return{data:{session:null},error:null};if(Number(s.expires_at)*1000>now()+5000)return{data:{session:s},error:null};const owner=s.user.id;
 if(!refreshing)refreshing=deadline(()=>authClient.auth.refreshSession(),sessionTimeout,'Não foi possível renovar sua sessão. Entre novamente.').finally(()=>refreshing=null);
 const result=await refreshing;if(result.error)throw result.error;s=read();if(!s||s.user.id!==owner)throw failure('Sua sessão mudou. Entre novamente.',401,'SESSION_CHANGED');return{data:{session:s},error:null};
 }catch(error){if([400,401,403].includes(Number(error.status))){disabled=true;storage.removeItem(SESSION_KEY);emit('SIGNED_OUT',null)}return{data:{session:null},error}}}
 async function token(){const result=await getSession();if(result.error)throw result.error;return result.data.session?.access_token||null}
 const dataClient=createClient(url,key,{accessToken:token,global:{fetch:network}});
 const auth=new Proxy(authClient.auth,{get(target,property){
  if(property==='getSession')return getSession;
  if(property==='getUser')return async jwt=>{try{const access=jwt||await token();if(!access)throw failure('Entre para acessar seu estúdio.',401,'SESSION_MISSING');return await deadline(()=>target.getUser(access),sessionTimeout,'Não foi possível verificar sua sessão. Tente novamente.')}catch(error){return{data:{user:null},error}}};
  if(property==='onAuthStateChange')return callback=>{listeners.add(callback);return{data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}}};
  if(property==='signInWithPassword')return async credentials=>{disabled=false;return deadline(()=>target.signInWithPassword(credentials),sessionTimeout,'Não foi possível entrar. Confira a conexão e tente novamente.')};
  if(property==='signOut')return async options=>{try{return await deadline(()=>target.signOut(options),sessionTimeout,'Não foi possível encerrar a sessão remota.')}finally{disabled=true;storage.removeItem(SESSION_KEY);void target.stopAutoRefresh().catch(()=>{});emit('SIGNED_OUT',null)}};
  const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
 }});
 return{auth,from:dataClient.from.bind(dataClient),rpc:dataClient.rpc.bind(dataClient),storage:dataClient.storage,get functions(){return dataClient.functions},realtime:dataClient.realtime};
}
