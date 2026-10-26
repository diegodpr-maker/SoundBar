import {createRequire} from 'node:module';import {createECDH,randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {createDispatcher} from '../supabase/functions/admin-push/core.js';
const require=createRequire(import.meta.url),webpush=require(process.argv[2]);
const libraryRequire=createRequire(require.resolve(process.argv[2])),ece=libraryRequire('http_ece');
const sender=webpush.generateVAPIDKeys(),receiver=createECDH('prime256v1');receiver.generateKeys();const auth=randomBytes(16),endpoint='https://fcm.googleapis.com/fcm/send/offline-check';
const sub={id:'subscription',endpoint,p256dh:receiver.getPublicKey().toString('base64url'),auth:auth.toString('base64url')};
let decrypted,records=0;
const worker=createDispatcher({rpc:async(action,data)=>{if(action==='claim')return{data:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',lease:'lease',kind:'signup',subscriptions:[sub]}]};if(action==='record'){assert.equal(data.status,201);records++}return{data:{}}},generateKeys:()=>sender,requestDetails:(...args)=>webpush.generateRequestDetails(...args),fetch:async(url,options)=>{
 assert.equal(url,endpoint);assert.equal(options.redirect,'error');assert.equal(options.headers['Content-Encoding'],'aes128gcm');
 decrypted=JSON.parse(ece.decrypt(Buffer.from(options.body),{version:'aes128gcm',privateKey:receiver,authSecret:auth}).toString());
 assert.equal(decrypted.type,'harmony-new-account');return new Response('',{status:201});
}});
assert.deepEqual(await worker.dispatch(sender),{processed:1,accepted:1});assert.equal(records,1);assert.equal(decrypted.id,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');console.log('Pinned web-push library: VAPID signing, AES128GCM encryption, recipient decryption and private signup payload passed; no external notification sent.');
