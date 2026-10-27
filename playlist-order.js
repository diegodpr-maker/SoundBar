// Merge a visible subset (dashboard/downloads) without moving hidden playlists.
export function mergePlaylistOrder(allIds,visibleIds){
 if(!Array.isArray(allIds)||!Array.isArray(visibleIds)||new Set(allIds).size!==allIds.length||new Set(visibleIds).size!==visibleIds.length||visibleIds.some(id=>!allIds.includes(id)))throw Error('Atualize suas playlists e tente novamente.');
 const visible=new Set(visibleIds);let index=0;return allIds.map(id=>visible.has(id)?visibleIds[index++]:id);
}
