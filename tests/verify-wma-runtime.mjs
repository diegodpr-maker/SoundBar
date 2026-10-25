// Run in CI with the exact single-thread core served to browsers.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {inspectAudio} from '../audio-validation.js';
const require=createRequire(import.meta.url),factory=require(process.argv[2]);
const wasmBinary=readFileSync(process.argv[3]);
globalThis.importScripts=()=>{};
let result;
globalThis.self={createFFmpegCore:options=>factory({...options,wasmBinary}),postMessage:message=>{if(['done','error'].includes(message.type))result=message}};
await import('../wma-worker.js');
for(const codec of ['wmav1','wmav2']){
 const input=readFileSync(new URL('./fixtures/tone-'+codec+'.wma.base64',import.meta.url),'utf8');
 const bytes=Uint8Array.from(Buffer.from(input,'base64')).buffer;
 await self.onmessage({data:{bytes,maxBytes:25*1024*1024}});
 assert.equal(result.type,'done',result.message);const blob=new Blob([result.bytes],{type:'audio/mpeg'});
 await inspectAudio(blob,'tone.mp3');assert.ok(blob.size>1000);
 // Independently decode the resulting MP3 using the same runtime.
 const core=await factory({wasmBinary,mainScriptUrlOrBlob:'file:///tmp/ffmpeg-core.cjs#'+btoa(JSON.stringify({wasmURL:'file:///tmp/ffmpeg-core.wasm',workerURL:''}))});
 core.setLogger(()=>{});core.FS.writeFile('check.mp3',new Uint8Array(result.bytes));core.exec('-i','check.mp3','-f','null','-');assert.equal(core.ret,0);core.reset();
 console.log(codec+' -> MP3 validado e decodificado ('+blob.size+' bytes)');
}
