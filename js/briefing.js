window.BriefingManager = class BriefingManager {
  constructor(authManager, mlbbData = null, dataStore = null) {
    this.auth = authManager;
    this.mlbbData = mlbbData;
    this.db = dataStore;
    this.patchState = null;
    this.endpoint = '/api/briefing';
    this.voterKey = 'eclipse_briefing_voter';
    this.data = {
      summary: '',
      focus: [],
      reviews: [],
      polls: [],
      insights: [],
      decisionLog: [],
      votedPollIds: [],
      updatedAt: null
    };
    this.container = null;
    this.loading = false;
    this.drafts = new Map();
    window.addEventListener?.('beforeunload', event => {
      if (!this.auth.isAdmin() || !this.drafts.size) return;
      event.preventDefault(); event.returnValue = '';
    });
  }

  escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  getVoterId() {
    let value = localStorage.getItem(this.voterKey);
    if (!value || !/^[a-zA-Z0-9_-]{16,120}$/.test(value)) {
      value = window.crypto?.randomUUID?.() || `ecl_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(this.voterKey, value);
    }
    return value;
  }

  async request(method = 'GET', body = null, admin = false) {
    const headers = { 'X-Eclipse-Voter': this.getVoterId() };
    if (body) headers['Content-Type'] = 'application/json';
    const accessToken = admin ? this.auth.getToken() : this.auth.getAccessToken?.();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(this.endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Briefing bilan bog‘lanishda xatolik');
      error.status = response.status;
      error.code = payload.code;
      if (response.status === 401 && payload.code === 'VIEWER_AUTH_REQUIRED') {
        this.auth.showViewerLoginModal?.(() => this.render('briefingContainer'));
      }
      throw error;
    }
    return payload;
  }

  async render(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.container.innerHTML = this.loadingMarkup();
    this.loading = true;
    try {
      const [briefingResult, patchResult] = await Promise.allSettled([
        this.request(),
        this.mlbbData?.getPatches?.() || Promise.resolve(null)
      ]);
      if (briefingResult.status === 'rejected') throw briefingResult.reason;
      this.data = briefingResult.value;
      this.patchState = patchResult.status === 'fulfilled' ? patchResult.value : null;
      this.renderState();
    } catch (error) {
      this.renderError(error.message);
    } finally {
      this.loading = false;
    }
  }

  refreshForAuthChange() {
    if (this.container && document.getElementById('page-briefing')?.classList.contains('active')) {
      this.render('briefingContainer');
    }
  }

  loadingMarkup() {
    return `
      <div class="briefing-loading" role="status" aria-live="polite">
        <span class="briefing-loader" aria-hidden="true"></span>
        <div><strong>Briefing olinmoqda</strong><small>Jamoa signali sinxronlanmoqda...</small></div>
      </div>`;
  }

  renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="briefing-error" role="alert">
        <span class="briefing-error__icon"><i class="fa-solid fa-satellite-dish"></i></span>
        <div><p class="briefing-kicker">SIGNAL UZILDI</p><h3>Briefingni ochib bo‘lmadi</h3><p>${this.escape(message)}</p></div>
        <button class="btn btn-secondary" id="briefingRetryBtn"><i class="fa-solid fa-rotate"></i> Qayta urinish</button>
      </div>`;
    document.getElementById('briefingRetryBtn')?.addEventListener('click', () => this.render('briefingContainer'));
  }

  statusMeta(status) {
    return {
      waiting: ['Kutilmoqda', 'fa-clock'],
      reviewing: ['Ko‘rilmoqda', 'fa-eye'],
      decided: ['Qaror qilindi', 'fa-gavel'],
      done: ['Bajarildi', 'fa-check']
    }[status] || ['Kutilmoqda', 'fa-clock'];
  }

  insightStatusMeta(status) {
    return {
      pending: ['Captain tekshiruvi', 'fa-hourglass-half'],
      approved: ['Tasdiqlangan', 'fa-shield-halved'],
      rejected: ['Rad etilgan', 'fa-ban']
    }[status] || ['Captain tekshiruvi', 'fa-hourglass-half'];
  }

  formatDate(value) {
    return window.EclipseDateUtils?.formatDisplayDate?.(value, { includeTime: true }) || 'Hozircha yo‘q';
  }

  deadlineMeta(value, dateOnly = false) {
    if (!value || Number.isNaN(Date.parse(value))) return null;
    const date = new Date(value);
    return {
      label: window.EclipseDateUtils?.formatDisplayDate?.(date, {
        includeTime: !dateOnly,
        includeYear: dateOnly
      }) || '—',
      overdue: date.getTime() < Date.now()
    };
  }

  toIsoDateTime(value) {
    if (!value || Number.isNaN(Date.parse(value))) return null;
    return new Date(value).toISOString();
  }

  renderState() {
    if (!this.container) return;
    this.data.focus = Array.isArray(this.data.focus) ? this.data.focus : [];
    this.data.votedPollIds = Array.isArray(this.data.votedPollIds) ? this.data.votedPollIds : [];
    const polls = Array.isArray(this.data.polls) ? this.data.polls : [];
    const reviews = Array.isArray(this.data.reviews) ? this.data.reviews : [];
    const insights = Array.isArray(this.data.insights) ? this.data.insights : [];
    const activePolls = polls.filter(poll => poll.active);
    const closedPolls = polls.filter(poll => !poll.active);
    const openReviews = reviews.filter(review => review.status !== 'done');
    const visibleReviews = reviews.filter(review => this.reviewView === 'done' ? review.status === 'done' : review.status !== 'done');
    const decisions = this.getDecisionLog(reviews, polls);
    const isAdmin = this.auth.isAdmin();

    this.container.innerHTML = `
      <section class="briefing-hero" aria-labelledby="briefingHeading">
        <div class="briefing-hero__signal" aria-hidden="true">
          <span class="briefing-hero__orbit"></span>
          <svg><use href="assets/eclipse-symbols.svg?v=2.16.0#ecl-briefing"></use></svg>
        </div>
        <div class="briefing-hero__copy">
          <p class="briefing-kicker">ECLIPSE // MATCH INTELLIGENCE</p>
          <h2 id="briefingHeading">Briefing</h2>
          <p>Muhokama Discordda. Yakuniy fokus, VOD va jamoa qarorlari shu yerda.</p>
        </div>
        <div class="briefing-telemetry" aria-label="Briefing holati">
          <span><strong>${this.data.focus.length}</strong><small>Fokus</small></span>
          <span><strong>${openReviews.length}</strong><small>VOD</small></span>
          <span><strong>${activePolls.length}</strong><small>Ochiq ovoz</small></span>
          <span><strong>${this.patchState?.data?.length || '—'}</strong><small>Patch radar</small></span>
        </div>
      </section>

      <div class="briefing-layout">
        <div class="briefing-main">
          ${this.summaryMarkup()}
          ${this.focusMarkup()}
          ${this.patchRadarMarkup()}
          ${this.insightsMarkup(insights, isAdmin)}
          ${this.pollsMarkup(activePolls, closedPolls, isAdmin)}
          ${this.reviewsMarkup(visibleReviews, isAdmin)}
        </div>
        <aside class="briefing-rail">
          ${this.decisionsMarkup(decisions)}
          <div class="briefing-signal-card">
            <span class="briefing-signal-card__dot"></span>
            <p class="briefing-kicker">LIVE DOCUMENT</p>
            <strong>${this.data.updatedAt ? 'Oxirgi signal' : 'Birinchi signal kutilmoqda'}</strong>
            <small>${this.formatDate(this.data.updatedAt)}</small>
          </div>
        </aside>
      </div>

      ${isAdmin ? this.adminMarkup() : ''}`;

    this.bindEvents();
    this.restoreFormDrafts();
    window.EclipseApp?.refreshMotion?.(this.container);
  }

  getDecisionLog(reviews, polls) {
    if (Array.isArray(this.data.decisionLog)) return this.data.decisionLog;
    return [
      ...reviews.filter(review => review.decision || review.status === 'done').map(review => ({
        id: `review_${review.id}`,
        type: 'vod',
        title: review.title,
        decision: review.decision || 'Bajarildi',
        matchId: review.matchId || '',
        decidedAt: review.updatedAt || review.createdAt
      })),
      ...polls.filter(poll => poll.decision).map(poll => ({
        id: `poll_${poll.id}`,
        type: 'poll',
        title: poll.question,
        decision: poll.decision,
        matchId: '',
        decidedAt: poll.decidedAt || poll.createdAt
      }))
    ].sort((a, b) => Date.parse(b.decidedAt || 0) - Date.parse(a.decidedAt || 0));
  }

  summaryMarkup() {
    return `
      <section class="briefing-panel briefing-summary">
        <header class="briefing-panel__header">
          <div><p class="briefing-kicker">CAPTAIN NOTE</p><h3>Admin xulosasi</h3></div>
          <span class="briefing-panel__index">00</span>
        </header>
        ${this.data.summary
          ? `<blockquote><i class="fa-solid fa-quote-left"></i><p>${this.escape(this.data.summary)}</p></blockquote>`
          : this.emptyMarkup('fa-pen-nib', 'Xulosa kutilmoqda', 'Admin jamoa uchun qisqa yakuniy signal qoldirishi mumkin.')}
      </section>`;
  }

  focusMarkup() {
    const items = this.data.focus.length
      ? this.data.focus.map((item, index) => `
          <li><span>${String(index + 1).padStart(2, '0')}</span><p>${this.escape(item)}</p></li>`).join('')
      : '<li class="briefing-empty-row"><span>—</span><p>Admin joriy fokusni hali belgilamagan.</p></li>';
    return `
      <section class="briefing-panel briefing-focus">
        <header class="briefing-panel__header">
          <div><p class="briefing-kicker">CURRENT DIRECTIVE</p><h3>Joriy fokus</h3></div>
          <span class="briefing-panel__index">01</span>
        </header>
        <ol>${items}</ol>
      </section>`;
  }

  patchRadarMarkup() {
    const patch = this.patchState?.data?.find(item => item.classification !== 'preview') || this.patchState?.data?.[0] || null;
    if (!patch) {
      return `
        <section class="briefing-panel briefing-patch-radar is-pending">
          <header class="briefing-panel__header"><div><p class="briefing-kicker">PATCH RADAR</p><h3>Meta signali</h3></div><span class="briefing-panel__index">02</span></header>
          ${this.emptyMarkup('fa-satellite-dish', 'Patch sync kutilmoqda', 'Meta Lab birinchi marta sync qilingach latest patch signali shu yerda chiqadi.')}
        </section>`;
    }
    const adjustments = this.relevantPatchAdjustments(patch);
    const newHeroes = Array.isArray(patch.newHeroes) ? patch.newHeroes : [];
    const counts = patch.changeCounts || {};
    const parsed = Boolean(patch.parsedAt);
    return `
      <section class="briefing-panel briefing-patch-radar">
        <header class="briefing-panel__header"><div><p class="briefing-kicker">PATCH RADAR / OFFICIAL CMS</p><h3>Jamoamiz herolari va patch</h3></div><span class="briefing-panel__index">02</span></header>
        <article class="briefing-patch-radar__feature">
          <div><span class="briefing-status is-active"><i class="fa-solid fa-signal"></i> ${this.escape(patch.classification || 'patch')}</span><h4>${this.escape(patch.title)}</h4><p>${this.escape(patch.brief || patch.overview?.[0] || 'Official patch signal')}</p></div>
          <p>${parsed ? 'Avtomatik topilgan o‘zgarishlar. Ro‘yxat to‘liq bo‘lmasligi mumkin — original notesni tekshiring.' : 'Patch topildi · tahlil kutilmoqda'}</p>
          <dl><div><dt>Buff</dt><dd>${parsed ? Number(counts.buffs) || 0 : '—'}</dd></div><div><dt>Nerf</dt><dd>${parsed ? Number(counts.nerfs) || 0 : '—'}</dd></div><div><dt>Adjust</dt><dd>${parsed ? Number(counts.adjustments) || 0 : '—'}</dd></div><div><dt>New</dt><dd>${parsed ? newHeroes.length : '—'}</dd></div></dl>
        </article>
        <p class="text-muted">${adjustments.length ? 'So‘nggi 90 kunda o‘ynagan va hero pool’ga kiritilgan herolarimizga tegishli topilmalar:' : 'O‘ynagan va hero pool’dagi herolarimiz uchun hozircha topilma yo‘q. Bu ularga o‘zgarish bo‘lmaganini anglatmaydi.'}</p>
        ${adjustments.length || newHeroes.length ? `<div class="briefing-patch-radar__signals">${newHeroes.map(item => `<span class="is-new"><small>YANGI HERO</small><strong>${this.escape(item.heroName)}</strong></span>`).join('')}${adjustments.map(item => `<span class="is-${this.escape(item.change)}"><small>${this.escape(item.change)} · ${item.matches} match${item.poolPlayers?.length ? ` · Pool: ${item.poolPlayers.map(name => this.escape(name)).join(', ')}` : ''}</small><strong>${this.escape(item.heroName)}</strong></span>`).join('')}</div>` : ''}
        <footer><span>${this.formatDate(patch.publishedAt)}</span>${patch.officialUrl ? `<a href="${this.escape(patch.officialUrl)}" target="_blank" rel="noopener noreferrer">Official notes <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}</footer>
      </section>`;
  }

  relevantPatchAdjustments(patch, now = new Date()) {
    const engine = window.StatsEngine;
    if (!engine) return [];
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - 90);
    const from = cutoff.toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const matches = (this.db?.getMatches?.() || []).filter(match => match.date >= from && match.date <= to
      && match.validForAnalytics !== false && !match.needsReview && match.status !== 'draft');
    return (patch.heroAdjustments || []).map(item => {
      const identity = engine.getHeroIdentity({ heroId: item.heroId, heroUsed: item.heroName });
      const count = identity ? matches.filter(match => (match.playerStats || []).some(stat => {
        const hero = engine.getHeroIdentity(stat);
        return hero?.key === identity.key || (!hero?.heroId && engine.normalizeHeroKey(hero?.heroName) === engine.normalizeHeroKey(item.heroName));
      })).length : 0;
      const poolPlayers = (this.db?.getActivePlayers?.() || []).filter(player => (player.heroPool || []).some(hero => Number(hero.heroId) === Number(item.heroId))).map(player => player.name);
      return { ...item, matches: count, poolPlayers };
    }).filter(item => item.matches > 0 || item.poolPlayers.length).sort((a, b) => b.matches - a.matches);
  }

  insightsMarkup(insights, isAdmin) {
    const ordered = [...insights].sort((a, b) => {
      const priority = { pending: 0, approved: 1, rejected: 2 };
      const statusDelta = (priority[a.status] ?? 3) - (priority[b.status] ?? 3);
      if (statusDelta) return statusDelta;
      return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
    });
    const content = ordered.length
      ? ordered.slice(0, this.insightLimit || 12).map(insight => this.insightMarkup(insight, isAdmin)).join('')
      : this.emptyMarkup('fa-wave-square', 'Tasdiqlangan signal yo‘q', 'Match tahlilidan tasdiqlangan xulosa chiqqanda shu yerda ko‘rinadi.');
    const pendingCount = ordered.filter(insight => insight.status === 'pending').length;
    return `
      <section class="briefing-panel">
        <header class="briefing-panel__header">
          <div><p class="briefing-kicker">CAPTAIN-VERIFIED SIGNALS</p><h3>Match insights</h3></div>
          <span class="briefing-panel__index">${isAdmin && pendingCount ? `${pendingCount} REVIEW` : '02'}</span>
        </header>
        <div class="briefing-reviews">${content}</div>
        ${ordered.length > (this.insightLimit || 12) ? '<button class="btn btn-secondary" type="button" data-action="insight-more">Yana ko‘rsatish</button>' : ''}
      </section>`;
  }

  insightMarkup(insight, isAdmin) {
    const [statusLabel, statusIcon] = this.insightStatusMeta(insight.status);
    const statusClass = {
      pending: 'is-waiting',
      approved: 'is-done',
      rejected: 'is-closed'
    }[insight.status] || 'is-waiting';
    const confidenceLabel = {
      insufficient: 'Dalil kam',
      provisional: 'Dastlabki signal',
      stable: 'Kengroq kuzatuv'
    }[insight.confidence] || 'Dalil kam';
    const reasons = Array.isArray(insight.reasons) ? insight.reasons.filter(Boolean) : [];
    const controls = isAdmin ? `
      <div class="briefing-inline-actions" data-insight-id="${this.escape(insight.id)}">
        ${insight.status !== 'approved' ? `<button class="btn btn-sm btn-primary" data-action="approve-insight"><i class="fa-solid fa-check"></i> Tasdiqlash</button>` : ''}
        ${insight.status !== 'rejected' ? `<button class="btn btn-sm btn-secondary" data-action="reject-insight"><i class="fa-solid fa-ban"></i> Rad etish</button>` : ''}
        <button class="btn btn-sm btn-danger" data-action="delete-insight" aria-label="Insightni o‘chirish"><i class="fa-solid fa-trash"></i></button>
      </div>` : '';
    return `
      <article class="briefing-review briefing-insight is-${this.escape(insight.status)}">
        <div class="briefing-review__status"><i class="fa-solid ${statusIcon}"></i></div>
        <div class="briefing-review__content">
          <div class="briefing-review__top"><h4>${this.escape(insight.title)}</h4><span class="briefing-status ${statusClass}">${statusLabel}</span></div>
          <p>${this.escape(insight.summary)}</p>
          ${reasons.length ? `<blockquote class="briefing-source-insight"><span>DALIL IZLARI</span><p>${reasons.map(reason => this.escape(reason)).join(' · ')}</p></blockquote>` : ''}
          <div class="briefing-review__meta">
            <span><i class="fa-solid fa-layer-group"></i> ${Number(insight.sampleSize) || 0} match</span>
            <span><i class="fa-solid fa-signal"></i> ${confidenceLabel}</span>
            ${insight.matchId ? `<button type="button" data-action="open-review-match" data-match-id="${this.escape(insight.matchId)}"><i class="fa-solid fa-link"></i> Bog‘langan match</button>` : ''}
          </div>
          ${controls}
        </div>
      </article>`;
  }

  pollsMarkup(activePolls, closedPolls, isAdmin) {
    const allPolls = this.pollView === 'closed' ? closedPolls : activePolls;
    const visiblePolls = allPolls.slice(0, this.pollLimit || 8);
    const content = visiblePolls.length
      ? visiblePolls.map(poll => this.pollMarkup(poll, isAdmin)).join('')
      : this.emptyMarkup('fa-check-to-slot', 'Hozircha so‘rovnoma yo‘q', 'Admin yangi savol ochganda shu yerda ko‘rinadi.');
    return `
      <section class="briefing-panel">
        <header class="briefing-panel__header">
          <div><p class="briefing-kicker">TEAM CONSENSUS</p><h3>So‘rovnomalar</h3></div>
          <span class="briefing-panel__index">03</span>
        </header>
        <div class="briefing-inline-actions"><button type="button" class="btn btn-sm btn-secondary" data-action="poll-active" aria-pressed="${this.pollView !== 'closed'}">Faol · ${activePolls.length}</button><button type="button" class="btn btn-sm btn-secondary" data-action="poll-closed" aria-pressed="${this.pollView === 'closed'}">Arxiv · ${closedPolls.length}</button></div>
        <div class="briefing-polls">${content}</div>
        ${allPolls.length > visiblePolls.length ? '<button type="button" class="btn btn-secondary" data-action="poll-more">Yana ko‘rsatish</button>' : ''}
      </section>`;
  }

  pollMarkup(poll, isAdmin) {
    const total = Number.isFinite(poll.totalVotes)
      ? poll.totalVotes
      : poll.options.reduce((sum, option) => sum + option.votes, 0);
    const voted = this.data.votedPollIds.includes(poll.id);
    const deadline = this.deadlineMeta(poll.closesAt);
    const options = poll.options.map(option => {
      const percent = total ? Math.round((option.votes / total) * 100) : 0;
      return `
        <button class="briefing-poll-option" data-action="vote" data-poll-id="${poll.id}" data-option-id="${option.id}"
          style="--vote-pct:${percent}%" ${(!poll.active || voted) ? 'disabled' : ''}>
          <span>${this.escape(option.label)}</span>
          <strong>${option.votes} <small>/ ${percent}%</small></strong>
        </button>`;
    }).join('');
    const adminActions = isAdmin ? `
      <div class="briefing-inline-actions" data-poll-admin="${poll.id}">
        <button class="btn btn-sm btn-secondary" data-action="toggle-poll" data-id="${poll.id}" data-active="${poll.active}">
          <i class="fa-solid ${poll.active ? 'fa-lock' : 'fa-lock-open'}"></i> ${poll.active ? 'Yopish' : 'Qarorni bekor qilib qayta ochish'}
        </button>
        <button class="btn btn-sm btn-danger" data-action="delete-poll" data-id="${poll.id}" aria-label="So‘rovnomani o‘chirish"><i class="fa-solid fa-trash"></i></button>
      </div>` : '';
    const decision = poll.decision ? `
      <div class="briefing-poll__decision"><span><i class="fa-solid fa-gavel"></i> Yakuniy qaror</span><p>${this.escape(poll.decision)}</p></div>` : '';
    const decisionControl = isAdmin ? `
      <div class="briefing-poll-decision" data-poll-decision="${poll.id}">
        <input class="form-input" data-field="poll-decision" maxlength="400" value="${this.escape(poll.decision || '')}" placeholder="Ovoz natijasidan yakuniy qaror...">
        <button class="btn btn-sm btn-primary" data-action="save-poll-decision" data-id="${poll.id}"><i class="fa-solid fa-gavel"></i> Qarorni saqlash</button>
      </div>` : '';
    return `
      <article class="briefing-poll ${poll.active ? '' : 'is-closed'}">
        <div class="briefing-poll__meta">
          <span class="briefing-status ${poll.active ? 'is-active' : 'is-closed'}"><i class="fa-solid ${poll.active ? 'fa-signal' : 'fa-lock'}"></i> ${poll.active ? 'Ochiq' : 'Yopilgan'}</span>
          <small>${deadline ? `<i class="fa-regular fa-hourglass-half"></i> ${deadline.label} · ` : ''}${total} ovoz</small>
        </div>
        <h4>${this.escape(poll.question)}</h4>
        <div class="briefing-poll__options">${options}</div>
        ${decision}
        <div class="briefing-poll__footer">
          <p>${voted ? '<i class="fa-solid fa-circle-check"></i> Ovozingiz qabul qilingan' : (poll.active ? 'Bitta variantni tanlang — ovoz qayta o‘zgartirilmaydi.' : 'Natija yakunlangan.')}</p>
          ${adminActions}
        </div>
        ${decisionControl}
      </article>`;
  }

  reviewsMarkup(reviews, isAdmin) {
    const content = reviews.length
      ? reviews.map(review => this.reviewMarkup(review, isAdmin)).join('')
      : this.reviewView === 'done'
        ? this.emptyMarkup('fa-film', 'Arxiv hozircha bo‘sh', 'Yakunlangan VOD tahlillari shu yerda saqlanadi.')
        : this.emptyMarkup('fa-film', 'VOD navbati toza', 'Ko‘rib chiqilishi kerak bo‘lgan epizodlar hozircha yo‘q.');
    return `
      <section class="briefing-panel">
        <header class="briefing-panel__header">
          <div><p class="briefing-kicker">REVIEW QUEUE</p><h3>VOD navbati</h3></div>
          <span class="briefing-panel__index">04</span>
        </header>
        <div class="briefing-inline-actions" aria-label="VOD filtri">
          <button type="button" class="btn btn-sm btn-secondary" data-action="review-active" aria-pressed="${this.reviewView !== 'done'}">Faol</button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="review-done" aria-pressed="${this.reviewView === 'done'}">Yakunlangan</button>
        </div>
        <div class="briefing-reviews">${content}</div>
      </section>`;
  }

  reviewMarkup(review, isAdmin) {
    const [statusLabel, statusIcon] = this.statusMeta(review.status);
    const deadline = this.deadlineMeta(review.deadline, true);
    const isOverdue = deadline?.overdue && review.status !== 'done';
    const link = review.url ? `<a href="${this.escape(review.url)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> VODni ochish</a>` : '';
    const controls = isAdmin ? `
      <div class="briefing-review-admin" data-review-id="${review.id}">
        <select class="form-select" data-field="status" aria-label="VOD holati">
          ${['waiting', 'reviewing', 'decided', 'done'].map(status => `<option value="${status}" ${review.status === status ? 'selected' : ''}>${this.statusMeta(status)[0]}</option>`).join('')}
        </select>
        <input class="form-input" data-field="deadline" type="date" value="${review.deadline ? this.escape(review.deadline.slice(0, 10)) : ''}" aria-label="VOD deadline">
        <select class="form-select" data-field="matchId" aria-label="Bog‘langan match">${this.matchOptions(review.matchId)}</select>
        <input class="form-input" data-field="sourceInsight" maxlength="500" value="${this.escape(typeof review.sourceInsight === 'string' ? review.sourceInsight : review.sourceInsight?.title || review.sourceInsight?.body || '')}" placeholder="Tasdiqlanadigan auto insight...">
        <input class="form-input" data-field="decision" maxlength="400" value="${this.escape(review.decision)}" placeholder="Qaror yoki bajarilgan ish...">
        <button class="btn btn-sm btn-primary" data-action="save-review"><i class="fa-solid fa-check"></i> Saqlash</button>
        <button class="btn btn-sm btn-danger" data-action="delete-review" aria-label="VODni o‘chirish"><i class="fa-solid fa-trash"></i></button>
      </div>` : '';
    return `
      <article class="briefing-review ${isOverdue ? 'is-overdue' : ''}">
        <div class="briefing-review__status"><i class="fa-solid ${statusIcon}"></i></div>
        <div class="briefing-review__content">
          <div class="briefing-review__top"><h4>${this.escape(review.title)}</h4><span class="briefing-status is-${review.status}">${statusLabel}</span></div>
          ${review.reason ? `<p>${this.escape(review.reason)}</p>` : ''}
          ${review.sourceInsight && (isAdmin || review.status === 'decided' || review.status === 'done') ? `<blockquote class="briefing-source-insight"><span>CAPTAIN TASDIQLAGAN SIGNAL</span><p>${this.escape(typeof review.sourceInsight === 'string' ? review.sourceInsight : review.sourceInsight.title || review.sourceInsight.body || review.sourceInsight.metric || '')}</p></blockquote>` : ''}
          <div class="briefing-review__meta">${review.timestamp ? `<span><i class="fa-solid fa-crosshairs"></i> ${this.escape(review.timestamp)}</span>` : ''}${deadline ? `<span class="briefing-deadline ${isOverdue ? 'is-overdue' : ''}"><i class="fa-regular fa-calendar-check"></i> ${isOverdue ? 'Kechikdi · ' : 'Deadline · '}${deadline.label}</span>` : ''}${review.matchId ? `<button type="button" data-action="open-review-match" data-match-id="${this.escape(review.matchId)}"><i class="fa-solid fa-link"></i> Bog‘langan match</button>` : ''}${link}</div>
          ${controls}
        </div>
      </article>`;
  }

  decisionsMarkup(decisions) {
    const content = decisions.length ? decisions.map(decision => {
      const typeLabel = decision.type === 'poll' ? 'SO‘ROVNOMA' : 'VOD';
      const typeIcon = decision.type === 'poll' ? 'fa-check-to-slot' : 'fa-film';
      return `
      <li>
        <span><i class="fa-solid ${typeIcon}"></i></span>
        <div><small class="briefing-kicker">${typeLabel}</small><strong>${this.escape(decision.title)}</strong><p>${this.escape(decision.decision || 'Bajarildi')}</p></div>
      </li>`;
    }).join('') : '<li class="briefing-decision-empty">Birinchi qaror kutilmoqda.</li>';
    return `
      <section class="briefing-panel briefing-decisions">
        <header class="briefing-panel__header"><div><p class="briefing-kicker">DECISION LOG</p><h3>Qarorlar</h3></div></header>
        <ul>${content}</ul>
      </section>`;
  }

  emptyMarkup(icon, title, text) {
    return `<div class="briefing-empty"><i class="fa-solid ${icon}"></i><div><strong>${title}</strong><p>${text}</p></div></div>`;
  }

  matchOptions(selected = '') {
    const matches = window.EclipseApp?.dataStore?.getMatches?.() || [];
    const ordered = [...matches].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return '<option value="">Match tanlang (ixtiyoriy)</option>'
      + (selected && !matches.some(match => match.id === selected) ? `<option value="${this.escape(selected)}" selected>Arxiv match · ${this.escape(selected)}</option>` : '')
      + ordered.map(match => `<option value="${this.escape(match.id)}" ${match.id === selected ? 'selected' : ''}>${this.escape(match.date)} · ${match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : '?'} · ${this.escape(match.sessionLabel || match.matchType || '')} · ${this.escape(String(match.id).slice(-8))}</option>`).join('');
  }

  adminMarkup() {
    const focus = [...this.data.focus, '', '', ''].slice(0, 3);
    return `
      <section class="briefing-admin" aria-labelledby="briefingAdminTitle">
        <header class="briefing-admin__header">
          <div><p class="briefing-kicker">CAPTAIN CONTROL</p><h3 id="briefingAdminTitle">Briefing boshqaruvi</h3></div>
          <span><i class="fa-solid fa-crown"></i> Faqat Admin</span>
        </header>
        <div class="briefing-admin__grid">
          <form id="briefingFocusForm" class="briefing-admin-form">
            <h4><span>01</span> Fokusni yangilash</h4>
            <label><span>Admin xulosasi</span><textarea class="form-textarea" name="summary" maxlength="600" rows="4" placeholder="Jamoa uchun yakuniy qisqa signal...">${this.escape(this.data.summary || '')}</textarea></label>
            ${focus.map((item, index) => `<label><span>${index + 1}-fokus</span><input class="form-input" name="focus" maxlength="160" value="${this.escape(item)}" placeholder="Masalan: 8-daqiqada Turtle setup"></label>`).join('')}
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-bullseye"></i> Fokusni saqlash</button>
          </form>

          <form id="briefingReviewForm" class="briefing-admin-form">
            <h4><span>02</span> VOD qoldirish</h4>
            <label><span>Nomi *</span><input class="form-input" name="title" maxlength="140" required placeholder="Scrim #12 — Lord fight"></label>
            <div class="briefing-form-pair">
              <label><span>VOD havolasi</span><input class="form-input" name="url" type="url" maxlength="500" placeholder="https://..."></label>
              <label><span>Vaqt belgisi</span><input class="form-input" name="timestamp" maxlength="40" placeholder="12:40"></label>
            </div>
            <label><span>Bog‘langan match</span><select class="form-select" name="matchId">${this.matchOptions()}</select></label>
            <label><span>Auto insight</span><textarea class="form-textarea" name="sourceInsight" maxlength="500" rows="3" placeholder="Captain tekshiradigan statistik signal..."></textarea></label>
            <label><span>Deadline</span><input class="form-input" name="deadline" type="date"></label>
            <label><span>Nima uchun ko‘riladi?</span><textarea class="form-textarea" name="reason" maxlength="300" rows="3" placeholder="Qaror, positioning yoki callni tekshirish..."></textarea></label>
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-film"></i> Navbatga qo‘shish</button>
          </form>

          <form id="briefingPollForm" class="briefing-admin-form">
            <h4><span>03</span> So‘rovnoma ochish</h4>
            <label><span>Savol *</span><input class="form-input" name="question" maxlength="180" required placeholder="Keyingi scrim qaysi vaqtda bo‘lsin?"></label>
            <div class="briefing-poll-option-inputs">
              ${[1, 2, 3, 4].map(index => `<label><span>${index}-variant${index < 3 ? ' *' : ''}</span><input class="form-input" name="option" maxlength="80" ${index < 3 ? 'required' : ''} placeholder="Javob varianti"></label>`).join('')}
            </div>
            <label><span>Ovoz berish yopiladi</span><input class="form-input" name="closesAt" type="datetime-local"></label>
            <p class="briefing-admin-form__hint"><i class="fa-solid fa-shield-halved"></i> Har brauzer ushbu savolga faqat bir marta ovoz bera oladi.</p>
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-check-to-slot"></i> So‘rovnomani ochish</button>
          </form>
        </div>
      </section>`;
  }

  bindEvents() {
    if (!this.container) return;
    this.container.oninput = this.container.onchange = event => {
      const group = event.target.closest('form[id], [data-review-id], [data-poll-decision]');
      if (!group) return;
      this.drafts.set(this.draftGroupKey(group), [...group.querySelectorAll('input,select,textarea')].map(input => input.value));
    };

    this.container.onclick = async event => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'insight-more') { this.insightLimit = (this.insightLimit || 12) + 12; this.renderState(); }
      else if (action === 'poll-active' || action === 'poll-closed' || action === 'poll-more') {
        if (action === 'poll-more') this.pollLimit = (this.pollLimit || 8) + 8;
        else { this.pollView = action === 'poll-closed' ? 'closed' : 'active'; this.pollLimit = 8; }
        this.renderState();
      } else if (action === 'review-active' || action === 'review-done') {
        this.reviewView = action === 'review-done' ? 'done' : 'active';
        this.renderState();
      } else if (action === 'vote') {
        await this.vote(button.dataset.pollId, button.dataset.optionId, button);
      } else if (action === 'toggle-poll') {
        await this.adminAction({ action: 'setPollActive', id: button.dataset.id, active: button.dataset.active !== 'true' }, button);
      } else if (action === 'delete-poll') {
        if (confirm('Ushbu so‘rovnoma va uning ovozlari o‘chirilsinmi?')) {
          await this.adminAction({ action: 'deletePoll', id: button.dataset.id }, button);
        }
      } else if (action === 'save-poll-decision') {
        const row = button.closest('[data-poll-decision]');
        await this.adminAction({ action: 'setPollDecision', id: button.dataset.id, decision: row.querySelector('[data-field="poll-decision"]').value }, button);
      } else if (action === 'save-review') {
        const row = button.closest('[data-review-id]');
        await this.adminAction({
          action: 'updateReview', id: row.dataset.reviewId,
          patch: {
            status: row.querySelector('[data-field="status"]').value,
            deadline: row.querySelector('[data-field="deadline"]').value || null,
            matchId: row.querySelector('[data-field="matchId"]').value || null,
            sourceInsight: row.querySelector('[data-field="sourceInsight"]').value || null,
            decision: row.querySelector('[data-field="decision"]').value
          }
        }, button);
      } else if (action === 'delete-review') {
        const row = button.closest('[data-review-id]');
        if (confirm('Ushbu VOD yozuvi o‘chirilsinmi?')) {
          await this.adminAction({ action: 'deleteReview', id: row.dataset.reviewId }, button);
        }
      } else if (action === 'approve-insight' || action === 'reject-insight') {
        const row = button.closest('[data-insight-id]');
        await this.adminAction({
          action: 'updateInsight',
          id: row.dataset.insightId,
          patch: { status: action === 'approve-insight' ? 'approved' : 'rejected' }
        }, button);
      } else if (action === 'delete-insight') {
        const row = button.closest('[data-insight-id]');
        if (confirm('Ushbu match insight butunlay o‘chirilsinmi?')) {
          await this.adminAction({ action: 'deleteInsight', id: row.dataset.insightId }, button);
        }
      } else if (action === 'open-review-match') {
        window.EclipseApp?.matchManager?.renderMatchDetailModal(button.dataset.matchId, window.EclipseApp.dataStore.getAllPlayers?.() || window.EclipseApp.dataStore.getPlayers());
      }
    };

    document.getElementById('briefingFocusForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      await this.adminAction({ action: 'setFocus', summary: form.elements.summary.value, items: [...form.elements.focus].map(input => input.value) }, form.querySelector('button[type="submit"]'));
    });

    document.getElementById('briefingReviewForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const success = await this.adminAction({
        action: 'addReview',
        review: { title: data.get('title'), url: data.get('url'), timestamp: data.get('timestamp'), matchId: data.get('matchId'), sourceInsight: data.get('sourceInsight'), deadline: data.get('deadline'), reason: data.get('reason') }
      }, form.querySelector('button[type="submit"]'));
      if (success) form.reset();
    });

    document.getElementById('briefingPollForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const success = await this.adminAction({ action: 'addPoll', question: data.get('question'), options: data.getAll('option'), closesAt: this.toIsoDateTime(data.get('closesAt')) }, form.querySelector('button[type="submit"]'));
      if (success) form.reset();
    });
  }

  async vote(pollId, optionId, button) {
    button.disabled = true;
    button.classList.add('is-submitting');
    try {
      this.data = await this.request('PATCH', { pollId, optionId, voterId: this.getVoterId() });
      this.renderState();
      window.showToast?.('Ovozingiz qabul qilindi.', 'success');
    } catch (error) {
      button.disabled = false;
      button.classList.remove('is-submitting');
      window.showToast?.(error.message, error.status === 409 ? 'warning' : 'error');
      if (error.status === 409) await this.render('briefingContainer');
    }
  }

  async adminAction(payload, button) {
    if (!this.auth.isAdmin()) {
      this.auth.showLoginModal();
      return false;
    }
    const original = button?.innerHTML;
    const group = button?.closest('form[id], [data-review-id], [data-poll-decision]');
    const groupKey = group ? this.draftGroupKey(group) : null;
    const submittedDraft = groupKey ? JSON.stringify(this.drafts.get(groupKey)) : null;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saqlanmoqda';
    }
    try {
      this.data = await this.request('POST', payload, true);
      if (groupKey && JSON.stringify(this.drafts.get(groupKey)) === submittedDraft) this.drafts.delete(groupKey);
      this.data.votedPollIds = this.data.votedPollIds || [];
      await this.render('briefingContainer');
      window.showToast?.('Briefing yangilandi.', 'success');
      return true;
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
      if (error.status === 401) this.auth.showLoginModal();
      window.showToast?.(error.message, 'error');
      return false;
    }
  }

  draftGroupKey(group) {
    return group.id || `review:${group.dataset.reviewId || ''}:poll:${group.dataset.pollDecision || ''}`;
  }

  restoreFormDrafts() {
    if (!this.auth.isAdmin()) { this.drafts.clear(); return; }
    this.container.querySelectorAll('form[id], [data-review-id], [data-poll-decision]').forEach(group => {
      const saved = this.drafts.get(this.draftGroupKey(group));
      if (!saved) return;
      [...group.querySelectorAll('input,select,textarea')].forEach((input, index) => {
        if (saved[index] !== undefined) input.value = saved[index];
      });
    });
  }
};
