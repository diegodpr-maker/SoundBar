export const MiB=1024*1024,GiB=1024*MiB;
export const DEFAULT_LIMITS=Object.freeze({file:30*MiB,storage:GiB});
export const MAX_FILE_BYTES=50*MiB,MAX_STORAGE_BYTES=100*GiB;
export function validateAccountLimits(value){const {file,storage}=value||{};if(!Number.isSafeInteger(file)||file<MiB||file>MAX_FILE_BYTES||file%MiB)throw Error('Defina de 1 a 50 MB por áudio.');if(!Number.isSafeInteger(storage)||storage<file||storage>MAX_STORAGE_BYTES||storage%MiB)throw Error('O espaço total deve comportar um áudio e ser de até 100 GB.');return{file,storage}}
export function accountLimits(value){try{return validateAccountLimits(value)}catch{return{...DEFAULT_LIMITS}}}
export function limitsFromForm(fileMB,space,unit){if(!['MB','GB'].includes(unit)||!String(fileMB).trim()||!String(space).trim())throw Error('Informe os dois limites.');const file=Number(fileMB)*MiB,storage=Number(space)*(unit==='GB'?GiB:MiB);return validateAccountLimits({file,storage})}
