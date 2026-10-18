// Eclipse Esports Stats — Universal Command Palette (Ctrl+K / Cmd+K)
(() => {
  'use strict';

  class CommandPalette {
    constructor() {
      this.dialog = null;
      this.input = null;
      this.list = null;
      this.selectedIndex = 0;
      this.filteredItems = [];
      this.isOpen = false;
      this.init();
    }

    static get STATIC_PAGES() {
      return [
        { id: 'page-dashboard', label: 'Bosh sahifa', group: 'Sahifalar', icon: 'fa-gauge-high', page: 'dashboard', url: '/' },
        { id: 'page-matches', label: 'Matchlar tarixi', group: 'Sahifalar', icon: 'fa-trophy', page: 'match-history', url: '/#match-history' },
        { id: 'page-players', label: 'Jamoa tarkibi', group: 'Sahifalar', icon: 'fa-users', page: 'players', url: '/#players' },
        { id: 'page-stats', label: 'Tahlil va statistika', group: 'Sahifalar', icon: 'fa-chart-pie', page: 'statistics', url: '/#statistics' },
        { id: 'page-progress', label: 'Eclipse Progress', group: 'Sahifalar', icon: 'fa-chart-line', page: 'progress', url: '/#progress' },
        { id: 'page-briefing', label: 'Briefing & Meta tahlil', group: 'Sahifalar', icon: 'fa-newspaper', page: 'briefing', url: '/#briefing' },
        { id: 'page-metalab', label: 'Meta Lab (MLBB Tierlist)', group: 'Sahifalar', icon: 'fa-ranking-star', url: '/meta-lab' },
        { id: 'page-submissions', label: 'Match yuborish (Skaner)', group: 'Sahifalar', icon: 'fa-satellite-dish', page: 'submissions', url: '/#submissions' },
        { id: 'page-add-match', label: 'Match qo‘shish (Admin)', group: 'Sahifalar', icon: 'fa-plus', page: 'add-match', url: '/#add-match' },
        { id: 'page-settings', label: 'Sozlamalar', group: 'Sahifalar', icon: 'fa-gear', page: 'settings', url: '/#settings' }
      ];
    }

    static get QUICK_ACTIONS() {
      return [
        { id: 'act-export-tier', label: 'Meta Tierlistni PNG eksport qilish', group: 'Amallar', icon: 'fa-file-image', action: 'exportTier' },
        { id: 'act-filter-exp', label: 'EXP Lane qahramonlarini ko‘rish', group: 'Layn filtri', icon: 'fa-shield-halved', lane: 'exp' },
        { id: 'act-filter-gold', label: 'Gold Lane qahramonlarini ko‘rish', group: 'Layn filtri', icon: 'fa-coins', lane: 'gold' },
        { id: 'act-filter-mid', label: 'Mid Lane qahramonlarini ko‘rish', group: 'Layn filtri', icon: 'fa-wand-magic-sparkles', lane: 'mid' },
        { id: 'act-filter-jungle', label: 'Jungle qahramonlarini ko‘rish', group: 'Layn filtri', icon: 'fa-paw', lane: 'jungle' },
        { id: 'act-filter-roam', label: 'Roam qahramonlarini ko‘rish', group: 'Layn filtri', icon: 'fa-person-walking', lane: 'roam' }
      ];
    }

    getHeroList() {
      const heroes = [];
      const seen = new Set();

      // Check MlbbDataManager state
      const mlbbHeroes = window.EclipseApp?.mlbbManager?.state?.heroes?.data || window.publicMetaApp?.state?.heroes?.data || [];
      mlbbHeroes.forEach(h => {
        if (!h.id || seen.has(h.id)) return;
        seen.add(h.id);
        heroes.push({
          id: `hero-${h.id}`,
          heroId: Number(h.id),
          label: h.name,
          subtitle: (h.lanes || []).join(' · ') || (h.roles || []).join(' · ') || 'MLBB Hero',
          group: 'Qahramonlar',
          icon: 'fa-user-ninja',
          image: h.images?.minimap || h.images?.portrait || ''
        });
      });

      // Fallback from HeroDatabase if available
      if (!heroes.length && window.HeroDatabase?.DEFAULT_HEROES) {
        window.HeroDatabase.DEFAULT_HEROES.forEach((h, idx) => {
          heroes.push({
            id: `hero-def-${idx}`,
            label: h.name,
            subtitle: h.role,
            group: 'Qahramonlar',
            icon: 'fa-user-ninja'
          });
        });
      }

      return heroes;
    }

    init() {
      if (typeof document === 'undefined') return;
      this.createDom();
      this.bindShortcuts();
    }

    createDom() {
      if (document.getElementById('commandPaletteDialog')) {
        this.dialog = document.getElementById('commandPaletteDialog');
        this.input = this.dialog.querySelector('.command-palette__input');
        this.list = this.dialog.querySelector('.command-palette__list');
        return;
      }

      const dialog = document.createElement('dialog');
      dialog.className = 'command-palette-dialog';
      dialog.id = 'commandPaletteDialog';
      dialog.setAttribute('aria-label', 'Tezkor buyruqlar va qidiruv');

      dialog.innerHTML = `
        <div class="command-palette">
          <header class="command-palette__header">
            <i class="fa-solid fa-magnifying-glass command-palette__search-icon" aria-hidden="true"></i>
            <input type="search" class="command-palette__input" placeholder="Qahramon, sahifa yoki amalni qidiring…" autocomplete="off" spellcheck="false">
            <button type="button" class="command-palette__close-btn" aria-label="Yopish"><kbd>Esc</kbd></button>
          </header>
          <div class="command-palette__body">
            <div class="command-palette__list" role="listbox"></div>
          </div>
          <footer class="command-palette__footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> Tanlash</span>
            <span><kbd>↵</kbd> O‘tish</span>
            <span><kbd>Esc</kbd> Yopish</span>
          </footer>
        </div>
      `;

      const target = document.body || document.documentElement;
      if (target) target.appendChild(dialog);
      this.dialog = dialog;
      this.input = dialog.querySelector('.command-palette__input');
      this.list = dialog.querySelector('.command-palette__list');

      // Click backdrop to close
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) this.close();
      });

      dialog.querySelector('.command-palette__close-btn')?.addEventListener('click', () => this.close());

      this.input.addEventListener('input', () => {
        this.selectedIndex = 0;
        this.renderItems(this.input.value.trim());
      });

      this.input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.moveSelection(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          this.moveSelection(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          this.executeSelected();
        } else if (event.key === 'Escape') {
          this.close();
        }
      });
    }

    bindShortcuts() {
      document.addEventListener('keydown', (event) => {
        // Cmd+K or Ctrl+K
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          this.toggle();
          return;
        }

        // "/" key when not typing in an input
        if (event.key === '/' && !this.isOpen) {
          const activeTag = document.activeElement?.tagName;
          if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) && !document.activeElement?.isContentEditable) {
            event.preventDefault();
            this.open();
          }
        }
      });

      // Quick trigger buttons
      document.addEventListener('click', (event) => {
        const trigger = event.target.closest('.quick-cmd-trigger, #quickCmdTrigger, #mobileDockSearch');
        if (trigger) {
          event.preventDefault();
          this.open();
        }
      });
    }

    open() {
      if (!this.dialog) this.createDom();
      this.isOpen = true;
      this.input.value = '';
      this.selectedIndex = 0;
      this.renderItems('');
      if (typeof this.dialog.showModal === 'function') {
        this.dialog.showModal();
      } else {
        this.dialog.setAttribute('open', '');
      }
      setTimeout(() => this.input.focus(), 50);
    }

    close() {
      this.isOpen = false;
      if (typeof this.dialog.close === 'function') {
        this.dialog.close();
      } else {
        this.dialog.removeAttribute('open');
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    renderItems(query) {
      const q = query.toLowerCase();
      const allItems = [
        ...CommandPalette.STATIC_PAGES,
        ...CommandPalette.QUICK_ACTIONS,
        ...this.getHeroList()
      ];

      this.filteredItems = q
        ? allItems.filter(item => {
            const matchLabel = item.label.toLowerCase().includes(q);
            const matchSub = item.subtitle ? item.subtitle.toLowerCase().includes(q) : false;
            const matchGroup = item.group ? item.group.toLowerCase().includes(q) : false;
            return matchLabel || matchSub || matchGroup;
          }).slice(0, 30)
        : allItems.slice(0, 20);

      if (!this.filteredItems.length) {
        this.list.innerHTML = `
          <div class="command-palette__empty">
            <i class="fa-solid fa-face-meh"></i>
            <p>“${this.escape(query)}” bo‘yicha hech narsa topilmadi</p>
          </div>
        `;
        return;
      }

      // Group by item.group
      const groups = new Map();
      this.filteredItems.forEach((item, index) => {
        const grp = item.group || 'Boshqa';
        if (!groups.has(grp)) groups.set(grp, []);
        groups.get(grp).push({ item, index });
      });

      let html = '';
      groups.forEach((entries, groupName) => {
        html += `<div class="command-palette__group"><span class="command-palette__group-title">${this.escape(groupName)}</span>`;
        entries.forEach(({ item, index }) => {
          const isSelected = index === this.selectedIndex;
          html += `
            <button type="button" class="command-palette__item ${isSelected ? 'is-selected' : ''}" data-cmd-index="${index}" role="option" aria-selected="${isSelected}">
              <span class="command-palette__item-visual">
                ${item.image ? `<img src="${this.escape(item.image)}" alt="" class="command-palette__item-avatar">` : `<i class="fa-solid ${this.escape(item.icon || 'fa-arrow-right')}"></i>`}
              </span>
              <span class="command-palette__item-text">
                <strong class="command-palette__item-title">${this.escape(item.label)}</strong>
                ${item.subtitle ? `<small class="command-palette__item-subtitle">${this.escape(item.subtitle)}</small>` : ''}
              </span>
              <span class="command-palette__item-enter" aria-hidden="true">↵</span>
            </button>
          `;
        });
        html += `</div>`;
      });

      this.list.innerHTML = html;

      // Item click listener
      this.list.querySelectorAll('.command-palette__item').forEach(button => {
        button.addEventListener('click', () => {
          const idx = Number(button.dataset.cmdIndex);
          this.selectedIndex = idx;
          this.executeSelected();
        });
        button.addEventListener('pointerenter', () => {
          this.selectedIndex = Number(button.dataset.cmdIndex);
          this.updateSelectionClasses();
        });
      });
    }

    moveSelection(delta) {
      if (!this.filteredItems.length) return;
      this.selectedIndex = (this.selectedIndex + delta + this.filteredItems.length) % this.filteredItems.length;
      this.updateSelectionClasses();
    }

    updateSelectionClasses() {
      const items = this.list.querySelectorAll('.command-palette__item');
      items.forEach((item, idx) => {
        const isSelected = idx === this.selectedIndex;
        item.classList.toggle('is-selected', isSelected);
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        if (isSelected) {
          item.scrollIntoView({ block: 'nearest' });
        }
      });
    }

    executeSelected() {
      const item = this.filteredItems[this.selectedIndex];
      if (!item) return;
      this.close();

      // 1. Navigation
      if (item.page && window.EclipseApp?.navigate) {
        window.EclipseApp.navigate(item.page);
        return;
      }

      // 2. Direct Hero Dossier
      if (item.heroId) {
        const metaMgr = window.publicMetaApp || window.EclipseApp?.mlbbManager;
        if (metaMgr?.openHeroDossier) {
          metaMgr.openHeroDossier(item.heroId);
          return;
        }
        window.location.href = `/meta-lab?hero=${item.heroId}`;
        return;
      }

      // 3. Lane Filter
      if (item.lane) {
        const metaMgr = window.publicMetaApp || window.EclipseApp?.mlbbManager;
        if (metaMgr) {
          metaMgr.laneFilter = item.lane;
          if (typeof metaMgr.renderState === 'function') metaMgr.renderState();
          else if (typeof metaMgr.render === 'function') metaMgr.render();
          return;
        }
        window.location.href = `/meta-lab?lane=${item.lane}`;
        return;
      }

      // 4. Quick Action
      if (item.action === 'exportTier') {
        const exportBtn = document.querySelector('[data-tier-export]');
        if (exportBtn) exportBtn.click();
        else window.location.href = '/meta-lab';
        return;
      }

      // 5. URL Navigation
      if (item.url) {
        window.location.href = item.url;
      }
    }

    escape(str) {
      return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }
  }

  // Initialize
  if (typeof window !== 'undefined') {
    window.CommandPalette = CommandPalette;
    const start = () => {
      if (!window.__commandPaletteInstance) {
        window.__commandPaletteInstance = new CommandPalette();
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})();
