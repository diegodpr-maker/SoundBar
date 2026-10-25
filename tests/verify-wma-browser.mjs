import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.argv[2]);
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
try{
 for(let n=0;n<30;n++){try{if((await fetch('http://127.0.0.1:8765/audio-conversion.js')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const violations=[];
 page.on('console',m=>{if(m.type()==='error')violations.push(m.text())});page.on('pageerror',e=>violations.push(e.message));
 const csp=readFileSync('app.html','utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
 await page.route('**/conversion-check.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head>'+csp+'</head><body></body></html>'}));
 await page.goto('http://127.0.0.1:8765/conversion-check.html');
 const input=readFileSync('tests/fixtures/tone-wmav2.wma.base64','utf8');
 const result=await page.evaluate(async base64=>{const {prepareAudioUpload}=await import('./audio-conversion.js?v=26');const bytes=Uint8Array.from(atob(base64),x=>x.charCodeAt(0));const stages=[];const output=await prepareAudioUpload(new Blob([bytes]),{filename:'browser.wma',onStage:s=>stages.push(s)});return{filename:output.filename,type:output.blob.type,size:output.blob.size,converted:output.converted,stages}},input);
 assert.equal(result.filename,'browser.mp3');assert.equal(result.type,'audio/mpeg');assert.ok(result.size>1000);assert.equal(result.converted,true);assert.ok(!violations.some(x=>/Content Security Policy|Refused to|unsafe-eval/i.test(x)),violations.join('\n'));console.log('Browser CSP + real worker + native MP3 decode: '+JSON.stringify(result));
}finally{await browser?.close();server.kill()}
