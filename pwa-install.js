/* Installation is offered in the browser only, without interrupting audio controls. */
(() => {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = ios || navigator.userAgentData?.mobile || /Android/i.test(navigator.userAgent || '');
  if (!mobile) return;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const minimal = window.matchMedia('(display-mode: minimal-ui)');
  const installed = () => navigator.standalone || standalone.matches || minimal.matches;
  if (installed()) return;
  const key = 'harmony-install-dismissed-until';
  const week = 7 * 24 * 60 * 60 * 1000;
  let dismissedUntil = 0, deferredPrompt = null, installedHere = false;
  let card, spacer, sheet, action, message, pending = false, previousFocus;
  try { dismissedUntil = Number(localStorage.getItem(key)) || 0; } catch {}
  function dismiss() {
    dismissedUntil = Date.now() + week;
    try { localStorage.setItem(key, String(dismissedUntil)); } catch {}
    update();
  }
  function update() {
    if (!card) return;
    const visible = !installedHere && !installed() && dismissedUntil <= Date.now() && (ios || !!deferredPrompt);
    card.hidden = spacer.hidden = !visible;
    if ((installedHere || installed()) && sheet.open) sheet.close();
  }
  function instructions() {
    previousFocus = document.activeElement;
    if (!sheet.open) sheet.showModal();
  }
  function mount() {
    if (document.querySelector('#harmony-install')) return;
    card = document.createElement('aside');
    card.id = 'harmony-install';
    card.className = 'pwa-install-card';
    card.hidden = true;
    card.setAttribute('aria-label', 'Instalar Harmony');
    card.innerHTML = '<img src="harmony-rgb-192.png" width="44" height="44" alt=""><div class="pwa-install-copy"><strong>Harmony no seu celular</strong><span>Seu estúdio na tela inicial.</span></div><button type="button" class="btn primary small" data-install>Instalar</button><button type="button" class="pwa-install-close" data-dismiss aria-label="Dispensar convite de instalação">×</button>';
    spacer = document.createElement('div');
    spacer.className = 'pwa-install-space';
    spacer.hidden = true;
    spacer.setAttribute('aria-hidden', 'true');
    sheet = document.createElement('dialog');
    sheet.className = 'pwa-install-sheet';
    sheet.setAttribute('aria-labelledby', 'pwa-install-title');
    sheet.innerHTML = '<button type="button" class="pwa-install-close" data-close aria-label="Fechar instruções">×</button><img src="harmony-rgb-192.png" width="56" height="56" alt=""><h2 id="pwa-install-title">Instale o Harmony</h2><ol><li>Abra esta página no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> (quadrado com seta para cima).</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</li></ol><button type="button" class="btn primary" data-done>Entendi</button>';
    document.body.append(spacer, card, sheet);
    action = card.querySelector('[data-install]');
    message = card.querySelector('.pwa-install-copy span');
    card.querySelector('[data-dismiss]').addEventListener('click', dismiss);
    sheet.querySelector('[data-close]').addEventListener('click', () => sheet.close());
    sheet.querySelector('[data-done]').addEventListener('click', () => { sheet.close(); dismiss(); });
    sheet.addEventListener('close', () => previousFocus?.isConnected && previousFocus.focus());
    action.addEventListener('click', async () => {
      if (pending) return;
      if (installed() || installedHere) { update(); return; }
      if (!deferredPrompt) { if (ios) instructions(); return; }
      const prompt = deferredPrompt;
      deferredPrompt = null;
      pending = true;
      action.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') { installedHere = true; update(); }
        else dismiss();
      } catch {
        message.textContent = 'No menu do navegador, escolha Instalar app.';
        action.hidden = true;
      } finally { pending = false; action.disabled = false; }
    });
    update();
  }
  window.addEventListener('beforeinstallprompt', event => {
    if (installed() || installedHere) return;
    event.preventDefault();
    deferredPrompt = event;
    if (action) { action.hidden = false; message.textContent = 'Seu estúdio na tela inicial.'; }
    update();
  });
  window.addEventListener('appinstalled', () => { installedHere = true; deferredPrompt = null; update(); });
  standalone.addEventListener?.('change', update);
  minimal.addEventListener?.('change', update);
  window.addEventListener('pageshow', update);
  window.addEventListener('storage', event => {
    if (event.key === key) { dismissedUntil = Number(event.newValue) || 0; update(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
  // Login must be installable even before the user enters their studio.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
