import {cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, '.site');
rmSync(output, {recursive: true, force: true});
mkdirSync(output);
// Only intentional public assets can enter the Pages artifact. Repository
// history, CI dependencies, SQL, tests and operational reports stay outside it.
for (const name of readdirSync(root)) {
  const source = resolve(root, name);
  if (lstatSync(source).isFile() && (/\.(?:html|js|css|png|svg|webmanifest)$/.test(name) || name === 'CNAME' || name === 'LICENSE'))
    cpSync(source, resolve(output, name));
}
for (const name of ['audio', 'downloads']) cpSync(resolve(root, name), resolve(output, name), {recursive: true});
for (const required of ['index.html', 'app.html', 'login.html', 'sw.js', 'manifest.webmanifest', 'external-audio.js', 'CNAME'])
  assert.ok(existsSync(resolve(output, required)), `Missing public asset: ${required}`);
for (const forbidden of ['.git', '.github', 'ci', 'supabase', 'tests', 'tools', '.env', 'package.json'])
  assert.ok(!existsSync(resolve(output, forbidden)), `Private build input included: ${forbidden}`);
writeFileSync(resolve(output, '.nojekyll'), '');
writeFileSync(resolve(output, 'deployment.json'), JSON.stringify({commit: process.env.GITHUB_SHA || 'local', built_at: new Date().toISOString()}) + '\n');
console.log('Public Pages artifact built in .site');
