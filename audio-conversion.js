import {inspectAudio,checkPlayable} from './audio-validation.js?v=26';
const ASF=[0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11,0xa6,0xd9,0x00,0xaa,0x00,0x62,0xce,0x6c];
export async function prepareAudioUpload(blob,{filename=blob.name,maxBytes=25*1024*1024,onStage=()=>{},convert=convertWma,validate=inspectAudio,playable=typeof Audio==='undefined'?null:checkPlayable}={}){
 if(!(blob instanceof Blob)||!blob.size||blob.size>maxBytes)throw Error('Escolha um áudio de até '+Math.round(maxBytes/1024/1024)+' MB.');
 if(!/\.wma$/i.test(filename||''))return{blob,filename,converted:false};
 const header=new Uint8Array(await blob.slice(0,16).arrayBuffer());if(!ASF.every((b,i)=>header[i]===b))throw Error('Este arquivo não contém um WMA válido. Use o arquivo original.');
 onStage('Preparando conversor de WMA…');
 const converted=await convert(blob,{maxBytes,onStage});
 if(!(converted instanceof Blob)||!converted.size)throw Error('Não foi possível converter este WMA. O arquivo pode estar incompleto ou protegido.');
 if(converted.size>maxBytes)throw Error('O MP3 convertido ultrapassa o limite de '+Math.round(maxBytes/1024/1024)+' MB. Nenhum áudio foi enviado.');
 const outputName=filename.replace(/\.wma$/i,'').slice(0,110)+'.mp3';
 onStage('Conferindo MP3 convertido…');await validate(converted,outputName);if(playable)await playable(converted);
 return{blob:converted,filename:outputName,converted:true};
}
export async function convertWma(blob,{maxBytes,onStage=()=>{},makeWorker=()=>new Worker(new URL('./wma-worker.js?v=26',import.meta.url)),loadTimeout=120000,conversionTimeout=600000}={}){
 if(typeof WebAssembly==='undefined')throw Error('Este navegador não oferece suporte à conversão. Atualize-o ou importe um MP3.');
 const bytes=await blob.arrayBuffer();let worker,timer;try{worker=makeWorker()}catch{throw Error('Não foi possível abrir o conversor neste navegador. Tente novamente ou importe um MP3.');}
 try{return await new Promise((resolve,reject)=>{const arm=(ms,message)=>{clearTimeout(timer);timer=setTimeout(()=>reject(Error(message)),ms)};arm(loadTimeout,'Não foi possível carregar o conversor. Confira a conexão e tente novamente.');
 worker.onmessage=({data})=>{if(data.type==='ready'){arm(conversionTimeout,'A conversão demorou demais. Tente um arquivo menor ou importe um MP3.');onStage('Convertendo WMA para MP3…')}else if(data.type==='progress'){onStage('Convertendo WMA para MP3… '+Math.min(99,Math.max(0,Math.round(data.progress*100)))+'%')}else if(data.type==='done'){clearTimeout(timer);resolve(new Blob([data.bytes],{type:'audio/mpeg'}))}else if(data.type==='error'){clearTimeout(timer);reject(Error(data.message))}};
 worker.onerror=e=>{e.preventDefault?.();clearTimeout(timer);reject(Error('O conversor não conseguiu concluir. Confira a conexão e tente um arquivo menor ou importe um MP3.'))};
 worker.onmessageerror=()=>{clearTimeout(timer);reject(Error('Não foi possível receber o áudio convertido. Tente novamente.'))};
 worker.postMessage({bytes,maxBytes},[bytes]);
 })}finally{clearTimeout(timer);worker.terminate()}
}
