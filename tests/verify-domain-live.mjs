import assert from 'node:assert/strict';
const base='https://harmony.sysmacom.com.br',supabase='https://fcmsojjtkiehsobbkjnr.supabase.co';
const key='sb_publishable_yX33DKLkCPDsNdCSV3sJmA_bd8yrd3f';const report=[];let failures=0;
async function check(name,fn){try{const detail=await fn();report.push({name,ok:true,detail})}catch(e){failures++;report.push({name,ok:false,error:e.message})}}
const request=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(12000)});
for(const path of ['/','/app.html','/login.html','/credits.html','/manifest.webmanifest','/sw.js','/config.js','/app.js?v=31','/auth.js?v=31','/error-monitor.js?v=31','/audio-conversion.js?v=31','/wma-worker.js?v=31','/harmony-icon-192.png']){
 await check(path,async()=>{const r=await request(base+path);assert.equal(r.status,200);assert.equal(new URL(r.url).origin,base);const body=await r.text();if(/\.js/.test(path))assert.ok(!body.startsWith('<'));if(path==='/manifest.webmanifest'){const m=JSON.parse(body);for(const field of ['start_url','scope','id'])assert.equal(new URL(m[field],base+'/').origin,base)}return{url:r.url,status:r.status}});
}
await check('old GitHub address',async()=>{const r=await request('https://diegodpr-maker.github.io/SoundBar/');assert.equal(new URL(r.url).origin,base);await r.body?.cancel();return r.url});
await check('HTTP redirects to HTTPS',async()=>{const r=await request('http://harmony.sysmacom.com.br/');assert.equal(new URL(r.url).protocol,'https:');await r.body?.cancel();return r.url});
for(const [name,url] of [['registration',supabase+'/functions/v1/soundbar-register'],['telemetry',supabase+'/functions/v1/soundbar-errors'],['auth',supabase+'/auth/v1/token?grant_type=password'],['storage',supabase.replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable']]){
 await check(name+' CORS',async()=>{const r=await request(url,{method:'OPTIONS',headers:{origin:base,'access-control-request-method':'POST','access-control-request-headers':'apikey,authorization,content-type'}});assert.ok(r.ok);const allowed=r.headers.get('access-control-allow-origin');assert.ok(allowed==='*'||allowed===base);await r.body?.cancel();return{status:r.status,allowed}});
}
await check('registration rejects invalid data, with CORS',async()=>{const r=await request(supabase+'/functions/v1/soundbar-register',{method:'POST',headers:{origin:base,apikey:key,'content-type':'application/json'},body:'{}'});assert.equal(r.status,400);assert.equal(r.headers.get('access-control-allow-origin'),base);return{status:r.status}});
await check('public library and audio range',async()=>{const r=await request(supabase+'/rest/v1/sb_library_tracks?select=audio_url&active=eq.true&limit=1',{headers:{apikey:key,origin:base}});assert.equal(r.status,200);const data=await r.json();assert.ok(data.length);const audio=await request(data[0].audio_url,{headers:{range:'bytes=0-31',origin:base}});assert.ok([200,206].includes(audio.status));const type=audio.headers.get('content-type');assert.ok(type.includes('audio'));await audio.body?.cancel();return{status:audio.status,type}});
console.log(JSON.stringify(report,null,2));if(failures)process.exitCode=1;
