import {test} from 'node:test';import assert from 'node:assert/strict';import {createAudioLevels} from '../audio-levels.js';
test('native fallback multiplies fader and master volume, including mid-transition volume changes',()=>{const levels=createAudioLevels({AudioContext:null}),item={audio:{volume:1}};levels.set(item,.5);assert.equal(item.audio.volume,.4);levels.setMaster(.2,[item]);assert.equal(item.audio.volume,.1);levels.progress(item,.25);assert.equal(item.audio.volume,.05)});
test('Web Audio schedules independent gain ramps and works when media volume is read-only as on iOS',async()=>{
 const gains=[],sources=[];let resumes=0;
 const param=()=>({value:1,events:[],cancelScheduledValues(t){this.events.push(['cancel',t])},setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t])}});
 const node=()=>({gain:param(),connections:[],connect(to){this.connections.push(to)},disconnect(){this.connections=[]}});
 class Context{constructor(){this.currentTime=10;this.state='suspended';this.destination={}}createGain(){const n=node();gains.push(n);return n}createMediaElementSource(audio){assert.ok(!sources.some(s=>s.audio===audio));const n={...node(),audio};sources.push(n);return n}resume(){resumes++;this.state='running';return Promise.resolve()}}
 const audio={get volume(){return 1},set volume(_){}};const levels=createAudioLevels({AudioContext:Context}),item={audio};await levels.unlock();assert.equal(resumes,1);levels.set(item,.75);levels.ramp(item,0,2000);
 assert.equal(gains[0].gain.value,.8);assert.deepEqual(gains[1].gain.events.at(-1),['ramp',0,12]);levels.setMaster(.3,[item]);assert.equal(gains[0].gain.value,.3);assert.deepEqual(gains[1].gain.events.at(-1),['ramp',0,12]);
 levels.release(item);assert.equal(sources[0].connections.length,0);levels.set(item,1);assert.equal(sources.length,1);assert.equal(sources[0].connections.length,1);
});
