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
      return `<details class="match-extra" open><summary>Batafsil statistika <small>Ko‘rinmagan raqamni bo‘sh qoldiring</small></summary><div class="match-metrics">
        ${Object.entries(metrics).map(([field, [label, max]]) => `<label><span>${label}</span><input class="form-input" data-field="${field}" type="number" min="0" max="${max}" step="1" value="${this.escape(values[field] ?? '')}"></label>`).join('')}
        ${['savage', 'maniac'].map(field => `<label><span>${field === 'savage' ? 'Savage' : 'Maniac'}</span><select class="form-select" data-field="${field}"><option value="">Noma’lum</option><option value="true" ${values[field] === true ? 'selected' : ''}>Ha</option><option value="false" ${values[field] === false ? 'selected' : ''}>Yo‘q</option></select></label>`).join('')}
      </div></details>`;
    }

    addParticipantRow(values = {}) {
      super.addParticipantRow(values);
      const row = this.container?.querySelector('#practicePlayerRows')?.lastElementChild;
      if (!row) return;
      row.insertAdjacentHTML('beforeend', this.metricMarkup(values));
      row.dataset.heroReview = values.heroReviewRequired ? 'pending' : 'confirmed';
      row.insertAdjacentHTML('beforeend', `<div class="match-hero-review"><div data-hero-preview></div><span data-hero-status role="status"></span><button type="button" class="btn btn-sm btn-secondary" data-confirm-hero>Qahramonni tasdiqlash</button><button type="button" class="btn btn-sm btn-secondary" data-rescan-hero hidden>Ikonkalar bilan solishtirish</button><button type="button" class="btn btn-sm btn-secondary" data-crop-hero>Ikonkani ajratish</button></div>`);
      row.querySelector('[data-crop-hero]').onclick = () => this.choosePortrait(row);
      row.querySelector('[data-field="heroUsed"]').addEventListener('input', () => { row._heroEditVersion = (row._heroEditVersion || 0) + 1; row.dataset.heroReview = 'pending'; this.heroPreview(row); });
      row.querySelector('[data-confirm-hero]').onclick = () => {
        if (!this.heroDb.resolve?.(this.formValue(row, 'heroUsed'))) return window.showToast?.('Bazadan qahramon tanlang.', 'warning');
        row._heroEditVersion = (row._heroEditVersion || 0) + 1; row.dataset.heroReview = 'confirmed'; this.heroPreview(row); this.saveDraft();
      };
      row.querySelector('[data-rescan-hero]').onclick = () => this.rescanHero(row);
      this.heroPreview(row);
      if (values.portraitBox) this.attachPortrait(row, values.portraitBox);
      row.querySelector('.submission-row-remove').addEventListener('click', () => this.saveDraft());
    }

    heroPreview(row) {
      const hero = this.heroDb.resolve?.(this.formValue(row, 'heroUsed'));
      const image = hero?.images?.portrait || hero?.image || '';
      row.querySelector('[data-hero-preview]').innerHTML = `${image ? `<img src="${this.escape(image)}" alt="${this.escape(hero.name)}">` : ''}<strong>${this.escape(hero?.name || 'Qahramonni tanlang')}</strong>`;
      row.querySelector('[data-hero-status]').textContent = row.dataset.heroReview === 'confirmed' ? 'Tanlov tasdiqlangan' : 'AI taklifi yoki yangi tanlov — portretni tekshirib tasdiqlang';
      row.querySelector('[data-confirm-hero]').hidden = row.dataset.heroReview === 'confirmed';
    }

    async attachPortrait(row, box) {
      const source = this.images.filter(Boolean)[box.imageIndex || 0];
      if (!source || !Array.isArray(box.bounds) || box.bounds.length !== 4 || box.bounds.some(n => !Number.isFinite(n) || n < 0 || n > 1000)) return;
      const [top, left, bottom, right] = box.bounds;
      if (bottom <= top || right <= left) return;
      const img = new Image(); img.src = source;
      const heroEditVersion = row._heroEditVersion || 0;
      const cropGeneration = row._cropGeneration = (row._cropGeneration || 0) + 1;
      try {
        await img.decode();
        if (!row.isConnected || row._cropGeneration !== cropGeneration || (row._heroEditVersion || 0) !== heroEditVersion) return;
        const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 192;
        canvas.getContext('2d').drawImage(img, left * img.width / 1000, top * img.height / 1000, (right - left) * img.width / 1000, (bottom - top) * img.height / 1000, 0, 0, 192, 192);
        canvas.setAttribute('aria-label', 'Skrinshotdan ajratilgan portret');
        row.querySelector('.match-hero-review > canvas')?.remove();
        row.querySelector('.match-hero-review').prepend(canvas);
        row._portraitCrop = canvas.toDataURL('image/jpeg', 0.9);
        const width = (right - left) * img.width / 1000, height = (bottom - top) * img.height / 1000;
        row._portraitSize = Math.max(width, height) / Math.min(width, height) <= 1.3 ? Math.min(width, height) : 0;
        row.dataset.heroReview = 'pending';
        row.querySelector('[data-rescan-hero]').hidden = false;
        await this.rescanHero(row);
      } catch (_) { /* The original screenshot remains visible if a crop cannot be decoded. */ }
    }

    async rescanHero(row) {
      const button = row.querySelector('[data-rescan-hero]');
      if (!row._portraitCrop) return;
      const original = this.formValue(row, 'heroUsed');
      const playerId = this.formValue(row, 'playerId');
      const crop = row._portraitCrop;
      const generation = row._matchGeneration = (row._matchGeneration || 0) + 1;
      const status = row.querySelector('[data-hero-status]');
      const current = () => row.isConnected && row._matchGeneration === generation && row._portraitCrop === crop && this.formValue(row, 'heroUsed') === original && this.formValue(row, 'playerId') === playerId && row.dataset.heroReview !== 'confirmed';
      row.dataset.heroReview = 'pending';
      this.heroPreview(row);
      status.textContent = 'Original ikonkalar bilan solishtirilmoqda…';
      button.disabled = true;
      try {
        this.portraitMatcher ||= new window.HeroPortraitMatcher(this.auth);
        const result = await this.portraitMatcher.match(crop, { cropSize: row._portraitSize, progress: text => { if (current()) status.textContent = text; } });
        if (!current()) return;
        const candidates = result.candidates;
        row.querySelector('[data-hero-candidates]')?.remove();
        const strip = document.createElement('div'); strip.dataset.heroCandidates = ''; strip.className = 'match-candidates';
        for (const hero of candidates) {
          const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'btn btn-secondary';
          const image = hero.image;
          pick.innerHTML = `${image ? `<img src="${this.escape(image)}" alt="">` : ''}${this.escape(hero.name)} · ${(hero.score * 100).toFixed(1)}% o‘xshashlik`;
          pick.onclick = () => { row._heroEditVersion = (row._heroEditVersion || 0) + 1; row.querySelector('[data-field="heroUsed"]').value = hero.name; row.dataset.heroReview = 'confirmed'; this.heroPreview(row); this.saveDraft(); };
          strip.append(pick);
        }
        if (!strip.children.length) strip.textContent = 'Mos ikonka topilmadi. Qahramonni qo‘lda tanlang.';
        row.querySelector('.match-hero-review').append(strip);
        if (result.automatic && candidates[0]) {
          row.querySelector('[data-field="heroUsed"]').value = candidates[0].name; row.dataset.heroReview = 'confirmed'; this.heroPreview(row); this.saveDraft();
          status.textContent = 'Ikonka juda yaqin moslik bilan tanlandi. Istasangiz o‘zgartiring.';
        } else status.textContent = `${result.loaded}/${result.total} ikonka tayyor. Variantni tasdiqlang yoki ikonkani qayta ajrating. O‘xshashlik — aniqlik ehtimoli emas.`;
      } catch (error) { if (current()) status.textContent = error.message; }
      finally { if (row._matchGeneration === generation) button.disabled = false; }
    }

    async choosePortrait(row) {
      const images = this.images.filter(Boolean);
      if (!images.length) return window.showToast?.('Avval match skrinshotini yuklang.', 'warning');
      row.querySelector('[data-crop-editor]')?.remove();
      const editor = document.createElement('div'); editor.dataset.cropEditor = ''; editor.className = 'portrait-crop-editor';
      editor.innerHTML = `<p>Hero ikonkasining chap yuqori va o‘ng pastki burchagini ketma-ket bosing. Ramka va yonidagi belgilarni olmang.</p><div>${images.map((_, i) => `<button type="button" class="btn btn-sm btn-secondary" data-crop-image="${i}">Rasm ${i + 1}</button>`).join('')}<button type="button" class="btn btn-sm btn-secondary" data-crop-close>Yopish</button></div><canvas aria-label="Hero ikonkasini ajratish uchun match skrinshoti"></canvas><p role="status" data-crop-status></p>`;
      row.querySelector('.match-hero-review').append(editor);
      editor.querySelector('[data-crop-close]').onclick = () => editor.remove();
      let loadId = 0;
      const load = async index => {
        const id = ++loadId, img = new Image(); img.src = images[index];
        try { await img.decode(); } catch (_) { editor.querySelector('[data-crop-status]').textContent = 'Rasm ochilmadi.'; return; }
        if (!editor.isConnected || id !== loadId) return;
        const canvas = editor.querySelector('canvas'); canvas.width = Math.min(img.width, 1000); canvas.height = Math.round(canvas.width * img.height / img.width);
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); let first;
        editor.querySelector('[data-crop-status]').textContent = 'Ikonkaning birinchi burchagini belgilang.';
        canvas.onclick = event => {
          const rect = canvas.getBoundingClientRect();
          const point = [Math.round(1000 * (event.clientY - rect.top) / rect.height), Math.round(1000 * (event.clientX - rect.left) / rect.width)].map(n => Math.max(0, Math.min(1000, n)));
          if (!first) { first = point; ctx.fillStyle = '#efd17b'; ctx.fillRect(point[1] * canvas.width / 1000 - 3, point[0] * canvas.height / 1000 - 3, 6, 6); editor.querySelector('[data-crop-status]').textContent = 'Endi qarama-qarshi burchagini belgilang.'; return; }
          const bounds = [Math.min(first[0], point[0]), Math.min(first[1], point[1]), Math.max(first[0], point[0]), Math.max(first[1], point[1])];
          if (bounds[2] - bounds[0] < 5 || bounds[3] - bounds[1] < 5) { first = null; editor.querySelector('[data-crop-status]').textContent = 'Juda kichik maydon. Ikki burchakni qayta belgilang.'; return; }
          if (this.images.filter(Boolean)[index] !== images[index]) { editor.remove(); return; }
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
        playerStats: [...form.querySelectorAll('.submission-player-row')].map(row => ({ ...read(row), heroReviewRequired: row.dataset.heroReview !== 'confirmed' })),
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
      const controls = [...this.container.querySelectorAll('input, select, textarea, button')].map(el => [el, el.disabled]);
      try {
        const save = super.submitForm(event);
        controls.forEach(([el]) => { el.disabled = true; });
        await save;
      } finally {
        controls.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; }); this.saving = false;
        this.updateFormMode();
      }
    }

    async scanImages() {
      if (this.scanning) return;
      const filled = [...this.container.querySelectorAll('[data-field="kills"]')].some(el => el.value !== '');
      if (filled && !window.confirm('AI hozirgi o‘yinchi maydonlarini qayta to‘ldiradi. Davom etamizmi?')) return;
      this.scanning = true;
      const controls = [...this.container.querySelectorAll('input, select, textarea, button')].map(el => [el, el.disabled]);
      controls.forEach(([el]) => { el.disabled = true; });
      try { await super.scanImages(); }
      finally { controls.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; }); this.scanning = false; }
    }

    collectDraft() {
      const form = this.container.querySelector('#practiceSubmissionForm');
      if (!form.checkValidity()) { form.reportValidity(); throw new Error('Belgilangan maydonlarni tekshiring.'); }
      if ([...form.querySelectorAll('.submission-player-row')].some(row => row.dataset.heroReview !== 'confirmed')) throw new Error('Har bir qahramon tanlovini portretiga qarab tasdiqlang.');
      const result = super.collectDraft(); const raw = this.rawDraft();
      result.draft = { ...result.draft, ...raw.team, entryMode: 'full', guestStats: raw.guestStats, substitutes: raw.substitutes,
        playerStats: result.draft.playerStats.map((row, i) => ({ ...row, ...Object.fromEntries([...Object.keys(metrics), 'savage', 'maniac'].map(field => [field, raw.playerStats[i][field] ?? null])) })) };
      return result;
    }

    applyOcrData(data) {
      super.applyOcrData({ ...data, players: (data.players || []).map(player => ({ ...player, heroReviewRequired: true })) });
      this.container.querySelectorAll('[data-team-field]').forEach(el => { if (el.dataset.teamField !== 'sessionLabel') el.value = data[el.dataset.teamField] ?? ''; });
      this.saveDraft();
    }
    cardMarkup(item) {
      const draft = item.review?.correctedDraft || item.draft;
      const allRows = [...(draft?.playerStats || []), ...(draft?.guestStats || [])];
      const fields = { ...Object.fromEntries(Object.entries(metrics).map(([key, [label]]) => [key, label])), inGameScore: 'Baho', medal: 'Medal', savage: 'Savage', maniac: 'Maniac' };
      const unknown = allRows.reduce((count, row) => count + Object.keys(fields).filter(key => row[key] === null || row[key] === undefined || row[key] === '').length, 0);
      const issues = item.quality?.reviewIssues || [];
      const duplicates = item.quality?.possibleMatchIds || [];
      const warning = `<div class="match-review-quality"><strong>${unknown} ta maydon noma’lum${issues.length ? ` · AI tekshiruvi: ${issues.length}` : ''}</strong><p>Captain tasdig‘i — yuborilgan raqamlar ko‘rib chiqilganini bildiradi; skrinshot bilan mustaqil tekshiruv emas.</p>${issues.length ? `<p>${issues.map(issue => this.escape(issue)).join(' · ')}</p>` : ''}</div>`;
      const duplicateControls = this.auth.isAdmin() && item.status === 'pending' && duplicates.length
        ? `<div class="match-review-quality"><strong>Ehtimol, oldin yuborilgan match</strong><p>Bog‘lash yangi statistik yozuv yaratmaydi va raqamlarni o‘zgartirmaydi.</p>${duplicates.map(id => `<button type="button" class="btn btn-sm btn-secondary" data-duplicate-open="${this.escape(id)}">${this.escape(id)} · Ko‘rish</button><button type="button" class="btn btn-sm btn-secondary" data-link-existing="${this.escape(id)}" data-submission-id="${this.escape(item.id)}">Shu matchga bog‘lash</button>`).join('')}<button type="button" class="btn btn-sm btn-secondary" data-distinct-match="${this.escape(item.id)}">Bu boshqa o‘yin · alohida tasdiqlash</button></div>` : '';
      const details = `<details class="match-extra"><summary>Barcha yuborilgan raqamlar · ${allRows.length} qatnashchi</summary>
        <p>Sessiya: ${this.escape(draft?.sessionLabel || '—')} · ${Object.entries(teamFields).map(([key, label]) => `${label}: ${this.escape(draft?.[key] ?? '—')}`).join(' · ')}</p>
        <p>Zaxira: ${(draft?.substitutes || []).map(id => this.escape(this.db.getPlayers().find(p => p.id === id)?.name || id)).join(', ') || '—'}</p>
        ${allRows.map(row => `<p><strong>${this.escape(row.playerName || row.name || 'Guest')}</strong> · ${this.escape(row.heroUsed)} · ${this.escape(row.rolePlayed)} · ${row.kills ?? '—'}/${row.deaths ?? '—'}/${row.assists ?? '—'}<br>${Object.entries(fields).map(([field, label]) => `${label}: ${this.escape(row[field] === true ? 'Ha' : row[field] === false ? 'Yo‘q' : row[field] ?? '—')}`).join(' · ')}</p>`).join('')}</details>`;
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
