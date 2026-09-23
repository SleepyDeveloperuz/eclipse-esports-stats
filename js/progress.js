import { METRICS, eligibleMatches, observations, compareResults, heroJourney, weeklyReport, moments } from './progress-model.js?v=2.27.0';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
const scopeName = scope => scope === 'team5' ? 'Team 5' : 'Practice · 1–4';
const button = (action, label, disabled = false) => `<button type="button" class="btn btn-secondary" data-progress-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
export class ProgressHub {
  constructor(app) {
    this.app = app; this.tab = 'weekly'; this.scope = 'team5'; this.date = today(); this.playerId = ''; this.hero = ''; this.role = ''; this.matchType = 'ranked';
    this.data = null; this.reports = []; this.history = null; this.generation = 0;
  }
  async request(feature, body) {
    const response = await fetch(`/api/submissions${feature ? `?feature=${feature}` : ''}`, { method: body ? 'PATCH' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${this.app.authManager.getAccessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server bilan bog‘lanib bo‘lmadi.');
    return result;
  }
  async render() {
    this.container = document.getElementById('progressContainer');
    const generation = ++this.generation;
    this.container.innerHTML = '<p role="status">Eclipse Progress yuklanmoqda…</p>';
    try {
      const response = await fetch('/api/sync', { cache: 'no-store', headers: { Authorization: `Bearer ${this.app.authManager.getAccessToken()}` } });
      if (!response.ok) throw new Error('Statistika yuklanmadi. Qayta urinib ko‘ring.');
      const data = await response.json();
      const weekly = await this.request('weekly');
      const history = this.app.authManager.isAdmin() ? await this.request('history') : null;
      if (generation !== this.generation) return;
      this.data = data.data || data; this.reports = weekly.reports; this.history = history;
      if (!this.data.players?.some(p => p.id === this.playerId)) this.playerId = this.data.players?.[0]?.id || '';
      this.draw();
    } catch (error) {
      if (generation !== this.generation) return;
      this.container.innerHTML = `<p role="alert">${esc(error.message)}</p>${button('refresh', 'Qayta urinish')}`; this.bind();
    }
  }
  options(list, selected) { return list.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join(''); }
  select(key, label, options) { return `<label>${label}<select class="form-select" data-progress-filter="${key}">${this.options(options, this[key])}</select></label>`; }
  rows() { return observations(eligibleMatches(this.data, this.scope), this); }
  draw() {
    const tabs = [['weekly', 'Eclipse Weekly'], ['compare', 'Win vs Loss'], ['journey', 'Hero Journey'], ['moments', 'Eclipse Moments']];
    if (this.app.authManager.isAdmin()) tabs.push(['history', 'Corrections & Undo']);
    if (!tabs.some(([id]) => id === this.tab)) this.tab = 'weekly';
    const personal = ['compare', 'journey', 'moments'].includes(this.tab);
    const candidates = observations(eligibleMatches(this.data, this.scope), { playerId: this.playerId });
    const heroes = [...new Set(candidates.map(o => o.row.heroUsed))].filter(Boolean).sort();
    if (this.hero && !heroes.includes(this.hero)) this.hero = '';
    this.container.innerHTML = `<header class="progress-heading"><div><p class="section-eyebrow">ECLIPSE / PROGRESS</p><h2>Your next chapter.</h2><p>O‘zingizning natijalaringiz. Aniq kontekst. Haqiqiy o‘sish.</p></div>${button('refresh', 'Yangilash')}</header>
      <nav class="progress-tabs" aria-label="Progress bo‘limlari">${tabs.map(([id, label]) => `<button type="button" data-progress-tab="${id}" aria-pressed="${id === this.tab}">${label}</button>`).join('')}</nav>
      <div class="progress-filters">${this.tab !== 'history' ? this.select('scope', 'Statistika tarkibi', [['team5', 'Team 5'], ['squad', 'Practice · 1–4']]) : ''}
      ${this.tab === 'weekly' ? `<label>Hafta sanasi<input type="date" class="form-input" data-progress-filter="date" value="${esc(this.date)}"></label>` : ''}
      ${personal ? this.select('playerId', 'O‘yinchi', this.data.players.map(p => [p.id, `${p.name}${p.active === false ? ' · arxiv' : ''}`]))
        + this.select('hero', 'Qahramon', [['', 'Barcha qahramonlar'], ...heroes.map(h => [h, h])])
        + this.select('role', 'Layn', [['', 'Barcha laynlar'], ...['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'].map(r => [r, r])])
        + this.select('matchType', 'Match turi', [['ranked', 'Ranked'], ['scrim', 'Scrim'], ['tournament', 'Tournament'], ['casual', 'Casual']]) : ''}</div>
      <div class="progress-content">${this.tab === 'weekly' ? this.weeklyMarkup() : this.tab === 'compare' ? this.compareMarkup() : this.tab === 'journey' ? this.journeyMarkup() : this.tab === 'moments' ? this.momentsMarkup() : this.historyMarkup()}</div>
      <p class="progress-feedback" role="status" aria-live="polite"></p>`;
    this.bind();
  }
  weeklyMarkup() {
    const draft = weeklyReport(this.data, this.date, this.scope);
    const saved = this.reports.find(r => r.start === draft.start && r.scope === draft.scope);
    const admin = this.app.authManager.isAdmin();
    const report = admin ? draft : saved;
    this.shownReport = report;
    return `${admin ? `<p class="progress-note">Captain preview · bazadan avtomatik hisoblangan. Publish qilgach jamoa saqlangan hisobotni ko‘radi.${saved ? ` Oldingi nashr: ${esc(saved.publishedAt.slice(0, 10))}.` : ''}</p>` : ''}
      ${report ? `<article class="progress-report"><p class="section-eyebrow">ECLIPSE WEEKLY / ${esc(scopeName(report.scope))}</p><h3>${report.start} — ${report.end}</h3>
      <p>${report.publishedAt ? `Nashr paytidagi snapshot · ${esc(report.publishedAt.slice(0, 16).replace('T', ' '))} UTC. Keyingi matchlar bu nashrni avtomatik o‘zgartirmaydi.` : 'Joriy bazadan preview.'}${report.end >= today() ? ' Hafta hali davom etmoqda.' : ''}</p>
      <div class="progress-numbers"><div><strong>${report.count}</strong><span>MATCH</span></div><div><strong>${fmt(report.winRate)}%</strong><span>${report.wins} W / ${report.losses} L</span></div></div>
      <p>${report.count < 5 ? 'Kichik sample — yo‘nalish haqida xulosa qilishga hali erta.' : 'Shu haftadagi qayd etilgan natijalar.'}</p>
      <div class="progress-table-wrap"><table><caption>Har bir a’zoning haftasi</caption><thead><tr><th>O‘yinchi</th><th>Match</th><th>W / L</th><th>MVP</th><th>Damage / min</th></tr></thead><tbody>${report.players.map(p => `<tr><th>${esc(p.name)}</th><td>${p.count}</td><td>${p.wins} / ${p.count - p.wins}</td><td>${p.mvps}</td><td>${fmt(p.metrics.damagePerMinute.mean)} <small>n=${p.metrics.damagePerMinute.n}</small></td></tr>`).join('')}</tbody></table></div>
      <p>Ko‘p tanlangan hero: ${report.heroes.map(([name, n]) => `${esc(name)} ×${n}`).join(' · ') || '—'}</p>
      ${button('weekly-png', 'PNG yuklab olish', !report.count)} ${admin ? button('publish', saved ? 'Hisobotni qayta publish qilish' : 'Jamoaga publish qilish', !report.count) : ''} ${admin && saved ? button('unpublish', 'Unpublish') : ''}</article>`
        : '<div class="progress-empty"><h3>Bu hafta hali publish qilinmagan.</h3><p>Captain hisobotni ko‘rib chiqqach shu yerda paydo bo‘ladi.</p></div>'}
      <details class="progress-archive"><summary>Nashrlar arxivi · ${this.reports.length}</summary>${[...this.reports].sort((a, b) => b.start.localeCompare(a.start)).map(r => `<button type="button" data-report="${esc(r.id)}">${r.start} · ${esc(scopeName(r.scope))} · ${r.count} match</button>`).join('') || '<p>Hali hisobot yo‘q.</p>'}</details>`;
  }
  metricTable(left, right, labels) {
    return `<div class="progress-table-wrap"><table><caption>Ma’lum qiymatlar bo‘yicha o‘rtacha · n = metrika mavjud matchlar</caption><thead><tr><th>Metrika</th><th>${labels[0]}</th><th>${labels[1]}</th><th>Farq</th></tr></thead><tbody>${Object.entries(METRICS).map(([key, label]) => {
      const a = left.metrics[key], b = right.metrics[key], diff = a.mean === null || b.mean === null ? null : b.mean - a.mean;
      return `<tr><th>${label}</th><td>${fmt(a.mean)} <small>n=${a.n}</small></td><td>${fmt(b.mean)} <small>n=${b.n}</small></td><td>${diff > 0 ? '+' : ''}${fmt(diff)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  compareMarkup() {
    const result = compareResults(this.rows());
    return `<article class="progress-report"><p class="section-eyebrow">OBSERVE / DON'T ASSUME</p><h3>Win vs Loss — what changes?</h3><p>${result.win.count} Win · ${result.loss.count} Loss · ${esc(scopeName(this.scope))} · ${esc(this.matchType)} · Barcha vaqt</p>
      <p class="progress-note">${result.early ? 'Har ikki tomonda kamida 5 match bo‘lmaguncha xulosa qilishga erta. ' : ''}${!this.hero || !this.role ? 'Turli hero yoki layn aralashgan. Aniqroq taqqoslash uchun ikkalasini tanlang. ' : ''}Farq mag‘lubiyat sababini isbotlamaydi. Raqib kuchi va match sharoiti tenglashtirilmagan.</p>
      ${this.metricTable(result.loss, result.win, ['Loss', 'Win'])}<p>Farq = Win − Loss. Yetishmagan metrikalar nolga aylantirilmaydi.</p></article>`;
  }
  journeyMarkup() {
    if (!this.hero) return '<div class="progress-empty"><h3>Qaysi hero bilan yo‘lingizni ko‘ramiz?</h3><p>Yuqoridan bitta qahramonni tanlang.</p></div>';
    const result = heroJourney(this.rows()), player = this.data.players.find(p => p.id === this.playerId);
    const pool = player?.heroPool?.find(h => h.heroName === this.hero);
    return `<article class="progress-report"><p class="section-eyebrow">HERO JOURNEY / ${esc(pool?.status || 'Captain status belgilanmagan')}</p><h3>${esc(this.hero)}</h3><p>${result.count} match · ${esc(this.matchType)} · ${esc(this.role || 'Barcha laynlar')}</p>
      ${!result.window ? '<p>Taqqoslash uchun kamida 2 ta match kerak.</p>' : `<p>Dastlabki ${result.window} va eng so‘nggi ${result.window} match. Guruhlar takrorlanmaydi.${result.window < 5 ? ' Hali kichik sample.' : ''}</p>
      ${this.metricTable(result.first, result.recent, ['Dastlabki', 'So‘nggi'])}<p>Win rate: ${fmt(result.first.winRate)}% → ${fmt(result.recent.winRate)}%. ${result.excludedMiddle} ta o‘rtadagi match taqqoslashga kirmagan.</p>`}
      <h4>Yuqori ratingli matchlar</h4>${result.best.map(o => this.matchLine(o)).join('') || '<p>Rating ma’lumoti yo‘q.</p>'}<p class="progress-note">Bu qayd etilgan natijalar yo‘nalishi; avtomatik “mastery” bahosi emas. ${!this.role ? 'Laynlar aralashgan bo‘lishi mumkin.' : ''}</p></article>`;
  }
  matchLine(o) { return `<div class="progress-match"><span>${esc(o.match.date)} · ${o.match.result === 'win' ? 'W' : 'L'} · ${esc(o.row.heroUsed)} · ${o.row.kills}/${o.row.deaths}/${o.row.assists}</span><strong>${fmt(o.row.inGameScore)}</strong></div>`; }
  momentsMarkup() {
    const rows = this.rows(); this.momentList = moments(rows);
    return `<p class="progress-note">Rekordlar faqat tanlangan tarkib, hero, layn va match turidagi saqlangan natijalar orasidan olinadi. Bir xil rekordlar “teng rekord” deb belgilanadi.</p>
      <div class="moment-grid">${this.momentList.map((o, i) => `<article class="progress-report moment-card"><p class="section-eyebrow">ECLIPSE MOMENT</p><h3>${esc(o.row.heroUsed)}</h3>${this.matchLine(o)}<p>${o.reasons.map(esc).join('<br>')}</p>${button(`moment-${i}`, 'Moment PNG')}</article>`).join('') || '<div class="progress-empty"><h3>Hali rekord yoki MVP topilmadi.</h3><p>Istalgan qayd etilgan matchni pastdan tanlab kartochka yaratishingiz mumkin.</p></div>'}</div>
      ${rows.length ? `<label class="progress-pick">Shaxsiy tanlov<select class="form-select" id="momentPick">${this.options([...rows].reverse().map(o => [o.match.id, `${o.match.date} · ${o.row.heroUsed} · ${o.match.result === 'win' ? 'W' : 'L'}`]), '')}</select></label>${button('moment-picked', 'Tanlangan match PNG')}` : ''}`;
  }
  historyMarkup() {
    if (!this.app.authManager.isAdmin()) return '';
    const entries = this.history?.entries || [];
    return `<p class="progress-note">v2.27 dan boshlangan tahrirlar va o‘chirishlar. Oxirgi 200 yozuv / 900 KB saqlanadi. ${this.history?.pruned || 0} eski yozuv arxiv chegarasi tufayli chiqarilgan. To‘liq tiklash uchun Mac backup ham saqlanadi.</p>
      ${[...entries].reverse().map(event => {
        const later = entries.slice(entries.indexOf(event) + 1).some(e => e.matchId === event.matchId);
        return `<details class="progress-correction"><summary>${esc(event.at)} · ${esc(event.before?.date || event.after?.date)} · ${esc(event.action)}${event.undoneAt ? ' · qaytarilgan' : ''}</summary>
          <p>Match: ${esc(event.matchId)} · Captain / admin session</p><div class="progress-table-wrap"><table><thead><tr><th>Maydon</th><th>Oldin</th><th>Keyin</th></tr></thead><tbody>${diffFields(event.before, event.after, this.data.players).map(([key, before, after]) => `<tr><th>${esc(key)}</th><td>${esc(before)}</td><td>${esc(after)}</td></tr>`).join('')}</tbody></table></div>
          ${button(`undo-${event.id}`, 'Shu o‘zgarishni qaytarish', !!event.undoneAt || later || !event.before)}${later ? '<p>Keyinroq tahrirlangan — avval eng so‘nggi holatni tekshiring.</p>' : ''}</details>`;
      }).join('') || '<div class="progress-empty"><h3>Hozircha correction yo‘q.</h3><p>Yangi tahrir va o‘chirishlar shu yerdan tiklanadi.</p></div>'}`;
  }
  bind() {
    this.container.querySelectorAll('[data-progress-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.progressTab; this.draw(); });
    this.container.querySelectorAll('[data-progress-filter]').forEach(el => el.onchange = () => { if (el.value || el.dataset.progressFilter !== 'date') this[el.dataset.progressFilter] = el.value; this.draw(); });
    this.container.querySelectorAll('[data-report]').forEach(el => el.onclick = () => { const report = this.reports.find(r => r.id === el.dataset.report); this.date = report.start; this.scope = report.scope; this.draw(); });
    this.container.querySelectorAll('[data-progress-action]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await this.action(b.dataset.progressAction); }
      catch (e) { const status = this.container.querySelector('.progress-feedback'); if (status) status.textContent = e.message; window.showToast?.(e.message, 'error'); }
      finally { if (b.isConnected) b.disabled = false; }
    });
  }
  async action(action) {
    if (action === 'refresh') return this.render();
    if (action === 'weekly-png') return exportProgressPng(this.app, { report: this.shownReport, draft: this.app.authManager.isAdmin() });
    if (action.startsWith('moment-')) {
      const o = action === 'moment-picked' ? this.rows().find(o => o.match.id === this.container.querySelector('#momentPick').value) : this.momentList[Number(action.slice(7))];
      return exportProgressPng(this.app, { moment: o, player: this.data.players.find(p => p.id === this.playerId), scope: this.scope });
    }
    if (!this.app.authManager.isAdmin()) throw new Error('Faqat Captain uchun.');
    if (this.app.cloudSync.getStatus().pending || this.app.cloudSync.getStatus().syncing) throw new Error('Avval mahalliy o‘zgarishlarni cloudga saqlang.');
    if (action.startsWith('undo-')) {
      if (!confirm('Oldingi match holati tiklansinmi? Ushbu amal ham tarixga yoziladi.')) return;
      await this.request('', { action: 'undo_match', id: action.slice(5), expectedRevision: this.history.revision });
      await this.app.cloudSync.syncDown();
    } else if (['publish', 'unpublish'].includes(action)) {
      if (action === 'unpublish' && !confirm('Haftalik hisobot jamoa ko‘rinishidan olib tashlansinmi? Matchlar o‘zgarmaydi.')) return;
      await this.request('', { action: action === 'publish' ? 'publish_weekly' : 'unpublish_weekly', date: this.date, scope: this.scope, expectedRevision: this.data.revision });
    }
    await this.render();
  }
}
export function diffFields(before, after, players = []) {
  const labels = { date: 'Sana', result: 'Natija', scope: 'Tarkib', notes: 'Izoh', heroUsed: 'Qahramon', rolePlayed: 'Layn', kills: 'Kills', deaths: 'Deaths', assists: 'Assists', damageDealt: 'Damage', goldEarned: 'Gold', medal: 'Medal', inGameScore: 'Rating', durationSeconds: 'Davomiylik (sekund)' };
  const flatten = (value, prefix = '') => {
    if (value === null || typeof value !== 'object') return [[prefix || 'Match', value === null ? '—' : String(value)]];
    if (Array.isArray(value) && prefix === 'playerStats') return value.flatMap(row => flatten(row, players.find(p => p.id === row.playerId)?.name || row.playerId));
    return Object.entries(value).flatMap(([key, v]) => flatten(v, prefix ? `${prefix}.${key}` : key));
  };
  const a = new Map(flatten(before)), b = new Map(flatten(after));
  return [...new Set([...a.keys(), ...b.keys()])].filter(key => a.get(key) !== b.get(key)).map(key => [key.split('.').map(k => labels[k] || k).join(' · '), a.get(key) ?? '—', b.get(key) ?? '—']);
}
export async function exportProgressPng(app, { report, draft, moment, player, scope }) {
  if (!report && !moment) throw new Error('Kartochka uchun ma’lumot topilmadi.');
  const height = report ? Math.max(760, 510 + report.players.length * 64) : 900;
  const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#090b10'; ctx.fillRect(0, 0, 1400, height);
  const glow = ctx.createRadialGradient(1160, 160, 50, 1160, 160, 510); glow.addColorStop(0, '#8d632440'); glow.addColorStop(1, '#090b1000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, 1400, height);
  ctx.strokeStyle = '#e9c86c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(1190, 170, 128, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#090b10'; ctx.beginPath(); ctx.arc(1190, 170, 117, 0, Math.PI * 2); ctx.fill();
  const text = (value, x, y, size = 24, color = '#eae8e0', maxWidth = 1180) => { ctx.fillStyle = color; ctx.font = `${size >= 36 ? '700 ' : ''}${size}px sans-serif`; ctx.fillText(String(value), x, y, maxWidth); };
  text('ECLIPSE / ' + (report ? 'WEEKLY' : 'MOMENTS'), 80, 90, 25, '#e9c86c');
  if (report) {
    text(`${scopeName(report.scope)} · ${report.start}`, 80, 172, 50, '#f8f5ea', 950);
    text(`${report.count} MATCH   /   ${report.wins} W · ${report.losses} L   /   ${fmt(report.winRate)}%`, 80, 250, 34);
    text(draft ? 'CAPTAIN PREVIEW · QAYD ETILGAN NATIJALAR' : 'PUBLISHED · QAYD ETILGAN NATIJALAR', 80, 305, 19, '#a9aaa7');
    text('O‘YINCHI', 80, 380, 18, '#a9aaa7'); text('MATCH', 690, 380, 18, '#a9aaa7'); text('W / L', 870, 380, 18, '#a9aaa7'); text('MVP', 1110, 380, 18, '#a9aaa7');
    report.players.forEach((p, i) => { const y = 440 + i * 64; text(p.name, 80, y, 26, '#f8f5ea', 560); text(p.count, 710, y, 26); text(`${p.wins} / ${p.count - p.wins}`, 870, y, 26); text(p.mvps, 1130, y, 26, '#e9c86c'); });
    text(report.heroes.map(([h, n]) => `${h} ×${n}`).join('  ·  '), 80, height - 85, 22, '#e9c86c');
  } else {
    const hero = app.heroDb?.resolve?.(moment.row.heroUsed) || app.heroDatabase?.resolve?.(moment.row.heroUsed);
    const id = moment.row.heroId || hero?.id;
    if (id) {
      let url;
      try {
        const response = await fetch(`/api/mlbb-image?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${app.authManager.getAccessToken()}` }, signal: AbortSignal.timeout(10000) });
        if (response.ok) { url = URL.createObjectURL(await response.blob()); const img = new Image(); img.src = url; await img.decode(); ctx.save(); ctx.beginPath(); ctx.arc(1120, 455, 150, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, 970, 305, 300, 300); ctx.restore(); }
      } catch { /* A portrait outage must not block a factual card. */ }
      finally { if (url) URL.revokeObjectURL(url); }
    }
    text(player?.name || 'Eclipse player', 80, 210, 64, '#f8f5ea', 930);
    text(moment.row.heroUsed, 80, 290, 45, '#e9c86c', 840);
    text(`${moment.match.date} · ${scopeName(scope)} · ${moment.match.matchType}`, 80, 350, 24, '#b9bbb9', 840);
    text(`${moment.match.result === 'win' ? 'WIN' : 'LOSS'}  /  ${moment.row.kills} · ${moment.row.deaths} · ${moment.row.assists}`, 80, 475, 54, '#f8f5ea', 800);
    text(`Rating ${fmt(moment.row.inGameScore)}  ·  ${String(moment.row.medal || 'medal —').toUpperCase()}`, 80, 550, 30, '#e9c86c', 800);
    (moment.reasons || ['Shaxsiy tanlangan match']).forEach((reason, i) => text(reason, 80, 640 + i * 42, 24, '#c4c9c5'));
  }
  text('OUTWORK. OUTTHINK. OUTPLAY.  /  eclipse-esports-stats.vercel.app', 80, height - 35, 18, '#91978f');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG yaratilmagan. Qayta urinib ko‘ring.');
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `eclipse-${report ? `weekly-${report.scope}-${report.start}` : `moment-${moment.match.id}`}.png`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.ProgressHub = ProgressHub;
