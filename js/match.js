window.MatchManager = class MatchManager {
  constructor(dataStore, heroDb) {
    this.db = dataStore;
    this.heroDb = heroDb;
    this.quickAddMode = false;
    this.ocrImages = [null, null];
    this.pendingOcrData = null;
    this.ocrReviewConfirmed = false;
    this.confirmedUnknownHeroes = new Set();
    this.modalAccessibility = null;
    this.modalReturnFocus = null;
  }

  detachModalAccessibility() {
    if (!this.modalAccessibility) return;
    const { overlay, backdropHandler, keydownHandler } = this.modalAccessibility;
    overlay.removeEventListener('click', backdropHandler);
    document.removeEventListener('keydown', keydownHandler, true);
    this.modalAccessibility = null;
  }

  activateModalAccessibility(overlay, content, closeModal, { initialFocusSelector, preserveReturnFocus = false } = {}) {
    this.detachModalAccessibility();

    if (!preserveReturnFocus || !this.modalReturnFocus?.isConnected) {
      const activeElement = document.activeElement;
      this.modalReturnFocus = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    }

    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    content.setAttribute('aria-labelledby', 'modalTitle');
    content.removeAttribute('aria-label');
    content.setAttribute('tabindex', '-1');

    const focusableElements = () => [...content.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getClientRects().length > 0);

    const backdropHandler = event => {
      if (event.target === overlay) closeModal();
    };
    const keydownHandler = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        content.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !content.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !content.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    overlay.addEventListener('click', backdropHandler);
    document.addEventListener('keydown', keydownHandler, true);
    this.modalAccessibility = { overlay, backdropHandler, keydownHandler };

    const focusInitial = () => {
      if (!content.isConnected || overlay.getAttribute('aria-hidden') !== 'false') return;
      const initialFocus = initialFocusSelector ? content.querySelector(initialFocusSelector) : null;
      (initialFocus || focusableElements()[0] || content).focus({ preventScroll: true });
    };
    focusInitial();
    setTimeout(() => {
      if (!content.contains(document.activeElement)) focusInitial();
    }, 80);
  }

  closeModalSurface(overlay, content) {
    if (overlay.dataset.mandatory === 'true') return false;
    this.detachModalAccessibility();
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
    overlay.setAttribute('hidden', '');
    delete overlay.dataset.mandatory;
    content.removeAttribute('aria-labelledby');
    content.setAttribute('aria-label', 'Eclipse dialog oynasi');
    content.removeAttribute('tabindex');
    content.replaceChildren();
    document.body.style.overflow = '';

    const returnFocus = this.modalReturnFocus;
    this.modalReturnFocus = null;
    setTimeout(() => {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }, 0);
    return true;
  }

  escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  formatDataIssue(issue) {
    const labels = {
      invalid_date: 'Match sanasi noto‘g‘ri',
      unknown_result: 'W yoki L tasdiqlanmagan',
      invalid_duration: 'Davomiylik noto‘g‘ri',
      duration_conflict: 'Davomiylik qiymatlari mos emas',
      unclassified_scope: 'Statistik scope tasdiqlanmagan',
      scope_participant_mismatch: 'Statistik scope faol roster soniga mos emas',
      duplicate_participant: 'Takrorlangan ishtirokchi olib tashlangan',
      missing_participants: 'Ishtirokchilar topilmagan',
      too_many_participants: '5 tadan ortiq ishtirokchi aniqlangan',
      unidentified_participant: 'O‘yinchi aniqlanmagan',
      unknown_match_type: 'Match turi aniqlanmagan',
      unknown_role: 'Rol aniqlanmagan',
      unrecognized_hero: 'Hero katalogda topilmagan'
    };
    return labels[issue] || String(issue || 'Noma’lum tekshiruv').replaceAll('_', ' ');
  }

  insightMarkup(insights) {
    if (!insights?.length) return '';
    const isAdmin = window.EclipseApp?.authManager?.isAdmin?.() === true;
    return `
      <section class="match-insights-modal" aria-label="Match insightlari">
        <div class="match-insights-modal__heading"><div><p class="solar-eyebrow">AUTO HYPOTHESIS / CAPTAIN REVIEW</p><h4>Match signallari</h4></div><small>Bu xulosalar taktik hukm emas. VOD bilan tekshiriladi.</small></div>
        <div class="match-insights__grid is-modal">
          ${insights.map((insight, index) => `
            <article class="match-insight is-${insight.type}">
              <div class="match-insight__top"><span>${String(index + 1).padStart(2, '0')}</span><i class="fa-solid ${insight.icon}"></i></div>
              <p>${insight.label}</p>
              <h4>${this.escape(insight.title)}</h4>
              <div class="match-insight__metric">${this.escape(insight.metric)}</div>
              <small>${this.escape(insight.body)}</small>
              <div class="match-insight__evidence"><span>${this.escape(insight.confidence?.label || 'Sample noma’lum')}</span><span>n=${this.escape(insight.sample?.baselineMatches ?? 0)}</span></div>
              ${isAdmin ? `<button class="btn btn-sm btn-secondary publish-insight-btn" data-insight-index="${index}"><i class="fa-solid fa-thumbtack"></i> Tasdiqlab Briefingga yuborish</button>` : ''}
            </article>`).join('')}
        </div>
      </section>`;
  }

  static ROLES = ['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'];

  optionalNumber(input, options = {}) {
    const value = input?.value;
    if (value === '' || value === null || typeof value === 'undefined') return null;
    const parsed = options.float ? Number.parseFloat(value) : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  inferScope(rosterCount) {
    if (rosterCount >= 5) return 'team5';
    if (rosterCount >= 2) return 'squad';
    return 'individual';
  }

  guestRowMarkup(index, guest = null) {
    const active = Boolean(guest);
    const disabled = active ? '' : 'disabled';
    const value = (key, fallback = '') => this.escape(guest?.[key] ?? fallback);
    return `
      <div class="guest-stat-row ${active ? '' : 'benched'}" data-guest-index="${index}" style="background:rgba(var(--secondary-rgb),0.035); border:1px dashed rgba(var(--secondary-rgb),0.28); border-radius:10px; padding:1.1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; margin-bottom:0.75rem;">
          <div><strong style="color:var(--secondary);"><i class="fa-solid fa-user-tag"></i> Guest slot ${index + 1}</strong><small style="display:block; color:var(--text-muted);">Rosterga qo‘shilmagan o‘yinchi</small></div>
          <label style="display:flex; align-items:center; gap:0.45rem; cursor:pointer; color:var(--text-secondary);"><input type="checkbox" class="guest-active form-checkbox" ${active ? 'checked' : ''}> Ishlatish</label>
        </div>
        <div class="stat-inputs-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:0.75rem;">
          <div class="form-group" style="margin:0;"><label for="guest-name-${index}" class="form-label" style="font-size:0.75rem;">Guest IGN</label><input id="guest-name-${index}" class="guest-name form-input" value="${value('guestName')}" placeholder="Skrinshotdagi IGN" ${disabled}></div>
          <div class="form-group" style="margin:0;"><label for="guest-role-${index}" class="form-label" style="font-size:0.75rem;">Rol / Leyn</label><select id="guest-role-${index}" class="stat-role form-select" ${disabled}>${MatchManager.ROLES.map(role => `<option value="${role}" ${guest?.rolePlayed === role ? 'selected' : ''}>${role}</option>`).join('')}</select></div>
          <div class="form-group" style="margin:0;"><label for="guest-hero-${index}" class="form-label" style="font-size:0.75rem;">Qahramon</label><input id="guest-hero-${index}" class="stat-hero form-input" list="guest-hero-list-${index}" value="${value('heroUsed')}" ${disabled}><datalist id="guest-hero-list-${index}">${(this.heroDb?.getAll() || []).map(hero => `<option value="${this.escape(hero.name)}">${this.escape(hero.role)}</option>`).join('')}</datalist></div>
          <div class="form-group" style="margin:0;"><label for="guest-kills-${index}" class="form-label" style="font-size:0.75rem;">Kill</label><input id="guest-kills-${index}" type="number" min="0" class="stat-kills form-input" value="${value('kills')}" ${disabled}></div>
          <div class="form-group" style="margin:0;"><label for="guest-deaths-${index}" class="form-label" style="font-size:0.75rem;">Death</label><input id="guest-deaths-${index}" type="number" min="0" class="stat-deaths form-input" value="${value('deaths')}" ${disabled}></div>
          <div class="form-group" style="margin:0;"><label for="guest-assists-${index}" class="form-label" style="font-size:0.75rem;">Assist</label><input id="guest-assists-${index}" type="number" min="0" class="stat-assists form-input" value="${value('assists')}" ${disabled}></div>
          <div class="form-group" style="margin:0;"><label for="guest-score-${index}" class="form-label" style="font-size:0.75rem;">Baho</label><input id="guest-score-${index}" type="number" step="0.1" min="0" max="20" class="stat-score form-input" value="${value('inGameScore')}" ${disabled}></div>
          <div class="full-mode-fields" style="display:${this.quickAddMode ? 'none' : 'contents'};">
            <div class="form-group" style="margin:0;"><label for="guest-damage-dealt-${index}" class="form-label" style="font-size:0.75rem;">Yetkazilgan Damage</label><input id="guest-damage-dealt-${index}" type="number" min="0" class="stat-dmg-dealt form-input" value="${value('damageDealt')}" ${disabled}></div>
            <div class="form-group" style="margin:0;"><label for="guest-damage-received-${index}" class="form-label" style="font-size:0.75rem;">Qabul qilingan Damage</label><input id="guest-damage-received-${index}" type="number" min="0" class="stat-dmg-received form-input" value="${value('damageReceived')}" ${disabled}></div>
            <div class="form-group" style="margin:0;"><label for="guest-turret-damage-${index}" class="form-label" style="font-size:0.75rem;">Turret Damage</label><input id="guest-turret-damage-${index}" type="number" min="0" class="stat-turret-dmg form-input" value="${value('turretDamage')}" ${disabled}></div>
            <div class="form-group" style="margin:0;"><label for="guest-teamfight-${index}" class="form-label" style="font-size:0.75rem;">Jamoaviy jang (%)</label><input id="guest-teamfight-${index}" type="number" min="0" max="100" class="stat-tf form-input" value="${value('teamfightParticipation')}" ${disabled}></div>
            <div class="form-group" style="margin:0;"><label for="guest-gold-${index}" class="form-label" style="font-size:0.75rem;">Olingan gold</label><input id="guest-gold-${index}" type="number" min="0" class="stat-gold form-input" value="${value('goldEarned')}" ${disabled}></div>
          </div>
          <div class="form-group" style="margin:0;"><label for="guest-medal-${index}" class="form-label" style="font-size:0.75rem;">Medal</label><select id="guest-medal-${index}" class="stat-medal form-select" ${disabled}><option value="none">Yo‘q</option>${['mvp','gold','silver','bronze'].map(medal => `<option value="${medal}" ${guest?.medal === medal ? 'selected' : ''}>${medal.toUpperCase()}</option>`).join('')}</select></div>
          <div class="form-group" style="margin:0; display:flex; align-items:center; gap:1rem; padding-top:1.25rem;"><label><input type="checkbox" class="stat-savage form-checkbox" ${guest?.savage ? 'checked' : ''} ${disabled}> Savage</label><label><input type="checkbox" class="stat-maniac form-checkbox" ${guest?.maniac ? 'checked' : ''} ${disabled}> Maniac</label></div>
        </div>
      </div>`;
  }

  renderMatchForm(containerId, players, editingMatchId = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // OCR state belongs to one form instance only. Reset it for both add and
    // edit flows so a previous screenshot can never verify another match.
    this.ocrImages = [null, null];
    this.pendingOcrData = null;
    this.ocrReviewConfirmed = false;
    this.confirmedUnknownHeroes = new Set();

    const allPlayers = Array.isArray(players) ? players : [];
    let existingMatch = null;
    if (editingMatchId) existingMatch = this.db.getMatches().find(match => match.id === editingMatchId);
    const existingPlayerIds = new Set((existingMatch?.playerStats || []).map(stat => stat.playerId));
    players = allPlayers.filter(player => player.active !== false || existingPlayerIds.has(player.id));

    if (players.length === 0) {
      container.innerHTML = `
        <div class="card text-center" style="padding: 2.5rem;">
          <h3 style="color:var(--warning); margin-bottom: 0.5rem;"><i class="fa-solid fa-users-slash"></i> Tarkibda o‘yinchi yo‘q</h3>
          <p style="color:var(--text-secondary); margin-bottom: 1.5rem;"><strong>O‘yinchilar</strong> sahifasida jamoa a’zolarini qo‘shing, so‘ng matchni kiriting.</p>
          <button type="button" class="btn btn-primary" data-action="open-players"><i class="fa-solid fa-user-plus"></i> O‘yinchi qo‘shish</button>
        </div>
      `;
      container.querySelector('[data-action="open-players"]')?.addEventListener('click', () => window.EclipseApp.navigate('players'));
      return;
    }

    const isEditMode = !!existingMatch;
    const today = window.EclipseDateUtils?.today?.() || (() => {
      const now = new Date();
      const pad = value => String(value).padStart(2, '0');
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    })();
    const heroList = this.heroDb ? this.heroDb.getAll() : [];
    const rolesList = MatchManager.ROLES;

    const matchDateVal = isEditMode ? existingMatch.date : today;
    const matchResultVal = isEditMode ? existingMatch.result : '';
    const matchTypeVal = isEditMode ? (existingMatch.matchType || 'ranked') : 'ranked';
    const matchScopeVal = isEditMode ? (existingMatch.scope || this.inferScope(existingMatch.playerStats?.length || 0)) : this.inferScope(Math.min(players.length, 5));
    const matchTurtlesVal = isEditMode ? (existingMatch.teamTurtles ?? '') : '';
    const matchLordsVal = isEditMode ? (existingMatch.teamLords ?? '') : '';
    const matchTurretsVal = isEditMode ? (existingMatch.teamTurrets ?? '') : '';
    const matchNotesVal = isEditMode ? (existingMatch.notes || '') : '';
    const matchSessionLabelVal = isEditMode ? (existingMatch.sessionLabel || '') : '';

    let matchDurationMin = '';
    let matchDurationSec = '';
    if (isEditMode && existingMatch.durationSeconds !== null && typeof existingMatch.durationSeconds !== 'undefined') {
      matchDurationMin = Math.floor(existingMatch.durationSeconds / 60);
      matchDurationSec = existingMatch.durationSeconds % 60;
    }
    const existingGuests = isEditMode && Array.isArray(existingMatch.guestStats) ? existingMatch.guestStats : [];
    const guestRowsMarkup = Array.from({ length: Math.max(4, existingGuests.length) }, (_, index) =>
      this.guestRowMarkup(index, existingGuests[index] || null)
    ).join('');

    let html = `
      <form id="match-entry-form">
        <!-- AI SCREENSHOT OCR SCANNER CARD -->
        ${!isEditMode ? `
        <div class="card mb-4" id="aiOcrCard" style="background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.07) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(var(--primary-rgb), 0.38); box-shadow: 0 8px 32px rgba(var(--primary-rgb), 0.08);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:1rem;">
            <div>
              <h3 class="card-title" style="margin:0; color:var(--primary); font-size:1.15rem;">
                <i class="fa-solid fa-wand-magic-sparkles"></i> 📸 AI Skrinshot Orqali Avtomatik Kiritish
              </h3>
              <p style="color:var(--text-secondary); margin:0.25rem 0 0 0; font-size:0.85rem;">
                Match tugaganidagi 1 yoki 2 ta skrinshotni tashlang (yoki to'g'ridan-to'g'ri <kbd>Ctrl+V</kbd> / <kbd>Cmd+V</kbd> qilib rasm qo'ying) — AI hamma ma'lumotlarni o'zi to'ldiradi!
              </p>
            </div>
            <span class="badge" style="background:rgba(var(--primary-rgb),0.15); color:var(--primary); border:1px solid rgba(var(--primary-rgb),0.4); font-weight:700; padding:6px 12px;">
              <i class="fa-solid fa-bolt"></i> Gemini Flash Vision
            </span>
          </div>

          <div class="ocr-drop-grid">
            <!-- Slot 1: Scoreboard / KDA -->
            <div class="ocr-drop-box" id="ocrDropSlot1" data-slot="0" role="button" tabindex="0" aria-label="Scoreboard skrinshotini tanlash" aria-controls="ocrFileInput1">
              <input type="file" id="ocrFileInput1" accept="image/*" class="hidden" aria-label="Scoreboard skrinshot fayli" />
              <div class="ocr-drop-content" id="ocrDropContent1">
                <i class="fa-solid fa-image" style="font-size:1.8rem; color:var(--primary); margin-bottom:0.35rem;"></i>
                <strong style="color:var(--text-primary); font-size:0.88rem;">1-Skrinshot (Scoreboard)</strong>
                <span style="font-size:0.75rem; color:var(--text-muted);">G'alaba/Mag'lubiyat, Vaqt, Qahramonlar, K/D/A, Medallar</span>
              </div>
              <div class="ocr-preview-wrap hidden" id="ocrPreviewWrap1">
                <img id="ocrPreviewImg1" src="" alt="Screenshot 1" />
                <button type="button" class="ocr-remove-btn" id="ocrRemoveBtn1" title="O'chirish">&times;</button>
              </div>
            </div>

            <!-- Slot 2: Damage / Data -->
            <div class="ocr-drop-box" id="ocrDropSlot2" data-slot="1" role="button" tabindex="0" aria-label="Damage skrinshotini tanlash" aria-controls="ocrFileInput2">
              <input type="file" id="ocrFileInput2" accept="image/*" class="hidden" aria-label="Damage skrinshot fayli" />
              <div class="ocr-drop-content" id="ocrDropContent2">
                <i class="fa-solid fa-chart-column" style="font-size:1.8rem; color:var(--secondary); margin-bottom:0.35rem;"></i>
                <strong style="color:var(--text-primary); font-size:0.88rem;">2-Skrinshot (Data / Damage — ixtiyoriy)</strong>
                <span style="font-size:0.75rem; color:var(--text-muted);">Hero Damage, Damage received, Turret, TF %, Gold</span>
              </div>
              <div class="ocr-preview-wrap hidden" id="ocrPreviewWrap2">
                <img id="ocrPreviewImg2" src="" alt="Screenshot 2" />
                <button type="button" class="ocr-remove-btn" id="ocrRemoveBtn2" title="O'chirish">&times;</button>
              </div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-top:0.5rem;">
            <div style="font-size:0.8rem; color:var(--text-muted);">
              <i class="fa-solid fa-paste" style="color:var(--primary);"></i> Skrinshotni nusxalab to'g'ridan-to'g'ri <kbd>Ctrl+V</kbd> bilan tashlashingiz mumkin
            </div>
            <button type="button" class="btn ocr-scan-btn" id="startOcrScanBtn" disabled>
              <i class="fa-solid fa-wand-magic-sparkles"></i> Skanerlash & Formani To'ldirish
            </button>
          </div>
          <div id="ocrStatusMsg" style="margin-top:0.75rem; font-size:0.85rem;" class="hidden"></div>
          <div id="ocrReviewPanel" class="hidden" style="margin-top:1rem;"></div>
        </div>
        ` : ''}

        <div class="quick-add-banner">
          <div>
            <span class="badge">${this.quickAddMode ? '⚡ TEZKOR KIRITISH' : '📋 TO‘LIQ MA’LUMOT'}</span>
            <span style="color:var(--text-secondary); font-size:0.85rem; margin-left:0.5rem;">
              ${this.quickAddMode ? 'Faqat asosiy ko‘rsatkichlar: K/D/A, qahramon, medal va baho' : 'Damage, oltin va jamoaviy jang foizi bilan to‘liq statistika'}
            </span>
          </div>
          <button type="button" class="btn btn-sm ${this.quickAddMode ? 'btn-primary' : 'btn-secondary'}" id="toggle-quick-add">
            <i class="fa-solid fa-bolt"></i> ${this.quickAddMode ? 'To‘liq rejimga o‘tish' : 'Tezkor rejimga o‘tish'}
          </button>
        </div>

        ${isEditMode ? `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; background:rgba(var(--primary-rgb),0.08); padding:0.75rem 1.25rem; border-radius:10px; border:1px solid rgba(var(--primary-rgb),0.3);">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-pen-to-square" style="color:var(--primary); font-size:1.25rem;"></i>
              <span style="font-weight:700; color:var(--text-primary);">${window.StatsEngine.formatDateFormatted(existingMatch.date)} kungi match tahrirlanmoqda</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="cancel-edit-btn"><i class="fa-solid fa-xmark"></i> Tahrirni bekor qilish</button>
          </div>
        ` : ''}

        <div class="card mb-4">
          <h3 class="card-title mb-3"><i class="fa-solid fa-list-check"></i> 1. Jamoa va match tafsilotlari</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
            <div class="form-group">
              <label for="match-date" class="form-label"><i class="fa-regular fa-calendar"></i> Match sanasi</label>
              <input type="date" id="match-date" value="${matchDateVal}" class="form-input date-input" required />
            </div>

            <div class="form-group">
              <label for="match-type" class="form-label"><i class="fa-solid fa-tag"></i> Match turi</label>
              <select id="match-type" class="form-select">
                <option value="ranked" ${matchTypeVal === 'ranked' ? 'selected' : ''}>⚔️ Reyting</option>
                <option value="scrim" ${matchTypeVal === 'scrim' ? 'selected' : ''}>🤝 Skrim</option>
                <option value="tournament" ${matchTypeVal === 'tournament' ? 'selected' : ''}>🏆 Turnir</option>
                <option value="casual" ${matchTypeVal === 'casual' ? 'selected' : ''}>🎮 Oddiy o‘yin</option>
              </select>
            </div>

            <div class="form-group">
              <label for="match-scope" class="form-label"><i class="fa-solid fa-layer-group"></i> Statistik scope</label>
              <select id="match-scope" class="form-select" aria-describedby="match-scope-help" disabled>
                <option value="team5" ${matchScopeVal === 'team5' ? 'selected' : ''}>Team 5 — rasmiy jamoa matchi</option>
                <option value="squad" ${matchScopeVal === 'squad' ? 'selected' : ''}>Practice Lite — 2–4 roster + guest</option>
                <option value="individual" ${matchScopeVal === 'individual' ? 'selected' : ''}>Practice Lite — 1 roster o‘yinchi</option>
                <option value="unclassified" ${matchScopeVal === 'unclassified' ? 'selected' : ''}>Tekshirish kerak — eski yozuv</option>
              </select>
              <small id="match-scope-help" style="display:block; color:var(--text-muted); margin-top:0.35rem;">Faol roster soniga qarab avtomatik tekshiriladi.</small>
            </div>

            <div class="form-group">
              <span class="form-label" id="match-result-label"><i class="fa-solid fa-trophy"></i> Match natijasi</span>
              <div role="radiogroup" aria-labelledby="match-result-label" style="display:flex; gap:1rem; align-items:center; height:42px;">
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--success); font-weight:600;">
                  <input type="radio" name="match-result" value="win" ${matchResultVal === 'win' ? 'checked' : ''} class="form-checkbox" /> G‘ALABA <i class="fa-solid fa-circle-check"></i>
                </label>
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; color:var(--danger); font-weight:600;">
                  <input type="radio" name="match-result" value="loss" ${matchResultVal === 'loss' ? 'checked' : ''} class="form-checkbox" /> MAG‘LUBIYAT <i class="fa-solid fa-circle-xmark"></i>
                </label>
              </div>
            </div>

            <div class="form-group">
              <span class="form-label" id="match-duration-label"><i class="fa-regular fa-clock" style="color:var(--primary);"></i> Match davomiyligi (daq : son)</span>
              <div role="group" aria-labelledby="match-duration-label" style="display:flex; align-items:center; gap:0.5rem;">
                <input type="number" id="match-duration-min" aria-label="Match davomiyligi, daqiqa" min="0" max="120" value="${matchDurationMin}" class="form-input" placeholder="Daq. (masalan, 15)" style="text-align:center;" />
                <span style="font-weight:bold; color:var(--text-muted);">:</span>
                <input type="number" id="match-duration-sec" aria-label="Match davomiyligi, soniya" min="0" max="59" value="${matchDurationSec !== '' && matchDurationSec < 10 ? '0' + matchDurationSec : matchDurationSec}" class="form-input" placeholder="Son. (masalan, 30)" style="text-align:center;" />
              </div>
            </div>

            <div class="form-group">
              <label for="team-turtles" class="form-label"><i class="fa-solid fa-shield-halved" style="color:var(--success);"></i> Olingan Turtle (0–10)</label>
              <input type="number" id="team-turtles" min="0" max="10" value="${matchTurtlesVal}" class="form-input" placeholder="0" />
            </div>

            <div class="form-group">
              <label for="team-lords" class="form-label"><i class="fa-solid fa-crown" style="color:var(--secondary);"></i> Olingan Lord (0–10)</label>
              <input type="number" id="team-lords" min="0" max="10" value="${matchLordsVal}" class="form-input" placeholder="0" />
            </div>

            <div class="form-group">
              <label for="team-turrets" class="form-label"><i class="fa-solid fa-chess-rook" style="color:var(--primary);"></i> Yo‘q qilingan turret (0–9)</label>
              <input type="number" id="team-turrets" min="0" max="9" value="${matchTurretsVal}" class="form-input" placeholder="0" />
            </div>

            <div class="form-group" style="grid-column: 1 / -1;">
              <label for="match-notes" class="form-label"><i class="fa-regular fa-note-sticky"></i> Match izohi (ixtiyoriy)</label>
              <input type="text" id="match-notes" value="${this.escape(matchNotesVal)}" class="form-input" placeholder="Turnir nomi, bosqich, raqib jamoa yoki draft strategiyasi..." />
            </div>

            <div class="form-group" style="grid-column: 1 / -1;">
              <label for="match-session-label" class="form-label"><i class="fa-solid fa-link"></i> Session nomi (ixtiyoriy)</label>
              <input type="text" id="match-session-label" value="${this.escape(matchSessionLabelVal)}" class="form-input" placeholder="Masalan: 30-avgust individual trening" />
              <small style="display:block; color:var(--text-muted); margin-top:0.35rem;">Bir xil session nomi bilan kiritilgan matchlar keyin bir guruhda ko‘rsatiladi.</small>
            </div>
          </div>
        </div>

        <div class="card mb-4">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
            <div>
              <h3 class="card-title" style="margin:0;"><i class="fa-solid fa-users"></i> 2. Tarkib va rollarni tanlash</h3>
              <p style="color:var(--text-muted); margin:0.25rem 0 0 0; font-size:0.875rem;">
                Har bir o‘yinchi uchun bu matchdagi <strong>rolni</strong> belgilang. Bir vaqtda <strong>5 ta faol o‘yinchi</strong> tanlanadi; zaxiradagilar statistikaga kiritilmaydi.
              </p>
            </div>
            <div style="font-size:0.875rem; color:var(--text-secondary);" id="active-players-count-badge">
              Faol tarkib: <strong id="active-count-num" style="color:var(--success);">5</strong> / 5
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
      const toggleText = isBenched ? 'Zaxira' : 'Faol tarkib';

      const defaultRole = (pStats && pStats.rolePlayed) ? pStats.rolePlayed : rolesList[idx % rolesList.length];
      const heroUsedVal = pStats ? (pStats.heroUsed || '') : '';
      const killsVal = pStats ? (pStats.kills ?? '') : '';
      const deathsVal = pStats ? (pStats.deaths ?? '') : '';
      const assistsVal = pStats ? (pStats.assists ?? '') : '';
      const scoreVal = pStats ? (pStats.inGameScore ?? '') : '';
      const dmgDealtVal = pStats ? (pStats.damageDealt ?? '') : '';
      const dmgRcvdVal = pStats ? (pStats.damageReceived ?? '') : '';
      const turretDmgVal = pStats ? (pStats.turretDamage ?? '') : '';
      const tfVal = pStats ? (pStats.teamfightParticipation ?? '') : '';
      const goldVal = pStats ? (pStats.goldEarned ?? '') : '';
      const medalVal = pStats ? (pStats.medal || 'none') : 'none';
      const savageChecked = pStats && pStats.savage ? 'checked' : '';
      const maniacChecked = pStats && pStats.maniac ? 'checked' : '';
      const safePlayerId = this.escape(p.id);
      const safePlayerName = this.escape(p.name);

      html += `
        <div class="player-stat-row ${benchedClass}" data-player-id="${safePlayerId}" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-light); border-radius: 10px; padding: 1.25rem; transition: all 0.25s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <h4 style="color: var(--primary); margin:0;"><i class="fa-solid fa-user"></i> ${safePlayerName}</h4>
              <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-secondary);">#${idx+1}</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <button type="button" class="sub-toggle ${toggleClass}" data-player-id="${safePlayerId}" aria-pressed="${!isBenched}" aria-label="${safePlayerName}: ${toggleText}">
                <i class="fa-solid ${toggleIcon}"></i> <span>${toggleText}</span>
              </button>
            </div>
          </div>

          <div class="stat-inputs-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem;">
            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-role" class="form-label" style="font-size:0.75rem; color:var(--secondary); font-weight:700;"><i class="fa-solid fa-map-pin"></i> Rol / Leyn</label>
              <select id="player-${safePlayerId}-role" class="stat-role form-select" ${isBenched ? 'disabled' : ''} style="font-weight:600;">
                ${rolesList.map(r => `<option value="${r}" ${r === defaultRole ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-hero" class="form-label" style="font-size:0.75rem;">O‘ynalgan qahramon</label>
              <input id="player-${safePlayerId}-hero" type="text" list="hero-list-${safePlayerId}" class="stat-hero form-input" value="${this.escape(heroUsedVal)}" placeholder="Qahramonni yozing yoki tanlang..." ${isBenched ? 'disabled' : ''} required />
              <datalist id="hero-list-${safePlayerId}">
                ${heroList.map(h => `<option value="${this.escape(h.name)}">${this.escape(h.role)}</option>`).join('')}
              </datalist>
            </div>

            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-kills" class="form-label" style="font-size:0.75rem;">Kill</label>
              <input id="player-${safePlayerId}-kills" type="number" class="stat-kills form-input" min="0" value="${killsVal}" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-deaths" class="form-label" style="font-size:0.75rem;">Death</label>
              <input id="player-${safePlayerId}-deaths" type="number" class="stat-deaths form-input" min="0" value="${deathsVal}" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-assists" class="form-label" style="font-size:0.75rem;">Assist</label>
              <input id="player-${safePlayerId}-assists" type="number" class="stat-assists form-input" min="0" value="${assistsVal}" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-score" class="form-label" style="font-size:0.75rem;">Baho (masalan, 10.5)</label>
              <input id="player-${safePlayerId}-score" type="number" step="0.1" class="stat-score form-input" min="0" max="20" value="${scoreVal}" placeholder="0.0" ${isBenched ? 'disabled' : ''} required />
            </div>

            <div class="full-mode-fields" style="display:${this.quickAddMode ? 'none' : 'contents'};">
              <div class="form-group" style="margin:0;">
                <label for="player-${safePlayerId}-damage-dealt" class="form-label" style="font-size:0.75rem;">Yetkazilgan Damage</label>
                <input id="player-${safePlayerId}-damage-dealt" type="number" class="stat-dmg-dealt form-input" min="0" value="${dmgDealtVal}" placeholder="masalan, 45000" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label for="player-${safePlayerId}-damage-received" class="form-label" style="font-size:0.75rem;">Qabul qilingan Damage</label>
                <input id="player-${safePlayerId}-damage-received" type="number" class="stat-dmg-received form-input" min="0" value="${dmgRcvdVal}" placeholder="masalan, 32000" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label for="player-${safePlayerId}-turret-damage" class="form-label" style="font-size:0.75rem;">Turret Damage</label>
                <input id="player-${safePlayerId}-turret-damage" type="number" class="stat-turret-dmg form-input" min="0" value="${turretDmgVal}" placeholder="masalan, 8500" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label for="player-${safePlayerId}-teamfight" class="form-label" style="font-size:0.75rem;">Jamoaviy jang (%)</label>
                <input id="player-${safePlayerId}-teamfight" type="number" class="stat-tf form-input" min="0" max="100" value="${tfVal}" placeholder="masalan, 75" ${isBenched ? 'disabled' : ''} />
              </div>

              <div class="form-group" style="margin:0;">
                <label for="player-${safePlayerId}-gold" class="form-label" style="font-size:0.75rem;">Olingan gold</label>
                <input id="player-${safePlayerId}-gold" type="number" class="stat-gold form-input" min="0" value="${goldVal}" placeholder="masalan, 12500" ${isBenched ? 'disabled' : ''} />
              </div>
            </div>

            <div class="form-group" style="margin:0;">
              <label for="player-${safePlayerId}-medal" class="form-label" style="font-size:0.75rem;">Olingan medal</label>
              <select id="player-${safePlayerId}-medal" class="stat-medal form-select" ${isBenched ? 'disabled' : ''}>
                <option value="none" ${medalVal === 'none' ? 'selected' : ''}>Yo‘q</option>
                <option value="mvp" ${medalVal === 'mvp' ? 'selected' : ''}>👑 MVP</option>
                <option value="gold" ${medalVal === 'gold' ? 'selected' : ''}>🥇 Gold</option>
                <option value="silver" ${medalVal === 'silver' ? 'selected' : ''}>🥈 Silver</option>
                <option value="bronze" ${medalVal === 'bronze' ? 'selected' : ''}>🍫 Bronze (shokolad)</option>
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

        <div class="card mb-4">
          <div style="margin-bottom:1rem;">
            <h3 class="card-title" style="margin:0;"><i class="fa-solid fa-user-tag"></i> 3. Guest slotlar</h3>
            <p style="color:var(--text-muted); margin:0.25rem 0 0; font-size:0.875rem;">Practice Lite mashqida rosterga kirmagan jamoadoshlarni alohida guest sifatida saqlang. Ular roster statistikasi bilan aralashmaydi.</p>
          </div>
          <div id="guest-stats-section" style="display:flex; flex-direction:column; gap:1rem;">${guestRowsMarkup}</div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:1rem; margin-bottom:2rem;">
          <div id="matchValidationSummary" class="form-validation-message hidden" role="alert" aria-live="assertive"></div>
          ${isEditMode ? `
          <button type="button" class="btn btn-secondary btn-lg" id="cancel-edit-btn-bottom"><i class="fa-solid fa-xmark"></i> Bekor qilish</button>
          ` : ''}
          <button type="submit" class="btn btn-primary btn-lg">
            <i class="fa-solid fa-floppy-disk"></i> ${isEditMode ? 'Match statistikasini yangilash' : 'Match statistikasini saqlash'}
          </button>
        </div>
      </form>
    `;

    container.innerHTML = html;

    // Helper to update active players count
    const updateActiveCount = () => {
      const activeRosterRows = container.querySelectorAll('.player-stat-row:not(.benched)');
      const activeGuestRows = container.querySelectorAll('.guest-stat-row:not(.benched)');
      const activeCount = activeRosterRows.length + activeGuestRows.length;
      const countEl = document.getElementById('active-count-num');
      if (countEl) {
        countEl.textContent = activeCount;
        countEl.style.color = activeCount === 5 ? 'var(--success)' : 'var(--warning)';
      }
      const scopeSelect = document.getElementById('match-scope');
      if (scopeSelect) scopeSelect.value = this.inferScope(activeRosterRows.length);
    };

    const showValidationError = (message) => {
      const summary = document.getElementById('matchValidationSummary');
      if (summary) {
        summary.textContent = message;
        summary.classList.remove('hidden');
      }
      if (window.showToast) window.showToast(message, 'warning');
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
          targetBtn.setAttribute('aria-pressed', 'false');
          targetBtn.setAttribute('aria-label', `${row.querySelector('h4').textContent.trim()}: Zaxira`);
          icon.className = 'fa-solid fa-chair';
          text.textContent = 'Zaxira';
          row.classList.add('benched');
          inputs.forEach(inp => {
            inp.disabled = true;
            inp.removeAttribute('required');
          });
        } else {
          const activeParticipantCount = container.querySelectorAll('.player-stat-row:not(.benched), .guest-stat-row:not(.benched)').length;
          if (activeParticipantCount >= 5) {
            showValidationError('Matchda ko‘pi bilan 5 ta ishtirokchi bo‘lishi mumkin. Avval roster yoki guest slotni o‘chiring.');
            return;
          }
          // Switch to Playing
          targetBtn.classList.remove('benched');
          targetBtn.classList.add('playing');
          targetBtn.setAttribute('aria-pressed', 'true');
          targetBtn.setAttribute('aria-label', `${row.querySelector('h4').textContent.trim()}: Faol tarkib`);
          icon.className = 'fa-solid fa-gamepad';
          text.textContent = 'Faol tarkib';
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

    container.querySelectorAll('.guest-active').forEach(toggle => {
      toggle.addEventListener('change', event => {
        const row = event.currentTarget.closest('.guest-stat-row');
        const controls = row.querySelectorAll('.form-input, .form-select, .form-checkbox:not(.guest-active)');
        if (event.currentTarget.checked) {
          const activeParticipantCount = container.querySelectorAll('.player-stat-row:not(.benched), .guest-stat-row:not(.benched)').length;
          if (activeParticipantCount >= 5) {
            event.currentTarget.checked = false;
            showValidationError('Matchda ko‘pi bilan 5 ta ishtirokchi bo‘lishi mumkin. Avval boshqa slotni o‘chiring.');
            return;
          }
          row.classList.remove('benched');
          controls.forEach(control => { control.disabled = false; });
        } else {
          row.classList.add('benched');
          controls.forEach(control => { control.disabled = true; });
        }
        updateActiveCount();
      });
    });

    updateActiveCount();

    // Toggle quick add mode
    document.getElementById('toggle-quick-add')?.addEventListener('click', () => {
      this.quickAddMode = !this.quickAddMode;
      container.querySelectorAll('.full-mode-fields').forEach(fields => {
        fields.style.display = this.quickAddMode ? 'none' : 'contents';
      });
      const banner = container.querySelector('.quick-add-banner');
      const badge = banner?.querySelector('.badge');
      const description = badge?.nextElementSibling;
      const button = document.getElementById('toggle-quick-add');
      if (badge) badge.textContent = this.quickAddMode ? '⚡ TEZKOR KIRITISH' : '📋 TO‘LIQ MA’LUMOT';
      if (description) description.textContent = this.quickAddMode
        ? 'Faqat asosiy ko‘rsatkichlar: K/D/A, qahramon, medal va baho'
        : 'Damage, oltin va jamoaviy jang foizi bilan to‘liq statistika';
      if (button) {
        button.classList.toggle('btn-primary', this.quickAddMode);
        button.classList.toggle('btn-secondary', !this.quickAddMode);
        button.innerHTML = `<i class="fa-solid fa-bolt"></i> ${this.quickAddMode ? 'To‘liq rejimga o‘tish' : 'Tezkor rejimga o‘tish'}`;
      }
    });

    // Setup AI Screenshot OCR Handlers (only in Add mode)
    if (!isEditMode) {
      this.setupOcrHandlers(container, players);
    }

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

      const activeRosterRows = Array.from(container.querySelectorAll('.player-stat-row:not(.benched)'));
      const activeGuestRows = Array.from(container.querySelectorAll('.guest-stat-row:not(.benched)'));
      const participantCount = activeRosterRows.length + activeGuestRows.length;
      if (participantCount === 0) {
        showValidationError('Kamida bitta faol o‘yinchini tanlang.');
        return;
      }
      if (participantCount > 5) {
        showValidationError('Bitta matchda ko‘pi bilan 5 ta ishtirokchi saqlanadi.');
        return;
      }

      const durationMinInput = document.getElementById('match-duration-min');
      const durationSecInput = document.getElementById('match-duration-sec');
      const hasDuration = durationMinInput.value !== '' || durationSecInput.value !== '';
      const durMin = this.optionalNumber(durationMinInput) ?? 0;
      const durSec = this.optionalNumber(durationSecInput) ?? 0;
      if (hasDuration && (durMin < 0 || durMin > 120 || durSec < 0 || durSec > 59)) {
        showValidationError('Match davomiyligini 0–120 daqiqa va 0–59 soniya oralig‘ida kiriting.');
        return;
      }
      const totalDurSec = hasDuration ? (durMin * 60) + durSec : null;
      const durFormatted = totalDurSec === null ? null : window.StatsEngine.formatDuration(totalDurSec);
      const sessionLabel = document.getElementById('match-session-label')?.value.trim() || '';
      const sessionSlug = sessionLabel
        ? sessionLabel.toLocaleLowerCase('uz-UZ')
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60)
        : '';
      const inferredScope = this.inferScope(activeRosterRows.length);
      const resultInput = document.querySelector('input[name="match-result"]:checked');
      if (!resultInput || !['win', 'loss'].includes(resultInput.value)) {
        showValidationError('Match natijasini W yoki L sifatida aniq belgilang.');
        return;
      }
      const matchDate = document.getElementById('match-date').value;
      const validDate = window.EclipseDateUtils?.isValidDateOnly
        ? window.EclipseDateUtils.isValidDateOnly(matchDate)
        : /^\d{4}-\d{2}-\d{2}$/.test(matchDate);
      if (!validDate) {
        showValidationError('Haqiqiy match sanasini tanlang.');
        return;
      }

      const matchObj = {
        date: matchDate,
        matchType: document.getElementById('match-type')?.value || 'ranked',
        scope: inferredScope,
        result: resultInput.value,
        durationSeconds: totalDurSec,
        durationFormatted: durFormatted,
        teamTurtles: this.optionalNumber(document.getElementById('team-turtles')),
        teamLords: this.optionalNumber(document.getElementById('team-lords')),
        teamTurrets: this.optionalNumber(document.getElementById('team-turrets')),
        notes: document.getElementById('match-notes').value.trim(),
        sessionId: sessionSlug ? `session-${sessionSlug}` : null,
        sessionLabel: sessionLabel || null,
        playerStats: [],
        guestStats: [],
        substitutes: []
      };

      const allRows = container.querySelectorAll('.player-stat-row');
      const validationErrors = [];
      const unknownHeroes = new Set();

      const readParticipantStats = (row, participantName) => {
        const heroInput = row.querySelector('.stat-hero');
        const heroName = (heroInput?.value || '').trim();
        const canonicalHero = this.heroDb?.resolve?.(heroName) || null;
        const kills = this.optionalNumber(row.querySelector('.stat-kills'));
        const deaths = this.optionalNumber(row.querySelector('.stat-deaths'));
        const assists = this.optionalNumber(row.querySelector('.stat-assists'));
        const score = this.optionalNumber(row.querySelector('.stat-score'), { float: true });
        const teamfightParticipation = this.optionalNumber(row.querySelector('.stat-tf'));

        if (!heroName) {
          validationErrors.push(`${participantName}: qahramonni tanlash majburiy.`);
          heroInput?.classList.add('is-invalid');
        } else {
          heroInput?.classList.remove('is-invalid');
          if (this.heroDb && !this.heroDb.exists(heroName) && !this.confirmedUnknownHeroes.has(heroName.toLowerCase())) {
            unknownHeroes.add(heroName);
          }
        }
        if ([kills, deaths, assists].some(value => value === null || value < 0)) {
          validationErrors.push(`${participantName}: K/D/A to‘liq va manfiy bo‘lmagan qiymatlarda bo‘lishi kerak.`);
        }
        if (score !== null && (score < 0 || score > 20)) {
          validationErrors.push(`${participantName}: baho 0.0 va 20.0 oralig‘ida bo‘lishi kerak.`);
        }
        if (teamfightParticipation !== null && (teamfightParticipation < 0 || teamfightParticipation > 100)) {
          validationErrors.push(`${participantName}: jamoaviy jangdagi ishtirok 0–100% oralig‘ida bo‘lishi kerak.`);
        }

        return {
          rolePlayed: row.querySelector('.stat-role')?.value || null,
          heroId: canonicalHero?.id || null,
          heroNameSnapshot: canonicalHero?.name || heroName || null,
          heroUsed: canonicalHero?.name || heroName || null,
          heroResolution: canonicalHero?.id ? 'canonical' : heroName ? 'legacy_name' : 'unresolved',
          kills,
          deaths,
          assists,
          inGameScore: score,
          damageDealt: this.optionalNumber(row.querySelector('.stat-dmg-dealt')),
          damageReceived: this.optionalNumber(row.querySelector('.stat-dmg-received')),
          turretDamage: this.optionalNumber(row.querySelector('.stat-turret-dmg')),
          teamfightParticipation,
          goldEarned: this.optionalNumber(row.querySelector('.stat-gold')),
          medal: row.querySelector('.stat-medal')?.value === 'none' ? null : row.querySelector('.stat-medal')?.value,
          savage: row.querySelector('.stat-savage')?.checked === true,
          maniac: row.querySelector('.stat-maniac')?.checked === true
        };
      };

      allRows.forEach((row, rowIdx) => {
        const pId = row.dataset.playerId;
        const isBenched = row.classList.contains('benched');
        const pObj = players.find(p => p.id === pId);
        const pName = pObj ? pObj.name : `Player ${rowIdx + 1}`;

        if (isBenched) {
          matchObj.substitutes.push(pId);
        } else {
          matchObj.playerStats.push({
            playerId: pId,
            playerName: pName,
            ...readParticipantStats(row, pName)
          });
        }
      });

      activeGuestRows.forEach((row, index) => {
        const guestName = row.querySelector('.guest-name')?.value.trim() || '';
        if (!guestName) validationErrors.push(`Guest slot ${index + 1}: IGN majburiy.`);
        matchObj.guestStats.push({
          guestId: existingMatch?.guestStats?.[index]?.guestId || this.db.generateId(),
          guestName: guestName || `Guest ${index + 1}`,
          ...readParticipantStats(row, guestName || `Guest ${index + 1}`)
        });
      });

      if (validationErrors.length > 0) {
        showValidationError(validationErrors[0]);
        return;
      }

      if (unknownHeroes.size > 0) {
        const names = Array.from(unknownHeroes);
        const confirmed = window.confirm(
          `Qahramon bazasida topilmadi: ${names.join(', ')}.\n\n` +
          'Ularni shu yozuv bilan matchga saqlashni tasdiqlaysizmi? Ular Qahramonlar bazasiga avtomatik qo‘shilmaydi.'
        );
        if (!confirmed) {
          showValidationError('Noma’lum qahramon nomlarini tekshiring.');
          return;
        }
        names.forEach(name => this.confirmedUnknownHeroes.add(name.toLowerCase()));
      }

      const participants = [...matchObj.playerStats, ...matchObj.guestStats];
      const extendedKeys = ['damageDealt', 'damageReceived', 'turretDamage', 'teamfightParticipation', 'goldEarned'];
      matchObj.dataCompleteness = participants.every(stat => extendedKeys.every(key => stat[key] !== null))
        ? 'full'
        : 'partial';
      matchObj.dataQuality = this.ocrReviewConfirmed
        ? 'ocr_verified'
        : (existingMatch?.dataQuality === 'ocr_verified' ? 'ocr_verified' : matchObj.dataCompleteness);

      window._eclipseUnsavedMatch = false;

      if (isEditMode) {
        this.db.updateMatch(editingMatchId, matchObj);
        if (window.showToast) window.showToast('Match statistikasi yangilandi.', 'success');
      } else {
        this.db.addMatch(matchObj);
        if (window.showToast) window.showToast('Match statistikasi saqlandi.', 'success');
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
    const isAdmin = window.EclipseApp?.authManager?.isAdmin?.() === true;

    if (!matches || matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state match-ledger-empty">
          <span class="empty-state__icon"><i class="fa-solid fa-box-archive"></i></span>
          <div><p class="section-eyebrow">MATCH LEDGER</p><h3>Matchlar tarixi bo‘sh</h3><p>Tasdiqlangan matchlar shu yerda tartib bilan ko‘rinadi.</p></div>
          ${isAdmin ? '<button class="btn btn-primary" data-action="add-first-match"><i class="fa-solid fa-plus"></i> Birinchi matchni qo‘shish</button>' : ''}
        </div>`;
      container.querySelector('[data-action="add-first-match"]')?.addEventListener('click', () => window.EclipseApp.navigate('add-match'));
      return;
    }

    const sorted = [...matches].sort((a, b) => {
      const dateOrder = String(b.date || '').localeCompare(String(a.date || ''));
      return dateOrder || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    const scopeMeta = {
      team5: ['TEAM 5', 'fa-people-group'],
      squad: ['PRACTICE LITE · 2–4', 'fa-user-group'],
      individual: ['PRACTICE LITE · 1', 'fa-user'],
      unclassified: ['TEKSHIRISH KERAK', 'fa-triangle-exclamation']
    };
    const completenessMeta = {
      full: ['TO‘LIQ DATA', 'is-full'],
      partial: ['QISMAN DATA', 'is-partial']
    };
    const typeLabels = { ranked: 'Ranked', scrim: 'Scrim', tournament: 'Turnir', casual: 'Oddiy' };
    const metric = value => value === null || value === undefined ? '—' : this.escape(value);

    const cardMarkup = (match, index) => {
      const rosterStats = Array.isArray(match.playerStats) ? match.playerStats : [];
      const guestStats = Array.isArray(match.guestStats) ? match.guestStats : [];
      const participants = [...rosterStats, ...guestStats];
      const completeKda = participants.length > 0 && participants.every(stat =>
        ['kills', 'deaths', 'assists'].every(key => Number.isFinite(Number(stat[key])) && stat[key] !== null));
      const kda = completeKda
        ? participants.reduce((total, stat) => ({
          kills: total.kills + Number(stat.kills),
          deaths: total.deaths + Number(stat.deaths),
          assists: total.assists + Number(stat.assists)
        }), { kills: 0, deaths: 0, assists: 0 })
        : null;
      const rosterPills = rosterStats.map(stat => {
        const player = players.find(item => item.id === stat.playerId);
        const name = player?.name || stat.playerName || 'Arxiv o‘yinchi';
        const role = (stat.rolePlayed || 'Rol yo‘q').replace(' Laner', '');
        return `<li><span>${this.escape(name)}${player?.captain ? '<i class="fa-solid fa-crown" aria-label="Captain"></i>' : ''}</span><small>${this.escape(role)} · ${this.escape(stat.heroUsed || 'Hero yo‘q')}</small></li>`;
      }).join('');
      const guestPills = guestStats.map(stat =>
        `<li class="is-guest"><span>${this.escape(stat.guestName || 'Guest')}</span><small>Guest · ${this.escape(stat.heroUsed || 'Hero yo‘q')}</small></li>`).join('');
      const substitutes = (match.substitutes || []).map(id => players.find(player => player.id === id)?.name).filter(Boolean);
      const [scopeLabel, scopeIcon] = scopeMeta[match.scope] || ['SCOPE YO‘Q', 'fa-circle-question'];
      const completeness = completenessMeta[match.dataCompleteness] || completenessMeta.partial;
      const source = match.verificationStatus === 'needs_review' || match.needsReview === true
        ? ['TEKSHIRISH KERAK', 'is-review', 'fa-triangle-exclamation']
        : match.ocrVerified === true || match.dataQuality === 'ocr_verified'
          ? ['OCR TASDIQLANGAN', 'is-verified', 'fa-wand-magic-sparkles']
          : [`${String(match.dataSource || 'manual').toUpperCase()} KIRITILGAN`, 'is-manual', 'fa-keyboard'];
      const duration = match.durationFormatted || window.StatsEngine.formatDuration(match.durationSeconds) || '—';
      return `
        <article class="match-ledger-card ${match.result === 'win' ? 'is-win' : match.result === 'loss' ? 'is-loss' : 'is-review'}">
          <header class="match-ledger-card__header">
            <div class="match-ledger-card__index"><small>MATCH</small><strong>${String(sorted.length - index).padStart(3, '0')}</strong></div>
            <div class="match-ledger-card__identity">
              <p><span class="match-tag match-tag-${this.escape(match.matchType || 'ranked')}">${this.escape(typeLabels[match.matchType] || match.matchType || 'Ranked')}</span><span class="scope-badge"><i class="fa-solid ${scopeIcon}"></i>${scopeLabel}</span></p>
              <h3>${this.escape(fmtDate(match.date))}</h3>
              <small>${this.escape(duration)}${match.sessionLabel ? ` · ${this.escape(match.sessionLabel)}` : ''}</small>
            </div>
            <div class="match-ledger-card__result"><span>${match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : '?'}</span><small>${match.result === 'win' ? 'G‘alaba' : match.result === 'loss' ? 'Mag‘lubiyat' : 'Tekshirish'}</small></div>
          </header>
          <div class="match-ledger-card__body">
            <dl class="match-ledger-metrics">
              <div><dt>Jamoa KDA</dt><dd>${kda ? `${kda.kills} / ${kda.deaths} / ${kda.assists}` : '—'}</dd></div>
              <div><dt>Turtle</dt><dd>${metric(match.teamTurtles)}</dd></div>
              <div><dt>Lord</dt><dd>${metric(match.teamLords)}</dd></div>
              <div><dt>Turret</dt><dd>${metric(match.teamTurrets)}</dd></div>
            </dl>
            <div class="match-ledger-roster"><p class="section-eyebrow">TARKIB</p><ul>${rosterPills}${guestPills}</ul></div>
          </div>
          <footer class="match-ledger-card__footer">
            <div class="match-ledger-card__notes">
              <span class="quality-badge ${source[1]}"><i class="fa-solid ${source[2]}"></i>${source[0]}</span>
              <span class="quality-badge ${completeness[1]}"><i class="fa-solid fa-database"></i>${completeness[0]}</span>
              ${substitutes.length ? `<small><i class="fa-solid fa-chair"></i> Zaxira: ${this.escape(substitutes.join(', '))}</small>` : ''}
              ${match.notes ? `<p>${this.escape(match.notes)}</p>` : ''}
            </div>
            <div class="match-ledger-card__actions">
              <button class="btn btn-sm btn-secondary view-match-btn" data-id="${this.escape(match.id)}"><i class="fa-solid fa-eye"></i> Ko‘rish</button>
              <button class="btn btn-sm btn-secondary share-match-btn" data-id="${this.escape(match.id)}"><i class="fa-solid fa-camera"></i> Karta</button>
              ${isAdmin ? `<button class="btn btn-sm btn-primary edit-match-btn" data-id="${this.escape(match.id)}" aria-label="Matchni tahrirlash"><i class="fa-solid fa-pen"></i></button><button class="btn btn-sm btn-danger delete-match-btn" data-id="${this.escape(match.id)}" aria-label="Matchni o‘chirish"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
          </footer>
        </article>`;
    };

    const grouped = [];
    const groupByKey = new Map();
    sorted.forEach((match, index) => {
      const key = match.sessionId || `match-${match.id || index}`;
      if (!groupByKey.has(key)) {
        const group = { key, label: match.sessionLabel || '', items: [] };
        groupByKey.set(key, group);
        grouped.push(group);
      }
      groupByKey.get(key).items.push({ match, index });
    });
    container.innerHTML = `<div class="match-ledger">${grouped.map(group => `
      ${group.label ? `<header class="match-session-heading"><div><p class="section-eyebrow">SESSION</p><h3>${this.escape(group.label)}</h3></div><span>${group.items.length} match</span></header>` : ''}
      ${group.items.map(item => cardMarkup(item.match, item.index)).join('')}
    `).join('')}</div>`;

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
        if (confirm('Bu match yozuvini o‘chirmoqchimisiz?')) {
          this.db.deleteMatch(id);
          if (window.EclipseApp.cloudSync && window.EclipseApp.cloudSync.isConfigured()) {
            window.EclipseApp.cloudSync.syncUp();
          }
          if (window.showToast) window.showToast('Match yozuvi o‘chirildi.', 'warning');
          this.renderMatchHistory(containerId, this.db.getMatches(), players);
        }
      });
    });
  }

  renderMatchDetailModal(matchId, players) {
    const matches = this.db.getMatches();
    const match = matches.find(item => item.id === matchId);
    if (!match) return;
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    if (!overlay || !content) return;

    const insights = window.EclipseApp?.statsEngine?.getMatchInsights(match, matches, players) || [];
    const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('uz-UZ');
    const medalMarkup = stat => ({
      mvp: '<span class="medal medal-mvp">MVP</span>',
      gold: '<span class="medal medal-gold">GOLD</span>',
      silver: '<span class="medal medal-silver">SILVER</span>',
      bronze: '<span class="medal medal-choco">BRONZE</span>'
    }[stat.medal] || '');
    const participantMarkup = (stat, guest = false) => {
      const player = guest ? null : players.find(item => item.id === stat.playerId);
      const name = guest ? (stat.guestName || 'Guest') : (player?.name || stat.playerName || 'Arxiv o‘yinchi');
      const role = stat.rolePlayed || 'Rol ko‘rsatilmagan';
      const kda = ['kills', 'deaths', 'assists'].every(key => stat[key] !== null && stat[key] !== undefined)
        ? `${stat.kills} / ${stat.deaths} / ${stat.assists}` : '—';
      return `<article class="match-participant ${guest ? 'is-guest' : ''}">
        <header><div><small>${guest ? 'GUEST' : this.escape(role)}</small><h4>${this.escape(name)}${player?.captain ? '<i class="fa-solid fa-crown" aria-label="Captain"></i>' : ''}</h4></div><span class="role-dot" style="--role-color:${window.StatsEngine.ROLE_COLORS[role] || 'var(--primary)'}"></span></header>
        <div class="match-participant__hero"><strong>${this.escape(stat.heroUsed || 'Hero ko‘rsatilmagan')}</strong>${medalMarkup(stat)}</div>
        <dl><div><dt>KDA</dt><dd>${kda}</dd></div><div><dt>Baho</dt><dd>${fmt(stat.inGameScore)}</dd></div><div><dt>Damage</dt><dd>${fmt(stat.damageDealt)}</dd></div><div><dt>Damage received</dt><dd>${fmt(stat.damageReceived)}</dd></div><div><dt>Turret Damage</dt><dd>${fmt(stat.turretDamage)}</dd></div><div><dt>TF</dt><dd>${stat.teamfightParticipation === null || stat.teamfightParticipation === undefined ? '—' : `${stat.teamfightParticipation}%`}</dd></div><div><dt>Gold</dt><dd>${fmt(stat.goldEarned)}</dd></div></dl>
        ${(stat.savage || stat.maniac) ? `<footer>${stat.savage ? '<span>SAVAGE</span>' : ''}${stat.maniac ? '<span>MANIAC</span>' : ''}</footer>` : ''}
      </article>`;
    };
    const participants = [...(match.playerStats || []).map(stat => participantMarkup(stat)), ...(match.guestStats || []).map(stat => participantMarkup(stat, true))].join('');
    const subNames = (match.substitutes || []).map(id => players.find(player => player.id === id)?.name).filter(Boolean);
    const scopeLabel = { team5: 'TEAM 5', squad: 'PRACTICE LITE · 2–4', individual: 'PRACTICE LITE · 1', unclassified: 'TEKSHIRISH KERAK' }[match.scope] || 'SCOPE YO‘Q';
    const completenessLabel = match.entryMode === 'practice_lite' ? 'LITE DATA' : match.dataCompleteness === 'full' ? 'TO‘LIQ DATA' : 'QISMAN DATA';
    const needsReview = match.verificationStatus === 'needs_review' || match.needsReview === true;
    const isOcrVerified = match.ocrVerified === true || match.dataQuality === 'ocr_verified';
    const sourceLabel = needsReview
      ? 'TEKSHIRISH KERAK'
      : isOcrVerified ? 'OCR TASDIQLANGAN' : `${String(match.dataSource || 'manual').toUpperCase()} KIRITILGAN`;
    const duration = match.durationFormatted || window.StatsEngine.formatDuration(match.durationSeconds) || '—';
    const resultCode = match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : '?';
    const resultLabel = match.result === 'win' ? 'G‘ALABA' : match.result === 'loss' ? 'MAG‘LUBIYAT' : 'TEKSHIRISH KERAK';

    content.innerHTML = `<div class="modal-header"><div><p class="section-eyebrow">MATCH READOUT · ${scopeLabel}</p><h3 class="modal-title" id="modalTitle">${this.escape(window.StatsEngine.formatDateFormatted(match.date))}</h3></div><button class="modal-close" id="closeModalBtn" aria-label="Yopish">&times;</button></div>
      <div class="modal-body match-readout">
        <section class="match-readout__summary"><div class="match-readout__result ${match.result === 'win' ? 'is-win' : match.result === 'loss' ? 'is-loss' : 'is-review'}"><strong>${resultCode}</strong><span>${resultLabel}</span></div><dl><div><dt>Davomiylik</dt><dd>${this.escape(duration)}</dd></div><div><dt>Turtle</dt><dd>${fmt(match.teamTurtles)}</dd></div><div><dt>Lord</dt><dd>${fmt(match.teamLords)}</dd></div><div><dt>Turret</dt><dd>${fmt(match.teamTurrets)}</dd></div></dl><div class="match-readout__quality"><span class="quality-badge ${needsReview ? 'is-review' : isOcrVerified ? 'is-verified' : 'is-manual'}">${sourceLabel}</span><span class="quality-badge ${match.dataCompleteness === 'full' ? 'is-full' : 'is-partial'}">${completenessLabel}</span></div></section>
        ${needsReview && Array.isArray(match.dataIssues) && match.dataIssues.length ? `<section class="match-readout__issues"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>Analyticsga kiritilmagan</strong><p>${this.escape(match.dataIssues.map(issue => this.formatDataIssue(issue)).join(' · '))}</p></div></section>` : ''}
        ${match.sessionLabel || match.notes ? `<section class="match-readout__context">${match.sessionLabel ? `<small>SESSION · ${this.escape(match.sessionLabel)}</small>` : ''}${match.notes ? `<p>${this.escape(match.notes)}</p>` : ''}</section>` : ''}
        <section><div class="match-readout__section-title"><p class="section-eyebrow">PARTICIPANTS</p><strong>${(match.playerStats || []).length + (match.guestStats || []).length}/5</strong></div><div class="match-participant-grid">${participants}</div></section>
        ${this.insightMarkup(insights)}
        ${subNames.length ? `<div class="match-readout__subs"><i class="fa-solid fa-chair"></i><span>Zaxira</span><strong>${this.escape(subNames.join(', '))}</strong></div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" id="modalSharePosterBtn"><i class="fa-solid fa-camera"></i> Match kartasi</button>${window.EclipseApp?.authManager?.isAdmin() ? '<button class="btn btn-primary" id="modalEditBtn"><i class="fa-solid fa-pen"></i> Tahrirlash</button>' : ''}<button class="btn btn-secondary" id="modalOkBtn">Yopish</button></div>`;

    overlay.style.display = 'flex';
    overlay.removeAttribute('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.dataset.mandatory = 'false';
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    const closeModal = () => this.closeModalSurface(overlay, content);
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('modalOkBtn')?.addEventListener('click', closeModal);
    document.getElementById('modalSharePosterBtn')?.addEventListener('click', () => this.showSharePosterModal(match.id, players));
    document.getElementById('modalEditBtn')?.addEventListener('click', () => { closeModal(); window.EclipseApp.editMatch(match.id); });
    content.querySelectorAll('.publish-insight-btn').forEach(button => {
      button.addEventListener('click', async event => {
        const insight = insights[Number(event.currentTarget.dataset.insightIndex)];
        const briefing = window.EclipseApp?.briefingManager;
        if (!insight || !briefing || !window.EclipseApp?.authManager?.isAdmin?.()) return;
        event.currentTarget.disabled = true;
        event.currentTarget.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yuborilmoqda';
        try {
          briefing.data = await briefing.request('POST', { action: 'addInsight', insight: { matchId: match.id, title: insight.title, summary: insight.body, reasons: insight.reasons, sampleSize: insight.sample?.baselineMatches || 0, confidence: insight.confidence?.level || 'insufficient', status: 'approved' } }, true);
          event.currentTarget.innerHTML = '<i class="fa-solid fa-circle-check"></i> Briefingga yuborildi';
          window.showToast?.('Captain insightni tasdiqladi va Briefingga yubordi', 'success');
        } catch (error) {
          event.currentTarget.disabled = false;
          event.currentTarget.innerHTML = '<i class="fa-solid fa-thumbtack"></i> Qayta urinish';
          window.showToast?.(error.message || 'Insightni yuborib bo‘lmadi', 'error');
        }
      });
    });
    this.activateModalAccessibility(overlay, content, closeModal, { initialFocusSelector: '#closeModalBtn' });
  }

  showSharePosterModal(matchId, players) {
    const matches = this.db.getMatches();
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    if (!overlay || !content) return;
    const preserveReturnFocus = overlay.classList.contains('active') && Boolean(this.modalReturnFocus);
    const fmtDate = window.StatsEngine.formatDateFormatted;

    content.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title" id="modalTitle"><i class="fa-solid fa-camera" style="color:var(--secondary);"></i> Eclipse match kartasi (${fmtDate(match.date)})</h3>
        <button class="modal-close" id="closePosterModalBtn" aria-label="Yopish">&times;</button>
      </div>
      <div class="modal-body text-center" style="padding: 1rem;">
        <p style="color:var(--text-secondary); margin-bottom:1rem; font-size:0.875rem;">
          Discord, Telegram yoki WhatsApp uchun tayyorlangan yuqori aniqlikdagi post-match karta.
        </p>

        <div style="background:#05070e; border-radius:10px; border:1px solid rgba(var(--primary-rgb),0.3); overflow:hidden; box-shadow:0 8px 30px rgba(0,0,0,0.8); max-width:100%; margin:0 auto;">
          <canvas id="matchPosterCanvas" style="width:100%; height:auto; display:block; aspect-ratio: 16/9;"></canvas>
        </div>
      </div>
      <div class="modal-footer" style="justify-content:space-between;">
        <button class="btn btn-secondary" id="posterCopyBtn"><i class="fa-solid fa-copy"></i> Rasmni nusxalash</button>
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-primary" id="posterDownloadBtn"><i class="fa-solid fa-download"></i> PNG yuklab olish</button>
          <button class="btn btn-secondary" id="posterCloseBtn">Yopish</button>
        </div>
      </div>
    `;

    overlay.classList.add('active');
    overlay.removeAttribute('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.dataset.mandatory = 'false';
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const canvas = document.getElementById('matchPosterCanvas');
    if (canvas && window.ChartHelper) {
      window.ChartHelper.generateMatchGraphic(canvas, match, players);
    }

    const closePoster = () => this.closeModalSurface(overlay, content);

    document.getElementById('closePosterModalBtn')?.addEventListener('click', closePoster);
    document.getElementById('posterCloseBtn')?.addEventListener('click', closePoster);

    document.getElementById('posterDownloadBtn')?.addEventListener('click', () => {
      const fileName = `Eclipse_Esports_${match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'REVIEW'}_${match.date || 'unknown-date'}.png`;
      window.ChartHelper.downloadCanvasAsPng(canvas, fileName);
      if (window.showToast) window.showToast('Match kartasi yuklab olindi.', 'success');
    });

    document.getElementById('posterCopyBtn')?.addEventListener('click', () => {
      window.ChartHelper.copyCanvasToClipboard(canvas);
    });
    this.activateModalAccessibility(overlay, content, closePoster, {
      initialFocusSelector: '#closePosterModalBtn',
      preserveReturnFocus
    });
  }

  // =========================================================================
  //  AI SCREENSHOT OCR AUTO-SCANNER SYSTEM
  // =========================================================================

  setupOcrHandlers(container, players) {
    this.ocrImages = [null, null];
    this.pendingOcrData = null;
    this.ocrReviewConfirmed = false;
    this.confirmedUnknownHeroes = new Set();

    const slot1 = document.getElementById('ocrDropSlot1');
    const slot2 = document.getElementById('ocrDropSlot2');
    const fileInp1 = document.getElementById('ocrFileInput1');
    const fileInp2 = document.getElementById('ocrFileInput2');
    const scanBtn = document.getElementById('startOcrScanBtn');
    const removeBtn1 = document.getElementById('ocrRemoveBtn1');
    const removeBtn2 = document.getElementById('ocrRemoveBtn2');

    const updateSlotDisplay = (slotIndex) => {
      const isSlot1 = slotIndex === 0;
      const slotBox = isSlot1 ? slot1 : slot2;
      const dropContent = document.getElementById(isSlot1 ? 'ocrDropContent1' : 'ocrDropContent2');
      const previewWrap = document.getElementById(isSlot1 ? 'ocrPreviewWrap1' : 'ocrPreviewWrap2');
      const previewImg = document.getElementById(isSlot1 ? 'ocrPreviewImg1' : 'ocrPreviewImg2');
      const imgData = this.ocrImages[slotIndex];

      if (imgData) {
        slotBox?.classList.add('has-file');
        dropContent?.classList.add('hidden');
        previewWrap?.classList.remove('hidden');
        if (previewImg) previewImg.src = imgData;
      } else {
        slotBox?.classList.remove('has-file');
        dropContent?.classList.remove('hidden');
        previewWrap?.classList.add('hidden');
        if (previewImg) previewImg.src = '';
      }

      const hasAnyImage = !!(this.ocrImages[0] || this.ocrImages[1]);
      if (scanBtn) {
        scanBtn.disabled = !hasAnyImage;
      }
    };

    const handleFile = (file, slotIndex) => {
      if (!file || !file.type.startsWith('image/')) {
        if (window.showToast) window.showToast('Iltimos, faqat rasm (skrinshot) faylini tanlang!', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.ocrImages[slotIndex] = e.target.result;
        updateSlotDisplay(slotIndex);
        if (window.showToast) {
          window.showToast(`📸 ${slotIndex + 1}-Skrinshot muvaffaqiyatli yuklandi!`, 'info');
        }
      };
      reader.readAsDataURL(file);
    };

    // Slot 1 click & file input
    slot1?.addEventListener('click', (e) => {
      if (e.target === fileInp1 || e.target.closest('.ocr-remove-btn')) return;
      fileInp1?.click();
    });
    fileInp1?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0], 0);
      }
    });

    // Slot 2 click & file input
    slot2?.addEventListener('click', (e) => {
      if (e.target === fileInp2 || e.target.closest('.ocr-remove-btn')) return;
      fileInp2?.click();
    });
    fileInp2?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0], 1);
      }
    });

    [[slot1, fileInp1], [slot2, fileInp2]].forEach(([slotBox, fileInput]) => {
      slotBox?.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        fileInput?.click();
      });
    });

    // Drag and Drop support
    [slot1, slot2].forEach((slotBox, sIdx) => {
      if (!slotBox) return;
      slotBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        slotBox.classList.add('dragover');
      });
      slotBox.addEventListener('dragleave', () => {
        slotBox.classList.remove('dragover');
      });
      slotBox.addEventListener('drop', (e) => {
        e.preventDefault();
        slotBox.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFile(e.dataTransfer.files[0], sIdx);
        }
      });
    });

    // Remove buttons
    removeBtn1?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ocrImages[0] = null;
      if (fileInp1) fileInp1.value = '';
      updateSlotDisplay(0);
    });
    removeBtn2?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ocrImages[1] = null;
      if (fileInp2) fileInp2.value = '';
      updateSlotDisplay(1);
    });

    // Global Paste Listener (Ctrl+V / Cmd+V anywhere on page when Add Match is active)
    if (this._pasteListener) {
      document.removeEventListener('paste', this._pasteListener);
    }
    this._pasteListener = (e) => {
      const activeSection = document.querySelector('.page-section.active');
      if (!activeSection || activeSection.id !== 'page-add-match') return;

      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData || !clipboardData.items) return;

      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            // Put into slot 0 if empty, else slot 1
            const targetSlot = !this.ocrImages[0] ? 0 : (!this.ocrImages[1] ? 1 : 0);
            handleFile(blob, targetSlot);
            break;
          }
        }
      }
    };
    document.addEventListener('paste', this._pasteListener);

    // Scan Button Handler
    scanBtn?.addEventListener('click', () => {
      this.handleOcrScan(players);
    });
  }

  async handleOcrScan(players) {
    const scanBtn = document.getElementById('startOcrScanBtn');
    const statusMsg = document.getElementById('ocrStatusMsg');
    const imagesToProcess = this.ocrImages.filter(Boolean);

    if (imagesToProcess.length === 0) {
      if (window.showToast) window.showToast('Iltimos, avval kamida 1 ta skrinshot yuklang!', 'warning');
      return;
    }

    const token = window.EclipseApp?.authManager?.getToken?.() || '';
    if (!token) {
      if (window.showToast) window.showToast('AI skaneri uchun Admin sifatida kiring.', 'warning');
      return;
    }

    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI Skanerlamoqda...';
    }
    if (statusMsg) {
      statusMsg.className = '';
      statusMsg.innerHTML = '<span style="color:var(--primary);"><i class="fa-solid fa-spinner fa-spin"></i> AI Vision skrinshotlarni tahlil qilmoqda (qahramonlar, K/D/A, damage)... Bu 1 daqiqagacha davom etishi mumkin.</span>';
    }

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          images: imagesToProcess,
          rosterPlayers: players.map(p => ({ id: p.id, name: p.name, role: p.primaryRole || p.role || '' })),
          heroList: (this.heroDb?.getAll() || []).map(hero => ({ name: hero.name, role: hero.role }))
        })
      });

      const responseText = await response.text();
      let result = null;
      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        result = null;
      }

      if (!response.ok || !result?.success || !result?.data) {
        const fallbackMessage = response.status === 504
          ? 'AI tahlili kutilganidan uzoq davom etdi. Qayta urinib ko‘ring.'
          : 'Skrinshotni o\'qishda xatolik yuz berdi';
        throw new Error(result?.error || fallbackMessage);
      }

      if (statusMsg) {
        statusMsg.innerHTML = '<span style="color:var(--warning);"><i class="fa-solid fa-list-check"></i> Tahlil tayyor. Saqlashdan oldin player va qahramon mappingini tasdiqlang.</span>';
      }

      this.renderOcrReview(result.data, players);

    } catch (err) {
      console.error('OCR Scan error:', err);
      if (statusMsg) {
        const errorLine = document.createElement('span');
        errorLine.style.color = 'var(--danger)';
        const errorIcon = document.createElement('i');
        errorIcon.className = 'fa-solid fa-triangle-exclamation';
        errorIcon.setAttribute('aria-hidden', 'true');
        errorLine.append(errorIcon, document.createTextNode(` Xatolik: ${String(err?.message || 'Noma’lum xatolik')}`));
        statusMsg.replaceChildren(errorLine);
      }
      if (window.showToast) {
        window.showToast(`Xatolik: ${err.message}`, 'error');
      }
    } finally {
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Skanerlash & Formani To\'ldirish';
      }
    }
  }

  renderOcrReview(data, players) {
    const panel = document.getElementById('ocrReviewPanel');
    if (!panel || !Array.isArray(data?.players) || data.players.length === 0) {
      if (window.showToast) window.showToast('OCR o‘yinchi qatorlarini aniqlay olmadi.', 'warning');
      return;
    }

    this.pendingOcrData = data;
    this.ocrReviewConfirmed = false;
    const heroList = this.heroDb?.getAll() || [];
    const playerOptions = players.map(player =>
      `<option value="${this.escape(player.id)}">${this.escape(player.name)}</option>`
    ).join('');
    const issueLabels = {
      unknown_result: 'Natija aniqlanmadi — W yoki L ni qo‘lda tanlang.',
      invalid_duration: 'Davomiylik ishonchli o‘qilmadi — tekshirib kiriting.',
      unrecognized_hero: 'Kamida bitta hero nomi bazaga mos kelmadi.',
      unidentified_participant: 'Kamida bitta o‘yinchi aniqlanmadi.',
      duplicate_participant: 'Takroriy o‘yinchi qatori aniqlandi.',
      too_many_participants: '5 tadan ortiq qator qaytdi.',
      unknown_role: 'Kamida bitta rol aniqlanmadi.'
    };
    const reviewIssues = Array.isArray(data.reviewIssues) ? [...new Set(data.reviewIssues)] : [];
    const issueMarkup = reviewIssues.length
      ? `<ul class="ocr-review-issues">${reviewIssues.map(issue => `<li><i class="fa-solid fa-triangle-exclamation"></i>${this.escape(issueLabels[issue] || issue)}</li>`).join('')}</ul>`
      : '';

    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div style="border:1px solid rgba(var(--primary-rgb),0.32); border-radius:12px; padding:1rem; background:rgba(0,0,0,0.18);">
        <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:0.9rem;">
          <div><strong style="color:var(--text-primary);"><i class="fa-solid fa-shield-halved" style="color:var(--primary);"></i> OCR review — inson tasdig‘i kerak</strong><small style="display:block; color:var(--text-muted); margin-top:0.2rem;">Har bir skrinshot qatorini roster o‘yinchisi yoki Guest sifatida belgilang. Bir roster o‘yinchisini ikki marta tanlab bo‘lmaydi.</small></div>
          <span class="badge" style="color:var(--warning);">SAQLANMAGAN</span>
        </div>
        ${issueMarkup}
        <div style="display:flex; flex-direction:column; gap:0.75rem;">
          ${data.players.map((detected, index) => {
            const heroName = detected.heroUsed || '';
            const recognized = Boolean(heroName && this.heroDb?.exists(heroName));
            return `
              <div class="ocr-review-row" data-ocr-index="${index}" style="display:grid; grid-template-columns:minmax(130px,0.8fr) minmax(180px,1fr) minmax(180px,1fr); gap:0.75rem; padding:0.85rem; border:1px solid var(--border-light); border-radius:10px; align-items:end;">
                <div><small style="color:var(--text-muted);">Aniqlangan IGN</small><strong style="display:block; color:var(--secondary);">${this.escape(detected.detectedName || `Qator ${index + 1}`)}</strong><span style="font-size:0.75rem; color:var(--text-muted);">${this.escape(`${detected.kills ?? '—'}/${detected.deaths ?? '—'}/${detected.assists ?? '—'}`)}</span></div>
                <div><label for="ocr-player-mapping-${index}" class="form-label" style="font-size:0.75rem;">Kimga tegishli?</label><select id="ocr-player-mapping-${index}" class="ocr-player-mapping form-select"><option value="">Tanlang…</option>${playerOptions}<option value="guest">Guest — roster tashqarisida</option></select></div>
                <div><label for="ocr-hero-mapping-${index}" class="form-label" style="font-size:0.75rem;">Qahramon</label><input id="ocr-hero-mapping-${index}" class="ocr-hero-mapping form-input" list="ocr-review-herolist-${index}" value="${this.escape(heroName)}" placeholder="Qahramonni tekshiring"><datalist id="ocr-review-herolist-${index}">${heroList.map(hero => `<option value="${this.escape(hero.name)}">${this.escape(hero.role)}</option>`).join('')}</datalist><small class="ocr-known-hero-note ${recognized ? '' : 'hidden'}" style="display:block;color:var(--success);margin-top:0.25rem;"><i class="fa-solid fa-circle-check"></i> Bazada tasdiqlangan</small><label class="ocr-unknown-confirm-wrap ${recognized ? 'hidden' : ''}" style="display:flex;gap:0.35rem;align-items:flex-start;margin-top:0.35rem;font-size:0.75rem;color:var(--warning);"><input type="checkbox" class="ocr-unknown-confirm"> Noma’lum nomni aynan shunday saqlashni tasdiqlayman</label></div>
              </div>`;
          }).join('')}
        </div>
        <div id="ocrReviewError" class="form-validation-message hidden" role="alert" style="margin-top:0.75rem;"></div>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:1rem;"><button type="button" class="btn btn-secondary btn-sm" id="cancelOcrReviewBtn">Bekor qilish</button><button type="button" class="btn btn-primary" id="confirmOcrReviewBtn"><i class="fa-solid fa-check-double"></i> Mappingni tasdiqlash va formaga qo‘llash</button></div>
      </div>`;

    panel.querySelectorAll('.ocr-review-row').forEach((row, index) => {
      const matchedId = data.players[index]?.matchedPlayerId;
      const select = row.querySelector('.ocr-player-mapping');
      if (matchedId && players.some(player => player.id === matchedId)) select.value = matchedId;

      row.querySelector('.ocr-hero-mapping')?.addEventListener('input', event => {
        const wrap = row.querySelector('.ocr-unknown-confirm-wrap');
        const knownNote = row.querySelector('.ocr-known-hero-note');
        if (this.heroDb?.exists(event.currentTarget.value.trim())) {
          wrap?.classList.add('hidden');
          if (knownNote) knownNote.classList.remove('hidden');
        } else {
          wrap?.classList.remove('hidden');
          if (knownNote) knownNote.classList.add('hidden');
        }
      });
    });

    panel.querySelector('#cancelOcrReviewBtn')?.addEventListener('click', () => {
      this.pendingOcrData = null;
      this.ocrReviewConfirmed = false;
      panel.innerHTML = '';
      panel.classList.add('hidden');
    });

    panel.querySelector('#confirmOcrReviewBtn')?.addEventListener('click', () => {
      const rows = Array.from(panel.querySelectorAll('.ocr-review-row'));
      const mappings = [];
      const usedRosterIds = new Set();
      let error = '';

      rows.forEach((row, index) => {
        if (error) return;
        const target = row.querySelector('.ocr-player-mapping')?.value || '';
        const heroName = row.querySelector('.ocr-hero-mapping')?.value.trim() || '';
        const heroKnown = Boolean(heroName && this.heroDb?.exists(heroName));
        const unknownConfirmed = row.querySelector('.ocr-unknown-confirm')?.checked === true;
        if (!target) error = `${index + 1}-qator uchun roster o‘yinchisi yoki Guestni tanlang.`;
        else if (target !== 'guest' && usedRosterIds.has(target)) error = 'Bir roster o‘yinchisi bir nechta OCR qatoriga bog‘landi.';
        else if (!heroName) error = `${index + 1}-qator qahramonini tekshiring.`;
        else if (!heroKnown && !unknownConfirmed) error = `${heroName} bazada yo‘q. Noma’lum nom tasdig‘ini belgilang yoki to‘g‘rilang.`;
        if (target && target !== 'guest') usedRosterIds.add(target);
        if (!heroKnown && unknownConfirmed) this.confirmedUnknownHeroes.add(heroName.toLowerCase());
        mappings.push({ target, heroName });
      });

      const errorEl = panel.querySelector('#ocrReviewError');
      if (error) {
        if (errorEl) {
          errorEl.textContent = error;
          errorEl.classList.remove('hidden');
        }
        return;
      }
      this.populateFormFromOcr(data, players, mappings);
      this.ocrReviewConfirmed = true;
      this.pendingOcrData = null;
      panel.innerHTML = '<div style="padding:0.8rem 1rem; border:1px solid rgba(var(--success-rgb),0.35); border-radius:10px; color:var(--success);"><i class="fa-solid fa-circle-check"></i> Mapping admin tomonidan tasdiqlandi. Formadagi qiymatlarni yana bir marta ko‘rib, matchni saqlang.</div>';
    });
  }

  populateFormFromOcr(data, players, mappings = []) {
    if (!data) return;

    // 1. Result (win / loss)
    if (['win', 'loss'].includes(String(data.result || '').toLowerCase())) {
      const isWin = data.result.toLowerCase() === 'win';
      const winRadio = document.querySelector('input[name="match-result"][value="win"]');
      const lossRadio = document.querySelector('input[name="match-result"][value="loss"]');
      if (isWin && winRadio) winRadio.checked = true;
      if (!isWin && lossRadio) lossRadio.checked = true;
    }

    // 2. Duration (Min : Sec)
    if (data.duration !== null && data.duration !== undefined && data.duration !== '') {
      let totalSeconds = null;
      if (typeof data.duration === 'string') {
        const match = data.duration.trim().match(/^(\d{1,3}):([0-5]\d)$/);
        if (match) totalSeconds = (Number(match[1]) * 60) + Number(match[2]);
      } else if (Number.isInteger(data.duration) && data.duration > 0 && data.duration <= 7200) {
        totalSeconds = data.duration;
      }
      if (totalSeconds !== null) {
        const min = Math.floor(totalSeconds / 60);
        const sec = totalSeconds % 60;
      const minInput = document.getElementById('match-duration-min');
      const secInput = document.getElementById('match-duration-sec');
      if (minInput) minInput.value = min;
      if (secInput) secInput.value = sec < 10 ? '0' + sec : sec;
      }
    }

    // 3. Match Type
    if (data.matchType) {
      const typeSelect = document.getElementById('match-type');
      if (typeSelect) {
        const matchTypeLower = data.matchType.toLowerCase();
        const matchedOption = Array.from(typeSelect.options).find(o => o.value === matchTypeLower);
        if (matchedOption) typeSelect.value = matchedOption.value;
      }
    }

    // 4. Team Objectives (if recognized)
    if (typeof data.teamTurtles === 'number') {
      const el = document.getElementById('team-turtles');
      if (el) el.value = data.teamTurtles;
    }
    if (typeof data.teamLords === 'number') {
      const el = document.getElementById('team-lords');
      if (el) el.value = data.teamLords;
    }
    if (typeof data.teamTurrets === 'number') {
      const el = document.getElementById('team-turrets');
      if (el) el.value = data.teamTurrets;
    }

    // 5. Populate Players
    if (Array.isArray(data.players) && data.players.length > 0 && mappings.length === data.players.length) {
      const allRows = Array.from(document.querySelectorAll('.player-stat-row'));
      const guestRows = Array.from(document.querySelectorAll('.guest-stat-row'));
      const matchedRows = [];
      let guestCursor = 0;

      // Start from a clean participant set. Nothing is assigned by array order.
      allRows.forEach(row => {
        if (!row.classList.contains('benched')) row.querySelector('.sub-toggle')?.click();
      });
      guestRows.forEach(row => {
        const checkbox = row.querySelector('.guest-active');
        if (checkbox?.checked) {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      data.players.forEach((detected, index) => {
        const mapping = mappings[index];
        const extracted = { ...detected, heroUsed: mapping.heroName };
        let targetRow = null;
        if (mapping.target === 'guest') {
          targetRow = guestRows[guestCursor++];
          const checkbox = targetRow?.querySelector('.guest-active');
          if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          const nameInput = targetRow?.querySelector('.guest-name');
          if (nameInput) nameInput.value = detected.detectedName || `Guest ${guestCursor}`;
        } else {
          targetRow = allRows.find(row => row.dataset.playerId === mapping.target) || null;
          if (targetRow?.classList.contains('benched')) targetRow.querySelector('.sub-toggle')?.click();
        }
        if (targetRow) {
          matchedRows.push(targetRow);
          this.fillPlayerRow(targetRow, extracted);
        }
      });

      // Visual flash animation on populated rows
      matchedRows.forEach(r => {
        r.style.transition = 'all 0.4s ease';
        r.style.boxShadow = '0 0 30px rgba(var(--primary-rgb), 0.45)';
        r.style.borderColor = 'var(--primary)';
        setTimeout(() => {
          r.style.boxShadow = '';
          r.style.borderColor = '';
        }, 3000);
      });
    }

    // Scroll smoothly to team details / players
    const detailsSection = document.getElementById('match-entry-form');
    if (detailsSection) {
      detailsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (window.showToast) {
      window.showToast(`✨ ${data.players.length} ta OCR qatori tasdiqlanib formaga qo‘llandi. Barcha qiymatlarni tekshiring.`, 'success');
    }
  }

  fillPlayerRow(row, pExt) {
    if (!row || !pExt) return;

    // Hero Used
    if (pExt.heroUsed) {
      const heroInput = row.querySelector('.stat-hero');
      if (heroInput) heroInput.value = pExt.heroUsed;
    }

    // Role / Lane
    if (pExt.rolePlayed) {
      const roleSelect = row.querySelector('.stat-role');
      if (roleSelect) {
        const pRoleNorm = pExt.rolePlayed.toLowerCase().replace(/[^a-z]/g, '');
        const matchedOption = Array.from(roleSelect.options).find(o => {
          const oNorm = o.value.toLowerCase().replace(/[^a-z]/g, '');
          return oNorm === pRoleNorm || pRoleNorm.includes(oNorm) || oNorm.includes(pRoleNorm);
        });
        if (matchedOption) roleSelect.value = matchedOption.value;
      }
    }

    // Kills, Deaths, Assists
    if (typeof pExt.kills === 'number') {
      const el = row.querySelector('.stat-kills');
      if (el) el.value = pExt.kills;
    }
    if (typeof pExt.deaths === 'number') {
      const el = row.querySelector('.stat-deaths');
      if (el) el.value = pExt.deaths;
    }
    if (typeof pExt.assists === 'number') {
      const el = row.querySelector('.stat-assists');
      if (el) el.value = pExt.assists;
    }

    // In-Game Score
    if (typeof pExt.inGameScore === 'number' || pExt.inGameScore) {
      const el = row.querySelector('.stat-score');
      if (el) el.value = parseFloat(pExt.inGameScore) || 0;
    }

    // Medal
    if (pExt.medal) {
      const el = row.querySelector('.stat-medal');
      if (el) {
        const medalVal = pExt.medal.toLowerCase();
        const validMedals = ['mvp', 'gold', 'silver', 'bronze', 'none'];
        if (validMedals.includes(medalVal)) {
          el.value = medalVal;
        } else if (medalVal === 'choco' || medalVal === 'chocolate') {
          el.value = 'bronze';
        }
      }
    }

    // Savage / Maniac
    const savEl = row.querySelector('.stat-savage');
    if (savEl) savEl.checked = !!pExt.savage;
    const manEl = row.querySelector('.stat-maniac');
    if (manEl) manEl.checked = !!pExt.maniac;

    // Damage Dealt, Damage Received, Turret Dmg, TF %, Gold
    if (typeof pExt.damageDealt === 'number') {
      const el = row.querySelector('.stat-dmg-dealt');
      if (el) el.value = pExt.damageDealt;
    }
    if (typeof pExt.damageReceived === 'number') {
      const el = row.querySelector('.stat-dmg-received');
      if (el) el.value = pExt.damageReceived;
    }
    if (typeof pExt.turretDamage === 'number') {
      const el = row.querySelector('.stat-turret-dmg');
      if (el) el.value = pExt.turretDamage;
    }
    if (typeof pExt.teamfightParticipation === 'number') {
      const el = row.querySelector('.stat-tf');
      if (el) el.value = pExt.teamfightParticipation;
    }
    if (typeof pExt.goldEarned === 'number') {
      const el = row.querySelector('.stat-gold');
      if (el) el.value = pExt.goldEarned;
    }
  }
};
