window.MlbbDataManager = class MlbbDataManager {
  constructor(authManager, dataStore, heroDb, cloudSync) {
    this.auth = authManager;
    this.db = dataStore;
    this.heroDb = heroDb;
    this.cloudSync = cloudSync;
    this.container = null;
    this.cache = new Map();
    this.pending = new Map();
    this.state = { heroes: null, meta: null, patches: null };
    this.currentView = 'tier';
    this.tierFilter = 'all';
    this.selectedRank = 'mythic';
    this.searchQuery = '';
    this.dossierEscapeHandler = null;
    this.dossierReturnFocus = null;
  }

  escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = options.admin ? this.auth.getToken() : this.auth.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'MLBB ma’lumotlarini olib bo‘lmadi');
      error.status = response.status;
      error.code = payload.code;
      throw error;
    }
    return payload;
  }

  async cachedRequest(key, path, force = false) {
    if (!force && this.cache.has(key) && Date.now() - this.cache.get(key).cachedAt < 5 * 60 * 1000) return this.cache.get(key).payload;
    if (!force && this.pending.has(key)) return this.pending.get(key);
    const request = this.request(path).then(payload => {
      this.cache.set(key, { payload, cachedAt: Date.now() });
      return payload;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }

  getHeroes(force = false) {
    return this.cachedRequest('heroes', '/api/mlbb-heroes', force);
  }

  getMeta(force = false) {
    return this.cachedRequest(`meta:${this.selectedRank}`, `/api/mlbb-meta?rank=${encodeURIComponent(this.selectedRank)}`, force);
  }

  getPatches(force = false) {
    return this.cachedRequest('patches', '/api/mlbb-patches', force);
  }

  clearCache() {
    this.cache.clear();
    this.pending.clear();
  }

  async warmCatalog() {
    // Every signed teammate needs the canonical list for Practice Lite.
    // Only Admin hydration is allowed to persist catalog changes to cloud.
    if (!this.auth.getAccessToken?.()) return false;
    try {
      const payload = await this.getHeroes();
      await this.hydrateClientCatalog(payload?.data || []);
      return true;
    } catch (_) {
      return false;
    }
  }

  refreshForAuthChange() {
    this.warmCatalog();
  }

  async hydrateClientCatalog(catalog = []) {
    if (!Array.isArray(catalog) || !catalog.length || !this.heroDb) return;
    const before = JSON.stringify(this.heroDb.getAll?.() || []);
    this.heroDb.hydrateCanonical?.(catalog);
    const resolvedMatches = this.db.resolveHeroReferences?.(catalog) || 0;
    const after = JSON.stringify(this.heroDb.getAll?.() || []);
    if ((resolvedMatches || before !== after) && this.auth.isAdmin()) {
      this.cloudSync?.syncUp?.().catch?.(() => {});
    }
  }

  async load(force = false) {
    const generation = this.metaLoadGeneration = (this.metaLoadGeneration || 0) + 1;
    const results = await Promise.allSettled([
      this.getHeroes(force),
      this.getMeta(force),
      this.getPatches(force)
    ]);
    if (generation !== this.metaLoadGeneration) return { state: this.state, errors: [] };
    const keys = ['heroes', 'meta', 'patches'];
    const errors = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') this.state[keys[index]] = result.value;
      else { if (keys[index] === 'meta') this.state.meta = null; errors.push(result.reason); }
    });
    if (this.state.heroes?.data?.length) await this.hydrateClientCatalog(this.state.heroes.data);
    if (!Object.values(this.state).some(Boolean)) throw errors[0] || new Error('Meta Lab ma’lumoti topilmadi');
    return { state: this.state, errors };
  }

  loadingMarkup() {
    return `
      <section class="meta-lab-loading" role="status" aria-live="polite">
        <span class="meta-lab-loading__orbit"><i></i></span>
        <div><p class="section-eyebrow">META SIGNAL / CONNECTING</p><h3>MLBB manbalari tekshirilmoqda</h3><p>Hero catalog, rank signali va patch radar birlashtirilmoqda…</p></div>
      </section>`;
  }

  errorMarkup(error) {
    const setup = error?.code === 'MLBB_DATA_NOT_READY' || error?.code === 'MLBB_STORAGE_NOT_CONFIGURED';
    return `
      <section class="meta-lab-error" role="alert">
        <span><i class="fa-solid ${setup ? 'fa-database' : 'fa-satellite-dish'}"></i></span>
        <div><p class="section-eyebrow">${setup ? 'FIRST SYNC REQUIRED' : 'META SIGNAL LOST'}</p><h3>${setup ? 'Meta Lab hali ishga tushirilmagan' : 'Meta Labni ochib bo‘lmadi'}</h3><p>${this.escape(error?.message || 'Noma’lum xatolik')}</p></div>
        <div class="meta-lab-error__actions">
          ${this.auth.isAdmin() ? '<button class="btn btn-primary" data-meta-action="sync"><i class="fa-solid fa-rotate"></i> Birinchi sync</button>' : ''}
          <button class="btn btn-secondary" data-meta-action="retry"><i class="fa-solid fa-arrow-rotate-right"></i> Qayta urinish</button>
        </div>
      </section>`;
  }

  async render(containerId = 'metaLabContainer', force = false) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    this.closeDossier();
    this.container.innerHTML = this.loadingMarkup();
    try {
      const { errors } = await this.load(force);
      this.renderState(errors);
    } catch (error) {
      this.container.innerHTML = this.errorMarkup(error);
      this.bindEvents();
    }
  }

  freshnessMeta(payload) {
    if (!payload) return { label: 'Signal yo‘q', className: 'is-missing', icon: 'fa-circle-xmark' };
    if (payload.status === 'fresh') return { label: 'Yangilangan', className: 'is-fresh', icon: 'fa-circle-check' };
    if (payload.status === 'partial') return { label: 'Qisman tayyor', className: 'is-stale', icon: 'fa-triangle-exclamation' };
    if (payload.status === 'stale') return { label: 'Yangilanish kechikkan', className: 'is-stale', icon: 'fa-triangle-exclamation' };
    return { label: 'Sync kutilmoqda', className: 'is-missing', icon: 'fa-clock' };
  }

  healthPresentation(health, freshness) {
    if (freshness.className === 'is-stale') {
      return { label: 'Cache eskirgan · LKG', className: 'is-stale', icon: 'fa-triangle-exclamation' };
    }
    if (freshness.className === 'is-missing') {
      return { label: freshness.label, className: 'is-missing', icon: freshness.icon };
    }
    if (health?.partial) {
      return { label: 'Partial sync · LKG', className: 'is-stale', icon: 'fa-triangle-exclamation' };
    }
    if (health?.ok) {
      return { label: 'All systems synced', className: 'is-fresh', icon: 'fa-signal' };
    }
    return { label: freshness.label, className: freshness.className, icon: freshness.icon };
  }

  formatDate(value, includeTime = true) {
    return window.EclipseDateUtils?.formatDisplayDate?.(value, {
      includeTime,
      includeYear: !includeTime
    }) || '—';
  }

  formatRate(value, digits = 2) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(digits)}%` : '—';
  }

  heroById(id) {
    return (this.state.heroes?.data || []).find(hero => Number(hero.id) === Number(id)) || null;
  }

  mergeDossierDetail(heroId, detail) {
    const canonical = this.heroById(heroId);
    if (!canonical) return detail;
    // A dossier can be cached for longer than the catalog. Keep the current
    // identity and portraits while adding its skills and cohort matchups.
    const images = { ...detail.images, ...Object.fromEntries(Object.entries(canonical.images || {}).filter(([, value]) => value)) };
    const portrait = canonical.images?.portrait || canonical.image || images.portrait || detail.image;
    return {
      ...canonical,
      ...detail,
      id: canonical.id,
      key: canonical.key || detail.key,
      name: canonical.name,
      aliases: [...new Set([...(canonical.aliases || []), ...(detail.aliases || [])])],
      images: { ...images, ...(portrait ? { portrait } : {}) },
      ...(portrait ? { image: portrait } : {})
    };
  }

  imageMarkup(hero, className = '') {
    const image = hero?.image || hero?.images?.portrait || '';
    return image
      ? `<img class="${className}" src="${this.escape(image)}" alt="${this.escape(hero?.name || 'Hero')}" loading="lazy" decoding="async">`
      : `<span class="meta-hero-fallback ${className}" aria-hidden="true">${this.escape(String(hero?.name || '?').slice(0, 1))}</span>`;
  }

  renderState(errors = []) {
    if (!this.container) return;
    const heroes = this.state.heroes?.data || [];
    const tiers = this.state.meta?.data?.eclipse || [];
    const patches = this.state.patches?.data || [];
    const latestPatch = patches[0] || null;
    const freshness = this.freshnessMeta(this.state.meta);
    const health = this.state.meta?.health?.data || null;
    const healthPresentation = this.healthPresentation(health, freshness);
    const errorNote = errors.length
      ? `<div class="meta-lab-partial"><i class="fa-solid fa-triangle-exclamation"></i><span>${errors.length} ta dataset hozir yangilanmadi; mavjud last-known-good ko‘rsatildi.</span></div>`
      : '';

    this.container.innerHTML = `
      <section class="meta-lab-hero" aria-labelledby="metaLabTitle">
        <div class="meta-lab-hero__copy">
          <p class="section-eyebrow">ECLIPSE / LIVE MLBB INTELLIGENCE</p>
          <h2 id="metaLabTitle">Meta Lab</h2>
          <p>Rank signali norasmiy Rone Arena API orqali olinadi. Avtomatik yangilanish har kuni 08:00 (Toshkent); manba kechikishi mumkin.</p>
        </div>
        <div class="meta-lab-hero__orb" aria-hidden="true"><span></span><i></i></div>
        <div class="meta-lab-telemetry">
          <span><small>Catalog</small><strong>${heroes.length || '—'}</strong><em>heroes</em></span>
          <span><small>Rank signal</small><strong>${tiers.length || '—'}</strong><em>${this.escape(this.rankLabel?.(this.selectedRank) || this.selectedRank)} / ${this.escape(this.state.meta?.data?.days || '7')}d</em></span>
          <span><small>Latest patch</small><strong>${latestPatch ? this.escape(latestPatch.title.replace(/patch notes/ig, '').trim() || 'Live') : '—'}</strong><em>${this.formatDate(latestPatch?.publishedAt, false)}</em></span>
        </div>
      </section>

      <section class="meta-lab-commandbar">
        <nav class="meta-lab-tabs" aria-label="Meta Lab bo‘limlari">
          ${[
            ['tier', 'fa-ranking-star', 'Eclipse Tier'],
            ['heroes', 'fa-shield-halved', 'Hero Dossier'],
            ['patches', 'fa-code-branch', 'Patch Radar']
          ].map(([view, icon, label]) => `<button type="button" data-meta-view="${view}" class="${this.currentView === view ? 'active' : ''}" aria-pressed="${this.currentView === view}"><i class="fa-solid ${icon}"></i>${label}</button>`).join('')}
        </nav>
        <div class="meta-lab-health">
          <span class="meta-health ${healthPresentation.className}"><i class="fa-solid ${healthPresentation.icon}"></i>${healthPresentation.label}</span>
          <small>${this.formatDate(this.state.meta?.updatedAt)}</small>
          ${this.auth.isAdmin() ? '<button type="button" class="btn btn-sm btn-secondary" data-meta-action="sync"><i class="fa-solid fa-rotate"></i> Sync now</button>' : ''}
        </div>
      </section>
      ${errorNote}
      <div class="meta-lab-view">${this.viewMarkup()}</div>
      <footer class="meta-lab-attribution">
        <div><span>DATA PROVENANCE</span><strong>Rone Arena API</strong><small>Unofficial · BSD-3-Clause · source rates preserved exactly</small></div>
        <a href="https://github.com/ridwaanhall/rone-arena-api" target="_blank" rel="noopener noreferrer">Repository <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
        <a href="https://www.mobilelegends.com/news" target="_blank" rel="noopener noreferrer">Official patch news <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
      </footer>`;
    this.bindEvents();
    window.EclipseApp?.refreshMotion?.(this.container);
  }

  viewMarkup() {
    if (this.currentView === 'heroes') return this.heroesMarkup();
    if (this.currentView === 'patches') return this.patchesMarkup();
    return this.tierMarkup();
  }

  tierMarkup() {
    const rows = [...(this.state.meta?.data?.eclipse || [])].sort((a, b) => (Number(a.officialRank) || Infinity) - (Number(b.officialRank) || Infinity));
    if (!rows.length) return this.emptyMarkup('fa-ranking-star', 'Tier signali kutilmoqda', 'Birinchi syncdan keyin exact source rates va Eclipse scoring shu yerda ko‘rinadi.');
    const methodology = this.state.meta?.data?.methodology || {};
    return `
      <section class="meta-tier-console">
        <header class="meta-section-header">
          <div><p class="section-eyebrow">MANBA STATISTIKASI / ${this.escape(this.state.meta?.data?.rank || 'MYTHIC').toUpperCase()}</p><h3>Hero meta ko‘rsatkichlari</h3><p>Manba tartibi va Win/Pick/Ban — asosiy raqamlar. Eclipse tier — Moonton bahosi emas, tajribaviy filtr: Win 65%, Pick 20%, Ban 15%. Tierlar oldindan belgilangan ulushlarga bo‘linadi; S tier g‘alabani kafolatlamaydi.</p></div>
          <div class="meta-tier-legend" aria-label="Tajribaviy Eclipse tier filtri">
            ${['all', 'SS', 'S', 'A', 'B', 'C', 'D'].map(tier => `<button type="button" data-tier-filter="${tier}" class="${this.tierFilter === tier ? 'active' : ''}">${tier === 'all' ? 'ALL' : tier}</button>`).join('')}
          </div>
        </header>
        <div class="meta-tier-tools">
          <label><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="metaTierSearch" aria-label="Tier jadvalidan hero qidirish" value="${this.escape(this.searchQuery)}" placeholder="Hero qidirish…" autocomplete="off"></label>
          <span><i class="fa-solid fa-circle-info"></i>${this.escape(methodology.note || 'Visibility pick sample ko‘rinishi; confidence emas.')}</span>
        </div>
        <div class="meta-tier-table-wrap">
          <table class="meta-tier-table">
            <thead><tr><th>Manba o‘rni</th><th>Hero</th><th>Win</th><th>Pick</th><th>Ban</th><th>Tier · tajriba</th><th>Eclipse balli</th><th>Eclipse o‘rni</th><th>Pick ko‘rinishi</th></tr></thead>
            <tbody>
              ${rows.map(row => `
                <tr data-hero-id="${Number(row.heroId)}" data-tier="${this.escape(row.tier)}" data-hero-name="${this.escape(String(row.name || '').toLowerCase())}" tabindex="0">
                  <td><strong class="meta-rank">${Number(row.officialRank) || '—'}</strong></td>
                  <td><div class="meta-tier-hero">${this.imageMarkup(row)}<span><strong>${this.escape(row.name)}</strong><small>ID ${Number(row.heroId)}</small></span></div></td>
                  <td>${this.formatRate(row.winRate)}</td>
                  <td>${this.formatRate(row.pickRate, 3)}</td>
                  <td>${this.formatRate(row.banRate, 2)}</td>
                  <td><span class="meta-tier-badge is-${this.escape(String(row.tier).toLowerCase())}">${this.escape(row.tier)}</span></td>
                  <td>${Number(row.eclipseScore).toFixed(2)}</td>
                  <td>#${Number(row.eclipseRank)}</td>
                  <td><span class="meta-visibility is-${this.escape(row.visibility)}"><i></i>${this.escape(row.visibility)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  heroesMarkup() {
    const catalog = this.state.heroes?.data || [];
    if (!catalog.length) return this.emptyMarkup('fa-shield-halved', 'Hero catalog kutilmoqda', 'Canonical hero IDs birinchi syncdan so‘ng yuklanadi.');
    const tierById = new Map((this.state.meta?.data?.eclipse || []).map(row => [Number(row.heroId), row]));
    return `
      <section class="meta-hero-library">
        <header class="meta-section-header">
          <div><p class="section-eyebrow">CANONICAL HERO CATALOG</p><h3>${catalog.length} hero dossier</h3><p>Hero kartasini oching: skill, lane, counter va synergy ma’lumoti on-demand yangilanadi.</p></div>
          <label class="meta-library-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" id="metaHeroSearch" aria-label="Hero dossier katalogidan qidirish" value="${this.escape(this.searchQuery)}" placeholder="Nom, role yoki lane…" autocomplete="off"></label>
        </header>
        <div class="meta-hero-grid">
          ${catalog.map(hero => {
            const tier = tierById.get(Number(hero.id));
            const descriptors = [...(hero.roles || []), ...(hero.lanes || [])].slice(0, 2);
            return `
              <button type="button" class="meta-hero-card" data-hero-id="${Number(hero.id)}" data-hero-search="${this.escape(`${hero.name} ${descriptors.join(' ')}`.toLowerCase())}">
                <span class="meta-hero-card__visual">${this.imageMarkup(hero)}${hero.isNewToCatalog ? '<em>BAZAGA QO‘SHILDI</em>' : ''}</span>
                <span class="meta-hero-card__copy"><small>#${Number(hero.id)}</small><strong>${this.escape(hero.name)}</strong><em>${this.escape(descriptors.join(' · ') || 'Dossierni oching')}</em></span>
                <span class="meta-tier-badge is-${this.escape(String(tier?.tier || 'na').toLowerCase())}">${this.escape(tier?.tier || '—')}</span>
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  patchesMarkup() {
    const patches = this.state.patches?.data || [];
    if (!patches.length) return this.emptyMarkup('fa-code-branch', 'Patch radar kutilmoqda', 'Official Moonton news feed birinchi syncdan keyin shu yerda ko‘rinadi.');
    const latest = patches.find(patch => patch.classification !== 'preview') || patches[0];
    const parsed = Boolean(latest.parsedAt);
    return `
      <section class="meta-patch-radar">
        <article class="meta-patch-feature">
          <div class="meta-patch-feature__visual">${latest.cover ? `<img src="${this.escape(latest.cover)}" alt="" loading="lazy">` : '<span><i class="fa-solid fa-sun"></i></span>'}</div>
          <div class="meta-patch-feature__copy">
            <p class="section-eyebrow">LATEST OFFICIAL SIGNAL · ${this.escape(latest.classification || 'PATCH')}</p>
            <h3>${this.escape(latest.title)}</h3>
            <p>${parsed ? 'Avtomatik topilgan o‘zgarishlar; ro‘yxat to‘liq bo‘lmasligi mumkin. To‘liq matn uchun original notesni oching.' : 'Patch topildi · tahlil kutilmoqda'}</p>
            <p>${this.escape(latest.brief || latest.overview?.[0] || 'Official patch signal qabul qilindi.')}</p>
            <div class="meta-patch-counts">
              <span class="is-buff"><strong>${parsed ? Number(latest.changeCounts?.buffs) || 0 : '—'}</strong><small>Buff</small></span>
              <span class="is-nerf"><strong>${parsed ? Number(latest.changeCounts?.nerfs) || 0 : '—'}</strong><small>Nerf</small></span>
              <span><strong>${parsed ? Number(latest.changeCounts?.adjustments) || 0 : '—'}</strong><small>Adjust</small></span>
              <span><strong>${parsed ? (latest.newHeroes || []).length : '—'}</strong><small>New hero</small></span>
            </div>
            <div class="meta-patch-feature__footer"><span><i class="fa-solid fa-shield-halved"></i> Official CMS · ${this.formatDate(latest.publishedAt, false)}</span>${latest.officialUrl ? `<a href="${this.escape(latest.officialUrl)}" target="_blank" rel="noopener noreferrer">Patch notes <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}</div>
          </div>
        </article>
        ${this.patchSignalsMarkup(latest)}
        <div class="meta-patch-archive">
          ${patches.filter(patch => patch.id !== latest.id).slice(0, 11).map(patch => `
            <article>
              <span><small>${this.escape(patch.classification || 'patch')}</small><strong>${this.formatDate(patch.publishedAt, false)}</strong></span>
              <div><h4>${this.escape(patch.title)}</h4><p>${this.escape(patch.brief || 'Patch signal')}</p></div>
              ${patch.officialUrl ? `<a href="${this.escape(patch.officialUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Official patchni ochish"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
            </article>`).join('')}
        </div>
      </section>`;
  }

  patchSignalsMarkup(patch) {
    const adjustments = Array.isArray(patch?.heroAdjustments) ? patch.heroAdjustments.slice(0, 12) : [];
    const newHeroes = Array.isArray(patch?.newHeroes) ? patch.newHeroes : [];
    if (!adjustments.length && !newHeroes.length) return '';
    return `
      <section class="meta-patch-signals">
        <header><p class="section-eyebrow">PARSED HERO SIGNALS</p><h3>O‘zgarishlar xaritasi</h3></header>
        <div>
          ${newHeroes.map(item => `<button type="button" ${item.heroId ? `data-hero-id="${Number(item.heroId)}"` : 'disabled'} class="meta-patch-signal is-new"><span>NEW</span><strong>${this.escape(item.heroName)}</strong><small>${this.escape(item.epithet || item.summary || '')}</small></button>`).join('')}
          ${adjustments.map(item => `<button type="button" data-hero-id="${Number(item.heroId)}" class="meta-patch-signal is-${this.escape(item.change)}"><span>${this.escape(item.change)}</span><strong>${this.escape(item.heroName)}</strong><small>${this.escape(item.summary || 'Official adjustment')}</small></button>`).join('')}
        </div>
      </section>`;
  }

  emptyMarkup(icon, title, description) {
    return `<div class="meta-lab-empty"><i class="fa-solid ${icon}"></i><div><h3>${title}</h3><p>${description}</p></div></div>`;
  }

  applyFilters() {
    if (!this.container) return;
    const query = this.searchQuery.toLocaleLowerCase('en-US');
    this.container.querySelectorAll('.meta-tier-table tbody tr').forEach(row => {
      const tierMatch = this.tierFilter === 'all' || row.dataset.tier === this.tierFilter;
      const searchMatch = !query || row.dataset.heroName.includes(query);
      row.hidden = !(tierMatch && searchMatch);
    });
    this.container.querySelectorAll('.meta-hero-card').forEach(card => {
      card.hidden = Boolean(query && !card.dataset.heroSearch.includes(query));
    });
  }

  bindEvents() {
    if (!this.container) return;
    this.container.onclick = async event => {
      const view = event.target.closest('[data-meta-view]');
      if (view) {
        this.currentView = view.dataset.metaView;
        this.searchQuery = '';
        this.renderState();
        return;
      }
      const tier = event.target.closest('[data-tier-filter]');
      if (tier) {
        this.tierFilter = tier.dataset.tierFilter;
        this.container.querySelectorAll('[data-tier-filter]').forEach(button => button.classList.toggle('active', button === tier));
        this.applyFilters();
        return;
      }
      const action = event.target.closest('[data-meta-action]');
      if (action?.dataset.metaAction === 'sync') {
        await this.manualSync(action);
        return;
      }
      if (action?.dataset.metaAction === 'retry') {
        await this.render('metaLabContainer', true);
        return;
      }
      const heroTarget = event.target.closest('[data-hero-id]');
      if (heroTarget && Number(heroTarget.dataset.heroId) > 0) await this.openHeroDossier(Number(heroTarget.dataset.heroId));
    };
    const bindSearch = input => input?.addEventListener('input', event => {
      this.searchQuery = event.currentTarget.value.trim();
      this.applyFilters();
    });
    bindSearch(this.container.querySelector('#metaTierSearch'));
    bindSearch(this.container.querySelector('#metaHeroSearch'));
    this.container.onkeydown = event => {
      const row = event.target.closest('.meta-tier-table tbody tr[data-hero-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      this.openHeroDossier(Number(row.dataset.heroId));
    };
    this.applyFilters();
  }

  async manualSync(button) {
    if (!this.auth.isAdmin()) {
      this.auth.showLoginModal();
      return;
    }
    const original = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing';
    }
    try {
      const result = await this.request('/api/mlbb-sync', { method: 'POST', admin: true, body: {} });
      this.clearCache();
      const counts = result?.data?.counts || {};
      window.showToast?.(`Meta sync tayyor: ${counts.heroes || 0} hero, ${counts.rankRows || 0} rank row.`, result?.data?.partial ? 'warning' : 'success');
      await this.render('metaLabContainer', true);
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
      if (error.status === 401) this.auth.showLoginModal();
      window.showToast?.(error.message, error.status === 409 ? 'warning' : 'error');
    }
  }

  async openHeroDossier(heroId, returnFocus = null) {
    const catalogHero = this.heroById(heroId) || { id: heroId, name: `Hero #${heroId}` };
    const focusTarget = returnFocus || this.dossierReturnFocus || document.activeElement;
    this.closeDossier({ restoreFocus: false });
    this.dossierReturnFocus = focusTarget;
    const overlay = document.createElement('div');
    overlay.className = 'meta-dossier-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <section class="meta-dossier" role="dialog" aria-modal="true" aria-labelledby="metaDossierTitle">
        <button type="button" class="meta-dossier__close" data-dossier-close aria-label="Yopish"><i class="fa-solid fa-xmark"></i></button>
        <div class="meta-dossier-loading"><span></span><div><p class="section-eyebrow">HERO DOSSIER / ${Number(heroId)}</p><h3 id="metaDossierTitle">${this.escape(catalogHero.name)}</h3><p>Skills, counter va compatibility signali olinmoqda…</p></div></div>
      </section>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    const close = () => this.closeDossier();
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target.closest('[data-dossier-close]')) close();
      const related = event.target.closest('[data-related-hero]');
      if (related) this.openHeroDossier(Number(related.dataset.relatedHero), this.dossierReturnFocus);
    });
    this.dossierEscapeHandler = event => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', this.dossierEscapeHandler);
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      overlay.querySelector('[data-dossier-close]')?.focus();
    });
    try {
      const rank = this.selectedRank || 'mythic';
      const days = this.state.meta?.data?.days || '7';
      const payload = await this.request(`/api/mlbb-heroes?id=${encodeURIComponent(heroId)}&rank=${encodeURIComponent(rank)}&days=${encodeURIComponent(days)}`);
      if (!payload.data || !document.body.contains(overlay)) return;
      const detail = this.mergeDossierDetail(heroId, payload.data);
      const catalog = this.state.heroes?.data || [];
      const index = catalog.findIndex(hero => Number(hero.id) === Number(heroId));
      if (index >= 0) catalog[index] = { ...catalog[index], ...detail };
      await this.hydrateClientCatalog(catalog);
      overlay.querySelector('.meta-dossier').innerHTML = this.dossierMarkup(detail, payload.status);
      const closeButton = overlay.querySelector('[data-dossier-close]');
      closeButton?.focus();
    } catch (error) {
      if (!document.body.contains(overlay)) return;
      overlay.querySelector('.meta-dossier').innerHTML = `
        <button type="button" class="meta-dossier__close" data-dossier-close aria-label="Yopish"><i class="fa-solid fa-xmark"></i></button>
        <div class="meta-dossier-error"><i class="fa-solid fa-triangle-exclamation"></i><h3>Dossier ochilmadi</h3><p>${this.escape(error.message)}</p></div>`;
      overlay.querySelector('[data-dossier-close]')?.focus();
    }
  }

  matchupMarkup(title, icon, rows = [], tone = '') {
    if (!Array.isArray(rows) || !rows.length) return '';
    return `
      <section class="meta-matchup-group ${tone}">
        <header><i class="fa-solid ${icon}"></i><h4>${title}</h4></header>
        <div>${rows.slice(0, 5).map(row => {
          const hero = this.heroById(row.heroId) || { id: row.heroId, name: `Hero #${row.heroId}`, image: row.image };
          return `<button type="button" data-related-hero="${Number(row.heroId)}">${this.imageMarkup(hero)}<span><strong>${this.escape(hero.name)}</strong><small>${row.deltaWinRate === null || row.deltaWinRate === undefined ? 'Matchup signal' : `${Number(row.deltaWinRate) >= 0 ? '+' : ''}${this.formatRate(row.deltaWinRate)}`}</small></span></button>`;
        }).join('')}</div>
      </section>`;
  }

  dossierMarkup(detail, cacheStatus) {
    const skills = Array.isArray(detail.skills) ? detail.skills : [];
    const matchups = detail.matchups || {};
    const roles = [...(detail.roles || []), ...(detail.lanes || [])];
    return `
      <button type="button" class="meta-dossier__close" data-dossier-close aria-label="Yopish"><i class="fa-solid fa-xmark"></i></button>
      <header class="meta-dossier-hero">
        <div class="meta-dossier-hero__image">${this.imageMarkup(detail)}</div>
        <div><p class="section-eyebrow">HERO DOSSIER / ID ${Number(detail.id)}</p><h2 id="metaDossierTitle">${this.escape(detail.name)}</h2><p>${this.escape(detail.story || 'Canonical MLBB hero intelligence')}</p><div class="meta-dossier-tags">${roles.length ? roles.map(item => `<span>${this.escape(item)}</span>`).join('') : '<span>Role pending</span>'}<span class="is-cache">${this.escape(cacheStatus || 'cache')}</span></div></div>
      </header>
      <div class="meta-dossier-body">
        <section class="meta-skill-matrix">
          <header><p class="section-eyebrow">ABILITY MATRIX</p><h3>Skills</h3></header>
          <div>${skills.length ? skills.map((skill, index) => `
            <article>
              <span>${skill.icon ? `<img src="${this.escape(skill.icon)}" alt="">` : String(index + 1).padStart(2, '0')}</span>
              <div><small>${this.escape((skill.tags || []).join(' · ') || `Skill ${index + 1}`)}</small><h4>${this.escape(skill.name)}</h4><p>${this.escape(skill.description)}</p>${skill.cooldownCost ? `<em>${this.escape(skill.cooldownCost)}</em>` : ''}</div>
            </article>`).join('') : this.emptyMarkup('fa-hourglass-half', 'Skill data kutilmoqda', 'Keyingi provider refreshda qayta uriniladi.')}</div>
        </section>
        <aside class="meta-matchup-matrix">
          <p class="section-eyebrow">${this.escape(this.rankLabel?.(matchups.rank) || matchups.rank || 'Rank noma’lum')} · ${this.escape(matchups.days || '—')} kun · ${this.escape(matchups.updatedAt ? new Date(matchups.updatedAt).toLocaleDateString('uz-UZ') : 'Yangilanish kutilmoqda')}</p>
          <p class="text-muted">Counter va synergy — manbadagi statistik signallar, kafolatlangan natija yoki tayyor draft tavsiyasi emas.</p>
          ${this.matchupMarkup('Strong against', 'fa-arrow-trend-up', matchups.counters?.favorable, 'is-positive')}
          ${this.matchupMarkup('Risk matchups', 'fa-arrow-trend-down', matchups.counters?.unfavorable, 'is-negative')}
          ${this.matchupMarkup('Best compatibility', 'fa-people-arrows', matchups.compatibility?.favorable, 'is-synergy')}
          ${matchups.error ? `<div class="meta-matchup-error"><i class="fa-solid fa-triangle-exclamation"></i> Matchup provider vaqtincha ishlamadi.</div>` : ''}
        </aside>
      </div>
      <footer class="meta-dossier-footer"><span>Rone Arena API · ${this.escape(detail.source?.license || 'BSD-3-Clause')}</span>${detail.officialUrl ? `<a href="${this.escape(detail.officialUrl)}" target="_blank" rel="noopener noreferrer">Official hero page <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}</footer>`;
  }

  closeDossier(options = {}) {
    const returnFocus = this.dossierReturnFocus;
    const overlay = document.querySelector('.meta-dossier-overlay');
    if (overlay) overlay.remove();
    if (this.dossierEscapeHandler) document.removeEventListener('keydown', this.dossierEscapeHandler);
    this.dossierEscapeHandler = null;
    this.dossierReturnFocus = null;
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
    if (options.restoreFocus !== false && returnFocus?.isConnected) returnFocus.focus();
  }
};
