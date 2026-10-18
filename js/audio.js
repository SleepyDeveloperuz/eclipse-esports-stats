// Eclipse Esports Stats — Cyberpunk Web Audio SFX (Zero Network Overhead)
(() => {
  'use strict';

  class EclipseAudio {
    constructor() {
      this.ctx = null;
      this.storageKey = 'eclipse:sfx:enabled';
      this.enabled = false;
      this.readPreference();
      this.initUi();
    }

    readPreference() {
      try {
        const saved = localStorage.getItem(this.storageKey);
        // Default to false (muted) so sound never surprises users, or true if previously toggled
        this.enabled = saved === 'true';
      } catch (_) {
        this.enabled = false;
      }
    }

    savePreference() {
      try {
        localStorage.setItem(this.storageKey, String(this.enabled));
      } catch (_) {}
    }

    ensureContext() {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    toggle() {
      this.enabled = !this.enabled;
      this.savePreference();
      this.updateButtons();
      if (this.enabled) {
        this.ensureContext();
        this.playSuccess();
        window.showToast?.('Ovoz effektlari yoqildi 🔊');
      } else {
        window.showToast?.('Ovoz effektlari o‘chirildi 🔇');
      }
      return this.enabled;
    }

    updateButtons() {
      document.querySelectorAll('.sfx-toggle-btn').forEach(btn => {
        btn.setAttribute('aria-pressed', String(this.enabled));
        btn.setAttribute('title', this.enabled ? 'Ovozni o‘chirish (M)' : 'Ovoz effektlarini yoqish (M)');
        btn.innerHTML = this.enabled
          ? '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>'
          : '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>';
      });
    }

    playClick() {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.035);

        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.036);
      } catch (_) {}
    }

    playHover() {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2200, now);

        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.021);
      } catch (_) {}
    }

    playSuccess() {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 arpeggio
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + (idx * 0.06);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.04, start);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          osc.stop(start + 0.13);
        });
      } catch (_) {}
    }

    playWhoosh() {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.085);
      } catch (_) {}
    }

    initUi() {
      if (typeof document === 'undefined') return;
      const setup = () => {
        this.updateButtons();
        document.addEventListener('click', (e) => {
          const btn = e.target.closest('.sfx-toggle-btn');
          if (btn) {
            e.preventDefault();
            this.toggle();
            return;
          }
          const interactive = e.target.closest('button, .nav-item, .filter-chip, .tab-btn, .solar-tier-hero');
          if (interactive && !interactive.classList.contains('sfx-toggle-btn')) {
            this.playClick();
          }
        });

        // Hover blips on key interactive elements
        document.addEventListener('mouseenter', (e) => {
          if (e.target?.closest?.('.solar-tier-hero, .nav-item, .command-palette__item')) {
            this.playHover();
          }
        }, true);
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
      } else {
        setup();
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.EclipseAudio = EclipseAudio;
    window.eclipseAudio = new EclipseAudio();
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EclipseAudio };
  }
})();
