window.EclipseApp = {
  dataStore: null,
  heroDb: null,
  statsEngine: null,
  playerManager: null,
  matchManager: null,
  currentPeriod: 'week',
  currentTrendPeriod: 'week',
  selectedWeekDate: new Date().toISOString().split('T')[0],

  init() {
    this.dataStore = new window.DataStore();
    this.heroDb = new window.HeroDatabase();
    this.statsEngine = new window.StatsEngine(this.dataStore);
    this.playerManager = new window.PlayerManager(this.dataStore, this.statsEngine);
    this.matchManager = new window.MatchManager(this.dataStore, this.heroDb);
    this.trainingManager = new window.TrainingManager(this.dataStore);
    this.authManager = new window.AuthManager(this.dataStore);
    this.cloudSync = new window.CloudSync(this.dataStore);

    this.bindSidebarNav();
    this.bindMobileNav();
    this.bindStatsTabs();
    this.bindDashboardTrendTabs();
    this.bindSettings();
    this.bindKeyboardShortcuts();
    this.navigate('dashboard');
    this.authManager.updateUI();
    this.checkBackupReminder();

    // Background cloud sync down if configured
    if (this.cloudSync.isConfigured()) {
      this.cloudSync.syncDown().then(updated => {
        if (updated) {
          this.navigate('dashboard');
          if (window.showToast) window.showToast("Eng so'nggi ma'lumotlar bulutdan yangilandi ☁️", "info");
        }
      });
    }
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
      });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  },

  bindDashboardTrendTabs() {
    const tabsContainer = document.getElementById('dashTrendTabs');
    if (tabsContainer) {
      tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          tabsContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const period = btn.getAttribute('data-period');
          this.currentTrendPeriod = period;
          this.renderDashboardTrends(period);
        });
      });
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
        const d = new Date(this.selectedWeekDate + 'T00:00:00');
        d.setDate(d.getDate() - 7);
        this.selectedWeekDate = d.toISOString().split('T')[0];
        if (statsWeekPicker) statsWeekPicker.value = this.selectedWeekDate;
        this.renderStatistics('week');
      });
    }

    if (nextWeekBtn) {
      nextWeekBtn.addEventListener('click', () => {
        const d = new Date(this.selectedWeekDate + 'T00:00:00');
        d.setDate(d.getDate() + 7);
        this.selectedWeekDate = d.toISOString().split('T')[0];
        if (statsWeekPicker) statsWeekPicker.value = this.selectedWeekDate;
        this.renderStatistics('week');
      });
    }

    if (tabsContainer) {
      tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          tabsContainer.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');

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
        });
      });
    }

    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', () => {
        const from = document.getElementById('statsDateFrom').value;
        const to = document.getElementById('statsDateTo').value;
        if (!from || !to) {
          window.showToast('Please select both From and To dates', 'warning');
          return;
        }
        this.renderStatistics('custom', from, to);
      });
    }
  },

  bindSettings() {
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
        window.showToast('Data exported successfully!', 'success');
      });
    }

    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => {
        const file = importFile.files[0];
        if (!file) {
          window.showToast('Please choose a JSON file first', 'warning');
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          const success = this.dataStore.importData(e.target.result);
          if (success) {
            window.showToast('Data imported successfully!', 'success');
            this.navigate('dashboard');
          } else {
            window.showToast('Failed to parse JSON backup file', 'error');
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
        if (confirm('WARNING: Are you sure you want to delete ALL team data? This cannot be undone!')) {
          if (confirm('RE-CONFIRM: Delete all match history, player roster, and custom heroes?')) {
            this.dataStore.clearAll();
            window.showToast('All data cleared', 'warning');
            this.navigate('dashboard');
          }
        }
      });
    }

    // Cloud Sync Setting Handlers
    const saveCloudUrlBtn = document.getElementById('saveCloudUrlBtn');
    const firebaseUrlInput = document.getElementById('firebaseUrlInput');
    const cloudSyncStatus = document.getElementById('cloudSyncStatus');

    if (firebaseUrlInput) {
      firebaseUrlInput.value = this.cloudSync.getCloudUrl();
    }

    if (saveCloudUrlBtn && firebaseUrlInput) {
      saveCloudUrlBtn.addEventListener('click', async () => {
        const url = firebaseUrlInput.value.trim();
        this.cloudSync.setCloudUrl(url);
        if (url) {
          if (cloudSyncStatus) cloudSyncStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sinxronlanmoqda...';
          const success = await this.cloudSync.syncUp();
          if (success && cloudSyncStatus) {
            cloudSyncStatus.innerHTML = '<span style="color:var(--success);"><i class="fa-solid fa-circle-check"></i> Bulut muvaffaqiyatli ulandi va sinxronlandi!</span>';
          } else if (cloudSyncStatus) {
            cloudSyncStatus.innerHTML = '<span style="color:var(--danger);"><i class="fa-solid fa-circle-exclamation"></i> Ulanishda xatolik yuz berdi. Havolani tekshiring.</span>';
          }
        } else {
          if (cloudSyncStatus) cloudSyncStatus.innerHTML = '<span style="color:var(--text-muted);">Bulut sinxronizatsiyasi o\'chirildi.</span>';
        }
      });
    }

    // Admin PIN Change Handlers
    const changePinBtn = document.getElementById('changePinBtn');
    const oldPinInput = document.getElementById('oldPinInput');
    const newPinInput = document.getElementById('newPinInput');

    if (changePinBtn && oldPinInput && newPinInput) {
      changePinBtn.addEventListener('click', () => {
        const oldP = oldPinInput.value.trim();
        const newP = newPinInput.value.trim();
        if (this.authManager.setNewPin(oldP, newP)) {
          oldPinInput.value = '';
          newPinInput.value = '';
        }
      });
    }
  },

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const pages = ['dashboard', 'add-match', 'match-history', 'players', 'statistics', 'records', 'heroes', 'training', 'settings'];
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        this.navigate(pages[num - 1]);
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.editingMatchId = null;
        this.navigate('add-match');
        return;
      }

      if (e.key === 'Escape') {
        const overlay = document.getElementById('modalOverlay');
        if (overlay && !overlay.hasAttribute('aria-hidden')) {
          overlay.setAttribute('aria-hidden', 'true');
          overlay.style.display = 'none';
          document.body.style.overflow = '';
        }
        return;
      }
    });
  },

  checkBackupReminder() {
    const matchesSinceBackup = this.dataStore.getMatchesSinceLastBackup();
    if (matchesSinceBackup >= 5) {
      const dashSection = document.getElementById('page-dashboard');
      if (dashSection) {
        const existingReminder = dashSection.querySelector('.backup-reminder');
        if (existingReminder) existingReminder.remove();

        const banner = document.createElement('div');
        banner.className = 'backup-reminder';
        banner.innerHTML = `
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <i class="fa-solid fa-triangle-exclamation" style="color:var(--warning); font-size:1.25rem;"></i>
            <div>
              <strong style="color:var(--warning);">Data Safety Reminder</strong>
              <p style="margin:0; font-size:0.8rem; color:var(--text-secondary);">You have <strong>${matchesSinceBackup}</strong> matches recorded since your last backup file. Download a backup to protect your data!</p>
            </div>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-primary btn-sm" id="backupNowBtn"><i class="fa-solid fa-download"></i> Backup Now</button>
            <button class="btn btn-secondary btn-sm" id="dismissBackupBtn"><i class="fa-solid fa-xmark"></i></button>
          </div>
        `;
        dashSection.insertBefore(banner, dashSection.firstChild);

        document.getElementById('backupNowBtn')?.addEventListener('click', () => {
          this.navigate('settings');
          banner.remove();
        });
        document.getElementById('dismissBackupBtn')?.addEventListener('click', () => {
          banner.remove();
        });
      }
    }
  },

  navigate(pageId) {
    if (window._eclipseUnsavedMatch && pageId !== 'add-match') {
      if (!confirm('You have unsaved changes in the match form. Are you sure you want to leave?')) {
        return;
      }
      window._eclipseUnsavedMatch = false;
    }

    // Protect add-match route for Admin only
    if (pageId === 'add-match' && !this.authManager.isAdmin()) {
      this.authManager.protectAction(() => {
        this.navigate('add-match');
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
      'dashboard': 'Dashboard & Performance Trends',
      'add-match': 'Add Match',
      'match-history': 'Match History',
      'players': 'Player Roster',
      'player-profile': 'Player Profile',
      'statistics': 'Statistics & Dream Team Lineups',
      'records': 'All-Time Records & Dream Team Hall of Fame',
      'heroes': 'Hero Database',
      'training': "Jamoa Akademiyasi & Shaxsiy Mashg'ulot",
      'settings': 'Settings & Backups'
    };
    if (pageTitleEl) pageTitleEl.textContent = titles[pageId] || 'Eclipse Esports';

    const target = document.getElementById(`page-${pageId}`);
    if (target) {
      target.classList.add('active');
      target.removeAttribute('hidden');
    }

    const matches = this.dataStore.getMatches();
    const players = this.dataStore.getPlayers();

    switch (pageId) {
      case 'dashboard':
        this.renderDashboard(matches, players);
        break;
      case 'add-match':
        this.matchManager.renderMatchForm('matchFormContainer', players, this.editingMatchId);
        this.editingMatchId = null;
        break;
      case 'match-history':
        this.matchManager.renderMatchHistory('matchHistoryContainer', matches, players);
        const filterBar = document.getElementById('matchFilterBar');
        if (filterBar) {
          filterBar.querySelectorAll('.filter-chip').forEach(chip => {
            chip.onclick = () => {
              filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
              chip.classList.add('active');
              const filterType = chip.dataset.filter;
              const filteredMatches = filterType === 'all' 
                ? matches 
                : matches.filter(m => (m.matchType || 'ranked') === filterType);
              this.matchManager.renderMatchHistory('matchHistoryContainer', filteredMatches, players);
            };
          });
        }
        break;
      case 'players':
        this.playerManager.setupSubTabs();
        this.playerManager.renderAddPlayerForm('addPlayerContainer');
        this.playerManager.renderPlayersList('playersListContainer');
        break;
      case 'statistics':
        this.renderStatistics(this.currentPeriod);
        break;
      case 'records':
        this.renderRecords(matches, players);
        break;
      case 'heroes':
        this.renderHeroesPage();
        break;
      case 'training':
        this.trainingManager.renderTrainingHub('trainingContainer');
        break;
    }
  },

  editMatch(matchId) {
    this.editingMatchId = matchId;
    this.navigate('add-match');
  },

  showPlayerProfile(playerId) {
    this.navigate('player-profile');
    this.playerManager.renderPlayerProfile('playerProfileContainer', playerId, this.dataStore.getMatches());
  },

  // =====================================================================
  //  DASHBOARD
  // =====================================================================
  renderDashboard(matches, players) {
    const statsGrid = document.getElementById('dashboardStats');
    const mvpCard = document.getElementById('dashMvpCard');
    const recentMatches = document.getElementById('dashRecentMatches');

    const teamStats = this.statsEngine.getTeamStats(matches);
    const records = this.statsEngine.getAllTimeRecords(matches, players);
    const allTimeMvp = this.statsEngine.getPlayerOfPeriod(matches, players);
    const fmt = window.StatsEngine.formatLargeNumber;
    const fmtDate = window.StatsEngine.formatDateFormatted;

    if (statsGrid) {
      statsGrid.innerHTML = `
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-gamepad"></i> Total Matches</div>
          <div class="stat-card-value">${teamStats.totalMatches}</div>
          <div class="stat-card-desc">Logged matches</div>
        </div>
        <div class="stat-card ${Number(teamStats.winRate) >= 50 ? 'stat-card--success' : 'stat-card--danger'}">
          <div class="stat-card-title"><i class="fa-solid fa-percent"></i> Win Rate</div>
          <div class="stat-card-value">${teamStats.winRate}%</div>
          <div class="stat-card-desc">${teamStats.wins} Wins / ${teamStats.losses} Losses</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-fire"></i> All-Time Damage Dealt</div>
          <div class="stat-card-value" title="${teamStats.teamTotalDamageDealt.toLocaleString()}">${fmt(teamStats.teamTotalDamageDealt)}</div>
          <div class="stat-card-desc">Rcvd: ${fmt(teamStats.teamTotalDamageReceived)} | Turret: ${fmt(teamStats.teamTotalTurretDamage)}</div>
        </div>
        <div class="stat-card ${records.currentStreak.type === 'win' ? 'stat-card--success' : 'stat-card--danger'}">
          <div class="stat-card-title"><i class="fa-solid fa-bolt"></i> Current Streak</div>
          <div class="stat-card-value">${records.currentStreak.count > 0 ? (records.currentStreak.count + ' ' + (records.currentStreak.type === 'win' ? 'W' : 'L')) : 'N/A'}</div>
          <div class="stat-card-desc">Best win streak: ${records.longestWinStreak} W</div>
        </div>
      `;
    }

    // Render trend table & flowchart
    this.renderDashboardTrends(this.currentTrendPeriod);

    if (mvpCard) {
      if (allTimeMvp) {
        mvpCard.innerHTML = `
          <div class="award-card">
            <div style="font-size:2.5rem; margin-bottom: 0.5rem; color:var(--secondary);"><i class="fa-solid fa-crown"></i></div>
            <h3 style="color: var(--secondary); font-size:1.5rem; margin-bottom:0.25rem;">${allTimeMvp.player.name}</h3>
            <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">All-Time MVP Leader</p>
            <div style="display:flex; justify-content:space-around; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius:8px;">
              <div><strong>KDA Ratio</strong><br><span style="color: var(--primary);">${allTimeMvp.stats.kdaRatio}</span></div>
              <div><strong>Total MVPs</strong><br><span style="color: var(--secondary);">${allTimeMvp.stats.mvpCount} <i class="fa-solid fa-award"></i></span></div>
              <div><strong>Total Dmg</strong><br><span style="color: var(--success);" title="${allTimeMvp.stats.totalDamageDealt.toLocaleString()}">${fmt(allTimeMvp.stats.totalDamageDealt)}</span></div>
            </div>
          </div>
        `;
      } else {
        mvpCard.innerHTML = `<div class="empty-state"><p>No match data available yet to determine MVP.</p></div>`;
      }
    }

    setTimeout(() => {
      if (window.ChartHelper && document.getElementById('dashWinLossChart')) {
        if (teamStats.totalMatches > 0) {
          window.ChartHelper.drawPieChart('dashWinLossChart', [
            { label: 'Wins', value: teamStats.wins, color: '#10b981' },
            { label: 'Losses', value: teamStats.losses, color: '#ef4444' }
          ], 'Team Performance');
        } else {
          window.ChartHelper.drawPieChart('dashWinLossChart', [
            { label: 'No Matches', value: 1, color: '#334155' }
          ], 'No Matches Logged');
        }
      }
    }, 50);

    if (recentMatches) {
      if (matches.length === 0) {
        recentMatches.innerHTML = `<div class="empty-state"><p>No matches recorded yet. Click <strong>+ Add Match</strong> to record your team's first match!</p></div>`;
      } else {
        const last5 = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
        let html = `<div class="table-responsive"><table class="data-table">
          <thead>
            <tr>
              <th>Exact Date</th>
              <th>Result</th>
              <th>Turtles</th>
              <th>Lords</th>
              <th>Turrets</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>`;
        last5.forEach(m => {
          html += `
            <tr>
              <td><i class="fa-regular fa-calendar" style="color:var(--primary); margin-right:4px;"></i> <strong>${fmtDate(m.date)}</strong></td>
              <td><span class="badge ${m.result === 'win' ? 'badge-win' : 'badge-loss'}">${m.result.toUpperCase()}</span></td>
              <td><i class="fa-solid fa-shield-halved" style="color:var(--success); margin-right:2px;"></i> ${m.teamTurtles}</td>
              <td><i class="fa-solid fa-crown" style="color:var(--secondary); margin-right:2px;"></i> ${m.teamLords}</td>
              <td><i class="fa-solid fa-chess-rook" style="color:var(--primary); margin-right:2px;"></i> ${m.teamTurrets}</td>
              <td>${m.notes || '-'}</td>
            </tr>
          `;
        });
        html += `</tbody></table></div>`;
        recentMatches.innerHTML = html;
      }
    }
  },

  // =====================================================================
  //  DASHBOARD TRENDS + PERFORMANCE FLOWCHART
  // =====================================================================
  renderDashboardTrends(period) {
    const container = document.getElementById('dashTrendsContent');
    if (!container) return;

    const matches = this.dataStore.getMatches();
    const players = this.dataStore.getPlayers();
    const trends = this.statsEngine.getPlayerTrends(matches, players, period);

    if (players.length === 0 || matches.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:1.5rem;">Log matches and add teammates to view growth spikes and trend tracking!</p>`;
      return;
    }

    const topRiser = trends.find(t => t.diff > 0);
    const topFaller = [...trends].reverse().find(t => t.diff < 0);

    let html = '';

    // Highlight cards for top riser and faller
    if (topRiser || topFaller) {
      html += `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">`;
      if (topRiser) {
        html += `
          <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 1rem; display:flex; align-items:center; gap:1rem;">
            <div style="font-size:2rem; color:var(--success);"><i class="fa-solid fa-rocket"></i></div>
            <div>
              <span class="badge" style="background:var(--success); color:#fff; font-size:0.7rem;">TOP RISING TEAMMATE</span>
              <h4 style="color:var(--text-primary); font-size:1.25rem; margin-top:0.2rem; margin-bottom:0.1rem;">${topRiser.player.name}</h4>
              <p style="margin:0; font-size:0.875rem; color:var(--success); font-weight:bold;">
                <i class="fa-solid fa-arrow-trend-up"></i> Spike +${topRiser.diff.toFixed(2)} pts (${topRiser.growthPct > 0 ? '+' : ''}${topRiser.growthPct.toFixed(1)}%)
              </p>
            </div>
          </div>
        `;
      }
      if (topFaller) {
        html += `
          <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 1rem; display:flex; align-items:center; gap:1rem;">
            <div style="font-size:2rem; color:var(--danger);"><i class="fa-solid fa-arrow-trend-down"></i></div>
            <div>
              <span class="badge" style="background:var(--danger); color:#fff; font-size:0.7rem;">COLD STREAK / FALLING</span>
              <h4 style="color:var(--text-primary); font-size:1.25rem; margin-top:0.2rem; margin-bottom:0.1rem;">${topFaller.player.name}</h4>
              <p style="margin:0; font-size:0.875rem; color:var(--danger); font-weight:bold;">
                <i class="fa-solid fa-arrow-trend-down"></i> Drop ${topFaller.diff.toFixed(2)} pts (${topFaller.growthPct.toFixed(1)}%)
              </p>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    // Growth trend data table
    html += `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Performance Status</th>
              <th>Current Score</th>
              <th>Baseline</th>
              <th>Change</th>
              <th>Growth %</th>
              <th>Fav Hero</th>
              <th>KDA</th>
            </tr>
          </thead>
          <tbody>
    `;

    trends.forEach(t => {
      let statusBadge = '';
      if (t.status === 'spiking') {
        statusBadge = `<span class="badge" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); color:#fff;"><i class="fa-solid fa-fire"></i> SPIKING UP</span>`;
      } else if (t.status === 'growing') {
        statusBadge = `<span class="badge" style="background:rgba(16,185,129,0.15); color:var(--success); border:1px solid var(--success);"><i class="fa-solid fa-arrow-trend-up"></i> GROWING</span>`;
      } else if (t.status === 'stable') {
        statusBadge = `<span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-secondary);"><i class="fa-solid fa-minus"></i> STABLE</span>`;
      } else if (t.status === 'declining') {
        statusBadge = `<span class="badge" style="background:rgba(245,158,11,0.15); color:var(--warning); border:1px solid var(--warning);"><i class="fa-solid fa-arrow-down-long"></i> DECLINING</span>`;
      } else {
        statusBadge = `<span class="badge" style="background:rgba(239,68,68,0.15); color:var(--danger); border:1px solid var(--danger);"><i class="fa-solid fa-arrow-trend-down"></i> FALLING</span>`;
      }

      const diffColor = t.diff > 0 ? 'var(--success)' : t.diff < 0 ? 'var(--danger)' : 'var(--text-secondary)';
      const diffSign = t.diff > 0 ? '+' : '';

      html += `
        <tr>
          <td><strong style="color:var(--primary); cursor:pointer;" onclick="window.EclipseApp.showPlayerProfile('${t.player.id}')">${t.player.name}</strong></td>
          <td>${statusBadge}</td>
          <td><strong style="color:var(--text-primary);">${t.currentScore.toFixed(2)}</strong></td>
          <td>${t.prevScore.toFixed(2)} ${t.isComparedToCareer ? '<span style="font-size:0.7rem; color:var(--text-muted);">(Career)</span>' : ''}</td>
          <td><strong style="color:${diffColor};">${diffSign}${t.diff.toFixed(2)}</strong></td>
          <td><strong style="color:${diffColor};">${diffSign}${t.growthPct.toFixed(1)}%</strong></td>
          <td><span class="badge" style="background:rgba(255,255,255,0.05);">${t.currStats.favoriteHero}</span></td>
          <td>${t.currStats.kdaRatio} (${t.currStats.avgKills}/${t.currStats.avgDeaths}/${t.currStats.avgAssists})</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;

    // Render the performance flowchart
    this.renderPerformanceFlowChart(matches, players);
  },

  // =====================================================================
  //  PERFORMANCE FLOW CHART (canvas multi-line chart)
  // =====================================================================
  renderPerformanceFlowChart(allMatches, players) {
    const legendContainer = document.getElementById('trendChartLegend');
    const canvasId = 'trendFlowChart';
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.ChartHelper) return;

    if (allMatches.length === 0 || players.length === 0) {
      if (legendContainer) legendContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">No match data to plot yet.</p>';
      return;
    }

    const sorted = [...allMatches].sort((a, b) => new Date(a.date) - new Date(b.date));
    const recentMatches = sorted.slice(-15);
    const colors = window.ChartHelper.PLAYER_COLORS || ['#00d4ff', '#ffd700', '#10b981', '#ef4444', '#a855f7', '#f97316'];

    const datasets = [];
    players.forEach((p, idx) => {
      const dataPoints = [];
      let cumulativeKills = 0, cumulativeDeaths = 0, cumulativeAssists = 0;
      let cumulativeMvps = 0, cumulativeGolds = 0, cumulativeSilvers = 0;
      let cumulativeSavages = 0, cumulativeManiacs = 0;
      let matchCount = 0;

      recentMatches.forEach(m => {
        const ps = (m.playerStats || []).find(s => s.playerId === p.id);
        if (!ps) return; // player was sub/not in this match

        matchCount++;
        cumulativeKills += Number(ps.kills) || 0;
        cumulativeDeaths += Number(ps.deaths) || 0;
        cumulativeAssists += Number(ps.assists) || 0;
        if (ps.medal === 'mvp') cumulativeMvps++;
        if (ps.medal === 'gold') cumulativeGolds++;
        if (ps.medal === 'silver') cumulativeSilvers++;
        if (ps.savage) cumulativeSavages++;
        if (ps.maniac) cumulativeManiacs++;

        const perfScore = (
          (cumulativeKills * 1) +
          (cumulativeAssists * 0.7) -
          (cumulativeDeaths * 1) +
          (cumulativeMvps * 3) +
          (cumulativeGolds * 2) +
          (cumulativeSilvers * 1) +
          (cumulativeSavages * 10) +
          (cumulativeManiacs * 5)
        ) / matchCount;

        const shortDate = m.date.slice(5);
        dataPoints.push({ matchLabel: shortDate, value: parseFloat(perfScore.toFixed(2)) });
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
      if (legendContainer) legendContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem;">No match data to plot yet.</p>';
      return;
    }

    setTimeout(() => {
      if (window.ChartHelper.drawMultiLineChart) {
        window.ChartHelper.drawMultiLineChart(canvasId, datasets, 'Performance Score Flow (Last 15 Matches)');
      }
    }, 80);

    if (legendContainer) {
      legendContainer.innerHTML = datasets.map(ds =>
        `<div class="trend-chart-legend-item"><span class="dot" style="background:${ds.color};"></span> ${ds.label}</div>`
      ).join('');
    }
  },

  // =====================================================================
  //  DREAM TEAM FORMATION LINEUP COMPONENT
  // =====================================================================
  renderDreamTeamFormation(teamData, periodTitle) {
    if (!teamData || !teamData.lineup) {
      return '';
    }

    const roles = window.StatsEngine.ROLES;
    const roleClasses = {
      'EXP Laner': 'role-exp',
      'Jungler': 'role-jungle',
      'Mid Laner': 'role-mid',
      'Gold Laner': 'role-gold',
      'Roamer': 'role-roam'
    };

    let cardsHtml = '';
    roles.forEach(role => {
      const candidate = teamData.lineup[role];
      const roleIcon = window.StatsEngine.ROLE_ICONS[role] || 'fa-shield';
      const roleClass = roleClasses[role] || 'role-exp';

      if (candidate && candidate.player) {
        const isFallback = candidate.isCareerFallback;
        cardsHtml += `
          <div class="dream-team-card ${roleClass}">
            <div>
              <div class="dream-team-role-badge">
                <i class="fa-solid ${roleIcon}"></i> ${role}
              </div>
              <div class="dream-team-player-name" onclick="window.EclipseApp.showPlayerProfile('${candidate.player.id}')">
                ${candidate.player.name}
              </div>
              <div class="dream-team-hero">
                Hero: <strong>${candidate.stats.favoriteHero}</strong> ${isFallback ? '<span style="color:var(--text-muted); font-size:0.7rem;">(Career)</span>' : ''}
              </div>
            </div>
            <div class="dream-team-stats-box">
              <div>
                <span>${candidate.stats.winRate}%</span>
                WR (${candidate.stats.matchesPlayed}G)
              </div>
              <div>
                <span style="color:var(--primary);">${candidate.stats.kdaRatio}</span>
                KDA
              </div>
              <div>
                <span style="color:var(--secondary);">${candidate.stats.avgInGameScore}</span>
                Avg Score
              </div>
              <div>
                <span style="color:var(--success);">${candidate.stats.performanceScore.toFixed(1)}</span>
                Rating
              </div>
            </div>
          </div>
        `;
      } else {
        cardsHtml += `
          <div class="dream-team-card ${roleClass}" style="opacity:0.6;">
            <div class="dream-team-role-badge">
              <i class="fa-solid ${roleIcon}"></i> ${role}
            </div>
            <div class="dream-team-player-name" style="color:var(--text-muted);">
              TBD
            </div>
            <div class="dream-team-hero">No lane data logged</div>
            <div class="dream-team-stats-box">
              <div><span>-</span>WR</div>
              <div><span>-</span>KDA</div>
              <div><span>-</span>Score</div>
              <div><span>-</span>Rating</div>
            </div>
          </div>
        `;
      }
    });

    return `
      <div class="dream-team-container">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <span class="badge" style="background:linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%); color:#000; font-weight:800;">
              <i class="fa-solid fa-star"></i> ALL-STAR 5 LINEUP
            </span>
            <h3 style="font-size:1.4rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">
              Team of the ${periodTitle}
            </h3>
            <p style="color:var(--text-secondary); margin:0; font-size:0.85rem;">
              Top performing player in each role for this timeframe based on lane performance scores.
            </p>
          </div>
          <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light); padding:0.5rem 1rem; border-radius:8px; text-align:right;">
            <div style="color:var(--text-muted); font-size:0.75rem;">TEAM LINEUP RATING</div>
            <div style="font-size:1.4rem; font-weight:bold; color:var(--secondary);">${teamData.avgLineupScore} <span style="font-size:0.8rem; color:var(--text-secondary);">pts</span></div>
          </div>
        </div>
        <div class="dream-team-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
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
    let periodTitle = 'Selected Week';

    if (period === 'week') {
      filteredMatches = this.dataStore.getMatchesForWeek(this.selectedWeekDate);

      const d = new Date(this.selectedWeekDate + 'T00:00:00');
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);

      const monStr = monday.toISOString().split('T')[0];
      const sunStr = sunday.toISOString().split('T')[0];
      periodTitle = `Week (${fmtDate(monStr)} - ${fmtDate(sunStr)})`;

      if (weekDateLabel) {
        weekDateLabel.innerHTML = `<i class="fa-regular fa-calendar-days"></i> Week of <strong>${fmtDate(monStr)}</strong> – <strong>${fmtDate(sunStr)}</strong>`;
      }
    } else if (period === 'month') {
      const now = new Date();
      periodTitle = `Month (${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`;
      filteredMatches = this.dataStore.getMatchesForMonth(now.getFullYear(), now.getMonth() + 1);
    } else if (period === 'year') {
      const now = new Date();
      periodTitle = `Year (${now.getFullYear()})`;
      filteredMatches = this.dataStore.getMatchesForYear(now.getFullYear());
    } else if (period === 'custom' && dateFrom && dateTo) {
      periodTitle = `Range (${fmtDate(dateFrom)} - ${fmtDate(dateTo)})`;
      filteredMatches = this.dataStore.getMatchesByDateRange(dateFrom, dateTo);
    } else {
      periodTitle = 'All-Time';
      filteredMatches = this.dataStore.getMatches();
    }

    const players = this.dataStore.getPlayers();
    const teamStats = this.statsEngine.getTeamStats(filteredMatches);
    const leaderboard = this.statsEngine.getLeaderboard(filteredMatches, players);
    const playerOfPeriod = this.statsEngine.getPlayerOfPeriod(filteredMatches, players);
    const mostMvps = this.statsEngine.getMostMvps(filteredMatches, players);
    const dreamTeam = this.statsEngine.getTeamOfPeriod(filteredMatches, players);

    let html = `
      <div class="stats-grid mb-4">
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-gamepad"></i> Matches in Period</div>
          <div class="stat-card-value">${teamStats.totalMatches}</div>
        </div>
        <div class="stat-card ${Number(teamStats.winRate) >= 50 ? 'stat-card--success' : 'stat-card--danger'}">
          <div class="stat-card-title"><i class="fa-solid fa-trophy"></i> Win Rate</div>
          <div class="stat-card-value">${teamStats.winRate}%</div>
          <div class="stat-card-desc">${teamStats.wins} W / ${teamStats.losses} L</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-burst"></i> Total Damage Dealt</div>
          <div class="stat-card-value" title="${teamStats.teamTotalDamageDealt.toLocaleString()}">${fmt(teamStats.teamTotalDamageDealt)}</div>
          <div class="stat-card-desc">Total Gold: ${fmt(teamStats.teamTotalGold)}</div>
        </div>
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-chess-rook"></i> Objectives</div>
          <div class="stat-card-value" style="font-size:1.75rem;"><i class="fa-solid fa-shield-halved" style="color:var(--success);"></i> ${teamStats.totalTurtles} / <i class="fa-solid fa-crown" style="color:var(--secondary);"></i> ${teamStats.totalLords}</div>
          <div class="stat-card-desc">${teamStats.totalTurrets} Turrets Destroyed</div>
        </div>
      </div>
    `;

    // Render Team of the Period (Dream Team) Formation!
    html += this.renderDreamTeamFormation(dreamTeam, periodTitle);

    if (playerOfPeriod || mostMvps) {
      html += `<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1rem; margin-bottom:1.5rem;">`;

      if (playerOfPeriod) {
        html += `
          <div class="card" style="border: 1px solid var(--secondary); background: linear-gradient(135deg, rgba(255,215,0,0.05) 0%, var(--bg-card-glass) 100%);">
            <span class="badge" style="background: var(--secondary); color:#000; font-weight:bold;"><i class="fa-solid fa-star"></i> Player of the ${period.toUpperCase()}</span>
            <h3 style="font-size:1.75rem; color:var(--secondary); margin-top:0.5rem; margin-bottom:0.25rem;">${playerOfPeriod.player.name}</h3>
            <p style="color:var(--text-secondary); margin-bottom:0.75rem;">Fav Hero: <strong>${playerOfPeriod.stats.favoriteHero}</strong> | KDA: <strong>${playerOfPeriod.stats.kdaRatio}</strong></p>
            <div style="display:flex; justify-content:space-around; background:rgba(0,0,0,0.2); padding:0.5rem; border-radius:8px;">
              <div><strong>Avg Score</strong><br><span style="color:var(--primary);">${playerOfPeriod.stats.avgInGameScore}</span></div>
              <div><strong>MVPs</strong><br><span style="color:var(--secondary);">${playerOfPeriod.stats.mvpCount} <i class="fa-solid fa-crown"></i></span></div>
              <div><strong>Perf Score</strong><br><span style="color:var(--success);">${playerOfPeriod.stats.performanceScore.toFixed(2)}</span></div>
            </div>
          </div>
        `;
      }

      if (mostMvps) {
        html += `
          <div class="card" style="border: 1px solid var(--primary); background: linear-gradient(135deg, rgba(0,212,255,0.05) 0%, var(--bg-card-glass) 100%);">
            <span class="badge" style="background: var(--primary); color:#000; font-weight:bold;"><i class="fa-solid fa-crown"></i> Most ${period.toUpperCase()} MVPs Leader</span>
            <h3 style="font-size:1.75rem; color:var(--primary); margin-top:0.5rem; margin-bottom:0.25rem;">${mostMvps.player.name}</h3>
            <p style="color:var(--text-secondary); margin-bottom:0.75rem;">MVP Awards in Period: <strong style="color:var(--secondary); font-size:1.2rem;">${mostMvps.mvpCount} MVPs <i class="fa-solid fa-award"></i></strong></p>
            <div style="display:flex; justify-content:space-around; background:rgba(0,0,0,0.2); padding:0.5rem; border-radius:8px;">
              <div><strong>KDA Ratio</strong><br><span style="color:var(--success);">${mostMvps.stats.kdaRatio}</span></div>
              <div><strong>Fav Hero</strong><br><span style="color:var(--secondary);">${mostMvps.stats.favoriteHero}</span></div>
              <div><strong>Avg Score</strong><br><span style="color:var(--primary);">${mostMvps.stats.avgInGameScore}</span></div>
            </div>
          </div>
        `;
      }

      html += `</div>`;
    }

    // MATCH DURATION & PACING SECTION
    const durationStats = this.statsEngine.getMatchDurationStats(filteredMatches);
    if (durationStats.hasData) {
      const longest = durationStats.longestMatch;
      const shortest = durationStats.shortestMatch;
      const fastestWin = durationStats.fastestWin;

      html += `
        <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0, 212, 255, 0.03) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(0, 212, 255, 0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <span class="badge" style="background:rgba(0,212,255,0.15); color:var(--primary); font-weight:700;"><i class="fa-regular fa-clock"></i> MATCH PACING & TIME</span>
              <h3 style="font-size:1.35rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">Match Durations & Records (${period.toUpperCase()})</h3>
              <p style="color:var(--text-muted); margin:0; font-size:0.85rem;">Tracking longest epic wars, blitzkrieg speedruns, and pacing trends.</p>
            </div>
            <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light); padding:0.5rem 1rem; border-radius:8px; text-align:right;">
              <div style="color:var(--text-muted); font-size:0.75rem;">AVG MATCH DURATION</div>
              <div style="font-size:1.4rem; font-weight:bold; color:var(--primary);">${durationStats.avgDurationFormatted}</div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(245,158,11,0.3);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.75rem; color:var(--warning); text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-hourglass-end"></i> Longest Match</span>
                <span class="badge ${longest.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${longest.result.toUpperCase()}</span>
              </div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--warning);">${longest.durationFormatted || window.StatsEngine.formatDuration(longest.durationSeconds)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${fmtDate(longest.date)} ${longest.notes ? `• <em>${longest.notes}</em>` : ''}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(0,212,255,0.3);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <span style="font-size:0.75rem; color:var(--primary); text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-bolt"></i> Shortest Match</span>
                <span class="badge ${shortest.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${shortest.result.toUpperCase()}</span>
              </div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--primary);">${shortest.durationFormatted || window.StatsEngine.formatDuration(shortest.durationSeconds)}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${fmtDate(shortest.date)} ${shortest.notes ? `• <em>${shortest.notes}</em>` : ''}
              </div>
            </div>

            ${fastestWin ? `
              <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                  <span style="font-size:0.75rem; color:var(--success); text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-gauge-high"></i> Fastest Victory</span>
                  <span class="badge badge-win" style="font-size:0.65rem;">VICTORY</span>
                </div>
                <div style="font-size:1.75rem; font-weight:800; color:var(--success);">${fastestWin.durationFormatted || window.StatsEngine.formatDuration(fastestWin.durationSeconds)}</div>
                <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                  ${fmtDate(fastestWin.date)} ${fastestWin.notes ? `• <em>${fastestWin.notes}</em>` : ''}
                </div>
              </div>
            ` : ''}

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid var(--border-light);">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom:0.4rem;"><i class="fa-solid fa-gamepad"></i> Total Playtime</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--text-primary);">${durationStats.totalDurationFormatted}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                Across ${durationStats.count} timed game${durationStats.count !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    html += `
      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-list-ol"></i> Player Performance Leaderboard (${period.toUpperCase()})</h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Matches</th>
                <th>Fav Hero</th>
                <th>K / D / A</th>
                <th>KDA</th>
                <th>Avg Score</th>
                <th>Avg Dmg</th>
                <th>TF Part.</th>
                <th>Avg Gold</th>
                <th>Medals</th>
                <th>Perf Score</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (leaderboard.length === 0) {
      html += `<tr><td colspan="12" class="text-center" style="padding:2rem;">No player statistics available for this period.</td></tr>`;
    } else {
      leaderboard.forEach((item, idx) => {
        const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
        html += `
          <tr>
            <td><strong>${rankIcon}</strong></td>
            <td><strong style="color:var(--primary); cursor:pointer;" onclick="window.EclipseApp.showPlayerProfile('${item.player.id}')">${item.player.name}</strong></td>
            <td>${item.stats.matchesPlayed}</td>
            <td><span class="badge" style="background:rgba(255,255,255,0.05);">${item.stats.favoriteHero}</span></td>
            <td>${item.stats.avgKills} / ${item.stats.avgDeaths} / ${item.stats.avgAssists}</td>
            <td><strong style="color:${Number(item.stats.kdaRatio) >= 3 ? 'var(--success)' : 'var(--text-primary)'}">${item.stats.kdaRatio}</strong></td>
            <td>${item.stats.avgInGameScore}</td>
            <td><span title="${item.stats.totalDamageDealt.toLocaleString()} total">${fmt(item.stats.avgDamageDealt)}</span></td>
            <td>${item.stats.avgTeamfightParticipation}%</td>
            <td><span title="${item.stats.totalGoldEarned.toLocaleString()} total">${fmt(item.stats.avgGoldEarned)}</span></td>
            <td>
              <span class="medal medal-mvp" title="${item.stats.mvpCount} MVPs">${item.stats.mvpCount}</span>
              <span class="medal medal-gold" title="${item.stats.goldCount} Gold">${item.stats.goldCount}</span>
              <span class="medal medal-silver" title="${item.stats.silverCount} Silver">${item.stats.silverCount}</span>
              <span class="medal medal-choco" title="${item.stats.bronzeCount} Bronze">${item.stats.bronzeCount}</span>
            </td>
            <td><strong style="color:var(--secondary);">${item.stats.performanceScore.toFixed(2)}</strong></td>
          </tr>
        `;
      });
    }

    html += `</tbody></table></div></div>`;

    // TEAM-WIDE HERO META & PICK / WIN RATE SHOWCASE
    const teamHeroAnalytics = this.statsEngine.getTeamHeroAnalytics(filteredMatches, players);
    let teamHeroCardsHtml = '';

    if (teamHeroAnalytics.heroes.length === 0) {
      teamHeroCardsHtml = `<p style="color:var(--text-muted); text-align:center; padding:1.5rem;">No hero meta data for this period.</p>`;
    } else {
      teamHeroCardsHtml = '<div class="hero-analytics-grid">';
      teamHeroAnalytics.heroes.forEach(h => {
        const tierClass = h.metaTier === 'S+' ? 'tier-splus' : h.metaTier === 'S' ? 'tier-s' : '';
        const tagClass = h.metaTier === 'S+' ? 'mastery-tag-splus' :
                         h.metaTier === 'S' ? 'mastery-tag-s' :
                         h.metaTier === 'A' ? 'mastery-tag-a' :
                         h.metaTier === 'B' ? 'mastery-tag-b' : 'mastery-tag-c';

        const winRateFillClass = h.winRateNum >= 75 ? 'fill-winrate-god' :
                                 h.winRateNum >= 50 ? 'fill-winrate-high' :
                                 h.winRateNum >= 35 ? 'fill-winrate-med' : 'fill-winrate-low';

        const topPilotsStr = h.pilots.map(p => `${p.playerName} (${p.picks}G)`).join(', ');

        teamHeroCardsHtml += `
          <div class="shiny-hero-card ${tierClass}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                <div>
                  <h4 style="font-size:1.35rem; font-weight:800; color:var(--text-primary); margin:0;">${h.heroName}</h4>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    Team Picks: <strong>${h.totalPicks}</strong> (${h.wins}W - ${h.losses}L)
                  </div>
                </div>
                <span class="mastery-tag ${tagClass}">
                  ${h.metaTier} TIER
                </span>
              </div>

              <!-- Visual Win Rate & Use Rate Meters -->
              <div class="rate-meter-group">
                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-trophy" style="color:var(--secondary);"></i> Team Win Rate</span>
                    <strong style="color:${h.winRateNum >= 50 ? 'var(--success)' : 'var(--danger)'};">${h.winRate}%</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill ${winRateFillClass}" style="width: ${h.winRateNum}%;"></div>
                  </div>
                </div>

                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> Team Pick Rate</span>
                    <strong style="color:var(--primary);">${h.useRate}%</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill fill-userate" style="width: ${Math.min(h.useRateNum, 100)}%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="shiny-stat-chips">
                <div>Team KDA<strong>${h.kdaRatio}</strong></div>
                <div>Avg Score<strong>${h.avgScore}</strong></div>
                <div>Avg Dmg<strong>${fmt(h.avgDamageDealt)}</strong></div>
              </div>

              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.6rem; text-align:center;">
                Pilots: <strong style="color:var(--text-secondary);">${topPilotsStr}</strong>
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
              <i class="fa-solid fa-fire"></i> TEAM META & HERO TIERS
            </span>
            <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">
              Team Hero Pool, Win Rate & Pick Rate Meta (${period.toUpperCase()})
            </h3>
            <p style="color:var(--text-secondary); margin:0; font-size:0.85rem;">
              Breakdown of all heroes drafted by Eclipse Esports with team pick rates, win rates, and top players.
            </p>
          </div>
        </div>

        ${teamHeroCardsHtml}
      </div>
    `;

    content.innerHTML = html;
  },

  // =====================================================================
  //  RECORDS PAGE
  // =====================================================================
  renderRecords(matches, players) {
    const records = this.statsEngine.getAllTimeRecords(matches, players);
    const teamStats = this.statsEngine.getTeamStats(matches);
    const careerTotals = this.statsEngine.getCareerTotals(matches, players);
    const allTimeDreamTeam = this.statsEngine.getTeamOfPeriod(matches, players);
    const fmt = window.StatsEngine.formatLargeNumber;
    const fmtDate = window.StatsEngine.formatDateFormatted;

    const awardsContainer = document.getElementById('awardsContainer');
    const recordsContainer = document.getElementById('recordsContainer');
    const savageHallContainer = document.getElementById('savageHallContainer');
    const maniacHallContainer = document.getElementById('maniacHallContainer');

    if (awardsContainer) {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();

      const weekMatches = this.dataStore.getMatchesForWeek(today);
      const monthMatches = this.dataStore.getMatchesForMonth(now.getFullYear(), now.getMonth() + 1);
      const yearMatches = this.dataStore.getMatchesForYear(now.getFullYear());

      const mostWeeklyMvp = this.statsEngine.getMostMvps(weekMatches, players);
      const mostMonthlyMvp = this.statsEngine.getMostMvps(monthMatches, players);
      const mostYearlyMvp = this.statsEngine.getMostMvps(yearMatches, players);

      let dreamTeamHtml = this.renderDreamTeamFormation(allTimeDreamTeam, 'All-Time (All-Star 5)');

      awardsContainer.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="award-card" style="border-color:var(--primary);">
            <span class="badge" style="background:var(--primary); color:#000;"><i class="fa-solid fa-crown"></i> MOST WEEKLY MVPS</span>
            <h3 style="font-size:1.6rem; margin-top:0.5rem; color:var(--text-primary); margin-bottom:0.25rem;">${mostWeeklyMvp ? mostWeeklyMvp.player.name : 'N/A'}</h3>
            <p style="margin:0; font-size:1.1rem; color:var(--secondary); font-weight:bold;">${mostWeeklyMvp ? mostWeeklyMvp.mvpCount + ' MVPs' : '0 MVPs'}</p>
          </div>
          <div class="award-card" style="border-color:var(--secondary);">
            <span class="badge" style="background:var(--secondary); color:#000;"><i class="fa-solid fa-crown"></i> MOST MONTHLY MVPS</span>
            <h3 style="font-size:1.6rem; margin-top:0.5rem; color:var(--secondary); margin-bottom:0.25rem;">${mostMonthlyMvp ? mostMonthlyMvp.player.name : 'N/A'}</h3>
            <p style="margin:0; font-size:1.1rem; color:var(--secondary); font-weight:bold;">${mostMonthlyMvp ? mostMonthlyMvp.mvpCount + ' MVPs' : '0 MVPs'}</p>
          </div>
          <div class="award-card" style="border-color:var(--success);">
            <span class="badge" style="background:var(--success); color:#fff;"><i class="fa-solid fa-crown"></i> MOST YEARLY MVPS</span>
            <h3 style="font-size:1.6rem; margin-top:0.5rem; color:var(--success); margin-bottom:0.25rem;">${mostYearlyMvp ? mostYearlyMvp.player.name : 'N/A'}</h3>
            <p style="margin:0; font-size:1.1rem; color:var(--secondary); font-weight:bold;">${mostYearlyMvp ? mostYearlyMvp.mvpCount + ' MVPs' : '0 MVPs'}</p>
          </div>
        </div>

        ${dreamTeamHtml}
      `;
    }

    if (recordsContainer) {
      const sortedByDamage = [...careerTotals].sort((a, b) => b.stats.totalDamageDealt - a.stats.totalDamageDealt);

      let careerRows = '';
      if (sortedByDamage.length === 0) {
        careerRows = `<tr><td colspan="10" class="text-center" style="padding:2rem;">No player statistics logged yet.</td></tr>`;
      } else {
        sortedByDamage.forEach((item, idx) => {
          const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
          careerRows += `
            <tr>
              <td><strong>${rankIcon}</strong></td>
              <td><strong style="color:var(--primary); cursor:pointer;" onclick="window.EclipseApp.showPlayerProfile('${item.player.id}')">${item.player.name}</strong></td>
              <td>${item.stats.matchesPlayed}</td>
              <td><strong style="color:var(--secondary);" title="${item.stats.totalDamageDealt.toLocaleString()}">${fmt(item.stats.totalDamageDealt)}</strong></td>
              <td><span title="${item.stats.totalDamageReceived.toLocaleString()}">${fmt(item.stats.totalDamageReceived)}</span></td>
              <td><span title="${item.stats.totalTurretDamage.toLocaleString()}">${fmt(item.stats.totalTurretDamage)}</span></td>
              <td><span title="${item.stats.totalGoldEarned.toLocaleString()}">${fmt(item.stats.totalGoldEarned)}</span></td>
              <td>${item.stats.totalKills} / ${item.stats.totalDeaths} / ${item.stats.totalAssists}</td>
              <td><strong style="color:var(--secondary);">${item.stats.mvpCount} <i class="fa-solid fa-crown"></i></strong></td>
              <td><i class="fa-solid fa-fire" style="color:var(--secondary);"></i> ${item.stats.savageCount} / <i class="fa-solid fa-bolt" style="color:var(--primary);"></i> ${item.stats.maniacCount}</td>
            </tr>
          `;
        });
      }

      recordsContainer.innerHTML = `
        <div class="card mb-4" style="background: linear-gradient(135deg, rgba(255,215,0,0.03) 0%, var(--bg-card-glass) 100%);">
          <h3 class="card-title mb-3" style="color:var(--secondary);"><i class="fa-solid fa-chart-line"></i> Team Cumulative All-Time Totals</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Total Damage Dealt</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--secondary);" title="${teamStats.teamTotalDamageDealt.toLocaleString()}">${fmt(teamStats.teamTotalDamageDealt)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Total Damage Received</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--primary);" title="${teamStats.teamTotalDamageReceived.toLocaleString()}">${fmt(teamStats.teamTotalDamageReceived)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Total Turret Damage</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--success);" title="${teamStats.teamTotalTurretDamage.toLocaleString()}">${fmt(teamStats.teamTotalTurretDamage)}</div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Total Gold Earned</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--warning);" title="${teamStats.teamTotalGold.toLocaleString()}">${fmt(teamStats.teamTotalGold)}</div>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <h3 class="card-title mb-3"><i class="fa-solid fa-ranking-star"></i> Player Cumulative All-Time Career Totals</h3>
          <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">Hover over abbreviated numbers to see the full digit count.</p>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Games</th>
                  <th>Total Dmg Dealt</th>
                  <th>Total Dmg Rcvd</th>
                  <th>Total Turret Dmg</th>
                  <th>Total Gold</th>
                  <th>K / D / A</th>
                  <th>MVPs</th>
                  <th>Savages / Maniacs</th>
                </tr>
              </thead>
              <tbody>
                ${careerRows}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card mb-4">
          <h3 class="card-title mb-3"><i class="fa-solid fa-bolt"></i> All-Time Single Match Peaks</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Most Kills (1 Game)</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--danger);">${records.highestKills.value > -1 ? records.highestKills.value : '-'}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${records.highestKills.playerName || '-'} (${records.highestKills.heroUsed || '-'}) — ${fmtDate(records.highestKills.date)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Most Assists (1 Game)</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--primary);">${records.highestAssists.value > -1 ? records.highestAssists.value : '-'}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${records.highestAssists.playerName || '-'} (${records.highestAssists.heroUsed || '-'}) — ${fmtDate(records.highestAssists.date)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Most Damage (1 Game)</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--secondary);">${records.highestDamage.value > -1 ? records.highestDamage.value.toLocaleString() : '-'}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${records.highestDamage.playerName || '-'} (${records.highestDamage.heroUsed || '-'}) — ${fmtDate(records.highestDamage.date)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:8px; border:1px solid var(--border-light);">
              <div style="color:var(--text-muted); font-size:0.8rem; text-transform:uppercase;">Highest Gold (1 Game)</div>
              <div style="font-size:1.75rem; font-weight:bold; color:var(--success);">${records.highestGold.value > -1 ? records.highestGold.value.toLocaleString() : '-'}</div>
              <div style="color:var(--text-secondary); font-size:0.8rem;">${records.highestGold.playerName || '-'} (${records.highestGold.heroUsed || '-'}) — ${fmtDate(records.highestGold.date)}</div>
            </div>
          </div>
        </div>

        <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.03) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(0,212,255,0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <h3 class="card-title" style="margin:0;"><i class="fa-regular fa-clock" style="color:var(--primary);"></i> All-Time Match Duration Hall of Fame</h3>
            <div style="font-size:0.85rem; color:var(--text-muted);">
              Avg Length: <strong style="color:var(--primary);">${teamStats.avgDurationFormatted}</strong> | Total Playtime: <strong style="color:var(--secondary);">${teamStats.totalDurationFormatted}</strong>
            </div>
          </div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(245,158,11,0.3);">
              <div style="color:var(--warning); font-size:0.75rem; text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-hourglass-end"></i> Longest Match (Marathon Game)</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--warning); margin-top:0.25rem;">
                ${records.longestMatch ? (records.longestMatch.durationFormatted || window.StatsEngine.formatDuration(records.longestMatch.durationSeconds)) : '-'}
              </div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${records.longestMatch ? `${fmtDate(records.longestMatch.date)} • <span class="badge ${records.longestMatch.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${records.longestMatch.result.toUpperCase()}</span>` : 'No duration recorded'}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(16,185,129,0.3);">
              <div style="color:var(--success); font-size:0.75rem; text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-gauge-high"></i> Fastest Victory (Speedrun)</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--success); margin-top:0.25rem;">
                ${records.fastestWin ? (records.fastestWin.durationFormatted || window.StatsEngine.formatDuration(records.fastestWin.durationSeconds)) : '-'}
              </div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${records.fastestWin ? `${fmtDate(records.fastestWin.date)} • ${records.fastestWin.notes || 'Clean sweep victory'}` : 'No duration recorded'}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.35); padding:1rem; border-radius:10px; border:1px solid rgba(0,212,255,0.3);">
              <div style="color:var(--primary); font-size:0.75rem; text-transform:uppercase; font-weight:700;"><i class="fa-solid fa-bolt"></i> Shortest Match (Any Result)</div>
              <div style="font-size:1.75rem; font-weight:800; color:var(--primary); margin-top:0.25rem;">
                ${records.shortestMatch ? (records.shortestMatch.durationFormatted || window.StatsEngine.formatDuration(records.shortestMatch.durationSeconds)) : '-'}
              </div>
              <div style="color:var(--text-secondary); font-size:0.8rem; margin-top:0.25rem;">
                ${records.shortestMatch ? `${fmtDate(records.shortestMatch.date)} • <span class="badge ${records.shortestMatch.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.65rem;">${records.shortestMatch.result.toUpperCase()}</span>` : 'No duration recorded'}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    if (savageHallContainer && maniacHallContainer) {
      let savageHtml = `
        <div class="card mb-4">
          <h3 class="card-title mb-3" style="color:var(--secondary);"><i class="fa-solid fa-fire"></i> Savage Hall of Fame (${teamStats.totalSavages})</h3>
      `;
      if (teamStats.savageList.length === 0) {
        savageHtml += `<p style="color:var(--text-muted);">No Savages logged yet. Get out there and wipe the enemy team!</p>`;
      } else {
        savageHtml += `<ul style="display:flex; flex-direction:column; gap:0.5rem;">`;
        teamStats.savageList.forEach(s => {
          const pName = players.find(p => p.id === s.playerId)?.name || 'Unknown Player';
          savageHtml += `<li style="padding:0.5rem 1rem; background:rgba(255,215,0,0.05); border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span><i class="fa-solid fa-fire" style="color:var(--secondary); margin-right:4px;"></i> <strong>${pName}</strong> on <em>${s.heroUsed}</em></span> <span style="color:var(--text-muted); font-size:0.8rem;">${fmtDate(s.date)}</span></li>`;
        });
        savageHtml += `</ul>`;
      }
      savageHtml += `</div>`;
      savageHallContainer.innerHTML = savageHtml;

      let maniacHtml = `
        <div class="card mb-4">
          <h3 class="card-title mb-3" style="color:var(--primary);"><i class="fa-solid fa-bolt"></i> Maniac Hall of Fame (${teamStats.totalManiacs})</h3>
      `;
      if (teamStats.maniacList.length === 0) {
        maniacHtml += `<p style="color:var(--text-muted);">No Maniacs logged yet.</p>`;
      } else {
        maniacHtml += `<ul style="display:flex; flex-direction:column; gap:0.5rem;">`;
        teamStats.maniacList.forEach(m => {
          const pName = players.find(p => p.id === m.playerId)?.name || 'Unknown Player';
          maniacHtml += `<li style="padding:0.5rem 1rem; background:rgba(0,212,255,0.05); border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span><i class="fa-solid fa-bolt" style="color:var(--primary); margin-right:4px;"></i> <strong>${pName}</strong> on <em>${m.heroUsed}</em></span> <span style="color:var(--text-muted); font-size:0.8rem;">${fmtDate(m.date)}</span></li>`;
        });
        maniacHtml += `</ul>`;
      }
      maniacHtml += `</div>`;
      maniacHallContainer.innerHTML = maniacHtml;
    }
  },

  // =====================================================================
  //  HEROES PAGE
  // =====================================================================
  renderHeroesPage() {
    const container = document.getElementById('heroManageContainer');
    if (!container) return;

    const heroes = this.heroDb.getAll();
    const roles = this.heroDb.getRoles();

    let html = `
      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-plus-circle"></i> Add New Hero to Database</h3>
        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
          <input type="text" id="newHeroName" class="form-input" placeholder="Hero Name (e.g. Sora)" style="flex:1; min-width:200px;" />
          <select id="newHeroRole" class="form-select" style="flex:1; min-width:150px;">
            ${roles.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="addHeroBtn"><i class="fa-solid fa-plus"></i> Add Hero</button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:1rem;">
          <h3 class="card-title" style="margin:0;"><i class="fa-solid fa-shield-halved"></i> All Heroes (${heroes.length})</h3>
          <div class="search-input" style="max-width:300px; width:100%;">
            <input type="text" id="heroSearchInput" class="form-input" placeholder="Search hero..." />
          </div>
        </div>
        <div id="heroGrid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem;">
    `;

    heroes.forEach(h => {
      html += `
        <div class="hero-card" data-name="${h.name.toLowerCase()}" style="padding:0.75rem; background:rgba(255,255,255,0.02); border:1px solid var(--border-light); border-radius:8px; text-align:center; position:relative;">
          <div style="font-weight:bold; color:var(--text-primary); margin-bottom:0.25rem;">${h.name}</div>
          <span class="badge" style="background:rgba(0,212,255,0.1); color:var(--primary); font-size:0.75rem;">${h.role}</span>
          <button class="delete-hero-btn" data-hero="${h.name}" title="Delete hero" style="position:absolute; top:4px; right:4px; background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.75rem; padding:2px 4px; border-radius:4px; opacity:0.6; transition:all 0.2s ease;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.delete-hero-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const heroName = e.currentTarget.dataset.hero;
        if (confirm(`Remove hero '${heroName}' from database?`)) {
          this.heroDb.removeHero(heroName);
          window.showToast(`Hero '${heroName}' removed`, 'warning');
          this.renderHeroesPage();
        }
      });
    });

    document.getElementById('addHeroBtn')?.addEventListener('click', () => {
      const name = document.getElementById('newHeroName').value.trim();
      const role = document.getElementById('newHeroRole').value;
      if (name) {
        this.heroDb.addHero(name, role);
        window.showToast(`Hero '${name}' added to database!`, 'success');
        this.renderHeroesPage();
      }
    });

    document.getElementById('heroSearchInput')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#heroGrid .hero-card').forEach(card => {
        const hName = card.getAttribute('data-name');
        card.style.display = hName.includes(q) ? 'block' : 'none';
      });
    });
  }
};

// =====================================================================
//  TOAST NOTIFICATIONS
// =====================================================================
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toastContainer') || document.body;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
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
