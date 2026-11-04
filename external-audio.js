// Only the authenticated RPC may supply migrated media URLs. No signing key is shipped.
export function externalAudioMap(rows,requested){
 if(!Array.isArray(rows))throw Error('Não foi possível preparar os áudios. Tente novamente.');
 const allowed=new Set(requested),output=new Map();
 for(const row of rows){
  let url;try{url=new URL(row.url)}catch{throw Error('Não foi possível preparar este áudio.')}
  const size=Number(row.size),expires=Number(row.expires_at);
  if(!allowed.has(row.id)||output.has(row.id)||url.protocol!=='https:'||url.hostname!=='sysmacom.com.br'||url.port||url.username||url.password||url.hash||!Number.isSafeInteger(size)||size<1||size>52428800)throw Error('Não foi possível preparar este áudio.');
  const publicFile=/^\/harmony-midia\/biblioteca\/[a-f0-9]{64}\.mp3$/.test(url.pathname)&&!url.search;
  const signedFile=url.pathname==='/harmony-midia/audio.php'&&/^[a-f0-9]{64}$/.test(url.searchParams.get('id')||'')&&/^[0-9]{10}$/.test(url.searchParams.get('e')||'')&&/^[a-f0-9]{64}$/.test(url.searchParams.get('s')||'')&&Number(url.searchParams.get('e'))===expires&&[...url.searchParams.keys()].length===3&&['id','e','s'].every(k=>url.searchParams.getAll(k).length===1);
  if(!publicFile&&!signedFile)throw Error('Não foi possível preparar este áudio.');
  output.set(row.id,{id:row.id,url:url.href,size,expiresAt:Number.isFinite(expires)?expires*1000:0});
 }
 return output;
}
