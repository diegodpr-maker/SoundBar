import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {createDispatcher,pushHandler} from './core.js';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const rpc=(action:string,data={})=>client.rpc('sb_webpush_server',{action,data});
const worker=createDispatcher({rpc,generateKeys:()=>webpush.generateVAPIDKeys(),requestDetails:(...args:Parameters<typeof webpush.generateRequestDetails>)=>webpush.generateRequestDetails(...args)});
let cryptoChecked=false;
async function dispatch(keys:any){
 if(!cryptoChecked){
  const receiver=webpush.generateVAPIDKeys();
  const auth=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const probe=webpush.generateRequestDetails({endpoint:'https://fcm.googleapis.com/fcm/send/crypto-check',keys:{p256dh:receiver.publicKey,auth}},'{}',{vapidDetails:{subject:'https://harmony.sysmacom.com.br',publicKey:keys.publicKey,privateKey:keys.privateKey}});
  if(!probe.body?.length)throw Error('push_crypto_unavailable');
  cryptoChecked=true;
 }
 return worker.dispatch(keys);
}
Deno.serve(pushHandler({readConfig:async()=>{const r=await rpc('config');if(r.error)throw Error('configuration');return r.data},initialize:worker.config,dispatch}));
