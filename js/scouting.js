// Eclipse Esports Stats — Tactical Enemy Scouting & Counter Notes
(() => {
  'use strict';

  const STORAGE_KEY = 'eclipse:scouting_teams';

  const DEFAULT_SCOUT_TEAMS = [
    {
      id: 'scout-falcon',
      name: 'Team Falcon',
      tag: 'FLC',
      tier: 'S',
      region: 'Uzbekistan / Central Asia',
      signaturePicks: [
        { heroName: 'Fanny', role: 'Jungler', note: 'Asosiy jungler 75% WR bilan o‘ynaydi. 1-bosqichda ban qilish shart!', danger: 'high' },
        { heroName: 'Chou', role: 'Roamer', note: 'Agressiv roamer, ko‘k buffga erta invayt uyushtiradi.', danger: 'high' },
        { heroName: 'Beatrix', role: 'Gold Laner', note: 'Pozitsiyani yaxshi tanlaydi, Sniper va Shotgun kombinatsiyasi.', danger: 'medium' }
      ],
      priorityBans: [
        { heroName: 'Fanny', reason: 'Juda xavfli jungler, birinchi ban' },
        { heroName: 'Mathilda', reason: 'Erta rotatsiya va gankni kuchaytiradi' }
      ],
      counterNotes: '1. Fanny olinsa: darhol Khufra yoki Moskov javobini olish.\n2. 5-daqiqadagi 1-Turtle uchun 4 kishi oldindan yig‘ilish lozim.\n3. O‘yin 16-daqiqadan oshsa shoshilishadi, Late Game positioning bizda ustun.',
      h2h: { wins: 3, losses: 1 },
      lastPlayed: '2026-11-05'
    },
    {
      id: 'scout-alpha',
      name: 'Alpha Esports',
      tag: 'ALPHA',
      tier: 'A',
      region: 'Uzbekistan',
      signaturePicks: [
        { heroName: 'Ling', role: 'Jungler', note: 'Devorlar orqali tezkor harakat, Angela bilan kombinatsiya.', danger: 'high' },
        { heroName: 'Angela', role: 'Roamer', note: 'Ling yoki Fredrinn ustiga sakrab kiradi.', danger: 'medium' },
        { heroName: 'Claude', role: 'Gold Laner', note: 'Late Game scaling kuchli, 2 ta itemdan keyin xavfli.', danger: 'medium' }
      ],
      priorityBans: [
        { heroName: 'Ling', reason: 'Ularning asosiy drayveri' },
        { heroName: 'Diggie', reason: 'CC kompozitsiyamizni yopish uchun oladi' }
      ],
      counterNotes: '1. Ling tanlansa: Baxia jungler yoki Ruby tanlash va birinchi daqiqadayoq uning ko‘k buffini bosish.\n2. Claude kuchaymasdan 12-daqiqagacha bosim o‘tkazib push qilish.\n3. Late Game lord oldida ehtiyotkor bo‘lish.',
      h2h: { wins: 2, losses: 2 },
      lastPlayed: '2026-11-08'
    }
  ];

  class ScoutingManager {
    constructor(dataStore) {
      this.dataStore = dataStore;
      this.teams = this.loadTeams();
    }

    loadTeams() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch (_) {}
      return [...DEFAULT_SCOUT_TEAMS];
    }

    saveTeams() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.teams));
      } catch (_) {}
    }

    escape(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    addTeam(teamData) {
      const id = `scout-${Date.now()}`;
      const newTeam = {
        id,
        name: teamData.name || 'Yangi Raqib',
        tag: teamData.tag || 'RIV',
        tier: teamData.tier || 'A',
        region: teamData.region || 'Uzbekistan',
        signaturePicks: teamData.signaturePicks || [],
        priorityBans: teamData.priorityBans || [],
        counterNotes: teamData.counterNotes || '',
        h2h: { wins: Number(teamData.wins) || 0, losses: Number(teamData.losses) || 0 },
        lastPlayed: teamData.lastPlayed || new Date().toISOString().slice(0, 10)
      };
      this.teams.unshift(newTeam);
      this.saveTeams();
      return newTeam;
    }

    updateTeam(id, updateData) {
      const idx = this.teams.findIndex(t => t.id === id);
      if (idx === -1) return null;
      this.teams[idx] = { ...this.teams[idx], ...updateData };
      this.saveTeams();
      return this.teams[idx];
    }

    deleteTeam(id) {
      this.teams = this.teams.filter(t => t.id !== id);
      this.saveTeams();
    }

    recordH2H(id, isWin) {
      const team = this.teams.find(t => t.id === id);
      if (!team) return;
      team.h2h = team.h2h || { wins: 0, losses: 0 };
      if (isWin) team.h2h.wins++;
      else team.h2h.losses++;
      team.lastPlayed = new Date().toISOString().slice(0, 10);
      this.saveTeams();
    }

    render(containerId = 'scoutingContainer') {
      const container = document.getElementById(containerId);
      if (!container) return;

      const totalTeams = this.teams.length;
      let totalWins = 0;
      let totalLosses = 0;
      let totalSignatures = 0;

      this.teams.forEach(t => {
        totalWins += Number(t.h2h?.wins) || 0;
        totalLosses += Number(t.h2h?.losses) || 0;
        totalSignatures += (t.signaturePicks || []).length;
      });

      const totalMatches = totalWins + totalLosses;
      const totalWr = totalMatches ? Math.round((totalWins / totalMatches) * 100) : 0;

      container.innerHTML = `
        <div class="scouting-shell">
          <!-- Top Hero Section -->
          <section class="scouting-hero">
            <div class="scouting-hero__signal" aria-hidden="true">
              <i class="fa-solid fa-crosshairs"></i>
            </div>
            <div class="scouting-hero__copy">
              <p class="section-eyebrow">ECLIPSE TACTICAL // ENEMY DOSSIER</p>
              <h2>Raqib Jamoalar Razvedkasi (Scouting)</h2>
              <p>
                Raqib jamoalarning sevimli (signature) qahramonlari, majburiy ban prioritetlari va ularga qarshi tayyorlangan taktik rejalar (Counter Notes).
              </p>
            </div>
            <div class="scouting-telemetry">
              <span><strong>${totalTeams}</strong><small>Raqib jamoa</small></span>
              <span><strong>${totalSignatures}</strong><small>O‘rganilgan herolar</small></span>
              <span><strong>${totalWins}W - ${totalLosses}L</strong><small>H2H Rekord (${totalWr}%)</small></span>
            </div>
          </section>

          <!-- Action bar -->
          <div class="scouting-actions-bar">
            <div class="scouting-search-wrap">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <input type="search" id="scoutingSearchInput" class="form-input" placeholder="Raqib jamoa yoki qahramon bo‘yicha qidiring…">
            </div>
            <button type="button" class="btn btn-primary" id="openAddScoutModalBtn">
              <i class="fa-solid fa-plus"></i> Yangi raqib qo‘shish
            </button>
          </div>

          <!-- Dossier Cards Grid -->
          <div class="scouting-grid" id="scoutingCardsGrid">
            ${this.renderTeamCards(this.teams)}
          </div>
        </div>

        <!-- Add/Edit Team Modal -->
        <dialog class="scouting-dialog" id="scoutModal" aria-labelledby="scoutModalTitle">
          <div class="scouting-modal">
            <header class="scouting-modal__header">
              <div>
                <p class="scouting-modal__eyebrow">TACTICAL DATABASE // ENEMY PROFILE</p>
                <h3 id="scoutModalTitle"><i class="fa-solid fa-shield-halved" style="color:var(--primary);"></i> Raqib Jamoani Kiritish</h3>
              </div>
              <button type="button" class="scouting-modal__close" id="scoutModalCloseBtn" aria-label="Yopish"><kbd>Esc</kbd></button>
            </header>
            <form id="scoutForm" class="scouting-form">
              <input type="hidden" id="scoutEditId" value="">
              <div class="scouting-form-grid">
                <label>
                  <span>Jamoa nomi *</span>
                  <input type="text" class="form-input" id="scoutName" required placeholder="Masalan: Team Falcon">
                </label>
                <label>
                  <span>Tegi (Tag)</span>
                  <input type="text" class="form-input" id="scoutTag" placeholder="FLC" maxlength="8">
                </label>
                <label>
                  <span>Xavf Darajasi (Tier)</span>
                  <select class="form-select" id="scoutTier">
                    <option value="S">S-Tier (Top Raqib / Chempion)</option>
                    <option value="A" selected>A-Tier (Kuchli Jamoa)</option>
                    <option value="B">B-Tier (O‘rtacha)</option>
                  </select>
                </label>
                <label>
                  <span>Hudud / Region</span>
                  <input type="text" class="form-input" id="scoutRegion" value="Uzbekistan" placeholder="Uzbekistan / Central Asia">
                </label>
              </div>

              <div class="scouting-form-row">
                <label>
                  <span>Sevimli qahramonlar (Signature Picks)</span>
                  <input type="text" class="form-input" id="scoutSignatures" placeholder="Fanny, Chou, Beatrix (vergul bilan ajrating)">
                  <small>Raqib o‘yinchilari eng ko‘p oladigan asosiy comfort qahramonlar</small>
                </label>
              </div>

              <div class="scouting-form-row">
                <label>
                  <span>Majburiy 1-Banlar (Priority Bans)</span>
                  <input type="text" class="form-input" id="scoutBans" placeholder="Fanny, Mathilda (vergul bilan ajrating)">
                  <small>Ushbu jamoaga qarshi birinchi bosqichda ban qilinishi shart bo‘lganlar</small>
                </label>
              </div>

              <div class="scouting-form-row">
                <label>
                  <span>Taktik Eslatmalar & Counter Strategiya (Counter Notes)</span>
                  <textarea class="form-input" id="scoutNotes" rows="4" placeholder="1. Fanny olinsa: darhol Khufra va Moskov javobi.&#10;2. 5-daqiqada 4 kishi Turtle'ga yig‘iladi.&#10;3. Late Game'da xatolari ko‘p."></textarea>
                </label>
              </div>

              <div class="scouting-form-grid">
                <label>
                  <span>Bizning g‘alabalarimiz (Wins)</span>
                  <input type="number" class="form-input" id="scoutWins" value="0" min="0">
                </label>
                <label>
                  <span>Bizning mag‘lubiyatlarimiz (Losses)</span>
                  <input type="number" class="form-input" id="scoutLosses" value="0" min="0">
                </label>
              </div>

              <footer class="scouting-form-footer">
                <button type="button" class="btn btn-secondary" id="scoutModalCancelBtn">Bekor qilish</button>
                <button type="submit" class="btn btn-primary" id="scoutSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Saqlash</button>
              </footer>
            </form>
          </div>
        </dialog>
      `;

      this.bindEvents(container);
    }

    renderTeamCards(teamList) {
      if (!teamList.length) {
        return `
          <div class="scouting-empty">
            <i class="fa-solid fa-binoculars"></i>
            <p>Hozircha raqib jamoalar kiritilmagan yoki qidiruv bo‘yicha topilmadi.</p>
          </div>
        `;
      }

      return teamList.map(team => {
        const wins = Number(team.h2h?.wins) || 0;
        const losses = Number(team.h2h?.losses) || 0;
        const total = wins + losses;
        const wr = total ? Math.round((wins / total) * 100) : 0;
        const tierClass = team.tier === 'S' ? 'tier-s' : team.tier === 'A' ? 'tier-a' : 'tier-b';

        const signatureChips = (team.signaturePicks || []).map(p => {
          const heroName = typeof p === 'string' ? p : p.heroName;
          const note = typeof p === 'object' && p.note ? p.note : '';
          const isDanger = typeof p === 'object' && p.danger === 'high';
          return `
            <div class="scout-hero-chip ${isDanger ? 'is-danger' : ''}" title="${this.escape(note)}">
              <span class="scout-hero-chip__icon"><i class="fa-solid fa-bolt"></i></span>
              <strong class="scout-hero-chip__name">${this.escape(heroName)}</strong>
              ${isDanger ? '<span class="scout-hero-chip__badge">Xavfli</span>' : ''}
            </div>
          `;
        }).join('');

        const banChips = (team.priorityBans || []).map(b => {
          const heroName = typeof b === 'string' ? b : b.heroName;
          return `<span class="scout-ban-badge"><i class="fa-solid fa-ban"></i> ${this.escape(heroName)}</span>`;
        }).join('');

        const notesFormatted = this.escape(team.counterNotes || 'Eslatmalar kiritilmagan.').replace(/\n/g, '<br>');

        return `
          <article class="scout-card" data-team-id="${team.id}">
            <header class="scout-card__head">
              <div class="scout-card__identity">
                <span class="scout-card__tier-badge ${tierClass}">${team.tier}-TIER</span>
                <div>
                  <h3 class="scout-card__name">${this.escape(team.name)}</h3>
                  <small class="scout-card__region">${this.escape(team.region || 'Region')} · [${this.escape(team.tag || 'TAG')}]</small>
                </div>
              </div>
              <div class="scout-card__h2h">
                <span class="scout-card__score">${wins}W – ${losses}L</span>
                <small>${wr}% WR</small>
              </div>
            </header>

            <div class="scout-card__section">
              <span class="scout-card__label"><i class="fa-solid fa-star" style="color:var(--primary);"></i> Comfort / Signature Picks:</span>
              <div class="scout-card__heroes">
                ${signatureChips || '<span class="text-muted">Kiritilmagan</span>'}
              </div>
            </div>

            <div class="scout-card__section">
              <span class="scout-card__label"><i class="fa-solid fa-ban" style="color:#ef4444;"></i> Majburiy 1-Banlar:</span>
              <div class="scout-card__bans">
                ${banChips || '<span class="text-muted">Kiritilmagan</span>'}
              </div>
            </div>

            <div class="scout-card__section scout-card__notes-box">
              <span class="scout-card__label"><i class="fa-solid fa-chess" style="color:var(--primary);"></i> Counter Reja (Taktika):</span>
              <p class="scout-card__notes">${notesFormatted}</p>
            </div>

            <footer class="scout-card__footer">
              <div class="scout-card__h2h-buttons">
                <button type="button" class="btn btn-sm btn-secondary" data-h2h-win="${team.id}" title="G‘alaba qo‘shish">+ Win</button>
                <button type="button" class="btn btn-sm btn-secondary" data-h2h-loss="${team.id}" title="Mag‘lubiyat qo‘shish">+ Loss</button>
              </div>
              <div class="scout-card__manage-buttons">
                <button type="button" class="btn btn-sm btn-secondary" data-edit-team="${team.id}" title="Tahrirlash"><i class="fa-solid fa-pen-to-square"></i></button>
                <button type="button" class="btn btn-sm btn-secondary" data-delete-team="${team.id}" title="O‘chirish"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </footer>
          </article>
        `;
      }).join('\n');
    }

    bindEvents(container) {
      const modal = container.querySelector('#scoutModal');
      const openBtn = container.querySelector('#openAddScoutModalBtn');
      const closeBtn = container.querySelector('#scoutModalCloseBtn');
      const cancelBtn = container.querySelector('#scoutModalCancelBtn');
      const form = container.querySelector('#scoutForm');
      const searchInput = container.querySelector('#scoutingSearchInput');
      const grid = container.querySelector('#scoutingCardsGrid');

      // Search filter
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const q = searchInput.value.toLowerCase().trim();
          if (!q) {
            grid.innerHTML = this.renderTeamCards(this.teams);
            return;
          }
          const filtered = this.teams.filter(t => {
            const matchName = t.name.toLowerCase().includes(q);
            const matchTag = (t.tag || '').toLowerCase().includes(q);
            const matchHeroes = (t.signaturePicks || []).some(p => (p.heroName || p).toLowerCase().includes(q));
            return matchName || matchTag || matchHeroes;
          });
          grid.innerHTML = this.renderTeamCards(filtered);
        });
      }

      // Open Add Modal
      if (openBtn && modal) {
        openBtn.addEventListener('click', () => {
          form.reset();
          container.querySelector('#scoutEditId').value = '';
          container.querySelector('#scoutModalTitle').innerHTML = '<i class="fa-solid fa-shield-halved" style="color:var(--primary);"></i> Raqib Jamoani Kiritish';
          if (typeof modal.showModal === 'function') modal.showModal();
          else modal.setAttribute('open', '');
        });
      }

      // Close modal
      const closeModal = () => {
        if (!modal) return;
        if (typeof modal.close === 'function') modal.close();
        else modal.removeAttribute('open');
      };
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      if (modal) {
        modal.addEventListener('click', e => {
          if (e.target === modal) closeModal();
        });
      }

      // Handle card buttons (H2H, Edit, Delete)
      grid.addEventListener('click', e => {
        const winBtn = e.target.closest('[data-h2h-win]');
        if (winBtn) {
          const id = winBtn.dataset.h2hWin;
          this.recordH2H(id, true);
          this.render();
          window.showToast?.('G‘alaba qayd etildi!', 'success');
          return;
        }

        const lossBtn = e.target.closest('[data-h2h-loss]');
        if (lossBtn) {
          const id = lossBtn.dataset.h2hLoss;
          this.recordH2H(id, false);
          this.render();
          window.showToast?.('Mag‘lubiyat qayd etildi.', 'info');
          return;
        }

        const deleteBtn = e.target.closest('[data-delete-team]');
        if (deleteBtn) {
          const id = deleteBtn.dataset.deleteTeam;
          if (confirm('Ushbu raqib ma’lumotlarini o‘chirishni tasdiqlaysizmi?')) {
            this.deleteTeam(id);
            this.render();
            window.showToast?.('Raqib jamoa o‘chirildi.', 'info');
          }
          return;
        }

        const editBtn = e.target.closest('[data-edit-team]');
        if (editBtn) {
          const id = editBtn.dataset.editTeam;
          const team = this.teams.find(t => t.id === id);
          if (!team || !modal) return;

          container.querySelector('#scoutEditId').value = team.id;
          container.querySelector('#scoutName').value = team.name;
          container.querySelector('#scoutTag').value = team.tag || '';
          container.querySelector('#scoutTier').value = team.tier || 'A';
          container.querySelector('#scoutRegion').value = team.region || 'Uzbekistan';
          container.querySelector('#scoutSignatures').value = (team.signaturePicks || []).map(p => p.heroName || p).join(', ');
          container.querySelector('#scoutBans').value = (team.priorityBans || []).map(b => b.heroName || b).join(', ');
          container.querySelector('#scoutNotes').value = team.counterNotes || '';
          container.querySelector('#scoutWins').value = team.h2h?.wins || 0;
          container.querySelector('#scoutLosses').value = team.h2h?.losses || 0;

          container.querySelector('#scoutModalTitle').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:var(--primary);"></i> Raqib Ma’lumotlarini Tahrirlash';

          if (typeof modal.showModal === 'function') modal.showModal();
          else modal.setAttribute('open', '');
        }
      });

      // Submit Form
      if (form) {
        form.addEventListener('submit', e => {
          e.preventDefault();
          const editId = container.querySelector('#scoutEditId').value;
          const name = container.querySelector('#scoutName').value.trim();
          const tag = container.querySelector('#scoutTag').value.trim();
          const tier = container.querySelector('#scoutTier').value;
          const region = container.querySelector('#scoutRegion').value.trim();
          const signaturesRaw = container.querySelector('#scoutSignatures').value;
          const bansRaw = container.querySelector('#scoutBans').value;
          const counterNotes = container.querySelector('#scoutNotes').value.trim();
          const wins = Number(container.querySelector('#scoutWins').value) || 0;
          const losses = Number(container.querySelector('#scoutLosses').value) || 0;

          const signaturePicks = signaturesRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(name => ({ heroName: name, role: 'Flex', note: 'Signature pick', danger: 'high' }));

          const priorityBans = bansRaw
            .split(',')
            .map(b => b.trim())
            .filter(Boolean)
            .map(name => ({ heroName: name, reason: 'Priority 1st ban' }));

          if (editId) {
            this.updateTeam(editId, {
              name,
              tag,
              tier,
              region,
              signaturePicks,
              priorityBans,
              counterNotes,
              h2h: { wins, losses }
            });
            window.showToast?.('Raqib ma’lumotlari yangilandi!', 'success');
          } else {
            this.addTeam({
              name,
              tag,
              tier,
              region,
              signaturePicks,
              priorityBans,
              counterNotes,
              wins,
              losses
            });
            window.showToast?.('Yangi raqib jamoa qo‘shildi!', 'success');
          }

          closeModal();
          this.render();
        });
      }
    }
  }

  window.ScoutingManager = ScoutingManager;
})();
