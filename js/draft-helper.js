// Eclipse Esports Stats — Meta Lab Draft Assistant & Pick-Ban Helper
(() => {
  'use strict';

  class DraftAssistant {
    constructor() {
      this.allyPicks = [null, null, null, null, null];
      this.enemyPicks = [null, null, null, null, null];
      this.activeSlot = null; // { team: 'ally' | 'enemy', index: 0..4 }
      this.dialog = null;
      this.container = null;
      this.init();
    }

    escape(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    }

    getHeroCatalog() {
      // Pull fresh heroes from MlbbDataManager, PublicMetaApp, or HeroDatabase
      const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
      const catalog = manager?.state?.heroes?.data;
      if (Array.isArray(catalog) && catalog.length) return catalog;

      const meta = manager?.state?.meta?.data?.eclipse;
      if (Array.isArray(meta) && meta.length) {
        return meta.map(h => ({
          id: Number(h.heroId || h.id),
          name: h.name,
          roles: h.roles || [],
          lanes: manager?.heroLanes ? manager.heroLanes(h) : (h.lanes || []),
          images: h.images || { portrait: h.image, minimap: h.image }
        }));
      }

      const defaultHeroes = window.HeroDatabase?.DEFAULT_HEROES;
      if (Array.isArray(defaultHeroes) && defaultHeroes.length) {
        return defaultHeroes.map((h, i) => ({
          id: h.id || i + 1,
          name: h.name,
          roles: h.roles || [h.role],
          lanes: manager?.heroLanes ? manager.heroLanes(h) : [],
          images: {}
        }));
      }

      return [];
    }

    getMetaTiers() {
      const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
      const meta = manager?.state?.meta?.data?.eclipse;
      if (Array.isArray(meta) && meta.length) return meta;
      return [];
    }

    async ensureCatalog() {
      if (this.getHeroCatalog().length) return;
      try {
        const res = await fetch('/api/mlbb-heroes');
        const json = await res.json();
        if (json?.data) {
          const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
          if (manager) {
            if (!manager.state) manager.state = {};
            manager.state.heroes = json;
          }
          this.renderSlots();
          this.renderAnalysis();
          if (this.activeSlot) this.renderPickerGrid();
        }
      } catch (_) {}
    }

    init() {
      if (typeof document === 'undefined') return;
      this.createDialog();
      this.bindGlobalTriggers();
    }

    createDialog() {
      if (document.getElementById('draftAssistantDialog')) {
        this.dialog = document.getElementById('draftAssistantDialog');
        return;
      }

      const dialog = document.createElement('dialog');
      dialog.className = 'draft-dialog';
      dialog.id = 'draftAssistantDialog';
      dialog.setAttribute('aria-label', 'Meta Lab Draft Assistant');

      dialog.innerHTML = `
        <div class="draft-modal">
          <header class="draft-modal__header">
            <div>
              <p class="draft-modal__eyebrow">ECLIPSE TACTICAL // PICK & BAN HELPER</p>
              <h3><i class="fa-solid fa-shield-halved" style="color:var(--primary);"></i> Draft Assistant</h3>
            </div>
            <button type="button" class="draft-modal__close" id="draftCloseBtn" aria-label="Yopish"><kbd>Esc</kbd></button>
          </header>

          <div class="draft-board">
            <!-- Blue Team (Ally) -->
            <div class="draft-team draft-team--blue">
              <div class="draft-team__header">
                <span class="draft-team__badge is-blue">BIZNING JAMOA (BLUE)</span>
                <span class="draft-team__count" id="allyPickCount">0 / 5</span>
              </div>
              <div class="draft-slots" id="allySlots"></div>
            </div>

            <!-- VS Divider -->
            <div class="draft-vs-divider">
              <span>VS</span>
              <button type="button" class="btn btn-sm btn-secondary draft-reset-btn" id="draftResetBtn" title="Draftni tozalash">
                <i class="fa-solid fa-rotate-left"></i> Tozalash
              </button>
            </div>

            <!-- Red Team (Enemy) -->
            <div class="draft-team draft-team--red">
              <div class="draft-team__header">
                <span class="draft-team__badge is-red">RAQIB JAMOA (RED)</span>
                <span class="draft-team__count" id="enemyPickCount">0 / 5</span>
              </div>
              <div class="draft-slots" id="enemySlots"></div>
            </div>
          </div>

          <!-- Tactical Analysis Console -->
          <div class="draft-analytics" id="draftAnalytics"></div>

          <!-- Hero Picker Sheet (When clicking a slot) -->
          <div class="draft-picker-sheet" id="draftPickerSheet" hidden>
            <div class="draft-picker-sheet__header">
              <div class="draft-picker-search-wrap">
                <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input type="search" class="draft-picker-search" id="draftPickerSearch" placeholder="Qahramon nomini yozing…" autocomplete="off">
              </div>
              <div class="draft-picker-lanes" id="draftPickerLanes">
                <button type="button" class="picker-lane-btn active" data-lane="all">Hammasi</button>
                <button type="button" class="picker-lane-btn" data-lane="exp">EXP</button>
                <button type="button" class="picker-lane-btn" data-lane="jungle">Jungle</button>
                <button type="button" class="picker-lane-btn" data-lane="mid">Mid</button>
                <button type="button" class="picker-lane-btn" data-lane="gold">Gold</button>
                <button type="button" class="picker-lane-btn" data-lane="roam">Roam</button>
              </div>
              <button type="button" class="draft-picker-close" id="draftPickerClose">✕</button>
            </div>
            <div class="draft-picker-grid" id="draftPickerGrid"></div>
          </div>
        </div>
      `;

      const target = document.body || document.documentElement;
      if (target) target.appendChild(dialog);
      this.dialog = dialog;

      // Event listeners
      dialog.querySelector('#draftCloseBtn')?.addEventListener('click', () => this.close());
      dialog.querySelector('#draftResetBtn')?.addEventListener('click', () => this.reset());
      dialog.querySelector('#draftPickerClose')?.addEventListener('click', () => this.closePicker());

      // Search and lane filter inside picker
      const searchInput = dialog.querySelector('#draftPickerSearch');
      searchInput?.addEventListener('input', () => this.renderPickerGrid());

      dialog.querySelectorAll('.picker-lane-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          dialog.querySelectorAll('.picker-lane-btn').forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.renderPickerGrid();
        });
      });

      // Close on backdrop
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) this.close();
      });
    }

    open() {
      if (!this.dialog || !this.dialog.isConnected) this.createDialog();
      this.closePicker();
      this.renderSlots();
      this.renderAnalysis();
      this.ensureCatalog();
      if (typeof this.dialog.showModal === 'function') {
        if (!this.dialog.open) {
          this.dialog.showModal();
        }
      } else {
        this.dialog.setAttribute('open', '');
      }
      window.eclipseAudio?.playWhoosh?.();
    }

    close() {
      if (!this.dialog) return;
      this.closePicker();
      if (typeof this.dialog.close === 'function') {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
      }
    }

    reset() {
      this.allyPicks = [null, null, null, null, null];
      this.enemyPicks = [null, null, null, null, null];
      this.closePicker();
      this.renderSlots();
      this.renderAnalysis();
      window.eclipseAudio?.playClick?.();
      window.showToast?.('Draft tozalandi.');
    }

    openPicker(team, index) {
      this.activeSlot = { team, index };
      const sheet = this.dialog?.querySelector('#draftPickerSheet');
      if (sheet) {
        sheet.hidden = false;
        sheet.classList.add('is-open');
        const input = sheet.querySelector('#draftPickerSearch');
        if (input) {
          input.value = '';
          input.focus();
        }
        this.renderPickerGrid();
        this.ensureCatalog();
      }
    }

    closePicker() {
      this.activeSlot = null;
      const sheet = this.dialog?.querySelector('#draftPickerSheet');
      if (sheet) {
        sheet.hidden = true;
        sheet.classList.remove('is-open');
      }
    }

    pickHero(hero) {
      if (!this.activeSlot) return;
      const { team, index } = this.activeSlot;
      if (team === 'ally') {
        this.allyPicks[index] = hero;
      } else {
        this.enemyPicks[index] = hero;
      }
      this.closePicker();
      this.renderSlots();
      this.renderAnalysis();
      window.eclipseAudio?.playSuccess?.();
    }

    removeHero(team, index, event) {
      event?.stopPropagation();
      if (team === 'ally') {
        this.allyPicks[index] = null;
      } else {
        this.enemyPicks[index] = null;
      }
      this.renderSlots();
      this.renderAnalysis();
      window.eclipseAudio?.playClick?.();
    }

    renderSlots() {
      const allyContainer = this.dialog.querySelector('#allySlots');
      const enemyContainer = this.dialog.querySelector('#enemySlots');
      const allyCount = this.dialog.querySelector('#allyPickCount');
      const enemyCount = this.dialog.querySelector('#enemyPickCount');

      if (allyCount) allyCount.textContent = `${this.allyPicks.filter(Boolean).length} / 5`;
      if (enemyCount) enemyCount.textContent = `${this.enemyPicks.filter(Boolean).length} / 5`;

      const renderSlotHtml = (hero, team, index) => {
        if (!hero) {
          return `
            <button type="button" class="draft-slot draft-slot--empty" data-team="${team}" data-index="${index}">
              <div class="draft-slot__add-icon"><i class="fa-solid fa-plus"></i></div>
              <span class="draft-slot__label">Slot ${index + 1}</span>
            </button>
          `;
        }
        const portrait = hero.images?.minimap || hero.images?.portrait || '';
        const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
        const heroLanes = manager?.heroLanesLabels ? manager.heroLanesLabels(hero) : (hero.lanes || []);
        const laneLabel = heroLanes.join(' · ') || (hero.roles || []).join(' · ') || 'MLBB';
        return `
          <div class="draft-slot draft-slot--filled" data-team="${team}" data-index="${index}">
            <div class="draft-slot__media">
              ${portrait ? `<img src="${portrait}" alt="${hero.name}" class="draft-slot__img">` : `<div class="draft-slot__fallback">${hero.name.slice(0, 2)}</div>`}
              <button type="button" class="draft-slot__remove" data-remove-team="${team}" data-remove-index="${index}" title="Olib tashlash">✕</button>
            </div>
            <div class="draft-slot__info">
              <strong class="draft-slot__name">${hero.name}</strong>
              <small class="draft-slot__meta">${laneLabel}</small>
            </div>
          </div>
        `;
      };

      if (allyContainer) {
        allyContainer.innerHTML = this.allyPicks.map((h, i) => renderSlotHtml(h, 'ally', i)).join('');
      }
      if (enemyContainer) {
        enemyContainer.innerHTML = this.enemyPicks.map((h, i) => renderSlotHtml(h, 'enemy', i)).join('');
      }

      // Bind slot clicks
      this.dialog.querySelectorAll('.draft-slot--empty').forEach(btn => {
        btn.addEventListener('click', () => {
          this.openPicker(btn.dataset.team, Number(btn.dataset.index));
        });
      });

      this.dialog.querySelectorAll('.draft-slot__remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.removeHero(btn.dataset.removeTeam, Number(btn.dataset.removeIndex), e);
        });
      });
    }

    renderPickerGrid() {
      const grid = this.dialog.querySelector('#draftPickerGrid');
      const search = (this.dialog.querySelector('#draftPickerSearch')?.value || '').toLowerCase().trim();
      const activeLane = this.dialog.querySelector('.picker-lane-btn.active')?.dataset.lane || 'all';

      const allHeroes = this.getHeroCatalog();
      const takenHeroIds = new Set([
        ...this.allyPicks.filter(Boolean).map(h => h.id || h.name),
        ...this.enemyPicks.filter(Boolean).map(h => h.id || h.name)
      ]);

      const filtered = allHeroes.filter(h => {
        if (takenHeroIds.has(h.id || h.name)) return false;
        if (search && !h.name.toLowerCase().includes(search)) return false;
        if (activeLane !== 'all') {
          const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
          const heroLanes = manager?.heroLanes ? manager.heroLanes(h) : (h.lanes || []).map(l => String(l).toLowerCase());
          if (!heroLanes.some(l => l.includes(activeLane))) return false;
        }
        return true;
      });

      if (!filtered.length) {
        grid.innerHTML = '<p class="draft-picker-empty">Mos keluvchi qahramon topilmadi.</p>';
        return;
      }

      grid.innerHTML = filtered.map(h => {
        const portrait = h.images?.minimap || h.images?.portrait || '';
        const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
        const heroLanes = manager?.heroLanesLabels ? manager.heroLanesLabels(h) : (h.lanes || []);
        const laneStr = heroLanes.join(' · ') || (h.roles || []).join(' · ') || '';
        const heroId = Number(h.id || h.heroId);
        return `
          <button type="button" class="draft-picker-item" data-hero-id="${heroId}" data-hero-name="${this.escape(h.name)}">
            <div class="draft-picker-item__media">
              ${portrait ? `<img src="${this.escape(portrait)}" alt="${this.escape(h.name)}">` : `<span>${this.escape(h.name.slice(0, 2))}</span>`}
            </div>
            <div class="draft-picker-item__info">
              <strong>${this.escape(h.name)}</strong>
              <small>${this.escape(laneStr)}</small>
            </div>
          </button>
        `;
      }).join('');

      grid.querySelectorAll('.draft-picker-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const heroId = Number(btn.dataset.heroId);
          const hero = allHeroes.find(h => Number(h.id || h.heroId) === heroId || h.name === btn.dataset.heroName);
          if (hero) this.pickHero(hero);
        });
      });
    }

    renderAnalysis() {
      const container = this.dialog.querySelector('#draftAnalytics');
      if (!container) return;

      const allies = this.allyPicks.filter(Boolean);
      const enemies = this.enemyPicks.filter(Boolean);

      if (allies.length === 0 && enemies.length === 0) {
        container.innerHTML = `
          <div class="draft-empty-state">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <h4>Draft tahlili</h4>
            <p>Qahramonlarni tanlang — tizim jamoa balansi, CC, laynlar va eng yaxshi counter-pick tavsiyalarini hisoblab beradi.</p>
          </div>
        `;
        return;
      }

      // 1. Damage Type Breakdown (Physical vs Magic)
      let physCount = 0;
      let magicCount = 0;
      allies.forEach(h => {
        const roles = (h.roles || []).map(r => r.toLowerCase());
        if (roles.includes('mage') || roles.includes('support')) magicCount += 1.5;
        else if (roles.includes('marksman') || roles.includes('assassin')) physCount += 1.5;
        else { physCount += 1; magicCount += 0.5; }
      });
      const totalDmg = Math.max(1, physCount + magicCount);
      const physPct = Math.round((physCount / totalDmg) * 100);
      const magicPct = 100 - physPct;

      // 2. CC & Frontline
      let ccScore = 0;
      let frontlineScore = 0;
      allies.forEach(h => {
        const roles = (h.roles || []).map(r => r.toLowerCase());
        if (roles.includes('tank')) { ccScore += 3; frontlineScore += 4; }
        if (roles.includes('fighter')) { ccScore += 2; frontlineScore += 3; }
        if (roles.includes('mage')) { ccScore += 2.5; frontlineScore += 0.5; }
        if (roles.includes('support')) { ccScore += 2; frontlineScore += 1; }
      });

      // 3. Lane Coverage
      const coveredLanes = new Set();
      const manager = window.publicMetaApp || window.EclipseApp?.mlbbManager;
      allies.forEach(h => {
        const lanes = manager?.heroLanes ? manager.heroLanes(h) : (h.lanes || []);
        lanes.forEach(l => coveredLanes.add(String(l).toLowerCase()));
      });
      const requiredLanes = ['exp', 'jungle', 'mid', 'gold', 'roam'];
      const missingLanes = requiredLanes.filter(l => !coveredLanes.has(l));

      // 4. Counter Pick Suggestions (against chosen enemies)
      const allHeroes = this.getHeroCatalog();
      const metaTiers = this.getMetaTiers();
      const takenIds = new Set([...allies.map(a => Number(a.id || a.heroId)), ...enemies.map(e => Number(e.id || e.heroId))]);

      // Find heroes that have high tiers or good matchup
      const counterSuggestions = allHeroes
        .filter(h => !takenIds.has(Number(h.id || h.heroId)))
        .map(h => {
          let score = 0;
          const heroId = Number(h.id || h.heroId);
          const tierRow = metaTiers.find(m => Number(m.heroId) === heroId || m.name === h.name);
          if (tierRow) {
            if (tierRow.tier === 'SS') score += 5;
            if (tierRow.tier === 'S') score += 3.5;
            if (tierRow.tier === 'A') score += 2;
          }
          // If enemy has Squishies (Marksman/Mage) and this hero is Assassin -> bonus
          if (enemies.some(e => (e.roles || []).some(r => ['marksman', 'mage'].includes(r.toLowerCase())))) {
            if ((h.roles || []).some(r => r.toLowerCase() === 'assassin')) score += 3;
          }
          // If enemy has Mobile heroes and this hero has Hard CC (Tank/Support)
          if ((h.roles || []).some(r => ['tank', 'support'].includes(r.toLowerCase()))) score += 2;
          return { hero: h, score, tier: tierRow?.tier || 'A' };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      let balanceWarning = '';
      if (allies.length >= 3) {
        if (physPct >= 85) balanceWarning = '⚠️ Jamoangizda deyarli faqat Physical zarar. Raqib Armor to‘plasa samaradorlik tushadi — Magic zarar qo‘shing!';
        else if (magicPct >= 80) balanceWarning = '⚠️ Jamoangizda Magic zarar ko‘p. Raqib Magic Defense olsa qiyinlashadi — Physical AD qahramon kerak.';
        else if (frontlineScore < 3) balanceWarning = '⚠️ Frontline (Tank/Fighter) yetishmayapti. Jamoa janglarida himoyachi qahramon oling.';
      }

      container.innerHTML = `
        <div class="draft-analytics-grid">
          <!-- Damage Balance Bar -->
          <div class="draft-card">
            <h4><i class="fa-solid fa-scale-balanced" style="color:var(--primary);"></i> Zarar balansi</h4>
            <div class="draft-dmg-bar">
              <div class="draft-dmg-fill is-phys" style="width:${physPct}%;"><span>${physPct}% Phys</span></div>
              <div class="draft-dmg-fill is-magic" style="width:${magicPct}%;"><span>${magicPct}% Magic</span></div>
            </div>
            ${balanceWarning ? `<p class="draft-warning-pill">${balanceWarning}</p>` : '<p class="draft-ok-pill"><i class="fa-solid fa-check"></i> Zarar balansi barqaror.</p>'}
          </div>

          <!-- Lane Coverage -->
          <div class="draft-card">
            <h4><i class="fa-solid fa-map-location-dot" style="color:#4ee2db;"></i> Layn qamrovi</h4>
            <div class="draft-lane-badges">
              ${requiredLanes.map(lane => {
                const isCovered = coveredLanes.has(lane);
                return `<span class="draft-lane-badge ${isCovered ? 'is-ok' : 'is-missing'}">${isCovered ? '✓' : '✗'} ${lane.toUpperCase()}</span>`;
              }).join('')}
            </div>
            <p class="draft-subtext">${missingLanes.length ? `Yetishmayotgan laynlar: <strong>${missingLanes.join(', ').toUpperCase()}</strong>` : 'Barcha 5 ta layn to‘liq qamrab olindi.'}</p>
          </div>

          <!-- Counter Pick Recommendations -->
          <div class="draft-card draft-card--wide">
            <h4><i class="fa-solid fa-crosshairs" style="color:#f87171;"></i> Tavsiya etilgan Counter-Picklar</h4>
            <div class="draft-rec-grid">
              ${counterSuggestions.map(cs => {
                const h = cs.hero;
                const portrait = h.images?.minimap || h.images?.portrait || '';
                const recLanes = manager?.heroLanesLabels ? manager.heroLanesLabels(h) : (h.lanes || []);
                const recLaneLabel = recLanes.join(' · ') || h.roles?.join(' · ') || '';
                const heroId = Number(h.id || h.heroId);
                return `
                  <div class="draft-rec-item" data-pick-suggest="${heroId}" data-hero-name="${this.escape(h.name)}">
                    <div class="draft-rec-avatar">
                      ${portrait ? `<img src="${this.escape(portrait)}" alt="${this.escape(h.name)}">` : `<span>${this.escape(h.name.slice(0, 2))}</span>`}
                      <span class="draft-rec-tier is-${this.escape(cs.tier.toLowerCase())}">${this.escape(cs.tier)}</span>
                    </div>
                    <div>
                      <strong>${this.escape(h.name)}</strong>
                      <small>${this.escape(recLaneLabel)}</small>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      // Quick pick suggested hero into ally team
      container.querySelectorAll('.draft-rec-item').forEach(item => {
        item.addEventListener('click', () => {
          const heroId = Number(item.dataset.pickSuggest);
          const hero = allHeroes.find(h => Number(h.id || h.heroId) === heroId || h.name === item.dataset.heroName);
          const firstEmptyAlly = this.allyPicks.findIndex(p => p === null);
          if (hero && firstEmptyAlly !== -1) {
            this.allyPicks[firstEmptyAlly] = hero;
            this.renderSlots();
            this.renderAnalysis();
            window.eclipseAudio?.playSuccess?.();
          }
        });
      });
    }

    bindGlobalTriggers() {
      if (typeof document === 'undefined') return;
      if (DraftAssistant._globalTriggersBound) return;
      DraftAssistant._globalTriggersBound = true;

      document.addEventListener('click', (e) => {
        const draftBtn = e.target.closest('#draftAssistantBtn, .draft-trigger-btn');
        if (draftBtn) {
          e.preventDefault();
          e.stopPropagation();
          if (this.dialog?.open) {
            this.close();
          } else {
            this.open();
          }
          return;
        }

        const hotkeysTrigger = e.target.closest('#hotkeysTriggerBtn, .hotkeys-trigger-btn');
        if (hotkeysTrigger) {
          e.preventDefault();
          const dialog = document.getElementById('hotkeysDialog');
          if (dialog && !dialog.open) {
            window.eclipseAudio?.play?.('click');
            if (typeof dialog.showModal === 'function') {
              dialog.showModal();
            } else {
              dialog.setAttribute('open', '');
            }
          }
          return;
        }

        const hotkeysClose = e.target.closest('#hotkeysCloseBtn, .hotkeys-close-btn');
        if (hotkeysClose) {
          e.preventDefault();
          const dialog = document.getElementById('hotkeysDialog');
          if (dialog) {
            window.eclipseAudio?.play?.('close');
            if (typeof dialog.close === 'function') dialog.close();
            else dialog.removeAttribute('open');
          }
          return;
        }

        const hotkeysDialog = document.getElementById('hotkeysDialog');
        if (hotkeysDialog && e.target === hotkeysDialog) {
          window.eclipseAudio?.play?.('close');
          if (typeof hotkeysDialog.close === 'function') hotkeysDialog.close();
          else hotkeysDialog.removeAttribute('open');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented) return;
        const tag = e.target?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          e.preventDefault();
          const dialog = document.getElementById('hotkeysDialog');
          if (dialog) {
            if (dialog.open) {
              window.eclipseAudio?.play?.('close');
              if (typeof dialog.close === 'function') dialog.close();
              else dialog.removeAttribute('open');
            } else {
              window.eclipseAudio?.play?.('click');
              if (typeof dialog.showModal === 'function') {
                dialog.showModal();
              } else {
                dialog.setAttribute('open', '');
              }
            }
          }
          return;
        }

        if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          window.eclipseAudio?.toggle?.();
          return;
        }

        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          if (this.dialog?.open) {
            this.close();
          } else {
            this.open();
          }
          return;
        }

        if (e.key === 'Escape') {
          const hotkeys = document.getElementById('hotkeysDialog');
          if (hotkeys?.open) {
            if (typeof hotkeys.close === 'function') hotkeys.close();
            else hotkeys.removeAttribute('open');
          }
        }
      });
    }
  }

  if (typeof window !== 'undefined') {
    window.DraftAssistant = DraftAssistant;
    window.draftAssistant = new DraftAssistant();
    window.EclipseDraftHelper = window.draftAssistant;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DraftAssistant };
  }
})();
