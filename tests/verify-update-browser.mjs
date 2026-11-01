import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const root = new URL('../', import.meta.url);
const sourceBuild = Number(readFileSync(new URL('sw.js', root), 'utf8').match(/const BUILD=(\d+);/)[1]);
// Synthetic release numbers stay fixed when the production shell version changes.
let build = 57, failedAsset = '', failureHits = 0;
function wav() {
  const rate = 22050, samples = rate * 12, b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++) b.writeInt16LE(Math.round(1000 * Math.sin(2 * Math.PI * 440 * n / rate)), 44 + n * 2);
  return b;
}
const tone = wav();
const backend = `const owner='update-member';
const playlist={id:'one',user_id:owner,name:'Atualização',color:'#2356cc',play_mode:'single',loop:true,retrigger:'stop',switch_mode:'stop',event_fade_enabled:false};
const tracks=[1,2].map(n=>({id:'track-'+n,user_id:owner,playlist_id:'one',name:'Faixa '+n,filename:'tone.wav',audio_path:owner+'/track-'+n+'.wav',file_size:${tone.length},color:'#2356cc',position:n}));
const me={profile:{id:owner,display_name:'Update fixture',email:'fixture@example.test',accent:'#2356cc'},workspace:{name:'Harmony'},access:{status:'approved',is_admin:false,plan:'pro',can_upload:true},limits:{file:31457280,storage:1073741824}};
const backend={client:{auth:{onAuthStateChange(){},signOut:async()=>{},getSession:async()=>({data:{session:{user:{id:owner}}}}),getUser:async()=>({data:{user:{id:owner}}})}},call:async(path)=>{if(!navigator.onLine)throw Error('Backend must not initialize offline');if(path==='/me')return structuredClone(me);if(path==='/access')return me.access;if(path==='/samples')return[];if(path==='/overview')return{playlists:[playlist],tracks:2,bytes:100,limit:1073741824};if(path==='/playlists/one')return{playlist,tracks:structuredClone(tracks)};throw Error('Unexpected '+path)},prepareAudio:async rows=>rows.map(t=>({id:t.id,url:new URL('./tone.wav',location.href).href,size:t.file_size})),audioURL:async()=>new URL('./tone.wav',location.href).href,blobForTrack:async id=>({track:tracks.find(t=>t.id===id),blob:await(await fetch('./tone.wav')).blob()})};
export function validateConfig(){};export async function getBackend(){if(!navigator.onLine)throw Error('Backend must not initialize offline');return backend}`;

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/SoundBar\//, '/');
  res.setHeader('Cache-Control', 'no-store');
  if (failedAsset && path === '/' + failedAsset && url.searchParams.get('harmony-build') === String(build)) {
    failureHits++; res.writeHead(503); res.end('Incomplete deployment'); return;
  }
  if (path === '/tone.wav') { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(tone); return; }
  if (path === '/backend.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(backend); return; }
  try {
    const file = new URL('.' + (path === '/' ? '/index.html' : path), root);
    if (!fileURLToPath(file).startsWith(fileURLToPath(root))) throw Error('Invalid path');
    let data = readFileSync(file);
    if (/\.(?:html|js|css)$/.test(path) || path === '/') {
      data = Buffer.from(data.toString().replaceAll('?v=' + sourceBuild, '?v=' + build).replaceAll('data-harmony-build="' + sourceBuild + '"', 'data-harmony-build="' + build + '"').replace('pages-v' + sourceBuild, 'pages-v' + build).replace('const BUILD=' + sourceBuild + ';', 'const BUILD=' + build + ';').replace('const VERSION = ' + sourceBuild + ';', 'const VERSION = ' + build + ';'));
    }
    res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.png') ? 'image/png' : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html; charset=utf-8' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
async function waitBuild(page, value) {
  await page.waitForFunction(value => document.documentElement.dataset.harmonyBuild === String(value), value);
  await page.locator('.pad').first().waitFor();
}
async function check(page) { await page.evaluate(() => window.harmonyUpdates.check()); }
async function waitCandidate(page) {
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
}
async function audioDigests(page) {
  return page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('soundbar-encrypted-audio', 1); request.onsuccess = () => resolve(request.result); });
    const rows = await new Promise(resolve => { const request = db.transaction('audio', 'readonly').objectStore('audio').getAll(); request.onsuccess = () => resolve(request.result); });
    db.close();
    return Promise.all(rows.filter(row => row.type === 'audio/wav').map(async row => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', row.data))).join(',')));
  });
}
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  context.setDefaultTimeout(20000);
  await context.route(/https:\/\//, route => route.abort());
  await context.addInitScript(() => {
    window.testAudios = []; const OriginalAudio = window.Audio;
    window.Audio = function (...args) { const audio = new OriginalAudio(...args); window.testAudios.push(audio); return audio; };
    Element.prototype.requestFullscreen = () => Promise.reject(Error('Fullscreen unavailable'));
    const interval = window.setInterval.bind(window);
    window.setInterval = (fn, delay, ...args) => interval(fn, delay === 60000 ? 1000 : delay, ...args);
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/app.html#studio/one'); await waitBuild(page, 57);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.evaluate(() => { localStorage.setItem('update-session-sentinel', 'preserved'); sessionStorage.setItem('update-tab-sentinel', 'preserved'); });
  await page.locator('[data-action="save-device"]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Playlist disponível offline.');
  const before = await audioDigests(page); assert.equal(before.length, 2);
  await page.locator('[data-action="event-mode"]').click(); await page.locator('[data-action="play"]').first().click();
  await page.waitForFunction(() => window.testAudios.some(a => !a.paused && a.currentTime > .2));
  await page.evaluate(() => window.playingBeforeUpdate = window.testAudios.find(a => !a.paused));
  build = 58; await check(page); await waitCandidate(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.harmonyBuild), '57');
  assert.equal(await page.evaluate(() => window.playingBeforeUpdate.paused), false);
  const second = await context.newPage(); second.on('pageerror', e => errors.push(e.message));
  await second.goto(origin + '/app.html#studio/one'); await waitBuild(second, 57);
  assert.equal(await second.evaluate(() => document.documentElement.inert), false);
  await page.locator('#stop-all').click(); await check(second);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.harmonyBuild), '57', 'Event mode delays activation even after stopping audio');
  await page.locator('.event-exit').click();
  await waitBuild(page, 58); await waitBuild(second, 58);
  assert.equal(await page.evaluate(() => localStorage.getItem('update-session-sentinel')), 'preserved');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('update-tab-sentinel')), 'preserved');
  assert.deepEqual(await audioDigests(page), before);
  console.log('Playing audio and event mode preserved; both windows automatically reloaded when idle; encrypted downloads and session preserved.');

  await page.evaluate(() => window.finishUpload = window.harmonyUpdates.hold());
  build = 59; await check(page); await waitCandidate(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.harmonyBuild), '58');
  await page.evaluate(() => window.finishUpload()); await waitBuild(page, 59); await waitBuild(second, 59);
  await page.evaluate(() => location.hash = 'profile'); await page.locator('#profile-name').fill('Rascunho não salvo');
  build = 60; await check(page); await waitCandidate(page);
  assert.equal(await page.locator('#profile-name').inputValue(), 'Rascunho não salvo');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.harmonyBuild), '59');
  await page.evaluate(() => location.hash = 'studio/one'); await waitBuild(page, 60); await waitBuild(second, 60);
  console.log('Pending upload and unsaved profile edits defer an update; consecutive updates apply without manual reload.');

  failedAsset = 'style.css'; build = 61; await check(page);
  for(let n=0; n<200 && failureHits===0; n++) await new Promise(resolve=>setTimeout(resolve,100));
  await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !r.installing && !r.waiting; });
  assert.ok(failureHits > 0);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.harmonyBuild), '60');
  assert.equal(await page.evaluate(async () => (await caches.keys()).includes('sysmacom-harmony-pages-v61')), false);
  failedAsset = ''; build = 62; await check(page); await waitBuild(page, 62); await waitBuild(second, 62);
  assert.deepEqual(await audioDigests(page), before);
  await second.close(); await context.setOffline(true); await page.reload(); await waitBuild(page, 62);
  await page.waitForFunction(() => document.body.classList.contains('offline-mode'));
  assert.equal(await page.locator('.pad').count(), 2);
  build = 63; await context.setOffline(false); await waitBuild(page, 63);
  build = 64; await waitBuild(page, 64);
  assert.deepEqual(await audioDigests(page), before);
  console.log('Failed deployment retains the installed version; recovery, offline startup, reconnect and periodic checks update automatically.');
  assert.deepEqual(errors, []); await context.close();

  // An installation under a repository path uses its own scope and reloads only once.
  build = 57;
  const nested = await browser.newContext({ serviceWorkers: 'allow' }); nested.setDefaultTimeout(20000);
  await nested.route(/https:\/\//, route => route.abort());
  const nestedPage = await nested.newPage(); await nestedPage.goto(origin + '/SoundBar/app.html#studio/one'); await waitBuild(nestedPage, 57);
  await nestedPage.waitForFunction(() => !!navigator.serviceWorker.controller);
  build = 58; await check(nestedPage); await waitBuild(nestedPage, 58);
  assert.equal(await nestedPage.evaluate(() => location.hash), '#studio/one');
  assert.match(await nestedPage.evaluate(() => navigator.serviceWorker.controller.scriptURL), /\/SoundBar\/sw\.js$/);
  await nested.close();
  console.log('Installed PWA update lifecycle passed with real service workers, actual app/audio, multiple windows, two successive updates and root/repository scopes.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
