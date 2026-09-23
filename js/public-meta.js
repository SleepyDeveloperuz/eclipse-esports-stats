/* Intentionally no AuthManager, DataStore, cloud sync, roster or private cache. */
(() => {
  const guest = Object.freeze({ isAdmin: () => false, getAccessToken: () => '', getToken: () => '' });
  const meta = new window.MlbbDataManager(guest, null, null, null);
  let toastTimer;
  window.showToast = message => {
    const toast = document.getElementById('publicMetaToast');
    if (!toast) return;
    clearTimeout(toastTimer); toast.textContent = String(message); toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 6500);
  };
  meta.render('metaLabContainer');
  window.addEventListener('pagehide', event => {
    meta.cancelTierExport?.(); meta.closeDossier(); clearTimeout(toastTimer);
    // A back/forward-cache page keeps the ready download link alive.
    if (!event.persisted && meta.exportedPoster) URL.revokeObjectURL(meta.exportedPoster.url);
  });
})();
