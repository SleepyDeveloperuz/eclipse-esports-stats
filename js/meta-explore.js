/* Public-only preferences and canonical IDs. No team records or credentials. */
(() => {
  const Base = window.MlbbDataManager;
  const ranks = ['epic', 'legend', 'mythic', 'glory'];
  const views = ['tier', 'heroes', 'patches', 'lens', 'compare', 'watchlist', 'impact', 'draft', 'movers'];
  const tiers = ['all', 'SS', 'S', 'A', 'B', 'C', 'D', 'U'];
  const watchKey = 'eclipse:public:watchlist:v1';
  const id = value => /^[1-9]\d{0,4}$/.test(String(value)) ? Number(value) : 0;
  const uniqueIds = values => [...new Set(values.map(id).filter(Boolean))];
  const numeric = value => typeof value === 'number' && Number.isFinite(value);
  window.MlbbDataManager = class MetaExploreManager extends Base {
    constructor(...args) {
      super(...args);
      this.compareIds = []; this.lensId = 0; this.sharedHero = 0;
      this.watchIds = []; this.watchPersistent = true;
      this.publicEntry = /^\/meta-lab(?:\.html)?\/?$/.test(location.pathname);
      try {
        const saved = JSON.parse(localStorage.getItem(watchKey) || '[]');
        if (Array.isArray(saved)) this.watchIds = uniqueIds(saved).slice(0, 500);
      } catch (_) { this.watchPersistent = false; }
      if (this.publicEntry) {
        this.readSharedState();
        window.addEventListener('popstate', () => { this.readSharedState(); this.render(); });
      }
    }
    readSharedState() {
      const query = new URL(location.href).searchParams;
      this.selectedRank = ranks.includes(query.get('rank')) ? query.get('rank') : 'mythic';
      this.currentView = views.includes(query.get('view')) ? query.get('view') : 'tier';
      this.tierFilter = tiers.includes(query.get('tier')) ? query.get('tier') : 'all';
      this.tierDisplay = query.get('display') === 'table' ? 'table' : 'board';
      this.searchQuery = (query.get('q') || '').slice(0, 80);
      this.lensId = id(query.get('lens'));
      this.compareIds = uniqueIds((query.get('compare') || '').split(',')).slice(0, 3);
      this.pendingSharedHero = id(query.get('hero'));
    }
    shareUrl() {
      const url = new URL('/meta-lab', location.origin === 'null' ? 'https://eclipseesports.vercel.app' : location.origin);
      url.searchParams.set('rank', this.selectedRank);
      url.searchParams.set('view', this.currentView);
      if (this.searchQuery) url.searchParams.set('q', this.searchQuery.slice(0, 80));
      if (this.tierFilter !== 'all') url.searchParams.set('tier', this.tierFilter);
      if (this.tierDisplay === 'table') url.searchParams.set('display', 'table');
      if (this.lensId) url.searchParams.set('lens', this.lensId);
      if (this.sharedHero) url.searchParams.set('hero', this.sharedHero);
      if (this.compareIds.length) url.searchParams.set('compare', this.compareIds.join(','));
      return url.href;
    }
    syncShareUrl() {
      if (!this.exploreReady || typeof location === 'undefined') return;
      const url = this.shareUrl();
      if (this.publicEntry) {
        try { history.replaceState(null, '', url); } catch (_) { /* file preview */ }
      }
      const field = this.container?.querySelector('[data-meta-share-url]');
      if (field) field.value = url;
    }
    async shareSelection(button) {
      const url = this.shareUrl();
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(url);
        window.showToast?.('Havola nusxalandi.');
      } catch (_) {
        const field = this.container?.querySelector('[data-meta-share-url]');
        if (field) { field.hidden = false; field.value = url; field.focus(); field.select(); }
        window.showToast?.('Havolani belgilangan maydondan nusxalang.');
      }
      button?.setAttribute('aria-label', 'Tanlangan holat havolasini nusxalash');
    }
    extraViews() { return [['lens', 'fa-layer-group', 'Rank Lens'], ['compare', 'fa-scale-balanced', 'Hero Compare'], ['watchlist', 'fa-star', 'Kuzatuv']]; }
    getMeta(force = false) {
      return this.getRankMeta(this.selectedRank, force);
    }
    getRankMeta(rank, force = false) {
      return this.cachedRequest(`meta:${rank}:7`, `/api/mlbb-meta?rank=${rank}&days=7&method=5`, force).then(payload => {
        if (payload?.data?.rank !== rank || String(payload?.data?.days) !== '7') throw new Error('Rank yoki davr manbaga mos kelmadi.');
        return payload;
      });
    }
    async render(...args) {
      await super.render(...args);
      const heroId = this.pendingSharedHero; this.pendingSharedHero = 0;
      if (heroId && this.heroById(heroId)) await this.openHeroDossier(heroId);
      else if (heroId) window.showToast?.('Havoladagi hero katalogda topilmadi.');
    }
    renderState(errors = []) {
      const catalog = this.state.heroes?.data;
      if (catalog?.length) {
        this.compareIds = this.compareIds.filter(value => this.heroById(value));
        if (!this.heroById(this.lensId)) this.lensId = catalog[0].id;
      }
      super.renderState(errors);
      this.exploreReady = true;
      this.container?.querySelector('.meta-lab-commandbar')?.insertAdjacentHTML('afterend', `<div class="meta-share-bar"><p>Ochiq ma’lumot · 7 kunlik davr</p><button class="btn btn-sm btn-secondary" type="button" data-explore-action="share"><i class="fa-solid fa-link" aria-hidden="true"></i> Shu holatni ulashish</button><input data-meta-share-url aria-label="Ulashish havolasi" readonly hidden></div>`);
      this.syncShareUrl();
      this.loadExplore();
    }
    async selectRank(rank) { await super.selectRank(rank); this.syncShareUrl(); }
    tierMarkup() {
      const markup = super.tierMarkup();
      if (this.tierDisplay === 'table' || !this.tierRows().length) return markup;
      const tools = `<div class="meta-tier-tools"><label><input type="search" id="metaTierSearch" aria-label="Tier boarddan qidirish" placeholder="Hero qidirish…" value="${this.escape(this.searchQuery)}" maxlength="80"></label><div class="meta-tier-legend" aria-label="Tier filtri">${tiers.map(tier => `<button type="button" data-tier-filter="${tier}" class="${this.tierFilter === tier ? 'active' : ''}" aria-pressed="${this.tierFilter === tier}">${tier === 'all' ? 'Barchasi' : tier}</button>`).join('')}</div></div><p data-board-empty class="meta-explore-note" hidden>Bu filtrga mos qahramon topilmadi.</p>`;
      return markup.replace('<section class="solar-tier-board">', tools + '<section class="solar-tier-board">');
    }
    applyFilters() {
      super.applyFilters();
      let count = 0;
      this.container?.querySelectorAll('.solar-tier-row').forEach(row => {
        const tier = row.querySelector('.solar-tier-label strong')?.textContent;
        const tierMatch = this.tierFilter === 'all' || this.tierFilter === tier;
        let visible = 0;
        row.querySelectorAll('[data-hero-id]').forEach(button => {
          const name = button.querySelector('strong')?.textContent.toLowerCase() || '';
          button.hidden = !tierMatch || !name.includes(this.searchQuery.toLowerCase());
          if (!button.hidden) visible++;
        });
        row.hidden = visible === 0; count += visible;
      });
      const empty = this.container?.querySelector('[data-board-empty]');
      if (empty) empty.hidden = count > 0;
      this.container?.querySelectorAll('[data-tier-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tierFilter === this.tierFilter)));
    }
    heroSelect(attribute, chosen = 0, placeholder = 'Qahramonni tanlang') {
      return `<select ${attribute} aria-label="${this.escape(placeholder)}"><option value="">${this.escape(placeholder)}</option>${(this.state.heroes?.data || []).map(hero => `<option value="${Number(hero.id)}" ${Number(hero.id) === Number(chosen) ? 'selected' : ''}>${this.escape(hero.name)}</option>`).join('')}</select>`;
    }
    favoriteButton(heroId) {
      const saved = this.watchIds.includes(Number(heroId));
      return `<button class="btn btn-sm btn-secondary" type="button" data-watch-id="${Number(heroId)}" aria-pressed="${saved}"><i class="fa-${saved ? 'solid' : 'regular'} fa-star" aria-hidden="true"></i> ${saved ? 'Kuzatuvda' : 'Kuzatish'}</button>`;
    }
    toggleWatch(heroId) {
      if (!this.heroById(heroId) && !this.watchIds.includes(heroId)) return;
      this.watchIds = this.watchIds.includes(heroId) ? this.watchIds.filter(value => value !== heroId) : [...this.watchIds, heroId].slice(-500);
      try { localStorage.setItem(watchKey, JSON.stringify(this.watchIds)); this.watchPersistent = true; }
      catch (_) { this.watchPersistent = false; window.showToast?.('Brauzer saqlashni cheklagan. Ro‘yxat faqat shu sessiyada qoladi.'); }
      this.renderState();
      document.querySelectorAll('.meta-dossier [data-watch-id]').forEach(button => {
        if (Number(button.dataset.watchId) === heroId) button.outerHTML = this.favoriteButton(heroId);
      });
    }
    viewMarkup() {
      if (this.currentView === 'lens') return `<section class="meta-explore"><header class="meta-section-header"><div><p class="section-eyebrow">ONE HERO / FOUR RANKS</p><h3>Rank Lens</h3><p>Bir qahramon, bir davr. Ranklar, hisob va saqlangan tarix.</p></div><label>Qahramon${this.heroSelect('data-lens-select', this.lensId)}</label></header><div data-explore-content role="region" aria-label="Rank Lens natijalari" aria-live="polite">${this.exploreLoading()}</div></section>`;
      if (this.currentView === 'compare') return `<section class="meta-explore"><header class="meta-section-header"><div><p class="section-eyebrow">SAME RANK / SAME PERIOD</p><h3>Hero Compare</h3><p>2–3 qahramon · ${this.escape(this.rankLabel(this.selectedRank))} · 7 kun. Statistikalar g‘olibni belgilamaydi.</p></div><label>Taqqoslashga qo‘shish${this.heroSelect('data-compare-select', 0)}</label></header>${this.rankMarkup()}<div class="meta-compare-chips">${this.compareIds.map(value => `<button class="btn btn-secondary" type="button" data-compare-remove="${value}" aria-label="${this.escape(this.heroById(value)?.name)} ni taqqoslashdan olib tashlash">${this.escape(this.heroById(value)?.name)} ×</button>`).join('')}</div><div data-explore-content aria-live="polite">${this.compareIds.length >= 2 ? this.exploreLoading() : '<p class="meta-explore-empty">Boshlash uchun ikki yoki uch qahramonni tanlang.</p>'}</div></section>`;
      if (this.currentView === 'watchlist') return this.watchlistMarkup();
      return super.viewMarkup();
    }
    exploreLoading() { return '<div class="meta-explore-loading" role="status">Ma’lumot yuklanmoqda…</div>'; }
    watchlistMarkup() {
      const rows = this.state.meta?.data?.eclipse || [];
      return `<section class="meta-explore"><header class="meta-section-header"><div><p class="section-eyebrow">YOUR LOCAL SHORTLIST</p><h3>Kuzatuv ro‘yxati <small>${this.watchIds.length}</small></h3><p>Faqat shu brauzerda saqlanadi. Hisob, sinxronlash yoki bildirishnoma yo‘q. Havolada ro‘yxatingiz yuborilmaydi.</p>${!this.watchPersistent ? '<p role="status">Doimiy saqlash mavjud emas — ro‘yxat faqat shu sessiyada.</p>' : ''}</div><label>Qahramon qo‘shish${this.heroSelect('data-watch-select')}</label></header>${this.rankMarkup()}<div class="meta-watch-grid">${this.watchIds.map(value => {
        const hero = this.heroById(value), row = rows.find(item => Number(item.heroId) === value);
        return `<article class="meta-watch-card"><div class="meta-watch-identity">${hero ? this.imageMarkup(hero) : ''}<h4>${this.escape(hero?.name || `Hero #${value} · katalogda yo‘q`)}</h4></div>${hero ? `<p>${this.escape(this.rankLabel(this.selectedRank))} · ${this.escape(row?.tier || 'Tier yo‘q')} · Win ${this.formatRate(row?.winRate)}</p><button type="button" class="btn btn-sm btn-secondary" data-open-lens="${value}">Rank Lens va tarix</button>` : ''}${this.favoriteButton(value)}</article>`;
      }).join('') || '<p class="meta-explore-empty">Qahramon tanlang yoki dossierdagi yulduzchani bosing.</p>'}</div></section>`;
    }
    async loadExplore() {
      const generation = this.exploreGeneration = (this.exploreGeneration || 0) + 1;
      const target = this.container?.querySelector('[data-explore-content]');
      if (!target) return;
      const view = this.currentView, heroId = Number(this.lensId), rank = this.selectedRank;
      const active = () => generation === this.exploreGeneration && target.isConnected;
      if (view === 'lens' && !this.heroById(heroId)) {
        target.innerHTML = '<p>Qahramon katalogi mavjud emas.</p><button type="button" class="btn btn-secondary" data-meta-action="retry">Qayta urinish</button>';
        return;
      }
      if (view === 'lens' && this.heroById(heroId)) {
        const results = await Promise.allSettled(ranks.map(value => this.getRankMeta(value)));
        if (!active()) return;
        const states = results.map(result => result.status === 'fulfilled' ? result.value : null);
        const selected = states[ranks.indexOf(rank)];
        target.innerHTML = `<div class="meta-explore-hero"><h4>${this.escape(this.heroById(heroId).name)}</h4>${this.favoriteButton(heroId)}<button class="btn btn-sm btn-secondary" type="button" data-hero-id="${heroId}">Skills va counters</button></div><div class="meta-lens-grid">${ranks.map((value, index) => this.rankCard(value, states[index], heroId)).join('')}</div><p class="meta-explore-note">Yuqori rank avtomatik ravishda ishonchliroq degani emas. Match soni manbada yo‘q; yangilanish sanalari farq qilishi mumkin.</p>${this.whyMarkup(selected?.data?.eclipse?.find(row => Number(row.heroId) === heroId), selected)}<section class="meta-timeline"><header><p class="section-eyebrow">OBSERVED, NOT RECONSTRUCTED</p><h3>Meta Timeline</h3><p>${this.escape(this.rankLabel(rank))} · 7 kunlik davr. Rank kartasini bosib tarix manbasini o‘zgartiring.</p></header><div data-timeline-content>${this.exploreLoading()}</div></section>`;
        try {
          const history = await this.cachedRequest(`timeline:${heroId}:${rank}:7`, `/api/mlbb-meta?view=timeline&id=${heroId}&rank=${rank}&days=7`);
          if (active()) target.querySelector('[data-timeline-content]').innerHTML = this.timelineMarkup(history.data);
        } catch (_) {
          if (active()) target.querySelector('[data-timeline-content]').innerHTML = '<p role="alert">Tarixni yuklab bo‘lmadi.</p><button type="button" class="btn btn-secondary" data-explore-action="retry">Qayta urinish</button>';
        }
      } else if (view === 'compare' && this.compareIds.length >= 2) {
        const ids = [...this.compareIds];
        const [meta, ...details] = await Promise.allSettled([this.getRankMeta(rank), ...ids.map(value => this.cachedRequest(`detail:${value}:${rank}:7`, `/api/mlbb-heroes?id=${value}&rank=${rank}&days=7`))]);
        if (!active()) return;
        const snapshot = meta.status === 'fulfilled' ? meta.value : null;
        target.innerHTML = `<p class="meta-explore-note">${this.escape(this.rankLabel(rank))} · 7 kun · ${this.escape(this.formatDate(snapshot?.updatedAt))} · ${this.escape(this.freshnessMeta(snapshot).label)}</p><div class="meta-compare-grid" style="--compare-count:${ids.length}">${ids.map((value, index) => this.compareCard(value, details[index], snapshot)).join('')}</div>`;
      }
    }
    rankCard(rank, payload, heroId) {
      const row = payload?.data?.eclipse?.find(item => Number(item.heroId) === heroId);
      return `<article class="meta-lens-card ${rank === this.selectedRank ? 'is-selected' : ''}"><button type="button" data-lens-rank="${rank}" aria-pressed="${rank === this.selectedRank}">${this.escape(this.rankLabel(rank))}<span>${this.escape(row?.tier || '—')}</span></button>${this.statsMarkup(row)}<small>${this.escape(this.freshnessMeta(payload).label)} · ${this.escape(this.formatDate(payload?.updatedAt))}</small>${!payload ? '<p>Rank ma’lumoti mavjud emas.</p><button type="button" class="btn btn-sm btn-secondary" data-explore-action="retry">Qayta urinish</button>' : !row ? '<p>Bu qahramon uchun rank ma’lumoti yo‘q.</p>' : ''}</article>`;
    }
    statsMarkup(row) {
      return `<dl class="meta-explore-stats"><div><dt>Win</dt><dd>${this.formatRate(row?.winRate)}</dd></div><div><dt>Pick</dt><dd>${this.formatRate(row?.pickRate, 3)}</dd></div><div><dt>Ban</dt><dd>${this.formatRate(row?.banRate)}</dd></div><div><dt>Eclipse</dt><dd>${numeric(row?.eclipseScore) ? row.eclipseScore.toFixed(2) : '—'}</dd></div></dl>`;
    }
    whyMarkup(row, payload = this.state.meta) {
      const b = row?.scoreBreakdown;
      if (!b) return '<section class="meta-why"><h3>Nega bu tier?</h3><p>Hisob tafsilotlari bu snapshotda mavjud emas. Ma’lumot qayta yuklanganda tekshiring.</p></section>';
      const number = value => numeric(value) ? value.toFixed(2) : '—';
      if (row.methodVersion === 'eclipse-tier-5.0.0') {
        const method = payload?.data?.methodology || {};
        const statuses = { stable: 'Vaqt bo‘yicha barqaror', provisional: 'Dastlabki baho', stale: 'Eskirgan nusxa', unrated: 'Baholanmagan' };
        return `<section class="meta-why"><header><p class="section-eyebrow">DRAFT USTUVORLIGI / OCHIQ HISOB</p><h3>Nega ${this.escape(row.tier)} tier?</h3><p>${this.escape(method.labels?.[row.tier] || '')} · ${this.escape(this.rankLabel(payload?.data?.rank))} · ${Number(payload?.data?.days) || 7} kun · ${this.escape(this.formatDate(payload?.updatedAt))}</p></header>
          <p class="meta-quality">${this.escape(statuses[row.quality?.status] || 'Dastlabki baho')}${row.quality?.borderline ? ' · Tier chegarasiga 1 ball ichida' : ''} · Tier va kuzatuv sifati alohida</p>
          <div class="meta-score-equation"><span><strong>${number(b.winPoints)}</strong><small>Win hissasi / 50</small></span><b>+</b><span><strong>${number(b.pickPoints)}</strong><small>Pick hissasi / 20</small></span><b>+</b><span><strong>${number(b.banPoints)}</strong><small>Ban hissasi / 30</small></span><b>=</b><span><strong>${number(row.eclipseScore)}</strong><small>Draft balli · 0–100</small></span></div>
          <p>50% Win samaradorligi + 20% Pick talabi + 30% Ban bosimi. Ko‘p pick yoki ban qilinadigan hero eng yuqori Win’siz ham yuqori tier olishi mumkin. Bu g‘alaba ehtimoli, majburiy pick yoki ban ko‘rsatmasi emas.</p>
          <details><summary>Hisoblash tafsilotlari va chegaralar</summary>
          <p>Manba: Win ${this.formatRate(row.winRate)}, Pick ${this.formatRate(row.pickRate, 3)}, Ban ${this.formatRate(row.banRate)}. Manba foizlari o‘zgartirilmagan.</p>
          <p>Win signali = 50 + 100/π × atan(0.6 × (Win − 50%) / 2 pp + 0.4 × (Win − rank mediani) / yoyilish). Median ${this.formatRate(b.rankCenter)}, yoyilish max(IQR / 1.349, 0.5 pp) = ${number(b.rankSpread * 100)} pp. Win signali: ${number(b.winSignal)} / 100.</p>
          <p>Pick signali = 100 × Pick / (Pick + tayanch). Tayanch ${this.formatRate(b.pickReference, 3)}; rank median Pick ${this.formatRate(b.medianPickRate, 3)}. Pick signali: ${number(b.pickSignal)} / 100. Ban signali = 100 × Ban / (Ban + 10%): ${number(b.banSignal)} / 100. Har bir signal o‘sadi, lekin ta’siri asta-sekin to‘yinadi.</p>
          <p>${Number(b.cohortSize) || 0} baholanadigan hero. ${b.cohortReady ? 'Pick tayanchi = max(rank median Pick, 0.1%). IQR — o‘rtadagi 50% hero Win oralig‘i.' : '10 tadan kam hero: Win tayanchi 50%, yoyilish 2 pp, Pick tayanchi 1%.'} Ball = Win signali × 0.50 + Pick signali × 0.20 + Ban signali × 0.30. Tier to‘liq aniqlikdagi ball bo‘yicha; ko‘rsatilgan hissalar yaxlitlangan.</p>
          <dl class="meta-band-rules">${Object.entries(method.bands || {}).map(([tier, rule]) => `<div><dt>${this.escape(tier)}</dt><dd>${this.escape(rule)}</dd></div>`).join('')}</dl>
          <p>Mos kunlik kuzatuvlar: ${Number(row.quality?.historyDays) || 0}. Patch oynasi: ${row.quality?.patchWindow === 'post-patch' ? 'patchdan keyin' : 'noma’lum yoki aralash'}. Barqaror: shu patchdagi 3 kunlik kuzatuvda Win oralig‘i ≤1.5 pp, Pick ≤max(0.2 pp, joriy Pick ×25%), Ban ≤5 pp. Tarix yetishmasligi SS’ni to‘sib qo‘ymaydi.</p>
          <p>Og‘irliklar, tayanchlar va tier chegaralari Eclipse’ning tajribaviy siyosati, MLBB.GG yoki Moonton formulasi emas. SS kvotasi yo‘q. Past Pick — kam ko‘rinish, o‘lchangan sample hajmi emas. Match soni noma’lum; barqarorlik statistik ishonch emas. Turli rank yoki usul ballari kuch farqi emas. AI prognoz qo‘llanmaydi.</p></details></section>`;
      }
      if (row.methodVersion === 'eclipse-tier-4.0.0') {
        const statuses = { stable: 'Vaqt bo‘yicha barqaror', provisional: 'Dastlabki baho', stale: 'Eskirgan nusxa', unrated: 'Baholanmagan' };
        const bands = payload?.data?.methodology?.bands || {};
        return `<section class="meta-why"><header><p class="section-eyebrow">OCHIQ HISOB / TAJRIBA</p><h3>Nega ${this.escape(row.tier)} tier?</h3><p>${this.escape(this.rankLabel(payload?.data?.rank))} · ${Number(payload?.data?.days) || 7} kun · ${this.escape(this.formatDate(payload?.updatedAt))}</p></header>
          <p class="meta-quality">${this.escape(statuses[row.quality?.status] || 'Dastlabki baho')}${row.quality?.borderline ? ' · Tier chegarasida' : ''} · Tier va kuzatuv sifati alohida</p>
          <div class="meta-score-equation"><span><strong>${this.formatRate(row.winRate)}</strong><small>Manba Win</small></span><span><strong>${this.formatRate(b.rankCenter)}</strong><small>${b.cohortReady ? 'Shu rank mediani' : 'Neytral tayanch'}</small></span><span><strong>${number(row.eclipseScore)}</strong><small>Eclipse balli · 0–100</small></span></div>
          <p>Bahoning 60% qismi Win’ning 50% dan farqiga, 40% qismi shu rankdagi hero natijalari orasidagi o‘rniga bog‘liq. Pick va Ban ball qo‘shmaydi. SS uchun tarix kutish shart emas; tarix yetishmasa “Dastlabki baho” qoladi.</p>
          <details><summary>Hisoblash tafsilotlari va chegaralar</summary><p>Mutlaq signal: ${number(b.absoluteSignal)} × 0.60. Rank signali: ${number(b.relativeSignal)} × 0.40. Jami: ${number(b.combinedSignal)}.</p>
          <p>Mutlaq signal = (Win − 50%) / 2 pp. Rank signali = (Win − median) / yoyilish. Yoyilish = max(IQR / 1.349, 0.5 pp); hozir ${number(b.rankSpread * 100)} pp. Ball = 50 + 100/π × atan(jami signal). Bu silliq shkala: 55% dan keyin ball 100’da kesilmaydi.</p>
          <p>${Number(b.cohortSize) || 0} baholanadigan hero. ${b.cohortReady ? 'IQR — rankdagi o‘rtadagi 50% hero Win oralig‘i.' : '10 tadan kam hero: rank taqsimoti o‘rniga 50% tayanch va 2 pp yoyilish ishlatilgan.'}</p>
          <dl class="meta-band-rules">${Object.entries(bands).map(([tier, rule]) => `<div><dt>${this.escape(tier)}</dt><dd>${this.escape(rule)}</dd></div>`).join('')}</dl>
          <p>Mos kunlik kuzatuvlar: ${Number(row.quality?.historyDays) || 0}. Patch oynasi: ${row.quality?.patchWindow === 'post-patch' ? 'patchdan keyin' : 'noma’lum yoki aralash'}. Bu holatlar tierni pasaytirmaydi.</p>
          <p>Og‘irliklar va chegaralar tajribaviy; statistik isbot emas. Match soni noma’lum, past Pick alohida ko‘rsatiladi. Barqarorlik ishonch oralig‘i emas; 7 kunlik oynalar bir-birini qoplaydi. Turli rank yoki usullardagi ballarni kuch farqi deb talqin qilmang.</p></details></section>`;
      }
      if (row.methodVersion === 'eclipse-tier-3.0.0') {
        const statuses = { stable: 'Vaqt bo‘yicha barqaror', provisional: 'Dastlabki baho', borderline: 'Tier chegarasida', stale: 'Eskirgan nusxa', unrated: 'Baholanmagan' };
        const bands = payload?.data?.methodology?.bands || {};
        return `<section class="meta-why"><header><p class="section-eyebrow">OCHIQ HISOB / TAJRIBA</p><h3>Nega ${this.escape(row.tier)} tier?</h3><p>${this.escape(this.rankLabel(payload?.data?.rank))} · 7 kun · ${this.escape(this.formatDate(payload?.updatedAt))}</p></header><p class="meta-quality">${this.escape(statuses[row.quality?.status] || 'Dastlabki baho')}${row.quality?.held ? ' · 0.2 pp chegaraviy qoida oldingi tierni saqladi' : ''}</p><div class="meta-score-equation"><span><strong>${this.formatRate(row.winRate)}</strong><small>Manba Win</small></span><span><strong>${number(b.winEdgePp)} pp</strong><small>50% dan farq</small></span><span><strong>${number(row.eclipseScore)}</strong><small>Eclipse balli · 0–100</small></span></div><p>Ball = 50 + (Win% − 50) × 10, 0–100 bilan cheklangan. Pick va Ban ballga qo‘shilmaydi.</p>${row.rawTier === 'SS' && !row.quality?.ssEligible ? '<p>Win SS chegarasida, ammo mos patch ichidagi 3 kunlik kuzatuv hali yetarli emas. Hozir S, dastlabki baho.</p>' : ''}<details><summary>Chegaralar va cheklovlar</summary><dl class="meta-band-rules">${Object.entries(bands).map(([tier, rule]) => `<div><dt>${this.escape(tier)}</dt><dd>${this.escape(rule)}</dd></div>`).join('')}</dl><p>SS: 3 kuzatuvning har birida Win kamida 53%; tarqalish ko‘pi bilan 1.5 pp. Patch e’lonidan keyingi to‘liq oynalar va shu usul versiyasi kerak. Mos kuzatuvlar: ${Number(row.quality?.historyDays) || 0}.</p><p>Chegaralar tajribaviy siyosat, statistik isbot emas. Match soni noma’lum. Barqarorlik ishonch oralig‘i emas; 7 kunlik oynalar bir-birini qoplaydi. Eski usuldagi ballar bilan solishtirmang.</p></details></section>`;
      }
      return `<section class="meta-why"><header><p class="section-eyebrow">OPEN METHODOLOGY</p><h3>Nega ${this.escape(row.tier)} tier?</h3><p>${this.escape(this.rankLabel(payload?.data?.rank))} · 7 kun · ${this.escape(payload?.data?.methodology?.version || row.methodVersion)} · ${this.escape(this.formatDate(payload?.updatedAt))}</p></header><div class="meta-score-equation"><span><strong>${number(b.winPoints)}</strong><small>Win hissasi / 65</small></span><b>+</b><span><strong>${number(b.pickPoints)}</strong><small>Pick hissasi / 20</small></span><b>+</b><span><strong>${number(b.banPoints)}</strong><small>Ban hissasi / 15</small></span><b>=</b><span><strong>${number(row.eclipseScore)}</strong><small>Eclipse balli</small></span></div><details><summary>Hisoblash tafsilotlari</summary><p>Manba win rate: ${this.formatRate(row.winRate)}. Median pick: ${this.formatRate(b.medianPickRate, 3)}. Pick og‘irligi: ${number(b.visibilityWeight)}. Tuzatilgan win rate: ${this.formatRate(row.adjustedWinRate)}.</p><p>Og‘irlik = sqrt(pick / median pick), 0.30–1 oralig‘ida. Tuzatilgan win = 50% + (win − 50%) × og‘irlik. Past pick natijasi 50% tomon yumshatiladi; bu ishonch oralig‘i emas.</p><p>Shu rankdagi hero percentillari: win ${this.formatRate(b.adjustedWinPercentile)}, pick ${this.formatRate(b.pickPercentile)}, ban ${this.formatRate(b.banPercentile)}. Ball = win percentili × 65 + pick percentili × 20 + ban percentili × 15; ko‘rsatilgan hissalar yaxlitlangan.</p><p>SS: yuqori 5%; S: keyingi 10%; A: 15%; B: 35%; C: 25%; D: oxirgi 10%. Teng ballar bitta tierda qoladi, guruh hajmi o‘zgarishi mumkin. Bu nisbiy Eclipse bahosi — Moonton reytingi yoki g‘alaba kafolati emas.</p></details></section>`;
    }
    timelineMarkup(data) {
      const points = Array.isArray(data?.points) ? data.points : [];
      if (!points.length) return '<p class="meta-explore-empty">Bu qahramon va rank uchun saqlangan tarix hali yo‘q. Keyingi muvaffaqiyatli syncdan keyin haqiqiy nuqtalar paydo bo‘ladi.</p>';
      return `<p class="meta-explore-note">${points.length} kunlik nusxa. ${points.length === 1 ? 'Yo‘nalish haqida xulosa qilish uchun hali erta.' : 'Faqat mavjud sanalar ko‘rsatilgan.'} Eski ball saqlanmagan bo‘lsa, “—”. Shu rank va davr uchun oxirgi 90 ta saqlangan kunlik nuqta.</p><div class="meta-timeline-scroll"><table class="meta-tier-table"><caption>Saqlangan snapshotlar, yangisi yuqorida</caption><thead><tr><th>Sana (UTC)</th><th>Tier</th><th>Win</th><th>Pick</th><th>Ban</th><th>Ball</th><th>Usul</th></tr></thead><tbody>${[...points].reverse().map(point => `<tr><td>${this.escape(point.date)}</td><td>${this.escape(point.tier || '—')}</td><td>${this.formatRate(point.winRate)}</td><td>${this.formatRate(point.pickRate, 3)}</td><td>${this.formatRate(point.banRate)}</td><td>${numeric(point.eclipseScore) ? point.eclipseScore.toFixed(2) : '—'}</td><td>${this.escape(point.methodologyVersion || 'Noma’lum')}</td></tr>`).join('')}</tbody></table></div><p class="meta-explore-note">7 kunlik oynalar bir-birini qoplaydi; har nuqta yangi mustaqil 7 kun emas. Usul versiyasi o‘zgarsa, ballarni bevosita taqqoslamang. Patch natijaga sabab bo‘lganini bu tarixning o‘zi isbotlamaydi.</p>`;
    }
    compareCard(heroId, result, snapshot) {
      const hero = this.heroById(heroId);
      const payload = result.status === 'fulfilled' ? result.value : null;
      const detail = payload?.data;
      const row = snapshot?.data?.eclipse?.find(item => Number(item.heroId) === heroId);
      return `<article class="meta-compare-card"><header>${this.imageMarkup(hero)}<h4>${this.escape(hero.name)}</h4><span>${this.escape(row?.tier || 'Tier yo‘q')}</span></header><p>${this.escape([...(hero.roles || []), ...(hero.lanes || [])].join(' · '))}</p>${this.statsMarkup(row)}${this.favoriteButton(heroId)}<details><summary>Nega bu tier?</summary>${this.whyMarkup(row, snapshot)}</details><h5>Skills</h5><p class="meta-explore-note">${this.escape(this.freshnessMeta(payload).label)} · ${this.escape(this.formatDate(payload?.updatedAt))}</p>${detail?.skills?.length ? detail.skills.map(skill => `<section class="meta-compare-skill"><h6>${this.escape(skill.name)}</h6><p>${this.escape(skill.description)}</p>${skill.cooldownCost ? `<small>${this.escape(skill.cooldownCost)}</small>` : ''}</section>`).join('') : '<p>Skill ma’lumoti hozir mavjud emas.</p><button type="button" class="btn btn-sm btn-secondary" data-explore-action="retry">Qayta urinish</button>'}</article>`;
    }
    bindEvents() {
      super.bindEvents();
      if (!this.container) return;
      const original = this.container.onclick;
      this.container.onclick = event => {
        const target = event.target.closest('button');
        if (target?.dataset.exploreAction === 'share') return this.shareSelection(target);
        if (target?.dataset.exploreAction === 'retry') { this.clearCache(); return this.loadExplore(); }
        if (target?.dataset.watchId) return this.toggleWatch(Number(target.dataset.watchId));
        if (target?.dataset.openLens) { this.lensId = Number(target.dataset.openLens); this.currentView = 'lens'; return this.renderState(); }
        if (target?.dataset.lensRank) return this.selectRank(target.dataset.lensRank);
        if (target?.dataset.compareRemove) { this.compareIds = this.compareIds.filter(value => value !== Number(target.dataset.compareRemove)); return this.renderState(); }
        const result = original?.(event); this.syncShareUrl(); return result;
      };
      this.container.querySelector('[data-lens-select]')?.addEventListener('change', event => { this.lensId = id(event.target.value); this.renderState(); });
      this.container.querySelector('[data-compare-select]')?.addEventListener('change', event => {
        const value = id(event.target.value);
        if (!this.heroById(value)) return;
        if (this.compareIds.includes(value)) return;
        if (this.compareIds.length >= 3) { window.showToast?.('Ko‘pi bilan 3 qahramonni taqqoslang. Avval bittasini olib tashlang.'); event.target.value = ''; return; }
        this.compareIds.push(value); this.renderState();
      });
      this.container.querySelector('[data-watch-select]')?.addEventListener('change', event => {
        const value = id(event.target.value); if (value && !this.watchIds.includes(value)) this.toggleWatch(value);
      });
      this.container.querySelectorAll('#metaTierSearch, #metaHeroSearch').forEach(input => input.addEventListener('input', () => this.syncShareUrl()));
    }
    async openHeroDossier(heroId, ...args) {
      this.sharedHero = heroId; this.syncShareUrl();
      await super.openHeroDossier(heroId, ...args);
      const overlay = document.querySelector('.meta-dossier-overlay');
      if (!overlay || this.sharedHero !== heroId) return;
      overlay.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button?.dataset.watchId) this.toggleWatch(Number(button.dataset.watchId));
        if (button?.dataset.openLens) {
          this.lensId = Number(button.dataset.openLens); this.closeDossier(); this.currentView = 'lens'; this.renderState();
        }
      });
    }
    dossierMarkup(detail, status) {
      return super.dossierMarkup(detail, status).replace('<div class="meta-dossier-body">', `<div class="meta-dossier-explore">${this.favoriteButton(detail.id)}<button class="btn btn-secondary" type="button" data-open-lens="${Number(detail.id)}">Rank Lens · Tarix · Nega bu tier?</button></div><div class="meta-dossier-body">`);
    }
    closeDossier(options = {}) {
      super.closeDossier(options);
      if (options.restoreFocus !== false) { this.sharedHero = 0; this.syncShareUrl(); }
    }
  };
})();
