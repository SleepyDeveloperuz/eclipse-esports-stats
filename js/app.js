window.EclipseApp = {
  dataStore: null,
  heroDb: null,
  statsEngine: null,
  playerManager: null,
  matchManager: null,
  briefingManager: null,
  submissionManager: null,
  mlbbData: null,
  currentPeriod: 'week',
  currentTrendPeriod: 'week',
  currentAnalyticsMode: 'team5',
  selectedWeekDate: window.EclipseDateUtils?.today?.() || new Date().toLocaleDateString('en-CA'),

  async init() {
    this.dataStore = new window.DataStore();
    this.heroDb = new window.HeroDatabase();
    this.statsEngine = new window.StatsEngine(this.dataStore);
    this.playerManager = new window.PlayerManager(this.dataStore, this.statsEngine);
    this.matchManager = new window.MatchManager(this.dataStore, this.heroDb);
    this.authManager = new window.AuthManager(this.dataStore);
    this.cloudSync = new window.CloudSync(this.dataStore);
    this.mlbbData = new window.MlbbDataManager(this.authManager, this.dataStore, this.heroDb, this.cloudSync);
    this.briefingManager = new window.BriefingManager(this.authManager, this.mlbbData, this.dataStore);
    this.submissionManager = new window.SubmissionManager(this.authManager, this.dataStore, this.heroDb, this.cloudSync);
    const savedAnalyticsMode = localStorage.getItem('eclipse_analytics_mode');
    if (savedAnalyticsMode === 'team5' || savedAnalyticsMode === 'squad') this.currentAnalyticsMode = savedAnalyticsMode;
    this.authManager.lockViewerSurface?.();

    this.bindSidebarNav();
    this.bindMobileNav();
    this.bindAnalyticsScopeToggle();
    this.bindStatsTabs();
    this.bindDashboardTrendTabs();
    this.bindSettings();
    this.bindKeyboardShortcuts();
    this.initMotion();

    // Do not render cached team data until the server confirms whether the
    // private viewer gate is enabled. The HTML starts access-locked so there
    // is no one-frame localStorage flash before this check completes.
    await this.authManager.validateSession();
    const hasViewerAccess = this.authManager.ensureViewerAccess
      ? await this.authManager.ensureViewerAccess({ mandatory: true })
      : true;
    if (!hasViewerAccess) return;
    document.documentElement.classList.remove('access-locked');
    document.getElementById('accessBootstrap')?.setAttribute('hidden', '');
    this.navigate('dashboard');
    this.bindForegroundRefresh();

    // Background cloud sync down if configured
    if (this.cloudSync.isConfigured()) {
      this.cloudSync.syncDown().then(updated => {
        if (updated) {
          this.rebuildHeroDatabase();
          // Do not pull the user away if they already opened another page
          // while the initial background sync was still finishing.
          const activeSection = document.querySelector('.page-section.active');
          if (!activeSection || activeSection.id === 'page-dashboard') {
            this.navigate('dashboard');
          }
          if (window.showToast) window.showToast("Eng so'nggi ma'lumotlar bulutdan yangilandi ☁️", "info");
        }
      }).finally(() => this.mlbbData.warmCatalog());
    } else this.mlbbData.warmCatalog();
  },

  rebuildHeroDatabase() {
    this.heroDb = new window.HeroDatabase();
    if (this.matchManager) this.matchManager.heroDb = this.heroDb;
    if (this.submissionManager) this.submissionManager.heroDb = this.heroDb;
    if (this.mlbbData) this.mlbbData.heroDb = this.heroDb;
    return this.heroDb;
  },

  bindForegroundRefresh() {
    this.foregroundInputGeneration = 0;
    document.addEventListener('input', () => { this.foregroundInputGeneration++; });
    document.addEventListener('change', () => { this.foregroundInputGeneration++; });
    const refresh = () => this.refreshForeground();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    this.cloudSync.subscribe(snapshot => {
      const label = document.getElementById('foregroundSyncStatus');
      if (!label) return;
      label.textContent = snapshot.pending ? 'Yuborilmagan o‘zgarish bor' : snapshot.syncing ? 'Yangilanmoqda…' : snapshot.state === 'locked' ? 'Qayta kirish kerak' : snapshot.state === 'conflict' ? 'Sync: variant tanlang' : ['error', 'offline'].includes(snapshot.state) ? 'Yangilash amalga oshmadi' : snapshot.lastSync ? `Yangilandi: ${new Date(snapshot.lastSync).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}` : 'Hali yangilanmagan';
    });
  },

  async refreshForeground() {
    const page = document.querySelector('.page-section.active')?.id;
    const safePages = ['page-dashboard', 'page-match-history', 'page-statistics'];
    const editing = () => document.querySelector('dialog[open], #modalOverlay[aria-hidden="false"]') || document.activeElement?.matches('input,textarea,select');
    if (document.hidden || !safePages.includes(page) || editing() || this.cloudSync.isSyncing || this.cloudSync.getStatus().pending || Date.now() - (this.lastForegroundCheck || 0) < 60_000) return;
    this.lastForegroundCheck = Date.now();
    const generation = this.foregroundInputGeneration;
    if (!await this.cloudSync.syncDown()) return;
    this.rebuildHeroDatabase();
    if (document.querySelector('.page-section.active')?.id !== page || generation !== this.foregroundInputGeneration || editing()) return;
    const matches = this.dataStore.getMatches();
    if (page === 'page-dashboard') this.renderDashboard(matches, this.dataStore.getActivePlayers());
    else if (page === 'page-statistics') {
      this.renderStatistics(this.currentPeriod, document.getElementById('statsDateFrom')?.value, document.getElementById('statsDateTo')?.value);
      this.renderAnalyticsArchive(matches, this.dataStore.getPlayers());
    } else {
      const filter = document.querySelector('#matchFilterBar .filter-chip.active')?.dataset.filter || 'all';
      this.matchManager.renderMatchHistory('matchHistoryContainer', this.getHistoryMatches(matches).filter(match => filter === 'all' || (match.matchType || 'ranked') === filter), this.dataStore.getPlayers());
    }
  },

  initMotion() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('motion-ready');
    this.motionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-motion-visible');
        this.motionObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -7% 0px' });
  },

  refreshMotion(root = document) {
    if (!this.motionObserver) return;
    const selectors = [
      '.eclipse-identity', '.stat-card', '.form-pulse', '.form-trajectory',
      '.outcome-module', '.mvp-module', '.match-insights', '.briefing-hero',
      '.briefing-panel', '.briefing-admin', '.player-card', '.records-section',
      '.command-module', '.analytics-section-heading', '.analytics-scope-console',
      '.analytics-scope-comparison', '.data-readiness', '.party-distribution', '.archived-roster',
      '.submission-hero', '.submission-panel', '.submission-card',
      '.meta-lab-hero', '.meta-tier-console', '.meta-hero-library', '.meta-patch-feature', '.meta-patch-signals'
    ].join(',');
    root.querySelectorAll(selectors).forEach((element, index) => {
      if (element.dataset.motionReady === 'true') return;
      element.dataset.motionReady = 'true';
      element.classList.add('motion-reveal');
      element.style.setProperty('--motion-order', String(index % 6));
      this.motionObserver.observe(element);
    });
  },

  bindSidebarNav() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const page = el.getAttribute('data-page');
        if (page) {
          this.navigate(page);
          document.getElementById('sidebar')?.classList.remove('open');
          document.getElementById('sidebarOverlay')?.classList.remove('active');
          document.getElementById('sidebarOverlay')?.setAttribute('aria-hidden', 'true');
          document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
        }
      });
    });
  },

  bindMobileNav() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (hamburgerBtn && sidebar && overlay) {
      hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
        const isOpen = sidebar.classList.contains('open');
        hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        overlay.setAttribute('aria-hidden', String(!isOpen));
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
      });
    }
  },

  bindDashboardTrendTabs() {
    const tabsContainer = document.getElementById('dashTrendTabs');
    const trendPanel = document.getElementById('dashTrendsContent');
    if (tabsContainer) {
      const tabs = [...tabsContainer.querySelectorAll('[data-period]')];
      const activateTab = btn => {
        tabs.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
          b.tabIndex = -1;
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.tabIndex = 0;
        if (trendPanel && btn.id) trendPanel.setAttribute('aria-labelledby', btn.id);
        const period = btn.getAttribute('data-period');
        this.currentTrendPeriod = period;
        this.renderDashboardTrends(period);
      };

      tabs.forEach((btn, index) => {
        btn.tabIndex = btn.getAttribute('aria-selected') === 'true' ? 0 : -1;
        btn.addEventListener('click', () => {
          activateTab(btn);
        });
        btn.addEventListener('keydown', event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const nextTab = tabs[(index + direction + tabs.length) % tabs.length];
          nextTab.focus();
          activateTab(nextTab);
        });
      });
    }
  },

  bindAnalyticsScopeToggle() {
    this.updateAnalyticsScopeControl();
    for (const id of ['analyticsScopeToggle', 'teamContextToggle']) {
      const toggle = document.getElementById(id);
      if (!toggle) continue;
      toggle.addEventListener('click', () => {
      this.currentAnalyticsMode = this.currentAnalyticsMode === 'team5' ? 'squad' : 'team5';
      localStorage.setItem('eclipse_analytics_mode', this.currentAnalyticsMode);
      this.updateAnalyticsScopeControl();

      if (id === 'teamContextToggle') {
        const page = document.querySelector('.page-section.active')?.id.replace('page-', '');
        if (page === 'player-profile' && this.currentProfileId) this.showPlayerProfile(this.currentProfileId);
        else if (page) this.navigate(page);
        return;
      }

      const customFrom = document.getElementById('statsDateFrom')?.value;
      const customTo = document.getElementById('statsDateTo')?.value;
      if (this.currentPeriod === 'custom' && customFrom && customTo) {
        this.renderStatistics('custom', customFrom, customTo);
      } else {
        this.renderStatistics(this.currentPeriod === 'custom' ? 'all' : this.currentPeriod);
      }
      this.renderAnalyticsArchive(this.dataStore.getMatches(), this.dataStore.getAllPlayers?.() || this.dataStore.getPlayers());
      requestAnimationFrame(() => this.refreshMotion(document.getElementById('page-statistics') || document));
    });
    }
  },

  updateAnalyticsScopeControl() {
    if (!this.dataStore) return;
    const allMatches = this.dataStore.getMatches();
    const teamCount = this.getAnalyticsMatches(allMatches, 'team5').length;
    const squadCount = this.getAnalyticsMatches(allMatches, 'squad').length;
    const isSquad = this.currentAnalyticsMode === 'squad';
    for (const [boxId, prefix, teamId, squadId] of [
      ['analyticsScopeConsole', 'analyticsScope', 'analyticsTeamCount', 'analyticsSquadCount'],
      ['teamContextBar', 'teamContext', 'teamContextTeamCount', 'teamContextSquadCount']
    ]) {
    const consoleBox = document.getElementById(boxId);
    const toggle = document.getElementById(`${prefix}Toggle`);
    if (!consoleBox || !toggle) continue;
    consoleBox.dataset.mode = isSquad ? 'squad' : 'team5';
    toggle.setAttribute('aria-checked', String(isSquad));
    toggle.setAttribute('aria-label', isSquad
      ? 'Practice Lite statistikasi tanlangan. Team 5 statistikasiga o‘tish'
      : 'Team 5 statistikasi tanlangan. Practice Lite statistikasiga o‘tish');
    const title = document.getElementById(`${prefix}Title`);
    const description = document.getElementById(`${prefix}Description`);
    const teamCounter = document.getElementById(teamId);
    const squadCounter = document.getElementById(squadId);
    if (title) title.textContent = isSquad ? 'Practice Lite statistikasi' : 'Team 5 statistikasi';
    if (description) description.textContent = isSquad
      ? '1–4 nafar Eclipse o‘yinchisi qatnashgan matchlar. Guest natijalari individual reytingga qo‘shilmaydi.'
      : 'Faqat to‘liq 5 kishilik Eclipse tarkibi qatnashgan matchlar.';
    if (teamCounter) teamCounter.textContent = `${teamCount} match jami`;
    if (squadCounter) squadCounter.textContent = `${squadCount} match jami`;
    }
  },

  bindStatsTabs() {
    const tabsContainer = document.getElementById('statsTabs');
    const customRangeBox = document.getElementById('customDateRange');
    const applyCustomBtn = document.getElementById('applyCustomRange');
    const weekCalendarBox = document.getElementById('weekCalendarBox');
    const statsWeekPicker = document.getElementById('statsWeekPicker');
    const prevWeekBtn = document.getElementById('prevWeekBtn');
    const nextWeekBtn = document.getElementById('nextWeekBtn');

    if (statsWeekPicker) {
      statsWeekPicker.value = this.selectedWeekDate;
      statsWeekPicker.addEventListener('change', (e) => {
        if (e.target.value) {
          this.selectedWeekDate = e.target.value;
          this.renderStatistics('week');
        }
      });
    }

    if (prevWeekBtn) {
      prevWeekBtn.addEventListener('click', () => {
        this.selectedWeekDate = window.EclipseDateUtils?.addDays?.(this.selectedWeekDate, -7) || this.selectedWeekDate;
        if (statsWeekPicker) statsWeekPicker.value = this.selectedWeekDate;
        this.renderStatistics('week');
      });
    }

    if (nextWeekBtn) {
      nextWeekBtn.addEventListener('click', () => {
        this.selectedWeekDate = window.EclipseDateUtils?.addDays?.(this.selectedWeekDate, 7) || this.selectedWeekDate;
        if (statsWeekPicker) statsWeekPicker.value = this.selectedWeekDate;
        this.renderStatistics('week');
      });
    }

    if (tabsContainer) {
      const tabs = [...tabsContainer.querySelectorAll('.tab-btn')];
      const activateTab = btn => {
        tabs.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
          b.tabIndex = -1;
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        btn.tabIndex = 0;
        const statsPanel = document.getElementById('statsContent');
        if (statsPanel && btn.id) statsPanel.setAttribute('aria-labelledby', btn.id);

        const period = btn.getAttribute('data-period');
        this.currentPeriod = period;

        if (period === 'custom') {
          if (customRangeBox) customRangeBox.classList.remove('hidden');
          if (weekCalendarBox) weekCalendarBox.classList.add('hidden');
        } else if (period === 'week') {
          if (customRangeBox) customRangeBox.classList.add('hidden');
          if (weekCalendarBox) weekCalendarBox.classList.remove('hidden');
          this.renderStatistics('week');
        } else {
          if (customRangeBox) customRangeBox.classList.add('hidden');
          if (weekCalendarBox) weekCalendarBox.classList.add('hidden');
          this.renderStatistics(period);
        }
      };

      tabs.forEach((btn, index) => {
        btn.tabIndex = btn.getAttribute('aria-selected') === 'true' ? 0 : -1;
        btn.addEventListener('click', () => {
          activateTab(btn);
        });
        btn.addEventListener('keydown', event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const nextTab = tabs[(index + direction + tabs.length) % tabs.length];
          nextTab.focus();
          activateTab(nextTab);
        });
      });
    }

    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', () => {
        const from = document.getElementById('statsDateFrom').value;
        const to = document.getElementById('statsDateTo').value;
        if (!from || !to) {
          window.showToast('Boshlanish va tugash sanasini tanlang.', 'warning');
          return;
        }
        this.renderStatistics('custom', from, to);
      });
    }
  },

  bindSettings() {
    document.getElementById('revokeSessionsBtn')?.addEventListener('click', async event => {
      if (!this.authManager.isAdmin() || !window.confirm('Siz va barcha jamoadoshlar barcha qurilmalarda qayta parol kiritishi kerak bo‘ladi. Davom etilsinmi?')) return;
      const button = event.currentTarget; button.disabled = true;
      try {
        const response = await fetch('/api/auth', { method: 'PATCH', headers: { Authorization: `Bearer ${this.authManager.getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'revoke_all' }), signal: AbortSignal.timeout(15000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sessiyalar bekor qilinmadi.');
        [this.authManager.TOKEN_KEY, this.authManager.SESSION_KEY, this.authManager.VIEWER_TOKEN_KEY].forEach(key => sessionStorage.removeItem(key));
        window.location.reload();
      } catch (error) { window.showToast(error.message, 'error'); }
      finally { button.disabled = false; }
    });
    document.getElementById('fullBackupBtn')?.addEventListener('click', async event => {
      if (!this.authManager.isAdmin()) return window.showToast('Admin sifatida kiring.', 'warning');
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const response = await fetch('/api/backup', {
          headers: { Authorization: `Bearer ${this.authManager.getToken()}` },
          cache: 'no-store', signal: AbortSignal.timeout(20000)
        });
        const data = await response.json();
        if (!response.ok || data.format !== 'eclipse-team-backup-v1' || !data.state?.files?.['eclipse_data.json']) {
          throw new Error(data.error || 'To‘liq zaxira qaytmadi.');
        }
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `eclipse_team_full_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        window.showToast('To‘liq jamoa zaxirasini yuklab olish boshlandi.', 'success');
      } catch (error) {
        window.showToast(error.message || 'Zaxirani yuklab bo‘lmadi.', 'error');
      } finally { button.disabled = false; }
    });
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const clearBtn = document.getElementById('clearBtn');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(this.dataStore.exportData());
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `eclipse_esports_stats_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        window.showToast('Shu brauzerdagi statistika nusxasini yuklab olish boshlandi.', 'success');
      });
    }

    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => {
        const file = importFile.files[0];
        if (!file) {
          window.showToast('Avval JSON zaxira faylini tanlang.', 'warning');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const success = this.dataStore.importData(e.target.result);
          if (success) {
            // DataStore imports the catalog into storage; rebuild the live
            // database so OCR and the Heroes page use the imported snapshot.
            this.rebuildHeroDatabase();
            this.cloudSync?.syncUp?.();
            window.showToast('Zaxira nusxa tiklandi.', 'success');
            this.navigate('dashboard');
          } else {
            window.showToast('Zaxira faylini o‘qib bo‘lmadi.', 'error');
          }
        };
        reader.readAsText(file);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!this.authManager.isAdmin()) {
          this.authManager.showLoginModal();
          return;
        }
        if (confirm('Barcha jamoa ma’lumotlarini o‘chirishni xohlaysizmi? Bu amalni ortga qaytarib bo‘lmaydi.')) {
          if (confirm('Yana bir bor tasdiqlang: matchlar, roster va custom herolar o‘chirilsinmi?')) {
            this.dataStore.clearAll();
            window.showToast('Mahalliy ma’lumotlar tozalandi.', 'warning');
            this.navigate('dashboard');
          }
        }
      });
    }

    // Cloud Sync Setting Handlers
    const forceSyncBtn = document.getElementById('forceSyncBtn');
    const cloudSyncStatus = document.getElementById('cloudSyncStatus');
    const cloudSyncBadge = document.getElementById('cloudSyncBadge');
    const syncConsole = document.getElementById('syncConsole');

    const renderSyncStatus = snapshot => {
      if (!snapshot || !cloudSyncStatus || !cloudSyncBadge || !syncConsole) return;
      const meta = {
        idle: ['Tekshirilmagan', 'Cloud holati keyingi syncda tekshiriladi.', 'fa-circle'],
        syncing: ['Sinxronlanmoqda', 'Mahalliy va cloud ma’lumotlari tekshirilmoqda...', 'fa-arrows-rotate fa-spin'],
        synced: ['Sinxron', snapshot.lastSync ? `Oxirgi sync: ${new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(snapshot.lastSync))}` : 'Cloud bilan sinxron.', 'fa-circle-check'],
        empty: ['Cloud bo‘sh', 'Cloud bazada hali jamoa ma’lumoti yo‘q.', 'fa-circle-minus'],
        offline: ['Offline', 'Internet qaytgach sinxronlashni qayta urining.', 'fa-wifi'],
        error: ['Xatolik', snapshot.error || 'Cloud bilan bog‘lanib bo‘lmadi.', 'fa-triangle-exclamation'],
        conflict: ['Tanlov kerak', 'Bir yozuv ikki qurilmada tahrirlangan. Sinxronlashni bosib saqlanadigan variantni tanlang.', 'fa-code-branch'],
        locked: ['Kirish kerak', snapshot.error || 'Cloud ma’lumoti himoyalangan.', 'fa-lock']
      }[snapshot.state] || ['Noma’lum', 'Cloud holati aniqlanmadi.', 'fa-circle-question'];
      syncConsole.dataset.state = snapshot.state;
      cloudSyncBadge.innerHTML = `<i class="fa-solid ${meta[2]}"></i> ${meta[0]}`;
      cloudSyncStatus.textContent = `${meta[1]}${snapshot.pending ? ' Lokal o‘zgarish yuborilmagan.' : ''}`;
      if (forceSyncBtn) forceSyncBtn.disabled = snapshot.syncing;
    };

    this.cloudSync.subscribe?.(renderSyncStatus);

    if (forceSyncBtn) {
      forceSyncBtn.addEventListener('click', async () => {
        forceSyncBtn.disabled = true;
        forceSyncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sinxronlanmoqda';
        if (this.cloudSync.getStatus().pending) await this.cloudSync.syncUp();
        else await this.cloudSync.syncDown();
        forceSyncBtn.disabled = false;
        forceSyncBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Sinxronlash';
      });
    }

  },

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('modalOverlay');
        if (overlay?.getAttribute('aria-hidden') === 'false') {
          if (overlay.dataset.mandatory !== 'true') {
            this.authManager?.closeModal?.();
          }
          return;
        }
      }

      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const pages = ['dashboard', 'match-history', 'players', 'statistics', 'briefing'];
      const num = parseInt(e.key);
      if (num >= 1 && num <= pages.length) {
        e.preventDefault();
        this.navigate(pages[num - 1]);
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
        document.getElementById('sidebarOverlay')?.setAttribute('aria-hidden', 'true');
        document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.editingMatchId = null;
        this.navigate('add-match');
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.navigate('submissions');
        return;
      }

    });
  },

  navigate(pageId) {
    // The old hand-maintained hero page is retired; Hero Dossier now lives
    // inside the canonical, automatically synced Meta Lab.
    if (pageId === 'heroes') pageId = 'meta-lab';

    if (window._eclipseUnsavedMatch && pageId !== 'add-match') {
      if (!confirm('Match formasida saqlanmagan o‘zgarishlar bor. Sahifadan chiqishni xohlaysizmi?')) {
        return;
      }
      window._eclipseUnsavedMatch = false;
    }

    // Protect data-management routes for Admin only.
    if ((pageId === 'add-match' || pageId === 'settings') && !this.authManager.isAdmin()) {
      this.authManager.protectAction(() => {
        this.navigate(pageId);
      });
      return;
    }

    document.querySelectorAll('.page-section').forEach(el => {
      el.classList.remove('active');
      el.setAttribute('hidden', '');
    });

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => {
      if (el.getAttribute('data-page') === pageId) {
        el.classList.add('active');
        el.setAttribute('aria-current', 'page');
      } else {
        el.classList.remove('active');
        el.removeAttribute('aria-current');
      }
    });

    const pageTitleEl = document.getElementById('pageTitle');
    const titles = {
      'dashboard': 'Bosh sahifa',
      'add-match': 'Match qo‘shish',
      'match-history': 'Matchlar',
      'submissions': 'Match yuborish',
      'players': 'Jamoa',
      'player-profile': 'O‘yinchi profili',
      'statistics': 'Tahlil',
      'briefing': 'Briefing',
      'meta-lab': 'Meta Lab',
      'settings': 'Sozlamalar'
    };
    if (pageTitleEl) pageTitleEl.textContent = titles[pageId] || 'Eclipse Esports';

    const target = document.getElementById(`page-${pageId}`);
    const contextBar = document.getElementById('teamContextBar');
    if (contextBar) contextBar.hidden = !['players', 'player-profile', 'match-history'].includes(pageId);
    this.updateAnalyticsScopeControl();
    if (target) {
      target.classList.add('active');
      target.removeAttribute('hidden');
      window.scrollTo(0, 0);
    }

    const matches = this.dataStore.getMatches();
    const players = this.dataStore.getActivePlayers?.() || this.dataStore.getPlayers();
    const allPlayers = this.dataStore.getAllPlayers?.() || this.dataStore.getPlayers();

    switch (pageId) {
      case 'dashboard':
        this.renderDashboard(matches, players);
        break;
      case 'add-match':
        this.submissionManager.render('matchFormContainer', this.editingMatchId || null);
        this.editingMatchId = null;
        break;
      case 'match-history':
        const historyMatches = this.getHistoryMatches(matches);
        this.matchManager.renderMatchHistory('matchHistoryContainer', historyMatches, allPlayers);
        const filterBar = document.getElementById('matchFilterBar');
        if (filterBar) {
          const filterChips = [...filterBar.querySelectorAll('.filter-chip')];
          filterChips.forEach(chip => {
            chip.classList.toggle('active', chip.dataset.filter === 'all');
            chip.setAttribute('aria-pressed', String(chip.dataset.filter === 'all'));
          });
          filterChips.forEach(chip => {
            chip.onclick = () => {
              filterChips.forEach(c => {
                c.classList.remove('active');
                c.setAttribute('aria-pressed', 'false');
              });
              chip.classList.add('active');
              chip.setAttribute('aria-pressed', 'true');
              const filterType = chip.dataset.filter;
              const latestMatches = this.getHistoryMatches(this.dataStore.getMatches());
              const latestPlayers = this.dataStore.getAllPlayers?.() || this.dataStore.getPlayers();
              const filteredMatches = filterType === 'all' 
                ? latestMatches
                : latestMatches.filter(m => (m.matchType || 'ranked') === filterType);
              this.matchManager.renderMatchHistory('matchHistoryContainer', filteredMatches, latestPlayers);
            };
          });
        }
        break;
      case 'submissions':
        this.submissionManager.render('submissionContainer');
        break;
      case 'players':
        this.playerManager.renderAddPlayerForm('addPlayerContainer');
        this.playerManager.renderPlayersList('playersListContainer');
        break;
      case 'statistics':
        this.updateAnalyticsScopeControl();
        this.renderStatistics(this.currentPeriod, document.getElementById('statsDateFrom')?.value, document.getElementById('statsDateTo')?.value);
        this.renderAnalyticsArchive(matches, allPlayers);
        break;
      case 'briefing':
        this.briefingManager.render('briefingContainer');
        break;
      case 'meta-lab':
        this.mlbbData.render('metaLabContainer');
        break;
    }
    requestAnimationFrame(() => this.refreshMotion(target || document));
  },

  editMatch(matchId) {
    this.editingMatchId = matchId;
    this.navigate('add-match');
  },

  showPlayerProfile(playerId) {
    this.currentProfileId = playerId;
    this.navigate('player-profile');
    this.playerManager.renderPlayerProfile('playerProfileContainer', playerId, this.getAnalyticsMatches(this.dataStore.getMatches()));
  },

  // =====================================================================
  //  DASHBOARD
  // =====================================================================
  getOfficialTeamMatches(matches = []) {
    return matches.filter(match =>
      match?.scope === 'team5'
      && match?.status !== 'draft'
      && match?.validForAnalytics !== false
      && match?.needsReview !== true
      && window.StatsEngine?.hasOfficialTeamContext?.(match) === true
    );
  },

  getAnalyticsMatches(matches = [], mode = this.currentAnalyticsMode) {
    return window.StatsEngine.filterAnalyticsMatches(matches, mode);
  },

  getHistoryMatches(matches = []) {
    // A ledger must retain invalid records so the admin can repair them.
    const scopes = this.currentAnalyticsMode === 'squad' ? ['individual', 'squad'] : ['team5'];
    return matches.filter(match => scopes.includes(match.scope)
      || (this.authManager?.isAdmin() && !['team5', 'squad', 'individual'].includes(match.scope)));
  },

  getTrackedUnitStats(matches = []) {
    const list = Array.isArray(matches) ? matches : [];
    const formationCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const formationResults = {
      1: { wins: 0, losses: 0 },
      2: { wins: 0, losses: 0 },
      3: { wins: 0, losses: 0 },
      4: { wins: 0, losses: 0 }
    };
    const trackedRows = [];
    let wins = 0;
    let losses = 0;
    let guestSlots = 0;
    const savageList = [];
    const maniacList = [];

    list.forEach(match => {
      const playerStats = Array.isArray(match?.playerStats) ? match.playerStats : [];
      const trackedCount = window.StatsEngine.getTrackedRosterCount(match);
      if (Object.prototype.hasOwnProperty.call(formationCounts, trackedCount)) {
        formationCounts[trackedCount] += 1;
        if (match?.result === 'win') formationResults[trackedCount].wins += 1;
        if (match?.result === 'loss') formationResults[trackedCount].losses += 1;
      }
      trackedRows.push(...playerStats);
      playerStats.forEach(stat => {
        const achievement = { playerId: stat.playerId, heroUsed: stat.heroUsed, date: match.date, matchId: match.id };
        if (stat.savage === true) savageList.push(achievement);
        if (stat.maniac === true) maniacList.push(achievement);
      });
      guestSlots += Array.isArray(match?.guestStats) ? match.guestStats.length : 0;
      if (match?.result === 'win') wins += 1;
      if (match?.result === 'loss') losses += 1;
    });

    const completeTotal = key => {
      if (!trackedRows.length) return null;
      const values = trackedRows.map(row => window.StatsEngine.numberOrNull(row?.[key]));
      return values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const totalKills = completeTotal('kills');
    const totalDeaths = completeTotal('deaths');
    const totalAssists = completeTotal('assists');
    const decidedMatches = wins + losses;
    const kda = [totalKills, totalDeaths, totalAssists].every(value => value !== null)
      ? ((totalKills + totalAssists) / Math.max(totalDeaths, 1)).toFixed(2)
      : null;

    return {
      totalMatches: list.length,
      wins,
      losses,
      winRate: decidedMatches ? ((wins / decidedMatches) * 100).toFixed(1) : null,
      trackedAppearances: trackedRows.length,
      guestSlots,
      formationCounts,
      formationResults,
      totalDamageDealt: completeTotal('damageDealt'),
      totalDamageReceived: completeTotal('damageReceived'),
      totalTurretDamage: completeTotal('turretDamage'),
      totalGoldEarned: completeTotal('goldEarned'),
      kda,
      savageList,
      maniacList,
      totalSavages: savageList.length,
      totalManiacs: maniacList.length
    };
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  renderDashboard(matches, players) {
    const container = document.getElementById('dashboardCommand');
    if (!container) return;
    const officialMatches = this.getOfficialTeamMatches(matches);
    const sorted = [...officialMatches].sort((a, b) => {
      const byDate = String(b.date || '').localeCompare(String(a.date || ''));
      return byDate || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    const { recent, previous, recentRate, previousRate, delta, comparable } = window.StatsEngine.recentTeamResults(officialMatches);
    const latest = sorted[0] || null;
    const fmtDate = window.StatsEngine.formatDateFormatted;
    const formatResult = match => match?.result === 'win' ? 'G‘alaba' : 'Mag‘lubiyat';

    const latestMarkup = latest ? `
      <article class="command-module command-latest">
        <header><div><p class="command-kicker">OXIRGI TASDIQLANGAN TEAM MATCH</p><h3>${this.escapeHtml(fmtDate(latest.date))}</h3></div><span class="command-result is-${latest.result}">${latest.result === 'win' ? 'W' : 'L'}</span></header>
        <div class="command-latest__body">
          <div><small>Natija</small><strong>${formatResult(latest)}</strong></div>
          <div><small>Match turi</small><strong>${this.escapeHtml(latest.matchType || 'ranked')}</strong></div>
          <div><small>Data</small><strong>${latest.dataCompleteness === 'full' ? 'To‘liq' : 'Qisman'} · ${latest.ocrVerified ? 'OCR' : 'Manual'}</strong></div>
        </div>
        <button type="button" class="command-link" data-command="open-match" data-match-id="${this.escapeHtml(latest.id)}">Matchni ochish <span aria-hidden="true">↗</span></button>
      </article>` : `
      <article class="command-module command-latest command-empty">
        <span class="command-empty__icon"><i class="fa-regular fa-circle-dot"></i></span>
        <div><p class="command-kicker">OXIRGI TEAM MATCH</p><h3>Match kutilmoqda</h3><p>Team 5 sifatida tasdiqlangan match shu yerda ko‘rinadi.</p></div>
      </article>`;

    const pulseState = delta === null
      ? { className: 'is-neutral', icon: 'fa-minus', text: 'Teng taqqoslash uchun 5 tadan ikkita guruh kerak. Hozircha faqat natijalar ko‘rsatiladi.' }
      : delta > 0
        ? { className: 'is-positive', icon: 'fa-arrow-trend-up', text: `G‘alaba ko‘rsatkichi +${delta} foiz punkt` }
        : delta < 0
          ? { className: 'is-negative', icon: 'fa-arrow-trend-down', text: `G‘alaba ko‘rsatkichi ${delta} foiz punkt` }
          : { className: 'is-neutral', icon: 'fa-minus', text: 'G‘alaba ko‘rsatkichi o‘zgarmagan' };
    const pulseMarkup = `
      <article class="command-module command-pulse">
        <header><div><p class="command-kicker">JAMOA FORMASI</p><h3>Natijalar dinamikasi</h3></div><span class="command-confidence">${recent.length + previous.length} ta tasdiqlangan match</span></header>
        <div class="command-pulse__score">
          <div><small>Eng so‘nggi matchlar</small><strong>${recentRate === null ? '—' : `${recentRate}%`}</strong><span>${recent.length} match</span></div>
          <span class="command-pulse__divider" aria-hidden="true"></span>
          <div><small>Ulardan oldingi matchlar</small><strong>${previousRate === null ? '—' : `${previousRate}%`}</strong><span>${previous.length} match</span></div>
        </div>
        ${!comparable ? `<div class="recent-results" aria-label="So‘nggi natijalar, eng yangisi birinchi">${recent.map(match => `<span class="is-${match.result}" title="${this.escapeHtml(fmtDate(match.date))}">${match.result === 'win' ? 'W' : 'L'}</span>`).join('')}</div>` : ''}
        <p class="command-pulse__delta ${pulseState.className}"><i class="fa-solid ${pulseState.icon}"></i>${pulseState.text}</p>
      </article>`;

    container.innerHTML = `
      <section class="command-grid command-grid--base" aria-label="Jamoa signali">
        <article class="command-module command-focus is-loading"><p class="command-kicker">JORIY FOKUS</p><div class="command-inline-loader"><i></i><span>Briefing olinmoqda</span></div></article>
        ${latestMarkup}
        ${pulseMarkup}
        <article class="command-module command-approved is-loading"><p class="command-kicker">CAPTAIN TASDIQLAGAN INSIGHT</p><div class="command-inline-loader"><i></i><span>Qarorlar tekshirilmoqda</span></div></article>
        <article class="command-module command-next is-loading"><p class="command-kicker">NAVBATDAGI HARAKAT</p><div class="command-inline-loader"><i></i><span>VOD va so‘rovnoma olinmoqda</span></div></article>
      </section>`;

    container.querySelector('[data-command="open-match"]')?.addEventListener('click', event => {
      this.matchManager.renderMatchDetailModal(event.currentTarget.dataset.matchId, this.dataStore.getAllPlayers?.() || this.dataStore.getPlayers());
    });
    this.renderDashboardBriefing(container);
  },

  async renderDashboardBriefing(container) {
    const focusModule = container.querySelector('.command-focus');
    const insightModule = container.querySelector('.command-approved');
    const nextModule = container.querySelector('.command-next');
    try {
      const data = await this.briefingManager.request();
      if (!container.isConnected || !document.getElementById('page-dashboard')?.classList.contains('active')) return;
      this.briefingManager.data = data;
      const focus = Array.isArray(data.focus) ? data.focus.filter(Boolean).slice(0, 3) : [];
      focusModule.classList.remove('is-loading');
      focusModule.innerHTML = `
        <header><div><p class="command-kicker">JORIY FOKUS</p><h3>${focus.length ? 'Bugungi direktiva' : 'Fokus kutilmoqda'}</h3></div><span class="command-index">01</span></header>
        ${focus.length ? `<ol class="command-focus__list">${focus.map((item, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p>${this.escapeHtml(item)}</p></li>`).join('')}</ol>` : '<div class="command-module-empty"><i class="fa-solid fa-bullseye"></i><p>Admin joriy fokusni Briefingda belgilaydi.</p></div>'}
        <button type="button" class="command-link" data-command="briefing">Briefingni ochish <span aria-hidden="true">↗</span></button>`;

      const approved = (Array.isArray(data.insights) ? data.insights : [])
        .filter(insight => !insight?.status || insight.status === 'approved')
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];
      insightModule.classList.remove('is-loading');
      if (approved) {
        const source = approved.summary || approved.title || '';
        insightModule.innerHTML = `
          <header><div><p class="command-kicker">CAPTAIN TASDIQLAGAN INSIGHT</p><h3>${this.escapeHtml(approved.title || 'Tasdiqlangan xulosa')}</h3></div><span class="command-approved__seal"><i class="fa-solid fa-check"></i></span></header>
          <blockquote>${this.escapeHtml(source)}</blockquote>
          ${approved.sampleSize ? `<p class="command-approved__source">Sample: ${this.escapeHtml(approved.sampleSize)} match · ${this.escapeHtml(approved.confidence || 'signal')}</p>` : ''}
          ${approved.matchId ? `<button type="button" class="command-link" data-command="open-match" data-match-id="${this.escapeHtml(approved.matchId)}">Bog‘langan match <span aria-hidden="true">↗</span></button>` : ''}`;
      } else {
        insightModule.innerHTML = `<p class="command-kicker">CAPTAIN TASDIQLAGAN INSIGHT</p><div class="command-module-empty"><i class="fa-solid fa-check-double"></i><div><strong>Hozircha yo‘q</strong><p>Auto insight faqat captain tasdiqlagandan keyin bu yerda ko‘rinadi.</p></div></div>`;
      }

      const reviews = (Array.isArray(data.reviews) ? data.reviews : []).filter(review => review.status !== 'done');
      const polls = (Array.isArray(data.polls) ? data.polls : []).filter(poll => poll.active);
      const nextReview = reviews[0];
      const nextPoll = polls[0];
      nextModule.classList.remove('is-loading');
      nextModule.innerHTML = `
        <header><div><p class="command-kicker">NAVBATDAGI HARAKAT</p><h3>${nextReview ? 'VOD navbati' : nextPoll ? 'Ochiq so‘rovnoma' : 'Navbat toza'}</h3></div><span class="command-index">03</span></header>
        ${nextReview ? `<div class="command-next__item"><span><i class="fa-solid fa-film"></i></span><div><strong>${this.escapeHtml(nextReview.title)}</strong><p>${this.escapeHtml(nextReview.reason || 'Ko‘rib chiqish uchun qoldirilgan VOD.')}</p></div></div>` : ''}
        ${nextPoll ? `<div class="command-next__item"><span><i class="fa-solid fa-check-to-slot"></i></span><div><strong>${this.escapeHtml(nextPoll.question)}</strong><p>${Number(nextPoll.totalVotes) || 0} ovoz · ovoz berish ochiq</p></div></div>` : ''}
        ${!nextReview && !nextPoll ? '<div class="command-module-empty"><i class="fa-solid fa-circle-check"></i><p>Ochiq VOD yoki so‘rovnoma yo‘q.</p></div>' : ''}
        <button type="button" class="command-link" data-command="briefing">${nextPoll ? 'Ovoz berish' : 'Briefingni ochish'} <span aria-hidden="true">↗</span></button>`;

      container.querySelectorAll('[data-command="briefing"]').forEach(button => button.addEventListener('click', () => this.navigate('briefing')));
      container.querySelectorAll('[data-command="open-match"]').forEach(button => button.addEventListener('click', event => {
        this.matchManager.renderMatchDetailModal(event.currentTarget.dataset.matchId, this.dataStore.getAllPlayers?.() || this.dataStore.getPlayers());
      }));
      this.refreshMotion(container);
    } catch (error) {
      [focusModule, insightModule, nextModule].forEach(module => module?.classList.remove('is-loading'));
      if (focusModule) focusModule.innerHTML = `<p class="command-kicker">BRIEFING SIGNALI</p><div class="command-module-error"><i class="fa-solid fa-satellite-dish"></i><div><strong>Signal olinmadi</strong><p>${this.escapeHtml(error.message)}</p></div></div><button type="button" class="command-link" data-command="retry-briefing">Qayta urinish</button>`;
      if (insightModule) insightModule.innerHTML = '<p class="command-kicker">TASDIQLANGAN INSIGHT</p><div class="command-module-empty"><p>Briefing tiklangach ko‘rinadi.</p></div>';
      if (nextModule) nextModule.innerHTML = '<p class="command-kicker">NAVBATDAGI HARAKAT</p><div class="command-module-empty"><p>Briefing tiklangach ko‘rinadi.</p></div>';
      container.querySelector('[data-command="retry-briefing"]')?.addEventListener('click', () => this.renderDashboardBriefing(container));
    }
  },

  renderAnalyticsScopeComparison(matches = []) {
    const container = document.getElementById('analyticsScopeComparison');
    if (!container || !window.StatsEngine?.getAnalyticsScopeComparison) return;
    const comparison = window.StatsEngine.getAnalyticsScopeComparison(matches);
    const { team5, squad } = comparison;
    if (!team5.totalMatches && !squad.totalMatches) {
      container.replaceChildren();
      return;
    }

    const rate = value => value === null ? '—' : `${Number(value).toFixed(1)}%`;
    const delta = comparison.comparable ? comparison.adjustedDelta : comparison.rawDelta;
    const deltaLabel = delta === null ? '—' : `${delta > 0 ? '+' : ''}${Number(delta).toFixed(1)} pp`;
    const typeLabel = summary => Object.entries(summary.matchTypes)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([type, value]) => `${value.total} ${this.escapeHtml(type)}`)
      .join(' · ') || 'match turi yo‘q';
    const compositionLabel = squad.dominantComposition
      ? `Practice Lite · ${squad.dominantComposition} kishilik tarkib`
      : 'Practice Lite';
    const allUnverified = team5.quality.verifiedMatches + squad.quality.verifiedMatches === 0;
    const allLegacy = team5.quality.legacyMatches + squad.quality.legacyMatches === team5.totalMatches + squad.totalMatches;
    const note = comparison.comparable
      ? `Bir xil match turlari vazni tenglashtirildi. Adjusted farq ${deltaLabel}; baribir bu sababiy ustunlik xulosasi emas.`
      : `Xom natija farqi ustunlik xulosasi emas: sample va match turlari tenglashtirilmagan. Team 5: ${typeLabel(team5)}; Practice Lite: ${typeLabel(squad)}.${allLegacy ? ' Barcha manbalar legacy.' : ''}${allUnverified ? ' Hali hech biri tasdiqlanmagan.' : ''}`;

    container.dataset.mode = this.currentAnalyticsMode;
    container.innerHTML = `
      <header class="analytics-scope-comparison__header">
        <div>
          <p class="section-eyebrow">MODE COMPARISON / ALL TIME</p>
          <h3>${comparison.comparable ? 'Kontekst bo‘yicha tenglashtirilgan signal' : 'Taqqoslashga hali erta'}</h3>
          <p>Team 5 va Practice Lite natijalari yonma-yon, lekin kuchlilik hukmisiz ko‘rsatiladi.</p>
        </div>
        <span class="analytics-scope-comparison__status"><i class="fa-solid fa-circle"></i>${comparison.comparable ? 'ADJUSTED' : 'DESCRIPTIVE ONLY'}</span>
      </header>
      <div class="analytics-scope-comparison__modes">
        <article class="analytics-scope-comparison__mode" data-mode="team5">
          <small>TEAM 5 · ${team5.totalMatches} MATCH</small>
          <strong>${rate(comparison.comparable ? comparison.adjustedTeamWinRate : team5.winRate)}</strong>
          <span>${team5.wins} W / ${team5.losses} L · ${this.escapeHtml(team5.confidence.label)}</span>
        </article>
        <div class="analytics-scope-comparison__delta">
          <strong>${deltaLabel}</strong><small>${comparison.comparable ? 'adjusted farq' : 'xom farq'}</small>
        </div>
        <article class="analytics-scope-comparison__mode is-squad" data-mode="squad">
          <small>${this.escapeHtml(compositionLabel.toUpperCase())} · ${squad.totalMatches} MATCH</small>
          <strong>${rate(comparison.comparable ? comparison.adjustedSquadWinRate : squad.winRate)}</strong>
          <span>${squad.wins} W / ${squad.losses} L · ${this.escapeHtml(squad.confidence.label)}</span>
        </article>
      </div>
      <p class="analytics-scope-comparison__note"><i class="fa-solid fa-triangle-exclamation"></i><span>${note}</span></p>`;
  },

  renderAnalyticsArchive(matches, players) {
    const scopedMatches = this.getAnalyticsMatches(matches);
    const isSquadMode = this.currentAnalyticsMode === 'squad';
    const teamStats = this.statsEngine.getTeamStats(scopedMatches, { scope: 'all' });
    const mvpCard = document.getElementById('dashMvpCard');
    const mostMvps = this.statsEngine.getMostMvps(scopedMatches, players, { scope: 'all' });
    const fmt = window.StatsEngine.formatLargeNumber;
    const metric = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : this.escapeHtml(value);
    const formTitle = document.getElementById('formPulseTitle');
    const outcomeTitle = document.getElementById('analyticsOutcomeTitle');
    const hallTitle = document.getElementById('hallOfFameTitle');
    if (formTitle) formTitle.textContent = isSquadMode ? 'Practice Lite formasi' : 'O‘yinchilar formasi';
    if (outcomeTitle) outcomeTitle.textContent = isSquadMode ? 'Practice Lite natijasi' : 'Jamoa natijasi';
    if (hallTitle) hallTitle.textContent = isSquadMode ? 'Practice Lite Hall of Fame' : 'Hall of Fame';
    this.renderAnalyticsScopeComparison(matches);
    this.renderDashboardTrends(this.currentTrendPeriod);
    const insightMatches = isSquadMode
      ? scopedMatches.map(match => ({ ...match, guestStats: [] }))
      : scopedMatches;
    this.renderMatchInsights('analyticsMatchInsights', insightMatches, players);
    this.renderRecords(scopedMatches, players);

    const values = { dashTotalMatches: teamStats.totalMatches, dashWinRate: teamStats.winRate === null ? '—' : `${teamStats.winRate}%`, dashWins: teamStats.wins, dashLosses: teamStats.losses };
    Object.entries(values).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
    if (mvpCard) {
      mvpCard.innerHTML = mostMvps ? `
        <div class="mvp-module__halo" aria-hidden="true"><span></span></div>
        <header class="mvp-module__header"><div><p class="solar-eyebrow">MVP / ALL TIME</p><h3>MVP yetakchisi</h3></div><span class="mvp-module__rank">#01</span></header>
        <div class="mvp-module__identity"><span class="mvp-module__crown"><i class="fa-solid fa-crown"></i></span><div><button type="button" class="mvp-module__name" data-player-id="${this.escapeHtml(mostMvps.player.id)}">${this.escapeHtml(mostMvps.player.name)}</button><p>Eng ko‘p MVP olgan o‘yinchi</p></div></div>
        <div class="mvp-module__metrics"><div><span>KDA</span><strong>${metric(mostMvps.stats.kdaRatio)}</strong></div><div><span>MVP</span><strong>${mostMvps.mvpCount}<small> medal</small></strong></div><div><span>Damage</span><strong>${fmt(mostMvps.stats.totalDamageDealt)}</strong></div></div>`
        : '<div class="mvp-module__empty"><i class="fa-solid fa-crown"></i><strong>MVP kutilmoqda</strong><p>Yetakchini aniqlash uchun team match kerak.</p></div>';
      mvpCard.querySelector('[data-player-id]')?.addEventListener('click', event => this.showPlayerProfile(event.currentTarget.dataset.playerId));
    }
    setTimeout(() => {
      if (!window.ChartHelper || !document.getElementById('dashWinLossChart')) return;
      window.ChartHelper.drawPieChart('dashWinLossChart', teamStats.totalMatches ? [
        { label: 'G‘alaba', value: teamStats.wins, color: '#e7c36b' },
        { label: 'Mag‘lubiyat', value: teamStats.losses, color: '#673d3d' }
      ] : [{ label: 'Match yo‘q', value: 1, color: '#302d25' }]);
    }, 50);
  },

  renderMatchInsights(containerId, matches, players) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const escapeHtml = value => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

    if (!matches.length) {
      container.innerHTML = `
        <div class="match-insights__empty">
          <span><i class="fa-solid fa-wave-square"></i></span>
          <div><p class="solar-eyebrow">MATCH DEBRIEF</p><h3>Insight uchun match kutilmoqda</h3><p>Birinchi match kiritilgach, uchta amaliy signal shu yerda paydo bo‘ladi.</p></div>
        </div>`;
      return;
    }

    const latest = [...matches].sort((a, b) => {
      const aDate = Date.parse(`${a.date || ''}T00:00:00`) || 0;
      const bDate = Date.parse(`${b.date || ''}T00:00:00`) || 0;
      if (aDate !== bDate) return bDate - aDate;
      return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    })[0];
    const insights = this.statsEngine.getMatchInsights(latest, matches, players);
    const dateLabel = window.StatsEngine.formatDateFormatted(latest.date);

    container.innerHTML = `
      <header class="match-insights__header">
        <div>
          <p class="solar-eyebrow">MATCH DEBRIEF / ${escapeHtml(dateLabel)}</p>
          <h3>Auto insight — tekshirilmagan taxmin</h3>
          <p>Statistik signalni qaror sifatida ishlatishdan oldin captain tekshiradi va Briefingda tasdiqlaydi.</p>
        </div>
        <div class="match-insights__actions">
          <span class="match-insights__result is-${latest.result}">${latest.result === 'win' ? 'W' : 'L'}</span>
          <button type="button" class="match-insights__open" data-match-id="${escapeHtml(latest.id)}">Matchni ochish <i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        </div>
      </header>
      <div class="match-insights__grid">
        ${insights.map((insight, index) => `
          <article class="match-insight is-${insight.type}">
            <div class="match-insight__top"><span>${String(index + 1).padStart(2, '0')}</span><i class="fa-solid ${insight.icon}"></i></div>
            <p>${insight.label}</p>
            <h4>${escapeHtml(insight.title)}</h4>
            <div class="match-insight__metric">${escapeHtml(insight.metric)}</div>
            <small>${escapeHtml(insight.body)}</small>
          </article>`).join('')}
      </div>`;

    container.querySelector('[data-match-id]')?.addEventListener('click', () => {
      this.matchManager.renderMatchDetailModal(latest.id, players);
    });
  },

  // =====================================================================
  //  DASHBOARD TRENDS + PERFORMANCE FLOWCHART
  // =====================================================================
  renderDashboardTrends(period) {
    const container = document.getElementById('dashTrendsContent');
    if (!container) return;

    const matches = this.getAnalyticsMatches(this.dataStore.getMatches());
    const players = this.dataStore.getActivePlayers?.() || this.dataStore.getPlayers();
    const trends = this.statsEngine.getPlayerTrends(matches, players, period, { scope: 'all' });
    const periodMeta = {
      week: { label: 'So‘nggi 7 kun', short: '7 kun' },
      month: { label: 'So‘nggi 30 kun', short: '30 kun' },
      year: { label: 'So‘nggi 365 kun', short: '365 kun' }
    }[period] || { label: 'So‘nggi 7 kun', short: '7 kun' };
    const windowMeta = trends[0]?.window?.anchorDate ? trends[0].window : null;
    const description = document.getElementById('formPulseDescription');
    if (description) {
      description.textContent = windowMeta
        ? `${periodMeta.label}: ${windowMeta.currentLabel}. Oldingi teng oyna: ${windowMeta.previousLabel}.`
        : `${periodMeta.label} uchun match kutilmoqda.`;
    }

    if (players.length === 0 || matches.length === 0) {
      container.innerHTML = `
        <div class="form-pulse__empty">
          <span><i class="fa-solid fa-wave-square"></i></span>
          <div><strong>Forma signali hali yo‘q</strong><p>O‘zgarishlarni ko‘rish uchun match va o‘yinchilarni kiriting.</p></div>
        </div>`;
      this.renderPerformanceFlowChart([], players, period, windowMeta);
      return;
    }

    const escapeHtml = value => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
    const topRiser = trends.find(t => t.comparisonAvailable && t.diff > 0);
    const topFaller = [...trends].reverse().find(t => t.comparisonAvailable && t.diff < 0);

    const signalMarkup = (trend, type) => {
      if (!trend) {
        return `
          <article class="form-signal form-signal--quiet">
            <span class="form-signal__icon"><i class="fa-solid fa-minus"></i></span>
            <div class="form-signal__copy"><small>${type === 'rise' ? 'MOMENTUM' : 'WATCHLIST'}</small><strong>Taqqoslash uchun erta</strong><p>Har ikki davrda shu rol, match turi va tarkibda kamida 3 ta baho kerak. Shaxsiy oldingi davr = 100.</p></div>
          </article>`;
      }
      const positive = type === 'rise';
      const diff = trend.diff ?? 0;
      const growthPct = trend.growthPct ?? 0;
      const sign = diff > 0 ? '+' : '';
      return `
        <article class="form-signal form-signal--${type}">
          <span class="form-signal__icon"><i class="fa-solid ${positive ? 'fa-arrow-up-long' : 'fa-arrow-down-long'}"></i></span>
          <div class="form-signal__copy">
            <small>${positive ? 'MOMENTUM LEADER' : 'WATCHLIST'}</small>
            <button type="button" data-player-id="${escapeHtml(trend.player.id)}">${escapeHtml(trend.player.name)}</button>
            <p>${positive ? 'Forma ko‘tarildi' : 'Forma pasaydi'}</p>
          </div>
          <div class="form-signal__metric">
            <strong>${sign}${diff.toFixed(2)}</strong>
            <small>${sign}${growthPct.toFixed(1)}%</small>
          </div>
        </article>`;
    };

    const statusMeta = {
      spiking: ['Keskin o‘sish', 'fa-arrow-up-right-dots'],
      growing: ['O‘sishda', 'fa-arrow-trend-up'],
      stable: ['Barqaror', 'fa-minus'],
      declining: ['Nazorat', 'fa-arrow-trend-down'],
      falling: ['Pasayishda', 'fa-arrow-down-long'],
      insufficient: ['Sample yetarli emas', 'fa-circle-minus']
    };

    const rows = trends.map((trend, index) => {
      const [statusLabel, statusIcon] = statusMeta[trend.status] || statusMeta.stable;
      const diff = trend.diff;
      const growthPct = trend.growthPct;
      const diffSign = diff !== null && diff > 0 ? '+' : '';
      const deltaClass = diff === null ? 'is-unavailable' : diff > 0 ? 'is-positive' : diff < 0 ? 'is-negative' : 'is-neutral';
      const hero = trend.currStats.favoriteHero && !['-', 'Ma’lumot yo‘q'].includes(trend.currStats.favoriteHero)
        ? trend.currStats.favoriteHero
        : 'Qahramon aniqlanmagan';
      return `
        <article class="form-roster-row">
          <span class="form-roster-row__rank">${String(index + 1).padStart(2, '0')}</span>
          <div class="form-roster-row__player">
            <button type="button" data-player-id="${escapeHtml(trend.player.id)}">${escapeHtml(trend.player.name)}</button>
            <small><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(hero)}</small>
          </div>
          <span class="form-status form-status--${trend.status}"><i class="fa-solid ${statusIcon}"></i>${statusLabel}</span>
          <div class="form-roster-row__score">
            <small>Joriy</small><strong>${trend.currentScore === null ? '—' : trend.currentScore.toFixed(2)}</strong>
            <span>Oldingi ${trend.prevScore === null ? '—' : trend.prevScore.toFixed(2)}</span>
          </div>
          <div class="form-roster-row__delta ${deltaClass}">
            <strong>${diff === null ? '—' : `${diffSign}${diff.toFixed(2)}`}</strong><small>${growthPct === null ? `n${trend.window.currentValidSamples} / n${trend.window.previousValidSamples}` : `${diffSign}${growthPct.toFixed(1)}%`}</small>
          </div>
          <div class="form-roster-row__kda">
            <small>KDA</small><strong>${trend.currStats.kdaRatio ?? '—'}</strong>
            <span>${trend.currStats.avgKills ?? '—'}/${trend.currStats.avgDeaths ?? '—'}/${trend.currStats.avgAssists ?? '—'}</span>
          </div>
        </article>`;
    }).join('');

    container.innerHTML = `
      <div class="form-pulse__signals">
        ${signalMarkup(topRiser, 'rise')}
        ${signalMarkup(topFaller, 'fall')}
      </div>
      <div class="form-roster">
        <div class="form-roster__heading">
          <span>Forma reytingi</span>
          <small>${windowMeta ? `${windowMeta.currentLabel} vs ${windowMeta.previousLabel}` : periodMeta.label} · ${trends.length} active o‘yinchi</small>
        </div>
        ${rows}
      </div>`;

    container.querySelectorAll('[data-player-id]').forEach(button => {
      button.addEventListener('click', () => this.showPlayerProfile(button.dataset.playerId));
    });

    // Render the performance flowchart
    this.renderPerformanceFlowChart(matches, players, period, windowMeta);
  },

  // =====================================================================
  //  PERFORMANCE FLOW CHART (canvas multi-line chart)
  // =====================================================================
  renderPerformanceFlowChart(allMatches, players, period = 'week', trendWindow = null) {
    const legendContainer = document.getElementById('trendChartLegend');
    const canvasId = 'trendFlowChart';
    const canvas = document.getElementById(canvasId);
    const escapeHtml = value => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
    if (!canvas || !window.ChartHelper) return;

    this.trendChartRenderToken = (this.trendChartRenderToken || 0) + 1;
    const renderToken = this.trendChartRenderToken;
    const context = canvas.getContext?.('2d');
    context?.clearRect(0, 0, canvas.width, canvas.height);
    const periodMeta = {
      week: { label: 'SO‘NGGI 7 KUN', short: '7 kun' },
      month: { label: 'SO‘NGGI 30 KUN', short: '30 kun' },
      year: { label: 'SO‘NGGI 365 KUN', short: '365 kun' }
    }[period] || { label: 'SO‘NGGI 7 KUN', short: '7 kun' };
    const calculatedWindow = window.StatsEngine.getPeriodWindows(allMatches, period);
    const windowMeta = trendWindow || (calculatedWindow ? {
      currentLabel: calculatedWindow.current.label,
      previousLabel: calculatedWindow.previous.label,
      currentFrom: calculatedWindow.current.from,
      currentTo: calculatedWindow.current.to,
      previousFrom: calculatedWindow.previous.from,
      previousTo: calculatedWindow.previous.to
    } : null);
    const trajectoryEyebrow = document.getElementById('formTrajectoryEyebrow');
    const trajectoryDescription = document.getElementById('formTrajectoryDescription');
    const trajectoryWindow = document.getElementById('formTrajectoryWindow');
    const trajectorySignal = document.getElementById('formTrajectorySignal');
    if (trajectoryEyebrow) trajectoryEyebrow.textContent = `FORMA YO‘NALISHI / ${periodMeta.label}`;
    if (trajectoryDescription) trajectoryDescription.textContent = windowMeta
      ? `${windowMeta.previousLabel} — ${windowMeta.currentLabel}. 100 — shu o‘yinchining bir xil tarkib, rejim va roldagi avvalgi formasi; bu jamoadoshlar reytingi emas.`
      : `${periodMeta.short}lik forma uchun match kutilmoqda.`;

    if (allMatches.length === 0 || players.length === 0) {
      if (legendContainer) legendContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Grafik uchun hali match ma’lumoti yo‘q.</p>';
      if (trajectoryWindow) trajectoryWindow.textContent = '0 match';
      if (trajectorySignal) trajectorySignal.textContent = 'Signal yo‘q';
      return;
    }

    const timelineMatches = windowMeta
      ? window.StatsEngine.filterMatchesByDateWindow(allMatches, { from: windowMeta.previousFrom, to: windowMeta.currentTo })
      : window.StatsEngine.sortMatchesChronologically(allMatches);
    const recentMatches = timelineMatches.slice(-30);
    if (trajectoryWindow) trajectoryWindow.textContent = timelineMatches.length > recentMatches.length
      ? `${recentMatches.length} / ${timelineMatches.length} match`
      : `${recentMatches.length} match`;
    const colors = window.ChartHelper.PLAYER_COLORS || ['#e7c36b', '#d98245', '#63b99d', '#d76578', '#9b7bb8', '#c78154'];

    const datasets = [];
    players.forEach((p, idx) => {
      const dataPoints = [];
      recentMatches.forEach((m, timelineIndex) => {
        const ps = (m.playerStats || []).find(s => s.playerId === p.id);
        if (!ps) return; // an omitted point creates an honest gap in the shared timeline
        const history = window.StatsEngine.sortMatchesChronologically(allMatches);
        const position = history.findIndex(match => match.id === m.id);
        const context = window.StatsEngine.comparisonContext(m, ps.rolePlayed);
        const previousScores = history.slice(0, Math.max(0, position)).flatMap(match =>
          (match.playerStats || []).filter(stat => stat.playerId === p.id
            && window.StatsEngine.comparisonContext(match, stat.rolePlayed) === context)
            .map(stat => window.StatsEngine.numberOrNull(stat.inGameScore))).filter(value => value !== null).slice(-20);
        const baseline = window.StatsEngine.median(previousScores);
        const score = window.StatsEngine.numberOrNull(ps.inGameScore);
        const index = previousScores.length >= 3 && baseline > 0 && score !== null ? 100 * score / baseline : null;
        if (index === null) return;
        dataPoints.push({
          matchId: m.id || `${m.date}-${timelineIndex}`,
          timelineIndex,
          matchLabel: String(m.date || '').slice(5) || `#${timelineIndex + 1}`,
          value: index
        });
      });

      if (dataPoints.length > 0) {
        datasets.push({
          label: p.name,
          data: dataPoints,
          color: colors[idx % colors.length]
        });
      }
    });

    if (datasets.length === 0) {
      if (legendContainer) legendContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">Shaxsiy forma uchun shu rol va tarkibda oldingi kamida 3 ta baho kerak.</p>';
      if (trajectorySignal) trajectorySignal.textContent = 'Signal yo‘q';
      return;
    }

    if (trajectorySignal) trajectorySignal.innerHTML = `<i></i>${datasets.length} signal`;
    requestAnimationFrame(() => {
      if (renderToken === this.trendChartRenderToken && canvas.isConnected && window.ChartHelper.drawMultiLineChart) {
        window.ChartHelper.drawMultiLineChart(canvasId, datasets);
      }
    });

    if (legendContainer) {
      legendContainer.innerHTML = datasets.map((ds, index) =>
        `<div class="trend-chart-legend-item" title="${escapeHtml(ds.label)} · ${ds.data.length} sample"><span class="trend-chart-legend-index">${String(index + 1).padStart(2, '0')}</span><span class="dot" style="--signal-color:${ds.color};"></span><span>${escapeHtml(ds.label)} · n${ds.data.length}</span></div>`
      ).join('');
    }
  },

  // =====================================================================
  //  DREAM TEAM FORMATION LINEUP COMPONENT
  // =====================================================================
  renderRosterCoverage(matches, players) {
    const coverage = this.statsEngine.getRosterCoverage(matches, players, { scope: 'all' });
    return `<section class="roster-coverage card mb-4">
      <header><p class="section-eyebrow">TARKIB TAJRIBASI</p><h3>Rollar bo‘yicha qamrov</h3>
      <p>Tanlangan davrda kim qaysi rolda o‘ynagan? Match soni tajribani ko‘rsatadi, kuch yoki tayyorlik reytingini emas.</p></header>
      <div class="roster-coverage__grid">${coverage.map(item => `<article>
        <h4>${this.escapeHtml(item.role)}</h4><p>${item.observedPlayers ? `${item.observedPlayers} o‘yinchi kuzatilgan` : 'Hali match qayd etilmagan'}</p>
        <ul>${item.observations.map(player => `<li><button type="button" class="profile-link" data-player-id="${this.escapeHtml(player.playerId)}">${this.escapeHtml(player.name)}</button>
          <small>${player.matches} match · ${player.heroes} hero${player.assigned ? ' · belgilangan rol' : ''}</small></li>`).join('') || '<li>Bu rol bo‘yicha kuzatuv yo‘q.</li>'}</ul>
      </article>`).join('')}</div>
    </section>`;
  },


  // =====================================================================
  //  STATISTICS PAGE
  // =====================================================================
  renderStatistics(period, dateFrom, dateTo) {
    const content = document.getElementById('statsContent');
    const weekDateLabel = document.getElementById('weekDateLabel');
    if (!content) return;

    let filteredMatches = [];
    const fmt = window.StatsEngine.formatLargeNumber;
    const fmtDate = window.StatsEngine.formatDateFormatted;
    const full = value => value === null || value === undefined ? '—' : Number(value).toLocaleString();
    const metric = (value, digits = null) => {
      if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
      return digits === null ? this.escapeHtml(value) : Number(value).toFixed(digits);
    };
    const percent = value => metric(value) === '—' ? '—' : `${metric(value)}%`;
    const safeHero = value => value && value !== 'Ma’lumot yo‘q' ? this.escapeHtml(value) : '—';
    let periodTitle = 'Tanlangan hafta';

    if (period === 'week') {
      filteredMatches = this.dataStore.getMatchesForWeek(this.selectedWeekDate);

      const range = window.EclipseDateUtils?.weekRange?.(this.selectedWeekDate);
      const monStr = range?.start || this.selectedWeekDate;
      const sunStr = range?.end || this.selectedWeekDate;
      periodTitle = `Hafta (${fmtDate(monStr)} – ${fmtDate(sunStr)})`;

      if (weekDateLabel) {
        weekDateLabel.innerHTML = `<i class="fa-regular fa-calendar-days"></i> <strong>${fmtDate(monStr)}</strong> – <strong>${fmtDate(sunStr)}</strong>`;
      }
    } else if (period === 'month') {
      const now = new Date();
      periodTitle = `Oy (${now.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' })})`;
      filteredMatches = this.dataStore.getMatchesForMonth(now.getFullYear(), now.getMonth() + 1);
    } else if (period === 'year') {
      const now = new Date();
      periodTitle = `Yil (${now.getFullYear()})`;
      filteredMatches = this.dataStore.getMatchesForYear(now.getFullYear());
    } else if (period === 'custom' && dateFrom && dateTo) {
      periodTitle = `Oraliq (${fmtDate(dateFrom)} – ${fmtDate(dateTo)})`;
      filteredMatches = this.dataStore.getMatchesByDateRange(dateFrom, dateTo);
    } else {
      periodTitle = 'Barcha vaqt';
      filteredMatches = this.dataStore.getMatches();
    }

    filteredMatches = this.getAnalyticsMatches(filteredMatches);

    const players = this.dataStore.getPlayers();
    const isSquadMode = this.currentAnalyticsMode === 'squad';
    const teamStats = this.statsEngine.getTeamStats(filteredMatches, { scope: 'all' });
    const trackedStats = this.getTrackedUnitStats(filteredMatches);
    const leaderboard = this.statsEngine.getLeaderboard(filteredMatches, players, { scope: 'all' });
    const mostMvps = this.statsEngine.getMostMvps(filteredMatches, players, { scope: 'all' });
    leaderboard.sort((a, b) => a.player.name.localeCompare(b.player.name));
    const totalMatches = isSquadMode ? trackedStats.totalMatches : teamStats.totalMatches;
    const wins = isSquadMode ? trackedStats.wins : teamStats.wins;
    const losses = isSquadMode ? trackedStats.losses : teamStats.losses;
    const winRate = isSquadMode ? trackedStats.winRate : teamStats.winRate;
    const dataQuality = window.StatsEngine.getDatasetQuality(filteredMatches);
    const readinessState = dataQuality.readiness === 'ready'
      ? 'ready'
      : dataQuality.readiness === 'review'
        ? 'review'
        : 'warning';
    const sampleLabel = dataQuality.sampleConfidence.label;
    const metricCoverage = dataQuality.metricCoverageRate === null ? 0 : dataQuality.metricCoverageRate;
    const verifiedPercent = dataQuality.verifiedRate || 0;
    const fullPercent = dataQuality.contractRate || 0;
    const coverage = dataQuality.matchMetricCoverage;

    let html = `
      <section class="data-readiness mb-4" data-state="${readinessState}" aria-label="Statistika ma’lumotlari tayyorligi">
        <header class="data-readiness__header">
          <div>
            <p class="section-eyebrow">DATA READINESS / ${isSquadMode ? 'PRACTICE LITE' : 'TEAM 5'}</p>
            <h3>${this.escapeHtml(dataQuality.label)}</h3>
            <p>${this.escapeHtml(periodTitle)} uchun sample, to‘liqlik va manba tasdig‘i alohida ko‘rsatiladi.</p>
          </div>
          <span class="data-readiness__status ${readinessState === 'ready' ? 'is-ready' : readinessState === 'review' ? 'is-review' : ''}">${dataQuality.readiness === 'unverified' ? 'MANBA TASDIG‘I KERAK' : dataQuality.readiness === 'ready' ? 'TAHLILGA TAYYOR' : dataQuality.readiness === 'review' ? 'TEKSHIRUV KERAK' : 'SAMPLE KUTILMOQDA'}</span>
        </header>
        <div class="data-readiness__metrics">
          <article class="data-readiness__metric ${totalMatches >= 6 ? 'is-ready' : totalMatches >= 3 ? 'is-warning' : 'is-review'}">
            <small>SAMPLE</small><strong>${totalMatches} match</strong><span>${sampleLabel}</span>
            <progress max="15" value="${Math.min(totalMatches, 15)}" aria-label="Sample hajmi ${totalMatches} match"></progress>
          </article>
          <article class="data-readiness__metric ${fullPercent >= 100 ? 'is-complete' : fullPercent >= 80 ? 'is-warning' : 'is-review'}">
            <small>KERAKLI MAYDONLAR</small><strong>${dataQuality.contractMatches}/${dataQuality.totalMatches}</strong><span>${metricCoverage}% kengaytirilgan metrikalar mavjud</span>
            <progress max="100" value="${fullPercent}" aria-label="To‘liq data ${fullPercent} foiz"></progress>
          </article>
          <article class="data-readiness__metric ${verifiedPercent >= 80 ? 'is-ready' : 'is-warning'}">
            <small>TASDIQLANGAN</small><strong>${dataQuality.verifiedMatches}/${dataQuality.totalMatches}</strong><span>${verifiedPercent}% source verified</span>
            <progress max="100" value="${verifiedPercent}" aria-label="Tasdiqlangan data ${verifiedPercent} foiz"></progress>
          </article>
          <article class="data-readiness__metric ${dataQuality.legacyMatches ? 'is-warning' : 'is-complete'}">
            <small>LEGACY MANBA</small><strong>${dataQuality.legacyMatches}</strong><span>${dataQuality.totalMatches === 0 ? 'Manba kutilmoqda' : dataQuality.legacyMatches ? 'Natija hisoblanadi, manba tasdiqlanmagan' : 'Yangi schema manbasi'}</span>
            <progress max="${Math.max(dataQuality.totalMatches, 1)}" value="${dataQuality.legacyMatches}" aria-label="Legacy manbalar ${dataQuality.legacyMatches} ta"></progress>
          </article>
        </div>
        <p class="data-readiness__note"><i class="fa-solid fa-shield-halved"></i><span>“To‘liq” metriclar borligini bildiradi, “tasdiqlangan” degani emas. Match coverage: vaqt ${coverage.durationSeconds}/${dataQuality.totalMatches}, Turtle ${coverage.teamTurtles}/${dataQuality.totalMatches}, Lord ${coverage.teamLords}/${dataQuality.totalMatches}, Turret ${coverage.teamTurrets}/${dataQuality.totalMatches}.</span></p>
      </section>
      <div class="stats-grid mb-4">
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-gamepad"></i> ${isSquadMode ? 'Practice Lite matchlari' : 'Davrdagi Team 5 matchlar'}</div>
          <div class="stat-card-value">${totalMatches}</div>
          <div class="stat-card-desc">${isSquadMode ? '1–4 ECL o‘yinchisi bilan' : 'To‘liq 5/5 tarkib'}</div>
        </div>
        <div class="stat-card ${winRate === null ? '' : Number(winRate) >= 50 ? 'stat-card--success' : 'stat-card--danger'}">
          <div class="stat-card-title"><i class="fa-solid fa-trophy"></i> Win Rate</div>
          <div class="stat-card-value">${winRate === null ? '—' : `${winRate}%`}</div>
          <div class="stat-card-desc">${wins} W / ${losses} L</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-burst"></i> ${isSquadMode ? 'ECL o‘yinchilari Damage' : 'Jami Damage'}</div>
          <div class="stat-card-value" title="${full(isSquadMode ? trackedStats.totalDamageDealt : teamStats.teamTotalDamageDealt)}">${fmt(isSquadMode ? trackedStats.totalDamageDealt : teamStats.teamTotalDamageDealt)}</div>
          <div class="stat-card-desc">${isSquadMode ? `ECL Gold: ${fmt(trackedStats.totalGoldEarned)}` : `Jami Gold: ${fmt(teamStats.teamTotalGold)}`}</div>
        </div>
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid ${isSquadMode ? 'fa-people-group' : 'fa-chess-rook'}"></i> ${isSquadMode ? 'ECL qatnashuvi' : 'Obyektlar'}</div>
          ${isSquadMode
            ? `<div class="stat-card-value">${trackedStats.trackedAppearances}</div><div class="stat-card-desc">appearance · ${trackedStats.guestSlots} guest slot</div>`
            : `<div class="stat-card-value" style="font-size:1.75rem;"><i class="fa-solid fa-shield-halved" style="color:var(--success);"></i> ${teamStats.totalTurtles ?? '—'} / <i class="fa-solid fa-crown" style="color:var(--secondary);"></i> ${teamStats.totalLords ?? '—'}</div><div class="stat-card-desc">${teamStats.totalTurrets ?? '—'} turret olindi</div>`}
        </div>
      </div>
    `;

    if (isSquadMode) {
      const formations = [
        ['1 o‘yinchi', 1, 'fa-user'],
        ['Duo', 2, 'fa-user-group'],
        ['Trio', 3, 'fa-people-group'],
        ['4 kishilik', 4, 'fa-users']
      ];
      html += `
        <section class="party-distribution mb-4" aria-label="Practice Lite tarkiblari taqsimoti">
          <header><div><p class="section-eyebrow">PARTY COMPOSITION</p><h3>Tarkib bo‘yicha taqsimot</h3><p>Har bir matchda kuzatilgan Eclipse o‘yinchilari soni.</p></div><span>${trackedStats.totalMatches} match</span></header>
          <div class="party-distribution__grid">
            ${formations.map(([label, count, icon]) => {
              const sample = trackedStats.formationCounts[count];
              const result = trackedStats.formationResults[count];
              const confidence = window.StatsEngine.getSampleConfidence(sample);
              return `<article class="${sample ? 'has-data' : ''}"><i class="fa-solid ${icon}"></i><div><small>${label}</small><strong>${sample}<em> match</em></strong><span>${sample ? `${result.wins} W / ${result.losses} L · ${confidence.label}` : 'Sample yo‘q'}</span></div></article>`;
            }).join('')}
          </div>
          <p class="party-distribution__note"><i class="fa-solid fa-circle-info"></i> Guest natijalari ECL reytingi, Damage va Gold hisobiga qo‘shilmaydi.</p>
        </section>`;
    } else {
      html += this.renderRosterCoverage(filteredMatches, players);
    }

    if (mostMvps) {
      html += `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem; margin-bottom:1.5rem;">`;


      if (mostMvps) {
        html += `
          <div class="card" style="border: 1px solid var(--primary); background: linear-gradient(135deg, rgba(var(--primary-rgb),0.05) 0%, var(--bg-card-glass) 100%);">
            <span class="badge" style="background: var(--primary); color:#000; font-weight:bold;"><i class="fa-solid fa-crown"></i> MVP yetakchisi</span>
            <h3 style="font-size:1.75rem; color:var(--primary); margin-top:0.5rem; margin-bottom:0.25rem;">${this.escapeHtml(mostMvps.player.name)}</h3>
            <p style="color:var(--text-secondary); margin-bottom:0.75rem;">Davrdagi sovrinlar: <strong style="color:var(--secondary); font-size:1.2rem;">${mostMvps.mvpCount} MVP <i class="fa-solid fa-award"></i></strong></p>
            <div style="display:flex; justify-content:space-around; background:rgba(0,0,0,0.2); padding:0.5rem; border-radius:8px;">
              <div><strong>KDA</strong><br><span style="color:var(--success);">${metric(mostMvps.stats.kdaRatio)}</span></div>
              <div><strong>Asosiy hero</strong><br><span style="color:var(--secondary);">${safeHero(mostMvps.stats.favoriteHero)}</span></div>
              <div><strong>O‘rtacha ball</strong><br><span style="color:var(--primary);">${metric(mostMvps.stats.avgInGameScore)}</span></div>
            </div>
          </div>
        `;
      }

      html += `</div>`;
    }

    // MATCH DURATION & PACING SECTION
    const durationStats = this.statsEngine.getMatchDurationStats(filteredMatches, { scope: 'all' });
    if (durationStats.hasData) {
      const longest = durationStats.longestMatch;
      const shortest = durationStats.shortestMatch;
      const fastestWin = durationStats.fastestWin;

      html += `
        <div class="card mb-4" style="background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.03) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(var(--primary-rgb), 0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <span class="badge" style="background:rgba(var(--primary-rgb),0.15); color:var(--primary); font-weight:700;"><i class="fa-regular fa-clock"></i> MATCH RITMI VA VAQT</span>
              <h3 style="font-size:1.35rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">Match davomiyligi va rekordlar</h3>
              <p style="color:var(--text-muted); margin:0; font-size:0.85rem;">Davrdagi eng uzun, eng qisqa va eng tez g‘alaba.</p>
            </div>
            <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light); padding:0.5rem 1rem; border-radius:8px; text-align:right;">
              <div style="color:var(--text-muted); font-size:0.75rem;">AVG MATCH DURATION</div>
              <div style="font-size:1.4rem; font-weight:bold; color:var(--primary);">${durationStats.avgDurationFormatted}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(245,158,11,0.3);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.75rem; color:var(--warning); text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-hourglass-end"></i> Eng uzun match</span>
                <span class="badge ${longest.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${longest.result.toUpperCase()}</span>
              </div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--warning);">${longest.durationFormatted || window.StatsEngine.formatDuration(longest.durationSeconds)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${this.escapeHtml(fmtDate(longest.date))} ${longest.notes ? `• <em>${this.escapeHtml(longest.notes)}</em>` : ''}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(var(--primary-rgb),0.3);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.75rem; color:var(--primary); text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-bolt"></i> Eng qisqa match</span>
                <span class="badge ${shortest.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${shortest.result.toUpperCase()}</span>
              </div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--primary);">${shortest.durationFormatted || window.StatsEngine.formatDuration(shortest.durationSeconds)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${this.escapeHtml(fmtDate(shortest.date))} ${shortest.notes ? `• <em>${this.escapeHtml(shortest.notes)}</em>` : ''}
              </div>
            </div>

            ${fastestWin ? `
              <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                  <span style="font-size:0.75rem; color:var(--success); text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-gauge-high"></i> Eng tez g‘alaba</span>
                  <span class="badge badge-win" style="font-size:0.65rem;">VICTORY</span>
                </div>
                <div style="font-size:1.75rem; font-weight:800; color:var(--success);">${fastestWin.durationFormatted || window.StatsEngine.formatDuration(fastestWin.durationSeconds)}</div>
                <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                  ${this.escapeHtml(fmtDate(fastestWin.date))} ${fastestWin.notes ? `• <em>${this.escapeHtml(fastestWin.notes)}</em>` : ''}
                </div>
              </div>
            ` : ''}

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid var(--border-light);">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:0.4rem;"><i class="fa-solid fa-gamepad"></i> Jami o‘yin vaqti</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--text-primary);">${durationStats.totalDurationFormatted}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                Vaqti yozilgan ${durationStats.count} match
              </div>
            </div>
          </div>
        </div>
      `;
    }

    html += `
      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-list"></i> O‘yinchilar natijalari — ${periodTitle}</h3>
        <p class="text-muted">Alifbo tartibida. Turli rollar bitta kuch reytingida solishtirilmaydi. Index — faqat qo‘shimcha tajribaviy ko‘rsatkich.</p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>№</th>
                <th>O‘yinchi</th>
                <th>Match</th>
                <th>Asosiy hero</th>
                <th>K / D / A</th>
                <th>KDA</th>
                <th>O‘rt. ball</th>
                <th>O‘rt. Damage</th>
                <th>TF qatnashuv</th>
                <th>O‘rt. Gold</th>
                <th>Medallar</th>
                <th>Index · tajriba</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (leaderboard.length === 0) {
      html += `<tr><td colspan="12" class="text-center" style="padding:2rem;">Bu davrda ${isSquadMode ? 'Practice Lite' : 'Team 5'} statistikasi uchun match yo‘q.</td></tr>`;
    } else {
      leaderboard.forEach((item, idx) => {
        const rankIcon = String(idx + 1);
        html += `
          <tr>
            <td><strong>${rankIcon}</strong></td>
            <td><button type="button" class="profile-link" data-player-id="${this.escapeHtml(item.player.id)}">${this.escapeHtml(item.player.name)}</button></td>
            <td>${item.stats.matchesPlayed}</td>
            <td><span class="badge" style="background:rgba(255,255,255,0.05);">${safeHero(item.stats.favoriteHero)}</span></td>
            <td>${metric(item.stats.avgKills)} / ${metric(item.stats.avgDeaths)} / ${metric(item.stats.avgAssists)}</td>
            <td><strong style="color:${item.stats.kdaRatio !== null && Number(item.stats.kdaRatio) >= 3 ? 'var(--success)' : item.stats.kdaRatio === null ? 'var(--text-muted)' : 'var(--text-primary)'}">${metric(item.stats.kdaRatio)}</strong></td>
            <td>${metric(item.stats.avgInGameScore)}</td>
            <td><span title="${full(item.stats.totalDamageDealt)} jami">${fmt(item.stats.avgDamageDealt)}</span></td>
            <td>${percent(item.stats.avgTeamfightParticipation)}</td>
            <td><span title="${full(item.stats.totalGoldEarned)} jami">${fmt(item.stats.avgGoldEarned)}</span></td>
            <td>
              <span class="medal medal-mvp" title="${item.stats.mvpCount} MVPs">${item.stats.mvpCount}</span>
              <span class="medal medal-gold" title="${item.stats.goldCount} Gold">${item.stats.goldCount}</span>
              <span class="medal medal-silver" title="${item.stats.silverCount} Silver">${item.stats.silverCount}</span>
              <span class="medal medal-choco" title="${item.stats.bronzeCount} Bronze">${item.stats.bronzeCount}</span>
            </td>
            <td><strong style="color:var(--secondary);" title="${this.escapeHtml(item.stats.eclipseIndexReason || window.StatsEngine.ECLIPSE_INDEX_FORMULA.description)}">${metric(item.stats.performanceScore, 2)}</strong></td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div></div>`;

    // TEAM-WIDE HERO META & PICK / WIN RATE SHOWCASE
    const teamHeroAnalytics = this.statsEngine.getTeamHeroAnalytics(filteredMatches, players, { scope: 'all' });
    let teamHeroCardsHtml = '';

    if (teamHeroAnalytics.heroes.length === 0) {
      teamHeroCardsHtml = `<p style="color:var(--text-muted); text-align:center; padding:1.5rem;">Bu davr uchun hero meta ma’lumoti yo‘q.</p>`;
    } else {
      teamHeroCardsHtml = '<div class="hero-analytics-grid">';
      teamHeroAnalytics.heroes.forEach(h => {
        const tierClass = h.metaTier === 'S+' ? 'tier-splus' : h.metaTier === 'S' ? 'tier-s' : '';
        const tagClass = h.metaTier === 'S+' ? 'mastery-tag-splus' :
                         h.metaTier === 'S' ? 'mastery-tag-s' :
                         h.metaTier === 'A' ? 'mastery-tag-a' :
                         h.metaTier === 'B' ? 'mastery-tag-b' : 'mastery-tag-c';

        const hasWinRate = h.winRateNum !== null && h.winRateNum !== undefined && Number.isFinite(Number(h.winRateNum));
        const hasUseRate = h.useRateNum !== null && h.useRateNum !== undefined && Number.isFinite(Number(h.useRateNum));
        const winRateValue = hasWinRate ? Math.max(0, Math.min(Number(h.winRateNum), 100)) : 0;
        const useRateValue = hasUseRate ? Math.max(0, Math.min(Number(h.useRateNum), 100)) : 0;
        const winRateFillClass = !hasWinRate ? '' : winRateValue >= 75 ? 'fill-winrate-god' :
                                 winRateValue >= 50 ? 'fill-winrate-high' :
                                 winRateValue >= 35 ? 'fill-winrate-med' : 'fill-winrate-low';
        const topPilotsStr = h.pilots.map(p => `${this.escapeHtml(p.playerName)} (${metric(p.picks)}G)`).join(', ');
        const safeHeroName = this.escapeHtml(h.heroName || 'Noma’lum hero');
        const safeTier = this.escapeHtml(h.metaTier || '—');

        teamHeroCardsHtml += `
          <div class="shiny-hero-card ${tierClass}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                <div>
                  <h4 style="font-size:1.35rem; font-weight:800; color:var(--text-primary); margin:0;">${safeHeroName}</h4>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    ${isSquadMode ? 'ECL pick' : 'Team pick'}: <strong>${h.totalPicks}</strong> (${h.wins}W – ${h.losses}L)
                  </div>
                </div>
                <span class="mastery-tag ${tagClass}">
                  ${safeTier} TIER
                </span>
              </div>

              <!-- Visual Win Rate & Use Rate Meters -->
              <div class="rate-meter-group">
                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-trophy" style="color:var(--secondary);"></i> ${isSquadMode ? 'Pick Win Rate' : 'Team Win Rate'}</span>
                    <strong style="color:${!hasWinRate ? 'var(--text-muted)' : winRateValue >= 50 ? 'var(--success)' : 'var(--danger)'};">${percent(h.winRate)}</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill ${winRateFillClass}" style="width: ${winRateValue}%;"></div>
                  </div>
                </div>

                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> ${isSquadMode ? 'ECL Pick Rate' : 'Team Pick Rate'}</span>
                    <strong style="color:${hasUseRate ? 'var(--primary)' : 'var(--text-muted)'};">${percent(h.useRate)}</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill ${hasUseRate ? 'fill-userate' : ''}" style="width: ${useRateValue}%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="shiny-stat-chips">
                <div>${isSquadMode ? 'Tracked KDA' : 'Team KDA'}<strong>${metric(h.kdaRatio)}</strong></div>
                <div>O‘rt. ball<strong>${metric(h.avgScore)}</strong></div>
                <div>O‘rt. Damage<strong>${fmt(h.avgDamageDealt)}</strong></div>
              </div>

              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.6rem; text-align:center;">
                O‘yinchilar: <strong style="color:var(--text-secondary);">${topPilotsStr}</strong>
              </div>
            </div>
          </div>
        `;
      });
      teamHeroCardsHtml += '</div>';
    }

    html += `
      <div class="shiny-container mb-4">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
          <div>
            <span class="badge" style="background:linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color:#000; font-weight:800;">
              <i class="fa-solid fa-fire"></i> ${isSquadMode ? 'ECL HERO POOLI' : 'TEAM META VA HERO DARAJASI'}
            </span>
            <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">
              ${isSquadMode ? 'Practice Lite hero pooli' : 'Hero pool, Win Rate va Pick Rate'} — ${periodTitle}
            </h3>
            <p style="color:var(--text-secondary); margin:0; font-size:0.85rem;">
              ${isSquadMode ? 'Faqat kuzatilgan ECL o‘yinchilarining hero tanlovi va natijasi.' : 'Eclipse tanlagan herolar, ularning natijasi va eng ko‘p o‘ynagan jamoadoshlar.'}
            </p>
          </div>
        </div>

        ${teamHeroCardsHtml}
      </div>
    `;

    content.innerHTML = html;
    this.bindPlayerProfileLinks(content);
  },

  // =====================================================================
  //  RECORDS PAGE
  // =====================================================================
  renderRecords(matches, players) {
    const isSquadMode = this.currentAnalyticsMode === 'squad';
    const records = this.statsEngine.getAllTimeRecords(matches, players, { scope: 'all' });
    const teamStats = this.statsEngine.getTeamStats(matches, { scope: 'all' });
    const trackedStats = this.getTrackedUnitStats(matches);
    const careerTotals = this.statsEngine.getCareerTotals(matches, players, { scope: 'all' });
    const aggregateStats = isSquadMode ? {
      damageDealt: trackedStats.totalDamageDealt,
      damageReceived: trackedStats.totalDamageReceived,
      turretDamage: trackedStats.totalTurretDamage,
      gold: trackedStats.totalGoldEarned,
      savageList: trackedStats.savageList,
      maniacList: trackedStats.maniacList,
      totalSavages: trackedStats.totalSavages,
      totalManiacs: trackedStats.totalManiacs
    } : {
      damageDealt: teamStats.teamTotalDamageDealt,
      damageReceived: teamStats.teamTotalDamageReceived,
      turretDamage: teamStats.teamTotalTurretDamage,
      gold: teamStats.teamTotalGold,
      savageList: teamStats.savageList,
      maniacList: teamStats.maniacList,
      totalSavages: teamStats.totalSavages,
      totalManiacs: teamStats.totalManiacs
    };
    const fmt = window.StatsEngine.formatLargeNumber;
    const fmtDate = window.StatsEngine.formatDateFormatted;
    const full = value => value === null || value === undefined ? '—' : Number(value).toLocaleString();
    const peakValue = (record, localized = false) => record?.value === null || record?.value === undefined ? '—' : (localized ? Number(record.value).toLocaleString() : record.value);
    const peakMeta = record => record
      ? `${this.escapeHtml(record.playerName || 'Noma’lum')} (${this.escapeHtml(record.heroUsed || 'Hero yo‘q')}) — ${this.escapeHtml(fmtDate(record.date))}`
      : 'Ma’lumot kutilmoqda';

    const awardsContainer = document.getElementById('awardsContainer');
    const recordsContainer = document.getElementById('recordsContainer');
    const savageHallContainer = document.getElementById('savageHallContainer');
    const maniacHallContainer = document.getElementById('maniacHallContainer');

    if (awardsContainer) {
      const today = window.EclipseDateUtils?.today?.() || new Date().toLocaleDateString('en-CA');
      const now = new Date();

      const weekMatches = this.getAnalyticsMatches(this.dataStore.getMatchesForWeek(today));
      const monthMatches = this.getAnalyticsMatches(this.dataStore.getMatchesForMonth(now.getFullYear(), now.getMonth() + 1));
      const yearMatches = this.getAnalyticsMatches(this.dataStore.getMatchesForYear(now.getFullYear()));

      const mostWeeklyMvp = this.statsEngine.getMostMvps(weekMatches, players, { scope: 'all' });
      const mostMonthlyMvp = this.statsEngine.getMostMvps(monthMatches, players, { scope: 'all' });
      const mostYearlyMvp = this.statsEngine.getMostMvps(yearMatches, players, { scope: 'all' });

      awardsContainer.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="award-card" style="border-color:var(--primary);">
            <span class="badge" style="background:var(--primary); color:#000;"><i class="fa-solid fa-crown"></i> HAFTA MVP</span>
            <h3 style="font-size:1.6rem; margin-top:0.5rem; color:var(--text-primary); margin-bottom:0.25rem;">${mostWeeklyMvp ? this.escapeHtml(mostWeeklyMvp.player.name) : '—'}</h3>
            <p style="margin:0; font-size:1.1rem; color:var(--secondary); font-weight:bold;">${mostWeeklyMvp ? mostWeeklyMvp.mvpCount + ' MVP' : 'Match kutilmoqda'}</p>
          </div>
          <div class="award-card" style="border-color:var(--secondary);">
            <span class="badge" style="background:var(--secondary); color:#000;"><i class="fa-solid fa-crown"></i> OY MVP</span>
            <h3 style="font-size:1.6rem; margin-top:0.5rem; color:var(--secondary); margin-bottom:0.25rem;">${mostMonthlyMvp ? this.escapeHtml(mostMonthlyMvp.player.name) : '—'}</h3>
            <p style="margin:0; font-size:1.1rem; color:var(--secondary); font-weight:bold;">${mostMonthlyMvp ? mostMonthlyMvp.mvpCount + ' MVP' : 'Match kutilmoqda'}</p>
          </div>
          <div class="award-card" style="border-color:var(--success);">
            <span class="badge" style="background:var(--success); color:#071019;"><i class="fa-solid fa-crown"></i> YIL MVP</span>
            <h3 style="font-size:1.6rem; margin-top:0.5rem; color:var(--success); margin-bottom:0.25rem;">${mostYearlyMvp ? this.escapeHtml(mostYearlyMvp.player.name) : '—'}</h3>
            <p style="margin:0; font-size:1.1rem; color:var(--secondary); font-weight:bold;">${mostYearlyMvp ? mostYearlyMvp.mvpCount + ' MVP' : 'Match kutilmoqda'}</p>
          </div>
        </div>
      `;
    }

    if (recordsContainer) {
      const alphabeticalTotals = [...careerTotals].sort((a, b) => a.player.name.localeCompare(b.player.name));

      let careerRows = '';
      if (alphabeticalTotals.length === 0) {
        careerRows = `<tr><td colspan="10" class="text-center" style="padding:2rem;">Hall of Fame uchun hali ${isSquadMode ? 'Practice Lite' : 'Team 5'} statistikasi yo‘q.</td></tr>`;
      } else {
        alphabeticalTotals.forEach((item, idx) => {
          const rankIcon = String(idx + 1);
          careerRows += `
            <tr>
              <td><strong>${rankIcon}</strong></td>
              <td><button type="button" class="profile-link" data-player-id="${this.escapeHtml(item.player.id)}">${this.escapeHtml(item.player.name)}</button></td>
              <td>${item.stats.matchesPlayed}</td>
              <td><strong style="color:var(--secondary);" title="${full(item.stats.totalDamageDealt)}">${fmt(item.stats.totalDamageDealt)}</strong></td>
              <td><span title="${full(item.stats.totalDamageReceived)}">${fmt(item.stats.totalDamageReceived)}</span></td>
              <td><span title="${full(item.stats.totalTurretDamage)}">${fmt(item.stats.totalTurretDamage)}</span></td>
              <td><span title="${full(item.stats.totalGoldEarned)}">${fmt(item.stats.totalGoldEarned)}</span></td>
              <td>${full(item.stats.totalKills)} / ${full(item.stats.totalDeaths)} / ${full(item.stats.totalAssists)}</td>
              <td><strong style="color:var(--secondary);">${item.stats.mvpCount} <i class="fa-solid fa-crown"></i></strong></td>
              <td><i class="fa-solid fa-fire" style="color:var(--secondary);"></i> ${item.stats.savageCount} / <i class="fa-solid fa-bolt" style="color:var(--primary);"></i> ${item.stats.maniacCount}</td>
            </tr>
          `;
        });
      }

      recordsContainer.innerHTML = `
        <div class="card mb-4" style="background: linear-gradient(135deg, rgba(var(--secondary-rgb),0.03) 0%, var(--bg-card-glass) 100%);">
          <h3 class="card-title mb-3" style="color:var(--secondary);"><i class="fa-solid fa-chart-line"></i> ${isSquadMode ? 'ECL o‘yinchilarining Practice Lite ko‘rsatkichlari' : 'Jamoaning barcha vaqt ko‘rsatkichlari'}</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Jami Damage</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--secondary);" title="${full(aggregateStats.damageDealt)}">${fmt(aggregateStats.damageDealt)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Qabul qilingan Damage</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--primary);" title="${full(aggregateStats.damageReceived)}">${fmt(aggregateStats.damageReceived)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Turret Damage</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--success);" title="${full(aggregateStats.turretDamage)}">${fmt(aggregateStats.turretDamage)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Jami Gold</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--warning);" title="${full(aggregateStats.gold)}">${fmt(aggregateStats.gold)}</div>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <h3 class="card-title mb-3"><i class="fa-solid fa-ranking-star"></i> O‘yinchilar career ko‘rsatkichlari</h3>
          <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Alifbo tartibidagi tarixiy yig‘indilar — kuch reytingi emas. Ko‘proq o‘ynagan yoki boshqa roldagi o‘yinchilarning jami raqamlari tabiiy ravishda farq qiladi.</p>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>O‘yinchi</th>
                  <th>Match</th>
                  <th>Jami Damage</th>
                  <th>Qabul Damage</th>
                  <th>Turret Damage</th>
                  <th>Jami Gold</th>
                  <th>K / D / A</th>
                  <th>MVP</th>
                  <th>Savage / Maniac</th>
                </tr>
              </thead>
              <tbody>
                ${careerRows}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card mb-4">
          <h3 class="card-title mb-3"><i class="fa-solid fa-bolt"></i> Bitta matchdagi rekordlar</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Eng ko‘p kill</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--danger);">${peakValue(records.highestKills)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${peakMeta(records.highestKills)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Eng ko‘p assist</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--primary);">${peakValue(records.highestAssists)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${peakMeta(records.highestAssists)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Eng yuqori Damage</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--secondary);">${peakValue(records.highestDamage, true)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${peakMeta(records.highestDamage)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Eng yuqori Gold</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--success);">${peakValue(records.highestGold, true)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${peakMeta(records.highestGold)}</div>
            </div>
          </div>
        </div>

        <div class="card mb-4" style="background: linear-gradient(135deg, rgba(var(--primary-rgb),0.03) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(var(--primary-rgb),0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <h3 class="card-title" style="margin:0;"><i class="fa-regular fa-clock" style="color:var(--primary);"></i> Match davomiyligi rekordlari</h3>
            <div style="font-size:0.85rem; color:var(--text-muted);">
              O‘rtacha: <strong style="color:var(--primary);">${teamStats.avgDurationFormatted}</strong> · Jami: <strong style="color:var(--secondary);">${teamStats.totalDurationFormatted}</strong>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(245,158,11,0.3);">
              <div style="color:var(--warning); font-size:0.75rem; text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-hourglass-end"></i> Eng uzun match</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--warning); margin-top:0.25rem;">
                ${records.longestMatch ? (records.longestMatch.durationFormatted || window.StatsEngine.formatDuration(records.longestMatch.durationSeconds)) : '-'}
              </div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${records.longestMatch ? `${fmtDate(records.longestMatch.date)} • <span class="badge ${records.longestMatch.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${records.longestMatch.result === 'win' ? 'W' : 'L'}</span>` : 'Davomiylik kiritilmagan'}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">
              <div style="color:var(--success); font-size:0.75rem; text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-gauge-high"></i> Eng tez g‘alaba</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--success); margin-top:0.25rem;">
                ${records.fastestWin ? (records.fastestWin.durationFormatted || window.StatsEngine.formatDuration(records.fastestWin.durationSeconds)) : '-'}
              </div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${records.fastestWin ? `${this.escapeHtml(fmtDate(records.fastestWin.date))} • ${this.escapeHtml(records.fastestWin.notes || 'Izoh yo‘q')}` : 'Davomiylik kiritilmagan'}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(var(--primary-rgb),0.3);">
              <div style="color:var(--primary); font-size:0.75rem; text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-bolt"></i> Eng qisqa match</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--primary); margin-top:0.25rem;">
                ${records.shortestMatch ? (records.shortestMatch.durationFormatted || window.StatsEngine.formatDuration(records.shortestMatch.durationSeconds)) : '-'}
              </div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${records.shortestMatch ? `${fmtDate(records.shortestMatch.date)} • <span class="badge ${records.shortestMatch.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${records.shortestMatch.result === 'win' ? 'W' : 'L'}</span>` : 'Davomiylik kiritilmagan'}
              </div>
            </div>
          </div>
        </div>
      `;
      this.bindPlayerProfileLinks(recordsContainer);
    }

    if (savageHallContainer && maniacHallContainer) {
      let savageHtml = `
        <div class="card mb-4">
          <h3 class="card-title mb-3" style="color:var(--secondary);"><i class="fa-solid fa-fire"></i> Savage Hall of Fame (${aggregateStats.totalSavages})</h3>
      `;
      if (aggregateStats.savageList.length === 0) {
        savageHtml += `<p style="color:var(--text-muted);">Hozircha Savage qayd etilmagan.</p>`;
      } else {
        savageHtml += `<ul style="display:flex; flex-direction:column; gap:0.5rem;">`;
        aggregateStats.savageList.forEach(s => {
          const pName = players.find(p => p.id === s.playerId)?.name || 'Noma’lum o‘yinchi';
          savageHtml += `<li style="padding:0.5rem 1rem; background:rgba(var(--secondary-rgb),0.05); border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span><i class="fa-solid fa-fire" style="color:var(--secondary); margin-right:4px;"></i> <strong>${this.escapeHtml(pName)}</strong> · <em>${this.escapeHtml(s.heroUsed || 'Hero yo‘q')}</em></span> <span style="color:var(--text-muted); font-size:0.8rem;">${this.escapeHtml(fmtDate(s.date))}</span></li>`;
        });
        savageHtml += `</ul>`;
      }
      savageHtml += `</div>`;
      savageHallContainer.innerHTML = savageHtml;

      let maniacHtml = `
        <div class="card mb-4">
          <h3 class="card-title mb-3" style="color:var(--primary);"><i class="fa-solid fa-bolt"></i> Maniac Hall of Fame (${aggregateStats.totalManiacs})</h3>
      `;
      if (aggregateStats.maniacList.length === 0) {
        maniacHtml += `<p style="color:var(--text-muted);">Hozircha Maniac qayd etilmagan.</p>`;
      } else {
        maniacHtml += `<ul style="display:flex; flex-direction:column; gap:0.5rem;">`;
        aggregateStats.maniacList.forEach(m => {
          const pName = players.find(p => p.id === m.playerId)?.name || 'Noma’lum o‘yinchi';
          maniacHtml += `<li style="padding:0.5rem 1rem; background:rgba(var(--primary-rgb),0.05); border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:4px;"></i> <strong>${this.escapeHtml(pName)}</strong> · <em>${this.escapeHtml(m.heroUsed || 'Hero yo‘q')}</em></span> <span style="color:var(--text-muted); font-size:0.8rem;">${this.escapeHtml(fmtDate(m.date))}</span></li>`;
        });
        maniacHtml += `</ul>`;
      }
      maniacHtml += `</div>`;
      maniacHallContainer.innerHTML = maniacHtml;
    }
  },

  bindPlayerProfileLinks(root = document) {
    root.querySelectorAll('[data-player-id]').forEach(button => {
      if (button.dataset.profileBound === 'true') return;
      button.dataset.profileBound = 'true';
      button.addEventListener('click', () => this.showPlayerProfile(button.dataset.playerId));
    });
  }
};

// =====================================================================
//  TOAST NOTIFICATIONS
// =====================================================================
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toastContainer') || document.body;
  const toast = document.createElement('div');
  const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
  toast.className = `toast toast-${safeType}`;
  const iconName = safeType === 'success' ? 'fa-circle-check' : safeType === 'error' ? 'fa-circle-xmark' : safeType === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = String(message ?? '');
  toast.append(icon, text);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

document.addEventListener('DOMContentLoaded', () => {
  window.EclipseApp.init();
});
