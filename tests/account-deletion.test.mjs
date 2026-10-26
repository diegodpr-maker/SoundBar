import {test} from 'node:test';import assert from 'node:assert/strict';
import {accountDeletionHandler,validateDeletion,safeDeletionFiles} from '../supabase/functions/delete-account/core.js';
const target='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',lease='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const request=(body={target_user:target,confirmation_email:'member@example.test'},headers={})=>new Request('https://project.supabase.co/functions/v1/soundbar-delete-account',{method:'POST',headers:{origin:'https://harmony.sysmacom.com.br',authorization:'Bearer verified','content-type':'application/json',...headers},body:JSON.stringify(body)});
function setup({actorId=actor,denied=false,failRemove=false,files=[{bucket:'soundbar-audio',path:target+'/track.mp3'}]}={}){
 const calls=[];let pending=[...files],deleted=false;
 const handler=accountDeletionHandler({authorize:async()=>{calls.push('authorize');return{id:actorId,prepare:async(id,email)=>{calls.push('prepare');assert.equal(id,target);assert.equal(email,'member@example.test');if(denied)throw Object.assign(Error('Acesso exclusivo do administrador.'),{code:'42501'});return{user_id:id,lease,status:'working'}}}},service:{ban:async()=>calls.push('ban'),files:async()=>{calls.push('files');return pending},remove:async(bucket,paths)=>{calls.push('remove');assert.equal(bucket,'soundbar-audio');assert.ok(paths.every(p=>p.startsWith(target+'/')));if(failRemove)throw Object.assign(Error('offline'),{status:503});pending=[]},deleteUser:async()=>{calls.push('delete');deleted=true},finish:async(_id,_lease,data)=>calls.push(['finish',data])}});
 return{handler,calls,get deleted(){return deleted}};
}
test('deletion blocks access, removes private objects through Storage and only then deletes Auth',async()=>{const s=setup();const r=await s.handler(request());assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,status:'completed'});assert.ok(s.calls.indexOf('prepare')<s.calls.indexOf('ban'));assert.ok(s.calls.indexOf('remove')<s.calls.indexOf('delete'));assert.equal(s.deleted,true);assert.equal(s.calls.at(-1)[1].status,'completed')});
test('storage failure keeps the blocked account retryable and never deletes Auth prematurely',async()=>{const s=setup({failRemove:true});const r=await s.handler(request());assert.equal(r.status,503);assert.equal(s.deleted,false);assert.equal(s.calls.at(-1)[1].status,'failed');assert.match((await r.json()).error,/bloqueada/)});
test('nonadmins, the administrator itself, cross-origin calls and missing credentials cannot delete',async()=>{
 const member=setup({denied:true});assert.equal((await member.handler(request())).status,403);assert.ok(!member.calls.includes('ban'));
 const self=setup({actorId:target});assert.equal((await self.handler(request())).status,403);assert.ok(!self.calls.includes('prepare'));
 const s=setup();assert.equal((await s.handler(request(undefined,{origin:'https://evil.test'}))).status,403);assert.equal((await s.handler(request(undefined,{authorization:''}))).status,401);assert.equal(s.calls.length,0);
});
test('invalid identifiers, excessive bodies and wrong content types fail before authorization',async()=>{const s=setup();assert.equal((await s.handler(request({target_user:"';drop table",confirmation_email:'member@example.test'}))).status,400);assert.equal((await s.handler(request({target_user:target,confirmation_email:'x'.repeat(3000)}))).status,413);assert.equal((await s.handler(request(undefined,{'content-type':'text/plain'}))).status,415);assert.equal(s.calls.length,0);assert.throws(()=>validateDeletion({target_user:target,confirmation_email:''}));});
test('wrong bucket, another member path, traversal and invalid file batches never reach Storage',async()=>{
 for(const files of [[{bucket:'soundbar-library',path:target+'/public.mp3'}],[{bucket:'soundbar-audio',path:actor+'/private.mp3'}],[{bucket:'soundbar-audio',path:target+'/../other.mp3'}],{}]){
  const s=setup({files:Array.isArray(files)?files:[]});if(!Array.isArray(files)){assert.throws(()=>safeDeletionFiles(files,target));continue}
  const r=await s.handler(request());assert.equal(r.status,503);assert.ok(!s.calls.includes('remove'));assert.equal(s.deleted,false);
 }
});
test('large cleanups release their lease and continue in a later request without deleting Auth early',async()=>{
 let removed=false,deleted=false;const calls=[];
 const h=accountDeletionHandler({authorize:async()=>({id:actor,prepare:async()=>({user_id:target,lease,status:'working'})}),service:{ban:async()=>{},files:async()=>removed?[{bucket:'soundbar-audio',path:target+'/second.mp3'}]:[{bucket:'soundbar-audio',path:target+'/first.mp3'}],remove:async()=>{removed=true},deleteUser:async()=>{deleted=true},finish:async(_,__,data)=>calls.push(data.status)}});
 assert.equal((await h(request())).status,202);assert.equal(deleted,false);assert.deepEqual(calls,['queued']);
});
