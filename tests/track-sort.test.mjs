import {test} from 'node:test';import assert from 'node:assert/strict';
import {moveTrackIds,nearestTrackId,attachTrackSort} from '../track-sort.js';
test('move within grid in both directions without losing tracks',()=>{const ids=['a','b','c'];assert.deepEqual(moveTrackIds(ids,'a','c'),['b','c','a']);assert.deepEqual(moveTrackIds(ids,'c','a'),['c','a','b']);assert.deepEqual(ids,['a','b','c']);assert.deepEqual(moveTrackIds(ids,'missing','a'),ids)});
const rect=(left,top,width=120,height=160)=>({left,top,right:left+width,bottom:top+height,width,height});
test('gaps and row gutters resolve to the nearest card without an exact DOM hit',()=>{
 const items=[{id:'a',rect:rect(0,60)},{id:'b',rect:rect(140,60)},{id:'c',rect:rect(0,240)},{id:'d',rect:rect(140,240)}];
 assert.equal(nearestTrackId(items,134,100),'b');assert.equal(nearestTrackId(items,20,235),'c');assert.equal(nearestTrackId(items,270,350),'d');assert.equal(nearestTrackId([],0,0),null);
});
function setup({columns=2}={}){
 const listeners={},windowEvents={},docEvents={},ghosts=[],frames=new Map();let captured=false;
 const classes=()=>{const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),has:x=>s.has(x)}};
 const win={scrollX:0,scrollY:0,innerHeight:900,matchMedia:()=>({matches:false}),addEventListener:(n,f)=>windowEvents[n]=f,requestAnimationFrame:f=>{frames.set(1,f);return 1},cancelAnimationFrame:id=>frames.delete(id),scrollBy(){}};
 const doc={defaultView:win,body:{append:g=>ghosts.push(g)},addEventListener:(n,f)=>docEvents[n]=f};
 const grid={classList:classes(),querySelectorAll:()=>cards,getBoundingClientRect:()=>rect(0,60,280,400)};
 const card=id=>({dataset:{trackId:id},style:{order:''},classList:classes(),parentElement:grid,isConnected:true,getBoundingClientRect(){const order=this.style.order===''?(id==='a'?0:1):Number(this.style.order);return rect(order%columns*140,60+Math.floor(order/columns)*180)},cloneNode(){const g={style:{},classList:classes(),removeAttribute(){},setAttribute(){},querySelectorAll:()=>[],remove(){ghosts.splice(ghosts.indexOf(g),1)}};return g}});
 const cards=[card('a'),card('b')],a=cards[0],handle={closest:s=>s==='.pad-drag'?handle:a,setAttribute(){},setPointerCapture(){captured=true},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false}};
 const root={ownerDocument:doc,addEventListener:(n,f)=>listeners[n]=f};
 const commits=[];attachTrackSort(root,{getIds:()=>['a','b'],onCommit:ids=>commits.push(ids)});
 const event=(extra={})=>({target:handle,isPrimary:true,button:0,pointerId:1,clientX:0,clientY:100,preventDefault(){},stopPropagation(){},...extra});
 return{listeners,windowEvents,docEvents,commits,event,handle,ghosts,cards,frames};
}
test('drag previews order and ghost before committing once on release; cancellation restores it',()=>{
 const {listeners:l,commits,event,ghosts,cards}=setup();l.pointerdown(event());assert.equal(ghosts.length,0);
 l.pointermove(event({clientX:150}));assert.equal(ghosts.length,1);assert.deepEqual(cards.map(c=>c.style.order),['1','0']);assert.equal(commits.length,0);
 l.pointerup(event({clientX:150}));assert.deepEqual(commits,[['b','a']]);assert.equal(ghosts.length,0);assert.deepEqual(cards.map(c=>c.style.order),['','']);
 l.pointerdown(event());l.pointermove(event({clientX:150}));l.pointercancel(event());assert.equal(ghosts.length,0);assert.deepEqual(cards.map(c=>c.style.order),['','']);assert.equal(commits.length,1);
});
test('play/edit/delete areas do not initiate dragging',()=>{const {listeners:l,commits,event,ghosts}=setup();l.pointerdown(event({target:{closest:()=>null}}));l.pointermove(event({clientX:100}));l.pointerup(event());assert.equal(commits.length,0);assert.equal(ghosts.length,0)});
test('keyboard reorder is available on the handle',()=>{const {listeners:l,commits,event}=setup();l.keydown(event({key:'ArrowRight'}));assert.deepEqual(commits,[['b','a']])});
test('slow movement accumulates, and dropping in the gutter is accepted',()=>{
 const {listeners:l,commits,event}=setup({columns:1});l.pointerdown(event());for(let y=103;y<=205;y+=3)l.pointermove(event({clientY:y}));
 // The ghost center is y=245, just below the gap; raw pointer is still over the first row.
 l.pointerup(event({clientY:205}));assert.deepEqual(commits,[['b','a']]);
});
test('dropping far outside the grid cancels; another pointer cannot cancel the drag',()=>{
 const {listeners:l,commits,event,ghosts}=setup();l.pointerdown(event());l.pointermove(event({clientX:150}));l.pointercancel(event({pointerId:2}));assert.equal(ghosts.length,1);
 l.pointerup(event({clientX:800}));assert.equal(commits.length,0);assert.equal(ghosts.length,0);
});
test('blur and detached source clean up floating UI without saving',()=>{
 const {listeners:l,windowEvents,commits,event,ghosts,cards,frames}=setup();l.pointerdown(event());l.pointermove(event({clientX:150}));windowEvents.blur();assert.equal(ghosts.length,0);
 l.pointerdown(event());l.pointermove(event({clientX:150}));cards[0].isConnected=false;frames.get(1)();assert.equal(ghosts.length,0);assert.equal(commits.length,0);
});
test('drag-handle click is swallowed without interfering with other card buttons',()=>{const {listeners:l,event}=setup();let stopped=0;l.click(event({stopImmediatePropagation(){stopped++}}));assert.equal(stopped,1);l.click(event({target:{closest:()=>null},stopImmediatePropagation(){stopped++}}));assert.equal(stopped,1)});
