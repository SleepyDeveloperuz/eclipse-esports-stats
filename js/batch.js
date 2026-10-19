import { groupBatchFiles } from './batch-model.js?v=2.27.0';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });

export class BatchUpload {
  constructor(app) {
    this.app = app;
    this.items = [];
    this.generation = 0;
    this.busy = false;
    this.admin = app.authManager.isAdmin();
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', e => {
        if (this.items.some(i => i.state !== 'sent')) {
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }
  }

  render() {
    const doc = typeof document !== 'undefined' ? document : null;
    this.container = doc?.getElementById('batchContainer');
    if (!this.container) return;
    if (this.container.children.length) return;

    this.container.innerHTML = `
      <div class="batch-shell">
        <header class="batch-header">
          <div class="batch-header__nav">
            <button type="button" class="btn btn-secondary batch-back-btn" data-batch-back>
              <i class="fa-solid fa-arrow-left"></i> Yagona match skaneri
            </button>
            <div class="batch-header__badges">
              <span class="batch-badge is-gold"><i class="fa-solid fa-bolt"></i> AI BATCH OCR</span>
              <span class="batch-badge is-cyan"><i class="fa-solid fa-layer-group"></i> 1–5 MATCH</span>
            </div>
          </div>
          <div class="batch-header__content">
            <p class="section-eyebrow">ECLIPSE HUD // MULTI-MATCH UPLOAD</p>
            <h2>Bir sessiya. Bitta yuklash.</h2>
            <p class="batch-header__desc">
              10 tagacha skrinshot, 5 tagacha match. Scoreboard va Damage rasmlari Battle ID orqali avtomatik juftlanadi,
              raqamlar va medallar AI tomonidan o‘qiladi.
            </p>
          </div>
          <div class="batch-stats-strip">
            <div class="batch-stat-card">
              <i class="fa-solid fa-images"></i>
              <div>
                <strong>1–10 ta</strong>
                <small>Skrinshotlar (PNG, JPG, HEIC)</small>
              </div>
            </div>
            <div class="batch-stat-card">
              <i class="fa-solid fa-shield-halved"></i>
              <div>
                <strong>5 tagacha</strong>
                <small>Avtomatik juftlangan match</small>
              </div>
            </div>
            <div class="batch-stat-card">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <div>
                <strong>1 ta AI so‘rov</strong>
                <small>Tezkor va tejamkor juftlash</small>
              </div>
            </div>
          </div>
        </header>

        <div class="batch-steps-bar" role="navigation" aria-label="Yuklash bosqichlari">
          <div class="batch-step-item is-active" id="batchStep1">
            <span class="batch-step-item__num">1</span>
            <div class="batch-step-item__info">
              <strong>Rasmlarni tanlash</strong>
              <small>1–10 ta skrinshot</small>
            </div>
          </div>
          <div class="batch-step-connector"></div>
          <div class="batch-step-item" id="batchStep2">
            <span class="batch-step-item__num">2</span>
            <div class="batch-step-item__info">
              <strong>AI bilan juftlash va o‘qish</strong>
              <small>Battle ID bo‘yicha</small>
            </div>
          </div>
          <div class="batch-step-connector"></div>
          <div class="batch-step-item" id="batchStep3">
            <span class="batch-step-item__num">3</span>
            <div class="batch-step-item__info">
              <strong>Natijalarni yuborish</strong>
              <small>Captain navbatiga</small>
            </div>
          </div>
        </div>

        <p class="progress-note batch-privacy-note">
          <i class="fa-solid fa-shield-halved"></i> Rasmlar faqat shu tab xotirasida saqlanadi va serverda qolmaydi. AI limiti odatdagidek: juftlash uchun 1 so‘rov, har match uchun 1 scan. Natijalarni yuborishdan oldin tahrirlash imkoniyati mavjud.
        </p>

        <div class="batch-upload-panel">
          <div class="batch-dropzone" id="batchDropzone" tabindex="0" role="button" aria-label="Skrinshotlarni yuklash uchun bosing yoki fayllarni tashlang">
            <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" id="batchFiles" class="form-input batch-file-input">
            <div class="batch-dropzone__content">
              <div class="batch-dropzone__icon">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <h3>Skrinshotlarni bu yerga tashlang yoki bosing</h3>
              <p>Scoreboard va Damage rasmlarini birgalikda tanlang (1 dan 10 tagacha rasm)</p>
              <div class="batch-dropzone__hints">
                <span><i class="fa-solid fa-paste"></i> <kbd>Ctrl+V</kbd> orqali joylash</span>
                <span><i class="fa-solid fa-mobile-screen"></i> iPhone HEIC qo‘llab-quvvatlanadi</span>
                <span><i class="fa-solid fa-lock"></i> Tab xotirasida, xavfsiz</span>
              </div>
            </div>
          </div>

          <div class="batch-file-tray" id="batchFileTray" hidden>
            <div class="batch-file-tray__header">
              <div class="batch-file-tray__title">
                <i class="fa-solid fa-photo-film"></i>
                <strong id="batchFileCount">0 ta rasm tanlandi</strong>
              </div>
              <button type="button" class="btn btn-sm btn-secondary" id="batchClearFilesBtn">
                <i class="fa-solid fa-trash-can"></i> Fayllarni tozalash
              </button>
            </div>
            <div class="batch-file-chips" id="batchFileChips"></div>
          </div>

          <div class="progress-filters batch-params-card">
            <label>
              <span><i class="fa-regular fa-calendar"></i> Sana ko‘rinmagan rasmlar uchun</span>
              <input type="date" class="form-input" id="batchDate" value="${today()}" required>
            </label>
            <label>
              <span><i class="fa-solid fa-gamepad"></i> Standart match turi</span>
              <select class="form-select" id="batchType">
                <option value="ranked" selected>Ranked</option>
                <option value="scrim">Scrim</option>
                <option value="tournament">Turnir</option>
                <option value="casual">Oddiy (Casual)</option>
              </select>
            </label>
          </div>
        </div>

        <div class="batch-toolbar">
          <div class="batch-toolbar__primary">
            <button class="btn btn-primary btn-lg batch-btn-hero" data-batch="index">
              <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Rasmlarni juftlash va o‘qish</span>
            </button>
            <button class="btn btn-primary btn-lg batch-btn-send" data-batch="send" disabled>
              <i class="fa-solid fa-paper-plane"></i> <span>Tayyor matchlarni yuborish</span>
            </button>
          </div>
          <div class="batch-toolbar__secondary">
            <button class="btn btn-secondary" data-batch="scan" disabled title="Faqat o‘qilmay qolganlarini qayta o‘qish">
              <i class="fa-solid fa-rotate"></i> Qolganlarini o‘qish
            </button>
            <button class="btn btn-secondary is-danger-hover" data-batch="stop" disabled title="Jarayonni to‘xtatish">
              <i class="fa-solid fa-circle-stop"></i> To‘xtatish
            </button>
            <button class="btn btn-secondary" data-batch="clear" disabled title="Navbatni tozalash">
              <i class="fa-solid fa-trash-can"></i> Navbatni tozalash
            </button>
          </div>
        </div>

        <div class="batch-status-banner" id="batchStatusBanner" hidden>
          <div class="batch-status-spinner" id="batchSpinner" hidden></div>
          <i class="fa-solid fa-circle-info" id="batchStatusIcon"></i>
          <p id="batchStatus" role="status" aria-live="polite"></p>
        </div>

        <div id="batchUnresolved" class="batch-unresolved-zone"></div>

        <div class="batch-queue-section">
          <div class="batch-queue-header">
            <h3><i class="fa-solid fa-list-check"></i> Juftlangan matchlar navbati</h3>
            <span class="batch-queue-counter" id="batchQueueCounter">0 ta match</span>
          </div>
          <div class="batch-queue" id="batchQueue"></div>
        </div>
      </div>
    `;

    this.container.querySelectorAll('[data-batch]').forEach(b => b.onclick = () => this.run(b.dataset.batch));
    this.container.querySelector('[data-batch-back]')?.addEventListener('click', () => {
      window.EclipseApp?.navigate?.('practice');
    });

    this.bindDropzone();
    this.updateControls();
  }

