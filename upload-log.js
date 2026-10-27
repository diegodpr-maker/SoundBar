const VERSION='30',MAX_BATCHES=20,MAX_FILES=300;
const clean=value=>String(value??'').replace(/https?:\/\/[^\s)]+/gi,'[endereço omitido]').replace(/Bearer\s+\S+|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\bsb_(?:secret|publishable)_[\w-]+/gi,'[credencial omitida]').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,500);
export function createUploadLog({owner,storage,now=()=>new Date().toISOString(),id=()=>crypto.randomUUID()}={}){
 if(!owner)throw Error('Conta necessária para consultar o histórico.');
 const key='harmony-upload-log:'+owner;let durable=true,reports=[];
 try{storage??=globalThis.localStorage;const saved=JSON.parse(storage?.getItem(key)||'[]');if(Array.isArray(saved))reports=saved.filter(r=>r&&typeof r.id==='string'&&Array.isArray(r.files)).slice(0,MAX_BATCHES)}catch{durable=false}
 const persist=()=>{try{if(!storage)throw Error();storage.setItem(key,JSON.stringify(reports));durable=true}catch{durable=false}};
 for(const report of reports)if(report.status==='running'){report.status='interrupted';for(const file of report.files)if(file.status==='uploading')file.status='interrupted';report.finishedAt=now()}persist();
 const summary=report=>{const counts={total:report.files.length,done:0,failed:0,pending:0};for(const f of report.files){if(f.status==='done')counts.done++;else if(f.status==='failed')counts.failed++;else counts.pending++}return counts};
 const file=(report,index)=>report.files[index];
 return{
 get durable(){return durable},list:()=>reports,summary,
 start(entries,category){const report={id:id(),version:VERSION,category:clean(category),startedAt:now(),finishedAt:null,status:'running',files:entries.slice(0,MAX_FILES).map(e=>({filename:clean(e.file.name),name:clean(e.name),size:e.file.size,status:'pending',stage:'Aguardando',events:[]}))};reports.unshift(report);reports=reports.slice(0,MAX_BATCHES);persist();return report},
 stage(report,index,stage){const f=file(report,index);if(!f)return;const label=clean(stage).replace(/\s*\d+%/g,'').trim();f.status='uploading';f.stage=label;if(f.events.at(-1)?.stage!==label){f.events.push({at:now(),stage:label});f.events=f.events.slice(-16);persist()}},
 result(report,index,entry,error,result){const f=file(report,index);if(!f)return;f.status=error?'failed':'done';f.finishedAt=now();f.outputFilename=clean(entry.uploadFilename||entry.file.name);f.outputSize=entry.payload?.size??entry.file.size;f.error=error?clean(error.message||'Falha sem detalhes'):null;f.httpStatus=Number(error?.status||error?.cause?.status||error?.cause?.statusCode)||null;f.catalogId=typeof result?.id==='string'?clean(result.id):null;if(!error)f.stage='Cadastro confirmado';persist()},
 finish(report,error){report.status=error?'interrupted':'completed';report.finishedAt=now();if(error)report.error=clean(error.message);report.counts=summary(report);persist()},
 export(id){const report=reports.find(r=>r.id===id);if(!report)throw Error('Relatório não encontrado.');return JSON.stringify({...report,counts:summary(report)},null,2)}
 };
}
