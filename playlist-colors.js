const valid=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const channels=hex=>hex.slice(1).match(/../g).map(value=>parseInt(value,16));
function luminance(hex){const c=channels(hex).map(value=>{const n=value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
export function playlistColors(value){
 const color=valid(value)?value.toLowerCase():'#78b5ff',dark='#10233f',light='#ffffff';
 const well=contrast(color,dark)>contrast(color,light)?dark:light;
 const marker=contrast(color,light)>=3?color:'#'+channels(color).map((v,i)=>Math.round((v+channels(dark)[i])/2).toString(16).padStart(2,'0')).join('');
 return{color,well,marker};
}
export function playlistColorStyle(value,prefix='card'){const {color,well,marker}=playlistColors(value);return`--${prefix}:${color};--${prefix}-well:${well};--${prefix}-marker:${marker}`}
