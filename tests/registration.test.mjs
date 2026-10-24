import {test} from 'node:test';import assert from 'node:assert/strict';import {registrationHandler} from '../supabase/functions/register/core.js';
function setup({quota=true,creationError=null}={}) {
 const calls=[];
 const client={
  rpc:async(name,args)=>{calls.push({rpc:name,args});return {data:quota,error:null}},
  auth:{admin:{createUser:async data=>{calls.push({create:data});return {data:{user:{id:'new'}},error:creationError}}}}
 };
 const handler=registrationHandler({publicKey:'public-test',anonKey:'anon-test',allowedOrigin:'https://diegodpr-maker.github.io',hash:async s=>'hash-'+s,client});
 return {handler,calls};
}
function request(body={},extra={}){return new Request('https://test.supabase.co/functions/v1/soundbar-register',{method:'POST',headers:{origin:'https://diegodpr-maker.github.io',apikey:'public-test','content-type':'application/json',...extra},body:JSON.stringify({email:' User@example.test ',password:'test-password-123',display_name:'User',is_admin:true,role:'admin',status:'approved',...body})})}
test('registration creates a confirmed Auth identity without email and never accepts roles',async()=>{const {handler,calls}=setup();const r=await handler(request());assert.equal(r.status,202);assert.equal((await r.json()).status,'pending');assert.deepEqual(calls.find(c=>c.create).create,{email:'user@example.test',password:'test-password-123',email_confirm:true,user_metadata:{display_name:'User'}});assert.ok(calls[0].rpc==='sb_allow_registration')});
test('cross origin and invalid app key are rejected before account creation',async()=>{const {handler,calls}=setup();assert.equal((await handler(request({},{origin:'https://evil.test'}))).status,403);assert.equal((await handler(request({},{apikey:'wrong'}))).status,401);assert.equal(calls.length,0)});
test('rate limit blocks account creation and validation rejects bad payloads',async()=>{const {handler,calls}=setup({quota:false});assert.equal((await handler(request())).status,429);assert.equal(calls.filter(c=>c.create).length,0);assert.equal((await handler(request({password:'tiny'}))).status,400);assert.equal((await handler(request({email:'invalid'}))).status,400)});
test('existing emails do not leak through registration response',async()=>{const fresh=await setup().handler(request());const duplicate=await setup({creationError:{code:'email_exists'}}).handler(request());assert.equal(duplicate.status,fresh.status);assert.deepEqual(await duplicate.json(),await fresh.json())});
test('preflight is allowed, malformed and oversized bodies are rejected',async()=>{const {handler}=setup();const preflight=await handler(new Request('https://test.supabase.co/functions/v1/soundbar-register',{method:'OPTIONS',headers:{origin:'https://diegodpr-maker.github.io'}}));assert.equal(preflight.status,204);assert.equal((await handler(request({display_name:'a'.repeat(5000)}))).status,413);const malformed=new Request('https://test.test',{method:'POST',headers:{origin:'https://diegodpr-maker.github.io',apikey:'public-test'},body:'{'});assert.equal((await handler(malformed)).status,400)});
