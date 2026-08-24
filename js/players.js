window.PlayerManager = class PlayerManager {
  constructor(dataStore, statsEngine) {
    this.db = dataStore;
    this.statsEngine = statsEngine;
    this.selectedP1 = null;
    this.selectedP2 = null;
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

  renderPlayersList(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = this.db.getPlayers();
    const matches = this.db.getMatches();

    if (players.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem;">
          <h3 style="color: var(--text-muted); margin-bottom: 0.5rem;"><i class="fa-solid fa-users-slash"></i> Roster is Empty</h3>
          <p style="color: var(--text-secondary);">Add your team members above to start tracking individual statistics!</p>
        </div>
      `;
      return;
    }

    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.25rem;">';
    players.forEach(p => {
      const stats = this.statsEngine.getPlayerStats(matches, p.id);
      const roleBreakdown = this.statsEngine.getPlayerRoleBreakdown(matches, p.id);
      const heroAnalytics = this.statsEngine.getPlayerHeroAnalytics(matches, p.id);
      const initials = p.name.substring(0, 2).toUpperCase();
      const bestRoleColor = window.StatsEngine.ROLE_COLORS[roleBreakdown.bestRole] || 'var(--secondary)';
      const bestRoleIcon = window.StatsEngine.ROLE_ICONS[roleBreakdown.bestRole] || 'fa-shield';

      const topHero = heroAnalytics.mostPicked;
      let topHeroHtml = '<span style="color:var(--text-muted);">None</span>';
      if (topHero) {
        topHeroHtml = `
          <strong style="color:var(--secondary);">${topHero.heroName}</strong> 
          <span style="font-size:0.75rem; color:var(--text-muted);">(${topHero.useRate}% Pick / <span style="color:${topHero.winRateNum >= 50 ? 'var(--success)' : 'var(--danger)'};">${topHero.winRate}% WR</span>)</span>
        `;
      }

      html += `
        <div class="player-card" data-id="${p.id}" style="flex-direction:column; align-items:stretch; position:relative; overflow:hidden;">
          <div style="display:flex; align-items:center; gap:1rem;">
            <div class="player-avatar">${initials}</div>
            <div class="player-info">
              <div class="player-name">${p.name}</div>
              <div class="player-role" style="display:flex; align-items:center; gap:0.4rem;">
                Best Lane: <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid ${bestRoleColor}; color:${bestRoleColor}; font-size:0.75rem;"><i class="fa-solid ${bestRoleIcon}"></i> ${roleBreakdown.bestRole}</span>
              </div>
            </div>
          </div>

          <div style="margin-top:0.75rem; font-size:0.825rem; background:rgba(0,0,0,0.25); padding:0.4rem 0.75rem; border-radius:6px; border:1px solid var(--border-light);">
            <i class="fa-solid fa-star" style="color:var(--secondary); margin-right:4px;"></i> Signature Hero: ${topHeroHtml}
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-top:0.75rem; padding:0.75rem; background:rgba(0,0,0,0.2); border-radius:8px; font-size:0.875rem;">
            <div>Matches: <strong>${stats.matchesPlayed}</strong></div>
            <div>Win Rate: <strong style="color:${Number(stats.winRate) >= 50 ? 'var(--success)' : 'var(--text-primary)'};">${stats.winRate}%</strong></div>
            <div>KDA: <strong style="color:var(--primary);">${stats.kdaRatio}</strong></div>
            <div>MVPs: <strong style="color:var(--secondary);">${stats.mvpCount} <i class="fa-solid fa-crown"></i></strong></div>
          </div>

          <div style="display:flex; gap:0.5rem; margin-top:1rem;">
            <button class="btn btn-primary btn-sm view-profile-btn" data-id="${p.id}" style="flex:1;"><i class="fa-solid fa-id-card"></i> Profile & Hero Pool</button>
            <button class="btn btn-secondary btn-sm edit-player-btn" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger btn-sm delete-player-btn" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.edit-player-btn').forEach(btn =>
      btn.addEventListener('click', e => this.showEditModal(e.currentTarget.dataset.id)));
    container.querySelectorAll('.delete-player-btn').forEach(btn =>
      btn.addEventListener('click', e => this.showDeleteConfirm(e.currentTarget.dataset.id)));
    container.querySelectorAll('.view-profile-btn').forEach(btn =>
      btn.addEventListener('click', e => window.EclipseApp.showPlayerProfile(e.currentTarget.dataset.id)));
  }

  renderAddPlayerForm(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-user-plus"></i> Add New Teammate</h3>
        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
          <input type="text" id="new-player-name" class="form-input" placeholder="Player IGN (In-Game Name)" style="flex:1; min-width:200px;" />
          <button id="save-player-btn" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Add Teammate</button>
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
        if (window.showToast) window.showToast(`Player '${name}' added to roster!`, 'success');
        this.renderPlayersList('playersListContainer');
        document.getElementById('new-player-name').value = '';
      } else {
        if (window.showToast) window.showToast('Please enter a player name', 'warning');
      }
    });
  }

  // =========================================================================
  //  1v1 HEAD-TO-HEAD COMPARISON TOOL
  // =========================================================================

  renderComparisonTool(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const players = this.db.getPlayers();
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
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.03) 0%, var(--bg-card-glass) 100%);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
          <div>
            <h3 class="card-title" style="margin:0;"><i class="fa-solid fa-bolt" style="color:var(--secondary);"></i> 1v1 Teammate Rivalry & Comparison</h3>
            <p style="color:var(--text-muted); margin:0.25rem 0 0 0; font-size:0.875rem;">Compare performance metrics, playstyles, and shared hero proficiencies between any two teammates.</p>
          </div>
          <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
            <select id="compare-p1-select" class="form-select" style="min-width:160px; border-color:var(--primary); font-weight:700; color:var(--primary);">
              ${players.map(p => `<option value="${p.id}" ${p.id === this.selectedP1 ? 'selected' : ''}>🔵 ${p.name}</option>`).join('')}
            </select>
            <div class="vs-badge">VS</div>
            <select id="compare-p2-select" class="form-select" style="min-width:160px; border-color:#a855f7; font-weight:700; color:#a855f7;">
              ${players.map(p => `<option value="${p.id}" ${p.id === this.selectedP2 ? 'selected' : ''}>🟣 ${p.name}</option>`).join('')}
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
            <div class="badge" style="background:rgba(0,212,255,0.15); color:var(--primary);">
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
    const players = this.db.getPlayers();
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
        <tr style="${isTop ? 'background:rgba(255,215,0,0.04); font-weight:600;' : ''}">
          <td><strong>#${idx + 1}</strong></td>
          <td>
            <strong>${d.player1.name}</strong> + <strong>${d.player2.name}</strong>
            ${isTop ? ' <span class="badge" style="background:var(--secondary); color:#000; font-size:0.65rem;">👑 #1 DUO</span>' : ''}
          </td>
          <td><span class="badge" style="background:rgba(0,212,255,0.1); color:var(--primary); font-size:0.75rem;">${d.comboLabel}</span></td>
          <td><strong>${d.matchesTogether}</strong> (${d.wins}W - ${d.losses}L)</td>
          <td><strong style="color:${d.winRateNum >= 75 ? 'var(--secondary)' : d.winRateNum >= 50 ? 'var(--success)' : 'var(--danger)'}; font-size:1.05rem;">${d.winRate}%</strong></td>
          <td><strong style="color:var(--primary);">${d.combinedKda}</strong></td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(255,215,0,0.03) 0%, var(--bg-card-glass) 100%);">
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

    const players = this.db.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const stats = this.statsEngine.getPlayerStats(matches, playerId);
    const roleBreakdown = this.statsEngine.getPlayerRoleBreakdown(matches, playerId);
    const heroAnalytics = this.statsEngine.getPlayerHeroAnalytics(matches, playerId);
    const fmt = window.StatsEngine.formatLargeNumber;

    const bestRoleColor = window.StatsEngine.ROLE_COLORS[roleBreakdown.bestRole] || 'var(--secondary)';
    const bestRoleIcon = window.StatsEngine.ROLE_ICONS[roleBreakdown.bestRole] || 'fa-shield';
    const primaryRoleColor = window.StatsEngine.ROLE_COLORS[roleBreakdown.primaryRole] || 'var(--primary)';
    const primaryRoleIcon = window.StatsEngine.ROLE_ICONS[roleBreakdown.primaryRole] || 'fa-gamepad';

    // Build Shiny Hero Analytics Cards
    let heroCardsHtml = '';
    if (heroAnalytics.heroes.length === 0) {
      heroCardsHtml = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No hero statistics recorded for this player yet.</p></div>`;
    } else {
      heroAnalytics.heroes.forEach(h => {
        const tierClass = h.masteryTier === 'S+' ? 'tier-splus' : h.masteryTier === 'S' ? 'tier-s' : '';
        const tagClass = h.masteryTier === 'S+' ? 'mastery-tag-splus' :
                         h.masteryTier === 'S' ? 'mastery-tag-s' :
                         h.masteryTier === 'A' ? 'mastery-tag-a' :
                         h.masteryTier === 'B' ? 'mastery-tag-b' : 'mastery-tag-c';

        const winRateFillClass = h.winRateNum >= 75 ? 'fill-winrate-god' :
                                 h.winRateNum >= 50 ? 'fill-winrate-high' :
                                 h.winRateNum >= 35 ? 'fill-winrate-med' : 'fill-winrate-low';

        heroCardsHtml += `
          <div class="shiny-hero-card ${tierClass}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                <div>
                  <h4 style="font-size:1.35rem; font-weight:800; color:var(--text-primary); margin:0;">${h.heroName}</h4>
                  <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                    ${h.timesUsed} Games (${h.wins}W - ${h.losses}L)
                  </div>
                </div>
                <span class="mastery-tag ${tagClass}">
                  ${h.masteryLabel}
                </span>
              </div>

              <!-- Visual Win Rate & Use Rate Meters -->
              <div class="rate-meter-group">
                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-trophy" style="color:var(--secondary);"></i> Win Rate</span>
                    <strong style="color:${h.winRateNum >= 50 ? 'var(--success)' : 'var(--danger)'};">${h.winRate}%</strong>
                  </div>
                  <div class="rate-meter-track">
                    <div class="rate-meter-fill ${winRateFillClass}" style="width: ${h.winRateNum}%;"></div>
                  </div>
                </div>

                <div class="rate-meter-item">
                  <div class="rate-meter-header">
                    <span><i class="fa-solid fa-chart-pie" style="color:var(--primary);"></i> Use Rate (Pick %)</span>
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
                <div>KDA<strong>${h.kdaRatio}</strong></div>
                <div>Avg Score<strong>${h.avgScore}</strong></div>
                <div>Avg Dmg<strong>${fmt(h.avgDamageDealt)}</strong></div>
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
      const isBest = r.role === roleBreakdown.bestRole && r.matchesPlayed > 0;
      const isPrimary = r.role === roleBreakdown.primaryRole && r.matchesPlayed > 0;

      let badgeAddon = '';
      if (isBest) badgeAddon += ` <span class="badge" style="background:rgba(255,215,0,0.2); color:var(--secondary); font-size:0.65rem;"><i class="fa-solid fa-trophy"></i> BEST LANE</span>`;
      if (isPrimary) badgeAddon += ` <span class="badge" style="background:rgba(0,212,255,0.2); color:var(--primary); font-size:0.65rem;">PRIMARY</span>`;

      roleBreakdownRows += `
        <tr style="${isBest ? 'background:rgba(255,215,0,0.03); font-weight:500;' : ''}">
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid ${rColor}; color:${rColor};"><i class="fa-solid ${rIcon}"></i> ${r.role}</span>
              ${badgeAddon}
            </div>
          </td>
          <td><strong>${r.matchesPlayed}</strong> (${r.wins}W - ${r.losses}L)</td>
          <td><strong style="color:${Number(r.winRate) >= 50 ? 'var(--success)' : r.matchesPlayed === 0 ? 'var(--text-muted)' : 'var(--danger)'};">${r.matchesPlayed > 0 ? r.winRate + '%' : '-'}</strong></td>
          <td><strong style="color:var(--primary);">${r.matchesPlayed > 0 ? r.kdaRatio : '-'}</strong></td>
          <td>${r.matchesPlayed > 0 ? r.avgInGameScore : '-'}</td>
          <td>${r.matchesPlayed > 0 ? fmt(r.avgDamageDealt) : '-'}</td>
          <td>${r.matchesPlayed > 0 ? fmt(r.avgTurretDamage) : '-'}</td>
          <td>${r.matchesPlayed > 0 ? `<span class="badge" style="background:rgba(255,255,255,0.05);">${r.favoriteHero}</span>` : '-'}</td>
          <td><strong style="color:${isBest ? 'var(--secondary)' : 'var(--text-primary)'};">${r.matchesPlayed > 0 ? r.performanceScore.toFixed(2) : '-'}</strong></td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div style="margin-bottom: 1.5rem; display:flex; align-items:center; justify-content:space-between;">
        <button class="btn btn-secondary back-to-players"><i class="fa-solid fa-arrow-left"></i> Back to Roster</button>
      </div>

      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.05) 0%, var(--bg-card-glass) 100%); border: 1px solid var(--primary);">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1.5rem;">
          <div style="display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap;">
            <div class="player-avatar" style="width:80px; height:80px; font-size:2rem; border-color:var(--primary); color:var(--primary);">${player.name.substring(0, 2).toUpperCase()}</div>
            <div>
              <h2 style="font-size:2rem; color:var(--text-primary); margin:0;">${player.name}</h2>
              <p style="color:var(--text-secondary); margin:0.25rem 0 0 0;">
                Hero Pool: <strong>${heroAnalytics.uniqueHeroesCount} Heroes Played</strong> | Matches: <strong>${stats.matchesPlayed}</strong> (${stats.winRate}% WR)
              </p>
            </div>
          </div>

          <div style="display:flex; gap:1rem; flex-wrap:wrap;">
            <div style="background:rgba(0,0,0,0.3); padding:0.75rem 1rem; border-radius:8px; border:1px solid ${bestRoleColor};">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;"><i class="fa-solid fa-trophy" style="color:var(--secondary);"></i> Best Performing Lane</div>
              <div style="font-size:1.1rem; font-weight:bold; color:${bestRoleColor}; margin-top:2px;">
                <i class="fa-solid ${bestRoleIcon}"></i> ${roleBreakdown.bestRole}
              </div>
            </div>
            <div style="background:rgba(0,0,0,0.3); padding:0.75rem 1rem; border-radius:8px; border:1px solid ${primaryRoleColor};">
              <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;"><i class="fa-solid fa-gamepad" style="color:var(--primary);"></i> Primary Assigned Role</div>
              <div style="font-size:1.1rem; font-weight:bold; color:${primaryRoleColor}; margin-top:2px;">
                <i class="fa-solid ${primaryRoleIcon}"></i> ${roleBreakdown.primaryRole}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SHINY HERO POOL & WIN RATE / USE RATE SHOWCASE -->
      <div class="shiny-container mb-4">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.5rem;">
          <div>
            <span class="badge" style="background:linear-gradient(135deg, var(--secondary) 0%, #ff8800 100%); color:#000; font-weight:800;">
              <i class="fa-solid fa-sparkles"></i> HERO MASTERY & RATINGS
            </span>
            <h3 style="font-size:1.5rem; color:var(--text-primary); margin:0.35rem 0 0.15rem 0;">
              <i class="fa-solid fa-shield-cat" style="color:var(--primary);"></i> ${player.name}'s Hero Win Rate & Pick Rate Analytics
            </h3>
            <p style="color:var(--text-secondary); margin:0; font-size:0.85rem;">
              Every hero played by <strong>${player.name}</strong> with real-time Win Rate %, Use Rate (Pick %), KDA ratios, and Mastery Tiers.
            </p>
          </div>
        </div>

        <div class="hero-analytics-grid">
          ${heroCardsHtml}
        </div>
      </div>

      <!-- ROLE PERFORMANCE BREAKDOWN -->
      <div class="card mb-4" style="border: 1px solid rgba(0, 212, 255, 0.3);">
        <h3 class="card-title mb-2"><i class="fa-solid fa-compass" style="color:var(--primary);"></i> Lane & Role Performance Breakdown</h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem;">
          Compare how <strong>${player.name}</strong> performs across different lanes in Mobile Legends to optimize your team's role assignments and draft strategies.
        </p>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Role / Lane</th>
                <th>Games (W-L)</th>
                <th>Win Rate</th>
                <th>KDA</th>
                <th>Avg Score</th>
                <th>Avg Dmg Dealt</th>
                <th>Avg Turret Dmg</th>
                <th>Top Hero</th>
                <th>Lane Perf Score</th>
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
          <div class="stat-card-title"><i class="fa-solid fa-fire"></i> Lifetime Damage Dealt</div>
          <div class="stat-card-value" style="color:var(--secondary);" title="${stats.totalDamageDealt.toLocaleString()}">${fmt(stats.totalDamageDealt)}</div>
          <div class="stat-card-desc">Avg per game: ${stats.avgDamageDealt.toLocaleString()}</div>
        </div>
        <div class="stat-card stat-card--primary">
          <div class="stat-card-title"><i class="fa-solid fa-shield-cat"></i> Lifetime KDA</div>
          <div class="stat-card-value">${stats.kdaRatio}</div>
          <div class="stat-card-desc">Total: ${stats.totalKills} K / ${stats.totalDeaths} D / ${stats.totalAssists} A</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-coins"></i> Lifetime Gold</div>
          <div class="stat-card-value" style="color:var(--warning);" title="${stats.totalGoldEarned.toLocaleString()}">${fmt(stats.totalGoldEarned)}</div>
          <div class="stat-card-desc">Avg per game: ${stats.avgGoldEarned.toLocaleString()}</div>
        </div>
        <div class="stat-card stat-card--gold">
          <div class="stat-card-title"><i class="fa-solid fa-award"></i> Lifetime Medals</div>
          <div class="stat-card-value" style="font-size:1.5rem; display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem;">
            <span class="medal medal-mvp" title="${stats.mvpCount} MVPs">${stats.mvpCount}</span>
            <span class="medal medal-gold" title="${stats.goldCount} Gold">${stats.goldCount}</span>
            <span class="medal medal-silver" title="${stats.silverCount} Silver">${stats.silverCount}</span>
            <span class="medal medal-choco" title="${stats.bronzeCount} Bronze">${stats.bronzeCount}</span>
          </div>
          <div class="stat-card-desc">${stats.savageCount} Savages | ${stats.maniacCount} Maniacs</div>
        </div>
      </div>

      <div class="card mb-4">
        <h3 class="card-title mb-3"><i class="fa-solid fa-chart-bar"></i> Cumulative Lifetime vs. Per-Game Averages</h3>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Stat Metric</th>
                <th>Lifetime Total</th>
                <th>Per-Game Average</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Damage Dealt</td><td><strong style="color:var(--secondary);" title="${stats.totalDamageDealt.toLocaleString()}">${fmt(stats.totalDamageDealt)}</strong></td><td>${stats.avgDamageDealt.toLocaleString()}</td></tr>
              <tr><td>Damage Received</td><td><strong style="color:var(--primary);" title="${stats.totalDamageReceived.toLocaleString()}">${fmt(stats.totalDamageReceived)}</strong></td><td>${stats.avgDamageReceived.toLocaleString()}</td></tr>
              <tr><td>Turret Damage</td><td><strong style="color:var(--success);" title="${stats.totalTurretDamage.toLocaleString()}">${fmt(stats.totalTurretDamage)}</strong></td><td>${stats.avgTurretDamage.toLocaleString()}</td></tr>
              <tr><td>Gold Earned</td><td><strong style="color:var(--warning);" title="${stats.totalGoldEarned.toLocaleString()}">${fmt(stats.totalGoldEarned)}</strong></td><td>${stats.avgGoldEarned.toLocaleString()}</td></tr>
              <tr><td>Kills / Deaths / Assists</td><td><strong>${stats.totalKills} / ${stats.totalDeaths} / ${stats.totalAssists}</strong></td><td>${stats.avgKills} / ${stats.avgDeaths} / ${stats.avgAssists}</td></tr>
              <tr><td>In-Game Score</td><td>Total Games: <strong>${stats.matchesPlayed}</strong></td><td>Avg Score: <strong>${stats.avgInGameScore}</strong></td></tr>
              <tr><td>Teamfight Participation</td><td>Savages: <strong>${stats.savageCount}</strong> | Maniacs: <strong>${stats.maniacCount}</strong></td><td>Avg TF Part: <strong>${stats.avgTeamfightParticipation}%</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelector('.back-to-players')?.addEventListener('click', () => {
      window.EclipseApp.navigate('players');
    });
  }

  showEditModal(playerId) {
    if (window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
      window.EclipseApp.authManager.showLoginModal();
      return;
    }
    const players = this.db.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    const newName = prompt("Enter new name for player:", player.name);
    if (newName && newName.trim()) {
      this.db.updatePlayer(playerId, newName.trim());
      if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
        window.EclipseApp.cloudSync.syncUp();
      }
      this.renderPlayersList('playersListContainer');
      if (window.showToast) window.showToast('Player name updated', 'success');
    }
  }

  showDeleteConfirm(playerId) {
    if (window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
      window.EclipseApp.authManager.showLoginModal();
      return;
    }
    const players = this.db.getPlayers();
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    if (confirm(`Delete '${player.name}' from roster? Match history stats for this player will remain archived.`)) {
      this.db.deletePlayer(playerId);
      if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
        window.EclipseApp.cloudSync.syncUp();
      }
      this.renderPlayersList('playersListContainer');
      if (window.showToast) window.showToast('Player removed from roster', 'warning');
    }
  }
};
