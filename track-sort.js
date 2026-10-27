export function moveTrackIds(ids,source,target){const result=[...ids],from=result.indexOf(source),to=result.indexOf(target);if(from<0||to<0||from===to)return result;result.splice(to,0,...result.splice(from,1));return result}
export const DRAG_HOLD_MS=500;
const HOLD_SLOP=10;

// Gaps belong to the nearest card too; no need to hit a button or card.
export function nearestTrackId(items,x,y){
 let nearest=null,distance=Infinity;
 for(const {id,rect} of items){
  const dx=Math.max(rect.left-x,0,x-rect.right),dy=Math.max(rect.top-y,0,y-rect.bottom);
  const score=dx*dx+dy*dy+0.001*((x-(rect.left+rect.right)/2)**2+(y-(rect.top+rect.bottom)/2)**2);
  if(score<distance){distance=score;nearest=id}
 }
 return nearest;
}

export function attachTrackSort(root,{onCommit,isDisabled=()=>false,getIds}){
 const doc=root.ownerDocument,win=doc.defaultView;
 let drag=null,frame=0;
 const measure=()=>{
  drag.slots=drag.cards.map(card=>({id:card.dataset.trackId,rect:card.getBoundingClientRect()}));
  drag.scrollX=win.scrollX;drag.scrollY=win.scrollY;
 };
 const clear=()=>{
  if(!drag)return;
  const old=drag;drag=null;
  win.cancelAnimationFrame(frame);
  win.clearTimeout(old.holdTimer);
  old.animations.forEach(a=>a.cancel());
  for(const card of old.cards)card.style.order=old.orders.get(card);
  old.source.classList.remove('sorting');old.grid.classList.remove('sort-active');
  old.ghost?.remove();old.handle.setAttribute('aria-pressed','false');
  if(old.handle.hasPointerCapture?.(old.pointer))old.handle.releasePointerCapture(old.pointer);
 };
 function preview(ids){
  const before=new Map(drag.cards.map(card=>[card,card.getBoundingClientRect()]));
  drag.animations.forEach(a=>a.cancel());drag.animations=[];
  for(const card of drag.cards)card.style.order=String(ids.indexOf(card.dataset.trackId));
  drag.ids=ids;measure();
  if(win.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(const card of drag.cards){
   const old=before.get(card),now=card.getBoundingClientRect();
   if(card===drag.source||!card.animate||Math.hypot(old.left-now.left,old.top-now.top)<1)continue;
   drag.animations.push(card.animate([{transform:`translate(${old.left-now.left}px,${old.top-now.top}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'ease-out'}));
  }
 }
 function start(){
  const ghost=drag.source.cloneNode(true);
  ghost.removeAttribute('id');ghost.removeAttribute('data-track-id');
  for(const node of ghost.querySelectorAll('[id]'))node.removeAttribute('id');
  ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  ghost.classList.remove('sorting');ghost.classList.add('drag-ghost');
  ghost.style.width=drag.rect.width+'px';ghost.style.height=drag.rect.height+'px';
  ghost.style.order='';doc.body.append(ghost);drag.ghost=ghost;
  drag.source.classList.add('sorting');drag.grid.classList.add('sort-active');measure();
 }
 function update(){
  if(!drag?.active)return;
  const left=drag.x-drag.offsetX,top=drag.y-drag.offsetY;
  drag.ghost.style.transform=`translate3d(${left}px,${top}px,0) rotate(-1deg) scale(1.025)`;
  const x=left+drag.rect.width/2,y=top+drag.rect.height/2;
  const grid=drag.grid.getBoundingClientRect(),margin=64;
  drag.inside=x>=grid.left-margin&&x<=grid.right+margin&&y>=grid.top-margin&&y<=grid.bottom+margin;
  if(!drag.inside)return;
  // Ignore visual animation when choosing a destination, so targets stay stable.
  const dx=win.scrollX-drag.scrollX,dy=win.scrollY-drag.scrollY;
  const target=nearestTrackId(drag.slots,x+dx,y+dy);
  if(target&&target!==drag.source.dataset.trackId){
   const ids=moveTrackIds(drag.ids,drag.source.dataset.trackId,target);
   if(ids.some((id,i)=>id!==drag.ids[i]))preview(ids);
  }
 }
 function tick(){
  if(!drag)return;
  if(!drag.source.isConnected||isDisabled()){clear();return}
  if(drag.active){
   const edge=80,h=win.innerHeight;
   const speed=drag.y<edge?-18*Math.min(1,(edge-drag.y)/edge):drag.y>h-edge?18*Math.min(1,(drag.y-h+edge)/edge):0;
   if(drag.moved&&speed)win.scrollBy(0,speed);
   update();
  }
  frame=win.requestAnimationFrame(tick);
 }
 root.addEventListener('pointerdown',e=>{
  const handle=e.target.closest('.pad-drag');
  if(drag||!handle||isDisabled()||e.button!==0||!e.isPrimary)return;
  const source=handle.closest('[data-track-id]');if(!source)return;
  const grid=source.parentElement,cards=[...grid.querySelectorAll('[data-track-id]')],ids=getIds();
  if(cards.length!==ids.length||cards.some(card=>!ids.includes(card.dataset.trackId)))return;
  e.preventDefault();const rect=source.getBoundingClientRect();
  drag={handle,source,grid,cards,rect,pointer:e.pointerId,original:[...ids],ids:[...ids],orders:new Map(cards.map(card=>[card,card.style.order])),animations:[],x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,active:false,moved:false,inside:true};
  handle.setPointerCapture(e.pointerId);handle.setAttribute('aria-pressed','false');
  const pending=drag;
  drag.holdTimer=win.setTimeout(()=>{
   if(drag!==pending)return;
   if(!source.isConnected||isDisabled()||doc.hidden){clear();return}
   drag.active=true;drag.rect=source.getBoundingClientRect();
   drag.startX=drag.x;drag.startY=drag.y;
   drag.offsetX=drag.x-drag.rect.left;drag.offsetY=drag.y-drag.rect.top;
   handle.setAttribute('aria-pressed','true');
   start();update();
  },DRAG_HOLD_MS);
  frame=win.requestAnimationFrame(tick);
 });
 function move(e){
  if(!drag||e.pointerId!==drag.pointer)return;
  e.preventDefault();drag.x=e.clientX;drag.y=e.clientY;
  const distance=Math.hypot(drag.x-drag.startX,drag.y-drag.startY);
  if(!drag.active){if(distance>HOLD_SLOP)clear();return}
  if(distance>8)drag.moved=true;
  update();
 }
 root.addEventListener('pointermove',move);
 root.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  if(!drag.source.isConnected||isDisabled()){clear();return}
  if(!drag.active){clear();return}
  move(e);const ids=[...drag.ids],from=drag.source.dataset.trackId;
  const changed=drag.moved&&drag.inside&&ids.some((id,i)=>id!==drag.original[i]);
  clear();if(changed)onCommit(ids,from);
 });
 const cancelPointer=e=>{if(drag&&e.pointerId===drag.pointer)clear()};
 root.addEventListener('pointercancel',cancelPointer);root.addEventListener('lostpointercapture',cancelPointer);
 root.addEventListener('click',e=>{if(e.target.closest('.pad-drag')){e.preventDefault();e.stopImmediatePropagation()}},true);
 root.addEventListener('contextmenu',e=>{if(e.target.closest('.pad-drag'))e.preventDefault()});
 root.addEventListener('keydown',e=>{
  const handle=e.target.closest('.pad-drag');if(!handle||isDisabled()||drag)return;
  const delta={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key];if(!delta)return;
  e.preventDefault();const ids=getIds(),id=handle.closest('[data-track-id]').dataset.trackId,to=ids.indexOf(id)+delta;
  if(to>=0&&to<ids.length)onCommit(moveTrackIds(ids,id,ids[to]),id);
 });
 win.addEventListener('blur',clear);win.addEventListener('resize',clear);
 win.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();e.stopPropagation();clear()}},true);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)clear()});
 return clear;
}
