window.PlayerManager = class PlayerManager {
  constructor(dataStore, statsEngine) {
    this.db = dataStore;
    this.statsEngine = statsEngine;
    this.selectedP1 = null;
    this.selectedP2 = null;
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  getTrendMeta(trend) {
    const status = trend?.status || 'stable';
    const meta = {
      spiking: { label: 'Keskin yuksalish', className: 'is-rising', icon: 'fa-arrow-trend-up' },
      growing: { label: 'O‘sishda', className: 'is-growing', icon: 'fa-arrow-up-long' },
      stable: { label: 'Barqaror', className: 'is-stable', icon: 'fa-minus' },
      declining: { label: 'Nazoratda', className: 'is-declining', icon: 'fa-arrow-down-long' },
      falling: { label: 'Soya bosqichi', className: 'is-falling', icon: 'fa-arrow-trend-down' },
      insufficient: { label: 'Sample kutilmoqda', className: 'is-insufficient', icon: 'fa-circle-minus' }
    };
    return meta[status] || meta.stable;
  }

  setupSubTabs() {
    const tabBtns = document.querySelectorAll('#playerSubTabs .tab-btn');
    const rosterView = document.getElementById('playerRosterSubView');
    const compareView = document.getElementById('playerCompareSubView');
    const synergyView = document.getElementById('playerSynergySubView');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        tabBtns.forEach(b => b.classList.remove('active'));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        const subtab = targetBtn.dataset.subtab;

        if (rosterView) rosterView.classList.toggle('hidden', subtab !== 'roster');
        if (compareView) compareView.classList.toggle('hidden', subtab !== 'compare');
        if (synergyView) synergyView.classList.toggle('hidden', subtab !== 'synergy');

        if (subtab === 'compare') {
          this.renderComparisonTool('playerCompareContainer');
        } else if (subtab === 'synergy') {
          this.renderSynergyMatrix('playerSynergyContainer');
        } else {
          this.renderPlayersList('playersListContainer');
        }
      });
    });
  }

  getPlayerRecentForm(matches, playerId, limit = 5) {
    const playerMatches = (matches || [])
      .filter(m => (m.players || []).some(slot => String(slot.playerId || slot.id) === String(playerId)))
      .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))
      .slice(0, limit);

    const results = playerMatches.map(m => {
      const slot = (m.players || []).find(s => String(s.playerId || s.id) === String(playerId));
      const isWin = m.result === 'win' || m.result === 'G‘alaba' || m.isWin === true;
      return {
        isWin,
        date: m.date,
        hero: slot?.heroName || slot?.hero || '',
        kda: slot?.kda || `${slot?.kills ?? 0}/${slot?.deaths ?? 0}/${slot?.assists ?? 0}`
      };
    });

    let streakCount = 0;
    let streakType = null;
    for (const r of results) {
      if (streakType === null) {
        streakType = r.isWin ? 'win' : 'loss';
        streakCount = 1;
      } else if ((streakType === 'win' && r.isWin) || (streakType === 'loss' && !r.isWin)) {
        streakCount++;
      } else {
        break;
      }
    }

    return { results, streakCount, streakType };
  }

  renderRecentFormHtml(recentForm) {
    if (!recentForm || !recentForm.results || recentForm.results.length === 0) {
      return '';
    }
    const pillsHtml = recentForm.results.map(r => `
      <span class="form-pill ${r.isWin ? 'is-win' : 'is-loss'}" title="${r.hero ? this.escapeHtml(r.hero) + ' · ' : ''}${r.isWin ? 'G‘alaba' : 'Mag‘lubiyat'}">${r.isWin ? 'W' : 'L'}</span>
    `).join('');

    let streakBadge = '';
    if (recentForm.streakCount >= 2 && recentForm.streakType === 'win') {
      const isFire = recentForm.streakCount >= 3;
      streakBadge = `<span class="player-streak-badge ${isFire ? 'is-fire' : ''}">${isFire ? '🔥' : '⚡'} ${recentForm.streakCount} ketma-ket</span>`;
    }

    return `
      <div class="player-recent-form" aria-label="So‘nggi o‘yinlar formasi">
        <span class="player-recent-form__label">Forma:</span>
        <div class="player-recent-form__pills">${pillsHtml}</div>
        ${streakBadge}
      </div>
    `;
  }

  renderPlayersList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = this.db.getActivePlayers?.() || this.db.getPlayers().filter(player => player.active !== false);
    const archivedPlayers = this.db.getArchivedPlayers?.() || this.db.getPlayers().filter(player => player.active === false);
    const matches = window.EclipseApp?.getAnalyticsMatches?.(this.db.getMatches()) || this.db.getMatches();

    const canRestoreArchived = window.EclipseApp?.authManager?.isAdmin() && archivedPlayers.length > 0;
    if (players.length === 0 && !canRestoreArchived) {
      container.innerHTML = `
        <div class="empty-state roster-empty-state">
          <svg class="ecl-icon" aria-hidden="true"><use href="assets/eclipse-symbols.svg?v=2.16.0#ecl-players"></use></svg>
          <h3>Tarkib hali shakllanmagan</h3>
          <p>Individual statistika kuzatuvini boshlash uchun jamoa a’zolarini qo‘shing.</p>
        </div>
      `;
      return;
    }

    const trends = this.statsEngine.getPlayerTrends(matches, players, 'month', { scope: 'all' });
    const trendByPlayer = new Map(trends.map(item => [item.player.id, item]));
    const totalAppearances = players.reduce((sum, player) => sum + this.statsEngine.getPlayerStats(matches, player.id).matchesPlayed, 0);

    const synergy = this.statsEngine?.getSynergyStats?.(matches, players, { minimumMatches: 2, scope: 'all' });
    const duos = synergy?.duos || [];
    let chemistryBannerHtml = '';
    if (duos.length > 0) {
      const topDuos = duos.slice(0, 2);
      const duoCardsHtml = topDuos.map((duo, idx) => `
        <div class="chemistry-duo-card ${idx === 0 ? 'is-best' : ''}">
          <div class="chemistry-duo-card__names">
            <span class="chemistry-duo-rank">👑 #${idx + 1} TANDEM</span>
            <strong>${this.escapeHtml(duo.player1.name)} + ${this.escapeHtml(duo.player2.name)}</strong>
            <small>${duo.wins}W - ${duo.losses}L · KDA: ${duo.combinedKda || '—'}</small>
          </div>
          <div class="chemistry-duo-card__stats">
            <span class="chemistry-stat-wr">${duo.winRate}%</span>
            <span class="chemistry-stat-matches">${duo.matchesTogether} match birga</span>
          </div>
        </div>
      `).join('');

      chemistryBannerHtml = `
        <section class="team-chemistry-highlight" aria-label="Eng samarali tandemlar">
          <div class="team-chemistry-highlight__header">
            <span class="badge" style="background:rgba(228, 196, 110, 0.15); color:var(--primary); font-weight:800;"><i class="fa-solid fa-bolt"></i> TANDEM SYNERGY</span>
            <h4>Jamoaning eng kuchli tandemlari</h4>
          </div>
          <div class="team-chemistry-highlight__grid">
            ${duoCardsHtml}
          </div>
        </section>
      `;
    }

    let html = `
      <section class="roster-command" aria-label="Eclipse faol tarkibi">
        <div>
          <p class="roster-command__eyebrow">ECL // ACTIVE UNIT</p>
          <h3>Jamoa tarkibi</h3>
          <p>Har bir o‘yinchi — Eclipse orbitasidagi alohida kuch.</p>
        </div>
        <div class="roster-command__telemetry">
          <span><strong>${String(players.length).padStart(2, '0')}</strong> o‘yinchi</span>
          <span><strong>${String(matches.length).padStart(2, '0')}</strong> match</span>
          <span><strong>${String(totalAppearances).padStart(2, '0')}</strong> ishtirok</span>
        </div>
      </section>
      ${chemistryBannerHtml}
      <div class="player-roster-grid">
    `;

    players.forEach((p, index) => {
      const stats = this.statsEngine.getPlayerStats(matches, p.id);
      const roleBreakdown = this.statsEngine.getPlayerRoleBreakdown(matches, p.id);
      const heroAnalytics = this.statsEngine.getPlayerHeroAnalytics(matches, p.id);
      const playerName = String(p.name || 'Nomsiz o‘yinchi');
      const safePlayerName = this.escapeHtml(playerName);
      const safePlayerId = this.escapeHtml(p.id);
      const initials = this.escapeHtml(playerName.substring(0, 2).toUpperCase());
      const bestRoleColor = window.StatsEngine.ROLE_COLORS[p.primaryRole || roleBreakdown.bestRole] || 'var(--secondary)';
      const trend = trendByPlayer.get(p.id);
      const trendMeta = this.getTrendMeta(trend);
      const trendDiff = trend?.comparisonAvailable && trend.diff !== null
        ? `${trend.diff > 0 ? '+' : ''}${trend.diff.toFixed(2)}`
        : '—';

      const topHero = heroAnalytics.mostPicked;
      const topHeroName = this.escapeHtml(topHero?.heroName || 'Ma’lumot yo‘q');
      const percentOrDash = value => value === null || value === undefined || !Number.isFinite(Number(value))
        ? '—'
        : `${this.escapeHtml(value)}%`;
      const topHeroMeta = topHero
        ? `${percentOrDash(topHero.useRate)} pick · ${percentOrDash(topHero.winRate)} WR`
        : 'Match ma’lumoti kutilmoqda';
      const winRateText = stats.winRate === null || stats.winRate === undefined || !Number.isFinite(Number(stats.winRate))
        ? '—'
        : `${stats.winRate}%`;
      const kdaText = stats.kdaRatio === null || stats.kdaRatio === undefined || !Number.isFinite(Number(stats.kdaRatio))
        ? '—'
        : stats.kdaRatio;
      const isCaptain = Boolean(p.captain);
      const detectedRole = p.primaryRole || roleBreakdown.bestRole || 'Rol aniqlanmagan';
      const roleLabel = this.escapeHtml(`${detectedRole}${p.secondaryRole ? ` / ${p.secondaryRole}` : ''}${isCaptain ? ' / Captain' : ''}`);
      const recentForm = this.getPlayerRecentForm(matches, p.id, 5);
      const recentFormHtml = this.renderRecentFormHtml(recentForm);

      html += `
        <article class="eclipse-player-card ${isCaptain ? 'eclipse-player-card--captain' : ''}" data-id="${safePlayerId}">
          <div class="eclipse-player-card__core">
            <header class="eclipse-player-card__header">
              <span class="eclipse-player-card__serial">ECL // ${String(index + 1).padStart(2, '0')}</span>
              <span class="player-form-status ${trendMeta.className}">
                <i class="fa-solid ${trendMeta.icon}"></i> ${trendMeta.label}
              </span>
            </header>

            <div class="eclipse-player-card__identity">
              <div class="player-avatar player-avatar--eclipse ${isCaptain ? 'is-captain' : ''}">
                <span>${initials}</span>
              </div>
              <div class="player-info">
                <p class="player-kicker">${isCaptain ? 'TEAM COMMANDER' : 'ECLIPSE OPERATIVE'}</p>
                <div class="player-name">${safePlayerName}</div>
                <div class="player-role">
                  <span class="role-signal" style="--role-color:${bestRoleColor};"></span>${roleLabel}
                </div>
                <div class="roster-player-tags">${(p.tags || []).map(tag => `<span>${this.escapeHtml(tag)}</span>`).join('')}</div>
              </div>
            </div>

            <div class="player-signature">
              <span>Eng ko‘p o‘ynalgan hero</span>
              <div>
                <strong>${topHeroName}</strong>
                <small>${topHeroMeta}</small>
              </div>
            </div>

            <dl class="player-metric-strip">
              <div><dt>Match</dt><dd>${stats.matchesPlayed}</dd></div>
              <div><dt>Win rate</dt><dd class="${stats.winRate !== null && Number(stats.winRate) >= 50 ? 'is-positive' : ''}">${winRateText}</dd></div>
              <div><dt>KDA</dt><dd>${kdaText}</dd></div>
              <div><dt>MVP</dt><dd class="is-gold">${stats.mvpCount}</dd></div>
            </dl>

            ${recentFormHtml}

            <footer class="eclipse-player-card__footer">
              <span class="performance-delta ${trendMeta.className}">${trendDiff} forma</span>
              <div class="player-card-actions">
                <button class="player-profile-cta view-profile-btn" data-id="${safePlayerId}">
                  <span>Profilni ochish</span>
                  <span class="player-profile-cta__icon" aria-hidden="true">↗</span>
                </button>
                ${window.EclipseApp && window.EclipseApp.authManager && window.EclipseApp.authManager.isAdmin() ? `
                  <button class="icon-action edit-player-btn" data-id="${safePlayerId}" aria-label="${safePlayerName}: ism, asosiy layn va teglar"><i class="fa-solid fa-pen"></i></button>
                  <button class="icon-action icon-action--danger delete-player-btn" data-id="${safePlayerId}" aria-label="${safePlayerName}ni tarkibdan o‘chirish"><i class="fa-solid fa-trash"></i></button>
                ` : ''}
              </div>
            </footer>
          </div>
        </article>
      `;
    });
    html += '</div>';
    if (window.EclipseApp?.authManager?.isAdmin() && archivedPlayers.length) {
      html += `
        <section class="archived-roster" aria-labelledby="archivedRosterTitle">
          <header><div><p class="roster-command__eyebrow">ROSTER ARCHIVE</p><h3 id="archivedRosterTitle">Arxivdagi o‘yinchilar</h3></div><span>${archivedPlayers.length}</span></header>
          <div class="archived-roster__list">
            ${archivedPlayers.map(player => {
              const archivedName = this.escapeHtml(player.name || 'Nomsiz o‘yinchi');
              const archivedRole = this.escapeHtml(player.primaryRole || 'Rol ko‘rsatilmagan');
              const archivedId = this.escapeHtml(player.id);
              return `
                <article>
                  <div><strong>${archivedName}</strong><small>${archivedRole} · tarix saqlangan</small></div>
                  <div>
                    <button type="button" class="btn btn-sm btn-secondary view-profile-btn" data-id="${archivedId}"><i class="fa-solid fa-chart-line"></i> Profil</button>
                    <button type="button" class="btn btn-sm btn-primary restore-player-btn" data-id="${archivedId}"><i class="fa-solid fa-rotate-left"></i> Tiklash</button>
                  </div>
                </article>`;
            }).join('')}
          </div>
        </section>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.edit-player-btn').forEach(btn =>
      btn.addEventListener('click', e => this.showEditModal(e.currentTarget.dataset.id)));
    container.querySelectorAll('.delete-player-btn').forEach(btn =>
      btn.addEventListener('click', e => this.showDeleteConfirm(e.currentTarget.dataset.id)));
    container.querySelectorAll('.view-profile-btn').forEach(btn =>
      btn.addEventListener('click', e => window.EclipseApp.showPlayerProfile(e.currentTarget.dataset.id)));
    container.querySelectorAll('.restore-player-btn').forEach(btn =>
      btn.addEventListener('click', e => {
        this.db.restorePlayer?.(e.currentTarget.dataset.id);
        window.EclipseApp.cloudSync?.syncUp?.();
        window.showToast?.('O‘yinchi faol tarkibga qaytarildi.', 'success');
        this.renderPlayersList(containerId);
      }));
  }

  renderAddPlayerForm(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const isAdmin = window.EclipseApp && window.EclipseApp.authManager && window.EclipseApp.authManager.isAdmin();
    if (!isAdmin) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-user-plus"></i> Yangi jamoadosh</h3>
        <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:end;">
          <label for="new-player-name" style="display:grid; gap:0.4rem; flex:1; min-width:200px;">
            <span style="color:var(--text-secondary); font-size:0.8rem; font-weight:700;">O‘yinchi IGN nomi</span>
            <input type="text" id="new-player-name" class="form-input" placeholder="Masalan: EclipsePlayer" autocomplete="off" style="width:100%;" />
          </label>
          <button type="button" id="save-player-btn" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Qo‘shish</button>
        </div>
      </div>
    `;

    document.getElementById('save-player-btn')?.addEventListener('click', () => {
      if (window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
        window.EclipseApp.authManager.showLoginModal();
        return;
      }
      const name = document.getElementById('new-player-name').value.trim();
      if (name) {
        this.db.addPlayer(name);
        if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
          window.EclipseApp.cloudSync.syncUp();
        }
        if (window.showToast) window.showToast(`${name} tarkibga qo‘shildi.`, 'success');
        this.renderPlayersList('playersListContainer');
        document.getElementById('new-player-name').value = '';
      } else {
        if (window.showToast) window.showToast('O‘yinchi nomini kiriting.', 'warning');
      }
    });
  }

  // =========================================================================
  //  1v1 HEAD-TO-HEAD COMPARISON TOOL
  // =========================================================================

  renderComparisonTool(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = this.db.getAllPlayers?.() || this.db.getPlayers();
    const matches = this.db.getMatches();

    if (players.length < 2) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem;">
          <h3 style="color:var(--warning);"><i class="fa-solid fa-users"></i> Need at least 2 players</h3>
          <p style="color:var(--text-secondary);">Add at least 2 teammates to compare their performance side-by-side!</p>
        </div>
      `;
      return;
    }

    if (!this.selectedP1 || !players.find(p => p.id === this.selectedP1)) {
      this.selectedP1 = players[0].id;
    }
    if (!this.selectedP2 || !players.find(p => p.id === this.selectedP2) || this.selectedP2 === this.selectedP1) {
      this.selectedP2 = players[1].id;
    }

    const p1 = players.find(p => p.id === this.selectedP1);
    const p2 = players.find(p => p.id === this.selectedP2);

    const comp = this.statsEngine.getPlayerComparison(matches, this.selectedP1, this.selectedP2);

    // Build metric rows
    let metricRowsHtml = '';
    comp.metrics.forEach(m => {
      const isP1Win = m.winner === 'p1';
      const isP2Win = m.winner === 'p2';
      const p1Color = isP1Win ? 'var(--primary)' : 'var(--text-primary)';
      const p2Color = isP2Win ? '#a855f7' : 'var(--text-primary)';

      metricRowsHtml += `
        <div class="compare-metric-row">
          <div style="text-align:right;">
            <strong style="color:${p1Color}; font-size:1.05rem;">
              ${isP1Win ? '<i class="fa-solid fa-crown" style="color:var(--secondary); font-size:0.8rem; margin-right:4px;"></i>' : ''}
              ${m.format(m.val1)}
            </strong>
          </div>
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted); margin-bottom:2px;">
              <span>${m.label}</span>
              <span style="font-weight:700; color:${isP1Win ? 'var(--primary)' : isP2Win ? '#a855f7' : 'var(--text-muted)'};">
                ${isP1Win ? p1.name + ' Leads' : isP2Win ? p2.name + ' Leads' : 'Tied'}
              </span>
            </div>
            <div class="compare-bar-container">
              <div class="compare-bar-p1" style="width: ${m.p1Pct}%;"></div>
              <div class="compare-bar-p2" style="width: ${m.p2Pct}%;"></div>
            </div>
          </div>
          <div style="text-align:left;">
            <strong style="color:${p2Color}; font-size:1.05rem;">
              ${m.format(m.val2)}
              ${isP2Win ? '<i class="fa-solid fa-crown" style="color:var(--secondary); font-size:0.8rem; margin-left:4px;"></i>' : ''}
            </strong>
          </div>
        </div>
      `;
    });

    // Shared Heroes Duel rows
    let sharedHeroesHtml = '';
    if (comp.sharedHeroes.length === 0) {
      sharedHeroesHtml = `<tr><td colspan="5" class="text-center" style="color:var(--text-muted); padding:1rem;">No shared heroes played yet by both players.</td></tr>`;
    } else {
      comp.sharedHeroes.forEach(sh => {
        const p1Better = Number(sh.p1.winRate) > Number(sh.p2.winRate);
        const p2Better = Number(sh.p2.winRate) > Number(sh.p1.winRate);

        sharedHeroesHtml += `
          <tr>
            <td><strong>${sh.heroName}</strong></td>
            <td>
              <strong style="color:${p1Better ? 'var(--success)' : 'var(--text-primary)'};">${sh.p1.winRate}% WR</strong>
              <span style="color:var(--text-muted); font-size:0.75rem;">(${sh.p1.timesUsed}G, ${sh.p1.kdaRatio} KDA)</span>
            </td>
            <td class="text-center">
              <span class="badge" style="background:rgba(255,255,255,0.05);">${p1Better ? p1.name : p2Better ? p2.name : 'Equal'}</span>
            </td>
            <td>
              <strong style="color:${p2Better ? 'var(--success)' : 'var(--text-primary)'};">${sh.p2.winRate}% WR</strong>
              <span style="color:var(--text-muted); font-size:0.75rem;">(${sh.p2.timesUsed}G, ${sh.p2.kdaRatio} KDA)</span>
            </td>
          </tr>
        `;
      });
    }

    container.innerHTML = `
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(var(--primary-rgb),0.03) 0%, var(--bg-card-glass) 100%);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
          <div>
            <h3 class="card-title" style="margin:0;"><i class="fa-solid fa-bolt" style="color:var(--secondary);"></i> 1v1 Teammate Rivalry & Comparison</h3>
            <p style="color:var(--text-muted); margin:0.25rem 0 0 0; font-size:0.875rem;">Compare performance metrics, playstyles, and shared hero proficiencies between any two teammates.</p>
          </div>
          <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
            <select id="compare-p1-select" class="form-select" style="min-width:160px; border-color:var(--primary); font-weight:700; color:var(--primary);">
              ${players.map(p => {
                const label = p.name.toLowerCase().includes('heavenlyyy') ? `👑 ${p.name} (IGL & Captain)` : `🔵 ${p.name}`;
                return `<option value="${p.id}" ${p.id === this.selectedP1 ? 'selected' : ''}>${label}</option>`;
              }).join('')}
            </select>
            <div class="vs-badge">VS</div>
            <select id="compare-p2-select" class="form-select" style="min-width:160px; border-color:#a855f7; font-weight:700; color:#a855f7;">
              ${players.map(p => {
                const label = p.name.toLowerCase().includes('heavenlyyy') ? `👑 ${p.name} (IGL & Captain)` : `🟣 ${p.name}`;
                return `<option value="${p.id}" ${p.id === this.selectedP2 ? 'selected' : ''}>${label}</option>`;
              }).join('')}
            </select>
          </div>
        </div>

        <!-- 1v1 HEADERS -->
        <div style="display:grid; grid-template-columns: 1fr auto 1fr; gap:1rem; align-items:center; margin-bottom:1.5rem;">
          <div class="compare-card-p1">
            <div class="player-avatar" style="margin:0 auto 0.75rem auto; width:64px; height:64px; font-size:1.5rem; border-color:var(--primary); color:var(--primary);">
              ${p1.name.substring(0, 2).toUpperCase()}
            </div>
            <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0;">${p1.name}</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:0.25rem 0 0.5rem 0;">Primary: <strong style="color:var(--primary);">${comp.p1Roles.primaryRole}</strong></p>
            <div class="badge" style="background:rgba(var(--primary-rgb),0.15); color:var(--primary);">
              ${comp.p1WinsCount} Categories Won
            </div>
          </div>

          <div style="text-align:center;">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">H2H VERDICT</div>
            <div style="font-size:1.25rem; font-weight:900; color:${comp.overallWinner === 'p1' ? 'var(--primary)' : comp.overallWinner === 'p2' ? '#a855f7' : 'var(--secondary)'}; margin-top:4px;">
              ${comp.overallWinner === 'p1' ? `👑 ${p1.name} LEADS` : comp.overallWinner === 'p2' ? `👑 ${p2.name} LEADS` : '⚖️ PERFECT TIE'}
            </div>
          </div>

          <div class="compare-card-p2">
            <div class="player-avatar" style="margin:0 auto 0.75rem auto; width:64px; height:64px; font-size:1.5rem; border-color:#a855f7; color:#a855f7;">
              ${p2.name.substring(0, 2).toUpperCase()}
            </div>
            <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0;">${p2.name}</h3>
            <p style="color:var(--text-muted); font-size:0.8rem; margin:0.25rem 0 0.5rem 0;">Primary: <strong style="color:#a855f7;">${comp.p2Roles.primaryRole}</strong></p>
            <div class="badge" style="background:rgba(168,85,247,0.15); color:#a855f7;">
              ${comp.p2WinsCount} Categories Won
            </div>
          </div>
        </div>

        <!-- STAT BARS MATRIX -->
        <div style="margin-bottom:1.5rem;">
          ${metricRowsHtml}
        </div>

        <!-- SHARED HERO POOL DUEL -->
        <div class="card" style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light);">
          <h4 style="font-size:1.1rem; color:var(--secondary); margin-bottom:0.75rem;"><i class="fa-solid fa-shield-cat"></i> Shared Hero Pool Head-to-Head</h4>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Hero</th>
                  <th>${p1.name}'s Record</th>
                  <th class="text-center">Superior Pilot</th>
                  <th>${p2.name}'s Record</th>
                </tr>
              </thead>
              <tbody>
                ${sharedHeroesHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('compare-p1-select')?.addEventListener('change', (e) => {
      this.selectedP1 = e.target.value;
      this.renderComparisonTool(containerId);
    });

    document.getElementById('compare-p2-select')?.addEventListener('change', (e) => {
      this.selectedP2 = e.target.value;
      this.renderComparisonTool(containerId);
    });
  }

  // =========================================================================
  //  DUO & TRIO SYNERGY MATRIX
  // =========================================================================

  renderSynergyMatrix(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = this.db.getAllPlayers?.() || this.db.getPlayers();
    const matches = this.db.getMatches();

    const synergy = this.statsEngine.getSynergyStats(matches, players);

    if (synergy.duos.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem;">
          <h3 style="color:var(--text-muted);"><i class="fa-solid fa-handshake-slash"></i> No Synergy Data Yet</h3>
          <p style="color:var(--text-secondary);">Log more matches with your team roster to discover the highest winrate player pairings and trio cores!</p>
        </div>
      `;
      return;
    }

    let duosTableRows = '';
    synergy.duos.forEach((d, idx) => {
      const isTop = idx === 0 && d.matchesTogether >= 2;
      duosTableRows += `
        <tr style="${isTop ? 'background:rgba(var(--secondary-rgb),0.04); font-weight:600;' : ''}">
          <td><strong>#${idx + 1}</strong></td>
          <td>
            <strong>${d.player1.name}</strong> + <strong>${d.player2.name}</strong>
            ${isTop ? ' <span class="badge" style="background:var(--secondary); color:#000; font-size:0.65rem;">👑 #1 DUO</span>' : ''}
          </td>
          <td><span class="badge" style="background:rgba(var(--primary-rgb),0.1); color:var(--primary); font-size:0.75rem;">${d.comboLabel}</span></td>
          <td><strong>${d.matchesTogether}</strong> (${d.wins}W - ${d.losses}L)</td>
          <td><strong style="color:${d.winRateNum >= 75 ? 'var(--secondary)' : d.winRateNum >= 50 ? 'var(--success)' : 'var(--danger)'}; font-size:1.05rem;">${d.winRate}%</strong></td>
          <td><strong style="color:var(--primary);">${d.combinedKda}</strong></td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(var(--secondary-rgb),0.03) 0%, var(--bg-card-glass) 100%);">
        <div style="margin-bottom:1.5rem;">
          <span class="badge" style="background:linear-gradient(135deg, var(--secondary) 0%, var(--primary) 100%); color:#000; font-weight:800;">
            <i class="fa-solid fa-sparkles"></i> TEAM CHEMISTRY & WINNING COMBOS
          </span>
          <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">
            <i class="fa-solid fa-handshake-angle" style="color:var(--secondary);"></i> Duo & Trio Synergy Matrix
          </h3>
          <p style="color:var(--text-secondary); margin:0; font-size:0.875rem;">
            Discover which teammate pairings have the highest tactical win rate, combined KDA, and map dominance when deployed together.
          </p>
        </div>

        <!-- HIGHLIGHT CARDS -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
          ${synergy.topDuo ? `
            <div class="synergy-card gold-synergy">
              <span class="badge" style="background:var(--secondary); color:#000; font-weight:bold;"><i class="fa-solid fa-crown"></i> #1 DEADLIEST DUO</span>
              <h3 style="font-size:1.4rem; color:var(--secondary); margin:0.5rem 0 0.25rem 0;">${synergy.topDuo.player1.name} & ${synergy.topDuo.player2.name}</h3>
              <p style="color:var(--text-muted); font-size:0.8rem; margin:0 0 0.75rem 0;">${synergy.topDuo.comboLabel}</p>
              <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:0.6rem 1rem; border-radius:8px;">
                <div>Win Rate<br><strong style="color:var(--secondary); font-size:1.15rem;">${synergy.topDuo.winRate}%</strong></div>
                <div>Matches<br><strong>${synergy.topDuo.matchesTogether}</strong></div>
                <div>Duo KDA<br><strong style="color:var(--primary); font-size:1.15rem;">${synergy.topDuo.combinedKda}</strong></div>
              </div>
            </div>
          ` : ''}

          ${synergy.topTrio ? `
            <div class="synergy-card cyan-synergy">
              <span class="badge" style="background:var(--primary); color:#000; font-weight:bold;"><i class="fa-solid fa-triangle"></i> BEST TRIO CORE</span>
              <h3 style="font-size:1.4rem; color:var(--primary); margin:0.5rem 0 0.25rem 0;">${synergy.topTrio.players.map(p => p.name).join(' + ')}</h3>
              <p style="color:var(--text-muted); font-size:0.8rem; margin:0 0 0.75rem 0;">3-Player Winning Anchor</p>
              <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:0.6rem 1rem; border-radius:8px;">
                <div>Trio Win Rate<br><strong style="color:var(--success); font-size:1.15rem;">${synergy.topTrio.winRate}%</strong></div>
                <div>Matches Together<br><strong>${synergy.topTrio.matchesTogether}</strong></div>
              </div>
            </div>
          ` : ''}

          ${synergy.mostPlayedDuo ? `
            <div class="synergy-card">
              <span class="badge" style="background:rgba(255,255,255,0.1); color:var(--text-primary); font-weight:bold;"><i class="fa-solid fa-shield"></i> MOST BATTLE-TESTED DUO</span>
              <h3 style="font-size:1.4rem; color:var(--text-primary); margin:0.5rem 0 0.25rem 0;">${synergy.mostPlayedDuo.player1.name} & ${synergy.mostPlayedDuo.player2.name}</h3>
              <p style="color:var(--text-muted); font-size:0.8rem; margin:0 0 0.75rem 0;">${synergy.mostPlayedDuo.comboLabel}</p>
              <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:0.6rem 1rem; border-radius:8px;">
                <div>Matches<br><strong style="color:var(--primary); font-size:1.15rem;">${synergy.mostPlayedDuo.matchesTogether} Games</strong></div>
                <div>Win Rate<br><strong style="color:var(--secondary); font-size:1.15rem;">${synergy.mostPlayedDuo.winRate}%</strong></div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- DUOS RANKING TABLE -->
        <h4 style="font-size:1.1rem; color:var(--text-primary); margin-bottom:0.75rem;"><i class="fa-solid fa-list-ol"></i> All Teammate Pairwise Synergy Rankings</h4>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Teammate Pairing</th>
                <th>Tactical Combo</th>
                <th>Matches (W-L)</th>
                <th>Combined Win Rate</th>
                <th>Duo KDA</th>
              </tr>
            </thead>
            <tbody>
              ${duosTableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderPlayerProfile(containerId, playerId, matches) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const players = this.db.getAllPlayers?.() || this.db.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const stats = this.statsEngine.getPlayerStats(matches, playerId);
    const roleBreakdown = this.statsEngine.getPlayerRoleBreakdown(matches, playerId);
    const heroAnalytics = this.statsEngine.getPlayerHeroAnalytics(matches, playerId);
    const playerName = String(player.name || 'Nomsiz o‘yinchi');
    const safePlayerName = this.escapeHtml(playerName);
    const safePlayerInitials = this.escapeHtml(playerName.substring(0, 2).toUpperCase());
    const trend = this.statsEngine.getPlayerTrends(matches, players, 'month', { scope: 'all' }).find(item => item.player.id === playerId);
    const trendMeta = this.getTrendMeta(trend);
    const trendDiff = trend?.comparisonAvailable && trend.diff !== null
      ? `${trend.diff > 0 ? '+' : ''}${trend.diff.toFixed(2)}`
      : '—';
    const signatureHero = this.escapeHtml(heroAnalytics.mostPicked?.heroName || 'Ma’lumot kutilmoqda');
    const recentForm = this.getPlayerRecentForm(matches, playerId, 5);
    const recentFormHtml = this.renderRecentFormHtml(recentForm);
    const fmt = window.StatsEngine.formatLargeNumber;
    const full = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('uz-UZ');
    const metricOrDash = value => value === null || value === undefined || !Number.isFinite(Number(value))
      ? '—'
      : this.escapeHtml(value);
    const winRateText = metricOrDash(stats.winRate) === '—' ? '—' : `${metricOrDash(stats.winRate)}%`;
    const kdaText = metricOrDash(stats.kdaRatio);
    const eclipseIndexText = stats.performanceScore === null || stats.performanceScore === undefined || !Number.isFinite(Number(stats.performanceScore))
      ? '—'
      : Number(stats.performanceScore).toFixed(2);
    const bestRoleLabel = this.escapeHtml(!roleBreakdown.bestRole || roleBreakdown.bestRole === 'Unknown' ? 'Ma’lumot yo‘q' : roleBreakdown.bestRole);
    const assignedRole = player.primaryRole || 'Belgilanmagan';
    const primaryRoleLabel = this.escapeHtml(assignedRole);

    const bestRoleColor = window.StatsEngine.ROLE_COLORS[roleBreakdown.bestRole] || 'var(--secondary)';
    const bestRoleIcon = window.StatsEngine.ROLE_ICONS[roleBreakdown.bestRole] || 'fa-shield';
    const primaryRoleColor = window.StatsEngine.ROLE_COLORS[assignedRole] || 'var(--primary)';
    const primaryRoleIcon = window.StatsEngine.ROLE_ICONS[assignedRole] || 'fa-gamepad';

    // Build Shiny Hero Analytics Cards
    let heroCardsHtml = '';
    if (heroAnalytics.heroes.length === 0) {
      heroCardsHtml = `<div class="empty-state" style="grid-column: 1 / -1;"><p>Bu o‘yinchi uchun hali hero statistikasi yo‘q.</p></div>`;
    } else {
      heroAnalytics.heroes.forEach(h => {
        const tierClass = h.masteryTier === 'S+' ? 'tier-splus' : h.masteryTier === 'S' ? 'tier-s' : '';
        const tagClass = h.masteryTier === 'S+' ? 'mastery-tag-splus' :
                         h.masteryTier === 'S' ? 'mastery-tag-s' :
                         h.masteryTier === 'A' ? 'mastery-tag-a' :
                         h.masteryTier === 'B' ? 'mastery-tag-b' : 'mastery-tag-c';

        const hasWinRate = h.winRateNum !== null && h.winRateNum !== undefined && Number.isFinite(Number(h.winRateNum));
        const hasUseRate = h.useRateNum !== null && h.useRateNum !== undefined && Number.isFinite(Number(h.useRateNum));
        const winRateValue = hasWinRate ? Math.max(0, Math.min(Number(h.winRateNum), 100)) : 0;
        const useRateValue = hasUseRate ? Math.max(0, Math.min(Number(h.useRateNum), 100)) : 0;
        const winRateFillClass = !hasWinRate ? '' : h.winRateNum >= 75 ? 'fill-winrate-god' :
                                 h.winRateNum >= 50 ? 'fill-winrate-high' :
                                 h.winRateNum >= 35 ? 'fill-winrate-med' : 'fill-winrate-low';
        const winRateColor = !hasWinRate ? 'var(--text-muted)' : h.winRateNum >= 50 ? 'var(--success)' : 'var(--danger)';
        const heroWinRateText = hasWinRate ? `${this.escapeHtml(h.winRate ?? Number(h.winRateNum).toFixed(1))}%` : '—';
        const heroUseRateText = hasUseRate ? `${this.escapeHtml(h.useRate ?? Number(h.useRateNum).toFixed(1))}%` : '—';
        const safeHeroName = this.escapeHtml(h.heroName || 'Noma’lum hero');
        const safeMasteryLabel = this.escapeHtml(h.masteryLabel || 'SAMPLE KUTILMOQDA');

        heroCardsHtml += `
          <div class="shiny-hero-card ${tierClass}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                <div>
                  <h4 style="font-size:1.35rem; font-weight:800; color:var(--text-primary); margin:0;">${safeHeroName}</h4>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    ${metricOrDash(h.timesUsed)} match (${metricOrDash(h.wins)}W – ${metricOrDash(h.losses)}L)
                  </div>
                </div>
                <span class="mastery-tag ${tagClass}">
                  ${safeMasteryLabel}
                </span>
              </div>

              <!-- Visual Win Rate & Use Rate Meters -->
              <div class="rate-meter-group">
                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-trophy" style="color:var(--secondary);"></i> Win Rate</span>
                    <strong style="color:${winRateColor};">${heroWinRateText}</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill ${winRateFillClass}" style="width: ${winRateValue}%;"></div>
                  </div>
                </div>

                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> Pick rate</span>
                    <strong style="color:${hasUseRate ? 'var(--primary)' : 'var(--text-muted)'};">${heroUseRateText}</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill ${hasUseRate ? 'fill-userate' : ''}" style="width: ${useRateValue}%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div class="shiny-stat-chips">
                <div>KDA<strong>${metricOrDash(h.kdaRatio)}</strong></div>
                <div>O‘rt. baho<strong>${metricOrDash(h.avgScore)}</strong></div>
                <div>O‘rt. Damage<strong>${fmt(h.avgDamageDealt)}</strong></div>
              </div>

              ${h.mvpCount > 0 || h.savageCount > 0 || h.maniacCount > 0 ? `
                <div style="display:flex; gap:0.4rem; justify-content:center; align-items:center; margin-top:0.6rem; font-size:0.75rem;">
                  ${h.mvpCount > 0 ? `<span class="medal medal-mvp" style="font-size:0.7rem; padding:2px 6px;">${h.mvpCount} MVP</span>` : ''}
                  ${h.savageCount > 0 ? `<span style="color:var(--secondary); font-weight:bold;"><i class="fa-solid fa-fire"></i> ${h.savageCount} Savage</span>` : ''}
                  ${h.maniacCount > 0 ? `<span style="color:var(--primary); font-weight:bold;"><i class="fa-solid fa-bolt"></i> ${h.maniacCount} Maniac</span>` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });
    }

    // Build Role Breakdown Rows
    let roleBreakdownRows = '';
    roleBreakdown.roles.forEach(r => {
      const rColor = window.StatsEngine.ROLE_COLORS[r.role] || 'var(--primary)';
      const rIcon = window.StatsEngine.ROLE_ICONS[r.role] || 'fa-shield';
      const isPrimary = r.role === roleBreakdown.primaryRole && r.matchesPlayed > 0;
      const safeRole = this.escapeHtml(r.role || 'Rol aniqlanmagan');
      const hasRoleMatches = Number(r.matchesPlayed) > 0;
      const hasRoleWinRate = hasRoleMatches && r.winRate !== null && r.winRate !== undefined && Number.isFinite(Number(r.winRate));
      const roleWinRateText = hasRoleWinRate ? `${this.escapeHtml(r.winRate)}%` : '—';
      const roleWinRateColor = !hasRoleWinRate ? 'var(--text-muted)' : Number(r.winRate) >= 50 ? 'var(--success)' : 'var(--danger)';
      const roleKdaText = hasRoleMatches ? metricOrDash(r.kdaRatio) : '—';
      const roleScoreText = hasRoleMatches ? metricOrDash(r.avgInGameScore) : '—';
      const favoriteHero = hasRoleMatches && r.favoriteHero
        && !['None', 'Ma’lumot yo‘q'].includes(r.favoriteHero)
        ? this.escapeHtml(r.favoriteHero)
        : '—';
      const performanceScore = r.performanceScore === null || r.performanceScore === undefined || !Number.isFinite(Number(r.performanceScore))
        ? '—'
        : Number(r.performanceScore).toFixed(2);
      const roleMatchCount = metricOrDash(r.matchesPlayed);
      const roleWins = metricOrDash(r.wins);
      const roleLosses = metricOrDash(r.losses);

      let badgeAddon = '';
      if (isPrimary) badgeAddon += ` <span class="badge" style="background:rgba(var(--primary-rgb),0.2); color:var(--primary); font-size:0.65rem;">KO‘P O‘YNALGAN</span>`;

      roleBreakdownRows += `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid ${rColor}; color:${rColor};"><i class="fa-solid ${rIcon}"></i> ${safeRole}</span>
              ${badgeAddon}
            </div>
          </td>
          <td><strong>${roleMatchCount}</strong> (${roleWins}W – ${roleLosses}L)</td>
          <td><strong style="color:${roleWinRateColor};">${roleWinRateText}</strong></td>
          <td><strong style="color:${roleKdaText === '—' ? 'var(--text-muted)' : 'var(--primary)'};">${roleKdaText}</strong></td>
          <td>${roleScoreText}</td>
          <td>${hasRoleMatches ? fmt(r.avgDamageDealt) : '—'}</td>
          <td>${hasRoleMatches ? fmt(r.avgTurretDamage) : '—'}</td>
          <td>${favoriteHero === '—' ? '—' : `<span class="badge" style="background:rgba(255,255,255,0.05);">${favoriteHero}</span>`}</td>
          <td><strong style="color:${performanceScore === '—' ? 'var(--text-muted)' : 'var(--text-primary)'};">${performanceScore}</strong></td>
        </tr>
      `;
    });

    const isHeavenlyyy = player.captain === true;
    const titleBadge = isHeavenlyyy ? `
      <span class="profile-command-badge">
        <i class="fa-solid fa-crown"></i> CAPTAIN
      </span>
    ` : '';

    const radarMetrics = this.getPlayerRadarMetrics(stats);
    const radarSvgHtml = this.renderPlayerRadarSvg(radarMetrics, safePlayerName);

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;">
        <button class="profile-back back-to-players"><i class="fa-solid fa-arrow-left"></i> Tarkibga qaytish</button>
        <button type="button" class="btn btn-secondary share-player-card-btn" id="sharePlayerCardBtn" style="display:inline-flex; align-items:center; gap:0.5rem; border-color:rgba(212,175,55,0.4);">
          <i class="fa-solid fa-share-nodes" style="color:var(--primary);"></i> <span>Karta yuklab olish (PNG)</span>
        </button>
      </div>

      <section class="player-profile-hero ${isHeavenlyyy ? 'player-profile-hero--captain' : ''}" aria-label="${safePlayerName} o‘yinchi profili">
        <div class="player-profile-hero__identity">
          <div class="player-profile-orbit ${isHeavenlyyy ? 'is-captain' : ''}" aria-hidden="true">
            <span>${safePlayerInitials}</span>
          </div>
          <div class="player-profile-hero__copy">
            <div class="player-profile-hero__topline">
              <span class="player-kicker">ECL // PLAYER PROFILE</span>
              <span class="player-form-status ${trendMeta.className}"><i class="fa-solid ${trendMeta.icon}"></i> ${trendMeta.label}</span>
            </div>
            <div class="player-profile-hero__name-row">
              <h2>${safePlayerName}</h2>
              ${titleBadge}
            </div>
            <div class="roster-player-tags">${player.primaryRole ? `<span>Asosiy layn: ${this.escapeHtml(player.primaryRole)}</span>` : ''}${(player.tags || []).map(tag => `<span>${this.escapeHtml(tag)}</span>`).join('')}</div>
            ${(player.heroPool || []).length ? `<div class="roster-hero-pool" aria-label="Captain belgilagan hero pool">${Object.entries({ comfort: 'Ishonchli', backup: 'Zaxira', learning: 'O‘rganilyapti' }).map(([state, label]) => `<p><strong>${label}:</strong> ${player.heroPool.filter(hero => hero.status === state).map(hero => this.escapeHtml(hero.heroName)).join(', ') || '—'}</p>`).join('')}<small>Captain tanlovi — avtomatik reyting emas.</small></div>` : ''}
            <p>${isHeavenlyyy ? 'Jamoani boshqaruvchi strategik markaz.' : 'Eclipse tarkibidagi individual kuch profili.'} ${heroAnalytics.uniqueHeroesCount} ta hero bilan ${stats.matchesPlayed} ta match qayd etilgan.</p>
            <div class="player-profile-roles">
              <div style="--profile-role-color:${bestRoleColor};">
                <span><i class="fa-solid fa-compass"></i> Eng ko‘p o‘ynalgan rol</span>
                <strong><i class="fa-solid ${bestRoleIcon}"></i> ${bestRoleLabel}</strong>
              </div>
              <div style="--profile-role-color:${primaryRoleColor};">
                <span><i class="fa-solid fa-gamepad"></i> Belgilangan rol</span>
                <strong><i class="fa-solid ${primaryRoleIcon}"></i> ${primaryRoleLabel}</strong>
              </div>
            </div>
          </div>
        </div>

        <aside class="player-profile-hero__panel">
          <div class="player-profile-signature">
            <span>Eng ko‘p o‘ynalgan hero</span>
            <strong>${signatureHero}</strong>
          </div>
          <dl class="player-profile-metrics">
            <div><dt>Win rate</dt><dd>${winRateText}</dd></div>
            <div><dt>KDA</dt><dd>${kdaText}</dd></div>
            <div><dt>MVP</dt><dd>${stats.mvpCount}</dd></div>
            <div><dt>O‘rtacha o‘yin bahosi</dt><dd>${metricOrDash(stats.avgInGameScore)}</dd></div>
          </dl>
          ${recentFormHtml}
          <div class="player-profile-form ${trendMeta.className}">
            <span>30 kunlik shaxsiy forma</span>
            <strong>${trendDiff}</strong>
          </div>
          <details class="experimental-index"><summary>Eclipse Index · tajriba</summary>
            <p>Bir xil rol va sharoitdagi yetarli kuzatuv bo‘lsa hisoblanadi. Bu jamoa ichidagi kuch reytingi emas.</p>
            <strong>${eclipseIndexText}</strong>
          </details>
        </aside>
      </section>

      <!-- 6-AXIS RADAR PLAYSTYLE CHART -->
      ${radarSvgHtml}

      <!-- SHINY HERO POOL & WIN RATE / USE RATE SHOWCASE -->
      <div data-player-coach></div>
      <div class="shiny-container mb-4">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
          <div>
            <span class="badge" style="background:linear-gradient(135deg, var(--secondary) 0%, #ff8800 100%); color:#000; font-weight:800;">
              <i class="fa-solid fa-sparkles"></i> HERO BO‘YICHA KUZATUVLAR
            </span>
            <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">
              <i class="fa-solid fa-shield-cat" style="color:var(--primary);"></i> ${safePlayerName} — hero statistikasi
            </h3>
            <p style="color:var(--text-secondary); margin:0; font-size:0.85rem;">
              Har bir hero bo‘yicha W/L, pick rate, KDA va mavjud sample ko‘rsatiladi.
            </p>
          </div>
        </div>

        <div class="hero-analytics-grid">
          ${heroCardsHtml}
        </div>
      </div>

      <!-- ROLE PERFORMANCE BREAKDOWN -->
      <div class="card mb-4" style="border: 1px solid rgba(var(--primary-rgb), 0.3);">
        <h3 class="card-title mb-2"><i class="fa-solid fa-compass" style="color:var(--primary);"></i> Lane va rol kesimi</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem;">
          <strong>${safePlayerName}</strong>ning turli rollardagi tasdiqlangan match natijalari.
        </p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Rol / Lane</th>
                <th>Match (W–L)</th>
                <th>Win Rate</th>
                <th>KDA</th>
                <th>O‘rt. baho</th>
                <th>O‘rt. Damage</th>
                <th>O‘rt. Turret Damage</th>
                <th>Top hero</th>
                <th>Eclipse Index</th>
              </tr>
            </thead>
            <tbody>
              ${roleBreakdownRows}
            </tbody>
          </table>
        </div>
      </div>

      <div class="stats-grid mb-4">
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-fire"></i> Barcha vaqt Damage</div>
          <div class="stat-card-value" style="color:var(--secondary);" title="${full(stats.totalDamageDealt)}">${fmt(stats.totalDamageDealt)}</div>
          <div class="stat-card-desc">Har matchda: ${full(stats.avgDamageDealt)}</div>
        </div>
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-shield-cat"></i> Barcha vaqt KDA</div>
          <div class="stat-card-value">${kdaText}</div>
          <div class="stat-card-desc">Jami: ${full(stats.totalKills)} K / ${full(stats.totalDeaths)} D / ${full(stats.totalAssists)} A</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-coins"></i> Barcha vaqt Gold</div>
          <div class="stat-card-value" style="color:var(--warning);" title="${full(stats.totalGoldEarned)}">${fmt(stats.totalGoldEarned)}</div>
          <div class="stat-card-desc">Har matchda: ${full(stats.avgGoldEarned)}</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-award"></i> Barcha vaqt medallar</div>
          <div class="stat-card-value" style="font-size:1.5rem; display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;">
            <span class="medal medal-mvp" title="${stats.mvpCount} MVPs">${stats.mvpCount}</span>
            <span class="medal medal-supreme" title="${stats.supremeCount || 0} Supreme (Supreme MVP ham kiradi)">${stats.supremeCount || 0}</span>
            <span class="medal medal-gold" title="${stats.goldCount} Gold">${stats.goldCount}</span>
            <span class="medal medal-silver" title="${stats.silverCount} Silver">${stats.silverCount}</span>
            <span class="medal medal-choco" title="${stats.bronzeCount} Bronze">${stats.bronzeCount}</span>
          </div>
          <div class="stat-card-desc">${stats.savageCount} Savages | ${stats.maniacCount} Maniacs</div>
        </div>
      </div>

      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-chart-bar"></i> Jami va har matchdagi o‘rtacha</h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Ko‘rsatkich</th>
                <th>Jami</th>
                <th>Har matchda</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Damage</td><td><strong style="color:var(--secondary);" title="${full(stats.totalDamageDealt)}">${fmt(stats.totalDamageDealt)}</strong></td><td>${full(stats.avgDamageDealt)}</td></tr>
              <tr><td>Qabul qilingan Damage</td><td><strong style="color:var(--primary);" title="${full(stats.totalDamageReceived)}">${fmt(stats.totalDamageReceived)}</strong></td><td>${full(stats.avgDamageReceived)}</td></tr>
              <tr><td>Turret Damage</td><td><strong style="color:var(--success);" title="${full(stats.totalTurretDamage)}">${fmt(stats.totalTurretDamage)}</strong></td><td>${full(stats.avgTurretDamage)}</td></tr>
              <tr><td>Gold</td><td><strong style="color:var(--warning);" title="${full(stats.totalGoldEarned)}">${fmt(stats.totalGoldEarned)}</strong></td><td>${full(stats.avgGoldEarned)}</td></tr>
              <tr><td>Kill / Death / Assist</td><td><strong>${full(stats.totalKills)} / ${full(stats.totalDeaths)} / ${full(stats.totalAssists)}</strong></td><td>${stats.avgKills ?? '—'} / ${stats.avgDeaths ?? '—'} / ${stats.avgAssists ?? '—'}</td></tr>
              <tr><td>In-game ball</td><td>Match: <strong>${stats.matchesPlayed}</strong></td><td>O‘rtacha: <strong>${stats.avgInGameScore ?? '—'}</strong></td></tr>
              <tr><td>Teamfight qatnashuvi</td><td>Savage: <strong>${stats.savageCount}</strong> · Maniac: <strong>${stats.maniacCount}</strong></td><td>O‘rtacha TF: <strong>${stats.avgTeamfightParticipation === null ? '—' : `${stats.avgTeamfightParticipation}%`}</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector('.back-to-players')?.addEventListener('click', () => {
      window.EclipseApp.navigate('players');
    });

    container.querySelector('#sharePlayerCardBtn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tayyorlanmoqda...';
      try {
        if (window.EclipseShareCard?.downloadPlayerCard) {
          const recent = (recentForm || []).slice(0, 5).map(r => r.isWin ? 'win' : 'loss');
          await window.EclipseShareCard.downloadPlayerCard({
            name: player.name,
            role: primaryRoleLabel || player.primaryRole || 'Operative',
            winRate: winRateText,
            matchesCount: stats.matchesPlayed,
            kda: kdaText,
            mvpCount: stats.mvpCount,
            streakCount: stats.winStreak || 0,
            recentResults: recent,
            topHero: signatureHero !== '—' && signatureHero !== 'Ma’lumot kutilmoqda' ? signatureHero : 'MLBB Hero'
          });
          window.eclipseAudio?.playSuccess?.();
        }
      } catch (err) {
        console.error('Share card generation error:', err);
        window.showToast?.('Karta yaratishda xatolik yuz berdi.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });

    window.EclipseCoach?.render(container.querySelector('[data-player-coach]'), window.EclipseApp, { playerId });
  }

  showEditModal(playerId) {
    if (window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
      window.EclipseApp.authManager.showLoginModal();
      return;
    }
    const players = this.db.getAllPlayers?.() || this.db.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    document.getElementById('rosterProfileDialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'rosterProfileDialog'; dialog.className = 'roster-profile-dialog';
    dialog.setAttribute('aria-labelledby', 'rosterEditTitle');
    const roles = ['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'];
    dialog.innerHTML = `<form><h3 id="rosterEditTitle">O‘yinchi profili</h3>
      <label>IGN<input class="form-input" name="name" maxlength="80" required value="${this.escapeHtml(player.name)}"></label>
      <label>Asosiy layn<select class="form-select" name="primaryRole"><option value="">Belgilanmagan</option>${roles.map(role => `<option ${player.primaryRole === role ? 'selected' : ''}>${role}</option>`).join('')}</select></label>
      <label>Ikkinchi layn<select class="form-select" name="secondaryRole"><option value="">Belgilanmagan</option>${roles.map(role => `<option ${player.secondaryRole === role ? 'selected' : ''}>${role}</option>`).join('')}</select></label>
      <label><input type="checkbox" name="captain" ${player.captain ? 'checked' : ''}> Captain belgisi (admin huquqini bermaydi)</label>
      <label>Teglar<input class="form-input" name="tags" maxlength="128" value="${this.escapeHtml((player.tags || []).join(', '))}" placeholder="Masalan: Shotcaller, Flex, Initiator"></label>
      <p>Vergul bilan ajrating: ko‘pi bilan 5 ta teg, har biri 24 belgigacha. Layn matchlardagi tarixiy rollarni o‘zgartirmaydi.</p>
      <fieldset><legend>Hero pool · Captain tanlovi</legend>${Object.entries({ comfort: 'Ishonchli', backup: 'Zaxira', learning: 'O‘rganilyapti' }).map(([state, label]) => `<label>${label}<input class="form-input" name="pool_${state}" maxlength="1700" value="${this.escapeHtml((player.heroPool || []).filter(hero => hero.status === state).map(hero => hero.heroName).join(', '))}" placeholder="Miya, Layla"></label>`).join('')}<small>Katalogdagi nomlarni vergul bilan ajrating. Jami 20 tagacha; bir hero faqat bitta holatda.</small></fieldset>
      <p role="status" data-roster-status></p><div class="roster-edit-actions"><button type="button" class="btn btn-secondary" data-cancel>Bekor qilish</button><button class="btn btn-primary" type="submit">Saqlash</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      if (!window.EclipseApp.authManager?.isAdmin()) { dialog.close(); return; }
      const form = event.currentTarget, status = dialog.querySelector('[data-roster-status]');
      const name = form.elements.name.value.trim();
      const tags = form.elements.tags.value.split(',').map(tag => tag.trim()).filter(Boolean);
      if (!name || tags.length > 5 || tags.some(tag => tag.length > 24)) { status.textContent = 'Ism va teglar chegarasini tekshiring.'; return; }
      const heroPool = [], poolIds = new Set();
      const catalog = window.EclipseApp.heroDb?.getAll?.() || [];
      for (const state of ['comfort', 'backup', 'learning']) {
        for (const raw of form.elements[`pool_${state}`].value.split(',').map(value => value.trim()).filter(Boolean)) {
          const hero = catalog.find(item => item.name.toLocaleLowerCase('en-US') === raw.toLocaleLowerCase('en-US')) || (player.heroPool || []).find(item => item.heroName.toLocaleLowerCase('en-US') === raw.toLocaleLowerCase('en-US'));
          const id = Number(hero?.id || hero?.heroId);
          if (!Number.isSafeInteger(id) || id < 1 || poolIds.has(id) || heroPool.length >= 20) { status.textContent = `Hero pool: “${raw}” katalogda yo‘q, takrorlangan yoki limit oshgan.`; return; }
          poolIds.add(id); heroPool.push({ heroId: id, heroName: hero.name || hero.heroName, status: state });
        }
      }
      const save = form.querySelector('[type="submit"]'); if (save.disabled) return; save.disabled = true;
      this.db.updatePlayer(playerId, { name, primaryRole: form.elements.primaryRole.value || null, secondaryRole: form.elements.secondaryRole.value || null, captain: form.elements.captain.checked, tags, heroPool });
      try {
        const cloud = window.EclipseApp.cloudSync;
        if (cloud?.isConfigured() && await cloud.syncUp() === false) throw new Error('Cloud sync failed');
        this.renderPlayersList('playersListContainer'); dialog.close();
        window.showToast?.('Asosiy layn va teglar saqlandi.', 'success');
      } catch (_) { status.textContent = 'Qurilmada saqlandi, serverga yuborilmadi. Ulanishni tekshirib qayta saqlang.'; }
      finally { save.disabled = false; }
    };
    dialog.showModal();
  }

  showDeleteConfirm(playerId) {
    if (window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
      window.EclipseApp.authManager.showLoginModal();
      return;
    }
    const players = this.db.getAllPlayers?.() || this.db.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    if (confirm(`${player.name} faol tarkibdan arxivga o‘tkazilsinmi? Match tarixi va statistikasi saqlanadi.`)) {
      this.db.archivePlayer?.(playerId);
      if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
        window.EclipseApp.cloudSync.syncUp();
      }
      this.renderPlayersList('playersListContainer');
      if (window.showToast) window.showToast('O‘yinchi arxivga o‘tkazildi.', 'warning');
    }
  }

  getPlayerRadarMetrics(stats) {
    if (!stats) {
      return {
        kda: { value: '0.00', score: 0, label: 'KDA Nisbati' },
        damage: { value: '0%', score: 0, label: 'Damage ulushi' },
        farm: { value: '0 GPM', score: 0, label: 'Farm / GPM' },
        push: { value: '0%', score: 0, label: 'Turret Push' },
        teamfight: { value: '0%', score: 0, label: 'Teamfight %' },
        survival: { value: '—', score: 50, label: 'Omon qolish' },
        playstyle: { title: 'Tahlil qilinmoqda', desc: 'Yetarli match mavjud emas' }
      };
    }

    const kda = Number(stats.kdaRatio) || 0;
    const normKda = Math.min(100, Math.max(0, Math.round((kda / 5.5) * 100)));

    const dmgShare = Number(stats.avgDamageShare) || 0;
    const normDmg = Math.min(100, Math.max(0, Math.round((dmgShare / 30.0) * 100)));

    const gpm = Number(stats.avgGoldPerMinute) || (Number(stats.avgGoldShare) ? Number(stats.avgGoldShare) * 25 : 0);
    const normFarm = Math.min(100, Math.max(0, Math.round((gpm / 800.0) * 100)));

    const pushShare = Number(stats.avgTurretDamageShare) || 0;
    const normPush = Math.min(100, Math.max(0, Math.round((pushShare / 30.0) * 100)));

    const tf = Number(stats.avgTeamfightParticipation) || 0;
    const normTf = Math.min(100, Math.max(0, Math.round((tf / 75.0) * 100)));

    const deaths = Number(stats.avgDeaths);
    const normSurv = Number.isFinite(deaths) ? Math.max(15, Math.min(100, Math.round(100 - (deaths * 14)))) : 50;

    let playstyleTitle = 'Universal Jangchi';
    let playstyleDesc = 'Barcha parametrlar bo‘yicha muvozanatli va universal yondashuv.';

    if (normDmg >= 70 && normKda >= 65) {
      playstyleTitle = 'Bosh Hujumchi (Hyper Carry)';
      playstyleDesc = 'Yuqori zarba ulushi va dushmanlarni yo‘q qilishga qaratilgan tajovuzkor uslub.';
    } else if (normPush >= 70) {
      playstyleTitle = 'Layn Yoriqchi (Split Pusher)';
      playstyleDesc = 'Minoralarga bosim o‘tkazish va xaritani nazorat qilish ustasi.';
    } else if (normTf >= 70 && normSurv >= 65) {
      playstyleTitle = 'Jang Tashabbuskori (Vanguard)';
      playstyleDesc = 'Jamoaviy to‘qnashuvlarni boshlash va zarbalarni qabul qilish tayanchi.';
    } else if (normFarm >= 70) {
      playstyleTitle = 'Resurs Jamg‘aruvchi (Late Scaler)';
      playstyleDesc = 'Maksimal iqtisodiy ustunlik bilan o‘yinning so‘nggi daqiqalarini hal qiluvchi kuch.';
    } else if (normSurv >= 75) {
      playstyleTitle = 'Taktik Posbon (Anchor)';
      playstyleDesc = 'Kam o‘lish, xavfsiz pozitsiya va barqarorlikni ta’minlovchi o‘yinchi.';
    }

    return {
      kda: { value: stats.kdaRatio ? String(stats.kdaRatio) : '—', score: normKda, label: 'KDA Nisbati' },
      damage: { value: stats.avgDamageShare !== null ? `${stats.avgDamageShare}%` : '—', score: normDmg, label: 'Damage Ulushi' },
      farm: { value: stats.avgGoldPerMinute ? `${stats.avgGoldPerMinute} GPM` : (stats.avgGoldShare !== null ? `${stats.avgGoldShare}%` : '—'), score: normFarm, label: 'Farm (GPM)' },
      push: { value: stats.avgTurretDamageShare !== null ? `${stats.avgTurretDamageShare}%` : '—', score: normPush, label: 'Turret Push' },
      teamfight: { value: stats.avgTeamfightParticipation !== null ? `${stats.avgTeamfightParticipation}%` : '—', score: normTf, label: 'Teamfight %' },
      survival: { value: Number.isFinite(deaths) ? `${deaths} o‘rt. o‘lim` : '—', score: normSurv, label: 'Omon qolish' },
      playstyle: { title: playstyleTitle, desc: playstyleDesc }
    };
  }

  renderPlayerRadarSvg(metrics, playerName) {
    const cx = 150;
    const cy = 145;
    const R = 90;

    const axes = [
      { key: 'kda', label: 'KDA' },
      { key: 'damage', label: 'Damage %' },
      { key: 'farm', label: 'Farm GPM' },
      { key: 'push', label: 'Push %' },
      { key: 'teamfight', label: 'Teamfight' },
      { key: 'survival', label: 'Omon qolish' }
    ];

    const levels = [0.25, 0.5, 0.75, 1.0];
    const gridPolygons = levels.map(level => {
      const pts = axes.map((_, i) => {
        const angle = (-90 + i * 60) * (Math.PI / 180);
        const r = R * level;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      const stroke = level === 1.0 ? 'rgba(var(--primary-rgb), 0.35)' : 'rgba(255, 255, 255, 0.08)';
      return `<polygon points="${pts}" fill="none" stroke="${stroke}" stroke-width="1" />`;
    }).join('\n');

    const spokes = axes.map((_, i) => {
      const angle = (-90 + i * 60) * (Math.PI / 180);
      const x = cx + R * Math.cos(angle);
      const y = cy + R * Math.sin(angle);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" stroke-dasharray="2,2" />`;
    }).join('\n');

    const dataPoints = axes.map((ax, i) => {
      const angle = (-90 + i * 60) * (Math.PI / 180);
      const score = Math.max(12, Math.min(100, metrics[ax.key]?.score || 0));
      const r = (score / 100) * R;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return { x, y, score, label: ax.label, value: metrics[ax.key]?.value || '' };
    });

    const dataPointsStr = dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const verticesHtml = dataPoints.map(p => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--primary)" stroke="#0d0f14" stroke-width="2" />
    `).join('\n');

    const labelsHtml = axes.map((ax, i) => {
      const angle = (-90 + i * 60) * (Math.PI / 180);
      const lr = R + 22;
      const lx = cx + lr * Math.cos(angle);
      const ly = cy + lr * Math.sin(angle);
      const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : (Math.cos(angle) > 0 ? 'start' : 'end');
      return `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" fill="var(--text-secondary)" font-size="10.5" font-weight="700" text-anchor="${anchor}">${this.escapeHtml(ax.label)}</text>`;
    }).join('\n');

    return `
      <div class="player-radar-card">
        <div class="player-radar-header">
          <h3>
            <i class="fa-solid fa-hexagon-nodes" style="color:var(--primary);"></i>
            <span>6-O‘qli Taktik Radar & O‘yin Uslubi</span>
          </h3>
          <span class="radar-playstyle-banner">
            <i class="fa-solid fa-bolt"></i> ${this.escapeHtml(metrics.playstyle.title)}
          </span>
        </div>
        <div class="player-radar-layout">
          <div class="player-radar-svg-wrap">
            <svg class="player-radar-svg" viewBox="0 0 300 290" aria-label="${this.escapeHtml(playerName)} taktika radari">
              <defs>
                <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02" />
                </radialGradient>
              </defs>
              ${gridPolygons}
              ${spokes}
              <polygon points="${dataPointsStr}" fill="url(#radarGlow)" stroke="var(--primary)" stroke-width="2.5" />
              ${verticesHtml}
              ${labelsHtml}
            </svg>
          </div>
          <div class="radar-details">
            <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1rem; line-height:1.45;">
              ${this.escapeHtml(metrics.playstyle.desc)}
            </p>
            <div class="radar-metrics-list">
              <div class="radar-metric-item">
                <small>KDA Nisbati</small>
                <strong>${this.escapeHtml(metrics.kda.value)}</strong>
              </div>
              <div class="radar-metric-item">
                <small>Damage Ulushi</small>
                <strong>${this.escapeHtml(metrics.damage.value)}</strong>
              </div>
              <div class="radar-metric-item">
                <small>Farm / GPM</small>
                <strong>${this.escapeHtml(metrics.farm.value)}</strong>
              </div>
              <div class="radar-metric-item">
                <small>Turret Push</small>
                <strong>${this.escapeHtml(metrics.push.value)}</strong>
              </div>
              <div class="radar-metric-item">
                <small>Teamfight %</small>
                <strong>${this.escapeHtml(metrics.teamfight.value)}</strong>
              </div>
              <div class="radar-metric-item">
                <small>Omon Qolish</small>
                <strong>${this.escapeHtml(metrics.survival.value)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSynergyConstellation(containerId, matches) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const players = this.db.getAllPlayers?.() || this.db.getPlayers?.() || [];
    const starterPlayers = [...players]
      .sort((a, b) => (b.matchesCount || 0) - (a.matchesCount || 0))
      .slice(0, 5);

    if (starterPlayers.length < 3) {
      container.innerHTML = '';
      return;
    }

    const cx = 250;
    const cy = 200;
    const R = 135;
    const N = starterPlayers.length;

    const nodes = starterPlayers.map((player, i) => {
      const angle = (-90 + i * (360 / N)) * (Math.PI / 180);
      const x = cx + R * Math.cos(angle);
      const y = cy + R * Math.sin(angle);
      return {
        player,
        index: i,
        x,
        y,
        name: player.name || `P${i + 1}`,
        initials: (player.name || 'P').substring(0, 2).toUpperCase()
      };
    });

    const links = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const p1 = nodes[i].player;
        const p2 = nodes[j].player;
        
        const duoMatches = (matches || []).filter(m => {
          const stats = m.playerStats || m.players || [];
          const hasP1 = stats.some(s => String(s.playerId || s.id) === String(p1.id));
          const hasP2 = stats.some(s => String(s.playerId || s.id) === String(p2.id));
          return hasP1 && hasP2;
        });

        const total = duoMatches.length;
        const wins = duoMatches.filter(m => m.result === 'win' || m.result === 'G‘alaba' || m.isWin === true).length;
        const losses = total - wins;
        const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : null;
        const winRateNum = total > 0 ? (wins / total) * 100 : 0;

        links.push({
          source: nodes[i],
          target: nodes[j],
          total,
          wins,
          losses,
          winRate,
          winRateNum
        });
      }
    }

    const linksSvg = links.map((link, idx) => {
      let strokeColor = 'rgba(255, 255, 255, 0.12)';
      let strokeWidth = 1.5;
      let opacity = 0.5;

      if (link.total >= 1) {
        if (link.winRateNum >= 70) {
          strokeColor = 'var(--primary)';
          strokeWidth = 3.5;
          opacity = 0.95;
        } else if (link.winRateNum >= 50) {
          strokeColor = '#4ee2db';
          strokeWidth = 2.5;
          opacity = 0.8;
        } else {
          strokeColor = 'rgba(244, 63, 94, 0.6)';
          strokeWidth = 1.8;
          opacity = 0.6;
        }
      }

      return `
        <line class="constellation-link"
          data-link-index="${idx}"
          data-p1="${this.escapeHtml(link.source.name)}"
          data-p2="${this.escapeHtml(link.target.name)}"
          data-matches="${link.total}"
          data-wr="${link.winRate !== null ? link.winRate + '%' : '0 match'}"
          x1="${link.source.x.toFixed(1)}" y1="${link.source.y.toFixed(1)}"
          x2="${link.target.x.toFixed(1)}" y2="${link.target.y.toFixed(1)}"
          stroke="${strokeColor}"
          stroke-width="${strokeWidth}"
          stroke-opacity="${opacity}"
          stroke-linecap="round" />
      `;
    }).join('\n');

    const nodesSvg = nodes.map(node => `
      <g class="constellation-node" data-player-id="${node.player.id}" data-player-name="${this.escapeHtml(node.name)}" transform="translate(${node.x.toFixed(1)}, ${node.y.toFixed(1)})">
        <circle r="22" fill="#0d0f14" stroke="var(--primary)" stroke-width="2.2" filter="drop-shadow(0 0 10px rgba(var(--primary-rgb), 0.4))" />
        <text y="5" text-anchor="middle" fill="#fff" font-size="11" font-weight="800" font-family="var(--font-mono)">${this.escapeHtml(node.initials)}</text>
        <text y="36" text-anchor="middle" fill="var(--text-secondary)" font-size="11" font-weight="700">${this.escapeHtml(node.name)}</text>
      </g>
    `).join('\n');

    container.innerHTML = `
      <div class="synergy-constellation-card">
        <div class="synergy-constellation-header">
          <h3>
            <i class="fa-solid fa-circle-nodes" style="color:var(--primary);"></i>
            <span>Tarkib Sinergiya Yulduzlar Turqumi (Constellation)</span>
          </h3>
          <span class="badge" style="background:rgba(var(--primary-rgb), 0.15); color:var(--primary); font-weight:800; font-size:0.75rem;">
            5-TALIK ROSTER GRAFIKI
          </span>
        </div>
        <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1rem;">
          Jamoaning 5 asosiy o‘yinchisi o‘rtasidagi sinergiya nurlari. Har bir nur qalinligi va rangi tandemning g‘alaba ko‘rsatkichini (Win Rate) ifodalaydi. Chiziqlar ustiga bosing yoki hover qiling.
        </p>
        <div class="constellation-svg-wrap">
          <svg class="constellation-svg" viewBox="0 0 500 420" aria-label="Jamoa tarkibi sinergiya yulduzlar turqumi">
            ${linksSvg}
            ${nodesSvg}
          </svg>
          <div class="constellation-tooltip" id="constellationTooltip">
            <strong><i class="fa-solid fa-handshake" style="color:var(--primary); margin-right:6px;"></i> <span id="constellationTooltipNames">Sinergiya nuri ustiga bosing</span></strong>
            <span id="constellationTooltipStat">Tafsilotlar</span>
          </div>
        </div>
      </div>
    `;

    const svgWrap = container.querySelector('.constellation-svg-wrap');
    if (svgWrap) {
      const tooltipNames = svgWrap.querySelector('#constellationTooltipNames');
      const tooltipStat = svgWrap.querySelector('#constellationTooltipStat');

      svgWrap.querySelectorAll('.constellation-link').forEach(linkEl => {
        const update = () => {
          svgWrap.querySelectorAll('.constellation-link').forEach(l => l.classList.remove('is-active'));
          linkEl.classList.add('is-active');
          const p1 = linkEl.dataset.p1;
          const p2 = linkEl.dataset.p2;
          const matchesCount = linkEl.dataset.matches;
          const wr = linkEl.dataset.wr;
          if (tooltipNames) tooltipNames.textContent = `${p1} + ${p2} tandemi`;
          if (tooltipStat) tooltipStat.textContent = `${matchesCount} match · ${wr} Win Rate`;
          window.EclipseAudio?.playClick?.();
        };
        linkEl.addEventListener('mouseenter', update);
        linkEl.addEventListener('click', update);
      });

      svgWrap.querySelectorAll('.constellation-node').forEach(nodeEl => {
        nodeEl.addEventListener('click', () => {
          const playerName = nodeEl.dataset.playerName;
          const connectedLinks = svgWrap.querySelectorAll(`.constellation-link[data-p1="${playerName}"], .constellation-link[data-p2="${playerName}"]`);
          svgWrap.querySelectorAll('.constellation-link').forEach(l => l.classList.remove('is-active'));
          connectedLinks.forEach(l => l.classList.add('is-active'));
          if (tooltipNames) tooltipNames.textContent = `${playerName} o‘yinchisining barcha aloqalari (${connectedLinks.length} ta nur)`;
          if (tooltipStat) tooltipStat.textContent = 'Faol';
          window.EclipseAudio?.playClick?.();
        });
      });
    }
  }
};
