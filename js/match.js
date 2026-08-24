window.MatchManager = class MatchManager {
  constructor(dataStore, heroDb) {
    this.db = dataStore;
    this.heroDb = heroDb;
    this.quickAddMode = false;
  }

  static ROLES = ['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'];

  renderMatchForm(containerId, players, editingMatchId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!players || players.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem;">
          <h3 style="color:var(--warning); margin-bottom: 0.5rem;"><i class="fa-solid fa-users-slash"></i> No Players in Roster</h3>
          <p style="color:var(--text-secondary); margin-bottom: 1.5rem;">Please add your team members under the <strong>Players</strong> tab before logging a match!</p>
          <button class="btn btn-primary" onclick="window.EclipseApp.navigate('players')"><i class="fa-solid fa-user-plus"></i> Add Players Now</button>
        </div>
      `;
      return;
    }

    let existingMatch = null;
    if (editingMatchId) {
      existingMatch = this.db.getMatches().find(m => m.id === editingMatchId);
    }

    const isEditMode = !!existingMatch;
    const today = new Date().toISOString().split('T')[0];
    const heroList = this.heroDb ? this.heroDb.getAll() : [];
    const rolesList = MatchManager.ROLES;

    const matchDateVal = isEditMode ? existingMatch.date : today;
    const matchResultVal = isEditMode ? existingMatch.result : 'win';
    const matchTypeVal = isEditMode ? (existingMatch.matchType || 'ranked') : 'ranked';
    const matchTurtlesVal = isEditMode ? (existingMatch.teamTurtles || 0) : 0;
    const matchLordsVal = isEditMode ? (existingMatch.teamLords || 0) : 0;
    const matchTurretsVal = isEditMode ? (existingMatch.teamTurrets || 0) : 0;
    const matchNotesVal = isEditMode ? (existingMatch.notes || '') : '';

    let matchDurationMin = 15;
    let matchDurationSec = 30;
    if (isEditMode && existingMatch.durationSeconds) {
      matchDurationMin = Math.floor(existingMatch.durationSeconds / 60);
      matchDurationSec = existingMatch.durationSeconds % 60;
    }

    let html = `
      <form id="match-entry-form">
        <div class="quick-add-banner">
          <div>
            <span class="badge">${this.quickAddMode ? '⚡ QUICK ADD' : '📋 FULL DETAIL'}</span>
            <span style="color:var(--text-secondary); font-size:0.85rem; margin-left:0.5rem;">
              ${this.quickAddMode ? 'Only essential stats (K/D/A, hero, medal, score)' : 'All stats including damage, gold, teamfight %'}
            </span>
          </div>
          <button type="button" class="btn btn-sm ${this.quickAddMode ? 'btn-primary' : 'btn-secondary'}" id="toggle-quick-add">
            <i class="fa-solid fa-bolt"></i> ${this.quickAddMode ? 'Switch to Full Mode' : 'Switch to Quick Add'}
          </button>
        </div>

        ${isEditMode ? `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; background:rgba(0,212,255,0.08); padding:0.75rem 1.25rem; border-radius:10px; border:1px solid rgba(0,212,255,0.3);">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-pen-to-square" style="color:var(--primary); font-size:1.25rem;"></i>
              <span style="font-weight:700; color:var(--text-primary);">Editing Match from ${window.StatsEngine.formatDateFormatted(existingMatch.date)}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="cancel-edit-btn"><i class="fa-solid fa-xmark"></i> Cancel Edit</button>
          </div>
        ` : ''}

        <div class="card mb-4">
          <h3 class="card-title mb-3"><i class="fa-solid fa-list-check"></i> 1. Team Match Details</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div class="form-group">
              <label class="form-label"><i class="fa-regular fa-calendar"></i> Match Date</label>
              <input type="date" id="match-date" value="${matchDateVal}" class="form-input date-input" required />
            </div>

            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-tag"></i> Match Type</label>
              <select id="match-type" class="form-select">
                <option value="ranked" ${matchTypeVal === 'ranked' ? 'selected' : ''}>⚔️ Ranked</option>
                <option value="scrim" ${matchTypeVal === 'scrim' ? 'selected' : ''}>🤝 Scrim</option>
                <option value="tournament" ${matchTypeVal === 'tournament' ? 'selected' : ''}>🏆 Tournament</option>
                <option value="casual" ${matchTypeVal === 'casual' ? 'selected' : ''}>🎮 Casual</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-trophy"></i> Match Outcome</label>
              <div style="display:flex; gap:1rem; align-items:center; height:42px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--success); font-weight:600;">
                  <input type="radio" name="match-result" value="win" ${matchResultVal === 'win' ? 'checked' : ''} class="form-checkbox" /> WIN <i class="fa-solid fa-circle-check"></i>
                </label>
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--danger); font-weight:600;">
                  <input type="radio" name="match-result" value="loss" ${matchResultVal === 'loss' ? 'checked' : ''} class="form-checkbox" /> LOSS <i class="fa-solid fa-circle-xmark"></i>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label"><i class="fa-regular fa-clock" style="color:var(--primary);"></i> Match Duration (Min : Sec)</label>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <input type="number" id="match-duration-min" min="0" max="120" value="${matchDurationMin}" class="form-input" placeholder="Min (e.g. 15)" style="text-align:center;" />
                <span style="font-weight:bold; color:var(--text-muted);">:</span>
                <input type="number" id="match-duration-sec" min="0" max="59" value="${matchDurationSec < 10 ? '0' + matchDurationSec : matchDurationSec}" class="form-input" placeholder="Sec (e.g. 30)" style="text-align:center;" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-shield-halved" style="color:var(--success);"></i> Turtles Secured (0-10)</label>
              <input type="number" id="team-turtles" min="0" max="10" value="${matchTurtlesVal}" class="form-input" placeholder="0" />
            </div>

            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-crown" style="color:var(--secondary);"></i> Lords Secured (0-10)</label>
              <input type="number" id="team-lords" min="0" max="10" value="${matchLordsVal}" class="form-input" placeholder="0" />
            </div>

            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-chess-rook" style="color:var(--primary);"></i> Turrets Destroyed (0-9)</label>
              <input type="number" id="team-turrets" min="0" max="9" value="${matchTurretsVal}" class="form-input" placeholder="0" />
            </div>

            <div class="form-group" style="grid-column: 1 / -1;">
              <label class="form-label"><i class="fa-regular fa-note-sticky"></i> Match Notes (Optional)</label>
              <input type="text" id="match-notes" value="${matchNotesVal}" class="form-input" placeholder="Tournament name, stage, opponent team, draft strategy..." />
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <h3 class="card-title" style="margin:0;"><i class="fa-solid fa-users"></i> 2. Player Roster & Role / Lineup Selection</h3>
              <p style="color:var(--text-muted); margin:0.25rem 0 0 0; font-size:0.875rem;">
                Assign each player's <strong>Lane / Role</strong> for this match. Select the <strong>5 Active Players</strong>; benched substitutes won't have their stats diluted.
              </p>
            </div>
            <div style="font-size:0.875rem; color:var(--text-secondary);" id="active-players-count-badge">
              Active: <strong id="active-count-num" style="color:var(--success);">5</strong> / 5 Playing
            </div>
          </div>

          <div id="players-stats-section" style="display:flex; flex-direction:column; gap:1.25rem;">
    `;

    players.forEach((p, idx) => {
      let isBenched = false;
      let pStats = null;

      if (isEditMode) {
        pStats = (existingMatch.playerStats || []).find(ps => ps.playerId === p.id);
        const isSub = (existingMatch.substitutes || []).includes(p.id);
        if (!pStats || isSub) {
          isBenched = true;
        }
      } else {
        isBenched = idx >= 5;
      }

      const benchedClass = isBenched ? 'benched' : '';
      const toggleClass = isBenched ? 'benched' : 'playing';
      const toggleIcon = isBenched ? 'fa-chair' : 'fa-gamepad';
      const toggleText = isBenched ? 'Benched / Sub' : 'Playing (Active)';

      const defaultRole = (pStats && pStats.rolePlayed) ? pStats.rolePlayed : rolesList[idx % rolesList.length];
      const heroUsedVal = pStats ? (pStats.heroUsed || '') : '';
      const killsVal = pStats ? (pStats.kills ?? 0) : 0;
      const deathsVal = pStats ? (pStats.deaths ?? 0) : 0;
      const assistsVal = pStats ? (pStats.assists ?? 0) : 0;
      const scoreVal = pStats ? (pStats.inGameScore ?? '') : '';
      const dmgDealtVal = pStats ? (pStats.damageDealt ?? '') : '';
      const dmgRcvdVal = pStats ? (pStats.damageReceived ?? '') : '';
      const turretDmgVal = pStats ? (pStats.turretDamage ?? '') : '';
      const tfVal = pStats ? (pStats.teamfightParticipation ?? '') : '';
      const goldVal = pStats ? (pStats.goldEarned ?? '') : '';
      const medalVal = pStats ? (pStats.medal || 'none') : 'none';
      const savageChecked = pStats && pStats.savage ? 'checked' : '';
      const maniacChecked = pStats && pStats.maniac ? 'checked' : '';

      html += `
        <div class="player-stat-row ${benchedClass}" data-player-id="${p.id}" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 10px; padding: 1.25rem; transition: all 0.25s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <h4 style="color: var(--primary); margin:0;"><i class="fa-solid fa-user"></i> ${p.name}</h4>
              <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">#${idx+1}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <button type="button" class="sub-toggle ${toggleClass}" data-player-id="${p.id}">
                <i class="fa-solid ${toggleIcon}"></i> <span>${toggleText}</span>
              </button>
            </div>
          </div>

          <div class="stat-inputs-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem;">
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem; color:var(--secondary); font-weight:700;"><i class="fa-solid fa-map-pin"></i> Role / Lane</label>
              <select class="stat-role form-select" ${isBenched ? 'disabled' : ''} style="font-weight:600;">
                ${rolesList.map(r => `<option value="${r}" ${r === defaultRole ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Hero Used</label>
              <input type="text" list="hero-list-${p.id}" class="stat-hero form-input" value="${heroUsedVal}" placeholder="Search / Type hero..." ${isBenched ? 'disabled' : ''} required />
              <datalist id="hero-list-${p.id}">
                ${heroList.map(h => `<option value="${h.name}">${h.role}</option>`).join('')}
              </datalist>
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Kills</label>
              <input type="number" class="stat-kills form-input" min="0" value="${killsVal}" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Deaths</label>
              <input type="number" class="stat-deaths form-input" min="0" value="${deathsVal}" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Assists</label>
              <input type="number" class="stat-assists form-input" min="0" value="${assistsVal}" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Score (e.g. 10.5)</label>
              <input type="number" step="0.1" class="stat-score form-input" min="0" max="20" value="${scoreVal}" placeholder="0.0" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="full-mode-fields" style="display:${this.quickAddMode ? 'none' : 'contents'};">
              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:0.75rem;">Hero Dmg Dealt</label>
                <input type="number" class="stat-dmg-dealt form-input" min="0" value="${dmgDealtVal}" placeholder="e.g. 45000" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:0.75rem;">Dmg Received</label>
                <input type="number" class="stat-dmg-received form-input" min="0" value="${dmgRcvdVal}" placeholder="e.g. 32000" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:0.75rem;">Turret Damage</label>
                <input type="number" class="stat-turret-dmg form-input" min="0" value="${turretDmgVal}" placeholder="e.g. 8500" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:0.75rem;">Teamfight (%)</label>
                <input type="number" class="stat-tf form-input" min="0" max="100" value="${tfVal}" placeholder="e.g. 75" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label class="form-label" style="font-size:0.75rem;">Gold Earned</label>
                <input type="number" class="stat-gold form-input" min="0" value="${goldVal}" placeholder="e.g. 12500" ${isBenched ? 'disabled' : ''} />
              </div>
            </div>

            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:0.75rem;">Medal Awarded</label>
              <select class="stat-medal form-select" ${isBenched ? 'disabled' : ''}>
                <option value="none" ${medalVal === 'none' ? 'selected' : ''}>None</option>
                <option value="mvp" ${medalVal === 'mvp' ? 'selected' : ''}>👑 MVP</option>
                <option value="gold" ${medalVal === 'gold' ? 'selected' : ''}>🥇 Gold</option>
                <option value="silver" ${medalVal === 'silver' ? 'selected' : ''}>🥈 Silver</option>
                <option value="bronze" ${medalVal === 'bronze' ? 'selected' : ''}>🍫 Bronze (Chocolate)</option>
              </select>
            </div>

            <div class="form-group" style="margin:0; display:flex; align-items:center; gap:1rem; padding-top:1.25rem;">
              <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-size:0.875rem; color:var(--secondary);">
                <input type="checkbox" class="stat-savage form-checkbox" ${savageChecked} ${isBenched ? 'disabled' : ''} /> <i class="fa-solid fa-fire"></i> Savage
              </label>
              <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-size:0.875rem; color:var(--primary);">
                <input type="checkbox" class="stat-maniac form-checkbox" ${maniacChecked} ${isBenched ? 'disabled' : ''} /> <i class="fa-solid fa-bolt"></i> Maniac
              </label>
            </div>
          </div>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:1rem; margin-bottom:2rem;">
          ${isEditMode ? `
            <button type="button" class="btn btn-secondary btn-lg" id="cancel-edit-btn-bottom"><i class="fa-solid fa-xmark"></i> Cancel</button>
          ` : ''}
          <button type="submit" class="btn btn-primary btn-lg">
            <i class="fa-solid fa-floppy-disk"></i> ${isEditMode ? 'Update Match Statistics' : 'Save Match Statistics'}
          </button>
        </div>
      </form>
    `;

    container.innerHTML = html;

    // Helper to update active players count
    const updateActiveCount = () => {
      const activeRows = container.querySelectorAll('.player-stat-row:not(.benched)');
      const countEl = document.getElementById('active-count-num');
      if (countEl) {
        countEl.textContent = activeRows.length;
        countEl.style.color = activeRows.length === 5 ? 'var(--success)' : 'var(--warning)';
      }
    };

    // Cancel edit listeners
    const cancelHandler = () => {
      window.EclipseApp.navigate('match-history');
    };
    document.getElementById('cancel-edit-btn')?.addEventListener('click', cancelHandler);
    document.getElementById('cancel-edit-btn-bottom')?.addEventListener('click', cancelHandler);

    // Attach substitution toggle listeners
    container.querySelectorAll('.sub-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget;
        const row = targetBtn.closest('.player-stat-row');
        const isCurrentlyPlaying = targetBtn.classList.contains('playing');
        const inputs = row.querySelectorAll('.form-input, .form-select, .form-checkbox');
        const icon = targetBtn.querySelector('i');
        const text = targetBtn.querySelector('span');

        if (isCurrentlyPlaying) {
          // Switch to Benched
          targetBtn.classList.remove('playing');
          targetBtn.classList.add('benched');
          icon.className = 'fa-solid fa-chair';
          text.textContent = 'Benched / Sub';
          row.classList.add('benched');
          inputs.forEach(inp => {
            inp.disabled = true;
            inp.removeAttribute('required');
          });
        } else {
          // Switch to Playing
          targetBtn.classList.remove('benched');
          targetBtn.classList.add('playing');
          icon.className = 'fa-solid fa-gamepad';
          text.textContent = 'Playing (Active)';
          row.classList.remove('benched');
          inputs.forEach(inp => {
            inp.disabled = false;
            if (inp.classList.contains('stat-hero') || inp.classList.contains('stat-score') || inp.classList.contains('stat-kills') || inp.classList.contains('stat-deaths') || inp.classList.contains('stat-assists')) {
              inp.setAttribute('required', '');
            }
          });
        }
        updateActiveCount();
      });
    });

    updateActiveCount();

    // Toggle quick add mode
    document.getElementById('toggle-quick-add')?.addEventListener('click', () => {
      this.quickAddMode = !this.quickAddMode;
      this.renderMatchForm(containerId, players, editingMatchId);
    });

    // Navigation guard: mark form as dirty on input
    const form = document.getElementById('match-entry-form');
    if (form) {
      form.addEventListener('input', () => {
        window._eclipseUnsavedMatch = true;
      });
    }

    // Form submit listener
    form?.addEventListener('submit', (e) => {
      e.preventDefault();

      const activeRows = container.querySelectorAll('.player-stat-row:not(.benched)');
      if (activeRows.length === 0) {
        if (window.showToast) window.showToast('Please select at least 1 playing teammate', 'warning');
        return;
      }

      const durMin = parseInt(document.getElementById('match-duration-min').value) || 0;
      const durSec = parseInt(document.getElementById('match-duration-sec').value) || 0;
      const totalDurSec = (durMin * 60) + durSec;
      const durFormatted = window.StatsEngine.formatDuration(totalDurSec);

      const matchObj = {
        date: document.getElementById('match-date').value,
        matchType: document.getElementById('match-type')?.value || 'ranked',
        result: document.querySelector('input[name="match-result"]:checked').value,
        durationSeconds: totalDurSec,
        durationFormatted: durFormatted,
        teamTurtles: parseInt(document.getElementById('team-turtles').value) || 0,
        teamLords: parseInt(document.getElementById('team-lords').value) || 0,
        teamTurrets: parseInt(document.getElementById('team-turrets').value) || 0,
        notes: document.getElementById('match-notes').value.trim(),
        playerStats: [],
        substitutes: []
      };

      const allRows = document.querySelectorAll('.player-stat-row');
      let validationErrors = [];

      allRows.forEach((row, rowIdx) => {
        const pId = row.dataset.playerId;
        const isBenched = row.classList.contains('benched');
        const pObj = players.find(p => p.id === pId);
        const pName = pObj ? pObj.name : `Player ${rowIdx + 1}`;

        if (isBenched) {
          matchObj.substitutes.push(pId);
        } else {
          const heroInput = row.querySelector('.stat-hero');
          const heroName = (heroInput.value || '').trim();
          const rolePlayed = row.querySelector('.stat-role').value;
          const kills = parseInt(row.querySelector('.stat-kills').value) || 0;
          const deaths = parseInt(row.querySelector('.stat-deaths').value) || 0;
          const assists = parseInt(row.querySelector('.stat-assists').value) || 0;
          const score = parseFloat(row.querySelector('.stat-score').value) || 0;
          const dmgDealt = parseInt(row.querySelector('.stat-dmg-dealt')?.value) || 0;
          const dmgReceived = parseInt(row.querySelector('.stat-dmg-received')?.value) || 0;
          const turretDmg = parseInt(row.querySelector('.stat-turret-dmg')?.value) || 0;
          const tf = parseInt(row.querySelector('.stat-tf')?.value) || 0;
          const gold = parseInt(row.querySelector('.stat-gold')?.value) || 0;

          if (!heroName) {
            validationErrors.push(`${pName}: Hero selection is required`);
            heroInput.classList.add('is-invalid');
          } else {
            heroInput.classList.remove('is-invalid');
          }

          if (kills < 0 || deaths < 0 || assists < 0) {
            validationErrors.push(`${pName}: K/D/A values cannot be negative`);
          }

          if (score < 0 || score > 20) {
            validationErrors.push(`${pName}: Score must be between 0.0 and 20.0`);
          }

          if (tf < 0 || tf > 100) {
            validationErrors.push(`${pName}: Teamfight participation must be 0-100%`);
          }

          if (heroName && this.heroDb && !this.heroDb.exists(heroName)) {
            this.heroDb.addHero(heroName, 'Fighter');
          }

          matchObj.playerStats.push({
            playerId: pId,
            rolePlayed: rolePlayed,
            heroUsed: heroName,
            kills: kills,
            deaths: deaths,
            assists: assists,
            inGameScore: score,
            damageDealt: dmgDealt,
            damageReceived: dmgReceived,
            turretDamage: turretDmg,
            teamfightParticipation: tf,
            goldEarned: gold,
            medal: row.querySelector('.stat-medal').value === 'none' ? null : row.querySelector('.stat-medal').value,
            savage: row.querySelector('.stat-savage').checked,
            maniac: row.querySelector('.stat-maniac').checked
          });
        }
      });

      if (validationErrors.length > 0) {
        if (window.showToast) window.showToast(validationErrors[0], 'error');
        return;
      }

      window._eclipseUnsavedMatch = false;

      if (isEditMode) {
        this.db.updateMatch(editingMatchId, matchObj);
        if (window.showToast) window.showToast('Match updated successfully!', 'success');
      } else {
        this.db.addMatch(matchObj);
        if (window.showToast) window.showToast('Match logged successfully!', 'success');
      }

      if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
        window.EclipseApp.cloudSync.syncUp();
      }

      window.EclipseApp.navigate('match-history');
    });
  }

  renderMatchHistory(containerId, matches, players) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const fmtDate = window.StatsEngine.formatDateFormatted;

    if (!matches || matches.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem;">
          <h3 style="color:var(--text-muted); margin-bottom: 0.5rem;"><i class="fa-solid fa-box-archive"></i> No Match History</h3>
          <p style="color:var(--text-secondary); margin-bottom: 1.5rem;">No matches have been logged yet.</p>
          <button class="btn btn-primary" onclick="window.EclipseApp.navigate('add-match')"><i class="fa-solid fa-plus"></i> Log First Match</button>
        </div>
      `;
      return;
    }

    const sorted = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = `
      <div class="card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Exact Date</th>
                <th>Type</th>
                <th>Result</th>
                <th>Duration</th>
                <th>Team KDA</th>
                <th>Objectives</th>
                <th>Lineup & Roles</th>
                <th>Benched / Subs</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    sorted.forEach(m => {
      let tKills = 0, tDeaths = 0, tAssists = 0;
      const playingPills = [];
      (m.playerStats || []).forEach(ps => {
        tKills += Number(ps.kills) || 0;
        tDeaths += Number(ps.deaths) || 0;
        tAssists += Number(ps.assists) || 0;
        const pObj = players.find(p => p.id === ps.playerId);
        const role = ps.rolePlayed || 'EXP';
        const roleShort = role.replace(' Laner', '');
        if (pObj) {
          playingPills.push(`<strong>${pObj.name}</strong> <span style="color:var(--primary); font-size:0.75rem;">(${roleShort})</span>`);
        }
      });

      let subsStr = '-';
      if (m.substitutes && m.substitutes.length > 0) {
        const subNames = m.substitutes.map(subId => {
          const p = players.find(pl => pl.id === subId);
          return p ? p.name : 'Unknown';
        });
        subsStr = subNames.join(', ');
      }

      const durFormatted = m.durationFormatted || (m.durationSeconds ? window.StatsEngine.formatDuration(m.durationSeconds) : '-');
      const mType = m.matchType || 'ranked';

      html += `
        <tr>
          <td><i class="fa-regular fa-calendar" style="color:var(--primary); margin-right:4px;"></i> <strong>${fmtDate(m.date)}</strong></td>
          <td><span class="match-tag match-tag-${mType}">${mType.toUpperCase()}</span></td>
          <td><span class="badge ${m.result === 'win' ? 'badge-win' : 'badge-loss'}">${m.result.toUpperCase()}</span></td>
          <td>
            <span class="badge" style="background:rgba(0,212,255,0.08); color:var(--primary); border:1px solid rgba(0,212,255,0.25);">
              <i class="fa-regular fa-clock"></i> ${durFormatted}
            </span>
          </td>
          <td><strong style="color:var(--primary);">${tKills} / ${tDeaths} / ${tAssists}</strong></td>
          <td>
            <i class="fa-solid fa-shield-halved" style="color:var(--success);" title="Turtles"></i> ${m.teamTurtles || 0} | 
            <i class="fa-solid fa-crown" style="color:var(--secondary);" title="Lords"></i> ${m.teamLords || 0} | 
            <i class="fa-solid fa-chess-rook" style="color:var(--primary);" title="Turrets"></i> ${m.teamTurrets || 0}
          </td>
          <td><span style="font-size:0.85rem; color:var(--text-secondary);">${playingPills.join(' • ') || '-'}</span></td>
          <td><span style="font-size:0.85rem; color:var(--warning);"><i class="fa-solid fa-chair" style="margin-right:2px;"></i> ${subsStr}</span></td>
          <td>${m.notes || '-'}</td>
          <td>
            <div style="display:flex; gap:0.25rem; flex-wrap:wrap;">
              <button class="btn btn-sm btn-secondary view-match-btn" data-id="${m.id}"><i class="fa-solid fa-eye"></i> View</button>
              <button class="btn btn-sm btn-secondary share-match-btn" data-id="${m.id}" style="background:rgba(255,215,0,0.1); border-color:rgba(255,215,0,0.3); color:var(--secondary);"><i class="fa-solid fa-camera"></i> Card</button>
              <button class="btn btn-sm btn-primary edit-match-btn" data-id="${m.id}"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-danger delete-match-btn" data-id="${m.id}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.view-match-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id;
        this.renderMatchDetailModal(id, players);
      });
    });

    container.querySelectorAll('.share-match-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id;
        this.showSharePosterModal(id, players);
      });
    });

    container.querySelectorAll('.edit-match-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id;
        window.EclipseApp.editMatch(id);
      });
    });

    container.querySelectorAll('.delete-match-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        if (window.EclipseApp.authManager && !window.EclipseApp.authManager.isAdmin()) {
          window.EclipseApp.authManager.showLoginModal();
          return;
        }
        const id = e.currentTarget.dataset.id;
        if (confirm('Are you sure you want to delete this match record?')) {
          this.db.deleteMatch(id);
          if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
            window.EclipseApp.cloudSync.syncUp();
          }
          if (window.showToast) window.showToast('Match record deleted', 'warning');
          this.renderMatchHistory(containerId, this.db.getMatches(), players);
        }
      });
    });
  }

  renderMatchDetailModal(matchId, players) {
    const matches = this.db.getMatches();
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    if (!overlay || !content) return;
    const fmtDate = window.StatsEngine.formatDateFormatted;
    const durFormatted = match.durationFormatted || (match.durationSeconds ? window.StatsEngine.formatDuration(match.durationSeconds) : 'N/A');

    let playerRows = '';
    (match.playerStats || []).forEach(ps => {
      const pName = players.find(p => p.id === ps.playerId)?.name || 'Unknown';
      const role = ps.rolePlayed || 'EXP Laner';
      const roleColor = window.StatsEngine.ROLE_COLORS[role] || 'var(--primary)';
      const medalBadge = ps.medal === 'mvp' ? '<span class="medal medal-mvp">MVP</span>' :
                         ps.medal === 'gold' ? '<span class="medal medal-gold">🥇</span>' :
                         ps.medal === 'silver' ? '<span class="medal medal-silver">🥈</span>' :
                         ps.medal === 'bronze' ? '<span class="medal medal-choco">🍫</span>' : '-';

      playerRows += `
        <tr>
          <td><strong>${pName}</strong></td>
          <td><span class="badge" style="background:rgba(255,255,255,0.05); border:1px solid ${roleColor}; color:${roleColor}; font-size:0.7rem;">${role}</span></td>
          <td><span class="badge" style="background:rgba(255,255,255,0.05);">${ps.heroUsed}</span></td>
          <td><strong>${ps.kills}/${ps.deaths}/${ps.assists}</strong></td>
          <td><strong>${ps.inGameScore}</strong></td>
          <td>${ps.damageDealt ? ps.damageDealt.toLocaleString() : '-'}</td>
          <td>${ps.damageReceived ? ps.damageReceived.toLocaleString() : '-'}</td>
          <td>${ps.turretDamage ? ps.turretDamage.toLocaleString() : '-'}</td>
          <td>${ps.teamfightParticipation ? ps.teamfightParticipation + '%' : '-'}</td>
          <td>${ps.goldEarned ? ps.goldEarned.toLocaleString() : '-'}</td>
          <td>${medalBadge} ${ps.savage ? '<i class="fa-solid fa-fire" style="color:var(--secondary);"></i> Savage' : ''} ${ps.maniac ? '<i class="fa-solid fa-bolt" style="color:var(--primary);"></i> Maniac' : ''}</td>
        </tr>
      `;
    });

    let subsSection = '';
    if (match.substitutes && match.substitutes.length > 0) {
      const subNames = match.substitutes.map(subId => {
        const p = players.find(pl => pl.id === subId);
        return p ? p.name : 'Unknown';
      });
      subsSection = `
        <div style="margin-top:1rem; padding:0.75rem 1rem; background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.3); border-radius:8px; display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-solid fa-chair" style="color:var(--warning);"></i>
          <span style="color:var(--text-secondary); font-size:0.875rem;">Benched / Substitutes (Not Counted in Player Stats):</span>
          <strong style="color:var(--warning); font-size:0.875rem;">${subNames.join(', ')}</strong>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title"><i class="fa-regular fa-calendar"></i> Match Details (${fmtDate(match.date)})</h3>
        <button class="modal-close" id="closeModalBtn">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap; align-items:center;">
          <span class="badge ${match.result === 'win' ? 'badge-win' : 'badge-loss'}" style="font-size:0.875rem; padding:0.4rem 1rem;">${match.result.toUpperCase()}</span>
          <span class="badge" style="background:rgba(0,212,255,0.08); color:var(--primary); border:1px solid rgba(0,212,255,0.3); font-size:0.875rem; padding:0.4rem 0.75rem;">
            <i class="fa-regular fa-clock"></i> <strong>${durFormatted}</strong>
          </span>
          <span><i class="fa-solid fa-shield-halved" style="color:var(--success);"></i> Turtles: <strong>${match.teamTurtles || 0}</strong></span>
          <span><i class="fa-solid fa-crown" style="color:var(--secondary);"></i> Lords: <strong>${match.teamLords || 0}</strong></span>
          <span><i class="fa-solid fa-chess-rook" style="color:var(--primary);"></i> Turrets: <strong>${match.teamTurrets || 0}</strong></span>
        </div>
        ${match.notes ? `<p style="font-style:italic; color:var(--text-muted); margin-bottom:1rem;">Notes: "${match.notes}"</p>` : ''}
        
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Role Played</th>
                <th>Hero</th>
                <th>K/D/A</th>
                <th>Score</th>
                <th>Hero Dmg</th>
                <th>Dmg Rcvd</th>
                <th>Turret Dmg</th>
                <th>TF Part</th>
                <th>Gold</th>
                <th>Awards</th>
              </tr>
            </thead>
            <tbody>
              ${playerRows}
            </tbody>
          </table>
        </div>

        ${subsSection}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modalSharePosterBtn" style="background:rgba(255,215,0,0.12); border-color:var(--secondary); color:var(--secondary); margin-right:auto;"><i class="fa-solid fa-camera"></i> 📸 Generate Match Poster</button>
        <button class="btn btn-primary" id="modalEditBtn"><i class="fa-solid fa-pen"></i> Edit Match</button>
        <button class="btn btn-secondary" id="modalOkBtn">Close</button>
      </div>
    `;

    overlay.classList.add('active');

    const closeModal = () => {
      overlay.classList.remove('active');
    };

    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('modalOkBtn')?.addEventListener('click', closeModal);
    document.getElementById('modalSharePosterBtn')?.addEventListener('click', () => {
      this.showSharePosterModal(match.id, players);
    });
    document.getElementById('modalEditBtn')?.addEventListener('click', () => {
      closeModal();
      window.EclipseApp.editMatch(match.id);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  showSharePosterModal(matchId, players) {
    const matches = this.db.getMatches();
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    if (!overlay || !content) return;
    const fmtDate = window.StatsEngine.formatDateFormatted;

    content.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title"><i class="fa-solid fa-camera" style="color:var(--secondary);"></i> Official Match Poster Graphic (${fmtDate(match.date)})</h3>
        <button class="modal-close" id="closePosterModalBtn">&times;</button>
      </div>
      <div class="modal-body text-center" style="padding: 1rem;">
        <p style="color:var(--text-secondary); margin-bottom:1rem; font-size:0.875rem;">
          High-definition post-game match card generated dynamically for Discord, Instagram, Telegram & WhatsApp.
        </p>

        <div style="background:#05070e; border-radius:10px; border:1px solid rgba(0,212,255,0.3); overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.8); max-width:100%; margin:0 auto;">
          <canvas id="matchPosterCanvas" style="width:100%; height:auto; display:block; aspect-ratio: 16/9;"></canvas>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn btn-secondary" id="posterCopyBtn"><i class="fa-solid fa-copy"></i> Copy Image to Clipboard</button>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-primary" id="posterDownloadBtn"><i class="fa-solid fa-download"></i> Download PNG</button>
          <button class="btn btn-secondary" id="posterCloseBtn">Close</button>
        </div>
      </div>
    `;

    overlay.classList.add('active');

    const canvas = document.getElementById('matchPosterCanvas');
    if (canvas && window.ChartHelper) {
      window.ChartHelper.generateMatchGraphic(canvas, match, players);
    }

    const closePoster = () => {
      overlay.classList.remove('active');
    };

    document.getElementById('closePosterModalBtn')?.addEventListener('click', closePoster);
    document.getElementById('posterCloseBtn')?.addEventListener('click', closePoster);

    document.getElementById('posterDownloadBtn')?.addEventListener('click', () => {
      const fileName = `Eclipse_Esports_${match.result.toUpperCase()}_${match.date}.png`;
      window.ChartHelper.downloadCanvasAsPng(canvas, fileName);
      if (window.showToast) window.showToast('📥 Match poster downloaded!', 'success');
    });

    document.getElementById('posterCopyBtn')?.addEventListener('click', () => {
      window.ChartHelper.copyCanvasToClipboard(canvas);
    });
  }
};
