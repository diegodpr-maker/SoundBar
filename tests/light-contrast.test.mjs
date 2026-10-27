import {test} from 'node:test';import assert from 'node:assert/strict';
const luminance=hex=>{const v=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
test('light theme text, buttons, secondary labels and input boundaries have adequate contrast',()=>{for(const [fg,bg]of [['10233f','ffffff'],['425773','ffffff'],['425773','edf3fa'],['ffffff','1758c7'],['1758c7','ffffff'],['354d70','deebfc'],['8f1830','fff0f2'],['516781','ffffff']])assert.ok(contrast(fg,bg)>=4.5,`${fg}/${bg}`);assert.ok(contrast('7088a6','ffffff')>=3)});
