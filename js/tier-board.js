(() => {
  const Base = window.MlbbDataManager;
  const tiers = ['SS', 'S', 'A', 'B', 'C', 'D'];
  const ranks = { epic: 'Epic', legend: 'Legend', mythic: 'Mythic', glory: 'Mythical Glory+' };
  const colors = { SS: '#ffe9aa', S: '#efd17b', A: '#ce9456', B: '#9fab9e', C: '#9294a0', D: '#6c747b' };
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
    tierRows() { return [...(this.state.meta?.data?.eclipse || [])].sort((a, b) => a.eclipseRank - b.eclipseRank); }
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
      const toolbar = `<div class="tier-view-toolbar"><div role="group" aria-label="Tier ko‘rinishi"><button type="button" class="btn btn-sm ${mode === 'board' ? 'btn-primary' : 'btn-secondary'}" data-tier-view="board" aria-pressed="${mode === 'board'}">Tier board</button><button type="button" class="btn btn-sm ${mode === 'table' ? 'btn-primary' : 'btn-secondary'}" data-tier-view="table" aria-pressed="${mode === 'table'}">Raqamli jadval</button></div><button type="button" class="btn btn-secondary" data-tier-export>PNG yuklash · barcha hero</button><button type="button" class="btn btn-secondary" data-tier-export-cancel ${this.exporting ? '' : 'hidden'}>Eksportni bekor qilish</button></div>`;
      const exportStatus = `<div class="tier-export-status" role="status" aria-live="polite">${this.exporting ? this.escape(this.exportProgress || 'PNG tayyorlanmoqda…') : this.exportedPoster?.rank === this.selectedRank ? `<a class="btn btn-secondary" href="${this.escape(this.exportedPoster.url)}" download="${this.escape(this.exportedPoster.filename)}">${this.escape(this.rankLabel(this.selectedRank))} · Tayyor PNG faylni yuklash</a>` : ''}</div>`;
      const table = super.tierMarkup();
      if (mode === 'table') return picker + toolbar + exportStatus + table;
      return `${picker}${toolbar}${exportStatus}<section class="solar-tier-board"><header><p class="section-eyebrow">ECLIPSE / META ATLAS</p><h3>${this.escape(this.rankLabel(this.selectedRank))} meta tier list</h3><p>${this.escape(this.rankLabel(this.state.meta?.data?.rank || ''))} · ${Number(this.state.meta?.data?.days) || 1} kun · ${this.escape(this.state.meta?.updatedAt ? new Date(this.state.meta.updatedAt).toLocaleString('uz-UZ') : 'Sana noma’lum')}</p><p>Eclipse tajribaviy tierlari — Moonton rasmiy bahosi emas. Win 65% · Pick 20% · Ban 15%.</p><small>${comparison ? `O‘zgarishlar ${this.escape(new Date(comparison.previousUpdatedAt).toLocaleString('uz-UZ'))} dagi snapshotga nisbatan.` : 'Taqqoslash uchun oldingi mos snapshot hali yo‘q.'}</small></header>
        ${tiers.map(tier => `<section class="solar-tier-row" aria-label="${tier} tier"><div class="solar-tier-label is-${tier.toLowerCase()}"><strong>${tier}</strong><small>${rows.filter(h => h.tier === tier).length} HERO</small></div><div class="solar-tier-heroes">${rows.filter(h => h.tier === tier).map(h => `<button type="button" class="solar-tier-hero" data-hero-id="${Number(h.heroId)}" title="${this.escape(h.name)} · ${Number(h.eclipseScore).toFixed(2)}"><span>${this.imageMarkup(h.image ? h : { ...h, image: this.heroById(h.heroId)?.images?.portrait })}</span><strong>${this.escape(h.name)}</strong><small>${this.escape(this.changeText(h.heroId))}</small></button>`).join('')}</div></section>`).join('')}
        <footer>${rows.length} hero · Nisbiy guruhlar: SS / S / A / B / C / D. Bir xil ball — bir xil tier; guruh hajmi teng ballar sabab o‘zgarishi mumkin.<br>Hero ustiga bosing: skills va counters. Yuqori rank yoki SS tier statistik ishonchlilik va g‘alaba kafolati emas.</footer></section>`;
    }
    bindEvents() {
      super.bindEvents();
      this.container?.querySelectorAll('[data-meta-rank]').forEach(button => { button.onclick = event => { event.stopPropagation(); this.selectRank(button.dataset.metaRank); }; });
      this.container?.querySelectorAll('[data-tier-view]').forEach(button => { button.onclick = event => { event.stopPropagation(); this.tierDisplay = button.dataset.tierView; this.renderState(); }; });
      const button = this.container?.querySelector('[data-tier-export]'); if (button) button.onclick = event => { event.stopPropagation(); this.exportTierPng(button); };
      const cancel = this.container?.querySelector('[data-tier-export-cancel]'); if (cancel) cancel.onclick = event => { event.stopPropagation(); this.cancelTierExport(); };
      this.updateExportControls();
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
          const response = await abortable(fetch(`/api/mlbb-image?id=${Number(hero.heroId)}`, { headers: { Authorization: `Bearer ${this.auth.getAccessToken()}` }, signal: controller.signal }), controller.signal);
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
      ctx.fillText('Eclipse tajribaviy tierlari · Moonton rasmiy bahosi emas · Win 65% / Pick 20% / Ban 15%', 40, 171);
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
          ctx.fillStyle = colors[band.tier]; ctx.font = '13px Outfit, sans-serif'; ctx.fillText(this.changeText(hero.heroId, meta), x, y + 96, 110);
        });
      }
      ctx.textAlign = 'left'; ctx.font = '17px Outfit, sans-serif'; ctx.fillStyle = '#aaa99e';
      const comparison = meta.data.comparison;
      ctx.fillText(comparison ? `O‘zgarishlar: ${comparison.previousUpdatedAt} snapshotiga nisbatan.` : 'Taqqoslash uchun oldingi mos snapshot yo‘q. O‘sish/pasayish taxmin qilinmaydi.', 40, layout.height - 50);
      ctx.fillText(`${rows.length} hero · ${rows.filter(hero => !images.has(Number(hero.heroId))).length} portret yetishmaydi · Nisbiy tierlar; teng ball = teng tier · ${meta.data.methodology?.version || 'Eclipse tier'}`, 40, layout.height - 23);
      return canvas;
    }
  };
})();
