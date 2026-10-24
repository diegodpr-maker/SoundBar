import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import {registrationHandler} from './core.js';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
// APP_PUBLISHABLE_KEY is a public identifier, not an administrative secret.
const APP_PUBLISHABLE_KEY='sb_publishable_yX33DKLkCPDsNdCSV3sJmA_bd8yrd3f';
Deno.serve(registrationHandler({client,publicKey:APP_PUBLISHABLE_KEY,anonKey:Deno.env.get('SUPABASE_ANON_KEY'),allowedOrigin:'https://diegodpr-maker.github.io',hash:async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('')}));
