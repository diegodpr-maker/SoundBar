import {withAudioTimeout} from './audio-validation.js?v=33';
// Abort a browser file-provider read that never completes. A late result cannot
// populate a retry entry or keep the next file in the batch waiting forever.
export async function readAudioFile(file,{timeout=30000,makeReader=typeof FileReader==='undefined'?null:()=>new FileReader()}={}){
 const message='Não foi possível ler este arquivo a tempo. Selecione-o novamente ou salve uma cópia no dispositivo.';
 let bytes;
 if(!makeReader)bytes=await withAudioTimeout(file.arrayBuffer(),timeout,message);
 else bytes=await new Promise((resolve,reject)=>{const reader=makeReader();let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);reader.onload=reader.onerror=reader.onabort=null;error?reject(error):resolve(value)};const timer=setTimeout(()=>{finish(Error(message));try{reader.abort()}catch{}},timeout);reader.onload=()=>finish(null,reader.result);reader.onerror=()=>finish(Error('Não foi possível ler o arquivo. Selecione-o novamente.'));reader.onabort=()=>finish(Error('Leitura interrompida. Selecione o arquivo novamente.'));try{reader.readAsArrayBuffer(file)}catch(error){finish(error)}});
 if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==file.size)throw Error('O arquivo não pôde ser lido por completo. Selecione o original novamente.');return bytes;
}
