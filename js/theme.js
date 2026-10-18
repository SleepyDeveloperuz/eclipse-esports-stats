// Eclipse Esports — Cyber Accent Theme & Sound Pack Customizer
(() => {
  'use strict';

  const THEMES = [
    { key: 'gold', name: 'Eclipse Gold', color: '#e7c36b', bg: '#1c180e' },
    { key: 'cyan', name: 'Neon Cyan', color: '#4ee2db', bg: '#081c1b' },
    { key: 'violet', name: 'Cyber Violet', color: '#c084fc', bg: '#170e24' },
    { key: 'crimson', name: 'Crimson Red', color: '#f43f5e', bg: '#22080f' }
  ];

  class ThemeManager {
    constructor() {
      this.storageKey = 'eclipse:theme';
      this.currentTheme = 'gold';
      this.dialog = null;
      this.readPreference();
      this.applyTheme(this.currentTheme, false);
      this.initUi();
    }

    readPreference() {
      try {
        const saved = localStorage.getItem(this.storageKey);
        if (saved && THEMES.some(t => t.key === saved)) {
          this.currentTheme = saved;
        }
      } catch (_) {}
    }

    applyTheme(themeKey, showToastNotification = true) {
      const theme = THEMES.find(t => t.key === themeKey) || THEMES[0];
      this.currentTheme = theme.key;
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-theme', theme.key);
        if (document.documentElement.dataset) {
          document.documentElement.dataset.theme = theme.key;
        }
      }

      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(this.storageKey, theme.key);
        }
      } catch (_) {}

      this.updateTriggerButton();

      if (showToastNotification && window.showToast) {
        window.showToast(`Mavzu o‘zgartirildi: ${theme.name} 🎨`);
        window.EclipseAudio?.playSuccess?.();
      }
    }

    cycleTheme() {
      const currentIndex = THEMES.findIndex(t => t.key === this.currentTheme);
      const nextIndex = (currentIndex + 1) % THEMES.length;
      this.applyTheme(THEMES[nextIndex].key, true);
    }

    updateTriggerButton() {
      const btn = document.getElementById('themeSwitcherBtn');
      if (!btn) return;
      const theme = THEMES.find(t => t.key === this.currentTheme) || THEMES[0];
      btn.setAttribute('title', `Mavzu: ${theme.name} (T)`);
      btn.style.setProperty('--current-theme-color', theme.color);
    }

    initUi() {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.setupListeners());
      } else {
        this.setupListeners();
      }
    }

    setupListeners() {
      this.updateTriggerButton();

      document.addEventListener('click', event => {
        const btn = event.target.closest('#themeSwitcherBtn');
        if (btn) {
          event.preventDefault();
          this.openModal();
        }
      });

      // Keyboard shortcut 'T' to open or cycle themes
      document.addEventListener('keydown', event => {
        if (event.key?.toLowerCase() === 't' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
          event.preventDefault();
          this.openModal();
        }
      });
    }

    ensureDialog() {
      if (this.dialog) return this.dialog;

      const dialog = document.createElement('dialog');
      dialog.id = 'themeSettingsDialog';
      dialog.className = 'theme-settings-dialog';
      dialog.setAttribute('aria-labelledby', 'themeSettingsTitle');

      dialog.innerHTML = `
        <div class="theme-modal">
          <div class="theme-modal__header">
            <div>
              <p class="theme-modal__eyebrow">ECLIPSE CUSTOMIZER // UX</p>
              <h3 id="themeSettingsTitle"><i class="fa-solid fa-palette" style="color:var(--primary);"></i> Mavzular & Ovoz</h3>
            </div>
            <button type="button" class="theme-modal__close" id="themeModalCloseBtn" aria-label="Yopish"><kbd>Esc</kbd></button>
          </div>
          <div class="theme-modal__body">
            <div class="theme-section">
              <label class="theme-section__title">KIBER AKSENT MAVZULARI</label>
              <div class="theme-grid">
                ${THEMES.map(t => `
                  <button type="button" class="theme-card ${t.key === this.currentTheme ? 'is-active' : ''}" data-theme-pick="${t.key}" style="--chip-color:${t.color}; --chip-bg:${t.bg};">
                    <span class="theme-card__circle" style="background:${t.color}; box-shadow: 0 0 14px ${t.color};"></span>
                    <strong class="theme-card__name">${t.name}</strong>
                    <span class="theme-card__check"><i class="fa-solid fa-check"></i></span>
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="theme-section" style="margin-top:1.25rem;">
              <label class="theme-section__title">OVOZ EFFECTLARI (SFX PACK)</label>
              <div class="sound-pack-grid">
                <button type="button" class="sound-pack-card" data-sound-pack="cyber">
                  <div class="sound-pack-card__info">
                    <strong><i class="fa-solid fa-wave-square"></i> Eclipse Cyber</strong>
                    <small>Silliq kiber-sintezator tovushlari</small>
                  </div>
                  <span class="sound-pack-badge">Standart</span>
                </button>
                <button type="button" class="sound-pack-card" data-sound-pack="arena">
                  <div class="sound-pack-card__info">
                    <strong><i class="fa-solid fa-trophy"></i> Tournament Arena</strong>
                    <small>Pastki bass va stadion akkordlari</small>
                  </div>
                  <span class="sound-pack-badge">Arena</span>
                </button>
                <button type="button" class="sound-pack-card" data-sound-pack="arcade">
                  <div class="sound-pack-card__info">
                    <strong><i class="fa-solid fa-gamepad"></i> Retro 8-Bit</strong>
                    <small>Chiptune vintage o‘yin signallari</small>
                  </div>
                  <span class="sound-pack-badge">8-Bit</span>
                </button>
              </div>
            </div>
          </div>
          <div class="theme-modal__footer">
            <span>Tanlangan sozlamalar darhol avtomatik saqlanadi</span>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
      this.dialog = dialog;

      dialog.querySelector('#themeModalCloseBtn').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', e => {
        if (e.target === dialog) dialog.close();
      });

      dialog.querySelectorAll('[data-theme-pick]').forEach(chip => {
        chip.addEventListener('click', () => {
          const key = chip.dataset.themePick;
          this.applyTheme(key, true);
          dialog.querySelectorAll('[data-theme-pick]').forEach(c => c.classList.toggle('is-active', c.dataset.themePick === key));
        });
      });

      dialog.querySelectorAll('[data-sound-pack]').forEach(card => {
        card.addEventListener('click', () => {
          const pack = card.dataset.soundPack;
          if (window.EclipseAudio) {
            window.EclipseAudio.setSoundPack(pack);
            window.EclipseAudio.playSuccess();
            window.showToast?.(`Ovoz to‘plami: ${pack.toUpperCase()} 🔊`);
            this.updateSoundPackSelection();
          }
        });
      });

      return dialog;
    }

    updateSoundPackSelection() {
      if (!this.dialog) return;
      const currentPack = window.EclipseAudio?.getSoundPack?.() || 'cyber';
      this.dialog.querySelectorAll('[data-sound-pack]').forEach(card => {
        card.classList.toggle('is-active', card.dataset.soundPack === currentPack);
      });
    }

    openModal() {
      const dialog = this.ensureDialog();
      this.updateSoundPackSelection();
      dialog.querySelectorAll('[data-theme-pick]').forEach(c => {
        c.classList.toggle('is-active', c.dataset.themePick === this.currentTheme);
      });
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.open = true;
      }
    }
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.ThemeManager = ThemeManager;
    window.THEMES = THEMES;
    if (typeof document !== 'undefined') {
      window.eclipseTheme = new ThemeManager();
    }
  }
})();
