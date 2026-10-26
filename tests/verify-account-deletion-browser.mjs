import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.argv[2]),root=new URL('../',import.meta.url),browser=await chromium.launch({headless:true});
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',active='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',pending='cccccccc-cccc-4ccc-8ccc-cccccccccccc',retry='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const backend=`const backend={client:{auth:{onAuthStateChange(){},signOut:async()=>{}},rpc:async()=>({data:{}})},call:async(path,options={})=>{
if(path==='/me')return{profile:{id:'${admin}',display_name:'Diego',accent:'#78b5ff',email:'admin@example.test'},workspace:{name:'Harmony'},access:{status:'approved',is_admin:window.adminFixture}};
if(path==='/access')return{status:'approved',is_admin:window.adminFixture};if(path==='/samples')return[];
if(path==='/admin/accounts')return structuredClone(window.accounts);
if(path==='/overview')return{playlists:[],tracks:0,bytes:0,limit:209715200};
if(path.startsWith('/admin/accounts/')&&options.method==='DELETE'){window.deleteCalls.push({path,body:options.body});if(window.failDeletion){window.accounts.find(a=>a.user_id===path.split('/').at(-1)).deletion_status='failed';throw Error('A conta está bloqueada. Tente novamente.')}await new Promise(r=>window.finishDeletion=r);return{ok:true}}
throw Error('Unexpected fixture route '+path)}};export async function getBackend(){return backend}`;
async function page(isAdmin=true){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});context.setDefaultTimeout(10000);
 await context.addInitScript(({isAdmin,admin,active,pending,retry})=>{window.adminFixture=isAdmin;window.deleteCalls=[];window.accounts=[
  {user_id:admin,email:'admin@example.test',display_name:'Administrador',status:'approved',is_admin:true,can_delete:false},
  {user_id:active,email:'active@example.test',display_name:'Membro ativo',status:'approved',can_delete:true},
  {user_id:pending,email:'pending@example.test',display_name:'Aguardando',status:'pending',can_delete:true},
  {user_id:retry,email:'retry@example.test',display_name:'Interrompido',status:'blocked',can_delete:true,deletion_status:'failed'}
 ].map(a=>({...a,requested_at:'2026-10-26T12:00:00Z'}));},{isAdmin,admin,active,pending,retry});
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='harmony-delete.test')return route.fulfill({status:204,body:''});if(u.pathname==='/backend.js')return route.fulfill({contentType:'text/javascript',body:backend});
  try{const file=new URL('.'+u.pathname,root);if(!fileURLToPath(file).startsWith(fileURLToPath(root)))throw Error('path');return route.fulfill({contentType:u.pathname.endsWith('.html')?'text/html; charset=utf-8':u.pathname.endsWith('.js')?'text/javascript; charset=utf-8':u.pathname.endsWith('.css')?'text/css; charset=utf-8':'application/octet-stream',body:readFileSync(file)})}catch{return route.fulfill({status:404,body:''})}
 });
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('https://harmony-delete.test/app.html#'+(isAdmin?'admin':'dashboard'));return{p,errors};
}
try{
 const {p,errors}=await page();const activeButton=p.locator(`[data-delete-account="${active}"]`);await activeButton.waitFor();
 assert.equal(await p.locator(`[data-delete-account="${admin}"]`).count(),0);assert.equal(await p.locator(`[data-delete-account="${pending}"]`).count(),1);
 assert.equal(await p.locator(`[data-delete-account="${retry}"]`).innerText(),'Concluir exclusão');
 await activeButton.click();assert.match(await p.locator('#modal').innerText(),/não pode ser desfeita/);await p.locator('#modal-cancel').click();assert.equal(await p.evaluate(()=>window.deleteCalls.length),0);
 await activeButton.click();await p.locator('#delete-account-email').fill('wrong@example.test');await p.locator('#modal-submit').click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>window.deleteCalls.length),0);assert.equal(await p.locator('#modal').isVisible(),true);
 await p.locator('#delete-account-email').fill('ACTIVE@example.test');await p.locator('#modal-submit').click();await p.waitForFunction(()=>window.deleteCalls.length===1);assert.equal(await p.locator('#modal-cancel').isDisabled(),true);assert.equal(await p.locator('#modal-submit').isDisabled(),true);
 await p.keyboard.press('Escape');assert.equal(await p.locator('#modal').isVisible(),true);
 await p.evaluate(()=>window.finishDeletion());await p.locator('#modal').waitFor({state:'hidden'});assert.equal(await activeButton.count(),0);assert.equal(await p.locator('.account-review').count(),3);
 assert.deepEqual(await p.evaluate(()=>window.deleteCalls[0]),{path:'/admin/accounts/'+active,body:{confirmation_email:'active@example.test'}});
 await p.evaluate(()=>window.failDeletion=true);await p.locator(`[data-delete-account="${pending}"]`).click();await p.locator('#delete-account-email').fill('pending@example.test');await p.locator('#modal-submit').click();await p.waitForFunction(()=>window.deleteCalls.length===2);await p.locator('#modal-submit:enabled').waitFor();await p.locator('#modal-cancel').click();
 assert.equal(await p.locator(`[data-delete-account="${pending}"]`).innerText(),'Concluir exclusão');assert.deepEqual(errors,[]);
 const member=await page(false);await member.p.locator('h1').filter({hasText:'Olá, Diego.'}).waitFor();assert.equal(await member.p.locator('[data-delete-account]').count(),0);assert.deepEqual(member.errors,[]);
 console.log('Account deletion mobile UI: approved and pending accounts, protected administrator, cancel, typed confirmation, busy lock, success, retry and member isolation passed. No real accounts deleted.');
}finally{await browser.close()}
