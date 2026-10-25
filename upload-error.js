// Preserve useful Storage errors without displaying empty serialized exceptions.
export function normalizeUploadError(cause){
 const queue=[cause],seen=new Set();let message='',status=0,code;
 while(queue.length&&seen.size<12){const value=queue.shift();if(!value||seen.has(value))continue;seen.add(value);if(typeof value==='string'){if(!message&&!/^\s*(?:\{\s*\}|null|undefined|\[object Object\])\s*$/.test(value))message=value;continue}status ||=Number(value.status||value.statusCode)||0;code ||=value.code;
 if(typeof value.message==='string'&&!/^\s*(?:\{\s*\}|null|undefined|\[object Object\])?\s*$/.test(value.message)&&!message)message=value.message;
 for(const key of ['cause','originalError','error'])if(value[key])queue.push(value[key]);
 }
 if(!message)message=status?'O armazenamento recusou o envio (HTTP '+status+').':'O armazenamento retornou uma falha sem detalhes. Tente novamente.';
 return Object.assign(Error(message),{status,code,cause,retryable:!status&&/sem detalhes/.test(message)});
}
