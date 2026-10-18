(() => {
  const Base = window.MlbbDataManager;
  const tiers = ['SS', 'S', 'A', 'B', 'C', 'D', 'U'];
  const ranks = { epic: 'Epic', legend: 'Legend', mythic: 'Mythic', glory: 'Mythical Glory+' };
  const colors = { SS: '#f5a623', S: '#b84040', A: '#cf9537', B: '#2f857e', C: '#4a5c75', D: '#43494e', U: '#848484' };
  const tierDescriptions = Object.freeze({
    SS: { en: 'Must ban or 1st pick heroes', uz: 'Majburiy ban yoki 1-pick qahramonlar' },
    S:  { en: 'Strong heroes. 1st pick or 2nd pick', uz: 'Kuchli qahramonlar. 1- yoki 2-pick' },
    A:  { en: 'Good heroes. Safe picks, work well in teams', uz: 'Yaxshi qahramonlar. Xavfsiz tanlov, jamoada yaxshi ishlaydi' },
    B:  { en: 'Okay heroes. Useful if played well or for special plans', uz: 'O‘rtacha qahramonlar. Yaxshi o‘ynalsa yoki maxsus rejalar uchun' },
    C:  { en: 'Weaker heroes. Only good in very specific situations', uz: 'Kuchsizroq qahramonlar. Faqat juda maxsus vaziyatlarda yaxshi' },
    D:  { en: 'Weakest heroes. Better to pick others', uz: 'Eng kuchsiz qahramonlar. Boshqalarni tanlagan ma’qul' },
    U:  { en: 'Unrated heroes. Insufficient match data', uz: 'Baholanmagan. Ma’lumot yetarli emas' }
  });
  const EXPORT_LIMIT_MS = 60000, PORTRAIT_LIMIT_MS = 45000;
  const cancellationMessage = 'Eksport bekor qilindi. Yuklangan portretlar keyingi urinish uchun saqlandi.';
  function abortable(promise, signal) {
    return new Promise((resolve, reject) => {
      const aborted = () => reject(signal.reason || new Error(cancellationMessage));
      const cleanup = () => signal.removeEventListener('abort', aborted);
      Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      if (signal.aborted) aborted();
      else signal.addEventListener('abort', aborted, { once: true });
    });
  }
  window.MlbbDataManager = class TierBoardManager extends Base {
    rankLabel(rank) { return ranks[rank] || rank; }
    rankMarkup() {
      return `<nav class="meta-rank-picker" aria-label="MLBB rank"><span>Rank</span>${Object.entries(ranks).map(([rank, label]) => `<button type="button" class="btn btn-sm ${rank === this.selectedRank ? 'btn-primary' : 'btn-secondary'}" data-meta-rank="${rank}" aria-pressed="${rank === this.selectedRank}" ${this.exporting ? 'disabled' : ''}>${label}</button>`).join('')}</nav>`;
    }
    tierDescription(tier) {
      return tierDescriptions[tier] || { en: tier, uz: tier };
    }
    heroMovement(id, hero = null, meta = this.state.meta) {
      const change = meta?.data?.comparison?.changes?.find(row => Number(row.heroId) === Number(id));
      if (change) {
        if (typeof change.rankDelta === 'number' && change.rankDelta !== 0) {
          return {
            direction: change.rankDelta > 0 ? 'up' : 'down',
            delta: Math.abs(change.rankDelta),
            label: change.rankDelta > 0 ? `+${change.rankDelta} o‘rin ko‘tarildi` : `${change.rankDelta} o‘rin pasaydi`
          };
        }
        if (change.previousTier && change.tier && change.previousTier !== change.tier) {
          const tierOrder = { SS: 6, S: 5, A: 4, B: 3, C: 2, D: 1, U: 0 };
          const diff = (tierOrder[change.tier] || 0) - (tierOrder[change.previousTier] || 0);
          if (diff !== 0) {
            return {
              direction: diff > 0 ? 'up' : 'down',
              delta: Math.abs(diff),
              label: diff > 0 ? `${change.previousTier} dan ${change.tier} ga ko‘tarildi` : `${change.previousTier} dan ${change.tier} ga tushdi`
            };
          }
        }
        if (change.isNew) {
          return { direction: 'up', delta: 0, label: 'Yangi kiritildi' };
        }
      }
      if (hero) {
        if (typeof hero.rankDelta === 'number' && hero.rankDelta !== 0) {
          return {
            direction: hero.rankDelta > 0 ? 'up' : 'down',
            delta: Math.abs(hero.rankDelta),
            label: hero.rankDelta > 0 ? `+${hero.rankDelta} o‘rin ko‘tarildi` : `${hero.rankDelta} o‘rin pasaydi`
          };
        }
        if (hero.trend === 'up' || hero.trend === 'rising') {
          return { direction: 'up', delta: hero.delta || 1, label: 'Ko‘tarilmoqda' };
        }
        if (hero.trend === 'down' || hero.trend === 'falling') {
          return { direction: 'down', delta: hero.delta || 1, label: 'Tushmoqda' };
        }
      }
      return null;
    }
    movementIconSvg(direction) {
      if (direction === 'up') {
        return `<svg class="solar-tier-hero__movement-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7l4-4 4 4"/><path d="M4 12l4-4 4 4"/></svg>`;
      }
      return `<svg class="solar-tier-hero__movement-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l4 4 4-4"/><path d="M4 9l4 4 4-4"/></svg>`;
    }
    async selectRank(rank) {
      if (!ranks[rank] || this.exporting) return;
      this.selectedRank = rank;
      const generation = this.metaLoadGeneration = (this.metaLoadGeneration || 0) + 1;
      this.state.meta = null; this.rankLoading = true; this.rankError = null;
      this.renderState();
      try {
        const payload = await this.getMeta();
        if (generation !== this.metaLoadGeneration) return;
        if (payload?.data?.rank !== rank) throw new Error('Manba tanlangan rankni qaytarmadi. Qayta urinib ko‘ring.');
        this.state.meta = payload;
      } catch (error) { if (generation === this.metaLoadGeneration) this.rankError = error.message; }
      finally { if (generation === this.metaLoadGeneration) { this.rankLoading = false; this.renderState(); } }
    }
    tierRows() { return [...(this.state.meta?.data?.eclipse || [])].sort((a, b) => (a.eclipseRank ?? Infinity) - (b.eclipseRank ?? Infinity)); }
    qualityText(row) { return ({ stable: 'Barqaror', provisional: 'Dastlabki', borderline: 'Chegarada', stale: 'Eskirgan', unrated: 'Baholanmagan' })[row.quality?.status] || ''; }
    changeText(id, meta = this.state.meta) {
      const change = meta?.data?.comparison?.changes?.find(row => Number(row.heroId) === Number(id));
      if (!change) return '';
      if (change.isNew) return 'Yangi';
      if (change.previousTier !== change.tier) return `${change.previousTier} → ${change.tier}`;
      return change.rankDelta ? `${change.rankDelta > 0 ? '↑' : '↓'} ${Math.abs(change.rankDelta)} o‘rin` : '';
    }
    tierMarkup() {
      const picker = this.rankMarkup();
      const rows = this.tierRows();
      if (!rows.length) return picker + (this.rankLoading ? `<p role="status">${this.escape(this.rankLabel(this.selectedRank))} statistikasi yuklanmoqda…</p>` : this.rankError ? `<p role="alert">${this.escape(this.rankError)}</p>` : super.tierMarkup());
      const mode = this.tierDisplay || 'board';
      const comparison = this.state.meta?.data?.comparison;
      const toolbar = `<div class="tier-view-toolbar"><div role="group" aria-label="Tier ko‘rinishi"><button type="button" class="btn btn-sm ${mode === 'board' ? 'btn-primary' : 'btn-secondary'}" data-tier-view="board" aria-pressed="${mode === 'board'}">Tier board</button><button type="button" class="btn btn-sm ${mode === 'table' ? 'btn-primary' : 'btn-secondary'}" data-tier-view="table" aria-pressed="${mode === 'table'}">Raqamli jadval</button></div><div class="tier-toolbar-actions"><button type="button" class="btn btn-sm ${this.highlightMovements ? 'btn-primary' : 'btn-secondary'}" data-tier-highlight-movements aria-pressed="${Boolean(this.highlightMovements)}">${this.movementIconSvg('up')} O‘sishlarni ajratish</button><button type="button" class="btn btn-secondary" data-tier-export>PNG yuklash · barcha hero</button><button type="button" class="btn btn-secondary" data-tier-export-cancel ${this.exporting ? '' : 'hidden'}>Eksportni bekor qilish</button></div></div>`;
      const exportStatus = `<div class="tier-export-status" role="status" aria-live="polite">${this.exporting ? this.escape(this.exportProgress || 'PNG tayyorlanmoqda…') : this.exportedPoster?.rank === this.selectedRank ? `<a class="btn btn-secondary" href="${this.escape(this.exportedPoster.url)}" download="${this.escape(this.exportedPoster.filename)}">${this.escape(this.rankLabel(this.selectedRank))} · Tayyor PNG faylni yuklash</a>` : ''}</div>`;
      const table = super.tierMarkup();
      if (mode === 'table') return picker + toolbar + exportStatus + table;
      return `${picker}${toolbar}${exportStatus}<section class="solar-tier-board${this.highlightMovements ? ' is-highlighting-movements' : ''}"><header><p class="section-eyebrow">ECLIPSE / META ATLAS</p><h3>${this.escape(this.rankLabel(this.selectedRank))} meta tier list</h3><p>${this.escape(this.rankLabel(this.state.meta?.data?.rank || ''))} · ${Number(this.state.meta?.data?.days) || 1} kun · ${this.escape(this.state.meta?.updatedAt ? new Date(this.state.meta.updatedAt).toLocaleString('uz-UZ') : 'Sana noma’lum')}</p><p>Eclipse tajribaviy tierlari — Moonton rasmiy bahosi emas. ${this.escape(this.tierSummary(this.state.meta))}</p><small>${comparison ? `O‘zgarishlar ${this.escape(new Date(comparison.previousUpdatedAt).toLocaleString('uz-UZ'))} dagi snapshotga nisbatan.` : 'Taqqoslash uchun oldingi mos snapshot hali yo‘q.'}</small></header>
        ${tiers.map(tier => {
          const desc = this.tierDescription(tier);
          const tierHeroes = rows.filter(h => h.tier === tier);
          return `<section class="solar-tier-row" aria-label="${tier} tier" title="${this.escape(desc.en)} · ${this.escape(desc.uz)}"><div class="solar-tier-label is-${tier.toLowerCase()}"><span class="solar-tier-info" tabindex="0" role="button" aria-label="${tier} tier tavsifi" title="${this.escape(desc.en)} · ${this.escape(desc.uz)}"><i class="solar-tier-info-icon" aria-hidden="true">i</i><span class="solar-tier-tooltip" role="tooltip"><strong class="solar-tier-tooltip__title">${tier} Tier</strong><span class="solar-tier-tooltip__en">${this.escape(desc.en)}</span><small class="solar-tier-tooltip__uz">${this.escape(desc.uz)}</small></span></span><strong>${tier}</strong><small>${tierHeroes.length} HERO</small></div><div class="solar-tier-heroes">${tierHeroes.map(h => {
            const lanes = this.heroLanes(h);
            const lanesLabels = this.heroLanesLabels(h);
            const lanesTitle = lanesLabels.length ? lanesLabels.join(' / ') : '';
            const movement = this.heroMovement(h.heroId, h);
            const isRising = movement?.direction === 'up';
            const isFalling = movement?.direction === 'down';
            const movementBadge = movement ? `<span class="solar-tier-hero__movement is-${movement.direction}" title="${this.escape(movement.label)}" aria-label="${this.escape(movement.label)}">${this.movementIconSvg(movement.direction)}</span>` : '';
            return `<button type="button" class="solar-tier-hero ${isRising ? 'is-rising' : ''} ${isFalling ? 'is-falling' : ''}" data-hero-id="${Number(h.heroId)}" data-lane="${this.escape(lanes.join(' '))}" data-movement="${movement ? movement.direction : 'none'}" title="${this.escape(h.name)}${lanesTitle ? ' · ' + this.escape(lanesTitle) : ''}${movement ? ' · ' + this.escape(movement.label) : ''} · ${h.eclipseScore == null ? 'Baholanmagan' : Number(h.eclipseScore).toFixed(2)}"><span class="solar-tier-hero__portrait">${this.imageMarkup(h.image ? h : { ...h, image: this.heroById(h.heroId)?.images?.portrait })}${movementBadge}${this.laneBadgeMarkup(h)}</span><strong>${this.escape(h.name)}</strong><small>${this.escape(this.qualityText(h) || this.changeText(h.heroId))}</small></button>`;
          }).join('')}</div></section>`;
        }).join('')}
        <footer>${rows.length} hero · SS / S / A / B / C / D; U = baholanmagan. Majburiy kvota yo‘q; SS bo‘sh bo‘lishi mumkin.<br>Hero ustiga bosing: skills va counters. Yuqori rank yoki SS tier statistik ishonchlilik va g‘alaba kafolati emas.</footer></section>`;
    }
    bindEvents() {
      super.bindEvents();
      this.container?.querySelectorAll('[data-meta-rank]').forEach(button => { button.onclick = event => { event.stopPropagation(); this.selectRank(button.dataset.metaRank); }; });
      this.container?.querySelectorAll('[data-tier-view]').forEach(button => { button.onclick = event => { event.stopPropagation(); this.tierDisplay = button.dataset.tierView; this.renderState(); }; });
      const highlightBtn = this.container?.querySelector('[data-tier-highlight-movements]'); if (highlightBtn) highlightBtn.onclick = event => { event.stopPropagation(); this.highlightMovements = !this.highlightMovements; this.renderState(); };
      const button = this.container?.querySelector('[data-tier-export]'); if (button) button.onclick = event => { event.stopPropagation(); this.exportTierPng(button); };
      const cancel = this.container?.querySelector('[data-tier-export-cancel]'); if (cancel) cancel.onclick = event => { event.stopPropagation(); this.cancelTierExport(); };
      this.updateExportControls();
      this.bindHeroQuickPreview();
    }
    bindHeroQuickPreview() {
      if (!this.container || typeof document === 'undefined') return;
      const heroes = this.container.querySelectorAll('.solar-tier-hero');
      if (!heroes.length) return;

      const clearPreview = () => {
        if (this._previewTimer) {
          clearTimeout(this._previewTimer);
          this._previewTimer = null;
        }
        document.querySelectorAll('.solar-hero-popover').forEach(el => el.remove());
        this.container?.querySelectorAll('.solar-tier-hero').forEach(el => {
          el.classList.remove('is-synergy-match', 'is-counter-match', 'is-hovered');
        });
        this.container?.querySelector('.solar-tier-board')?.classList.remove('has-match-highlight');
      };

      heroes.forEach(btn => {
        btn.addEventListener('pointerenter', (event) => {
          if (event.pointerType === 'touch') return;
          clearPreview();
          const heroId = Number(btn.dataset.heroId);
          if (!heroId) return;
          btn.classList.add('is-hovered');
          this._previewTimer = setTimeout(() => {
            this.showHeroPopover(btn, heroId);
          }, 200);
        });

        btn.addEventListener('pointerleave', (event) => {
          if (event.pointerType === 'touch') return;
          clearPreview();
        });

        btn.addEventListener('focusin', () => {
          clearPreview();
          const heroId = Number(btn.dataset.heroId);
          if (heroId) {
            btn.classList.add('is-hovered');
            this.showHeroPopover(btn, heroId);
          }
        });

        btn.addEventListener('focusout', () => {
          clearPreview();
        });

        btn.addEventListener('click', () => {
          clearPreview();
        });
      });
    }
    showHeroPopover(btn, heroId) {
      if (typeof document === 'undefined' || !btn) return;
      const rows = this.tierRows();
      const heroRow = rows.find(r => Number(r.heroId) === Number(heroId));
      const catalogHero = this.heroById(heroId) || {};
      const hero = heroRow || catalogHero;
      if (!hero || (!hero.name && !catalogHero.name)) return;

      const heroName = hero.name || catalogHero.name;
      const tier = heroRow?.tier || '—';
      const winRate = heroRow?.winRate != null ? this.formatRate(heroRow.winRate) : '—';
      const pickRate = heroRow?.pickRate != null ? this.formatRate(heroRow.pickRate, 3) : '—';
      const banRate = heroRow?.banRate != null ? this.formatRate(heroRow.banRate, 2) : '—';
      const score = heroRow?.eclipseScore != null ? Number(heroRow.eclipseScore).toFixed(2) : '—';

      const lanes = this.heroLanes(hero);
      const laneIcons = lanes.map(l => this.laneIconSvg(l)).join('');

      // Relations
      const relations = catalogHero.relations || {};
      const synergies = Array.isArray(relations.synergies) ? relations.synergies.map(Number).filter(id => id > 0) : [];
      const weakAgainst = Array.isArray(relations.weakAgainst) ? relations.weakAgainst.map(Number).filter(id => id > 0) : [];

      // Highlight on board
      if (synergies.length || weakAgainst.length) {
        this.container?.querySelector('.solar-tier-board')?.classList.add('has-match-highlight');
        synergies.forEach(sId => {
          this.container?.querySelector(`.solar-tier-hero[data-hero-id="${sId}"]`)?.classList.add('is-synergy-match');
        });
        weakAgainst.forEach(cId => {
          this.container?.querySelector(`.solar-tier-hero[data-hero-id="${cId}"]`)?.classList.add('is-counter-match');
        });
      }

      const getHeroChip = (id) => {
        const h = this.heroById(id) || rows.find(r => Number(r.heroId) === id);
        return h ? `<span class="solar-hero-popover__chip">${this.escape(h.name)}</span>` : '';
      };

      const synergyChips = synergies.slice(0, 3).map(getHeroChip).filter(Boolean).join('');
      const counterChips = weakAgainst.slice(0, 3).map(getHeroChip).filter(Boolean).join('');

      const popover = document.createElement('div');
      popover.className = 'solar-hero-popover';
      popover.setAttribute('role', 'tooltip');
      popover.setAttribute('aria-hidden', 'true');

      popover.innerHTML = `
        <div class="solar-hero-popover__head">
          <div class="solar-hero-popover__avatar">
            ${this.imageMarkup(catalogHero.images?.portrait ? catalogHero : hero)}
          </div>
          <div class="solar-hero-popover__info">
            <h4 class="solar-hero-popover__name">${this.escape(heroName)}</h4>
            <div class="solar-hero-popover__tags">
              <span class="solar-hero-popover__tier is-${tier.toLowerCase()}">${this.escape(tier)}</span>
              <div class="solar-hero-popover__lanes">${laneIcons}</div>
            </div>
          </div>
        </div>
        <dl class="solar-hero-popover__stats">
          <div class="solar-hero-popover__stat"><dt>Win</dt><dd>${winRate}</dd></div>
          <div class="solar-hero-popover__stat"><dt>Pick</dt><dd>${pickRate}</dd></div>
          <div class="solar-hero-popover__stat"><dt>Ban</dt><dd>${banRate}</dd></div>
          <div class="solar-hero-popover__stat is-gold"><dt>Score</dt><dd>${score}</dd></div>
        </dl>
        ${(synergyChips || counterChips) ? `
          <div class="solar-hero-popover__relations">
            ${synergyChips ? `<div class="solar-hero-popover__rel-row"><span class="solar-hero-popover__rel-label is-synergy">Synergy</span><div class="solar-hero-popover__rel-chips">${synergyChips}</div></div>` : ''}
            ${counterChips ? `<div class="solar-hero-popover__rel-row"><span class="solar-hero-popover__rel-label is-counter">Counter</span><div class="solar-hero-popover__rel-chips">${counterChips}</div></div>` : ''}
          </div>
        ` : ''}
        <small class="solar-hero-popover__tip"><i class="fa-solid fa-arrow-pointer" aria-hidden="true"></i> To‘liq dosye va skilllar uchun bosing</small>
      `;

      document.body.appendChild(popover);

      // Position
      if (typeof btn.getBoundingClientRect === 'function') {
        const rect = btn.getBoundingClientRect();
        const popoverWidth = 290;
        const popoverHeight = popover.offsetHeight || 190;
        let top = rect.top - popoverHeight - 10;
        if (top < 10) {
          top = rect.bottom + 10;
        }
        let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
        const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
        left = Math.max(10, Math.min(winWidth - popoverWidth - 10, left));
        popover.style.top = `${Math.round(top)}px`;
        popover.style.left = `${Math.round(left)}px`;
      }
    }
    updateExportControls() {
      this.container?.querySelectorAll('[data-meta-rank], [data-tier-export], [data-tier-view]').forEach(control => { control.disabled = Boolean(this.exporting); });
      const cancel = this.container?.querySelector('[data-tier-export-cancel]');
      if (cancel) cancel.hidden = !this.exporting;
    }
    updateExportProgress(message) {
      this.exportProgress = message;
      const status = this.container?.querySelector('.tier-export-status');
      if (status) status.textContent = message;
      return status;
    }
    cancelTierExport() {
      if (!this.exportSession) return;
      this.exportSession.cancelled = true;
      this.exportSession.controller.abort(new Error(cancellationMessage));
    }
    async exportTierPng(button) {
      if (this.exporting) return;
      const rows = this.tierRows(); if (!rows.length) return;
      this.exporting = true;
      const session = this.exportSession = { controller: new AbortController(), portraits: new AbortController(), cancelled: false, stopReason: '' };
      const stopPortraits = () => session.portraits.abort(session.controller.signal.reason);
      session.controller.signal.addEventListener('abort', stopPortraits, { once: true });
      const deadline = setTimeout(() => session.controller.abort(new Error('Eksport 60 soniyadan oshdi. Yuklangan portretlar saqlandi; qayta urinib ko‘ring.')), EXPORT_LIMIT_MS);
      const portraitDeadline = setTimeout(() => {
        session.stopReason = 'Portretlarni yuklash vaqti tugadi.';
        session.portraits.abort(new Error(session.stopReason));
      }, PORTRAIT_LIMIT_MS);
      this.updateExportControls();
      this.updateExportProgress(`Portretlar: 0 / ${rows.length}`);
      button.disabled = true; const oldLabel = button.textContent; button.textContent = 'Portretlar yuklanmoqda…';
      try {
        const snapshot = structuredClone(this.state.meta);
        await abortable(document.fonts?.ready, session.controller.signal);
        const images = new Map(); const queue = [...rows]; let failures = 0;
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (queue.length && !session.portraits.signal.aborted) {
            const hero = queue.shift();
            try {
              images.set(Number(hero.heroId), await this.exportPortrait(hero, { signal: session.portraits.signal }));
            } catch (error) {
              if (!session.portraits.signal.aborted) {
                failures++;
                if ([401, 403, 429].includes(error.status) || (failures >= 6 && failures >= images.size)) {
                  session.stopReason = 'Portret manbasi javob bermadi; yuklash to‘xtatildi.';
                  session.portraits.abort(error);
                }
              }
            }
            this.updateExportProgress(`Portretlar: ${images.size} / ${rows.length}${failures ? ` · ${failures} ta yuklanmadi` : ''}`);
          }
        }));
        clearTimeout(portraitDeadline);
        if (session.controller.signal.aborted) throw session.controller.signal.reason;
        const missing = rows.filter(hero => !images.has(Number(hero.heroId))).map(hero => hero.name);
        if (missing.length && !window.confirm(`${session.stopReason ? session.stopReason + ' ' : ''}${missing.length} ta portret yuklanmadi: ${missing.join(', ')}. Ularning nomi va tieri saqlanadi, rasmi o‘rniga ? belgisi qo‘yiladi. Shunday PNG tayyorlansinmi?`)) {
          this.cancelTierExport();
          throw session.controller.signal.reason;
        }
        if (session.controller.signal.aborted) throw session.controller.signal.reason;
        this.updateExportProgress('PNG fayl tayyorlanmoqda…');
        const canvas = this.drawTierPoster(rows, images, snapshot);
        const blob = await abortable(new Promise(resolve => canvas.toBlob(resolve, 'image/png')), session.controller.signal);
        if (session.controller.signal.aborted) throw session.controller.signal.reason;
        if (!blob) throw new Error('PNG yaratilmadi. Qayta urinib ko‘ring.');
        if (this.exportedPoster) URL.revokeObjectURL(this.exportedPoster.url);
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = `Eclipse-tier-${snapshot.data.rank}-${snapshot.data.days}d-${(snapshot.updatedAt || new Date().toISOString()).slice(0, 10)}.png`;
        this.exportedPoster = { url, filename: link.download, rank: snapshot.data.rank };
        link.className = 'btn btn-secondary'; link.textContent = 'Tayyor PNG faylni yuklash';
        const status = this.updateExportProgress(`${rows.length} hero · PNG tayyor. `);
        if (status) status.append(link);
        else document.body.append(link);
        link.click();
        if (!status) link.remove();
        window.showToast?.(missing.length ? `PNG tayyor; ${missing.length} ta portret o‘rnida ? belgisi bor.` : 'Barcha tier va portretlar PNG faylga olindi.', 'success');
      } catch (error) { this.updateExportProgress(error.message); window.showToast?.(error.message, session.cancelled ? 'warning' : 'error'); }
      finally {
        clearTimeout(deadline); clearTimeout(portraitDeadline);
        session.controller.signal.removeEventListener('abort', stopPortraits);
        this.exporting = false; this.exportSession = null;
        button.disabled = false; button.textContent = oldLabel; this.updateExportControls();
      }
    }
    async exportPortrait(hero, options = {}) {
      this.portraitExportCache ||= new Map();
      const source = this.heroById(hero.heroId)?.images?.portrait || hero.image || '';
      const key = `${Number(hero.heroId)}:${source}`;
      const cached = this.portraitExportCache.get(key);
      if (cached && Date.now() - cached.at < 3_600_000) return cached.image;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (options.signal?.aborted) throw options.signal.reason;
        const controller = new AbortController();
        const cancel = () => controller.abort(options.signal.reason);
        options.signal?.addEventListener('abort', cancel, { once: true });
        const timeout = setTimeout(() => controller.abort(new Error('Portretni yuklash vaqti tugadi.')), 15000);
        try {
          const token = this.auth.getAccessToken();
          const response = await abortable(fetch(`/api/mlbb-image?id=${Number(hero.heroId)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal }), controller.signal);
          if (!response.ok) throw Object.assign(new Error('Portret mavjud emas'), { status: response.status });
          const url = URL.createObjectURL(await abortable(response.blob(), controller.signal));
          try {
            const image = new Image(); image.src = url; await abortable(image.decode(), controller.signal);
            this.portraitExportCache.set(key, { image, at: Date.now() });
            if (this.portraitExportCache.size > 200) this.portraitExportCache.delete(this.portraitExportCache.keys().next().value);
            return image;
          } finally { URL.revokeObjectURL(url); }
        } catch (error) { if (options.signal?.aborted || (error.status >= 400 && error.status < 500) || attempt === 1) throw error; }
        finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); }
      }
    }
    tierSummary(meta = this.state.meta) {
      const method = meta?.data?.methodology;
      const w = method?.weights;
      if (!w) return 'Hisob usuli tafsilotlarini tekshiring · Moonton rasmiy bahosi emas';
      return `Win ${Math.round(w.winRate * 100)}% · Pick ${Math.round(w.pickRate * 100)}% · Ban ${Math.round(w.banRate * 100)}% · Tier va kuzatuv sifati alohida`;
    }
    posterLayout(rows) {
      let y = 224;
      const bands = tiers.map(tier => { const heroes = rows.filter(row => row.tier === tier); const height = Math.max(1, Math.ceil(heroes.length / 10)) * 130 + 28; const band = { tier, heroes, y, height }; y += height + 14; return band; });
      return { width: 1400, height: y + 88, bands };
    }
    drawTierPoster(rows, images, meta = this.state.meta) {
      const layout = this.posterLayout(rows); const canvas = document.createElement('canvas');
      canvas.width = layout.width; canvas.height = layout.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0c0d0c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#efd17b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(75, 83, 31, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#efd17b'; ctx.beginPath(); ctx.arc(99, 61, 6, 0, 2 * Math.PI); ctx.fill();
      ctx.font = '600 34px Outfit, sans-serif'; ctx.fillStyle = '#f2f0e8'; ctx.fillText('ECLIPSE ESPORTS / META ATLAS', 133, 80);
      ctx.font = '20px Outfit, sans-serif'; ctx.fillStyle = '#b9b7aa';
      ctx.fillText(`${String(this.rankLabel(meta.data.rank) || '').toUpperCase()} · ${Number(meta.data.days) || 1} kun · ${meta.updatedAt || 'Sana noma’lum'}`, 133, 117);
      ctx.fillText('Eclipse tajribaviy draft tierlari · ' + this.tierSummary(meta), 40, 171, 1320);
      ctx.font = '17px Outfit, sans-serif'; ctx.fillText(meta.source?.provider || 'Rone Arena API / Mobile Legends rank data', 40, 199);
      for (const band of layout.bands) {
        ctx.fillStyle = '#151612'; ctx.fillRect(40, band.y, 1320, band.height);
        ctx.fillStyle = colors[band.tier]; ctx.fillRect(40, band.y, 100, band.height);
        ctx.font = '600 38px Outfit, sans-serif'; ctx.fillStyle = '#171712'; ctx.textAlign = 'center'; ctx.fillText(band.tier, 90, band.y + band.height / 2 + 12);
        band.heroes.forEach((hero, index) => {
          const x = 207 + (index % 10) * 119; const y = band.y + 54 + Math.floor(index / 10) * 130;
          const image = images.get(Number(hero.heroId));
          ctx.save(); ctx.beginPath(); ctx.arc(x, y, 36, 0, 2 * Math.PI); ctx.clip();
          if (image) { const side = Math.min(image.width, image.height); ctx.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, x - 36, y - 36, 72, 72); }
          else { ctx.fillStyle = '#33352f'; ctx.fillRect(x - 36, y - 36, 72, 72); ctx.fillStyle = '#efd17b'; ctx.font = '32px sans-serif'; ctx.fillText('?', x, y + 11); }
          ctx.restore(); ctx.strokeStyle = colors[band.tier]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 37, 0, 2 * Math.PI); ctx.stroke();
          ctx.fillStyle = '#f2f0e8'; ctx.font = '500 16px Outfit, sans-serif';
          const words = String(hero.name).split(' '); const lines = [''];
          for (const word of words) { const last = lines.length - 1; const text = (lines[last] + ' ' + word).trim(); if (ctx.measureText(text).width > 110 && lines[last]) lines.push(word); else lines[last] = text; }
          lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, x, y + 59 + i * 17, 110));
          ctx.fillStyle = colors[band.tier]; ctx.font = '13px Outfit, sans-serif'; ctx.fillText(this.qualityText(hero) || this.changeText(hero.heroId, meta), x, y + 96, 110);
        });
      }
      ctx.textAlign = 'left'; ctx.font = '17px Outfit, sans-serif'; ctx.fillStyle = '#aaa99e';
      const comparison = meta.data.comparison;
      ctx.fillText(comparison ? `O‘zgarishlar: ${comparison.previousUpdatedAt} snapshotiga nisbatan.` : 'Taqqoslash uchun oldingi mos snapshot yo‘q. O‘sish/pasayish taxmin qilinmaydi.', 40, layout.height - 50);
      ctx.fillText(`${rows.length} hero · ${rows.filter(hero => !images.has(Number(hero.heroId))).length} portret yetishmaydi · U: baholanmagan; barqarorlik ishonch emas · ${meta.data.methodology?.version || 'Eclipse tier'}`, 40, layout.height - 23);
      return canvas;
    }
  };
})();
