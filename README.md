# SoundDeck — PWA Soundboard

App estático com playlists, botões personalizáveis, áudios locais (IndexedDB), reprodução simultânea, atalhos 1–9, controle de volume, parar tudo, importação/exportação de backup JSON e service worker offline.

## Publicar no GitHub Pages

Envie **index.html**, **manifest.webmanifest**, **icon.svg** e **sw.js** para a raiz de um repositório público. Em Settings → Pages, escolha Deploy from a branch, `main`, `/ (root)` e salve.

Os áudios são persistidos no navegador que os importou, **não sincronizam entre dispositivos**, e podem ser apagados quando os dados do site forem limpos. Exporte o backup para preservar áudio e configuração.
