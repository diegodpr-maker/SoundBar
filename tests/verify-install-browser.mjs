// Run with: node tests/verify-install-browser.mjs /path/to/playwright
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const {chromium} = createRequire(import.meta.url)(process.argv[2]);
const root = new URL('../', import.meta.url);
const csp = readFileSync(new URL('app.html', root), 'utf8').match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0];
const fixture = `<!doctype html><html data-theme="dark"><head>${csp}<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="themes.css"><link rel="stylesheet" href="pwa-install.css"><script defer src="pwa-install.js"></script></head><body><main><h1>Harmony</h1><input aria-label="E-mail"></main></body></html>`;
const url = 'https://harmony-install.test/install-check.html';
const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const errors=[];
const mobile='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
async function page({userAgent=mobile,installed=false,early=false}={}) {
  const ctx=await browser.newContext({userAgent,viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await ctx.route('**/*', async route=>{
    const request=new URL(route.request().url());
    if(request.pathname==='/install-check.html')return route.fulfill({contentType:'text/html',body:fixture});
    try {
      const path=new URL('.'+request.pathname,root);
      if(!fileURLToPath(path).startsWith(fileURLToPath(root)))throw Error('path');
      const type=request.pathname.endsWith('.js')?'text/javascript':request.pathname.endsWith('.css')?'text/css':'image/png';
      await route.fulfill({contentType:type,body:readFileSync(path)});
    } catch { await route.fulfill({status:404,body:''}); }
  });
  await ctx.addInitScript(({installed,early})=>{
    const original=window.matchMedia.bind(window);
    if(installed)window.matchMedia=q=>q.includes('display-mode: standalone')?{matches:true,addEventListener(){}}:original(q);
    window.offer=(outcome='accepted',fail=false)=>{
      const e=new Event('beforeinstallprompt',{cancelable:true});
      e.prompt=async()=>{window.promptCount=(window.promptCount||0)+1;if(fail)throw Error('unavailable')};
      e.userChoice=Promise.resolve({outcome});window.dispatchEvent(e);return e.defaultPrevented;
    };
    if(early)document.addEventListener('DOMContentLoaded',()=>window.offer(),{once:true});
  },{installed,early});
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',m=>{if(/Content Security Policy|Refused to/.test(m.text()))errors.push(m.text())});
  await p.goto(url);return p;
}
const visible=p=>p.locator('#harmony-install').isVisible();
try {
  const android=await page();
  assert.equal(await visible(android),false,'Android waits for browser installation eligibility');
  assert.equal(await android.evaluate(()=>window.offer()),true);
  assert.equal(await visible(android),true);
  const rect=await android.locator('#harmony-install').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);
  for(const cls of ['event-mode','menu-open','transport-open','preview-open']) {
    await android.evaluate(cls=>document.body.classList.add(cls),cls);assert.equal(await visible(android),false,cls);
    await android.evaluate(cls=>document.body.classList.remove(cls),cls);
  }
  await android.locator('[data-install]').click();assert.equal(await android.evaluate(()=>window.promptCount),1);assert.equal(await visible(android),false);
  const cancel=await page();await cancel.evaluate(()=>window.offer('dismissed'));await cancel.locator('[data-install]').click();
  await cancel.reload();await cancel.evaluate(()=>window.offer());assert.equal(await visible(cancel),false,'native rejection remembered');
  const dismiss=await page();await dismiss.evaluate(()=>window.offer());await dismiss.locator('[data-dismiss]').click();
  await dismiss.reload();await dismiss.evaluate(()=>window.offer());assert.equal(await visible(dismiss),false,'explicit dismissal survives navigation');
  await dismiss.evaluate(()=>localStorage.setItem('harmony-install-dismissed-until',String(Date.now()-1)));
  await dismiss.reload();await dismiss.evaluate(()=>window.offer());assert.equal(await visible(dismiss),true,'invitation returns after cooldown');
  await dismiss.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));assert.equal(await visible(dismiss),false);
  const iphone=await page({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});
  assert.equal(await visible(iphone),true);await iphone.locator('[data-install]').click();
  assert.equal(await iphone.locator('dialog').evaluate(d=>d.open),true);
  assert.match(await iphone.locator('dialog').innerText(),/Adicionar à Tela de Início/);
  await iphone.keyboard.press('Escape');assert.equal(await iphone.locator('[data-install]').evaluate(b=>b===document.activeElement),true);
  await iphone.evaluate(()=>document.documentElement.dataset.theme='light');
  const bg=await iphone.locator('#harmony-install').evaluate(e=>getComputedStyle(e).backgroundColor);assert.equal(bg,'rgb(255, 255, 255)');
  await iphone.screenshot({path:'/tmp/harmony-install-iphone.png'});
  await iphone.locator('[data-install]').click();await iphone.locator('[data-done]').click();assert.equal(await visible(iphone),false);
  const installed=await page({installed:true});assert.equal(await installed.locator('#harmony-install').count(),0);assert.equal(await installed.evaluate(()=>window.offer()),false);
  const desktop=await page({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'});assert.equal(await desktop.locator('#harmony-install').count(),0);
  const early=await page({early:true});assert.equal(await visible(early),true,'eligibility before DOMContentLoaded is retained');
  const failed=await page();await failed.evaluate(()=>window.offer('accepted',true));await failed.locator('[data-install]').click();assert.match(await failed.locator('#harmony-install').innerText(),/No menu do navegador/);
  assert.deepEqual(errors,[]);
  console.log('Installation invitation: Android eligibility, acceptance/cancel/error, iPhone instructions, focus, light theme, dismissal/cooldown, installed/desktop suppression and audio/menu/event visibility passed under app CSP.');
} finally { await browser.close(); }
