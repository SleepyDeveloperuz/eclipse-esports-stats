(() => {
  'use strict';
  let installPrompt = null;
  let dialog = null;
  let installTrigger = null;
  const standalone = window.matchMedia?.('(display-mode: standalone)');
  const markStandalone = () => document.documentElement.classList.toggle('pwa-standalone',
    Boolean(standalone?.matches || navigator.standalone));
  markStandalone();
  standalone?.addEventListener?.('change', markStandalone);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.documentElement.classList.add('pwa-installed');
    if (dialog?.open) dialog.close();
  });

  function showInstructions(trigger) {
    installTrigger = trigger;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'pwaInstallDialog';
      dialog.className = 'pwa-dialog';
      dialog.setAttribute('aria-labelledby', 'pwaInstallTitle');
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const steps = ios
        ? '<li>Saytni <strong>Safari</strong> orqali oching.</li><li><strong>Share / Ulashish</strong> menyusidan <strong>Add to Home Screen</strong>ni tanlang.</li><li>Agar ko‘rinsa, <strong>Open as Web App</strong>ni yoqing va <strong>Add</strong>ni bosing.</li>'
        : /Android/.test(navigator.userAgent)
          ? '<li>Saytni <strong>Chrome</strong> orqali oching.</li><li>⋮ menyusidan <strong>Install app</strong> yoki <strong>Add to Home screen</strong>ni tanlang.</li><li><strong>Install</strong> orqali tasdiqlang.</li>'
          : '<li>Chrome yoki Edge manzil qatoridagi <strong>Install</strong> belgisini yoki brauzer menyusini oching.</li><li>Mac Safari’da <strong>File → Add to Dock</strong>ni tanlashingiz mumkin.</li>';
      dialog.innerHTML = '<button type="button" class="pwa-close" aria-label="Yopish">×</button>' +
        '<img src="/assets/eclipse-app-192.png" width="64" height="64" alt="">' +
        '<p class="pwa-eyebrow">ECLIPSE / ONE TAP AWAY</p><h2 id="pwaInstallTitle">Eclipse doim yoningizda.</h2>' +
        '<ol>' + steps + '</ol><p class="pwa-muted">O‘rnatilgan bo‘lsa, bosh ekrandagi Eclipse belgisini oching. Brauzerga qarab menyu nomi farq qilishi mumkin.</p>' +
        '<p class="pwa-muted">Ilova jamoa kirish sahifasidan ochiladi; ommaviy Meta Lab ham mavjud. Internet va jamoa bo‘limlari uchun parol kerak. App Store yoki Play Store talab qilinmaydi.</p>';
      document.body.append(dialog);
      dialog.querySelector('.pwa-close').addEventListener('click', () => dialog.close());
      dialog.addEventListener('keydown', event => event.stopPropagation());
      dialog.addEventListener('close', () => {
        if (installTrigger?.isConnected) installTrigger.focus();
      });
    }
    if (!dialog.open) dialog.showModal();
  }

  document.addEventListener('click', async event => {
    const trigger = event.target.closest?.('[data-pwa-install]');
    if (!trigger) return;
    event.preventDefault();
    if (!installPrompt) { showInstructions(trigger); return; }
    const prompt = installPrompt;
    installPrompt = null;
    trigger.disabled = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      showInstructions(trigger);
    } finally {
      trigger.disabled = false;
    }
  });

  function showUpdateNotice() {
    if (document.getElementById('pwaUpdateNotice')) return;
    const notice = document.createElement('aside');
    notice.id = 'pwaUpdateNotice';
    notice.className = 'pwa-update';
    notice.setAttribute('aria-label', 'Ilova yangilanishi');
    notice.innerHTML = '<p role="status"><strong>Yangi versiya tayyor.</strong> Ishingizni saqlang. Yangilanish uchun barcha Eclipse oynalarini yoping va ilovani qayta oching.</p><button type="button" class="pwa-close" aria-label="Bildirishnomani yopish">×</button>';
    notice.querySelector('button').addEventListener('click', () => notice.remove());
    document.body.append(notice);
  }

  if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateNotice();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateNotice();
        });
      });
    }).catch(() => { /* Installation is optional: keep the online website working. */ });
  }
})();
