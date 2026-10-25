import {createResumableUploader} from './resumable-upload.js?v=28';
import {inspectAudio,checkPlayable,verifyStoredAudio} from './audio-validation.js?v=28';
import {createLibraryTransfer,retryRead,uploadStage,transientNetwork} from './upload-transfer.js?v=28';
import {loadCatalog,resolveSample,sampleById,sampleUrl,sampleBlob,saveBlob} from './samples.js?v=28';
const BUCKET='soundbar-audio';export const MAX_FILE=25*1024*1024,MAX_STORAGE=200*1024*1024;
export function validateConfig(config){const {supabaseUrl:url,supabaseKey:key}=config||{};if(!url||!key)throw Error('As contas estão aguardando a conexão com o Supabase. Você pode usar a versão local enquanto isso.');let parsed;try{parsed=new URL(url)}catch{throw Error('URL do Supabase inválida.')}if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.supabase.co')||parsed.pathname!=='/'||parsed.search||parsed.hash)throw Error('Use a URL HTTPS do projeto Supabase.');if(key.startsWith('sb_secret_'))throw Error('A chave secreta não pode ser usada neste site público.');if(!key.startsWith('sb_publishable_')){let role;try{role=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role}catch{}if(role!=='anon')throw Error('Use somente a chave publicável ou anon do Supabase.')}return {url:parsed.origin,key};}
function result(r){if(r.error){const error=r.error;if(['42P01','PGRST205'].includes(error.code))throw Error('O banco ainda precisa ser ativado no Supabase.');if(error.code==='42501')throw Error('Você não tem acesso a este recurso.');throw Object.assign(Error(error.message||'Não foi possível concluir.'),{code:error.code,status:error.status||error.statusCode})}return r.data}
const text=(s,n=80)=>typeof s==='string'?s.trim().slice(0,n):'';
export function createBackend(client){let cachedUser=null;client.auth.onAuthStateChange?.((event)=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED'||event==='SIGNED_IN')cachedUser=null});
 async function user(){if(!cachedUser){const r=await client.auth.getUser();if(r.error||!r.data?.user)throw Object.assign(Error('Entre para acessar seu estúdio.'),{status:401});cachedUser=r.data.user}return cachedUser}
 async function accessState(){await user();return result(await client.rpc('sb_account_state'))}
 async function assertApproved(){const access=await accessState();if(access.status!=='approved')throw Object.assign(Error(access.status==='blocked'?'Sua conta está bloqueada. Fale com o administrador.':'Sua conta aguarda liberação do administrador.'),{status:403,accountStatus:access.status});return access}
 async function register(data){const response=await client.functions.invoke('soundbar-register',{body:data});if(response.error){let message='Não foi possível receber seu cadastro. Tente novamente.';try{message=(await response.error.context.json()).error||message}catch{}throw Error(message)}return response.data}
 async function profile(){const u=await user();let p=result(await client.from('sb_profiles').select('*').eq('id',u.id).maybeSingle());if(!p){const row={id:u.id,display_name:text(u.user_metadata?.display_name)||text(u.email?.split('@')[0])||'Meu perfil'};p=result(await client.from('sb_profiles').upsert(row,{onConflict:'id',ignoreDuplicates:true}).select().maybeSingle());if(!p)p=result(await client.from('sb_profiles').select('*').eq('id',u.id).single())}return {...p,email:u.email}}
 async function playlist(id){const u=await user();return result(await client.from('sb_playlists').select('*').eq('id',id).eq('user_id',u.id).single())}
 async function track(id){const u=await user();return result(await client.from('sb_tracks').select('*').eq('id',id).eq('user_id',u.id).single())}
 async function privateURL(t){return result(await client.storage.from(BUCKET).createSignedUrl(t.audio_path,300)).signedUrl}
 async function prepareAudio(tracks){await assertApproved();const paths=[...new Set(tracks.filter(t=>t.audio_path).map(t=>t.audio_path))];const signed=paths.length?result(await client.storage.from(BUCKET).createSignedUrls(paths,300)):[];const byPath=new Map(signed.filter(s=>s.signedUrl).map(s=>[s.path,s.signedUrl]));return Promise.all(tracks.map(async t=>{if(t.sample_id){const sample=await resolveSample(t.sample_id,client);return{id:t.id,url:sample.url,size:sample.file_size||0}}const url=byPath.get(t.audio_path);if(!url)throw Error('Não foi possível preparar '+t.name);return{id:t.id,url,size:t.file_size||0}}))}
 async function audioURL(id){await assertApproved();const t=await track(id);if(t.sample_id){await resolveSample(t.sample_id,client);return sampleUrl(t.sample_id)}return privateURL(t)}
 async function blobForTrack(id){await assertApproved();const t=await track(id);if(t.sample_id)await resolveSample(t.sample_id,client);return {track:t,blob:t.sample_id?await sampleBlob(t.sample_id):result(await client.storage.from(BUCKET).download(t.audio_path))}}
 async function downloadTrack(id){const {track:t,blob}=await blobForTrack(id);saveBlob(blob,t.filename||(t.sample_id?sampleById(t.sample_id).filename:t.name))}
 async function removeTracks(tracks){const u=await user(),paths=tracks.map(t=>t.audio_path).filter(Boolean);if(paths.length)result(await client.storage.from(BUCKET).remove(paths));if(tracks.length)result(await client.from('sb_tracks').delete().in('id',tracks.map(t=>t.id)).eq('user_id',u.id));}
 const uploadLibrary=createResumableUploader({client,bucket:'soundbar-library'});
 const transferLibrary=createLibraryTransfer({upload:uploadLibrary,uploadTimeout:240000,storage:client.storage.from('soundbar-library'),unwrap:result,find:async id=>result(await client.from('sb_library_tracks').select('*').eq('id',id).maybeSingle()),insert:async row=>result(await client.from('sb_library_tracks').insert(row).select().single())});
 async function call(path,options={}){const method=options.method||'GET',b=options.body||{},url=new URL(path,'https://soundbar.local'),p=url.pathname;
 if(p==='/samples')return loadCatalog(client);
 const u=await user();
 if(p==='/access')return accessState();
 if(p==='/me'){const access=await accessState();const data=access.status==='approved'?await profile():{id:u.id,email:u.email,display_name:text(u.user_metadata?.display_name)||text(u.email?.split('@')[0])||'Meu perfil'};return {profile:data,workspace:{id:u.id,name:data.workspace_name||'Meu estúdio'},access,limits:{file:MAX_FILE,storage:MAX_STORAGE}}}
 const access=await (p==='/admin/library'&&method==='POST'?uploadStage('Verificação da conta',()=>retryRead(()=>assertApproved())):assertApproved());
 if(p==='/contributions')return result(await client.from('sb_library_submissions').select('*').eq('user_id',u.id).order('created_at',{ascending:false}));
 const contribution=/^\/tracks\/([^/]+)\/contribute$/.exec(p);
 if(contribution&&method==='POST'){
 if(b.consent!==true||!/^[-0-9a-f]{36}$/.test(b.id||''))throw Error('Confirme a autorização de compartilhamento.');
 const existing=result(await client.from('sb_library_submissions').select('*').eq('id',b.id).eq('user_id',u.id).maybeSingle());if(existing)return existing;
 const t=await track(contribution[1]);if(!t.audio_path)throw Error('Contribua com um arquivo seu, importado para a playlist.');
 const pending=result(await client.from('sb_library_submissions').select('id').eq('user_id',u.id).eq('source_track_id',t.id).eq('status','pending'));if(pending.length)throw Error('Esta faixa já está aguardando análise.');
 const name=text(b.name,120),author=text(b.author,160),license=text(b.license,120),category=text(b.category,60)||'Comunidade',credit=text(b.credit,600);if(!name||!author||!license)throw Error('Preencha nome, autor e licença.');let source_url=text(b.source_url,2000)||null;if(source_url){const source=new URL(source_url);if(source.protocol!=='https:')throw Error('A origem deve ser um link HTTPS.');}
 const blob=result(await client.storage.from(BUCKET).download(t.audio_path)),filename=text(t.filename,220),ext=filename.split('.').pop().toLowerCase();const {mime}=await inspectAudio(blob,filename);if(typeof Audio!=='undefined')await checkPlayable(new Blob([blob],{type:mime}));
 const path=u.id+'/'+b.id+'.'+ext,storage=client.storage.from('soundbar-submissions');
 const uploaded=await storage.upload(path,await blob.arrayBuffer(),{contentType:mime,upsert:false});if(uploaded.error&&!/already exists|duplicate/i.test(uploaded.error.message))result(uploaded);await verifyStoredAudio(blob,result(await storage.download(path)));
 try{return result(await client.from('sb_library_submissions').insert({id:b.id,user_id:u.id,source_track_id:t.id,name,category,author,credit,license,source_url,consent:true,object_path:path,filename,mime,file_size:blob.size}).select().single());}catch(error){if(!transientNetwork(error))await storage.remove([path]).catch(()=>{});throw error}
 }
 if(p==='/admin/contributions'){
 if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');const rows=result(await client.from('sb_library_submissions').select('*').eq('status','pending').order('created_at'));
 const urls=rows.length?result(await client.storage.from('soundbar-submissions').createSignedUrls(rows.map(r=>r.object_path),300)):[];return rows.map(r=>({...r,preview_url:urls.find(url=>url.path===r.object_path)?.signedUrl||null}));
 }
 const reviewContribution=/^\/admin\/contributions\/([^/]+)$/.exec(p);
 if(reviewContribution&&method==='PATCH'){
 if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');if(!['approved','rejected'].includes(b.status))throw Error('Situação inválida.');
 const submission=result(await client.from('sb_library_submissions').select('*').eq('id',reviewContribution[1]).single());
 if(submission.status!=='pending')return{ok:true,status:submission.status};
 if(b.status==='approved'){
 const already=result(await client.from('sb_library_tracks').select('*').eq('id',submission.id).maybeSingle());
 if(already&&already.object_path!=='custom/'+submission.id+'.'+submission.filename.split('.').pop().toLowerCase())throw Error('O cadastro existente não corresponde à contribuição.');if(!already){const blob=result(await client.storage.from('soundbar-submissions').download(submission.object_path));const transfer=createLibraryTransfer({upload:uploadLibrary,uploadTimeout:240000,storage:client.storage.from('soundbar-library'),unwrap:result,find:async id=>result(await client.from('sb_library_tracks').select('*').eq('id',id).maybeSingle()),insert:async row=>result(await client.from('sb_library_tracks').insert(row).select().single()),makeId:()=>submission.id});
 await transfer(blob,{filename:submission.filename,metadata:{name:text(b.name,120)||submission.name,category:text(b.category,60)||submission.category,author:submission.author,credit:submission.credit,license:submission.license,source_url:submission.source_url}})}
 }
 result(await client.rpc('sb_review_submission',{target_submission:submission.id,new_status:b.status,published_id:b.status==='approved'?submission.id:null}));try{await retryRead(async()=>result(await client.storage.from('soundbar-submissions').remove([submission.object_path])))}catch{}return{ok:true};
 }
 if(p==='/admin/library'){
 if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');
 if(method==='GET')return result(await client.from('sb_library_tracks').select('*').eq('active',true).order('position').order('created_at'));
 if(method==='POST'){
 if(!(b instanceof Blob)||b.size<1||b.size>50*1024*1024)throw Error('Escolha um áudio de até 50 MB.');
 const name=text(url.searchParams.get('name'),120),category=text(url.searchParams.get('category'),60)||'Personalizados',credit=text(url.searchParams.get('credit'),600);if(!name)throw Error('Informe o nome do áudio.');
 let filename;try{filename=decodeURIComponent(options.headers?.['X-File-Name']||'')}catch{filename=''}
 const ext=(filename.match(/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i)||[])[1]?.toLowerCase();if(!ext)throw Error('Formato de áudio não reconhecido.');
 return transferLibrary(b,{filename,metadata:{name,category,credit},onProgress:options.onUploadStage});
 }
 }
 const editLibrary=/^\/admin\/library\/([^/]+)$/.exec(p);if(editLibrary&&method==='PATCH'){if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');const changes={};for(const [key,limit] of Object.entries({name:120,category:60,author:160,credit:600,license:120})){if(Object.hasOwn(b,key)){changes[key]=text(b[key],limit);if(['name','category','author','license'].includes(key)&&!changes[key])throw Error('Preencha '+key+'.')}}if(Object.hasOwn(b,'source_url')){const value=text(b.source_url,2000);if(value){let source;try{source=new URL(value)}catch{throw Error('Informe um link HTTPS válido.')}if(source.protocol!=='https:')throw Error('Informe um link HTTPS válido.')}changes.source_url=value||null}if(!Object.keys(changes).length)throw Error('Informe os dados para editar.');result(await client.from('sb_library_tracks').update(changes).eq('id',editLibrary[1]).eq('active',true).select('id').single());return {ok:true}}
 const retire=/^\/admin\/library\/([^/]+)$/.exec(p);if(retire&&method==='DELETE'){if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');result(await client.from('sb_library_tracks').update({active:false}).eq('id',retire[1]));return {ok:true}}
 if(p==='/admin/accounts'){if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');return result(await client.from('sb_account_access').select('*').order('requested_at',{ascending:false}).limit(200))}
 const review=/^\/admin\/accounts\/([^/]+)$/.exec(p);if(review&&method==='PATCH'){if(!access.is_admin)throw Error('Acesso exclusivo do administrador.');result(await client.rpc('sb_review_account',{target_user:review[1],new_status:b.status}));return {ok:true}}

 if(p==='/profile'&&method==='PATCH'){const {display_name,bio,accent,workspace_name}=b;result(await client.from('sb_profiles').update({display_name:text(display_name),bio:text(bio,300),accent,workspace_name:text(workspace_name)}).eq('id',u.id));return {ok:true}}
 if(p==='/overview'){const playlists=result(await client.from('sb_playlists').select('*,sb_tracks(count)').eq('user_id',u.id).order('updated_at',{ascending:false}));const sizes=result(await client.from('sb_tracks').select('file_size').eq('user_id',u.id));const files=result(await client.storage.from(BUCKET).list(u.id,{limit:1000}));return {playlists:playlists.map(({sb_tracks,...row})=>({...row,tracks_count:sb_tracks?.[0]?.count||0})),tracks:sizes.length,bytes:files.reduce((n,f)=>n+Number(f.metadata?.size||0),0),limit:MAX_STORAGE}}
 if(p==='/playlists'&&method==='POST'){await profile();return result(await client.from('sb_playlists').insert({user_id:u.id,name:text(b.name),description:text(b.description,300),color:b.color||'#78b5ff'}).select().single())}
 const m=/^\/playlists\/([^/]+)(?:\/(tracks|upload|order))?$/.exec(p);
 if(m){const id=m[1],part=m[2],list=await playlist(id);
 if(part==='order'&&method==='PATCH'){if(!Array.isArray(b.track_ids)||b.track_ids.length>1000||new Set(b.track_ids).size!==b.track_ids.length)throw Error('Ordem inválida.');result(await client.rpc('sb_reorder_tracks',{target_playlist:id,track_ids:b.track_ids}));return {ok:true}}
 if(!part&&method==='GET')return {playlist:list,tracks:result(await client.from('sb_tracks').select('*').eq('playlist_id',id).eq('user_id',u.id).order('position').order('created_at'))};
 if(!part&&method==='PATCH'){const {name,description,color,play_mode,loop,retrigger,switch_mode}=b;result(await client.from('sb_playlists').update({name:text(name),description:text(description,300),color,play_mode,loop,retrigger,switch_mode}).eq('id',id).eq('user_id',u.id));return {ok:true}}
 if(!part&&method==='DELETE'){const tracks=result(await client.from('sb_tracks').select('*').eq('playlist_id',id).eq('user_id',u.id));await removeTracks(tracks);result(await client.from('sb_playlists').delete().eq('id',id).eq('user_id',u.id));return {ok:true}}
 if(part==='tracks'&&method==='POST'){const sample=await resolveSample(b.sample_id,client,true);if(!sample.active)throw Error('Este item foi retirado da biblioteca.');return result(await client.from('sb_tracks').insert({user_id:u.id,playlist_id:id,name:text(b.name)||text(sample.name),color:b.color||list.color,sample_id:sample.id}).select('id').single())}
 if(part==='upload'&&method==='POST'){if(!(b instanceof Blob)||b.size<1||b.size>MAX_FILE)throw Error('Escolha um arquivo de áudio de até 25 MB.');let filename;try{filename=decodeURIComponent(options.headers?.['X-File-Name']||'audio')}catch{filename='audio'}const ext=(filename.match(/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i)||[])[1]?.toLowerCase();if(!ext)throw Error('Formato não reconhecido. Use MP3, WAV, OGG, M4A, AAC ou FLAC.');const mime=({mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',webm:'audio/webm'})[ext];await inspectAudio(b,filename);if(typeof Audio!=='undefined')await checkPlayable(new Blob([b],{type:mime}));const audio_path=u.id+'/'+crypto.randomUUID()+'.'+ext;result(await client.storage.from(BUCKET).upload(audio_path,b,{contentType:mime,upsert:false}));try{return result(await client.from('sb_tracks').insert({user_id:u.id,playlist_id:id,name:text(url.searchParams.get('name'))||text(filename.replace(/\.[^.]+$/,'')),color:list.color,audio_path,filename:text(filename,120),mime,file_size:b.size}).select('id').single())}catch(error){await client.storage.from(BUCKET).remove([audio_path]);throw error}}
 }
 const tm=/^\/tracks\/([^/]+)$/.exec(p);if(tm){const t=await track(tm[1]);if(method==='PATCH'){result(await client.from('sb_tracks').update(Number.isSafeInteger(b.position)&&b.position>=0?{position:b.position}:{name:text(b.name),color:b.color}).eq('id',t.id).eq('user_id',u.id));return {ok:true}}if(method==='DELETE'){await removeTracks([t]);return {ok:true}}}
 throw Error('Operação não encontrada.');
 }
 return {call,audioURL,downloadTrack,blobForTrack,user,profile,accessState,register,prepareAudio,client};
}
let instance;
export async function getBackend(){if(!instance)instance=(async()=>{const {url,key}=validateConfig(globalThis.SOUNDBAR_CONFIG);const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');return createBackend(createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'soundbar-supabase-session',flowType:'pkce'}}))})();try{return await instance}catch(e){instance=null;throw e}}
