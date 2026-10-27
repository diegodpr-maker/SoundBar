import {test} from 'node:test';import assert from 'node:assert/strict';import {createEventFader} from '../event-fader.js';
function setup(){let time=0;const active=new Map(),jobs=new Set(),stopped=[];const levels={set:(item,value)=>item.fadeLevel=value,progress:(item,value)=>item.fadeLevel=value,ramp(){}};
 const fader=createEventFader({active,levels,now:()=>time,schedule:fn=>{jobs.add(fn);return fn},cancel:fn=>jobs.delete(fn),stop:id=>{stopped.push(id);active.get(id)?.audio.pause();active.delete(id)}});
 const select=(id,ready=true)=>{const fadeLevel=fader.prepare(id),audio={paused:!ready,ended:false,currentTime:12,pause(){this.paused=true}};const item={audio,fadeLevel,playing:ready};active.set(id,item);if(ready)fader.started(id);assert.ok(active.size<=2);return item};
 const tick=ms=>{time+=ms;for(const fn of [...jobs])fn()};return{fader,active,stopped,select,tick,jobs};
}
test('crossfade starts when the new audio plays, then fades out and removes only the previous track',()=>{
 const s=setup(),a=s.select('a'),b=s.select('b',false);s.tick(10000);assert.equal(a.fadeLevel,1);assert.equal(b.fadeLevel,0);
 b.playing=true;b.audio.paused=false;s.fader.started('b');s.tick(500);assert.equal(a.fadeLevel,.75);assert.equal(b.fadeLevel,.25);s.tick(1500);
 assert.deepEqual([...s.active.keys()],['b']);assert.equal(b.fadeLevel,1);assert.deepEqual(s.stopped,['a']);assert.equal(s.jobs.size,0);
});
test('rapid third and superseded pending selections never retain or start a third track',()=>{
 const s=setup(),a=s.select('a');s.select('b');s.tick(500);s.select('c',false);assert.equal(s.active.has('b'),false);assert.equal(s.active.has('a'),true);assert.equal(a.fadeLevel,.75);
 s.select('d',false);assert.equal(s.active.has('c'),false);s.fader.started('c');assert.equal(s.fader.state().incoming,'d');assert.equal(s.fader.state().started,false);
 s.active.get('d').playing=true;s.active.get('d').audio.paused=false;s.fader.started('d');s.tick(2500);assert.deepEqual([...s.active.keys()],['d']);
});
test('pause freezes the gains and remaining duration; resume preserves position and finishes the same transition',()=>{
 const s=setup(),a=s.select('a'),b=s.select('b');s.tick(750);s.fader.pause();const gains=[a.fadeLevel,b.fadeLevel];s.tick(20000);assert.deepEqual([a.fadeLevel,b.fadeLevel],gains);assert.equal(s.active.size,2);
 s.fader.resume();s.tick(1249);assert.equal(s.active.size,2);s.tick(1);assert.deepEqual([...s.active.keys()],['b']);assert.equal(b.audio.currentTime,12);
});
test('failed or stopped incoming audio restores its predecessor and cancels the scheduled fade',()=>{
 const s=setup(),a=s.select('a');s.select('b');s.tick(1000);s.fader.removing('b');s.active.delete('b');assert.equal(a.fadeLevel,1);s.tick(5000);assert.deepEqual([...s.active.keys()],['a']);assert.equal(s.fader.state(),null);
});
test('stop-all cancels future callbacks, while exiting settles the predominant track at full gain',()=>{
 const s=setup();s.select('a');s.select('b');s.tick(1600);s.fader.settle();assert.deepEqual([...s.active.keys()],['b']);assert.equal(s.active.get('b').fadeLevel,1);
 s.select('c');s.fader.reset();s.active.clear();s.tick(5000);assert.equal(s.active.size,0);assert.equal(s.jobs.size,0);
});
test('configured duration is used, invalid values are ignored, and late background timers complete safely',()=>{
 const s=setup();s.fader.setDuration(5000);s.fader.setDuration(-1);s.select('a');s.select('b');s.tick(2500);assert.equal(s.active.get('a').fadeLevel,.5);s.tick(100000);assert.deepEqual([...s.active.keys()],['b']);
});
test('a new selection after a paused or loading-only group starts directly without a silent fade',()=>{
 const s=setup(),a=s.select('a');s.fader.pause();a.playing=false;a.audio.paused=true;const b=s.select('b');assert.deepEqual([...s.active.keys()],['b']);assert.equal(b.fadeLevel,1);assert.equal(s.fader.state(),null);
});


test('a stalled incoming track freezes the transition instead of fading the predecessor into silence',()=>{const s=setup(),a=s.select('a'),b=s.select('b');s.tick(500);s.fader.buffering('b');s.tick(10000);assert.equal(a.fadeLevel,.75);assert.equal(b.fadeLevel,.25);s.fader.started('b');s.tick(1500);assert.deepEqual([...s.active.keys()],['b'])});

test('card pause fades to zero without removing the source or position, then resumes gradually',()=>{
 const s=setup(),a=s.select('a');a.audio.src='blob:original';s.fader.pauseCard('a');s.tick(1000);assert.equal(a.fadeLevel,.5);assert.equal(a.audio.paused,false);s.tick(1000);
 assert.equal(a.audio.paused,true);assert.equal(a.audio.currentTime,12);assert.equal(a.audio.src,'blob:original');assert.equal(s.active.get('a'),a);assert.equal(a.fadeLevel,0);
 s.fader.resumeCard('a');a.audio.paused=false;a.playing=true;s.tick(1000);assert.equal(a.fadeLevel,.5);s.tick(1000);assert.equal(a.fadeLevel,1);assert.equal(a.audio.currentTime,12);
});
test('another card during fade-out uses the configured two-track crossfade; a paused old card is reset',()=>{
 const s=setup(),a=s.select('a');s.fader.pauseCard('a');s.tick(500);const b=s.select('b');assert.equal(s.active.size,2);assert.equal(a.fadeLevel,.75);s.tick(2000);assert.deepEqual([...s.active.keys()],['b']);assert.equal(b.fadeLevel,1);
});
test('rapid reversal and stop-all cancel old pause callbacks instead of pausing a later playback',()=>{
 const s=setup(),a=s.select('a');s.fader.pauseCard('a');s.tick(750);s.fader.resumeCard('a');s.tick(2000);assert.equal(a.audio.paused,false);assert.equal(a.fadeLevel,1);
 s.fader.pauseCard('a');s.fader.reset();s.tick(10000);assert.equal(a.audio.paused,false);
});
test('pausing a pending card does not auto-start and a failed continuation remains retryable at zero gain',()=>{
 const s=setup(),a=s.select('a',false);s.fader.pauseCard('a');assert.equal(a.pausedByUser,true);assert.equal(a.fadeLevel,0);assert.equal(s.fader.state(),null);
 s.fader.resumeCard('a');s.fader.pauseCard('a',true);s.tick(5000);assert.equal(a.audio.paused,true);assert.equal(a.fadeLevel,0);assert.equal(s.active.get('a'),a);
});


test('leaving event mode finishes a requested card pause and preserves the paused gain on reentry',()=>{const s=setup(),a=s.select('a');s.fader.pauseCard('a');s.tick(500);s.fader.settle();assert.equal(a.audio.paused,true);assert.equal(a.fadeLevel,0);assert.equal(a.audio.currentTime,12);s.fader.settle();assert.equal(a.fadeLevel,0)});