  bindDropzone() {
    const dropzone = this.container?.querySelector('#batchDropzone');
    const input = this.container?.querySelector('#batchFiles');
    if (!dropzone || !input) return;

    dropzone.addEventListener('click', (e) => {
      if (e.target !== input) input.click();
    });

    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const droppedFiles = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      if (droppedFiles.length) {
        if (typeof DataTransfer !== 'undefined') {
          const dt = new DataTransfer();
          droppedFiles.slice(0, 10).forEach(f => dt.items.add(f));
          input.files = dt.files;
        }
        this.onFilesSelected();
        window.eclipseAudio?.playClick?.();
      }
    });

    input.addEventListener('change', () => {
      this.onFilesSelected();
      window.eclipseAudio?.playClick?.();
    });

    this.container.querySelector('#batchClearFilesBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      this.onFilesSelected();
      window.eclipseAudio?.playClick?.();
    });

    this.pasteHandler = (e) => {
      if (!document.getElementById('page-batch')?.classList.contains('active')) return;
      const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      if (files.length && typeof DataTransfer !== 'undefined') {
        const dt = new DataTransfer();
        [...input.files, ...files].slice(0, 10).forEach(f => dt.items.add(f));
        input.files = dt.files;
        this.onFilesSelected();
        window.eclipseAudio?.playClick?.();
      }
    };
    document.addEventListener('paste', this.pasteHandler);
  }

  onFilesSelected() {
    const input = this.container?.querySelector('#batchFiles');
    const tray = this.container?.querySelector('#batchFileTray');
    const chips = this.container?.querySelector('#batchFileChips');
    const countEl = this.container?.querySelector('#batchFileCount');
    if (!input || !tray || !chips || !countEl) return;

    const files = [...(input.files || [])];
    if (!files.length) {
      tray.hidden = true;
      chips.innerHTML = '';
      countEl.textContent = '0 ta rasm tanlandi';
      this.setStep(1);
      return;
    }

    tray.hidden = false;
    countEl.textContent = `${files.length} ta rasm tanlandi (maks. 10 ta)`;
    chips.innerHTML = files.map(file => {
      const sizeKb = (file.size / 1024).toFixed(0);
      return `
        <div class="batch-chip">
          <i class="fa-regular fa-image"></i>
          <span class="batch-chip__name" title="${esc(file.name)}">${esc(file.name)}</span>
          <small class="batch-chip__size">${sizeKb} KB</small>
        </div>
      `;
    }).join('');
    this.setStep(1);
  }

  setStep(stepNum) {
    [1, 2, 3].forEach(n => {
      const el = this.container?.querySelector(`#batchStep${n}`);
      if (el) {
        el.classList.toggle('is-active', n === stepNum);
        el.classList.toggle('is-done', n < stepNum);
      }
    });
  }

  onAuthChange() {
    if (this.admin === this.app.authManager.isAdmin()) return;
    this.admin = this.app.authManager.isAdmin();
    if (this.container) { this.clear(); this.container.replaceChildren(); }
    if (document.getElementById('page-batch')?.classList.contains('active')) this.render();
  }

  status(message) {
    const statusEl = this.container?.querySelector('#batchStatus');
    const banner = this.container?.querySelector('#batchStatusBanner');
    const spinner = this.container?.querySelector('#batchSpinner');
    const icon = this.container?.querySelector('#batchStatusIcon');
    if (statusEl) statusEl.textContent = message;
    if (banner) {
      banner.hidden = !message;
      if (spinner) spinner.hidden = !this.busy;
      if (icon) icon.hidden = Boolean(this.busy);
    }
  }

  updateControls() {
    if (!this.container) return;
    this.container.querySelectorAll('[data-batch]').forEach(b => {
      b.disabled = b.dataset.batch === 'stop' ? !this.busy : this.busy || (['scan', 'send', 'clear'].includes(b.dataset.batch) && !this.items.length);
    });
    this.container.querySelectorAll('#batchFiles,#batchDate,#batchType').forEach(el => el.disabled = this.busy);

    const counter = this.container.querySelector('#batchQueueCounter');
    if (counter) counter.textContent = `${this.items.length} ta match`;

    const sendBtn = this.container.querySelector('[data-batch="send"]');
    const hasReady = this.items.some(i => ['ready', 'review'].includes(i.state));
    if (sendBtn) {
      sendBtn.classList.toggle('is-pulse', hasReady && !this.busy);
    }
  }

  stop() {
    this.generation++;
    this.controller?.abort();
    this.items.forEach(i => {
      if (i.state === 'scanning') {
        i.worker.invalidateOcrWork();
        i.state = 'waiting';
        this.itemStatus(i, 'To‘xtatildi · qayta o‘qish mumkin');
      }
    });
    this.status('Navbat to‘xtatildi. Saqlangan matchlar o‘zgarmaydi.');
    this.updateControls();
  }

  async run(action) {
    if (action === 'stop') { this.stop(); return; }
    if (this.busy) return;
    if (action === 'clear') {
      if (this.items.some(i => i.state !== 'sent') && !confirm('Yuborilmagan batch va rasmlar xotiradan o‘chirilsinmi?')) return;
      this.clear();
      return;
    }
    this.busy = true;
    const generation = ++this.generation;
    this.updateControls();
    try {
      if (action === 'index') await this.index(generation);
      if (['index', 'scan'].includes(action) && generation === this.generation) await this.scan(generation);
      if (action === 'send') await this.send(generation);
    } catch (e) {
      if (generation === this.generation) this.status(e.message);
    } finally {
      this.busy = false;
      this.updateControls();
    }
  }

  clear() {
    this.stop();
    this.items.forEach(i => {
      i.worker.invalidateOcrWork();
      if (typeof document !== 'undefined') document.removeEventListener('paste', i.worker.pasteHandler);
    });
    this.items = [];
    if (this.container) {
      this.container.querySelector('#batchQueue')?.replaceChildren();
      this.container.querySelector('#batchUnresolved')?.replaceChildren();
      const filesInput = this.container.querySelector('#batchFiles');
      if (filesInput) filesInput.value = '';
      this.onFilesSelected();
    }
    this.status('Navbat tozalandi.');
    this.setStep(1);
    this.updateControls();
  }

  async imageData(file, width = 1600) {
    window.EclipseImageUpload.validate(file, 8 * 1024 * 1024);
    if (window.EclipseImageUpload.isHeic(file)) file = await window.EclipseImageUpload.toJpeg(file, { signal: this.controller?.signal });
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.width || !img.height || img.width * img.height > 24000000) throw new Error('Rasm o‘lchami juda katta.');
      const scale = Math.min(1, width / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .88);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async index(generation) {
    if (this.items.length) throw new Error('Yangi batch uchun avval navbatni tozalang.');
    const files = [...this.container.querySelector('#batchFiles').files];
    if (!files.length || files.length > 10) throw new Error('1–10 ta skrinshot tanlang.');
    const fallback = this.container.querySelector('#batchDate');
    if (!fallback.checkValidity() || !fallback.value) throw new Error('Sana tanlang.');
    this.controller = new AbortController();
    this.setStep(2);
    window.eclipseAudio?.playWhoosh?.();
    this.status('Rasmlar tayyorlanmoqda (HEIC bo‘lsa JPEG’ga aylantiriladi)…');
    const images = [];
    for (const file of files) {
      images.push(await this.imageData(file));
      if (generation !== this.generation) return;
    }
    if (JSON.stringify(images).length > 3700000) throw new Error('Rasmlar umumiy hajmi katta. Bu batchga kamroq rasm tanlang.');
    this.controller = new AbortController();
    this.status('Battle ID va rasm turi tekshirilmoqda…');
    const response = await fetch('/api/ocr', {
      method: 'POST',
      signal: this.controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.app.authManager.getAccessToken()}` },
      body: JSON.stringify({ purpose: 'practice_submission', mode: 'batch_index', images })
    });
    const result = await response.json();
    if (generation !== this.generation) return;
    if (!response.ok || !result.data?.files) throw new Error(result.error || 'Juftlash bajarilmadi.');
    const grouped = groupBatchFiles(result.data.files);
    this.container.querySelector('#batchUnresolved').innerHTML = grouped.unresolved.map(f =>
      `<p class="progress-note"><i class="fa-solid fa-triangle-exclamation"></i> <strong>${esc(files[f.index]?.name)}</strong>: ${esc(f.reason)}</p>`
    ).join('');
    if (grouped.matches.length > 5) throw new Error('Bir batchda ko‘pi bilan 5 match.');
    for (const group of grouped.matches) this.addItem(group, images, files, fallback.value, this.container.querySelector('#batchType').value);
    this.status(`${this.items.length} match juftlandi. ${grouped.unresolved.length} rasm avtomatik olinmadi.`);
    window.eclipseAudio?.playSuccess?.();
    this.setStep(3);
  }

  addItem(group, images, files, fallbackDate, matchType) {
    const doc = this.container?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const root = doc.createElement('article');
    root.className = 'batch-item';
    root.dataset.state = 'waiting';

    const matchNumber = this.items.length + 1;
    const isPair = Boolean(group.damage);

    root.innerHTML = `
      <header>
        <div class="batch-item__headline">
          <div class="batch-item__badges">
            <span class="batch-item__num-tag">MATCH ${matchNumber}</span>
            <span class="batch-item__id-tag"><i class="fa-solid fa-fingerprint"></i> ID ${esc(group.battleId)}</span>
            <span class="batch-item__type-tag ${isPair ? 'is-complete' : 'is-single'}">
              <i class="fa-solid ${isPair ? 'fa-layer-group' : 'fa-image'}"></i>
              ${isPair ? 'Scoreboard + Damage' : 'Faqat Scoreboard'}
            </span>
          </div>
          <strong>Match ${matchNumber}</strong>
        </div>
        <div class="batch-item__ctrl">
          <button type="button" class="btn btn-secondary btn-sm batch-edit-btn" data-edit>
            <i class="fa-solid fa-pen-to-square"></i> Ko‘rish / tahrirlash
          </button>
        </div>
      </header>
      <div class="batch-item__status-bar">
        <span class="batch-status-pill is-waiting" data-status-indicator>
          <i class="fa-regular fa-clock"></i>
        </span>
        <p data-item-status role="status">Navbatda</p>
      </div>
      <div class="batch-preview">
        ${[group.score, group.damage].filter(Boolean).map((f, idx) => `
          <div class="batch-preview-card">
            <span class="batch-preview-tag">${idx === 0 ? 'Scoreboard' : 'Damage'}</span>
            <img src="${images[f.index]}" alt="${esc(files[f.index]?.name || 'Skrinshot')}">
          </div>
        `).join('')}
      </div>
      <div class="batch-worker" hidden></div>
    `;

    this.container.querySelector('#batchQueue').append(root);
    const worker = new window.SubmissionManager(this.app.authManager, this.app.dataStore, this.app.heroDb, this.app.cloudSync);
    worker.container = root.querySelector('.batch-worker');
    worker.container.innerHTML = worker.formMarkup();
    worker.saveDraft = () => { worker.formDirty = true; };
    worker.clearSavedDraft = () => {};
    worker.draftKey = () => 'eclipse_batch_memory_only';
    worker.readImage = () => { this.status('Rasmni almashtirish uchun yangi batch oching — Battle ID juftligi saqlanadi.'); };
    worker.submitForm = e => { e.preventDefault(); this.status('Batchdagi tayyor matchlarni yuqoridagi tugma orqali yuboring.'); };
    worker.bindForm();
    if (typeof document !== 'undefined') document.removeEventListener('paste', worker.pasteHandler);
    const clearDraft = worker.container.querySelector('[data-clear-draft]');
    if (clearDraft) clearDraft.hidden = true;
    const submitBtn = worker.container.querySelector('#practiceSubmitBtn');
    if (submitBtn) submitBtn.hidden = true;
    worker.container.querySelectorAll('input[type=file],[data-remove-index]').forEach(el => el.disabled = true);
    worker.container.querySelectorAll('[data-drop-index]').forEach(el => el.hidden = true);
    worker.images = [images[group.score.index], group.damage ? images[group.damage.index] : null];
    worker.imageNames = [files[group.score.index]?.name || '', group.damage ? (files[group.damage.index]?.name || '') : ''];
    worker.updateImageSlots();
    const practiceDate = worker.container.querySelector('#practiceDate');
    if (practiceDate) practiceDate.value = group.date || fallbackDate;
    const practiceMatchType = worker.container.querySelector('#practiceMatchType');
    if (practiceMatchType) practiceMatchType.value = matchType;
    const item = { group, worker, root, state: 'waiting' };
    this.items.push(item);

    root.querySelector('[data-edit]').onclick = () => {
      worker.container.hidden = !worker.container.hidden;
      root.querySelector('[data-edit]').classList.toggle('active', !worker.container.hidden);
      window.eclipseAudio?.playClick?.();
    };

    worker.container.addEventListener('change', () => {
      if (!this.busy && item.state !== 'sent') {
        item.state = 'review';
        this.itemStatus(item, 'Tahrirlandi · yuborishda tekshiriladi');
      }
    });

    this.updateControls();
  }

  itemStatus(item, text) {
    const p = item.root.querySelector('[data-item-status]');
    if (p) p.textContent = text;
    item.root.dataset.state = item.state;
    const indicator = item.root.querySelector('[data-status-indicator]');
    if (indicator) {
      indicator.className = `batch-status-pill is-${item.state}`;
      const iconMap = {
        waiting: '<i class="fa-regular fa-clock"></i>',
        scanning: '<i class="fa-solid fa-spinner fa-spin"></i>',
        ready: '<i class="fa-solid fa-check"></i>',
        sent: '<i class="fa-solid fa-cloud-arrow-up"></i>',
        review: '<i class="fa-solid fa-pen-nib"></i>',
        error: '<i class="fa-solid fa-triangle-exclamation"></i>'
      };
      indicator.innerHTML = iconMap[item.state] || '<i class="fa-solid fa-circle-dot"></i>';
    }
  }

  async scan(generation) {
    for (const item of this.items) {
      if (generation !== this.generation) break;
      if (!['waiting', 'error'].includes(item.state)) continue;
      item.state = 'scanning';
      this.itemStatus(item, 'AI raqamlarni o‘qimoqda va hero ikonkalari bilan solishtirmoqda…');
      await item.worker.scanImages({ automatic: true });
      if (generation !== this.generation) break;
      try {
        if (item.worker.ocrSource !== 'ocr') throw new Error('Scan yakunlanmadi. Qayta o‘qish mumkin.');
        const payload = item.worker.collectDraft();
        if (item.group.result && payload.draft.result !== item.group.result) throw new Error('Natija juftlash bosqichiga mos kelmadi. Tekshiring.');
        item.state = 'ready';
        this.itemStatus(item, this.summary(payload.draft));
      } catch (e) {
        item.state = 'error';
        this.itemStatus(item, e.message);
        item.worker.container.hidden = false;
      }
    }
    if (generation === this.generation) {
      this.status('O‘qish tugadi. Tayyor matchlarni bitta tugma bilan yuboring; faqat kerak bo‘lsa tahrirlang.');
      window.eclipseAudio?.playSuccess?.();
      this.updateControls();
    }
  }

  summary(draft) {
    return `Tayyor · ${draft.date} · ${draft.matchType} · ${draft.result.toUpperCase()} · ${draft.playerStats.map(r => `${r.heroUsed} ${r.kills}/${r.deaths}/${r.assists}`).join(' / ')}`;
  }

  async send(generation) {
    if (this.app.cloudSync.getStatus().pending) throw new Error('Avval lokal o‘zgarishlar cloudga saqlansin.');
    let sent = 0;
    for (const item of this.items) {
      if (generation !== this.generation) break;
      if (!['ready', 'review'].includes(item.state)) continue;
      const controls = [...item.worker.container.querySelectorAll('input,select,textarea,button')].map(el => [el, el.disabled]);
      try {
        const payload = item.worker.collectDraft();
        payload.draft.sourceBattleId = item.group.battleId;
        if (item.group.result && payload.draft.result !== item.group.result && !confirm('Natija skrinshot juftligidan farq qiladi. Qo‘lda tuzatilgan natija yuborilsinmi?')) continue;
        controls.forEach(([el]) => { el.disabled = true; });
        const result = await item.worker.request('POST', { ...payload, ...(this.app.authManager.isAdmin() ? { action: 'save' } : {}) });
        item.state = 'sent';
        sent++;
        this.itemStatus(item, result.match ? 'Saqlandi · statistikaga qo‘shildi' : result.reviewRequired ? 'Captain navbatida · ehtimoliy takror tekshiruvi' : 'Captain tasdig‘iga yuborildi');
        item.worker.container.hidden = true;
        item.root.querySelector('[data-edit]').disabled = true;
        item.worker.images = [null, null];
        item.root.querySelector('.batch-preview').replaceChildren();
      } catch (e) {
        controls.forEach(([el, disabled]) => { el.disabled = disabled; });
        this.itemStatus(item, e.message);
        if (['DUPLICATE_SUBMISSION'].includes(e.code)) {
          item.state = 'sent';
          item.worker.images = [null, null];
          item.root.querySelector('.batch-preview').replaceChildren();
          item.worker.container.hidden = true;
          item.root.querySelector('[data-edit]').disabled = true;
          this.itemStatus(item, 'Bu match oldin yuborilgan. Yangi nusxa yaratilmagan.');
        } else {
          item.state = 'review';
          if ([401, 429, 503].includes(e.status)) break;
        }
      }
    }
    if (sent) await this.app.cloudSync.syncDown();
    if (generation === this.generation) {
      this.status(`${sent} match yuborildi. Yuborilganlar qayta yuborilmaydi.`);
      window.eclipseAudio?.playSuccess?.();
      this.updateControls();
    }
  }
}
if (typeof window !== 'undefined') {
  window.BatchUpload = BatchUpload;
}
