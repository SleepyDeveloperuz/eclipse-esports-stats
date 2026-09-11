window.SubmissionManager = class SubmissionManager {
  constructor(authManager, dataStore, heroDb, cloudSync) {
    this.auth = authManager;
    this.db = dataStore;
    this.heroDb = heroDb;
    this.cloudSync = cloudSync;
    this.endpoint = '/api/submissions';
    this.container = null;
    this.data = { counts: { pending: 0, approved: 0, rejected: 0, total: 0 }, submissions: [] };
    this.images = [null, null];
    this.imageNames = ['', ''];
    this.ocrSource = 'manual';
    this.ocrReviewIssues = [];
    this.filter = 'pending';
    this.rowCounter = 0;
    this.pasteHandler = null;
  }

  escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async request(method = 'GET', body = null) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    const token = method === 'PATCH' || method === 'DELETE'
      ? this.auth.getToken()
      : this.auth.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(this.endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Submission bilan bog‘lanishda xatolik');
      error.status = response.status;
      error.code = payload.code;
      if (response.status === 401) {
        this.auth.showViewerLoginModal?.(() => this.render('submissionContainer'), { mandatory: true });
      }
      throw error;
    }
    return payload;
  }

  async render(containerId) {
    this.invalidateOcrWork();
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    const generation = this.renderGeneration = (this.renderGeneration || 0) + 1;
    this.container.innerHTML = this.loadingMarkup();
    try {
      const data = await this.request();
      if (generation !== this.renderGeneration) return;
      this.data = data;
      this.renderState();
    } catch (error) {
      if (generation !== this.renderGeneration) return;
      this.renderError(error.message);
    }
  }

  refreshForAuthChange() {
    if (document.getElementById('page-submissions')?.classList.contains('active')) {
      this.render('submissionContainer');
    }
  }

  loadingMarkup() {
    return `<div class="submission-loading" role="status" aria-live="polite"><span></span><div><strong>Practice Desk ochilmoqda</strong><small>Submission navbati tekshirilmoqda…</small></div></div>`;
  }

  renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="submission-error" role="alert">
        <span><i class="fa-solid fa-satellite-dish"></i></span>
        <div><p class="section-eyebrow">SIGNAL UZILDI</p><h3>Practice Desk ochilmadi</h3><p>${this.escape(message)}</p></div>
        <button type="button" class="btn btn-secondary" data-action="retry"><i class="fa-solid fa-rotate"></i> Qayta urinish</button>
      </div>`;
    this.container.querySelector('[data-action="retry"]')?.addEventListener('click', () => this.render(this.container.id));
  }

  formatDate(value) {
    if (!value) return 'Sana yo‘q';
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? this.escape(value)
      : new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
  }

  statusMeta(status) {
    return {
      pending: ['Kutilmoqda', 'fa-hourglass-half'],
      approved: ['Captain tasdiqlagan', 'fa-circle-check'],
      rejected: ['Rad etilgan', 'fa-circle-xmark']
    }[status] || ['Noma’lum', 'fa-circle-question'];
  }

  renderState() {
    if (!this.container) return;
    const counts = this.data.counts || {};
    const isAdmin = this.auth.isAdmin();
    this.container.innerHTML = `
      <section class="submission-hero" aria-labelledby="submissionHeading">
        <div class="submission-hero__signal" aria-hidden="true">
          <span></span><i class="fa-solid fa-satellite-dish"></i>
        </div>
        <div class="submission-hero__copy">
          <p class="section-eyebrow">ECLIPSE // TEAM INPUT</p>
          <h2 id="submissionHeading">Match yuborish</h2>
          <p>1–5 a’zoning to‘liq natijasini kiriting. Besh a’zo — Team 5, qolganlari — Practice. Jamoadosh yuborgan match Captain tasdiqlagach statistikaga kiradi.</p>
        </div>
        <div class="submission-telemetry" aria-label="Submission holati">
          <span><strong>${Number(counts.pending) || 0}</strong><small>Kutilmoqda</small></span>
          <span><strong>${Number(counts.approved) || 0}</strong><small>Tasdiq</small></span>
          <span><strong>${Number(counts.rejected) || 0}</strong><small>Rad</small></span>
        </div>
      </section>

      <div class="submission-layout">
        <section class="submission-panel submission-compose" aria-labelledby="submissionFormTitle">
          <header class="submission-panel__header">
            <div><p class="section-eyebrow">MATCH DESK</p><h3 id="submissionFormTitle">Natijani kiriting</h3></div>
            <span>1–5 O‘YINCHI</span>
          </header>
          ${this.formMarkup()}
        </section>

        <section class="submission-panel submission-inbox" aria-labelledby="submissionInboxTitle">
          <header class="submission-panel__header">
            <div><p class="section-eyebrow">${isAdmin ? 'CAPTAIN QUEUE' : 'MY SIGNALS'}</p><h3 id="submissionInboxTitle">${isAdmin ? 'Submission Inbox' : 'Mening yuborganlarim'}</h3></div>
            <span>${Number(counts.total) || 0} TOTAL</span>
          </header>
          ${this.filtersMarkup(counts)}
          <div class="submission-list" id="submissionList">${this.listMarkup()}</div>
        </section>
      </div>`;

    this.bindForm();
    this.bindInbox();
    this.updatePendingBadge();
    window.EclipseApp?.refreshMotion?.(this.container);
  }

  formMarkup() {
    const today = window.EclipseDateUtils?.today?.() || new Date().toLocaleDateString('en-CA');
    const playerOptions = (this.availablePlayers?.() || this.db.getActivePlayers?.() || this.db.getPlayers())
      .map(player => `<option value="${this.escape(player.id)}">${this.escape(player.name)}</option>`).join('');
    return `
      <form id="practiceSubmissionForm" class="submission-form" novalidate>
        <div class="submission-upload-grid">
          ${this.dropzoneMarkup(0, 'Scoreboard', 'Asosiy natija rasmi', true)}
          ${this.dropzoneMarkup(1, 'Damage', 'Batafsil statistika · ixtiyoriy', false)}
        </div>
        <p class="submission-privacy"><i class="fa-solid fa-shield-halved"></i> Rasm saqlanmaydi. Captain rasmni emas, yuborilgan raqamlarni tekshiradi. W va L natijalarini ham kiriting.</p>
        <button type="button" class="btn btn-secondary submission-scan-btn" id="practiceScanBtn" disabled>
          <i class="fa-solid fa-wand-magic-sparkles"></i> AI bilan o‘qish
        </button>
        <div id="practiceScanStatus" class="submission-status-line" role="status" aria-live="polite"></div>

        <div class="submission-form-grid">
          <label><span>Kim kiritmoqda?</span><select class="form-select" id="practiceSubmitter" required>${this.auth.isAdmin() ? '<option value="admin">Captain · boshqa o‘yinchilar nomidan</option>' : '<option value="">Rosterdan tanlang…</option>'}${playerOptions}</select></label>
          <label><span>Sana</span><input class="form-input" id="practiceDate" type="date" value="${today}" required></label>
          <label><span>Match turi</span><select class="form-select" id="practiceMatchType" required><option value="ranked">Ranked</option><option value="scrim">Scrim</option><option value="tournament">Turnir</option><option value="casual">Oddiy</option></select></label>
          <label><span>Davomiylik <em>ixtiyoriy</em></span><input class="form-input" id="practiceDuration" inputmode="numeric" placeholder="15:30" pattern="\\d{1,3}:[0-5]\\d"></label>
        </div>

        <fieldset class="submission-result-fieldset">
          <legend>Natija</legend>
          <div class="match-result-options">
          <label><input type="radio" name="practice-result" value="win" required><span><strong aria-hidden="true">W</strong> Win</span></label>
          <label><input type="radio" name="practice-result" value="loss"><span><strong aria-hidden="true">L</strong> Loss</span></label>
          </div>
        </fieldset>

        <div class="submission-participants-head">
          <div><p class="section-eyebrow">TRACKED PLAYERS</p><h4>Qatnashchilar</h4></div>
          <button type="button" class="btn btn-sm btn-secondary" id="addPracticePlayer"><i class="fa-solid fa-plus"></i> O‘yinchi</button>
        </div>
        <div id="practicePlayerRows" class="submission-player-rows"></div>
        <label class="submission-note"><span>Qisqa izoh <em>ixtiyoriy</em></span><textarea class="form-input" id="practiceNotes" rows="3" maxlength="500" placeholder="Nimani mashq qildingiz yoki nimani tekshirish kerak?"></textarea></label>
        <div id="practiceFormError" class="submission-form-error" role="alert" tabindex="-1" hidden></div>
        <button type="submit" class="btn btn-primary submission-submit-btn" id="practiceSubmitBtn"><i class="fa-solid fa-paper-plane"></i> Captain navbatiga yuborish</button>
      </form>`;
  }

  dropzoneMarkup(index, title, subtitle, required) {
    return `
      <div class="submission-dropzone" data-drop-index="${index}">
        <input type="file" accept="image/jpeg,image/png,image/webp" data-file-index="${index}" hidden>
        <button type="button" class="submission-dropzone__empty" data-select-index="${index}" aria-label="${title} skrinshotini tanlash">
          <i class="fa-solid ${index === 0 ? 'fa-image' : 'fa-chart-pie'}"></i>
          <strong>${title}${required ? ' <small>TAVSIYA</small>' : ''}</strong>
          <span>${subtitle}</span>
        </button>
        <div class="submission-dropzone__preview" hidden>
          <button type="button" class="submission-dropzone__replace" data-select-index="${index}" aria-label="${title} skrinshotini almashtirish"><img alt=""></button>
          <button type="button" data-remove-index="${index}" aria-label="${title} skrinshotini olib tashlash"><i class="fa-solid fa-xmark"></i></button>
          <small></small>
        </div>
      </div>`;
  }

  filtersMarkup(counts) {
    return `
      <div class="submission-filters" role="group" aria-label="Submission filtri">
        ${['pending', 'approved', 'rejected', 'all'].map(status => {
          const labels = { pending: 'Kutilmoqda', approved: 'Tasdiq', rejected: 'Rad', all: 'Barchasi' };
          const count = status === 'all' ? counts.total : counts[status];
          return `<button type="button" class="filter-chip ${this.filter === status ? 'active' : ''}" data-submission-filter="${status}" aria-pressed="${this.filter === status}">${labels[status]} <span>${Number(count) || 0}</span></button>`;
        }).join('')}
      </div>`;
  }

  listMarkup() {
    const all = Array.isArray(this.data.submissions) ? this.data.submissions : [];
    const visible = this.filter === 'all' ? all : all.filter(item => item.status === this.filter);
    if (!visible.length) {
      return `<div class="submission-empty"><i class="fa-solid fa-inbox"></i><div><strong>Bu holatda submission yo‘q</strong><p>Yangi practice match yuborilganda shu yerda ko‘rinadi.</p></div></div>`;
    }
    return visible.map(item => this.cardMarkup(item)).join('');
  }

  cardMarkup(item) {
    const isAdmin = this.auth.isAdmin();
    const [statusLabel, statusIcon] = this.statusMeta(item.status);
    const draft = item.draft || {};
    const players = Array.isArray(draft.playerStats) ? draft.playerStats : [];
    const resultLabel = draft.result === 'win' ? 'W' : draft.result === 'loss' ? 'L' : '—';
    const resultState = draft.result === 'win' ? 'win' : draft.result === 'loss' ? 'loss' : 'unknown';
    const practiceDetail = players.length === 1 ? '1 O‘YINCHI' : `${players.length} O‘YINCHI`;
    const metric = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
      ? '—'
      : String(Number(value));
    const reviewReason = item.review?.reason
      ? `<div class="submission-review-note"><span>CAPTAIN NOTE</span><p>${this.escape(item.review.reason)}</p></div>`
      : '';
    const adminControls = isAdmin ? `
      <div class="submission-admin-controls" data-submission-id="${this.escape(item.id)}">
        ${item.status === 'pending' ? `
          <label><span>Rad etish sababi</span><input class="form-input" data-reject-reason maxlength="400" placeholder="Faqat rad etishda kerak"></label>
          <div>
            <button type="button" class="btn btn-sm btn-primary" data-action="approve"><i class="fa-solid fa-check"></i> Tasdiqlash</button>
            <button type="button" class="btn btn-sm btn-secondary" data-action="reject"><i class="fa-solid fa-ban"></i> Rad etish</button>
          </div>` : ''}
        <button type="button" class="submission-delete" data-action="delete" aria-label="Submission yozuvini o‘chirish"><i class="fa-solid fa-trash"></i></button>
      </div>` : '';
    return `
      <article class="submission-card is-${this.escape(item.status)}" data-submission-card="${this.escape(item.id)}">
        <header>
          <div class="submission-result is-${resultState}" aria-label="${draft.result === 'win' ? 'Win' : draft.result === 'loss' ? 'Loss' : 'Natija ko‘rsatilmagan'}">${resultLabel}</div>
          <div><small>${this.formatDate(draft.date)} · ${this.escape(String(draft.matchType || '').toUpperCase())}</small><h4>${item.submitter?.role === 'admin' ? 'Captain kiritdi' : `${this.escape(item.submitter?.claimedPlayerName || 'Roster player')} yubordi`}</h4></div>
          <span class="submission-status is-${this.escape(item.status)}"><i class="fa-solid ${statusIcon}"></i> ${statusLabel}</span>
        </header>
        <div class="submission-card__meta"><span class="submission-scope-badge"><i class="fa-solid fa-bolt"></i> ${players.length === 5 ? 'Team 5' : 'Practice'} <em>${practiceDetail}</em></span><span><i class="fa-regular fa-clock"></i> ${this.escape(draft.durationFormatted || '—')}</span><span><i class="fa-solid fa-wand-magic-sparkles"></i> ${item.source === 'ocr' ? 'AI OCR' : 'Manual'}</span></div>
        <div class="submission-mini-roster">
          ${players.map(player => `<div><strong>${this.escape(player.playerName)}</strong><span>${this.escape(player.heroUsed)} · ${this.escape(player.rolePlayed)}</span><em>${metric(player.kills)}/${metric(player.deaths)}/${metric(player.assists)}${player.inGameScore !== null && player.inGameScore !== undefined && Number.isFinite(Number(player.inGameScore)) ? ` · ${Number(player.inGameScore).toFixed(1)}` : ''}</em></div>`).join('')}
        </div>
        ${draft.notes ? `<p class="submission-card__notes">${this.escape(draft.notes)}</p>` : ''}
        ${reviewReason}
        ${!isAdmin && item.status === 'rejected' ? `<button type="button" class="btn btn-sm btn-secondary" data-resubmit="${this.escape(item.id)}">Tuzatib qayta yuborish</button>` : ''}
        ${adminControls}
      </article>`;
  }

  bindForm() {
    const form = this.container?.querySelector('#practiceSubmissionForm');
    if (!form) return;
    this.invalidateOcrWork();
    this.images = [null, null];
    this.imageNames = ['', ''];
    this.ocrSource = 'manual';
    this.ocrReviewIssues = [];
    this.rowCounter = 0;
    this.addParticipantRow();
    this.formDirty = false;
    form.addEventListener('input', () => { this.formDirty = true; });
    form.addEventListener('change', () => { this.formDirty = true; });

    form.querySelector('#addPracticePlayer')?.addEventListener('click', () => {
      const rowCount = form.querySelectorAll('.submission-player-row').length;
      if (rowCount >= 5) return window.showToast?.('Bitta matchga ko‘pi bilan 5 a’zo qo‘shiladi.', 'warning');
      this.formDirty = true;
      this.addParticipantRow();
    });
    form.querySelectorAll('[data-drop-index]').forEach(zone => {
      const index = Number(zone.dataset.dropIndex);
      const input = form.querySelector(`[data-file-index="${index}"]`);
      zone.querySelectorAll('[data-select-index]').forEach(button => {
        button.addEventListener('click', () => input?.click());
      });
      zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-dragging'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
      zone.addEventListener('drop', event => {
        event.preventDefault();
        zone.classList.remove('is-dragging');
        this.readImage(event.dataTransfer?.files?.[0], index);
      });
      input?.addEventListener('change', event => this.readImage(event.target.files?.[0], index));
    });
    form.querySelectorAll('[data-remove-index]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        this.invalidateOcrWork();
        this._imageReads ||= [0, 0];
        this._imageReads[Number(button.dataset.removeIndex)]++;
        this.images[Number(button.dataset.removeIndex)] = null;
        this.imageNames[Number(button.dataset.removeIndex)] = '';
        this.updateImageSlots();
      });
    });
    form.querySelector('#practiceScanBtn')?.addEventListener('click', () => this.scanImages());
    form.addEventListener('submit', event => this.submitForm(event));

    if (this.pasteHandler) document.removeEventListener('paste', this.pasteHandler);
    this.pasteHandler = event => {
      if (!this.container?.closest('.page-section')?.classList.contains('active')) return;
      const imageItem = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile?.();
      if (!file) return;
      event.preventDefault();
      this.readImage(file, 0);
    };
    document.addEventListener('paste', this.pasteHandler);
  }

  addParticipantRow(values = {}) {
    const rows = this.container?.querySelector('#practicePlayerRows');
    if (!rows) return;
    const index = ++this.rowCounter;
    const players = this.availablePlayers?.() || this.db.getActivePlayers?.() || this.db.getPlayers();
    const heroes = this.heroDb?.getAll?.() || [];
    const roles = ['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'];
    const row = document.createElement('div');
    row.className = 'submission-player-row';
    row.dataset.rowId = String(index);
    row.innerHTML = `
      <div class="submission-player-row__index">${String(index).padStart(2, '0')}</div>
      <label><span>O‘yinchi</span><select class="form-select" data-field="playerId" required><option value="">Tanlang…</option>${players.map(player => `<option value="${this.escape(player.id)}" ${player.id === values.playerId ? 'selected' : ''}>${this.escape(player.name)}</option>`).join('')}</select></label>
      <label><span>Qahramon</span><input class="form-input" data-field="heroUsed" list="practiceHeroes${index}" value="${this.escape(values.heroUsed || '')}" required><datalist id="practiceHeroes${index}">${heroes.map(hero => `<option value="${this.escape(hero.name)}">${this.escape(hero.role || '')}</option>`).join('')}</datalist></label>
      <label><span>Rol</span><select class="form-select" data-field="rolePlayed" required><option value="">Tanlang…</option>${roles.map(role => `<option value="${role}" ${role === values.rolePlayed ? 'selected' : ''}>${role}</option>`).join('')}</select></label>
      <label class="submission-kda"><span>K / D / A</span><span><input class="form-input" data-field="kills" type="number" min="0" max="200" value="${this.escape(values.kills ?? '')}" required><input class="form-input" data-field="deaths" type="number" min="0" max="200" value="${this.escape(values.deaths ?? '')}" required><input class="form-input" data-field="assists" type="number" min="0" max="500" value="${this.escape(values.assists ?? '')}" required></span></label>
      <label><span>Baho <em>ixtiyoriy</em></span><input class="form-input" data-field="inGameScore" type="number" min="0" max="20" step="0.1" value="${this.escape(values.inGameScore ?? '')}"></label>
      <label><span>Medal <em>ixtiyoriy</em></span><select class="form-select" data-field="medal"><option value="">Noma’lum</option>${['mvp', 'gold', 'silver', 'bronze'].map(medal => `<option value="${medal}" ${String(values.medal || '').toLowerCase() === medal ? 'selected' : ''}>${medal.toUpperCase()}</option>`).join('')}</select></label>
      <button type="button" class="submission-row-remove" aria-label="O‘yinchini olib tashlash"><i class="fa-solid fa-xmark"></i></button>`;
    row.querySelector('.submission-row-remove')?.addEventListener('click', () => {
      if (rows.querySelectorAll('.submission-player-row').length <= 1) {
        return window.showToast?.('Kamida bitta o‘yinchi kerak.', 'warning');
      }
      row.remove();
      this.formDirty = true;
    });
    rows.appendChild(row);
  }

  readImage(file, index) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) return window.showToast?.('Faqat JPEG, PNG yoki WEBP rasm tanlang.', 'warning');
    if (file.size > 3 * 1024 * 1024) return window.showToast?.('Rasm 3 MB dan kichik bo‘lishi kerak.', 'warning');
    this.invalidateOcrWork();
    this._imageReads ||= [0, 0];
    const readId = ++this._imageReads[index];
    const form = this.container?.querySelector('#practiceSubmissionForm');
    const reader = new FileReader();
    reader.onload = event => {
      if (readId !== this._imageReads[index] || !form?.isConnected || this.container?.querySelector('#practiceSubmissionForm') !== form) return;
      this.formDirty = true;
      this.images[index] = event.target.result;
      this.imageNames[index] = file.name || `${index + 1}-skrinshot`;
      this.updateImageSlots();
    };
    reader.readAsDataURL(file);
  }

  updateImageSlots() {
    this.container?.querySelectorAll('[data-drop-index]').forEach(zone => {
      const index = Number(zone.dataset.dropIndex);
      const preview = zone.querySelector('.submission-dropzone__preview');
      const empty = zone.querySelector('.submission-dropzone__empty');
      const img = preview?.querySelector('img');
      const label = preview?.querySelector('small');
      const input = zone.querySelector('input[type="file"]');
      const hasImage = Boolean(this.images[index]);
      zone.classList.toggle('has-image', hasImage);
      if (preview) preview.hidden = !hasImage;
      if (empty) empty.hidden = hasImage;
      if (img) {
        img.src = hasImage ? this.images[index] : '';
        img.alt = '';
      }
      if (label) label.textContent = this.imageNames[index];
      if (!hasImage && input) input.value = '';
    });
    const button = this.container?.querySelector('#practiceScanBtn');
    if (button) button.disabled = !this.images.some(Boolean);
  }

  invalidateOcrWork() {
    this._ocrGeneration = (this._ocrGeneration || 0) + 1;
    this._ocrController?.abort();
    this._ocrController = null;
    this.ocrMeta = null;
    this.container?.querySelector('[data-ocr-meta]')?.remove();
    this.container?.querySelectorAll('.submission-player-row').forEach(row => {
      row._cropGeneration = (row._cropGeneration || 0) + 1;
      row._matchGeneration = (row._matchGeneration || 0) + 1;
      row._portraitCrop = null;
      row.querySelector('.match-hero-review > canvas')?.remove();
      row.querySelector('[data-hero-candidates]')?.remove();
      row.querySelector('[data-crop-editor]')?.remove();
      const rescan = row.querySelector('[data-rescan-hero]');
      if (rescan) { rescan.hidden = true; rescan.disabled = false; }
    });
  }

  isOcrContextCurrent(context) {
    return context.generation === this._ocrGeneration && !context.signal.aborted && context.form.isConnected
      && this.container === context.container && this.container.querySelector('#practiceSubmissionForm') === context.form
      && context.slots.every((source, index) => this.images[index] === source)
      && (!context.page || context.page.classList.contains('active'));
  }

  renderOcrMeta(status, meta) {
    status?.querySelector('[data-ocr-meta]')?.remove();
    if (!status || !meta || typeof meta !== 'object') return;
    const text = value => typeof value === 'string' ? value.slice(0, 120) : Number.isFinite(value) ? String(value) : '—';
    const elapsed = value => Number.isFinite(value) && value >= 0 ? `${(value / 1000).toFixed(1)}s` : '—';
    const attempts = (Array.isArray(meta.attempts) ? meta.attempts.slice(0, 3) : []).map(attempt => `${text(attempt.model)}: ${text(attempt.status)} (${elapsed(attempt.durationMs)})`).join(' → ');
    const line = document.createElement('small'); line.dataset.ocrMeta = '';
    line.textContent = `Model: ${text(meta.model)} · Versiya: ${text(meta.modelVersion)} · ${elapsed(meta.durationMs)}${attempts ? ` · Urinishlar: ${attempts}` : ''}`;
    status.append(line);
  }

  async scanImages() {
    const button = this.container?.querySelector('#practiceScanBtn');
    const status = this.container?.querySelector('#practiceScanStatus');
    const images = this.images.filter(Boolean);
    if (!images.length) return;
    this.invalidateOcrWork();
    const controller = this._ocrController = new AbortController();
    const form = this.container?.querySelector('#practiceSubmissionForm');
    if (!form) return;
    const page = form.closest('.page-section');
    const context = { generation: this._ocrGeneration, form, container: this.container, slots: [...this.images], images, signal: controller.signal, page: page?.classList.contains('active') ? page : null };
    const current = () => this.isOcrContextCurrent(context);
    let awaitingProvider = true;
    const preserveEdit = () => {
      if (!awaitingProvider || !current()) return;
      controller.abort();
      if (status) status.textContent = 'Forma o‘zgartirildi. AI javobi qo‘llanmadi; kiritgan ma’lumotlaringiz saqlandi.';
    };
    form.addEventListener('input', preserveEdit);
    form.addEventListener('change', preserveEdit);
    // Abort on navigation even if the user returns before the provider finishes.
    const navigation = context.page && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
      if (!context.page.classList.contains('active')) controller.abort();
    }) : null;
    navigation?.observe(context.page, { attributes: true, attributeFilter: ['class'] });
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI o‘qimoqda…';
    }
    if (status) status.innerHTML = '<span class="is-loading"><i class="fa-solid fa-wave-square"></i> Scoreboard tahlil qilinmoqda. Bu bir daqiqagacha davom etishi mumkin.</span>';
    try {
      const token = this.auth.getAccessToken();
      const response = await fetch('/api/ocr', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          purpose: 'practice_submission',
          images,
          rosterPlayers: (this.db.getActivePlayers?.() || this.db.getPlayers()).map(player => ({ id: player.id, name: player.name, role: player.primaryRole || '' })),
          heroList: (this.heroDb?.getAll?.() || []).map(hero => ({ id: hero.id, name: hero.name, role: hero.role }))
        })
      });
      const payload = await response.json().catch(() => ({}));
      awaitingProvider = false;
      if (!current()) return;
      this.ocrMeta = payload.ocrMeta || null;
      if (!response.ok || !payload.data) throw new Error(payload.error || 'AI skan bajarilmadi');
      this.ocrSource = 'ocr';
      this.ocrReviewIssues = Array.isArray(payload.data.reviewIssues) ? payload.data.reviewIssues : [];
      if (status) status.textContent = 'Raqamlar o‘qildi. Original hero ikonkalari shu qurilmada tekshirilmoqda…';
      this.renderOcrMeta(status, this.ocrMeta);
      await this.applyOcrData(payload.data, context);
      if (!current()) return;
      if (status) status.innerHTML = `<span class="is-success"><i class="fa-solid fa-circle-check"></i> Raqamlar tayyor. ${this.ocrExcludedRows || 0} ta guest yoki aniqlanmagan qator olinmadi. Qahramon, medal va raqamlarni tekshirib tasdiqlang.</span>`;
      this.renderOcrMeta(status, this.ocrMeta);
    } catch (error) {
      if (!current()) return;
      if (status) status.innerHTML = `<span class="is-error"><i class="fa-solid fa-triangle-exclamation"></i> ${this.escape(error.message)}</span>`;
      this.renderOcrMeta(status, this.ocrMeta);
      window.showToast?.(error.message, 'error');
    } finally {
      awaitingProvider = false;
      form.removeEventListener('input', preserveEdit);
      form.removeEventListener('change', preserveEdit);
      navigation?.disconnect();
      if (this._ocrController === controller) this._ocrController = null;
      if (context.generation === this._ocrGeneration && button?.isConnected && this.container?.querySelector('#practiceSubmissionForm') === form) {
        button.disabled = !this.images.some(Boolean);
        button.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI bilan o‘qish';
      }
    }
  }

  applyOcrData(data) {
    const form = this.container?.querySelector('#practiceSubmissionForm');
    const rows = form?.querySelector('#practicePlayerRows');
    if (!form || !rows) return;
    const roster = this.db.getActivePlayers?.() || this.db.getPlayers();
    const normalize = value => String(value || '').toLocaleLowerCase('uz-UZ').replace(/[^a-z0-9]/g, '');
    const detected = (Array.isArray(data.players) ? data.players.slice(0, 5) : []).map(player => {
      const byId = roster.find(item => item.id === player.matchedPlayerId);
      const byName = player.detectedName ? roster.filter(item => normalize(item.name) === normalize(player.detectedName)) : [];
      const mapped = byId || (byName.length === 1 ? byName[0] : null);
      return mapped ? { ...player, matchedPlayerId: mapped.id } : null;
    }).filter(Boolean);
    const trackedCount = new Set(detected.map(player => player.matchedPlayerId)).size;
    if (trackedCount > 5) throw new Error('Bitta jamoada ko‘pi bilan 5 ta Eclipse a’zosi bo‘lishi mumkin.');
    if (!trackedCount) throw new Error('Eclipse a’zosi ishonchli aniqlanmadi. O‘yinchini tanlab, ma’lumotni qo‘lda kiriting.');
    this.formDirty = true;
    this.ocrExcludedRows = (data.players?.length || 0) - detected.length;
    rows.innerHTML = '';
    this.rowCounter = 0;
    const used = new Set();
    (detected.length ? detected : [{}]).forEach(player => {
      let playerId = roster.some(item => item.id === player.matchedPlayerId) ? player.matchedPlayerId : '';
      if (!playerId && player.detectedName) {
        const match = roster.find(item => normalize(item.name) === normalize(player.detectedName));
        playerId = match?.id || '';
      }
      if (used.has(playerId)) return;
      if (playerId) used.add(playerId);
      this.addParticipantRow({
        ...player,
        playerId,
        // A catalog-valid name from AI is not visual hero recognition.
        heroUsed: '',
        portraitBox: null,
        rolePlayed: player.rolePlayed || '',
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        inGameScore: player.inGameScore,
        medal: player.medal
      });
    });
    if (data.result) {
      const resultInput = form.querySelector(`input[name="practice-result"][value="${data.result}"]`);
      if (resultInput) resultInput.checked = true;
    }
    if (data.matchType) form.querySelector('#practiceMatchType').value = data.matchType;
    if (data.durationFormatted || data.duration) form.querySelector('#practiceDuration').value = data.durationFormatted || data.duration;
    const firstMapped = rows.querySelector('[data-field="playerId"]')?.value;
    if (firstMapped) form.querySelector('#practiceSubmitter').value = firstMapped;
  }

  formValue(row, field) {
    return row.querySelector(`[data-field="${field}"]`)?.value?.trim?.() ?? '';
  }

  collectDraft() {
    const form = this.container?.querySelector('#practiceSubmissionForm');
    if (!form) throw new Error('Forma topilmadi');
    const rows = [...form.querySelectorAll('.submission-player-row')];
    const playerStats = rows.map(row => {
      const enteredHero = this.formValue(row, 'heroUsed');
      const canonicalHero = this.heroDb?.resolve?.(enteredHero) || null;
      return {
        playerId: this.formValue(row, 'playerId'),
        heroId: canonicalHero?.id || null,
        heroNameSnapshot: canonicalHero?.name || enteredHero,
        heroUsed: canonicalHero?.name || enteredHero,
        heroResolution: canonicalHero?.id ? 'canonical' : enteredHero ? 'legacy_name' : 'unresolved',
        rolePlayed: this.formValue(row, 'rolePlayed'),
        kills: this.formValue(row, 'kills'),
        deaths: this.formValue(row, 'deaths'),
        assists: this.formValue(row, 'assists'),
        inGameScore: this.formValue(row, 'inGameScore') || null,
        medal: this.formValue(row, 'medal') || null
      };
    });
    const claimedPlayerId = form.querySelector('#practiceSubmitter')?.value || '';
    const result = form.querySelector('input[name="practice-result"]:checked')?.value || '';
    if (!claimedPlayerId) throw new Error('Kim yuborayotganini tanlang.');
    if (!result) throw new Error('Match natijasini W yoki L qilib tanlang.');
    if (playerStats.some(stat => !stat.playerId || !stat.heroUsed || !stat.rolePlayed || stat.kills === '' || stat.deaths === '' || stat.assists === '')) {
      throw new Error('Har bir o‘yinchi uchun roster, qahramon, rol va K/D/A ni to‘ldiring.');
    }
    if (!(this.auth.isAdmin() && claimedPlayerId === 'admin') && !playerStats.some(stat => stat.playerId === claimedPlayerId)) {
      throw new Error('Yuboruvchi qatnashchilar ichida bo‘lishi kerak.');
    }
    if (new Set(playerStats.map(stat => stat.playerId)).size !== playerStats.length) {
      throw new Error('Bir roster o‘yinchisini ikki marta tanlab bo‘lmaydi.');
    }
    return {
      claimedPlayerId,
      source: this.ocrSource,
      reviewIssues: this.ocrReviewIssues,
      draft: {
        claimedPlayerId,
        date: form.querySelector('#practiceDate')?.value || '',
        matchType: form.querySelector('#practiceMatchType')?.value || '',
        result,
        durationFormatted: form.querySelector('#practiceDuration')?.value.trim() || null,
        notes: form.querySelector('#practiceNotes')?.value.trim() || '',
        playerStats
      }
    };
  }

  async submitForm(event) {
    event.preventDefault();
    const button = this.container?.querySelector('#practiceSubmitBtn');
    const errorBox = this.container?.querySelector('#practiceFormError');
    try {
      if (errorBox) errorBox.hidden = true;
      const submission = this.collectDraft();
      if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yuborilmoqda…';
      }
      const payload = await this.request(this.editingMatch || this.editingSubmission ? 'PATCH' : 'POST', {
        idempotencyKey: window.crypto?.randomUUID?.() || `submit_${Date.now()}`,
        ...submission,
        ...(this.editingMatch ? { action: 'edit_match', id: this.editingMatch.id, expectedUpdatedAt: this.editingMatch.updatedAt }
          : this.editingSubmission ? { action: 'correct_approve', id: this.editingSubmission.id, expectedUpdatedAt: this.editingSubmission.updatedAt }
          : this.auth.isAdmin() ? { action: 'save' } : {})
      });
      if (payload.match) {
        this.upsertApprovedMatch(payload.match);
        if (!this.cloudSync?.getStatus?.().pending) await this.cloudSync?.syncDown?.();
      }
      this.clearSavedDraft?.();
      this.editingSubmission = null;
      this.editingMatch = null;
      window.showToast?.(payload.match ? 'Match saqlandi va statistikaga qo‘shildi.' : 'Match Captain navbatiga yuborildi.', 'success');
      this.filter = 'pending';
      await this.render(this.container.id);
    } catch (error) {
      if (errorBox) {
        errorBox.textContent = error.message;
        errorBox.hidden = false;
        errorBox.focus?.();
      }
      window.showToast?.(error.message, 'error');
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Captain navbatiga yuborish';
      }
    }
  }

  bindInbox() {
    this.container?.querySelectorAll('[data-submission-filter]').forEach(button => {
      button.addEventListener('click', () => {
        this.filter = button.dataset.submissionFilter;
        this.container.querySelectorAll('[data-submission-filter]').forEach(item => {
          const active = item === button;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        const list = this.container.querySelector('#submissionList');
        if (list) list.innerHTML = this.listMarkup();
        this.bindAdminActions();
      });
    });
    this.bindAdminActions();
  }

  bindAdminActions() {
    this.container?.querySelectorAll('[data-resubmit]').forEach(button => {
      button.addEventListener('click', () => this.prefillRejected(button.dataset.resubmit));
    });
    if (!this.auth.isAdmin()) return;
    this.container?.querySelectorAll('.submission-admin-controls').forEach(controls => {
      const id = controls.dataset.submissionId;
      controls.querySelector('[data-action="approve"]')?.addEventListener('click', event => this.reviewSubmission(event.currentTarget, id, 'approve'));
      controls.querySelector('[data-action="reject"]')?.addEventListener('click', event => {
        const reason = controls.querySelector('[data-reject-reason]')?.value.trim() || '';
        if (!reason) {
          const field = controls.querySelector('[data-reject-reason]');
          field?.focus();
          return window.showToast?.('Rad etish sababini yozing.', 'warning');
        }
        this.reviewSubmission(event.currentTarget, id, 'reject', reason);
      });
      controls.querySelector('[data-action="delete"]')?.addEventListener('click', event => {
        const button = event.currentTarget;
        if (button.dataset.confirming !== 'true') {
          button.dataset.confirming = 'true';
          button.innerHTML = '<i class="fa-solid fa-check"></i>';
          button.setAttribute('aria-label', 'O‘chirishni tasdiqlash');
          setTimeout(() => {
            if (!button.isConnected) return;
            delete button.dataset.confirming;
            button.innerHTML = '<i class="fa-solid fa-trash"></i>';
            button.setAttribute('aria-label', 'Submission yozuvini o‘chirish');
          }, 4000);
          return;
        }
        this.deleteSubmission(button, id);
      });
    });
  }

  prefillRejected(id) {
    if (this.auth.isAdmin()) return;
    const item = this.data.submissions.find(record => record.id === id && record.status === 'rejected');
    const form = this.container?.querySelector('#practiceSubmissionForm');
    if (!item || !form) return;
    if (this.formDirty && !window.confirm('Yozayotgan formangiz o‘rniga rad etilgan matchni yuklaysizmi?')) return;
    const draft = item.draft;
    form.querySelector('#practicePlayerRows').innerHTML = '';
    this.rowCounter = 0;
    draft.playerStats.forEach(row => this.addParticipantRow(row));
    for (const [selector, value] of Object.entries({ '#practiceSubmitter': draft.claimedPlayerId || item.submitter?.claimedPlayerId,
      '#practiceDate': draft.date, '#practiceMatchType': draft.matchType, '#practiceDuration': draft.durationFormatted, '#practiceNotes': draft.notes })) {
      form.querySelector(selector).value = value || '';
    }
    form.querySelectorAll('input[name="practice-result"]').forEach(input => { input.checked = input.value === draft.result; });
    this.images = [null, null];
    this.imageNames = ['', ''];
    this.updateImageSlots();
    this.ocrSource = 'manual';
    this.ocrReviewIssues = [];
    this.formDirty = true;
    const status = form.querySelector('#practiceScanStatus');
    if (status) status.textContent = '';
    const error = form.querySelector('#practiceFormError');
    if (error) error.hidden = true;
    form.scrollIntoView({ block: 'start' });
    form.querySelector('#practiceNotes').focus({ preventScroll: true });
    window.showToast?.('Match formaga olindi. Tuzatib, qayta yuboring; tasdiqsiz statistikaga kirmaydi.', 'info');
  }

  async reviewSubmission(button, id, action, reason = '', extra = {}) {
    button.disabled = true;
    const old = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kuting';
    try {
      const payload = await this.request('PATCH', { id, action, reason, ...extra });
      if (action === 'approve' || action === 'link_existing') {
        this.upsertApprovedMatch(payload.match);
        const hasPendingLocalWrite = this.cloudSync?.getStatus?.().pending === true;
        if (!hasPendingLocalWrite) await this.cloudSync?.syncDown?.();
      }
      window.showToast?.(action === 'link_existing' ? 'Mavjud matchga bog‘landi. Raqamlar almashtirilmadi.' : action === 'approve' ? 'Match tasdiqlandi va statistikaga qo‘shildi.' : 'Submission rad etildi.', action === 'reject' ? 'info' : 'success');
      await this.render(this.container.id);
    } catch (error) {
      window.showToast?.(error.message, 'error');
      if (button.isConnected) {
        button.disabled = false;
        button.innerHTML = old;
      }
    }
  }

  upsertApprovedMatch(match) {
    if (!match?.id || !this.db?.getMatches || !this.db?.saveMatches) return false;
    // An API acknowledgement must not replace a locally pending version.
    // The next cloud merge reconciles the full remote snapshot explicitly.
    if (this.cloudSync?.getStatus?.().pending) return false;
    const matches = this.db.getMatches();
    const index = matches.findIndex(item => item.id === match.id);
    if (index >= 0) {
      matches[index] = { ...matches[index], ...match, id: match.id };
    } else {
      matches.push(match);
    }
    this.db.saveMatches(matches);
    return true;
  }

  async deleteSubmission(button, id) {
    button.disabled = true;
    try {
      await this.request('DELETE', { id });
      window.showToast?.('Submission yozuvi o‘chirildi. Tasdiqlangan match bo‘lsa, u Matchlar ichida qoladi.', 'info');
      await this.render(this.container.id);
    } catch (error) {
      window.showToast?.(error.message, 'error');
      if (button.isConnected) button.disabled = false;
    }
  }

  updatePendingBadge() {
    const badge = document.getElementById('submissionPendingBadge');
    if (!badge) return;
    const pending = Number(this.data.counts?.pending) || 0;
    badge.textContent = String(pending);
    badge.hidden = pending === 0;
    badge.setAttribute('aria-label', `${pending} ta kutilayotgan submission`);
  }
};
