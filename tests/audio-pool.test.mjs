import {test} from 'node:test';import assert from 'node:assert/strict';import {createAudioPool} from '../audio-pool.js';
class AudioMock extends EventTarget{constructor(){super();this.paused=true;this.src='';this.currentTime=0;this.calls=0}pause(){this.paused=true}load(){this.calls++}removeAttribute(){this.src=''}play(){this.paused=false;return Promise.resolve()}ready(){this.dispatchEvent(new Event('canplay'))}}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('preparation downloads and buffers before click; playback needs no URL or database lookup',async()=>{let downloads=0;const p=createAudioPool({makeAudio:()=>new AudioMock(),fetcher:async()=>{downloads++;return {ok:true,blob:async()=>new Blob(['audio'])}},makeURL:()=> 'blob:ready'});p.prepare([{id:'a',url:'https://example.test/a.mp3',size:5}]);await tick();const entry=p.get('a');assert.equal(entry.audio.src,'blob:ready');entry.audio.ready();assert.deepEqual(p.stats(),{ready:1,total:1});await entry.audio.play();assert.equal(downloads,1);assert.equal(entry.audio.paused,false)});
test('memory is cleared and private URLs revoked on logout',async()=>{const revoked=[];const p=createAudioPool({makeAudio:()=>new AudioMock(),fetcher:async()=>({ok:true,blob:async()=>new Blob(['audio'])}),makeURL:()=> 'blob:private',revokeURL:u=>revoked.push(u)});p.prepare([{id:'a',url:'https://example.test/private',size:5}]);await tick();p.clear();assert.equal(p.get('a'),undefined);assert.deepEqual(revoked,['blob:private'])});
test('changing playlists preserves currently playing audio',async()=>{const p=createAudioPool({makeAudio:()=>new AudioMock()});p.prepare([{id:'a',url:'one'}]);const first=p.get('a').audio;await first.play();p.prepare([{id:'b',url:'two'}]);assert.equal(first.paused,false);assert.equal(p.get('a').audio,first);assert.equal(p.stats().total,1);p.clear();assert.equal(first.paused,true)});
test('preload size budget falls back to streaming for large files',async()=>{let downloads=0;const p=createAudioPool({makeAudio:()=>new AudioMock(),maxBytes:2,fetcher:async()=>{downloads++;return new Response('too large')}});p.prepare([{id:'a',url:'a',size:100}]);await tick();assert.equal(downloads,0);assert.equal(p.get('a').audio.src,'a')});

test('download failure enables native preload instead of leaving the audio unprepared',async()=>{const p=createAudioPool({makeAudio:()=>new AudioMock(),fetcher:async()=>{throw Error('offline')}});p.prepare([{id:'a',url:'remote',size:5}]);await tick();assert.equal(p.get('a').audio.preload,'auto');assert.equal(p.get('a').audio.calls,1)});

test('a late download cannot restore private media after logout',async()=>{let finish;let urls=0;const p=createAudioPool({makeAudio:()=>new AudioMock(),fetcher:()=>new Promise(r=>finish=r),makeURL:()=>{urls++;return 'blob:late'}});p.prepare([{id:'private',url:'signed',size:5}]);p.clear();finish({ok:true,blob:async()=>new Blob(['audio'])});await tick();assert.equal(p.get('private'),undefined);assert.equal(urls,0)});
test('paused selections retain their source and position across playlist rendering, but clear on logout',()=>{
 const retained=new Set(),p=createAudioPool({makeAudio:()=>new AudioMock(),isRetained:a=>retained.has(a)});
 p.prepare([{id:'a',url:'one'}]);const first=p.get('a').audio;first.currentTime=9;retained.add(first);
 p.prepare([{id:'b',url:'two'}]);assert.equal(p.get('a').audio,first);assert.equal(first.src,'one');assert.equal(first.currentTime,9);
 p.prepare([{id:'a',url:'one'}]);first.ready();assert.deepEqual(p.stats(),{ready:1,total:1});p.clear();assert.equal(p.get('a'),undefined);assert.equal(first.src,'');
});

test('finishing or failing a background download never reloads a retained paused selection',async()=>{
 for(const failed of [false,true]){
  let finish,fail;const retained=new Set(),p=createAudioPool({makeAudio:()=>new AudioMock(),isRetained:a=>retained.has(a),fetcher:()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject}),makeURL:()=> 'blob:late'});
  p.prepare([{id:'a',url:'remote',size:5}]);const audio=p.get('a').audio;retained.add(audio);audio.currentTime=17;audio.paused=true;
  if(failed)fail(Error('offline'));else finish({ok:true,blob:async()=>new Blob(['audio'])});await tick();
  assert.equal(audio.src,'remote');assert.equal(audio.currentTime,17);assert.equal(audio.calls,0);
  retained.delete(audio);p.stop('a');assert.equal(audio.currentTime,0);if(!failed)assert.equal(audio.src,'blob:late');p.clear();
 }
});
