/* Shared full-entry controls for the captain and teammate submission workflow. */
(() => {
  const Base = window.SubmissionManager;
  const metrics = { damageDealt: ['Damage', 10000000], damageReceived: ['Received damage', 10000000], turretDamage: ['Turret damage', 10000000], goldEarned: ['Gold', 1000000], teamfightParticipation: ['Teamfight %', 100] };
  const teamFields = { teamTurtles: 'Turtle', teamLords: 'Lord', teamTurrets: 'Turret' };
  window.SubmissionManager = class FullMatchDesk extends Base {
    async render(containerId, matchId = null) {
      if (this.container && this.container.id !== containerId && this.container.querySelector('#practiceSubmissionForm')) {
        if (this.formDirty) this.saveDraft();
        this.container.innerHTML = '';
      }
      this.editingMatch = matchId && this.auth.isAdmin() ? this.db.getMatches().find(match => match.id === matchId) || null : null;
      this.editingSubmission = null;
      const existing = this.editingMatch;
      await super.render(containerId);
      if (!existing || this.container?.id !== containerId || !this.container.querySelector('#practiceSubmissionForm')) return;
      this.restoreDraft({ editingMatch: { id: existing.id, updatedAt: existing.updatedAt }, playerStats: existing.playerStats,
        guestStats: (existing.guestStats || []).map(row => ({ ...row, name: row.guestName || row.name })), substitutes: existing.substitutes, team: existing,
        result: existing.result, fields: { practiceSubmitter: 'admin', practiceDate: existing.date, practiceMatchType: existing.matchType,
          practiceDuration: existing.durationFormatted || '', practiceNotes: existing.notes || '' } });
    }
    availablePlayers() {
      return this.editingMatch || this.editingSubmission ? (this.db.getAllPlayers?.() || this.db.getPlayers()) : (this.db.getActivePlayers?.() || this.db.getPlayers());
    }
    formMarkup() {
      return super.formMarkup().replace('<div class="submission-participants-head">', `
        <details class="match-extra"><summary>Jamoa obyektlari va sessiya <small>Ixtiyoriy</small></summary>
          <div class="match-metrics">${Object.entries(teamFields).map(([field, label]) => `<label><span>${label}</span><input class="form-input" data-team-field="${field}" type="number" min="0" max="${field === 'teamTurrets' ? 9 : 10}" step="1"></label>`).join('')}
          <label><span>Sessiya</span><input class="form-input" data-team-field="sessionLabel" maxlength="80" placeholder="Masalan: kechki scrim"></label></div>
        </details>
        <div class="submission-participants-head">`).replace('<label class="submission-note">', `
        <details class="match-extra"><summary>Guest va zaxira <small>Ixtiyoriy</small></summary>
          <p>Guestlar individual reytingga kirmaydi va Team 5 o‘rnini to‘ldirmaydi.</p>
          <div id="practiceGuestRows"></div><button type="button" class="btn btn-secondary" data-add-guest>+ Guest</button>
          <label><span>Zaxira — bu matchda o‘ynamaganlar</span><select multiple class="form-select" id="practiceSubstitutes">${this.availablePlayers().map(p => `<option value="${this.escape(p.id)}">${this.escape(p.name)}</option>`).join('')}</select></label>
        </details>
        <p id="matchDraftStatus" role="status"></p><button type="button" class="btn btn-sm btn-secondary" data-clear-draft>Formani tozalash</button>
        <label class="submission-note">`);
    }

    metricMarkup(values = {}) {
      return `<details class="match-extra"><summary>Batafsil statistika <small>Ixtiyoriy tahrir</small></summary><div class="match-metrics">
        ${Object.entries(metrics).map(([field, [label, max]]) => `<label><span>${label}</span><input class="form-input" data-field="${field}" type="number" min="0" max="${max}" step="1" value="${this.escape(values[field] ?? '')}"></label>`).join('')}
        ${['savage', 'maniac'].map(field => `<label><span>${field === 'savage' ? 'Savage' : 'Maniac'}</span><select class="form-select" data-field="${field}"><option value="">Noma’lum</option><option value="true" ${values[field] === true ? 'selected' : ''}>Ha</option><option value="false" ${values[field] === false ? 'selected' : ''}>Yo‘q</option></select></label>`).join('')}
      </div></details>`;
    }

    addParticipantRow(values = {}) {
      super.addParticipantRow(values);
      const row = this.container?.querySelector('#practicePlayerRows')?.lastElementChild;
      if (!row) return;
      row.insertAdjacentHTML('beforeend', this.metricMarkup(values));
      if (Number.isInteger(values.sourceRow) && values.sourceRow >= 1 && values.sourceRow <= 5) row.dataset.sourceRow = String(values.sourceRow);
      row.dataset.heroSource = ['portrait', 'manual'].includes(values.heroSource) ? values.heroSource : values.heroUsed ? 'manual' : '';
      row.dataset.medalSource = ['ocr', 'manual'].includes(values.medalSource) ? values.medalSource : 'manual';
      row.dataset.roleSource = ['ocr', 'roster', 'manual', 'inferred', 'unknown', 'legacy'].includes(values.roleSource) ? values.roleSource : values.rolePlayed ? 'legacy' : 'unknown';
      row._preserveSavedRole = !!(this.editingMatch || this.editingSubmission);
      row.insertAdjacentHTML('beforeend', `<div class="match-hero-review"><div data-hero-preview></div><span data-hero-status role="status"></span><details class="match-extra" data-hero-corrections><summary>Qahramonni tuzatish <small>Ixtiyoriy</small></summary><div data-portrait-tools><button type="button" class="btn btn-sm btn-secondary" data-rescan-hero hidden>Ikonkalar bilan solishtirish</button><button type="button" class="btn btn-sm btn-secondary" data-crop-hero>Ikonkani ajratish</button></div></details></div>`);
      row.querySelector('[data-crop-hero]').onclick = () => this.choosePortrait(row);
      const editHero = () => {
        row._preserveSavedRole = false;
        row._heroEditVersion = (row._heroEditVersion || 0) + 1; row.dataset.heroSource = 'manual';
        row.querySelector('[data-hero-candidates]')?.remove(); this.heroPreview(row);
      };
      row.querySelector('[data-field="heroUsed"]').addEventListener('input', editHero);
      row.querySelector('[data-field="heroUsed"]').addEventListener('change', editHero);
      row.querySelector('[data-field="playerId"]').addEventListener('change', () => {
        row._heroEditVersion = (row._heroEditVersion || 0) + 1;
        row.querySelector('[data-hero-candidates]')?.remove();
        row.dataset.roleSource = 'unknown';
        row._preserveSavedRole = false;
        this.resolveMatchRole(row); this.refreshScanSummary(); this.saveDraft();
      });
      row.querySelector('[data-rescan-hero]').onclick = () => this.rescanHero(row);
      this.heroPreview(row);
      const medal = row.querySelector('[data-field="medal"]');
      medal.closest('label').insertAdjacentHTML('beforeend', '<small data-medal-status></small>');
      const role = row.querySelector('[data-field="rolePlayed"]');
      role.closest('label').insertAdjacentHTML('beforeend', '<small data-role-status></small>');
      medal.addEventListener('change', () => { row.dataset.medalSource = 'manual'; this.updateRowProvenance(row); });
      role.addEventListener('change', () => { row.dataset.roleSource = 'manual'; this.updateRowProvenance(row); this.refreshScanSummary(); this.saveDraft(); });
      this.updateRowProvenance(row);
      row.querySelector('.submission-row-remove').addEventListener('click', () => this.saveDraft());
    }

    updateRowProvenance(row) {
      row.querySelector('[data-medal-status]').textContent = row.dataset.medalSource === 'ocr' ? 'Skrinshotdan o‘qildi' : '';
      const status = row.querySelector('[data-role-status]');
      if (status) status.textContent = this.roleNote(row);
    }

    roleNote(row) {
      const role = this.formValue(row, 'rolePlayed');
      const suggestion = Base.roleSuggestion(this.roleHero(this.formValue(row, 'heroUsed')), this.availablePlayers().find(p => p.id === this.formValue(row, 'playerId')));
      const warnings = [];
      if (role && suggestion.allowed.length && !suggestion.allowed.includes(role)) warnings.push('Asosiy/qo‘shimcha roldan tashqari — captain tekshirsin');
      if (role && suggestion.lanes.length && !suggestion.lanes.includes(role)) warnings.push('Hero katalogidagi laynga mos emas — tekshiring');
      const label = !role ? (row._roleLoading ? 'Hero layni tekshirilmoqda…' : suggestion.reason === 'conflict' ? 'Hero va roster laynlari mos emas. Rol noma’lum; yuborish mumkin.' : 'Rol noma’lum; yuborish mumkin.')
        : row.dataset.roleSource === 'inferred' ? (suggestion.reason === 'hero_only' ? 'Taxmin: heroning yagona layni' : 'Taxmin: hero layni + asosiy/qo‘shimcha rol')
        : row.dataset.roleSource === 'ocr' ? 'Skrinshotdan o‘qildi'
        : ['legacy', 'roster'].includes(row.dataset.roleSource) ? 'Oldingi rol — avtomatik tekshirilmagan' : 'Qo‘lda belgilangan rol';
      return [label, ...warnings].join(' · ');
    }

    resolveMatchRole(row) {
      // Preserve explicit corrections (including deliberately unknown), screenshot evidence,
      // and historical values. Only fresh automatic suggestions are recalculated.
      if (!row._preserveSavedRole && !['manual', 'ocr', 'legacy'].includes(row.dataset.roleSource)) {
        const hero = this.roleHero(this.formValue(row, 'heroUsed'));
        const suggestion = Base.roleSuggestion(hero, this.availablePlayers().find(p => p.id === this.formValue(row, 'playerId')));
        row.querySelector('[data-field="rolePlayed"]').value = suggestion.role;
        row.dataset.roleSource = suggestion.role ? 'inferred' : 'unknown';
        if (!suggestion.lanes.length && Number.isInteger(hero?.id) && hero.id > 0 && typeof window.fetch === 'function') this.ensureRoleLanes(row, hero.id);
      }
      if (row.querySelector('[data-role-status]')) this.updateRowProvenance(row);
    }

    roleHero(value) {
      const hero = this.heroDb.resolve?.(value);
      const cached = this._roleMetadata?.get(hero?.id);
      return cached?.lanes?.length && cached.expiresAt > Date.now() ? { ...hero, lanes: cached.lanes } : hero;
    }

    ensureRoleLanes(row, heroId) {
      this._roleMetadata ||= new Map();
      let entry = this._roleMetadata.get(heroId);
      if (entry && entry.expiresAt > Date.now() && !entry.pending) return;
      if (!entry || entry.expiresAt <= Date.now()) {
        entry = { pending: true, expiresAt: Infinity, lanes: [] };
        this._roleMetadata.set(heroId, entry);
        // Fetch only the selected hero, share in-flight requests, and bound the
        // wait. Do not send screenshots, roster data or credentials to this API.
        entry.promise = (async () => {
          const controller = new AbortController();
          let timer;
          try {
            const detail = await Promise.race([
              window.fetch(`/api/mlbb-heroes?id=${heroId}&rank=mythic&days=7`, { signal: controller.signal, credentials: 'omit' })
                .then(async response => { if (!response.ok) throw new Error('Lane metadata unavailable'); return (await response.json()).data; }),
              new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Lane lookup timed out')); }, 8000); })
            ]);
            if (Number(detail?.id) === heroId) entry.lanes = Base.roleSuggestion(detail, null).lanes;
          } catch (_) { /* An unavailable provider must not block match submission. */ }
          finally { clearTimeout(timer); entry.pending = false; entry.expiresAt = Date.now() + (entry.lanes.length ? 600000 : 30000); }
        })();
      }
      const playerId = this.formValue(row, 'playerId'), heroName = this.formValue(row, 'heroUsed');
      const generation = this._ocrGeneration, editVersion = row._heroEditVersion || 0;
      const key = JSON.stringify([heroId, playerId, heroName, generation, editVersion]);
      if (row._roleLookupKey === key && row._roleLoading) return;
      row._roleLookupKey = key; row._roleLoading = true;
      row._roleLookupPromise = entry.promise.then(() => {
        if (row._roleLookupKey !== key) return;
        row._roleLoading = false;
        if (!row.isConnected || this._ocrGeneration !== generation || (row._heroEditVersion || 0) !== editVersion
          || this.formValue(row, 'heroUsed') !== heroName || this.formValue(row, 'playerId') !== playerId
          || !this.container?.contains(row) || !this.container.closest('.page-section')?.classList.contains('active')) return;
        this.resolveMatchRole(row); this.refreshScanSummary(); this.saveDraft();
      });
    }

    heroPreview(row) {
      const hero = this.heroDb.resolve?.(this.formValue(row, 'heroUsed'));
      const image = hero?.images?.portrait || hero?.image || '';
      row.querySelector('[data-hero-preview]').innerHTML = `${image ? `<img src="${this.escape(image)}" alt="${this.escape(hero.name)}">` : ''}<strong>${this.escape(hero?.name || 'Qahramonni tanlang')}</strong>`;
      row.querySelector('[data-hero-status]').textContent = hero ? (row.dataset.heroSource === 'portrait' ? 'Portret orqali avtomatik topildi' : 'Qo‘lda tanlandi') : 'Qahramon aniqlanmadi. Tiniqroq skrinshot yuklang yoki qahramonni tanlang.';
      this.resolveMatchRole(row);
    }

    async attachPortrait(row, box, { context = null, prepared = false, automaticLocation = false } = {}) {
      const imageIndex = box.imageIndex || 0;
      const source = this.images.filter(Boolean)[imageIndex];
      if (!source || !Array.isArray(box.bounds) || box.bounds.length !== 4 || box.bounds.some(n => !Number.isFinite(n) || n < 0 || n > 1000)) return;
      const [top, left, bottom, right] = box.bounds;
      if (bottom <= top || right <= left) return;
      const img = new Image(); img.src = source;
      const heroEditVersion = row._heroEditVersion || 0;
      const cropGeneration = row._cropGeneration = (row._cropGeneration || 0) + 1;
      const workGeneration = this._ocrGeneration;
      const current = () => row.isConnected && row._cropGeneration === cropGeneration && (row._heroEditVersion || 0) === heroEditVersion
        && this._ocrGeneration === workGeneration && this.images.filter(Boolean)[imageIndex] === source && (!context || this.isOcrContextCurrent(context));
      try {
        await img.decode();
        if (!current()) return;
        const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
        canvas.getContext('2d').drawImage(img, left * img.width / 1000, top * img.height / 1000, (right - left) * img.width / 1000, (bottom - top) * img.height / 1000, 0, 0, 192, 192);
        canvas.setAttribute('aria-label', 'Skrinshotdan ajratilgan portret');
        row.querySelector('[data-portrait-tools] > canvas')?.remove();
        row.querySelector('[data-portrait-tools]').prepend(canvas);
        row._portraitCrop = canvas.toDataURL('image/jpeg', 0.9);
        row._portraitSource = source;
        row._portraitImageIndex = imageIndex;
        row._portraitAutomaticLocation = automaticLocation;
        const width = (right - left) * img.width / 1000, height = (bottom - top) * img.height / 1000;
        row._portraitSize = Math.max(width, height) / Math.min(width, height) <= 1.3 ? Math.min(width, height) : 0;
        row.querySelector('[data-rescan-hero]').hidden = false;
        await this.rescanHero(row, { context, prepared });
      } catch (_) { /* The original screenshot remains visible if a crop cannot be decoded. */ }
    }

    async rescanHero(row, { context = null, prepared = false } = {}) {
      const button = row.querySelector('[data-rescan-hero]');
      if (!row._portraitCrop) return;
      let expectedHero = this.formValue(row, 'heroUsed');
      const playerId = this.formValue(row, 'playerId');
      const crop = row._portraitCrop;
      const generation = row._matchGeneration = (row._matchGeneration || 0) + 1;
      const heroEditVersion = row._heroEditVersion || 0;
      const workGeneration = this._ocrGeneration;
      const form = row.closest('#practiceSubmissionForm');
      const page = form?.closest('.page-section');
      const activePage = page?.classList.contains('active') ? page : null;
      let navigationCancelled = false;
      const navigation = activePage && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
        if (!activePage.classList.contains('active')) navigationCancelled = true;
      }) : null;
      navigation?.observe(activePage, { attributes: true, attributeFilter: ['class'] });
      const status = row.querySelector('[data-hero-status]');
      const current = () => row.isConnected && this._ocrGeneration === workGeneration && row._matchGeneration === generation && row._portraitCrop === crop
        && (row._heroEditVersion || 0) === heroEditVersion && this.formValue(row, 'heroUsed') === expectedHero && this.formValue(row, 'playerId') === playerId
        && !navigationCancelled && (!activePage || activePage.classList.contains('active')) && (!context || this.isOcrContextCurrent(context))
        && (!row._portraitSource || this.images.filter(Boolean)[row._portraitImageIndex] === row._portraitSource);
      this.heroPreview(row);
      status.textContent = 'Original ikonkalar bilan solishtirilmoqda…';
      button.disabled = true;
      try {
        this.portraitMatcher ||= new window.HeroPortraitMatcher(this.auth);
        const progress = text => { if (current()) status.textContent = text; };
        if (!prepared) await this.portraitMatcher.prepare(progress);
        if (!current()) return;
        const result = await this.portraitMatcher.match(crop, { prepared: true, cropSize: row._portraitSize, progress });
        if (!current()) return;
        // The locator gates screenshot geometry; accept the best actual catalog match.
        // Matcher similarity ranks alternatives and is not an accuracy probability.
        const candidates = (Array.isArray(result?.candidates) ? result.candidates : [])
          .map(candidate => ({ candidate, hero: this.heroDb.resolve?.(candidate.name) }))
          .filter(({ candidate, hero }) => hero?.id && Number.isFinite(candidate.score))
          .sort((a, b) => b.candidate.score - a.candidate.score);
        row.querySelector('[data-hero-candidates]')?.remove();
        const strip = document.createElement('div'); strip.dataset.heroCandidates = ''; strip.className = 'match-candidates';
        const best = candidates[0]?.hero;
        if (best) {
          row.querySelector('[data-field="heroUsed"]').value = best.name;
          expectedHero = best.name; row.dataset.heroSource = 'portrait'; this.heroPreview(row);
        }
        for (const { candidate, hero } of candidates) {
          const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn btn-secondary';
          const image = hero.images?.portrait || hero.image || candidate.image;
          pick.innerHTML = `${image ? `<img src="${this.escape(image)}" alt="">` : ''}${this.escape(hero.name)}`;
          pick.onclick = () => {
            if (!current()) return;
            row._heroEditVersion = (row._heroEditVersion || 0) + 1;
            row.querySelector('[data-field="heroUsed"]').value = hero.name; row.dataset.heroSource = 'manual';
            this._manualFormEdits = true; this.heroPreview(row); strip.remove(); this.refreshScanSummary(); this.saveDraft();
          };
          strip.append(pick);
        }
        if (!strip.children.length) strip.textContent = 'Mos ikonka topilmadi. Tiniqroq skrinshot yuklang yoki qahramonni tanlang.';
        row.querySelector('[data-portrait-tools]').append(strip);
        if (!best) this.heroPreview(row);
        this.refreshScanSummary(); this.saveDraft();
      } catch (error) { if (current()) status.textContent = error.message; }
      finally { navigation?.disconnect(); if (row._matchGeneration === generation) button.disabled = false; }
    }

    async choosePortrait(row) {
      const images = this.images.filter(Boolean);
      if (!images.length) return window.showToast?.('Avval match skrinshotini yuklang.', 'warning');
      row._heroEditVersion = (row._heroEditVersion || 0) + 1;
      row._matchGeneration = (row._matchGeneration || 0) + 1;
      row.querySelector('[data-hero-candidates]')?.remove();
      row.querySelector('[data-rescan-hero]').disabled = false;
      const workGeneration = this._ocrGeneration;
      row.querySelector('[data-crop-editor]')?.remove();
      const editor = document.createElement('div'); editor.dataset.cropEditor = ''; editor.className = 'portrait-crop-editor';
      editor.innerHTML = `<p>Hero ikonkasining chap yuqori va o‘ng pastki burchagini ketma-ket bosing. Ramka va yonidagi belgilarni olmang.</p><div>${images.map((_, i) => `<button type="button" class="btn btn-sm btn-secondary" data-crop-image="${i}">Rasm ${i + 1}</button>`).join('')}<button type="button" class="btn btn-sm btn-secondary" data-crop-close>Yopish</button></div><canvas aria-label="Hero ikonkasini ajratish uchun match skrinshoti"></canvas><p role="status" data-crop-status></p>`;
      row.querySelector('[data-portrait-tools]').append(editor);
      editor.querySelector('[data-crop-close]').onclick = () => editor.remove();
      let loadId = 0;
      const load = async index => {
        const id = ++loadId, img = new Image(); img.src = images[index];
        try { await img.decode(); } catch (_) { editor.querySelector('[data-crop-status]').textContent = 'Rasm ochilmadi.'; return; }
        if (!editor.isConnected || id !== loadId || this._ocrGeneration !== workGeneration) return;
        const canvas = editor.querySelector('canvas'); canvas.width = Math.min(img.width, 1000); canvas.height = Math.round(canvas.width * img.height / img.width);
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); let first;
        editor.querySelector('[data-crop-status]').textContent = 'Ikonkaning birinchi burchagini belgilang.';
        canvas.onclick = event => {
          const rect = canvas.getBoundingClientRect();
          const point = [Math.round(1000 * (event.clientY - rect.top) / rect.height), Math.round(1000 * (event.clientX - rect.left) / rect.width)].map(n => Math.max(0, Math.min(1000, n)));
          if (!first) { first = point; ctx.fillStyle = '#efd17b'; ctx.fillRect(point[1] * canvas.width / 1000 - 3, point[0] * canvas.height / 1000 - 3, 6, 6); editor.querySelector('[data-crop-status]').textContent = 'Endi qarama-qarshi burchagini belgilang.'; return; }
          const bounds = [Math.min(first[0], point[0]), Math.min(first[1], point[1]), Math.max(first[0], point[0]), Math.max(first[1], point[1])];
          if (bounds[2] - bounds[0] < 5 || bounds[3] - bounds[1] < 5) { first = null; editor.querySelector('[data-crop-status]').textContent = 'Juda kichik maydon. Ikki burchakni qayta belgilang.'; return; }
          if (this._ocrGeneration !== workGeneration || this.images.filter(Boolean)[index] !== images[index]) { editor.remove(); return; }
          editor.remove(); this.attachPortrait(row, { imageIndex: index, bounds });
        };
      };
      editor.querySelectorAll('[data-crop-image]').forEach(button => { button.onclick = () => load(Number(button.dataset.cropImage)); });
      await load(0);
    }

    addGuest(values = {}) {
      const form = this.container.querySelector('#practiceSubmissionForm');
      if (form.querySelectorAll('.submission-player-row, .match-guest').length >= 5) return window.showToast?.('Jamoada ko‘pi bilan 5 qatnashchi.', 'warning');
      const row = document.createElement('div'); row.className = 'match-guest';
      row.dataset.guestId = values.guestId || `guest_${window.crypto?.randomUUID?.() || Date.now()}`;
      row.innerHTML = `<div class="match-metrics">${[['name', 'Guest ismi'], ['heroUsed', 'Qahramon'], ['rolePlayed', 'Rol']].map(([field, label]) => `<label><span>${label}</span>${field === 'rolePlayed' ? `<select class="form-select" data-field="rolePlayed">${['', 'EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'].map(role => `<option ${values.rolePlayed === role ? 'selected' : ''}>${role}</option>`).join('')}</select>` : `<input class="form-input" data-field="${field}" value="${this.escape(values[field] || '')}" ${field === 'heroUsed' ? 'list="guestHeroOptions"' : ''}>`}</label>`).join('')}
        ${['kills', 'deaths', 'assists', 'inGameScore'].map(field => `<label><span>${({ kills: 'K', deaths: 'D', assists: 'A', inGameScore: 'Baho' })[field]}</span><input class="form-input" data-field="${field}" type="number" min="0" step="${field === 'inGameScore' ? '0.1' : '1'}" value="${this.escape(values[field] ?? '')}"></label>`).join('')}
        <label><span>Medal</span><select class="form-select" data-field="medal">${['', 'mvp', 'gold', 'silver', 'bronze'].map(m => `<option ${values.medal === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>${this.metricMarkup(values)}<button type="button" class="btn btn-sm btn-secondary" data-remove-guest>Guestni olib tashlash</button>`;
      row.querySelector('[data-remove-guest]').onclick = () => { row.remove(); this.saveDraft(); };
      form.querySelector('#practiceGuestRows').append(row);
    }

    bindForm() {
      super.bindForm();
      const form = this.container.querySelector('#practiceSubmissionForm'); if (!form) return;
      this.editingSubmission = null;
      if (this.auth.isAdmin()) this.bindLineupPresets(form);
      form.insertAdjacentHTML('beforeend', `<datalist id="guestHeroOptions">${(this.heroDb.getAll?.() || []).map(h => `<option value="${this.escape(h.name)}"></option>`).join('')}</datalist>`);
      form.querySelector('[data-add-guest]').onclick = () => { this.addGuest(); this.saveDraft(); };
      form.querySelector('[data-clear-draft]').onclick = () => {
        if (!window.confirm('Saqlanmagan formani tozalaysizmi?')) return;
        this.clearSavedDraft();
        this.editingMatch = null;
        this.editingSubmission = null;
        this.renderState();
      };
      form.addEventListener('input', () => this.saveDraft());
      form.addEventListener('change', () => this.saveDraft());
      form.addEventListener('input', () => this.refreshScanSummary());
      form.addEventListener('change', () => this.refreshScanSummary());
      form.querySelector('#addPracticePlayer')?.addEventListener('click', () => this.saveDraft());
      this.updateFormMode();
      try {
        const saved = JSON.parse(localStorage.getItem(this.draftKey()) || 'null');
        if (saved?.version === 1) {
          const status = form.querySelector('#matchDraftStatus'); status.textContent = 'Bu brauzerda saqlanmagan match bor. ';
          const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'btn btn-sm btn-secondary'; restore.textContent = 'Qoralamani tiklash';
          restore.onclick = () => { this.restoreDraft(saved); status.textContent = 'Qoralama tiklandi. Rasmlarni qayta tanlang.'; };
          status.append(restore);
        }
      } catch (_) { form.querySelector('#matchDraftStatus').textContent = 'Brauzer qoralamani saqlashga ruxsat bermadi.'; }
    }

    draftKey() { return `eclipse_full_match_draft_v1_${this.auth.isAdmin() ? 'admin' : 'viewer'}${this.editingMatch ? `_edit_${this.editingMatch.id}` : ''}`; }
    bindLineupPresets(form) {
      const key = 'eclipse_lineup_presets_v1';
      let presets = [];
      try { const saved = JSON.parse(localStorage.getItem(key) || '[]'); if (Array.isArray(saved)) presets = saved.slice(0, 10); } catch (_) {}
      const panel = document.createElement('details'); panel.className = 'match-extra';
      panel.innerHTML = '<summary>Tarkib shablonlari <small>Faqat shu brauzerda</small></summary><p>O‘yinchilar va rollar saqlanadi. Natija, raqamlar va hero tanlovi ko‘chirilmaydi.</p><select class="form-select" data-lineup-picker aria-label="Saqlangan tarkib"></select><div class="roster-edit-actions"><button type="button" class="btn btn-secondary" data-lineup-apply>Qo‘llash</button><button type="button" class="btn btn-secondary" data-lineup-save>Hozirgi tarkibni saqlash</button><button type="button" class="btn btn-secondary" data-lineup-remove>Shablonni o‘chirish</button></div><p role="status"></p>';
      form.querySelector('.submission-participants-head')?.before(panel);
      const picker = panel.querySelector('select'), status = panel.querySelector('[role="status"]');
      const redraw = () => { picker.innerHTML = '<option value="">Shablon tanlang…</option>' + presets.map((preset, index) => `<option value="${index}">${this.escape(preset.name)}</option>`).join(''); };
      const persist = next => { localStorage.setItem(key, JSON.stringify(next)); presets = next; redraw(); };
      panel.querySelector('[data-lineup-save]').onclick = () => {
        if (!this.auth.isAdmin()) return;
        const players = this.rawDraft().playerStats.map(row => ({ playerId: row.playerId, rolePlayed: row.rolePlayed }));
        const ids = players.map(row => row.playerId);
        if (!ids.length || ids.some(id => !this.availablePlayers().some(player => player.id === id)) || new Set(ids).size !== ids.length) { status.textContent = 'Avval takrorlanmagan o‘yinchilarni tanlang.'; return; }
        const name = window.prompt('Shablon nomi (40 belgigacha):')?.trim(); if (!name) return;
        if (name.length > 40 || presets.length >= 10) { status.textContent = '10 ta shablon, nomi 40 belgigacha.'; return; }
        try { persist([...presets, { name, players }]); status.textContent = 'Tarkib shu brauzerda saqlandi.'; } catch (_) { status.textContent = 'Shablon saqlanmadi.'; }
      };
      panel.querySelector('[data-lineup-apply]').onclick = () => {
        if (!this.auth.isAdmin() || picker.value === '') return;
        const preset = presets[Number(picker.value)];
        const active = this.db.getActivePlayers?.() || this.db.getPlayers();
        if (!Array.isArray(preset?.players) || !preset.players.length || preset.players.length > 5 || preset.players.some(row => !active.some(player => player.id === row.playerId)) || new Set(preset.players.map(row => row.playerId)).size !== preset.players.length) { status.textContent = 'Shablonda arxivlangan yoki yaroqsiz o‘yinchi bor. Yangi shablon saqlang.'; return; }
        if (!window.confirm('Ishtirokchilar, ularning hozir kiritilgan raqamlari va guestlar tozalanib, shablondagi tarkib qo‘yiladi. Davom etilsinmi?')) return;
        form.querySelector('#practicePlayerRows').innerHTML = ''; form.querySelector('#practiceGuestRows').innerHTML = ''; this.rowCounter = 0;
        preset.players.forEach(row => this.addParticipantRow({ playerId: row.playerId, rolePlayed: row.rolePlayed }));
        form.querySelectorAll('#practiceSubstitutes option').forEach(option => { if (preset.players.some(row => row.playerId === option.value)) option.selected = false; });
        this.saveDraft(); status.textContent = 'Tarkib qo‘yildi. Hero va match raqamlarini kiriting.';
      };
      panel.querySelector('[data-lineup-remove]').onclick = () => {
        if (!this.auth.isAdmin() || picker.value === '' || !window.confirm('Shu lokal tarkib shabloni o‘chirilsinmi?')) return;
        try { persist(presets.filter((_, index) => index !== Number(picker.value))); status.textContent = 'Shablon o‘chirildi. Matchlar o‘zgarmadi.'; } catch (_) { status.textContent = 'O‘chirish bajarilmadi.'; }
      };
      redraw();
    }
    rawDraft() {
      const form = this.container.querySelector('#practiceSubmissionForm');
      const read = row => Object.fromEntries([...row.querySelectorAll('[data-field]')].map(el => [el.dataset.field, ['savage', 'maniac'].includes(el.dataset.field) ? (el.value === '' ? null : el.value === 'true') : el.value]));
      return { version: 1, savedAt: new Date().toISOString(), fields: Object.fromEntries([...form.querySelectorAll('[id].form-input, [id].form-select')].filter(el => !el.multiple).map(el => [el.id, el.value])),
        team: Object.fromEntries([...form.querySelectorAll('[data-team-field]')].map(el => [el.dataset.teamField, el.value])), result: form.querySelector('[name="practice-result"]:checked')?.value || '',
        playerStats: [...form.querySelectorAll('.submission-player-row')].map(row => ({ ...read(row), heroSource: row.dataset.heroSource, medalSource: row.dataset.medalSource, roleSource: row.dataset.roleSource })),
        guestStats: [...form.querySelectorAll('.match-guest')].map(row => ({ ...read(row), guestId: row.dataset.guestId })),
        substitutes: [...form.querySelector('#practiceSubstitutes').selectedOptions].map(el => el.value),
        source: this.ocrSource, reviewIssues: this.ocrReviewIssues,
        editingSubmission: this.editingSubmission || null, editingMatch: this.editingMatch ? { id: this.editingMatch.id, updatedAt: this.editingMatch.updatedAt } : null };
    }
    saveDraft() {
      if (!this.container?.querySelector('#practiceSubmissionForm')) return;
      this.formDirty = true;
      try { localStorage.setItem(this.draftKey(), JSON.stringify(this.rawDraft())); this.container.querySelector('#matchDraftStatus').textContent = 'Qoralama shu brauzerda saqlandi · rasmlar saqlanmaydi'; }
      catch (_) { this.container.querySelector('#matchDraftStatus').textContent = 'Qoralama saqlanmadi. Sahifani yopmang.'; }
    }
    clearSavedDraft() { try { localStorage.removeItem(this.draftKey()); } catch (_) {} this.formDirty = false; }
    setScanDetailsOpen(open) {
      const form = this.container?.querySelector('#practiceSubmissionForm');
      if (!form) return;
      const summary = form.querySelector('[data-scan-summary]');
      if (!summary) return;
      summary.dataset.detailsOpen = String(open);
      const toggle = summary.querySelector('button');
      toggle.textContent = open ? 'Tahrirni yopish' : 'Tahrirlash · ixtiyoriy';
      toggle.setAttribute('aria-expanded', String(open));
      for (const child of form.children) {
        if (!child.matches('.submission-form-grid, .submission-result-fieldset, .submission-participants-head, #practicePlayerRows, .match-extra:not([data-scan-summary]), .submission-note, #matchDraftStatus, [data-clear-draft]')) continue;
        if (!open && child.dataset.scanDisplay === undefined) child.dataset.scanDisplay = child.style.display;
        child.style.display = open ? (child.dataset.scanDisplay || '') : 'none';
        if (open) delete child.dataset.scanDisplay;
      }
    }
    refreshScanSummary({ collapse = false } = {}) {
      const form = this.container?.querySelector('#practiceSubmissionForm');
      if (!form) return false;
      let draft;
      try { draft = super.collectDraft().draft; } catch (_) {}
      const ready = !!draft && !!draft.date && !!draft.matchType && draft.playerStats.every(player => player.heroResolution === 'canonical')
        && [...form.querySelectorAll('input, select, textarea')].every(input => input.validity.valid)
        && [...form.querySelectorAll('[data-field="medal"]')].filter(input => input.value === 'mvp').length <= 1;
      let summary = form.querySelector('[data-scan-summary]');
      if (!ready) {
        if (summary) { this.setScanDetailsOpen(true); summary.remove(); }
        return false;
      }
      if (!summary && !collapse) return true;
      if (!summary) {
        summary = document.createElement('section'); summary.dataset.scanSummary = ''; summary.className = 'match-extra';
        summary.innerHTML = '<strong>Yuborishga tayyor</strong><p data-scan-overview></p><div data-scan-players></div><button type="button" class="btn btn-sm btn-secondary" aria-expanded="false">Tahrirlash · ixtiyoriy</button>';
        form.querySelector('#practiceScanStatus').after(summary);
        summary.querySelector('button').onclick = () => this.setScanDetailsOpen(summary.dataset.detailsOpen !== 'true');
        this.setScanDetailsOpen(true);
      }
      const matchType = form.querySelector('#practiceMatchType')?.selectedOptions[0]?.textContent || draft.matchType;
      summary.querySelector('[data-scan-overview]').textContent = `${draft.result === 'win' ? 'Win' : 'Loss'} · ${draft.playerStats.length} o‘yinchi${draft.durationFormatted ? ` · ${draft.durationFormatted}` : ''}. Sana: ${draft.date} · Tur: ${matchType} (formadagi tanlov). Faqat kerak bo‘lsa tahrirlang.`;
      const roster = this.availablePlayers();
      const rows = [...form.querySelectorAll('.submission-player-row')];
      summary.querySelector('[data-scan-players]').replaceChildren(...draft.playerStats.map((player, index) => {
        const line = document.createElement('p');
        const role = `${player.rolePlayed || 'Rol noma’lum'} (${this.roleNote(rows[index])})`;
        line.textContent = `${roster.find(item => item.id === player.playerId)?.name || player.playerId} · ${player.heroUsed} · ${role} · ${player.kills}/${player.deaths}/${player.assists}${player.inGameScore ? ` · ${player.inGameScore}` : ''}${player.medal ? ` · ${player.medal.toUpperCase()}` : ''}`;
        return line;
      }));
      if (collapse && !this._manualFormEdits) this.setScanDetailsOpen(false);
      return true;
    }
    updateFormMode() {
      const heading = this.container?.querySelector('#submissionHeading');
      if (heading) heading.textContent = this.editingMatch ? 'Matchni tahrirlash' : this.editingSubmission ? 'Submissionni tuzatish' : 'Match yuborish';
      const button = this.container?.querySelector('#practiceSubmitBtn');
      if (button) button.textContent = this.editingMatch ? 'Tahrirni saqlash' : this.editingSubmission ? 'Tuzatib tasdiqlash' : this.auth.isAdmin() ? 'Matchni saqlash' : 'Captain navbatiga yuborish';
    }
    refreshRosterOptions() {
      const form = this.container.querySelector('#practiceSubmissionForm');
      const players = this.availablePlayers();
      const options = players.map(player => `<option value="${this.escape(player.id)}">${this.escape(player.name)}</option>`).join('');
      const submitter = form.querySelector('#practiceSubmitter');
      const claimedPlayerId = submitter.value;
      submitter.innerHTML = (this.auth.isAdmin() ? '<option value="admin">Captain · boshqa o‘yinchilar nomidan</option>' : '<option value="">Rosterdan tanlang…</option>') + options;
      submitter.value = claimedPlayerId;
      const substitutes = form.querySelector('#practiceSubstitutes');
      const selected = new Set([...substitutes.selectedOptions].map(option => option.value));
      substitutes.innerHTML = options;
      [...substitutes.options].forEach(option => { option.selected = selected.has(option.value); });
    }
    restoreDraft(saved) {
      this.invalidateOcrWork();
      const form = this.container.querySelector('#practiceSubmissionForm');
      this.editingMatch = this.auth.isAdmin() ? saved.editingMatch || null : null;
      this.editingSubmission = this.auth.isAdmin() ? saved.editingSubmission || null : null;
      this.refreshRosterOptions();
      this.ocrSource = saved.source === 'ocr' ? 'ocr' : 'manual';
      this.ocrReviewIssues = Array.isArray(saved.reviewIssues) ? saved.reviewIssues : [];
      this.images = [null, null]; this.imageNames = ['', '']; this.updateImageSlots();
      form.querySelector('#practicePlayerRows').innerHTML = ''; this.rowCounter = 0;
      (saved.playerStats || []).slice(0, 5).forEach(row => this.addParticipantRow(row));
      for (const [id, value] of Object.entries(saved.fields || {})) { const input = [...form.querySelectorAll('[id]')].find(el => el.id === id); if (input) input.value = value || ''; }
      form.querySelectorAll('[data-team-field]').forEach(el => { el.value = saved.team?.[el.dataset.teamField] ?? ''; });
      form.querySelectorAll('[name="practice-result"]').forEach(el => { el.checked = el.value === saved.result; });
      form.querySelector('#practiceGuestRows').innerHTML = ''; (saved.guestStats || []).slice(0, 4).forEach(row => this.addGuest(row));
      [...form.querySelector('#practiceSubstitutes').options].forEach(el => { el.selected = saved.substitutes?.includes(el.value) || false; });
      this.updateFormMode();
      this.formDirty = true;
      this._manualFormEdits = true;
      if (this.ocrSource === 'ocr') this.refreshScanSummary({ collapse: true });
    }

    prefillRejected(id) {
      if (this.auth.isAdmin()) return;
      const item = this.data.submissions.find(record => record.id === id && record.status === 'rejected');
      if (!item || (this.formDirty && !window.confirm('Hozirgi formaning o‘rniga rad etilgan matchni ochasizmi?'))) return;
      const draft = item.draft;
      this.restoreDraft({ playerStats: draft.playerStats, guestStats: draft.guestStats, substitutes: draft.substitutes, team: draft, result: draft.result,
        fields: { practiceSubmitter: draft.claimedPlayerId, practiceDate: draft.date, practiceMatchType: draft.matchType, practiceDuration: draft.durationFormatted, practiceNotes: draft.notes } });
      this.saveDraft();
    }

    async submitForm(event) {
      event.preventDefault();
      if (this.saving) return;
      if (this.auth.isAdmin() && this.cloudSync?.getStatus?.().pending) return window.showToast?.('Avval oldingi mahalliy o‘zgarishlar cloudga saqlansin. So‘ng qayta yuboring.', 'warning');
      this.saving = true;
      const submittedForm = this.container.querySelector('#practiceSubmissionForm');
      const controls = [...this.container.querySelectorAll('input, select, textarea, button')].map(el => [el, el.disabled]);
      try {
        controls.forEach(([el]) => { el.disabled = true; });
        await Promise.all([...this.container.querySelectorAll('.submission-player-row')].map(row => row._roleLookupPromise));
        if (!submittedForm?.isConnected || this.container?.querySelector('#practiceSubmissionForm') !== submittedForm) return;
        // Restore original validation state before the base submit collects the form.
        controls.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; });
        const save = super.submitForm(event);
        controls.forEach(([el]) => { el.disabled = true; });
        await save;
      } finally {
        controls.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; }); this.saving = false;
        this.updateFormMode();
      }
    }

    async scanImages({ automatic = false } = {}) {
      if (this.scanning) return;
      if (automatic && this._manualFormEdits) return;
      const filled = [...this.container.querySelectorAll('[data-field="kills"]')].some(el => el.value !== '');
      if (!automatic && filled && this._manualFormEdits && !window.confirm('AI hozirgi o‘yinchi maydonlarini qayta to‘ldiradi. Davom etamizmi?')) return;
      this.scanning = true;
      // A damage screenshot may arrive while the scoreboard is being read.
      const controls = [...this.container.querySelectorAll('input, select, textarea, button')].filter(el => !el.closest('[data-drop-index]')).map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; });
      try { await super.scanImages(); }
      finally {
        controls.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; });
        this.scanning = false; this.runPendingImageScan();
      }
    }

    collectDraft() {
      const form = this.container.querySelector('#practiceSubmissionForm');
      const heroMissing = [...form.querySelectorAll('.submission-player-row')].some(row => !this.heroDb.resolve?.(this.formValue(row, 'heroUsed')));
      if (heroMissing) { this.setScanDetailsOpen(true); throw new Error('Qahramon aniqlanmadi. Tiniqroq skrinshot yuklang yoki qahramonni ro‘yxatdan tanlang.'); }
      if (!form.checkValidity()) {
        this.setScanDetailsOpen(true);
        form.querySelectorAll('input, select, textarea').forEach(input => { if (!input.validity.valid) input.closest('details')?.setAttribute('open', ''); });
        form.reportValidity(); throw new Error('Belgilangan maydonlarni tekshiring.');
      }
      if ([...form.querySelectorAll('[data-field="medal"]')].filter(input => input.value === 'mvp').length > 1) { this.setScanDetailsOpen(true); throw new Error('Bitta jamoada faqat bitta MVP bo‘lishi mumkin. Medallarni tekshiring.'); }
      const result = super.collectDraft(); const raw = this.rawDraft();
      result.draft = { ...result.draft, ...raw.team, entryMode: 'full', guestStats: raw.guestStats, substitutes: raw.substitutes,
        playerStats: result.draft.playerStats.map((row, i) => ({ ...row, ...Object.fromEntries([...Object.keys(metrics), 'savage', 'maniac'].map(field => [field, raw.playerStats[i][field] ?? null])) })) };
      return result;
    }

    async applyOcrData(data, context = null) {
      super.applyOcrData(data);
      this.container.querySelectorAll('[data-team-field]').forEach(el => { if (el.dataset.teamField !== 'sessionLabel') el.value = data[el.dataset.teamField] ?? ''; });
      this.saveDraft();
      await this.locateOcrPortraits(context);
      await Promise.all([...this.container.querySelectorAll('.submission-player-row')].map(row => row._roleLookupPromise));
      if (!context || this.isOcrContextCurrent(context)) { this.refreshScanSummary({ collapse: true }); this.saveDraft(); }
    }

    async locateOcrPortraits(context = null) {
      const form = this.container?.querySelector('#practiceSubmissionForm');
      if (!form) return;
      if (!context) {
        const page = form.closest('.page-section');
        context = { generation: this._ocrGeneration, form, container: this.container, slots: [...this.images], images: this.images.filter(Boolean),
          signal: new AbortController().signal, page: page?.classList.contains('active') ? page : null };
      }
      const current = () => this.isOcrContextCurrent(context);
      const entries = [...form.querySelectorAll('.submission-player-row')].map(row => ({ row, sourceRow: Number(row.dataset.sourceRow), editVersion: row._heroEditVersion || 0, playerId: this.formValue(row, 'playerId') }));
      const untouched = entry => current() && entry.row.isConnected && (entry.row._heroEditVersion || 0) === entry.editVersion
        && this.formValue(entry.row, 'playerId') === entry.playerId && entry.row.dataset.heroSource !== 'manual';
      const note = (entry, text) => { if (untouched(entry)) entry.row.querySelector('[data-hero-status]').textContent = text; };
      // Filtering guests changes the form row index. Only the original screenshot row may locate an icon.
      const eligible = entries.filter(entry => Number.isInteger(entry.sourceRow) && entry.sourceRow >= 1 && entry.sourceRow <= 5
        && entries.filter(other => other.sourceRow === entry.sourceRow).length === 1);
      entries.filter(entry => !eligible.includes(entry)).forEach(entry => note(entry, 'Rasmdagi qator aniq emas. Ikonkani qo‘lda ajrating yoki qahramonni tanlang.'));
      if (!eligible.length) return;
      if (!window.EclipsePortraitLocator?.locate || !context.images.length) {
        eligible.forEach(entry => note(entry, 'Avtomatik ikonka ajratish mavjud emas. Ikonkani qo‘lda ajrating yoki qahramonni tanlang.'));
        return;
      }
      try {
        this.portraitMatcher ||= new window.HeroPortraitMatcher(this.auth);
        const progress = text => eligible.forEach(entry => note(entry, text));
        await this.portraitMatcher.prepare(progress);
        if (!current()) return;
        for (let imageIndex = 0; imageIndex < context.images.length; imageIndex++) {
          const result = await window.EclipsePortraitLocator.locate(context.images[imageIndex], { references: this.portraitMatcher.references, progress, signal: context.signal });
          if (!current()) return;
          const boxes = Array.isArray(result?.boxes) ? result.boxes : [];
          if (boxes.length !== 5 || new Set(boxes.map(box => box.rowIndex)).size !== 5 || boxes.some(box => !Number.isInteger(box.rowIndex) || box.rowIndex < 0 || box.rowIndex > 4)) continue;
          for (const entry of eligible) {
            if (!untouched(entry)) continue;
            const box = boxes.find(box => box.rowIndex === entry.sourceRow - 1);
            await this.attachPortrait(entry.row, { imageIndex, bounds: box.bounds }, { context, prepared: true, automaticLocation: true });
          }
          return;
        }
        eligible.forEach(entry => note(entry, 'Rasm joylashuvi ishonchli aniqlanmadi. “Ikonkani ajratish” orqali belgilang yoki qahramonni qo‘lda tanlang.'));
      } catch (error) {
        eligible.forEach(entry => note(entry, error?.name === 'AbortError' ? 'Tekshiruv to‘xtatildi.' : 'Ikonkalar hozir tekshirilmadi. Ikonkani qo‘lda ajrating yoki qahramonni tanlang.'));
      }
    }
    cardMarkup(item) {
      const draft = item.review?.correctedDraft || item.draft;
      const allRows = [...(draft?.playerStats || []), ...(draft?.guestStats || [])];
      const fields = { ...Object.fromEntries(Object.entries(metrics).map(([key, [label]]) => [key, label])), inGameScore: 'Baho', medal: 'Medal', savage: 'Savage', maniac: 'Maniac' };
      const unknown = allRows.reduce((count, row) => count + Object.keys(fields).filter(key => row[key] === null || row[key] === undefined || row[key] === '').length, 0);
      const issues = [...(item.quality?.reviewIssues || [])];
      for (const stat of draft?.playerStats || []) {
        const suggestion = Base.roleSuggestion(this.roleHero(stat.heroUsed), this.availablePlayers().find(p => p.id === stat.playerId));
        const name = stat.playerName || stat.playerId;
        if (!stat.rolePlayed) issues.push(`${name}: rol noma’lum; umumiy statistika hisoblanadi`);
        else {
          if (suggestion.allowed.length && !suggestion.allowed.includes(stat.rolePlayed)) issues.push(`${name}: asosiy/qo‘shimcha roldan tashqari`);
          if (suggestion.lanes.length && !suggestion.lanes.includes(stat.rolePlayed)) issues.push(`${name}: hero layni bilan rol mos emas`);
          if (!stat.roleSource || ['legacy', 'roster'].includes(stat.roleSource)) issues.push(`${name}: oldingi rol tekshirilmagan`);
        }
      }
      const duplicates = item.quality?.possibleMatchIds || [];
      const warning = `<div class="match-review-quality"><strong>${unknown} ta maydon noma’lum${issues.length ? ` · AI tekshiruvi: ${issues.length}` : ''}</strong><p>Captain tasdig‘i — yuborilgan raqamlar ko‘rib chiqilganini bildiradi; skrinshot bilan mustaqil tekshiruv emas.</p>${issues.length ? `<p>${issues.map(issue => this.escape(issue)).join(' · ')}</p>` : ''}</div>`;
      const duplicateControls = this.auth.isAdmin() && item.status === 'pending' && duplicates.length
        ? `<div class="match-review-quality"><strong>Ehtimol, oldin yuborilgan match</strong><p>Bog‘lash yangi statistik yozuv yaratmaydi va raqamlarni o‘zgartirmaydi.</p>${duplicates.map(id => `<button type="button" class="btn btn-sm btn-secondary" data-duplicate-open="${this.escape(id)}">${this.escape(id)} · Ko‘rish</button><button type="button" class="btn btn-sm btn-secondary" data-link-existing="${this.escape(id)}" data-submission-id="${this.escape(item.id)}">Shu matchga bog‘lash</button>`).join('')}<button type="button" class="btn btn-sm btn-secondary" data-distinct-match="${this.escape(item.id)}">Bu boshqa o‘yin · alohida tasdiqlash</button></div>` : '';
      const details = `<details class="match-extra"><summary>Barcha yuborilgan raqamlar · ${allRows.length} qatnashchi</summary>
        <p>Sessiya: ${this.escape(draft?.sessionLabel || '—')} · ${Object.entries(teamFields).map(([key, label]) => `${label}: ${this.escape(draft?.[key] ?? '—')}`).join(' · ')}</p>
        <p>Zaxira: ${(draft?.substitutes || []).map(id => this.escape(this.db.getPlayers().find(p => p.id === id)?.name || id)).join(', ') || '—'}</p>
        ${allRows.map(row => `<p><strong>${this.escape(row.playerName || row.name || 'Guest')}</strong> · ${this.escape(row.heroUsed)} · ${this.escape(row.rolePlayed || 'Rol noma’lum')}${row.roleSource === 'inferred' ? ' (taxmin)' : ''} · ${row.kills ?? '—'}/${row.deaths ?? '—'}/${row.assists ?? '—'}<br>${Object.entries(fields).map(([field, label]) => `${label}: ${this.escape(row[field] === true ? 'Ha' : row[field] === false ? 'Yo‘q' : row[field] ?? '—')}`).join(' · ')}</p>`).join('')}</details>`;
      return super.cardMarkup({ ...item, draft }).replace('<button type="button" class="btn btn-sm btn-primary" data-action="approve">', '<button type="button" class="btn btn-sm btn-secondary" data-correct="' + this.escape(item.id) + '">Ko‘rib chiqish / tuzatish</button><button type="button" class="btn btn-sm btn-primary" data-action="approve">').replace('<div class="submission-mini-roster">', `${warning}${duplicateControls}${details}<div class="submission-mini-roster">`);
    }
    bindAdminActions() {
      super.bindAdminActions();
      if (!this.auth.isAdmin()) return;
      this.container.querySelectorAll('[data-duplicate-open]').forEach(button => { button.onclick = () => window.EclipseApp?.matchManager?.showMatchDetailModal(button.dataset.duplicateOpen, this.db.getAllPlayers?.() || this.db.getPlayers()); });
      this.container.querySelectorAll('[data-link-existing]').forEach(button => { button.onclick = async () => {
        const record = this.data.submissions.find(item => item.id === button.dataset.submissionId);
        if (!record || !window.confirm('Mavjud matchga bog‘lansinmi? Yangi match qo‘shilmaydi, uning raqamlari o‘zgarmaydi.')) return;
        button.disabled = true;
        try { await this.request('PATCH', { action: 'link_existing', id: record.id, matchId: button.dataset.linkExisting, expectedUpdatedAt: record.updatedAt }); await this.render(this.container.id); }
        catch (error) { window.showToast?.(error.message, 'error'); button.disabled = false; }
      }; });
      this.container.querySelectorAll('[data-distinct-match]').forEach(button => { button.onclick = () => {
        if (window.confirm('O‘xshash raqamlarga qaramay bu alohida o‘yin ekanini tasdiqlaysizmi?')) this.reviewSubmission(button, button.dataset.distinctMatch, 'approve', '', { allowProbableDuplicate: true });
      }; });
      this.container.querySelectorAll('[data-correct]').forEach(button => { button.onclick = () => {
        const item = this.data.submissions.find(record => record.id === button.dataset.correct); if (!item) return;
        if (this.formDirty && !window.confirm('Hozirgi formaning o‘rniga yuborilgan matchni ochasizmi?')) return;
        const draft = item.review?.correctedDraft || item.draft;
        this.restoreDraft({ playerStats: draft.playerStats, guestStats: draft.guestStats, substitutes: draft.substitutes, team: draft,
          result: draft.result, fields: { practiceSubmitter: draft.claimedPlayerId, practiceDate: draft.date, practiceMatchType: draft.matchType, practiceDuration: draft.durationFormatted, practiceNotes: draft.notes },
          editingSubmission: { id: item.id, updatedAt: item.updatedAt } });
        this.saveDraft(); this.container.querySelector('#practiceSubmissionForm').scrollIntoView({ block: 'start' });
      }; });
    }
  };
})();
