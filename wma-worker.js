// Single-thread FFmpeg runs away from the UI and needs no SharedArrayBuffer/COOP/COEP.
// Fixed dependency; no user-supplied URLs, commands or filenames are executed.
const CORE='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
self.onmessage=async({data})=>{let core;try{
 if(!(data.bytes instanceof ArrayBuffer)||!Number.isSafeInteger(data.maxBytes)||data.maxBytes<1||data.maxBytes>50*1024*1024||data.bytes.byteLength>data.maxBytes)throw Error('Arquivo de áudio acima do limite permitido.');
 try{importScripts(CORE);core=await self.createFFmpegCore({mainScriptUrlOrBlob:CORE+'#'+btoa(JSON.stringify({wasmURL:CORE.replace(/\.js$/,'.wasm'),workerURL:''}))})}catch{throw Error('Não foi possível carregar o conversor. Confira a conexão e tente novamente.');}
 self.postMessage({type:'ready'});let last=-1;core.setLogger(()=>{});core.setProgress(({progress})=>{const percent=Math.floor(progress*100);if(Number.isFinite(percent)&&percent>last&&percent>=0&&percent<=100){last=percent;self.postMessage({type:'progress',progress})}});
 core.FS.writeFile('input.wma',new Uint8Array(data.bytes));core.setTimeout(600000);
 core.exec('-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-f','asf','-i','input.wma','-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-c:a','libmp3lame','-b:a','160k','-ar','44100','-ac','2','-fs',String(data.maxBytes+1),'output.mp3');
 if(core.ret!==0)throw Error('Não foi possível converter este WMA. O arquivo pode estar incompleto, protegido ou usar uma codificação incompatível.');
 const output=core.FS.readFile('output.mp3');if(output.byteLength>data.maxBytes)throw Error('O MP3 convertido ultrapassa o limite permitido. Nenhum áudio foi enviado.');if(!output.byteLength)throw Error('O WMA não contém um áudio que possa ser convertido.');
 self.postMessage({type:'done',bytes:output.buffer},[output.buffer]);
 }catch(error){self.postMessage({type:'error',message:error.message||'Não foi possível converter o WMA.'})}finally{if(core){for(const path of ['input.wma','output.mp3'])try{core.FS.unlink(path)}catch{}core.reset()}}};
