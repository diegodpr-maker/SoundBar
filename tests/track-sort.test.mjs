import {test} from 'node:test';import assert from 'node:assert/strict';
import {moveTrackIds,nearestTrackId,attachTrackSort,DRAG_HOLD_MS} from '../track-sort.js';
test('move within grid in both directions without losing tracks',()=>{const ids=['a','b','c'];assert.deepEqual(moveTrackIds(ids,'a','c'),['b','c','a']);assert.deepEqual(moveTrackIds(ids,'c','a'),['c','a','b']);assert.deepEqual(ids,['a','b','c']);assert.deepEqual(moveTrackIds(ids,'missing','a'),ids)});
const rect=(left,top,width=120,height=160)=>({left,top,right:left+width,bottom:top+height,width,height});
test('gaps and row gutters resolve to the nearest card without an exact DOM hit',()=>{
 const items=[{id:'a',rect:rect(0,60)},{id:'b',rect:rect(140,60)},{id:'c',rect:rect(0,240)},{id:'d',rect:rect(140,240)}];
 assert.equal(nearestTrackId(items,134,100),'b');assert.equal(nearestTrackId(items,20,235),'c');assert.equal(nearestTrackId(items,270,350),'d');assert.equal(nearestTrackId([],0,0),null);
});
function setup({columns=2}={}){
 const listeners={},windowEvents={},docEvents={},ghosts=[],frames=new Map();let captured=false,now=0,nextTimer=0;const timers=new Map();
 const advance=ms=>{const until=now+ms;for(;;){const due=[...timers].filter(([,t])=>t.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].callback()}now=until};
 const classes=()=>{const s=new Set();return{add:x=>s.add(x),remove:x=>s.delete(x),has:x=>s.has(x)}};
 const win={setTimeout:(callback,ms)=>{const id=++nextTimer;timers.set(id,{callback,at:now+ms});return id},clearTimeout:id=>timers.delete(id),scrollX:0,scrollY:0,innerHeight:900,matchMedia:()=>({matches:false}),addEventListener:(n,f)=>windowEvents[n]=f,requestAnimationFrame:f=>{frames.set(1,f);return 1},cancelAnimationFrame:id=>frames.delete(id),scrollBy(){}};
 const doc={defaultView:win,body:{append:g=>ghosts.push(g)},addEventListener:(n,f)=>docEvents[n]=f};
 const grid={classList:classes(),querySelectorAll:()=>cards,getBoundingClientRect:()=>rect(0,60,280,400)};
 const card=id=>({dataset:{trackId:id},style:{order:''},classList:classes(),parentElement:grid,isConnected:true,getBoundingClientRect(){const order=this.style.order===''?(id==='a'?0:1):Number(this.style.order);return rect(order%columns*140,60+Math.floor(order/columns)*180)},cloneNode(){const g={style:{},classList:classes(),removeAttribute(){},setAttribute(){},querySelectorAll:()=>[],remove(){ghosts.splice(ghosts.indexOf(g),1)}};return g}});
 const cards=[card('a'),card('b')],a=cards[0],handle={attrs:{},closest:s=>s==='.pad-drag'?handle:a,setAttribute(n,v){this.attrs[n]=v},setPointerCapture(){captured=true},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false}};
 const root={ownerDocument:doc,addEventListener:(n,f)=>listeners[n]=f};
 const commits=[];attachTrackSort(root,{getIds:()=>['a','b'],onCommit:ids=>commits.push(ids)});
 const event=(extra={})=>({target:handle,isPrimary:true,button:0,pointerId:1,clientX:0,clientY:100,preventDefault(){},stopPropagation(){},...extra});
 return{listeners,windowEvents,docEvents,commits,event,handle,ghosts,cards,frames,advance,hold(){listeners.pointerdown(event());advance(DRAG_HOLD_MS)}};
}
test('drag previews order and ghost before committing once on release; cancellation restores it',()=>{
 const {hold,listeners:l,commits,event,ghosts,cards}=setup();hold();assert.equal(ghosts.length,1);
 l.pointermove(event({clientX:150}));assert.equal(ghosts.length,1);assert.deepEqual(cards.map(c=>c.style.order),['1','0']);assert.equal(commits.length,0);
 l.pointerup(event({clientX:150}));assert.deepEqual(commits,[['b','a']]);assert.equal(ghosts.length,0);assert.deepEqual(cards.map(c=>c.style.order),['','']);
 hold();l.pointermove(event({clientX:150}));l.pointercancel(event());assert.equal(ghosts.length,0);assert.deepEqual(cards.map(c=>c.style.order),['','']);assert.equal(commits.length,1);
});
test('play/edit/delete areas do not initiate dragging',()=>{const {hold,listeners:l,commits,event,ghosts}=setup();l.pointerdown(event({target:{closest:()=>null}}));l.pointermove(event({clientX:100}));l.pointerup(event());assert.equal(commits.length,0);assert.equal(ghosts.length,0)});
test('keyboard reorder is available on the handle',()=>{const {hold,listeners:l,commits,event}=setup();l.keydown(event({key:'ArrowRight'}));assert.deepEqual(commits,[['b','a']])});
test('slow movement accumulates, and dropping in the gutter is accepted',()=>{
 const {hold,listeners:l,commits,event}=setup({columns:1});hold();for(let y=103;y<=205;y+=3)l.pointermove(event({clientY:y}));
 // The ghost center is y=245, just below the gap; raw pointer is still over the first row.
 l.pointerup(event({clientY:205}));assert.deepEqual(commits,[['b','a']]);
});
test('dropping far outside the grid cancels; another pointer cannot cancel the drag',()=>{
 const {hold,listeners:l,commits,event,ghosts}=setup();hold();l.pointermove(event({clientX:150}));l.pointercancel(event({pointerId:2}));assert.equal(ghosts.length,1);
 l.pointerup(event({clientX:800}));assert.equal(commits.length,0);assert.equal(ghosts.length,0);
});
test('blur and detached source clean up floating UI without saving',()=>{
 const {hold,listeners:l,windowEvents,commits,event,ghosts,cards,frames}=setup();hold();l.pointermove(event({clientX:150}));windowEvents.blur();assert.equal(ghosts.length,0);
 hold();l.pointermove(event({clientX:150}));cards[0].isConnected=false;frames.get(1)();assert.equal(ghosts.length,0);assert.equal(commits.length,0);
});
test('drag-handle click is swallowed without interfering with other card buttons',()=>{const {hold,listeners:l,event}=setup();let stopped=0;l.click(event({stopImmediatePropagation(){stopped++}}));assert.equal(stopped,1);l.click(event({target:{closest:()=>null},stopImmediatePropagation(){stopped++}}));assert.equal(stopped,1)});


