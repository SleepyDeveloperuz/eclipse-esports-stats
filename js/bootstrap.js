// Keep recovery available even when an application dependency fails to load.
(() => {
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    try {
      if (!window.EclipseApp?.init) throw new Error('Application unavailable');
      await window.EclipseApp.init();
    } catch (error) {
      console.error('Application startup failed:', error);
      document.documentElement.classList.add('access-locked');
      const app = document.querySelector('.app-container');
      app?.setAttribute('inert', '');
      app?.setAttribute('aria-hidden', 'true');
      const status = document.getElementById('accessBootstrap');
      if (!status) return;
      status.hidden = false;
      status.setAttribute('role', 'alert');
      status.querySelector('.access-bootstrap__orbit')?.remove();
      const label = status.querySelector('strong');
      if (label) label.textContent = 'Sahifa yuklanmadi. Qayta urinib ko‘ring.';
      const retry = document.getElementById('bootstrapRetry');
      if (retry) {
        retry.hidden = false;
        retry.addEventListener('click', () => window.location.reload(), { once: true });
      }
    }
  }
  // Deferred scripts run while readyState is "interactive", before later
  // dependencies and modules. Wait for DOMContentLoaded in that state too.
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
