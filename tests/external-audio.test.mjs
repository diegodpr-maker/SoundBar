import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalAudioMap} from '../external-audio.js';
const id='track',hash='a'.repeat(64),expires=1793809900;
const privateURL=`https://sysmacom.com.br/harmony-midia/audio.php?id=${hash}&e=${expires}&s=${'b'.repeat(64)}`;
test('migrated audio accepts only the exact public folder or a well formed signed gateway URL',()=>{
 for(const url of [privateURL,`https://sysmacom.com.br/harmony-midia/biblioteca/${hash}.mp3`])assert.equal(externalAudioMap([{id,url,size:834,expires_at:expires}],[id]).get(id).url,url);
 for(const url of ['http://sysmacom.com.br/harmony-midia/audio.php',privateURL.replace('sysmacom.com.br','evil.test'),privateURL+'&id='+hash,privateURL+'&extra=1',privateURL+'#token',privateURL.replace('https://','https://user:pass@'),`https://sysmacom.com.br/harmony-midia/privados/${hash}.mp3`])assert.throws(()=>externalAudioMap([{id,url,size:834,expires_at:expires}],[id]));
});
test('unexpected track identifiers, duplicates and invalid sizes are not accepted from a media response',()=>{
 const row={id,url:privateURL,size:834,expires_at:expires};
 assert.throws(()=>externalAudioMap([row],['other']));assert.throws(()=>externalAudioMap([row,row],[id]));
 for(const size of [0,-1,52428801,NaN,1.5])assert.throws(()=>externalAudioMap([{...row,size}],[id]));
 assert.throws(()=>externalAudioMap([{...row,expires_at:expires+1}],[id]));
});
