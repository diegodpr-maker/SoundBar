import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readdirSync} from 'node:fs';
import assert from 'node:assert/strict';

const groups = {
  access: ['access-audit', 'egress', 'plans', 'library-categories', 'external-audio'],
  playback: ['event-playback', 'event-fader', 'offline', 'batch-wake', 'update'],
  controls: ['account-limits', 'account-deletion', 'admin-notifications', 'install', 'playlist-order', 'track-sort', 'resumable'],
  conversion: ['wma'],
};
// The live cPanel inspection consumes an explicit server inventory and remains
// an operational check. Every deterministic browser regression belongs above.
const expected = readdirSync(new URL('../tests/', import.meta.url))
  .filter(name => /^verify-.*-browser\.mjs$/.test(name) && name !== 'verify-cpanel-browser.mjs').sort();
assert.deepEqual(Object.values(groups).flat().map(name => `verify-${name}-browser.mjs`).sort(), expected,
  'Add each new browser regression to the mandatory release suite');
const selected = process.argv[2];
assert.ok(Object.hasOwn(groups, selected), 'Unknown browser verification group');
const modulePath = name => fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url));
for (const name of groups[selected]) {
  const args = [`tests/verify-${name}-browser.mjs`, modulePath('playwright')];
  if (name === 'access-audit') args.push(modulePath('@supabase/supabase-js/dist/umd/supabase.js'), modulePath('tus-js-client/dist/tus.min.js'));
  console.log(`Verifying ${name}`);
  const result = spawnSync(process.execPath, args, {stdio: 'inherit', timeout: 180000});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
