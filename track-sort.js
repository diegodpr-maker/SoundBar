export function moveTrackIds(ids,source,target){const result=[...ids],from=result.indexOf(source),to=result.indexOf(target);if(from<0||to<0||from===to)return result;result.splice(to,0,...result.splice(from,1));return result}
// Pointer events work with mouse, pen and Android touch. Only the handle captures gestures.
export function attachTrackSort(root,{onCommit,isDisabled=()=>false,getIds}){
 let drag=null,frame=0;
 const clear=()=>{if(!drag)return;cancelAnimationFrame(frame);drag.source.classList.remove('sorting');drag.target?.classList.remove('sort-target');drag.handle.setAttribute('aria-pressed','false');const old=drag;drag=null;if(old.handle.hasPointerCapture?.(old.pointer))old.handle.releasePointerCapture(old.pointer)};
 root.addEventListener('pointerdown',e=>{const handle=e.target.closest('.pad-drag');if(!handle||isDisabled()||e.button!==0||!e.isPrimary)return;const source=handle.closest('[data-track-id]');if(!source)return;e.preventDefault();drag={handle,source,pointer:e.pointerId,target:null,x:e.clientX,startY:e.clientY,y:e.clientY,moved:false};handle.setPointerCapture(e.pointerId);handle.setAttribute('aria-pressed','true');source.classList.add('sorting');
 const scroll=()=>{if(!drag)return;const speed=drag.y<70?-14:drag.y>innerHeight-70?14:0;if(speed)window.scrollBy(0,speed);frame=requestAnimationFrame(scroll)};frame=requestAnimationFrame(scroll)});
 root.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.startY)>8)drag.moved=true;drag.y=e.clientY;drag.target?.classList.remove('sort-target');const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-track-id]');drag.target=hit&&root.contains(hit)&&hit!==drag.source?hit:null;drag.target?.classList.add('sort-target')});
 root.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointer)return;e.preventDefault();const from=drag.source.dataset.trackId,to=drag.target?.dataset.trackId,moved=drag.moved;clear();if(moved&&to)onCommit(moveTrackIds(getIds(),from,to))});
 root.addEventListener('pointercancel',clear);root.addEventListener('lostpointercapture',clear);
 root.addEventListener('click',e=>{if(e.target.closest('.pad-drag')){e.preventDefault();e.stopImmediatePropagation()}},true);
 root.addEventListener('keydown',e=>{const handle=e.target.closest('.pad-drag');if(!handle||isDisabled())return;const delta={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[e.key];if(!delta)return;e.preventDefault();const ids=getIds(),id=handle.closest('[data-track-id]').dataset.trackId,to=ids.indexOf(id)+delta;if(to>=0&&to<ids.length)onCommit(moveTrackIds(ids,id,ids[to]),id)});
 return clear;
}
