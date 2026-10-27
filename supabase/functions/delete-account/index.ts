import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {accountDeletionHandler} from './core.js';
const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)});
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}};
const server=createClient(url,serviceKey,options);
function unwrap(result:any){if(result.error)throw result.error;return result.data}
function missing(error:any){return error?.status===404||error?.code==='user_not_found'}
const serviceCall=async(action:string,target:string,token:string,details={})=>unwrap(await server.rpc('sb_account_deletion_service',{action,target,token,details}));
Deno.serve(accountDeletionHandler({
 authorize:async(bearer:string)=>{
  const client=createClient(url,anonKey,{...options,global:{fetch:boundedFetch,headers:{Authorization:bearer}}});
  const {data,error}=await client.auth.getUser(bearer.slice(7));if(error||!data.user)throw Object.assign(Error('Entre novamente na sua conta.'),{status:401});
  return{id:data.user.id,prepare:async(target:string,email:string)=>unwrap(await client.rpc('sb_prepare_account_deletion',{target,confirmation_email:email}))};
 },
 service:{
  ban:async(target:string)=>{const {error}=await server.auth.admin.updateUserById(target,{ban_duration:'876000h'});if(error&&!missing(error))throw error},
  files:(target:string,token:string)=>serviceCall('files',target,token),
  remove:async(bucket:string,paths:string[])=>unwrap(await server.storage.from(bucket).remove(paths)),
  deleteUser:async(target:string)=>{const {error}=await server.auth.admin.deleteUser(target,false);if(error&&!missing(error))throw error},
  finish:(target:string,token:string,details:any)=>serviceCall('finish',target,token,details)
 }
}));
