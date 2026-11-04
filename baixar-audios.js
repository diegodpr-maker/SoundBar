(() => {
  const endpoint = 'https://fcmsojjtkiehsobbkjnr.supabase.co/functions/v1/harmony-audio-export-once';
  const key = new URLSearchParams(location.hash.slice(1)).get('chave') || '';
  const status = document.querySelector('#status');
  const retry = document.querySelector('#retry');
  const downloads = document.querySelector('#downloads');
  const parts = document.querySelector('#parts');
  const formatSize = size => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(size / 1000000) + ' MB';
  const downloadURL = part => endpoint + '?k=' + encodeURIComponent(key) + (part ? '&part=' + part : '');
  async function load() {
    downloads.hidden = true; retry.hidden = true;
    status.textContent = 'Preparando seu download…';
    if (!/^[a-f0-9]{64}$/.test(key)) { status.textContent = 'Abra o link de download recebido.'; return; }
    try {
      const response = await fetch(downloadURL() + '&info=1', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30000) });
      if (response.status === 410) { status.textContent = 'Este link expirou. Solicite um novo download.'; return; }
      if (!response.ok) throw Error('Unavailable');
      const data = await response.json();
      if (!Number.isSafeInteger(data.audio_files) || !Number.isFinite(data.size) || !Array.isArray(data.parts) || data.parts.length > 1000) throw Error('Invalid download');
      status.textContent = data.audio_files + ' áudios · ' + formatSize(data.size);
      const complete = document.querySelector('#complete');
      complete.href = downloadURL(); complete.download = data.filename;
      complete.textContent = 'Baixar pacote completo · ' + formatSize(data.size);
      parts.replaceChildren();
      data.parts.forEach((part, index) => {
        const link = document.createElement('a');
        link.className = 'part'; link.href = downloadURL(index + 1); link.download = part.filename;
        const title = document.createElement('span'); title.textContent = 'Parte ' + (index + 1);
        const size = document.createElement('small'); size.textContent = formatSize(part.size);
        link.append(title, size); parts.append(link);
      });
      const expires = new Date(data.expires_at);
      document.querySelector('#expiry').textContent = Number.isNaN(expires.getTime()) ? '' : 'Disponível até ' + expires.toLocaleDateString('pt-BR') + '.';
      downloads.hidden = false;
    } catch { status.textContent = 'Não foi possível abrir este download. Tente novamente.'; retry.hidden = false; }
  }
  retry.addEventListener('click', load);
  void load();
})();
