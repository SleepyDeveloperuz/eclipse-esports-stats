import { groupBatchFiles } from './batch-model.js?v=2.27.0';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
export class BatchUpload {
  constructor(app) { this.app = app; this.items = []; this.generation = 0; this.busy = false; this.admin = app.authManager.isAdmin();
    window.addEventListener('beforeunload', e => { if (this.items.some(i => i.state !== 'sent')) { e.preventDefault(); e.returnValue = ''; } });
  }
  render() {
    this.container = document.getElementById('batchContainer');
    if (this.container.children.length) return;
    this.container.innerHTML = `<header class="progress-heading"><div><p class="section-eyebrow">ECLIPSE / MULTI-MATCH</p><h2>One session. One upload.</h2><p>10 tagacha rasm · 5 tagacha match. Scoreboard va Damage rasmlari Battle ID orqali juftlanadi.</p></div></header>
      <p class="progress-note">Rasmlar faqat shu tab xotirasida turadi. AI limiti odatdagidek: juftlash uchun 1 so‘rov, har match uchun 1 scan. Natijalarni yuborishdan oldin qisqa preview chiqadi. Noaniq juftlar aralashtirilmaydi.</p>
      <div class="progress-filters"><label>Skrinshotlar<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" id="batchFiles" class="form-input"></label><label>Sana ko‘rinmagan rasmlar uchun<input type="date" class="form-input" id="batchDate" value="${today()}" required></label><label>Match turi<select class="form-select" id="batchType"><option value="ranked">Ranked</option><option value="casual">Casual</option><option value="scrim">Scrim</option><option value="tournament">Tournament</option></select></label></div>
      <div class="batch-toolbar"><button class="btn btn-primary" data-batch="index">Rasmlarni juftlash va o‘qish</button><button class="btn btn-secondary" data-batch="scan">Qolganlarini o‘qish</button><button class="btn btn-primary" data-batch="send">Tayyor matchlarni yuborish</button><button class="btn btn-secondary" data-batch="stop">To‘xtatish</button><button class="btn btn-secondary" data-batch="clear">Navbatni tozalash</button></div><p id="batchStatus" role="status" aria-live="polite"></p><div id="batchUnresolved"></div><div class="batch-queue" id="batchQueue"></div>`;
    this.container.querySelectorAll('[data-batch]').forEach(b => b.onclick = () => this.run(b.dataset.batch));
    this.updateControls();
  }
  onAuthChange() {
    if (this.admin === this.app.authManager.isAdmin()) return;
    this.admin = this.app.authManager.isAdmin();
    if (this.container) { this.clear(); this.container.replaceChildren(); }
    if (document.getElementById('page-batch')?.classList.contains('active')) this.render();
  }
  status(message) { this.container.querySelector('#batchStatus').textContent = message; }
  updateControls() {
    this.container.querySelectorAll('[data-batch]').forEach(b => {
      b.disabled = b.dataset.batch === 'stop' ? !this.busy : this.busy || (['scan', 'send', 'clear'].includes(b.dataset.batch) && !this.items.length);
    });
    this.container.querySelectorAll('#batchFiles,#batchDate,#batchType').forEach(el => el.disabled = this.busy);
  }
  stop() { this.generation++; this.controller?.abort(); this.items.forEach(i => { if (i.state === 'scanning') { i.worker.invalidateOcrWork(); i.state = 'waiting'; this.itemStatus(i, 'To‘xtatildi · qayta o‘qish mumkin'); } }); this.status('Navbat to‘xtatildi. Saqlangan matchlar o‘zgarmaydi.'); }
  async run(action) {
    if (action === 'stop') { this.stop(); return; }
    if (this.busy) return;
    if (action === 'clear') {
      if (this.items.some(i => i.state !== 'sent') && !confirm('Yuborilmagan batch va rasmlar xotiradan o‘chirilsinmi?')) return;
      this.clear(); return;
    }
    this.busy = true; const generation = ++this.generation; this.updateControls();
    try {
      if (action === 'index') await this.index(generation);
      if (['index', 'scan'].includes(action) && generation === this.generation) await this.scan(generation);
      if (action === 'send') await this.send(generation);
    } catch (e) { if (generation === this.generation) this.status(e.message); }
    finally { this.busy = false; this.updateControls(); }
  }
  clear() {
    this.stop(); this.items.forEach(i => { i.worker.invalidateOcrWork(); document.removeEventListener('paste', i.worker.pasteHandler); });
    this.items = []; this.container.querySelector('#batchQueue').replaceChildren(); this.container.querySelector('#batchUnresolved').replaceChildren(); this.container.querySelector('#batchFiles').value = ''; this.status('Navbat tozalandi.'); this.updateControls();
  }
  async imageData(file, width = 1600) {
    window.EclipseImageUpload.validate(file, 8 * 1024 * 1024);
    if (window.EclipseImageUpload.isHeic(file)) file = await window.EclipseImageUpload.toJpeg(file, { signal: this.controller?.signal });
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); if (!img.width || !img.height || img.width * img.height > 24000000) throw new Error('Rasm o‘lchami juda katta.');
      const scale = Math.min(1, width / Math.max(img.width, img.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); return canvas.toDataURL('image/jpeg', .88);
    } finally { URL.revokeObjectURL(url); }
  }
  async index(generation) {
    if (this.items.length) throw new Error('Yangi batch uchun avval navbatni tozalang.');
    const files = [...this.container.querySelector('#batchFiles').files];
    if (!files.length || files.length > 10) throw new Error('1–10 ta skrinshot tanlang.');
    const fallback = this.container.querySelector('#batchDate'); if (!fallback.checkValidity() || !fallback.value) throw new Error('Sana tanlang.');
    this.controller = new AbortController();
    this.status('Rasmlar tayyorlanmoqda (HEIC bo‘lsa JPEG’ga aylantiriladi)…');
    const images = []; for (const file of files) { images.push(await this.imageData(file)); if (generation !== this.generation) return; }
    if (JSON.stringify(images).length > 3700000) throw new Error('Rasmlar umumiy hajmi katta. Bu batchga kamroq rasm tanlang.');
    this.controller = new AbortController();
    this.status('Battle ID va rasm turi tekshirilmoqda…');
    const response = await fetch('/api/ocr', { method: 'POST', signal: this.controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.app.authManager.getAccessToken()}` }, body: JSON.stringify({ purpose: 'practice_submission', mode: 'batch_index', images }) });
    const result = await response.json(); if (generation !== this.generation) return;
    if (!response.ok || !result.data?.files) throw new Error(result.error || 'Juftlash bajarilmadi.');
    const grouped = groupBatchFiles(result.data.files);
    this.container.querySelector('#batchUnresolved').innerHTML = grouped.unresolved.map(f => `<p class="progress-note">${esc(files[f.index]?.name)}: ${esc(f.reason)}</p>`).join('');
    if (grouped.matches.length > 5) throw new Error('Bir batchda ko‘pi bilan 5 match.');
    for (const group of grouped.matches) this.addItem(group, images, files, fallback.value, this.container.querySelector('#batchType').value);
    this.status(`${this.items.length} match juftlandi. ${grouped.unresolved.length} rasm avtomatik olinmadi.`);
  }
  addItem(group, images, files, fallbackDate, matchType) {
    const root = document.createElement('article'); root.className = 'batch-item';
    root.innerHTML = `<header><div><strong>Match ${this.items.length + 1}</strong><p>Battle ID ${esc(group.battleId)} · ${group.damage ? 'Scoreboard + Damage' : 'Faqat Scoreboard'}</p></div><button type="button" class="btn btn-secondary" data-edit>Ko‘rish / tahrirlash</button></header><p data-item-status role="status">Navbatda</p><div class="batch-preview">${[group.score, group.damage].filter(Boolean).map(f => `<img src="${images[f.index]}" alt="${esc(files[f.index].name)}">`).join('')}</div><div class="batch-worker" hidden></div>`;
    this.container.querySelector('#batchQueue').append(root);
    const worker = new window.SubmissionManager(this.app.authManager, this.app.dataStore, this.app.heroDb, this.app.cloudSync);
    worker.container = root.querySelector('.batch-worker'); worker.container.innerHTML = worker.formMarkup();
    worker.saveDraft = () => { worker.formDirty = true; }; worker.clearSavedDraft = () => {}; worker.draftKey = () => 'eclipse_batch_memory_only';
    worker.readImage = () => { this.status('Rasmni almashtirish uchun yangi batch oching — Battle ID juftligi saqlanadi.'); };
    worker.submitForm = e => { e.preventDefault(); this.status('Batchdagi tayyor matchlarni yuqoridagi tugma orqali yuboring.'); };
    worker.bindForm(); document.removeEventListener('paste', worker.pasteHandler);
    worker.container.querySelector('[data-clear-draft]').hidden = true;
    worker.container.querySelector('#practiceSubmitBtn').hidden = true;
    worker.container.querySelectorAll('input[type=file],[data-remove-index]').forEach(el => el.disabled = true);
    worker.container.querySelectorAll('[data-drop-index]').forEach(el => el.hidden = true);
    worker.images = [images[group.score.index], group.damage ? images[group.damage.index] : null];
    worker.imageNames = [files[group.score.index].name, group.damage ? files[group.damage.index].name : '']; worker.updateImageSlots();
    worker.container.querySelector('#practiceDate').value = group.date || fallbackDate; worker.container.querySelector('#practiceMatchType').value = matchType;
    const item = { group, worker, root, state: 'waiting' }; this.items.push(item);
    root.querySelector('[data-edit]').onclick = () => { worker.container.hidden = !worker.container.hidden; };
    worker.container.addEventListener('change', () => { if (!this.busy && item.state !== 'sent') { item.state = 'review'; this.itemStatus(item, 'Tahrirlandi · yuborishda tekshiriladi'); } });
  }
  itemStatus(item, text) { item.root.querySelector('[data-item-status]').textContent = text; }
  async scan(generation) {
    for (const item of this.items) {
      if (generation !== this.generation) break;
      if (!['waiting', 'error'].includes(item.state)) continue;
      item.state = 'scanning'; this.itemStatus(item, 'AI raqamlarni o‘qimoqda va hero ikonkalari bilan solishtirmoqda…');
      await item.worker.scanImages({ automatic: true });
      if (generation !== this.generation) break;
      try {
        if (item.worker.ocrSource !== 'ocr') throw new Error('Scan yakunlanmadi. Qayta o‘qish mumkin.');
        const payload = item.worker.collectDraft();
        if (item.group.result && payload.draft.result !== item.group.result) throw new Error('Natija juftlash bosqichiga mos kelmadi. Tekshiring.');
        item.state = 'ready'; this.itemStatus(item, this.summary(payload.draft));
      } catch (e) { item.state = 'error'; this.itemStatus(item, e.message); item.worker.container.hidden = false; }
    }
    if (generation === this.generation) this.status('O‘qish tugadi. Tayyor matchlarni bitta tugma bilan yuboring; faqat kerak bo‘lsa tahrirlang.');
  }
  summary(draft) { return `Tayyor · ${draft.date} · ${draft.matchType} · ${draft.result.toUpperCase()} · ${draft.playerStats.map(r => `${r.heroUsed} ${r.kills}/${r.deaths}/${r.assists}`).join(' / ')}`; }
  async send(generation) {
    if (this.app.cloudSync.getStatus().pending) throw new Error('Avval lokal o‘zgarishlar cloudga saqlansin.');
    let sent = 0;
    for (const item of this.items) {
      if (generation !== this.generation) break;
      if (!['ready', 'review'].includes(item.state)) continue;
      const controls = [...item.worker.container.querySelectorAll('input,select,textarea,button')].map(el => [el, el.disabled]);
      try {
        const payload = item.worker.collectDraft(); payload.draft.sourceBattleId = item.group.battleId;
        if (item.group.result && payload.draft.result !== item.group.result && !confirm('Natija skrinshot juftligidan farq qiladi. Qo‘lda tuzatilgan natija yuborilsinmi?')) continue;
        controls.forEach(([el]) => { el.disabled = true; });
        const result = await item.worker.request('POST', { ...payload, ...(this.app.authManager.isAdmin() ? { action: 'save' } : {}) });
        item.state = 'sent'; sent++;
        this.itemStatus(item, result.match ? 'Saqlandi · statistikaga qo‘shildi' : result.reviewRequired ? 'Captain navbatida · ehtimoliy takror tekshiruvi' : 'Captain tasdig‘iga yuborildi');
        item.worker.container.hidden = true; item.root.querySelector('[data-edit]').disabled = true;
        item.worker.images = [null, null]; item.root.querySelector('.batch-preview').replaceChildren();
      } catch (e) {
        controls.forEach(([el, disabled]) => { el.disabled = disabled; });
        this.itemStatus(item, e.message);
        if (['DUPLICATE_SUBMISSION'].includes(e.code)) { item.state = 'sent'; item.worker.images = [null, null]; item.root.querySelector('.batch-preview').replaceChildren(); item.worker.container.hidden = true; item.root.querySelector('[data-edit]').disabled = true; this.itemStatus(item, 'Bu match oldin yuborilgan. Yangi nusxa yaratilmagan.'); }
        else { item.state = 'review'; if ([401, 429, 503].includes(e.status)) break; }
      }
    }
    if (sent) await this.app.cloudSync.syncDown();
    if (generation === this.generation) this.status(`${sent} match yuborildi. Yuborilganlar qayta yuborilmaydi.`);
  }
}
window.BatchUpload = BatchUpload;
