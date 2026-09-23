window.AuthManager = class AuthManager {
  constructor(dataStore) {
    this.db = dataStore;
    this.TOKEN_KEY = 'eclipse_admin_token';
    this.SESSION_KEY = 'eclipse_admin_session';
    this.VIEWER_TOKEN_KEY = 'eclipse_viewer_token';
    this.VOTER_KEY = 'eclipse_briefing_voter';
    this.viewerPromptOpen = false;
    this.viewerPromptMandatory = false;
    this.viewerGateRequired = false;
    this.viewerAccessPromise = null;
    this.viewerAccessWaiters = [];
    this.viewerSuccessCallbacks = new Set();
    this.mandatoryClickGuard = null;
    this.mandatoryKeyGuard = null;
  }

  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY) || '';
  }

  getViewerToken() {
    return sessionStorage.getItem(this.VIEWER_TOKEN_KEY) || '';
  }

  getAccessToken() {
    return this.getToken() || this.getViewerToken();
  }

  getVoterId() {
    let value = localStorage.getItem(this.VOTER_KEY);
    if (!value || !/^[a-zA-Z0-9_-]{16,120}$/.test(value)) {
      value = window.crypto?.randomUUID?.() || `ecl_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(this.VOTER_KEY, value);
    }
    return value;
  }

  isAdmin() {
    return !!this.getToken() && sessionStorage.getItem(this.SESSION_KEY) === 'true';
  }

  lockViewerSurface() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.viewerAccess = 'locked';
    const app = document.querySelector('.app-container');
    if (!app) return;
    app.setAttribute('inert', '');
    app.setAttribute('aria-hidden', 'true');
    app.style.visibility = 'hidden';
  }

  unlockViewerSurface() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.viewerAccess = 'granted';
    const app = document.querySelector('.app-container');
    if (!app) return;
    app.removeAttribute('inert');
    app.removeAttribute('aria-hidden');
    app.style.visibility = '';
  }

  clearInvalidToken(tokenType) {
    if (tokenType === 'admin') {
      sessionStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.removeItem(this.SESSION_KEY);
      this.updateUI();
    } else if (tokenType === 'viewer') {
      sessionStorage.removeItem(this.VIEWER_TOKEN_KEY);
    }
  }

  async ensureViewerAccess({ forceCheck = false } = {}) {
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      // A file:// preview can only expose data already stored on this device;
      // it has no server endpoint or remote team dataset to protect.
      this.unlockViewerSurface();
      return true;
    }
    if (this.viewerAccessPromise) return this.viewerAccessPromise;

    this.lockViewerSurface();
    this.viewerAccessPromise = (async () => {
      const candidates = [
        { type: 'admin', token: this.getToken() },
        { type: 'viewer', token: this.getViewerToken() },
        { type: 'anonymous', token: '' }
      ].filter((candidate, index, list) => (
        index === list.findIndex(item => item.token === candidate.token)
      ));

      let response = null;
      let payload = {};
      try {
        for (const candidate of candidates) {
          const headers = candidate.token ? { Authorization: `Bearer ${candidate.token}` } : {};
          response = await fetch('/api/auth?scope=viewer', { headers, cache: 'no-store' });
          payload = await response.json().catch(() => ({}));
          if (response.ok && payload.valid === true) {
            this.viewerGateRequired = payload.viewerRequired === true;
            this.unlockViewerSurface();
            return true;
          }
          if (response.status !== 401) break;
          if (candidate.type !== 'anonymous') this.clearInvalidToken(candidate.type);
        }
      } catch (error) {
        this.showViewerUnavailableModal('Kirish serveri bilan bog‘lanib bo‘lmadi. Internetni tekshirib, qayta urining.');
        return false;
      }

      if (response?.status === 401 && payload.viewerRequired !== false) {
        this.viewerGateRequired = true;
        return new Promise(resolve => {
          this.viewerAccessWaiters.push(resolve);
          if (!this.showViewerLoginModal(null, { mandatory: true })) {
            this.viewerAccessWaiters = this.viewerAccessWaiters.filter(waiter => waiter !== resolve);
            resolve(false);
          }
        });
      }

      const message = payload.error || (response?.status === 404
        ? 'Kirish endpointi topilmadi. Vercel serverless API sozlamasini tekshiring.'
        : 'Jamoa kirish himoyasini tekshirib bo‘lmadi.');
      this.showViewerUnavailableModal(message);
      return false;
    })().finally(() => {
      this.viewerAccessPromise = null;
    });

    return this.viewerAccessPromise;
  }

  async validateSession() {
    const token = this.getToken();
    if (!token || sessionStorage.getItem(this.SESSION_KEY) !== 'true') {
      this.updateUI();
      return false;
    }

    // Keep the UI responsive, then verify the signed session with the server.
    this.updateUI();
    try {
      const response = await fetch('/api/auth', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Session invalid');
      return true;
    } catch {
      sessionStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.removeItem(this.SESSION_KEY);
      this.updateUI();
      return false;
    }
  }

  async login(enteredPassword) {
    if (!enteredPassword || !enteredPassword.trim()) {
      if (window.showToast) window.showToast("Parolni kiriting!", "warning");
      return false;
    }

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: enteredPassword.trim() })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.token && data.role === 'admin') {
        sessionStorage.setItem(this.TOKEN_KEY, data.token);
        sessionStorage.setItem(this.SESSION_KEY, 'true');
        this.updateUI();
        if (window.showToast) window.showToast("👑 Admin rejimi faollashdi! Xavfsiz server sessiyasi ochildi.", "success");
        return true;
      } else {
        if (window.showToast) window.showToast(data.error || "Noto'g'ri parol! Qaytadan urinib ko'ring.", "error");
        return false;
      }
    } catch (err) {
      console.error("Login request failed:", err);
      if (window.showToast) window.showToast("Server bilan bog'lanishda xatolik yuz berdi.", "error");
      return false;
    }
  }

  async loginAccess(enteredPassword) {
    if (!enteredPassword || !enteredPassword.trim()) {
      window.showToast?.('Kirish parolini kiriting', 'warning');
      return false;
    }

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: enteredPassword.trim(),
          role: 'access',
          voterId: this.getVoterId()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token || !['admin', 'viewer'].includes(data.role)) {
        window.showToast?.(data.error || 'Kirish paroli noto‘g‘ri', 'error');
        return false;
      }

      if (data.role === 'admin') {
        sessionStorage.setItem(this.TOKEN_KEY, data.token);
        sessionStorage.setItem(this.SESSION_KEY, 'true');
        if (data.viewerToken) sessionStorage.setItem(this.VIEWER_TOKEN_KEY, data.viewerToken);
        this.updateUI();
        window.showToast?.('👑 Admin rejimi faollashdi', 'success');
      } else {
        sessionStorage.removeItem(this.TOKEN_KEY);
        sessionStorage.removeItem(this.SESSION_KEY);
        sessionStorage.setItem(this.VIEWER_TOKEN_KEY, data.token);
        this.updateUI();
        const activeSection = typeof document === 'undefined' ? null : document.querySelector('.page-section.active');
        if (activeSection && ['page-add-match', 'page-settings'].includes(activeSection.id)) {
          window.EclipseApp?.navigate('dashboard');
        }
        window.showToast?.('Eclipse Command Room ochildi', 'success');
      }
      return true;
    } catch (error) {
      console.error('Access login failed:', error);
      window.showToast?.('Kirish serveri bilan bog‘lanib bo‘lmadi', 'error');
      return false;
    }
  }

  async loginViewer(enteredPassword) {
    return this.loginAccess(enteredPassword);
  }

  async completeViewerAccess() {
    this.viewerGateRequired = true;
    this.unlockViewerSurface();
    this.closeModal({ force: true });

    const waiters = this.viewerAccessWaiters.splice(0);
    waiters.forEach(resolve => resolve(true));

    const callbacks = [...this.viewerSuccessCallbacks];
    this.viewerSuccessCallbacks.clear();
    await Promise.allSettled(callbacks.map(callback => Promise.resolve().then(callback)));
    window.dispatchEvent?.(new CustomEvent('eclipse:viewer-access', { detail: { granted: true } }));
  }

  enableMandatoryModalGuard(modalOverlay) {
    if (!modalOverlay || !this.viewerPromptMandatory) return;
    this.disableMandatoryModalGuard();
    this.mandatoryClickGuard = event => {
      if (this.viewerPromptMandatory && event.target === modalOverlay) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.mandatoryKeyGuard = event => {
      // A top-layer install dialog can close without dismissing the login gate.
      if (event.target.closest?.('#pwaInstallDialog[open]')) return;
      if (this.viewerPromptMandatory && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    modalOverlay.addEventListener('click', this.mandatoryClickGuard, true);
    document.addEventListener('keydown', this.mandatoryKeyGuard, true);
  }

  disableMandatoryModalGuard() {
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay && this.mandatoryClickGuard) {
      modalOverlay.removeEventListener('click', this.mandatoryClickGuard, true);
    }
    if (this.mandatoryKeyGuard) {
      document.removeEventListener('keydown', this.mandatoryKeyGuard, true);
    }
    this.mandatoryClickGuard = null;
    this.mandatoryKeyGuard = null;
  }

  showViewerLoginModal(onSuccess = null, { mandatory = false } = {}) {
    if (typeof onSuccess === 'function') this.viewerSuccessCallbacks.add(onSuccess);
    const mustStayOpen = Boolean(mandatory || this.viewerGateRequired);
    if (this.viewerPromptOpen) {
      this.viewerPromptMandatory = this.viewerPromptMandatory || mustStayOpen;
      document.getElementById('viewer-access-cancel')?.toggleAttribute('hidden', this.viewerPromptMandatory);
      if (this.viewerPromptMandatory) this.enableMandatoryModalGuard(document.getElementById('modalOverlay'));
      return true;
    }
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    if (!modalOverlay || !modalContent) return false;
    this.viewerPromptOpen = true;
    this.viewerPromptMandatory = mustStayOpen;

    modalContent.innerHTML = `
      <section class="auth-dialog auth-dialog--viewer" aria-labelledby="viewerGateTitle">
        <div class="auth-dialog__signalbar" aria-hidden="true">
          <span><i></i> Eclipse secure gateway</span>
          <span>ECL–01</span>
        </div>
        <div class="auth-dialog__mark" aria-hidden="true">
          <svg><use href="assets/eclipse-symbols.svg?v=2.16.0#ecl-mark"></use></svg>
        </div>
        <p class="eyebrow">PRIVATE TEAM SPACE</p>
        <h3 id="viewerGateTitle">Eclipse Command Room</h3>
        <p>Jamoa statistikasi va Briefing yopiq. Jamoa yoki Admin parolini kiriting.</p>
        <form id="viewer-access-form" class="auth-dialog__form">
          <label for="viewer-access-input">Kirish paroli</label>
          <input type="password" id="viewer-access-input" class="form-input" autocomplete="current-password" required />
          <p id="viewer-access-error" class="form-error" hidden></p>
          <div class="auth-dialog__actions">
            ${mustStayOpen ? '' : '<button type="button" class="btn btn-secondary" id="viewer-access-cancel">Bekor qilish</button>'}
            <button type="submit" class="btn btn-primary" id="viewer-access-submit">Kirish</button>
          </div>
        </form>
        <a class="btn btn-secondary public-meta-link" href="/meta-lab">Meta Lab’ni parolsiz ko‘rish <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a>
        <button type="button" class="btn btn-secondary" data-pwa-install>Ilovani o‘rnatish</button>
        <div class="auth-dialog__trust" aria-hidden="true">
          <span><i class="fa-solid fa-lock"></i> Encrypted session</span>
          <span>Team access only</span>
        </div>
      </section>`;

    modalOverlay.classList.add('active');
    modalOverlay.removeAttribute('hidden');
    modalOverlay.setAttribute('aria-hidden', 'false');
    modalOverlay.dataset.mandatory = mustStayOpen ? 'true' : 'false';
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (mustStayOpen) this.enableMandatoryModalGuard(modalOverlay);

    const input = document.getElementById('viewer-access-input');
    const submit = document.getElementById('viewer-access-submit');
    const errorBox = document.getElementById('viewer-access-error');
    requestAnimationFrame(() => input?.focus());

    document.getElementById('viewer-access-cancel')?.addEventListener('click', () => this.closeModal());
    document.getElementById('viewer-access-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Tekshirilmoqda…';
      if (errorBox) errorBox.hidden = true;
      const success = await this.loginAccess(input?.value || '');
      submit.disabled = false;
      submit.textContent = 'Kirish';
      if (success) {
        await this.completeViewerAccess();
      } else if (errorBox) {
        errorBox.textContent = 'Parol tasdiqlanmadi. Qayta urinib ko‘ring.';
        errorBox.hidden = false;
        if (input) {
          input.value = '';
          input.focus();
        }
      }
    });
    return true;
  }

  showViewerUnavailableModal(message) {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    if (!modalOverlay || !modalContent) return false;

    this.viewerPromptOpen = true;
    this.viewerPromptMandatory = true;
    modalContent.innerHTML = `
      <section class="auth-dialog auth-dialog--viewer" aria-labelledby="viewerGateErrorTitle">
        <div class="auth-dialog__mark" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></div>
        <p class="eyebrow">ACCESS LOCKED</p>
        <h3 id="viewerGateErrorTitle">Kirish himoyasi tekshirilmadi</h3>
        <p>${this.escapeHtml(message)}</p>
        <div class="auth-dialog__actions">
          <button type="button" class="btn btn-primary" id="viewer-access-retry">Qayta tekshirish</button>
        </div>
        <a class="btn btn-secondary public-meta-link" href="/meta-lab">Meta Lab’ni parolsiz ko‘rish</a>
        <button type="button" class="btn btn-secondary" data-pwa-install>Ilovani o‘rnatish</button>
      </section>`;
    modalOverlay.classList.add('active');
    modalOverlay.removeAttribute('hidden');
    modalOverlay.setAttribute('aria-hidden', 'false');
    modalOverlay.dataset.mandatory = 'true';
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this.enableMandatoryModalGuard(modalOverlay);
    document.getElementById('viewer-access-retry')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      this.closeModal({ force: true });
      const granted = await this.ensureViewerAccess({ forceCheck: true });
      if (granted && window.location?.reload) window.location.reload();
    });
    return true;
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  logout() {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.SESSION_KEY);
    this.updateUI();
    if (window.showToast) window.showToast("Kuzatuvchi rejimiga o'tildi (Faqat ko'rish).", "info");
    
    // If currently on admin-only page, navigate to dashboard
    const activeSection = document.querySelector('.page-section.active');
    if (activeSection && (activeSection.id === 'page-add-match' || activeSection.id === 'page-settings')) {
      window.EclipseApp.navigate('dashboard');
    }
  }

  showLoginModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    if (!modalOverlay || !modalContent || (this.viewerPromptOpen && this.viewerPromptMandatory)) return;
    this.viewerPromptMandatory = false;

    modalContent.innerHTML = `
      <div style="text-align:center; padding:1.5rem 1rem;">
        <div style="width:68px; height:68px; border-radius:50%; background:var(--secondary-subtle); color:var(--secondary); display:flex; align-items:center; justify-content:center; margin:0 auto 1.25rem auto; font-size:2rem; border:2px solid rgba(var(--secondary-rgb),0.34); box-shadow:0 0 25px rgba(var(--secondary-rgb),0.2);">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
        <h3 style="font-size:1.6rem; color:var(--text-primary); margin:0 0 0.5rem 0; font-weight:700;">Murabbiy / Admin Kirish</h3>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin:0 0 1.5rem 0; max-width:340px; margin-left:auto; margin-right:auto; line-height:1.4;">
          Matchlarni qo'shish, tahrirlash va jamoani boshqarish uchun <strong>Admin Paroli</strong>ni kiriting.
        </p>

        <form id="admin-pin-form">
          <div class="form-group" style="margin-bottom:1.5rem;">
            <div style="position:relative; max-width:300px; margin:0 auto;">
              <input type="password" id="admin-pin-input" class="form-input" placeholder="Parolni kiriting..." style="text-align:center; font-size:1.15rem; padding:0.8rem 1rem; border-color:var(--primary); background:rgba(0,0,0,0.5); letter-spacing:0.1em;" autofocus required autocomplete="current-password" />
              <button type="button" id="toggle-pw-btn" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:1rem; padding:4px;" title="Parolni ko'rsatish">
                <i class="fa-regular fa-eye" id="toggle-pw-icon"></i>
              </button>
            </div>
            <div id="login-error-msg" style="color:var(--danger); font-size:0.8rem; margin-top:0.5rem; display:none;"></div>
          </div>

          <div style="display:flex; justify-content:center; gap:0.75rem;">
            <button type="button" class="btn btn-secondary" id="cancel-pin-btn" style="min-width:110px;">Bekor qilish</button>
            <button type="submit" class="btn btn-primary" id="submit-login-btn" style="min-width:120px;"><i class="fa-solid fa-key"></i> Kirish</button>
          </div>
        </form>
      </div>
    `;

    modalOverlay.classList.add('active');
    modalOverlay.removeAttribute('hidden');
    modalOverlay.setAttribute('aria-hidden', 'false');
    modalOverlay.dataset.mandatory = 'false';
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Show/hide password toggle
    const toggleBtn = document.getElementById('toggle-pw-btn');
    const pwInput = document.getElementById('admin-pin-input');
    const pwIcon = document.getElementById('toggle-pw-icon');
    if (toggleBtn && pwInput && pwIcon) {
      toggleBtn.addEventListener('click', () => {
        if (pwInput.type === 'password') {
          pwInput.type = 'text';
          pwIcon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
          pwInput.type = 'password';
          pwIcon.classList.replace('fa-eye-slash', 'fa-eye');
        }
      });
    }

    setTimeout(() => {
      if (pwInput) pwInput.focus();
    }, 50);

    document.getElementById('cancel-pin-btn')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('admin-pin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('submit-login-btn');
      const errorMsg = document.getElementById('login-error-msg');
      const pin = document.getElementById('admin-pin-input').value.trim();

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tekshirilmoqda...';
      }
      if (errorMsg) errorMsg.style.display = 'none';

      const success = await this.login(pin);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-key"></i> Kirish';
      }

      if (success) {
        this.closeModal();
      } else if (errorMsg) {
        errorMsg.textContent = "Xato parol! Qaytadan urinib ko'ring.";
        errorMsg.style.display = 'block';
        if (pwInput) {
          pwInput.value = '';
          pwInput.focus();
        }
      }
    });
  }

  closeModal({ force = false } = {}) {
    if (this.viewerPromptMandatory && !force) return false;
    this.disableMandatoryModalGuard();
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) {
      modalOverlay.classList.remove('active');
      modalOverlay.setAttribute('aria-hidden', 'true');
      modalOverlay.style.display = 'none';
      delete modalOverlay.dataset.mandatory;
      document.body.style.overflow = '';
    }
    this.viewerPromptOpen = false;
    this.viewerPromptMandatory = false;
    return true;
  }

  updateUI() {
    if (typeof document === 'undefined') return;
    const isAdmin = this.isAdmin();

    const progress = window.EclipseApp?.progressHub;
    if (progress && !isAdmin) progress.history = null;
    if (progress && document.getElementById('page-progress')?.classList.contains('active')) progress.render();
    window.EclipseApp?.batchManager?.onAuthChange();

    // Update topbar auth status
    const authContainer = document.getElementById('topbarAuthContainer');
    if (authContainer) {
      if (isAdmin) {
        authContainer.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="badge" style="background:var(--secondary-gradient); color:#071019; font-weight:800; font-size:0.75rem; padding:4px 10px; border-radius:6px; box-shadow:0 0 10px rgba(var(--secondary-rgb),0.24);">
              <i class="fa-solid fa-crown"></i> ADMIN REJIMI
            </span>
            <button id="authLogoutBtn" class="btn btn-sm btn-secondary" title="Kuzatuvchi rejimiga o'tish" style="border-color:rgba(239,68,68,0.4); color:var(--danger); padding:4px 10px; cursor:pointer;">
              <i class="fa-solid fa-right-from-bracket"></i> Chiqish
            </button>
          </div>
        `;
        document.getElementById('authLogoutBtn')?.addEventListener('click', () => this.logout());
      } else {
        authContainer.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:0.75rem; border:1px solid var(--border-light);">
              <i class="fa-solid fa-eye"></i> KUZATUVCHI
            </span>
            <button id="authLoginBtn" class="btn btn-sm btn-secondary" aria-label="Admin kirish" title="Admin kirish" style="border-color:var(--secondary); color:var(--secondary); font-weight:600; padding:4px 12px; cursor:pointer;">
              <i class="fa-solid fa-lock"></i> <span>Admin Kirish</span>
            </button>
          </div>
        `;
        document.getElementById('authLoginBtn')?.addEventListener('click', () => this.showLoginModal());
      }
    }

    // Toggle admin-only elements across the app
    document.querySelectorAll('.admin-only').forEach(el => {
      if (isAdmin) {
        el.classList.remove('hidden');
        el.style.display = '';
      } else {
        el.classList.add('hidden');
        el.style.display = 'none';
      }
    });
    // Re-render components that have conditional edit/delete buttons if visible
    const activeSection = document.querySelector('.page-section.active');
    if (activeSection) {
      const pageId = activeSection.id.replace('page-', '');
      if (pageId === 'match-history') {
        const matches = this.db.getMatches();
        const players = this.db.getPlayers();
        if (window.MatchManager && window.EclipseApp && window.EclipseApp.matchManager) {
          window.EclipseApp.matchManager.renderMatchHistory('matchHistoryContainer', matches, players);
        }
      } else if (pageId === 'players') {
        if (window.PlayerManager && window.EclipseApp && window.EclipseApp.playerManager) {
          window.EclipseApp.playerManager.renderAddPlayerForm('addPlayerContainer');
          window.EclipseApp.playerManager.renderPlayersList('playersListContainer');
        }
      } else if (pageId === 'briefing') {
        window.EclipseApp?.briefingManager?.refreshForAuthChange();
      } else if (pageId === 'submissions') {
        window.EclipseApp?.submissionManager?.refreshForAuthChange();
      }
    }
  }

  protectAction(callback) {
    if (this.isAdmin()) {
      callback();
    } else {
      if (window.showToast) window.showToast("Bu amalni bajarish uchun Admin parolini kiriting", "warning");
      this.showLoginModal();
    }
  }
};
