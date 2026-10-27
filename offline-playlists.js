import {offlineAudio} from './offline-audio.js?v=45';
const POINTER='harmony-offline-owner',DOCUMENT='@playlists';
const clone=value=>JSON.parse(JSON.stringify(value));
// A local device session is intentionally separate from server authorization.
// It never grants access to network resources or administrator operations.
export function createOfflinePlaylists({audio=offlineAudio,storage=globalThis.localStorage}={}){
 let serial=Promise.resolve(),generation=0;
 const owner=()=>{try{const id=storage.getItem(POINTER)||null,session=JSON.parse(storage.getItem('soundbar-supabase-session')||'null');return session?.user?.id&&session.user.id!==id?null:id}catch{return null}};
 const sorted=data=>{const order=new Map((data.order||[]).map((id,i)=>[id,i]));return [...data.boards].sort((a,b)=>(order.get(a.playlist.id)??a.playlist.position??1e9)-(order.get(b.playlist.id)??b.playlist.position??1e9))};
 const enqueue=fn=>{const next=serial.catch(()=>{}).then(fn);serial=next;return next};
 async function read(id){if(!id)return null;const blob=await audio.load(id,DOCUMENT);if(!blob)return null;try{const data=JSON.parse(await blob.text());return data.version===1&&data.me?.profile.id===id&&data.me.access?.status==='approved'&&Array.isArray(data.boards)?data:null}catch{return null}}
 async function write(id,data){await audio.save(id,DOCUMENT,new Blob([JSON.stringify(data)],{type:'application/json'}))}
 function account(me){return{profile:clone(me.profile),workspace:clone(me.workspace),access:{status:'approved',is_admin:false},limits:clone(me.limits||{})}}
 function cleanBoard(board,id){if(board.playlist.user_id&&board.playlist.user_id!==id||board.tracks.some(t=>t.user_id&&t.user_id!==id))throw Error('Playlist de outra conta.');const b=clone(board);for(const t of b.tracks){delete t.url;delete t.signedUrl}return b}
 async function complete(id,board){for(const t of board.tracks)if(!await audio.has(id,t.id))return false;return true}
 return{
 owner,
 async restore(){const id=owner(),data=await read(id);if(!data||owner()!==id)return null;const boards=[];for(const b of sorted(data))if(await complete(id,b))boards.push(b);return{...data,boards}},
 async boards(id){const data=await read(id),boards=data?sorted(data):[],available=[];for(const b of boards)if(await complete(id,b))available.push(b);return available},
 async save(me,board){const epoch=generation;return enqueue(async()=>{const id=me.profile.id;if(me.access.status!=='approved')throw Error('Entre novamente para baixar a playlist.');const b=cleanBoard(board,id);if(!await complete(id,b))throw Error('Ainda faltam áudios para concluir o download.');const data=await read(id)||{version:1,boards:[]};data.me=account(me);data.boards=data.boards.filter(x=>x.playlist.id!==b.playlist.id);data.boards.push(b);await write(id,data);if(generation!==epoch)throw Error('Sessão alterada.');storage.setItem(POINTER,id);return b})},
 async setOrder(id,playlists){return enqueue(async()=>{const data=await read(id);if(!data)return;data.order=playlists.map(p=>p.id);const positions=new Map(data.order.map((id,i)=>[id,i]));for(const b of data.boards)if(positions.has(b.playlist.id))b.playlist.position=positions.get(b.playlist.id);await write(id,data)})},
 async sync(me,board){return enqueue(async()=>{const id=me.profile.id,data=await read(id);if(!data?.boards.some(b=>b.playlist.id===board.playlist.id)||!await complete(id,board))return false;data.me=account(me);data.boards=data.boards.map(b=>b.playlist.id===board.playlist.id?cleanBoard(board,id):b);await write(id,data);return true})},
 async remove(id,playlistId){return enqueue(async()=>{const data=await read(id);if(!data)return;const removed=data.boards.find(b=>b.playlist.id===playlistId);data.boards=data.boards.filter(b=>b.playlist.id!==playlistId);await write(id,data);const keep=new Set(data.boards.flatMap(b=>b.tracks.map(t=>t.id)));for(const t of removed?.tracks||[])if(!keep.has(t.id))await audio.remove(id,t.id)})},
 async clear(id=owner()){generation++;if(!id)return;if(storage.getItem(POINTER)===id)storage.removeItem(POINTER);return enqueue(async()=>{if(storage.getItem(POINTER)===id)storage.removeItem(POINTER);await audio.clear(id)})},
 forget(){generation++;try{storage.removeItem(POINTER)}catch{}},
 async call(path,options={}){if(options.method&&options.method!=='GET')throw Error('Conecte-se à internet para fazer alterações.');const data=await this.restore();if(!data)throw Error('Nenhuma playlist baixada disponível. Conecte-se para baixar suas playlists.');if(path==='/me')return data.me;if(path==='/access')return data.me.access;if(path==='/samples')return[];if(path==='/overview')return{playlists:data.boards.map(b=>({...b.playlist,tracks_count:b.tracks.length})),tracks:data.boards.reduce((n,b)=>n+b.tracks.length,0),bytes:data.boards.flatMap(b=>b.tracks).reduce((n,t)=>n+(Number(t.file_size)||0),0),limit:data.me.limits.storage||1073741824};const match=/^\/playlists\/([^/]+)$/.exec(path);if(match){const b=data.boards.find(b=>b.playlist.id===decodeURIComponent(match[1]));if(b)return b;throw Error('Esta playlist ainda não foi baixada. Conecte-se para salvá-la.')}throw Error('Esta área precisa de conexão com a internet.')}
 };
}
export const offlinePlaylists=createOfflinePlaylists();
export function isConnectionError(error){return ![400,401,403,404].includes(Number(error?.status))&&([502,503,504].includes(Number(error?.status))||error?.name==='AuthRetryableFetchError'||error instanceof TypeError||/fetch|network|offline|connection|conexão|Failed to load/i.test(error?.message||''))}
