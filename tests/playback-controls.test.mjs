import {test} from 'node:test';import assert from 'node:assert/strict';
import {playbackState,pauseTracks,resumeTracks} from '../playback-controls.js';
function track(name,time=12){const audio={paused:false,ended:false,currentTime:time,volume:.8,pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}};return{name,audio,playing:true,ready:true}}
test('pause and continue a mix without resetting position, source or volume',async()=>{
 const a=track('A',12),b=track('B',18),active=new Map([['a',a],['b',b]]);a.audio.src='blob:a';b.audio.src='blob:b';
 assert.equal(playbackState(active).audible.length,2);pauseTracks(active);
 assert.equal(playbackState(active).action,'resume');assert.equal(playbackState(active).paused.length,2);assert.equal(a.audio.currentTime,12);assert.equal(b.audio.currentTime,18);
 a.audio.volume=b.audio.volume=.35;assert.deepEqual(await resumeTracks(active),[]);assert.equal(a.audio.paused,false);assert.equal(b.audio.paused,false);assert.equal(a.audio.currentTime,12);assert.equal(b.audio.currentTime,18);assert.equal(a.audio.src,'blob:a');assert.equal(a.audio.volume,.35);
});
test('pause pending loads, then leave startup to their original loader when continued',async()=>{const a=track('Waiting');a.ready=false;a.playing=false;let played=0;a.audio.play=()=>{played++;return Promise.resolve()};const active=new Map([['a',a]]);pauseTracks(active);await resumeTracks(active);assert.equal(played,0);assert.equal(a.pausedByUser,false)});
test('resuming a single paused card leaves the other paused tracks untouched',async()=>{const a=track('A'),b=track('B'),active=new Map([['a',a],['b',b]]);pauseTracks(active);await resumeTracks(active,['a']);assert.equal(a.audio.paused,false);assert.equal(b.audio.paused,true);assert.equal(b.pausedByUser,true)});
test('a blocked continuation remains available for retry and a later pause cancels an in-flight continuation',async()=>{
 const a=track('A'),active=new Map([['a',a]]);pauseTracks(active);a.audio.play=()=>Promise.reject(Error('blocked'));assert.equal((await resumeTracks(active)).length,1);assert.equal(a.pausedByUser,true);
 let reject;a.audio.play=()=>new Promise((_,r)=>reject=r);const pending=resumeTracks(active);pauseTracks(active);reject(Object.assign(Error('cancelled'),{name:'AbortError'}));assert.deepEqual(await pending,[]);assert.equal(a.pausedByUser,true);assert.equal(a.resuming,false);
});
test('ending or removing a track while continuation is pending does not revive it',async()=>{const a=track('A'),active=new Map([['a',a]]);let reject;a.audio.play=()=>new Promise((_,r)=>reject=r);pauseTracks(active);const pending=resumeTracks(active);active.delete('a');reject(Error('removed'));assert.deepEqual(await pending,[]);a.audio.ended=true;assert.equal(playbackState(new Map([['a',a]])).selected.length,0)});

test('pausing a card leaves the other mix track playing and resumes the same source at its position',async()=>{
 const a=track('A',23),b=track('B',8),active=new Map([['a',a],['b',b]]);a.audio.src='blob:same-source';pauseTracks(active,['a']);
 assert.equal(active.get('a'),a);assert.equal(a.audio.currentTime,23);assert.equal(a.audio.src,'blob:same-source');assert.equal(a.audio.paused,true);assert.equal(b.audio.paused,false);
 await resumeTracks(active,['a']);assert.equal(a.audio.currentTime,23);assert.equal(a.audio.src,'blob:same-source');assert.equal(b.audio.paused,false);
});
