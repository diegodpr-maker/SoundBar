export function validateRegistration(value){
 const email=typeof value?.email==='string'?value.email.trim().toLowerCase():'';
 const password=typeof value?.password==='string'?value.password:'';
 const display_name=typeof value?.display_name==='string'?value.display_name.trim():'';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Informe um e-mail válido.');
 if(password.length<8||password.length>128)throw Error('Use uma senha de 8 a 128 caracteres.');
 if(!display_name||display_name.length>80)throw Error('Informe seu nome, com até 80 caracteres.');
 return {email,password,display_name};
}
export function registrationHandler({client,publicKey,anonKey,allowedOrigin,hash}){
 return async request=>{
 const origin=request.headers.get('origin');const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const permitted=[allowedOrigin,'https://harmony.sysmacom.com.br'].includes(origin);
 if(permitted)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'});
 const reply=(body,status=200)=>{if(status>=400)console.error(JSON.stringify({event:'registration_failed',status,origin:permitted?origin:'untrusted'}));return new Response(JSON.stringify(body),{status,headers})};
 if(!permitted)return reply({error:'Origem não permitida.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Método não permitido.'},405);
 if(![publicKey,anonKey].filter(Boolean).includes(request.headers.get('apikey')))return reply({error:'Aplicativo não autorizado.'},401);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return reply({error:'Envie JSON.'},415);
 try{
  if(Number(request.headers.get('content-length'))>4096)return reply({error:'Solicitação muito grande.'},413);
  if(!request.body)return reply({error:'Dados inválidos.'},400);
  const reader=request.body.getReader();const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();return reply({error:'Solicitação muito grande.'},413)}chunks.push(value)}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  let data;try{data=validateRegistration(JSON.parse(new TextDecoder().decode(bytes)))}catch(error){return reply({error:error.message||'Dados inválidos.'},400)}
  const ip=(request.headers.get('x-forwarded-for')||request.headers.get('x-real-ip')||'unknown').split(',')[0].trim();
  const quota=await client.rpc('sb_allow_registration',{email_hash:await hash(data.email),ip_hash:await hash(ip)});
  if(quota.error)return reply({error:'Não foi possível receber seu cadastro. Tente novamente.'},503);
  if(!quota.data)return reply({error:'Muitas tentativas. Aguarde antes de tentar novamente.'},429);
  const {error}=await client.auth.admin.createUser({email:data.email,password:data.password,email_confirm:true,user_metadata:{display_name:data.display_name}});
  if(error&&!['email_exists','user_already_exists'].includes(error.code))return reply({error:'Não foi possível cadastrar. Tente novamente mais tarde.'},503);
  // Never expose whether an email already exists, and never grant approval from input.
  return reply({status:'pending',message:'Cadastro recebido. Aguarde a liberação do administrador.'},202);
 }catch{return reply({error:'Não foi possível receber seu cadastro. Tente novamente.'},503)}
 };
}
