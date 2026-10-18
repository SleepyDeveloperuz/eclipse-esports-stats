// Eclipse Esports Stats — Cyberpunk Web Audio SFX (Zero Network Overhead)
(() => {
  'use strict';

  class EclipseAudio {
    constructor() {
      this.ctx = null;
      this.storageKey = 'eclipse:sfx:enabled';
      this.packKey = 'eclipse:sfx:pack';
      this.enabled = false;
      this.soundPack = 'cyber'; // 'cyber' | 'arena' | 'arcade'
      this.readPreference();
      this.initUi();
    }

    readPreference() {
      try {
        const saved = localStorage.getItem(this.storageKey);
        this.enabled = saved === 'true';
        const savedPack = localStorage.getItem(this.packKey);
        if (savedPack && ['cyber', 'arena', 'arcade'].includes(savedPack)) {
          this.soundPack = savedPack;
        }
      } catch (_) {
        this.enabled = false;
        this.soundPack = 'cyber';
      }
    }

    savePreference() {
      try {
        localStorage.setItem(this.storageKey, String(this.enabled));
        localStorage.setItem(this.packKey, this.soundPack);
      } catch (_) {}
    }

    setSoundPack(pack) {
      if (['cyber', 'arena', 'arcade'].includes(pack)) {
        this.soundPack = pack;
        this.savePreference();
        return this.soundPack;
      }
      return this.soundPack;
    }

    getSoundPack() {
      return this.soundPack;
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
      if (typeof document === 'undefined') return;
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
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (this.soundPack === 'arcade') {
          // Retro 8-bit square chiptune
          osc.type = 'square';
          osc.frequency.setValueAtTime(987.77, now); // B5
          osc.frequency.setValueAtTime(1318.51, now + 0.02); // E6
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.046);
        } else if (this.soundPack === 'arena') {
          // Stadium heavy bass punch
          osc.type = 'sine';
          osc.frequency.setValueAtTime(190, now);
          osc.frequency.exponentialRampToValueAtTime(55, now + 0.05);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.051);
        } else {
          // Cyber sine
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1400, now);
          osc.frequency.exponentialRampToValueAtTime(700, now + 0.035);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.036);
        }
      } catch (_) {}
    }

    playHover() {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        if (this.soundPack === 'arcade') {
          osc.type = 'square';
          osc.frequency.setValueAtTime(1760, now);
          gain.gain.setValueAtTime(0.015, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
        } else if (this.soundPack === 'arena') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          gain.gain.setValueAtTime(0.02, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
        } else {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(2200, now);
          gain.gain.setValueAtTime(0.015, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
        }

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

        if (this.soundPack === 'arcade') {
          // 8-bit coin jump
          const notes = [987.77, 1318.51];
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + (idx * 0.08);
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.04, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.15);
          });
        } else if (this.soundPack === 'arena') {
          // Arena major triad fanfare
          const chord = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
          chord.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const start = now + (idx * 0.05);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.045, start);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(start);
            osc.stop(start + 0.23);
          });
        } else {
          // Cyber sine arpeggio
          const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
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
        }
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

        if (this.soundPack === 'arcade') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(800, now);
          osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        } else if (this.soundPack === 'arena') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.exponentialRampToValueAtTime(450, now + 0.1);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        } else {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
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
    const instance = new EclipseAudio();
    EclipseAudio.instance = instance;
    EclipseAudio.setSoundPack = (p) => instance.setSoundPack(p);
    EclipseAudio.getSoundPack = () => instance.getSoundPack();
    EclipseAudio.playClick = () => instance.playClick();
    EclipseAudio.playHover = () => instance.playHover();
    EclipseAudio.playSuccess = () => instance.playSuccess();
    EclipseAudio.toggle = () => instance.toggle();
    window.EclipseAudio = EclipseAudio;
    window.eclipseAudio = instance;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EclipseAudio };
  }
})();
