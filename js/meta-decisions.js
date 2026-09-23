(() => {
  const Base = window.MlbbDataManager, model = window.EclipseMetaDecisions;
  const quality = { stable: 'Barqaror kuzatuv', provisional: 'Dastlabki', borderline: 'Chegarada', stale: 'Eskirgan', unrated: 'Baholanmagan' };
  window.MlbbDataManager = class MetaDecisionsManager extends Base {
    constructor(...args) {
      super(...args);
      this.draftState = { allies: [], enemies: [], bans: [], lane: '', poolOnly: false };
      this.impactId = 0; this.impactWatchOnly = false; this.moverMetric = 'winPp';
    }
    extraViews() { return [...super.extraViews(), ['impact', 'fa-bolt', 'Patch Impact'], ['draft', 'fa-chess', 'Draft yordamchisi'], ['movers', 'fa-arrow-trend-up', 'Meta Movers']]; }
    statsMarkup(row) { return super.statsMarkup(row) + (row?.quality ? `<p class="meta-quality">${this.escape(quality[row.quality.status] || 'Dastlabki')} · match soni noma’lum</p>` : ''); }
    renderState(errors = []) {
      const focused = document.activeElement;
      const control = ['data-decision-view', 'data-impact-patch', 'data-impact-watch', 'data-mover-metric', 'data-draft-lane', 'data-draft-pool', 'data-draft-add'].find(name => focused?.hasAttribute(name));
      const group = focused?.getAttribute('data-draft-add');
      super.renderState(errors);
      const tabs = [...(this.container?.querySelectorAll('[data-meta-view]') || [])];
      this.container?.querySelector('.meta-lab-commandbar')?.insertAdjacentHTML('afterbegin', `<label class="meta-mobile-navigation">Meta Lab bo‘limi<select data-decision-view>${tabs.map(tab => `<option value="${this.escape(tab.dataset.metaView)}" ${this.currentView === tab.dataset.metaView ? 'selected' : ''}>${this.escape(tab.textContent)}</option>`).join('')}</select></label>`);
      this.container?.querySelector('[data-decision-view]')?.addEventListener('change', event => { this.currentView = event.target.value; this.renderState(); });
      if (control) this.container?.querySelector(control === 'data-draft-add' && ['allies', 'enemies', 'bans'].includes(group) ? `[data-draft-add="${group}"]` : `[${control}]`)?.focus({ preventScroll: true });
    }
    viewMarkup() {
      if (this.currentView === 'impact') return this.impactMarkup();
      if (this.currentView === 'draft') return this.draftMarkup();
      if (this.currentView === 'movers') return `<section class="meta-decision"><header><p class="section-eyebrow">KAMIDA 7 KUN ORALIQ</p><h3>Meta Movers</h3><p>Win, Pick va Ban qanday o‘zgardi? Har biri alohida ko‘rsatiladi.</p></header>${this.rankMarkup()}<label class="meta-decision-select">Ko‘rsatkich<select data-mover-metric>${[['winPp', 'Win'], ['pickPp', 'Pick'], ['banPp', 'Ban']].map(([value, name]) => `<option value="${value}" ${value === this.moverMetric ? 'selected' : ''}>${name}</option>`).join('')}</select></label><div data-decision-content aria-live="polite">${this.exploreLoading()}</div></section>`;
      return super.viewMarkup();
    }
    safePatchLink(value) {
      try { const url = new URL(value); return url.protocol === 'https:' && ['www.mobilelegends.com', 'mobilelegends.com'].includes(url.hostname) ? url.href : ''; } catch (_) { return ''; }
    }
    impactMarkup() {
      const patches = (this.state.patches?.data || []).filter(p => p.parsedAt);
      const patch = patches.find(p => Number(p.id) === this.impactId) || patches.find(p => p.classification === 'official-release') || patches[0];
      if (patch) this.impactId = Number(patch.id);
      const changes = (patch?.heroAdjustments || []).filter(item => !this.impactWatchOnly || this.watchIds.includes(Number(item.heroId)));
      const source = this.safePatchLink(patch?.officialUrl);
      return `<section class="meta-decision"><header><p class="section-eyebrow">MANBA MATNI / PROGNOZ EMAS</p><h3>Patch Impact</h3><p>Qaysi hero va skill o‘zgarganini rasmiy patch matnidan ko‘ring. Bu Win oshishini bashorat qilmaydi.</p></header><div class="meta-decision-controls"><label>Patch<select data-impact-patch>${patches.map(p => `<option value="${Number(p.id)}" ${p === patch ? 'selected' : ''}>${this.escape(p.title)}${p.classification === 'preview' ? ' · PREVIEW' : ''}</option>`).join('')}</select></label><label class="meta-decision-check"><input type="checkbox" data-impact-watch ${this.impactWatchOnly ? 'checked' : ''}> Faqat kuzatuv ro‘yxatim</label></div>${!patch ? '<p class="meta-explore-empty">Tahlil qilingan patch hali yo‘q. Patch Radar’ni tekshiring.</p>' : `<p class="meta-explore-note">${patch.classification === 'preview' ? 'PREVIEW / Advanced Server — live o‘yinga tatbiq etilgan deb hisoblamang.' : patch.classification === 'official-release' ? 'Rasmiy release patch.' : 'Patch yangilanishi — live versiyasini manbadan tekshiring.'} ${this.escape(this.formatDate(patch.publishedAt))} · ${this.escape(this.freshnessMeta(this.state.patches).label)}. Parser qisman: ro‘yxatda yo‘qligi “o‘zgarmadi” degani emas.</p>${source ? `<a class="btn btn-secondary" href="${this.escape(source)}" target="_blank" rel="noopener noreferrer">Rasmiy patch ↗</a>` : ''}<div class="meta-impact-list">${changes.map(item => `<article class="meta-impact-item"><header><button type="button" class="btn btn-secondary" data-hero-id="${Number(item.heroId)}">${this.escape(item.heroName)}</button><span class="meta-change-label is-${['buff', 'nerf'].includes(item.change) ? item.change : 'adjustment'}">${this.escape(({ buff: 'Buff ↑', nerf: 'Nerf ↓', adjustment: 'O‘zgartirish ↔' })[item.change] || 'O‘zgartirish')}</span></header><p>${this.escape(item.summary || 'Manbada alohida izoh aniqlanmadi.')}</p>${item.changes?.length ? `<details><summary>Skill va raqamli o‘zgarishlar · ${item.changes.length}</summary>${item.changes.map(c => `<blockquote>${c.skill ? `<strong>${this.escape(c.skill)}</strong>` : ''}<p>${this.escape(c.text)}</p></blockquote>`).join('')}</details>` : '<small>Tafsilotlar hali saqlanmagan. Rasmiy patchni oching; keyingi sync parserni yangilaydi.</small>'}</article>`).join('') || '<p class="meta-explore-empty">Bu tanlovda avtomatik aniqlangan hero o‘zgarishi yo‘q. To‘liq patchni tekshiring.</p>'}</div>`}</section>`;
    }
    draftMarkup() {
      const s = this.draftState;
      const group = (key, title, max) => `<fieldset><legend>${title} <small>${s[key].length}/${max}</small></legend>${this.heroSelect(`data-draft-add="${key}"`, 0, `${title}: hero tanlash`)}<div class="meta-draft-chips">${s[key].map(id => `<button type="button" class="btn btn-secondary" data-draft-remove="${key}:${id}" aria-label="${this.escape(this.heroById(id)?.name)} ni olib tashlash">${this.escape(this.heroById(id)?.name || `#${id}`)} ×</button>`).join('')}</div></fieldset>`;
      return `<section class="meta-decision"><header><p class="section-eyebrow">SHORTLIST / G‘ALABA FOIZI EMAS</p><h3>Draft yordamchisi</h3><p>Avval layn qamrovi, keyin mavjud matchup signallari, so‘ng shu rankdagi Eclipse draft balli (Win + Pick + Ban) bo‘yicha tartiblanadi.</p></header>${this.rankMarkup()}<div class="meta-draft-groups">${group('allies', 'Bizning picklar', 5)}${group('enemies', 'Raqib picklari', 5)}${group('bans', 'Banlar', 10)}</div><div class="meta-decision-controls"><label>Kerakli layn<select data-draft-lane><option value="">Barcha laynlar</option>${model.lanes.map(l => `<option ${s.lane === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${!this.publicEntry && this.db?.getActivePlayers ? `<label class="meta-decision-check"><input type="checkbox" data-draft-pool ${s.poolOnly ? 'checked' : ''}> Jamoaning ishonchli/zaxira hero pooli</label>` : ''}<button type="button" class="btn btn-secondary" data-draft-reset>Draftni tozalash</button></div><p data-draft-message role="status"></p><div data-decision-content aria-live="polite">${this.exploreLoading()}</div><p class="meta-explore-note">Matchup — kuzatilgan bog‘liqlik, kafolat emas. Katalog laynlari barcha tarkib xususiyatlarini qamramaydi. Draft sessiyada qoladi; havolaga va serverga saqlanmaydi.</p></section>`;
    }
    async loadExplore() {
      const generation = this.decisionGeneration = (this.decisionGeneration || 0) + 1;
      if (!['draft', 'movers'].includes(this.currentView)) return super.loadExplore();
      const target = this.container?.querySelector('[data-decision-content]'); if (!target) return;
      const rank = this.selectedRank, active = () => generation === this.decisionGeneration && target.isConnected && this.selectedRank === rank;
      try {
        if (this.currentView === 'movers') {
          const payload = await this.cachedRequest(`movers:${rank}:7`, `/api/mlbb-meta?view=movers&rank=${rank}&days=7`);
          if (active()) target.innerHTML = this.moversMarkup(payload.data); return;
        }
        const s = { ...this.draftState, allies: [...this.draftState.allies], enemies: [...this.draftState.enemies], bans: [...this.draftState.bans] };
        if (s.allies.length >= 5) { target.innerHTML = '<p class="meta-explore-empty">Beshta pick tanlandi. Yangi tavsiya uchun bittasini olib tashlang.</p>'; return; }
        const ids = [...s.allies, ...s.enemies];
        const results = await Promise.allSettled(ids.map(id => this.cachedRequest(`detail:${id}:${rank}:7`, `/api/mlbb-heroes?id=${id}&rank=${rank}&days=7`)));
        if (!active()) return;
        const details = Object.fromEntries(ids.map((id, i) => [id, results[i].status === 'fulfilled' ? results[i].value : null]));
        const pool = !this.publicEntry && s.poolOnly ? [...new Set((this.db?.getActivePlayers?.() || []).flatMap(p => (p.heroPool || []).filter(h => ['comfort', 'backup'].includes(h.status)).map(h => Number(h.heroId))))] : null;
        const catalog = (this.state.heroes?.data || []).map(h => details[h.id]?.data?.id === h.id && details[h.id].data.lanes?.length ? { ...h, lanes: details[h.id].data.lanes } : h);
        if (this.rankLoading || this.state.meta?.data?.rank !== rank) { target.innerHTML = '<p role="status">Tanlangan rank ma’lumoti kutilmoqda. Yuklanmasa, qayta urining.</p>'; return; }
        const suggestions = model.draft({ catalog, rows: this.state.meta?.data?.eclipse || [], ...s, pool, details, rank });
        const coverage = model.coverage(s.allies.map(id => catalog.find(h => Number(h.id) === id))), laneCount = catalog.filter(h => model.heroLanes(h).length).length;
        target.innerHTML = `<p class="meta-explore-note">${this.escape(this.rankLabel(rank))} · ${this.escape(this.formatDate(this.state.meta?.updatedAt))} · ${this.escape(this.freshnessMeta(this.state.meta).label)}. Layn qamrovi: ${coverage.covered.length}/5. Layn ma’lumoti ${laneCount}/${catalog.length} hero uchun mavjud; noma’lumlar layn filtrida chiqarilmaydi.</p>${results.some(r => r.status === 'rejected') ? '<p role="status">Ayrim matchup manbalari yuklanmadi. Mavjud ma’lumot bilan davom etildi.</p>' : ''}<div class="meta-draft-results">${suggestions.map(item => `<article><header>${this.imageMarkup(item.hero)}<button type="button" class="btn btn-secondary" data-hero-id="${Number(item.hero.id)}">${this.escape(item.hero.name)}</button><span>${this.escape(item.row?.tier || 'U')}</span></header><p>Win ${this.formatRate(item.row?.winRate)} · Pick ${this.formatRate(item.row?.pickRate, 3)} · Ban ${this.formatRate(item.row?.banRate)}</p><p class="meta-quality">${this.escape(quality[item.row?.quality?.status] || 'Dastlabki')}</p><ul>${item.reasons.map(r => `<li>${this.escape(r)}</li>`).join('')}${item.risks.map(r => `<li class="meta-draft-risk">${this.escape(r)}</li>`).join('')}</ul><small>${item.availableMatchups}/${ids.length} tanlangan hero uchun yangi, mos rankdagi matchup manbasi. Signal yo‘qligi “counter yo‘q” degani emas.</small><button type="button" class="btn btn-sm btn-secondary" data-draft-pick="${Number(item.hero.id)}">Bizning pickka qo‘shish</button></article>`).join('') || '<p class="meta-explore-empty">Mos hero yo‘q. Layn, pool yoki banlarni o‘zgartiring.</p>'}</div>`;
      } catch (_) { if (active()) target.innerHTML = '<p role="alert">Ma’lumot yuklanmadi.</p><button type="button" class="btn btn-secondary" data-explore-action="retry">Qayta urinish</button>'; }
    }
    moversMarkup(data) {
      if (!data?.available) return `<p class="meta-explore-empty">${this.escape(data?.reason || 'Tarix yetarli emas.')}</p>`;
      const metric = ['winPp', 'pickPp', 'banPp'].includes(this.moverMetric) ? this.moverMetric : 'winPp', threshold = { winPp: .5, pickPp: .1, banPp: 1 }[metric];
      const rows = (data.rows || []).filter(r => Number.isFinite(r[metric]) && Math.abs(r[metric]) >= threshold).sort((a, b) => Math.abs(b[metric]) - Math.abs(a[metric]));
      return `<p class="meta-explore-note">${this.escape(this.formatDate(data.previousAt))} → ${this.escape(this.formatDate(data.latestAt))}${data.stale ? ' · ESKIRGAN NUSXA' : ''}. ${this.escape(data.note)}</p><p>Ko‘rsatish chegarasi: ${threshold} pp — statistik ahamiyat chegarasi emas. ${Number(data.excludedCount) || 0} hero to‘liq solishtirilmagan.${!data.comparableTiers ? ' Patch yoki usul mos emas/noma’lum: tier sakrashi ko‘rsatilmaydi.' : ''}</p><div class="meta-movers-list">${rows.map(r => `<article><button type="button" class="btn btn-secondary" data-hero-id="${Number(r.heroId)}">${this.escape(r.name)}</button><strong class="${r[metric] > 0 ? 'is-up' : 'is-down'}">${r[metric] > 0 ? '+' : ''}${r[metric].toFixed(2)} pp</strong><span>${metric.replace('Pp', '')} ${this.formatRate(r.before?.[metric.replace('Pp', 'Rate')])} → ${this.formatRate(r.after?.[metric.replace('Pp', 'Rate')])}</span>${r.previousTier && r.tier ? `<small>${this.escape(r.previousTier)} → ${this.escape(r.tier)}</small>` : ''}</article>`).join('') || '<p class="meta-explore-empty">Chegaradan katta o‘zgarish yo‘q.</p>'}</div>`;
    }
    addDraft(group, value) {
      const id = Number(value), s = this.draftState;
      if (!['allies', 'enemies', 'bans'].includes(group) || !this.heroById(id)) return;
      const message = [...s.allies, ...s.enemies, ...s.bans].includes(id) ? 'Bu hero allaqachon pick yoki ban qilingan.' : s[group].length >= (group === 'bans' ? 10 : 5) ? 'Bu guruh to‘ldi. Avval bittasini olib tashlang.' : '';
      if (message) { const target = this.container.querySelector('[data-draft-message]'); if (target) target.textContent = message; return; }
      s[group].push(id); this.renderState();
    }
    bindEvents() {
      super.bindEvents(); if (!this.container) return;
      const original = this.container.onclick;
      this.container.onclick = event => {
        const button = event.target.closest('button');
        if (button?.hasAttribute('data-draft-reset')) { this.draftState = { allies: [], enemies: [], bans: [], lane: '', poolOnly: false }; return this.renderState(); }
        if (button?.dataset.draftPick) return this.addDraft('allies', button.dataset.draftPick);
        if (button?.dataset.draftRemove) { const [group, id] = button.dataset.draftRemove.split(':'); if (['allies', 'enemies', 'bans'].includes(group)) this.draftState[group] = this.draftState[group].filter(v => v !== Number(id)); return this.renderState(); }
        return original?.(event);
      };
      const on = (selector, fn) => this.container.querySelector(selector)?.addEventListener('change', fn);
      on('[data-impact-patch]', e => { this.impactId = Number(e.target.value); this.renderState(); });
      on('[data-impact-watch]', e => { this.impactWatchOnly = e.target.checked; this.renderState(); });
      on('[data-mover-metric]', e => { this.moverMetric = e.target.value; this.renderState(); });
      on('[data-draft-lane]', e => { this.draftState.lane = e.target.value; this.renderState(); });
      on('[data-draft-pool]', e => { this.draftState.poolOnly = e.target.checked; this.renderState(); });
      this.container.querySelectorAll('[data-draft-add]').forEach(select => select.addEventListener('change', e => this.addDraft(select.dataset.draftAdd, e.target.value)));
    }
  };
})();
