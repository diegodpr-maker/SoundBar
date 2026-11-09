/* One update coordinator for installed and browser sessions. No account data is reset. */
(() => {
  if (window.harmonyUpdates || !('serviceWorker' in navigator)) return;
  const VERSION = 62;
  const sw = navigator.serviceWorker;
  const workerURL = new URL('./sw.js', document.currentScript.src);
  const requiresGuard = /\/(app|login|local)\.html$/.test(location.pathname);
  let ready = !requiresGuard, guard = () => false, holds = 0, registration;
  let checking = false, lastCheck = 0, retry, preparing = false, frozen = false;
  let unlockTimer, reloading = false, pendingVersion = null, previousInert = false;
  const dirtyForms = new Set();
  let lastInteraction = 0;

  function busy(allowHidden = false) {
    if (!ready || holds || (!allowHidden && document.hidden) || document.body?.classList.contains('event-mode')) return true;
    if (Date.now() - lastInteraction < 2000 || document.body?.classList.contains('menu-open')) return true;
    if (document.querySelector('dialog[open],#modalback.show')) return true;
    if (document.querySelector('form button[type="submit"]:disabled,form input[type="submit"]:disabled')) return true;
    for (const form of dirtyForms) {
      if (!form.isConnected) { dirtyForms.delete(form); continue; }
      if (form.closest('dialog') && !form.closest('dialog').open) continue;
      if (form.closest('#modalback') && !form.closest('#modalback').classList.contains('show')) continue;
      return true;
    }
    try { return !!guard(); } catch { return true; }
  }

  function unlock() {
    clearTimeout(unlockTimer);
    if (frozen) document.documentElement.inert = previousInert;
    frozen = false;
  }
  function freeze() {
    if (!frozen) { previousInert = document.documentElement.inert; document.documentElement.inert = true; }
    frozen = true;
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(unlock, 8000);
  }
  function schedule() {
    clearTimeout(retry);
    retry = setTimeout(apply, 1500);
  }
  function reload() {
    if (reloading || pendingVersion === null || pendingVersion <= VERSION || busy(true)) { unlock(); return; }
    // The worker installs a complete, versioned shell before this can run.
    reloading = true;
    freeze();
    location.reload();
  }
  async function workerVersion(worker) {
    if (!worker) return null;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 1800);
      channel.port1.onmessage = event => {
        clearTimeout(timer); channel.port1.close();
        resolve(Number.isSafeInteger(event.data?.version) ? event.data.version : null);
      };
      try { worker.postMessage({ type: 'HARMONY_VERSION' }, [channel.port2]); }
      catch { clearTimeout(timer); channel.port1.close(); resolve(null); }
    });
  }
  async function apply() {
    clearTimeout(retry);
    if (reloading || preparing) return;
    if (pendingVersion !== null && pendingVersion > VERSION) {
      if (busy(true)) { schedule(); return; }
      reload(); return;
    }
    const waiting = registration?.waiting;
    if (!waiting) return;
    if (busy()) { schedule(); return; }
    preparing = true;
    const channel = new MessageChannel();
    const timer = setTimeout(() => { preparing = false; channel.port1.close(); unlock(); schedule(); }, 4500);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close(); preparing = false;
      if (!event.data?.accepted) unlock();
      schedule();
    };
    try { waiting.postMessage({ type: 'HARMONY_APPLY_UPDATE' }, [channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); preparing = false; unlock(); schedule(); }
  }
  function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') void apply();
    });
  }
  async function check(force = false) {
    if (navigator.onLine === false || document.hidden || checking) return;
    if (!force && Date.now() - lastCheck < 15000) { void apply(); return; }
    checking = true; lastCheck = Date.now();
    try {
      if (!registration) {
        registration = await sw.register(workerURL.href, { updateViaCache: 'none' });
        registration.addEventListener('updatefound', () => watch(registration.installing));
        watch(registration.installing);
      }
      await registration.update();
      const version = await workerVersion(sw.controller);
      if (version !== null && version > VERSION) pendingVersion = version;
      void apply();
    } catch { /* Offline and transient deployment failures keep the installed version. */ }
    finally { checking = false; }
  }

  sw.addEventListener('controllerchange', async () => {
    const version = await workerVersion(sw.controller);
    if (version === null || version <= VERSION) { unlock(); return; }
    pendingVersion = version;
    void apply();
  });
  sw.addEventListener('message', event => {
    const message = event.data;
    if (!message || !['HARMONY_CAN_UPDATE', 'HARMONY_PREPARE_UPDATE', 'HARMONY_CANCEL_UPDATE'].includes(message.type)) return;
    if (event.source?.scriptURL !== workerURL.href) return;
    if (message.type === 'HARMONY_CANCEL_UPDATE') { unlock(); return; }
    const accepted = !busy(true);
    if (accepted && message.type === 'HARMONY_PREPARE_UPDATE') freeze();
    event.ports[0]?.postMessage({ accepted, version: VERSION });
  });
  function changed(event) {
    const field = event.target;
    const form = field.form;
    if (form && field.type !== 'range') dirtyForms.add(form);
  }
  const interacted = () => { lastInteraction = Date.now(); };
  document.addEventListener('pointerdown', interacted, true);
  document.addEventListener('keydown', interacted, true);
  document.addEventListener('input', changed, true);
  document.addEventListener('change', changed, true);
  document.addEventListener('reset', event => { dirtyForms.delete(event.target); schedule(); }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { void check(); void apply(); } });
  window.addEventListener('pageshow', () => { void check(); void apply(); });
  window.addEventListener('focus', () => { void check(); void apply(); });
  window.addEventListener('online', () => { void check(true); });
  window.addEventListener('pagehide', () => { clearTimeout(retry); unlock(); });
  setInterval(() => { if (!document.hidden) void check(true); }, 60000);
  window.harmonyUpdates = {
    ready(predicate = () => false) { guard = predicate; ready = true; void apply(); },
    hold() { holds++; let released = false; return () => { if (!released) { released = true; holds--; void apply(); } }; },
    check: () => check(true),
  };
  void check(true);
})();