test('activation requires 500 ms held continuously, with no ghost or reordering before then',()=>{
 const {listeners:l,event,advance,ghosts,cards,handle,commits}=setup();
 l.pointerdown(event());advance(DRAG_HOLD_MS-1);
 assert.equal(ghosts.length,0);assert.equal(cards[0].classList.has('sorting'),false);assert.equal(handle.attrs['aria-pressed'],'false');
 l.pointermove(event({clientX:4,clientY:103}));advance(1);
 assert.equal(ghosts.length,1);assert.equal(handle.attrs['aria-pressed'],'true');assert.equal(commits.length,0);
 l.pointerup(event({clientX:4,clientY:103}));assert.equal(ghosts.length,0);assert.equal(commits.length,0);
});
test('quick taps and swipes before the hold cannot activate later or save an order',()=>{
 const {listeners:l,event,advance,ghosts,cards,commits}=setup();
 l.pointerdown(event());advance(150);l.pointerup(event());advance(1000);assert.equal(ghosts.length,0);
 l.pointerdown(event());advance(200);l.pointermove(event({clientX:150}));advance(1000);l.pointerup(event({clientX:150}));
 assert.equal(ghosts.length,0);assert.equal(commits.length,0);assert.deepEqual(cards.map(c=>c.style.order),['','']);
});
test('cancelling a pending hold, losing focus or removing the card also cancels the timer',()=>{
 for(const mode of ['cancel','blur','removed','escape']){
  const {listeners:l,windowEvents,event,advance,ghosts,cards,commits}=setup();l.pointerdown(event());advance(200);
  if(mode==='cancel')l.pointercancel(event());if(mode==='blur')windowEvents.blur();if(mode==='removed')cards[0].isConnected=false;
  if(mode==='escape')windowEvents.keydown(event({key:'Escape'}));
  advance(1000);assert.equal(ghosts.length,0,mode);assert.equal(commits.length,0,mode);
 }
});
test('native long-press menu is suppressed only on the reorder handle',()=>{
 const {listeners:l,event}=setup();let prevented=0;
 l.contextmenu(event({preventDefault(){prevented++}}));
 l.contextmenu(event({target:{closest:()=>null},preventDefault(){prevented++}}));assert.equal(prevented,1);
});
