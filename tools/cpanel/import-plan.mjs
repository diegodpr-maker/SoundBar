import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const BASE='https://sysmacom.com.br/musicas-harmony/';
export function sourceKey(input){const url=new URL(input);if(url.protocol!=='https:'||url.origin!=='https://sysmacom.com.br'||!url.pathname.startsWith('/musicas-harmony/')||url.username||url.password||url.search||url.hash||/%(?:2e|2f|5c)/i.test(url.pathname)||!/[.](mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(url.pathname))throw Error('Invalid hosted audio URL');return url.href.replace(/%[a-f0-9]{2}/gi,s=>s.toUpperCase())}
const categories=row=>[...new Set([row.category,...(row.categories||[])].filter(Boolean).map(v=>v.trim()))];
export function buildImportPlan(report,existing=[],knownSources=[],categoryNames=[]){
 if(report.errors?.length||report.catalogTruncated||!Array.isArray(report.files)||report.files.length>5000)throw Error('Incomplete or failed inventory');
 const names=new Map(categoryNames.map(row=>[row.source_name,row.display_name]));
 const byId=new Map(existing.map(row=>[row.id,row])),byUrl=new Map(),known=new Map(),byHash=new Map(),byHead=new Map();
 for(const row of existing){try{byUrl.set(sourceKey(row.audio_url),row)}catch{}}
 for(const row of knownSources){known.set(sourceKey(row.source_url),row);if(row.content_sha256)byHash.set(row.content_sha256,row.library_id);const key=row.file_size+':'+row.head_sha256;if(!byHead.has(key))byHead.set(key,[]);byHead.get(key).push(row)}
 const groups=new Map(),seen=new Set();
 for(const original of report.files){const item={...original,category:names.get(original.category)||original.category};
  if(item.error||item.hashError||![200,206].includes(item.status)||!item.cors||!item.audioHeader||item.size!==item.expectedSize||item.size<1||item.size>52428800||typeof item.mime!=='string'||!item.mime.startsWith('audio/')||!/^[a-f0-9]{64}$/.test(item.headHash||''))throw Error('Unverified audio: '+item.name);
  const key=sourceKey(item.url);if(seen.has(key))throw Error('Repeated inventory source');seen.add(key);
  if(typeof item.category!=='string'||!item.category.trim()||item.category.trim().length>60)throw Error('Invalid category');
  const prior=known.get(key);if(prior&&(Number(prior.file_size)!==item.size||prior.head_sha256!==item.headHash||prior.content_sha256&&item.contentSha256&&prior.content_sha256!==item.contentSha256))throw Error('Previously imported source changed: '+item.name);
  if(!prior&&!byUrl.has(key)&&!item.contentSha256&&byHead.has(item.size+':'+item.headHash))throw Error('Confirm complete SHA-256 for possible existing duplicate: '+item.name);
  const groupKey=item.contentSha256||prior?.content_sha256||'source:'+key;if(!groups.has(groupKey))groups.set(groupKey,[]);groups.get(groupKey).push({...item,key,prior});
 }
 const inserts=[],updates=[],sources=[],skipped=[];let duplicateCopies=0,knownFiles=0;
 for(const files of groups.values()){
  duplicateCopies+=files.length-1;
  const matches=[...new Set(files.flatMap(f=>[f.prior?.library_id,byUrl.get(f.key)?.id,f.contentSha256?byHash.get(f.contentSha256):null]).filter(Boolean))];
  if(matches.length>1)throw Error('Existing catalogue identities conflict; do not rewrite playlist references automatically');
  let canonical=matches.length?byId.get(matches[0]):null;if(matches.length&&!canonical)throw Error('Source points to missing catalogue item');
  const ordered=[...files].sort((a,b)=>{const copy=x=>/\b(copia|copy)\b/i.test(x.name.normalize('NFD').replace(/\p{M}/gu,''))?1:0;return copy(a)-copy(b)||a.key.localeCompare(b.key)}),primary=ordered[0];
  const newCategories=files.filter(f=>!f.prior).map(f=>f.category.trim());
  if(canonical){knownFiles+=files.filter(f=>f.prior||byUrl.has(f.key)).length;const merged=[...new Set([...categories(canonical),...newCategories])];if(canonical.active&&JSON.stringify(merged)!==JSON.stringify(categories(canonical)))updates.push({id:canonical.id,categories:merged});}
  else{
   const id='cpanel-'+createHash('sha256').update(primary.key).digest('hex');if(byId.has(id))throw Error('Catalogue identifier collision');
   canonical={id,name:primary.name.trim().slice(0,120),category:primary.category.trim(),categories:[...new Set([primary.category.trim(),...newCategories])],audio_url:primary.url,source_url:primary.url,filename:primary.filename,mime:primary.mime.split(';')[0].trim(),file_size:primary.size,author:'Biblioteca Sysmacom Harmony',active:true};
   if(!canonical.name||canonical.filename.length>220)throw Error('Catalogue filename needs review');inserts.push(canonical);byId.set(id,canonical);
  }
  if(!canonical.active)skipped.push(...files.map(f=>({url:f.url,reason:'Retired catalogue entry remains retired'})));
  for(const file of files)if(!file.prior)sources.push({source_url:file.key,library_id:canonical.id,category:file.category.trim(),file_size:file.size,head_sha256:file.headHash,content_sha256:file.contentSha256||null});
 }
 return{inserts,updates,sources,skipped,stats:{hostedFiles:report.files.length,uniqueAudio:groups.size,duplicateCopies,knownFiles,newEntries:inserts.length,categoryUpdates:updates.length,sourceRecords:sources.length,categories:new Set([...groups.values()].flatMap(files=>files.map(f=>f.category))).size}};
}
export function renderImportSQL(plan){
 const json=(value,label)=>{const delimiter='$harmony_import_'+label+'$';const text=JSON.stringify(value);if(text.includes(delimiter))throw Error('Unsafe SQL payload delimiter');return delimiter+text+delimiter+'::jsonb'};
 const insert=json(plan.inserts,'items'),update=json(plan.updates,'categories'),source=json(plan.sources,'sources');
 return `begin;
 do $harmony_lock$ begin
  perform pg_advisory_xact_lock(hashtextextended('harmony-cpanel-import',0));
  if exists(select 1 from soundbar_private.sb_library_sources s join jsonb_to_recordset(${source}) as x(source_url text,library_id text) on x.source_url=s.source_url where s.library_id<>x.library_id) then raise exception 'An imported source already belongs to a different catalogue item';end if;
 end $harmony_lock$;
 with incoming as (select * from jsonb_to_recordset(${insert}) as x(id text,name text,category text,categories text[],audio_url text,source_url text,filename text,mime text,file_size bigint,author text))
 insert into public.sb_library_tracks(id,name,category,categories,audio_url,source_url,filename,mime,file_size,author,object_path,active)
 select id,name,category,categories,audio_url,source_url,filename,mime,file_size,author,null,true from incoming i
 where not exists(select 1 from public.sb_library_tracks l where l.audio_url=i.audio_url) on conflict(id) do nothing;
 with incoming as (select * from jsonb_to_recordset(${update}) as x(id text,categories text[]))
 update public.sb_library_tracks l set categories=(select array_agg(label order by position) from (select label,min(position) as position from unnest(array[l.category]||l.categories||i.categories) with ordinality as c(label,position) group by label) merged)
 from incoming i where l.id=i.id and l.active;
 insert into soundbar_private.sb_library_sources(source_url,library_id,category,file_size,head_sha256,content_sha256)
 select source_url,library_id,category,file_size,head_sha256,content_sha256 from jsonb_to_recordset(${source}) as x(source_url text,library_id text,category text,file_size bigint,head_sha256 text,content_sha256 text)
 on conflict(source_url) do nothing;
 select jsonb_build_object('registered_sources',(select count(*) from soundbar_private.sb_library_sources),'unique_hosted_items',(select count(distinct library_id) from soundbar_private.sb_library_sources)) as imported;
 commit;`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [report,existing,sources,output,names]=process.argv.slice(2);const plan=buildImportPlan(JSON.parse(readFileSync(report)),JSON.parse(readFileSync(existing)),JSON.parse(readFileSync(sources)),names?JSON.parse(readFileSync(names)):[]);writeFileSync(output,JSON.stringify(plan,null,2));writeFileSync(output+'.sql',renderImportSQL(plan));console.log(JSON.stringify(plan.stats))}
