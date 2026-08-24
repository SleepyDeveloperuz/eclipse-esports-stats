window.AuthManager = class AuthManager {
  constructor(dataStore) {
    this.db = dataStore;
    this.PIN_KEY = 'eclipse_admin_pin';
    this.SESSION_KEY = 'eclipse_admin_session';
    this.DEFAULT_PIN = '7777';
    
    // Check if session is currently active
    this.authenticated = sessionStorage.getItem(this.SESSION_KEY) === 'true';
  }

  getStoredPin() {
    return localStorage.getItem(this.PIN_KEY) || this.DEFAULT_PIN;
  }

  isAdmin() {
    return this.authenticated;
  }

  login(enteredPin) {
    const correctPin = this.getStoredPin();
    if (enteredPin === correctPin) {
      this.authenticated = true;
      sessionStorage.setItem(this.SESSION_KEY, 'true');
      this.updateUI();
      if (window.showToast) window.showToast("Admin rejimi faollashdi! Barcha boshqaruv tugmalari ochildi.", "success");
      return true;
    } else {
      if (window.showToast) window.showToast("Xato PIN-kod! Qaytadan urinib ko'ring.", "error");
      return false;
    }
  }

  logout() {
    this.authenticated = false;
    sessionStorage.removeItem(this.SESSION_KEY);
    this.updateUI();
    if (window.showToast) window.showToast("Kuzatuvchi rejimiga o'tildi (Faqat ko'rish).", "info");
    
    // If currently on add-match page, navigate to dashboard
    const activeSection = document.querySelector('.page-section.active');
    if (activeSection && activeSection.id === 'page-add-match') {
      window.EclipseApp.navigate('dashboard');
    }
  }

  setNewPin(oldPin, newPin) {
    const currentPin = this.getStoredPin();
    if (oldPin !== currentPin) {
      if (window.showToast) window.showToast("Eski PIN-kod noto'g'ri!", "error");
      return false;
    }
    if (!newPin || newPin.length < 4) {
      if (window.showToast) window.showToast("Yangi PIN-kod kamida 4 ta raqamdan iborat bo'lishi kerak!", "warning");
      return false;
    }

    localStorage.setItem(this.PIN_KEY, newPin);
    if (window.showToast) window.showToast("Yangi PIN-kod muvaffaqiyatli saqlandi!", "success");
    return true;
  }

  showLoginModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    if (!modalOverlay || !modalContent) return;

    modalContent.innerHTML = `
      <div style="text-align:center; padding:1rem;">
        <div style="width:64px; height:64px; border-radius:50%; background:rgba(255,215,0,0.15); color:var(--secondary); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem auto; font-size:1.75rem; border:2px solid rgba(255,215,0,0.4);">
          <i class="fa-solid fa-lock"></i>
        </div>
        <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0 0 0.5rem 0;">Murabbiy / Admin Kirish</h3>
        <p style="color:var(--text-secondary); font-size:0.875rem; margin:0 0 1.5rem 0;">
          Matchlarni qo'shish, tahrirlash va jamoani boshqarish uchun <strong>PIN-kod</strong>ni kiriting.
        </p>

        <form id="admin-pin-form">
          <div class="form-group" style="margin-bottom:1.5rem;">
            <input type="password" id="admin-pin-input" class="form-input" placeholder="••••" maxlength="8" style="text-align:center; font-size:1.75rem; letter-spacing:0.5em; max-width:200px; margin:0 auto; font-family:monospace;" autofocus required />
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.5rem;">Boshlang'ich default PIN: <strong>7777</strong></div>
          </div>

          <div style="display:flex; justify-content:center; gap:0.75rem;">
            <button type="button" class="btn btn-secondary" id="cancel-pin-btn">Bekor qilish</button>
            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-key"></i> Kirish</button>
          </div>
        </form>
      </div>
    `;

    modalOverlay.removeAttribute('hidden');
    modalOverlay.removeAttribute('aria-hidden');
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const input = document.getElementById('admin-pin-input');
    if (input) input.focus();

    document.getElementById('cancel-pin-btn')?.addEventListener('click', () => {
      this.closeModal();
    });

    document.getElementById('admin-pin-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = document.getElementById('admin-pin-input').value.trim();
      if (this.login(pin)) {
        this.closeModal();
      }
    });
  }

  closeModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) {
      modalOverlay.setAttribute('aria-hidden', 'true');
      modalOverlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  updateUI() {
    if (typeof document === 'undefined') return;
    const isAdmin = this.isAdmin();

    // Update topbar auth status
    const authContainer = document.getElementById('topbarAuthContainer');
    if (authContainer) {
      if (isAdmin) {
        authContainer.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span class="badge" style="background:linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%); color:#000; font-weight:800; font-size:0.75rem; padding:4px 10px; border-radius:6px; box-shadow:0 0 10px rgba(255,215,0,0.3);">
              <i class="fa-solid fa-crown"></i> ADMIN REJIMI
            </span>
            <button id="authLogoutBtn" class="btn btn-sm btn-secondary" title="Kuzatuvchi rejimiga o'tish" style="border-color:rgba(239,68,68,0.4); color:var(--danger); padding:4px 10px;">
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
            <button id="authLoginBtn" class="btn btn-sm btn-secondary" style="border-color:var(--secondary); color:var(--secondary); font-weight:600; padding:4px 12px;">
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
      } else {
        el.classList.add('hidden');
      }
    });

    // Re-render components that have conditional edit/delete buttons if visible
    const activeSection = document.querySelector('.page-section.active');
    if (activeSection) {
      const pageId = activeSection.id.replace('page-', '');
      if (pageId === 'match-history') {
        const matches = this.db.getMatches();
        const players = this.db.getPlayers();
        if (window.MatchManager && window.EclipseApp.matchManager) {
          window.EclipseApp.matchManager.renderMatchHistory('matchHistoryContainer', matches, players);
        }
      } else if (pageId === 'players') {
        if (window.PlayerManager && window.EclipseApp.playerManager) {
          window.EclipseApp.playerManager.renderPlayersList('playersListContainer');
        }
      }
    }
  }

  protectAction(callback) {
    if (this.isAdmin()) {
      callback();
    } else {
      if (window.showToast) window.showToast("Bu amalni bajarish uchun Admin / Murabbiy parolini kiriting", "warning");
      this.showLoginModal();
    }
  }
};
