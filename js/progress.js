import { METRICS, eligibleMatches, observations, progressOverview, weeklyReport } from './progress-model.js?v=2.43.0';
import { FOCUS_METRICS, adjacentWeek, focusBaseline, focusSignals, compareFocus } from './weekly-focus-model.js?v=2.35.0';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = value => value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
const scopeName = scope => scope === 'team5' ? 'Team 5' : 'Practice · 1–4';
const button = (action, label, disabled = false) => `<button type="button" class="btn btn-secondary" data-progress-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
export class ProgressHub {
  constructor(app) {
    this.app = app;
    this.tab = 'overview'; this.scope = app.currentAnalyticsMode === 'squad' ? 'squad' : 'team5';
    this.date = today(); this.days = '30'; this.end = ''; this.playerId = ''; this.hero = ''; this.role = ''; this.matchType = '';
    this.evidenceLimit = 8; this.evidencePeriod = 'current';
    this.data = null; this.reports = []; this.focuses = []; this.focusRevision = 0; this.focusDrafts = new Map(); this.history = null; this.generation = 0;
  }
  async request(feature, body) {
    const response = await fetch(`/api/submissions${feature ? `?feature=${feature}` : ''}`, { method: body ? 'PATCH' : 'GET', cache: 'no-store',
      ...(!body && typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(15000) } : {}),
      headers: { Authorization: `Bearer ${this.app.authManager.getAccessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server bilan bog‘lanib bo‘lmadi.');
    return result;
  }
  async render() {
    this.container = document.getElementById('progressContainer');
    const generation = ++this.generation;
    if (!this.container) return;
    this.container.innerHTML = '<p role="status">Eclipse Progress yuklanmoqda…</p>';
    this.toolsLoading = true;
    this.localFallback = false;
    try {
      const response = await fetch('/api/sync', { cache: 'no-store',
        ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(15000) } : {}),
        headers: { Authorization: `Bearer ${this.app.authManager.getAccessToken()}` } });
      if (!response.ok) throw new Error('Statistika yuklanmadi. Qayta urinib ko‘ring.');
      const data = await response.json();
      if (generation !== this.generation) return;
      this.data = data.data || data;
      if (!this.data.players?.some(p => p.id === this.playerId)) this.playerId = '';
      this.draw();
    } catch (error) {
      if (generation !== this.generation) return;
      this.toolsLoading = false;
      const db = this.app.dataStore;
      if (db?.getMatches && db?.getPlayers) {
        this.data = { matches: db.getMatches(), players: db.getAllPlayers?.() || db.getPlayers() };
        this.localFallback = true;
        this.tab = 'overview';
        this.draw();
      } else {
        this.container.innerHTML = `<p role="alert">${esc(error.message)}</p>${button('refresh', 'Qayta urinish')}`;
        this.bind();
      }
      return;
    }

    const admin = this.app.authManager.isAdmin();
    const [weekly, history, quality] = await Promise.allSettled([
      this.request('weekly'), admin ? this.request('history') : null, admin ? this.request('scan_quality') : null
    ]);
    if (generation !== this.generation) return;
    this.toolsLoading = false;
    this.weeklyError = weekly.status === 'rejected';
    this.reports = weekly.value?.reports || [];
    this.focuses = weekly.value?.focuses || [];
    this.focusRevision = weekly.value?.focusRevision || 0;
    this.history = history.value;
    this.historyError = history.status === 'rejected';
    this.scanQuality = quality.status === 'rejected' ? { unavailable: true } : quality.value;
    if (this.tab !== 'overview') this.draw();
  }

  options(list, selected) { return list.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join(''); }
  select(key, label, options) { return `<label>${label}<select class="form-select" data-progress-filter="${key}">${this.options(options, this[key])}</select></label>`; }
  draw() {
    const views = [['overview', 'Natijalar'], ['weekly', 'Haftalik fokus']];
    if (this.app.authManager.isAdmin()) views.push(['history', 'Tahrirlar']);
    if (!views.some(([id]) => id === this.tab)) this.tab = 'overview';
    const toolbar = `<nav class="progress-destinations" aria-label="Progress bo‘limlari">${views.map(([id, label]) => `<button type="button" data-progress-tab="${id}" aria-pressed="${id === this.tab}">${label}</button>`).join('')}</nav>`;
    const tools = this.tab !== 'overview' && this.toolsLoading ? '<p role="status">Hisobotlar yuklanmoqda…</p>'
      : this.tab !== 'overview' && this.localFallback ? '<p role="alert">Bu bo‘lim uchun server bilan bog‘lanish kerak. Yangilab ko‘ring.</p>'
        : this.tab === 'weekly' ? `<div class="evidence-controls">${this.select('scope', 'Tarkib', [['team5', 'Team 5'], ['squad', 'Practice · 1–4']])}<label>Hafta sanasi<input type="date" data-progress-filter="date" value="${esc(this.date)}"></label></div>
      ${this.weeklyError ? '<p role="alert">Haftalik hisobot yuklanmadi. Yangilab ko‘ring.</p>' : this.weeklyMarkup()}` :
      this.tab === 'history' ? (this.historyError ? '<p role="alert">Tahrirlar tarixi yuklanmadi. Yangilab ko‘ring.</p>' : this.historyMarkup()) : '';
    this.container.innerHTML = `<section class="progress-workspace">
      <header class="evidence-heading"><div><h2>Eclipse Progress</h2><p>Joriy va oldingi davr natijalari</p></div>${button('refresh', 'Yangilash')}</header>
      ${toolbar}
      ${this.localFallback ? '<p role="status">Serverga ulanib bo‘lmadi. Qurilmadagi matchlar ko‘rsatilmoqda.</p>' : ''}
      ${this.tab === 'overview' ? this.overviewMarkup() : tools}
      <p class="progress-feedback" role="status" aria-live="polite"></p></section>`;
    this.bind();
  }

  overviewMarkup() {
    const visiblePlayers = this.data.players || [];
    const candidates = this.playerId ? observations(eligibleMatches(this.data, this.scope), { playerId: this.playerId, matchType: this.matchType }) : [];
    const heroes = [...new Set(candidates.map(o => o.row.heroUsed).filter(Boolean))].sort();
    if (!heroes.includes(this.hero)) this.hero = '';
    const report = progressOverview(this.data, this);
    const playerButtons = [['', 'Jamoa'], ...visiblePlayers.map(p => [p.id, p.name])];
    const controls = `<div class="progress-people" role="group" aria-label="Natijalar kimniki">${playerButtons.map(([id, name]) => `
      <button type="button" data-select-player="${esc(id)}" aria-pressed="${id === this.playerId}">${esc(name)}</button>`).join('')}</div>
      <div class="evidence-controls progress-period-tools">${this.select('scope', 'Tarkib', [['team5', 'Team 5'], ['squad', 'Practice · 1–4']])}
        ${this.select('days', 'Davr', [['7', '7 kun'], ['30', '30 kun'], ['90', '90 kun']])}
        <label>Davr oxiri<input type="date" data-progress-filter="end" value="${esc(this.end || report?.current.to || '')}"></label>
        <details class="progress-extra" ${this.extraExpanded ? 'open' : ''}><summary>Filtrlar${this.matchType ? ' · ' + esc(this.matchType) : ''}${this.hero ? ' · ' + esc(this.hero) : ''}</summary>
          <div class="evidence-controls">${this.select('matchType', 'Match turi', [['', 'Barchasi'], ['ranked', 'Ranked'], ['scrim', 'Scrim'], ['tournament', 'Turnir'], ['casual', 'Casual']])}
          ${this.playerId ? this.select('hero', 'Hero', [['', 'Barcha herolar'], ...heroes.map(hero => [hero, hero])]) +
            this.select('role', 'Layn', [['', 'Barcha laynlar'], ...['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'].map(role => [role, role])]) : ''}</div>
        </details>
      </div>`;
    if (!report) return controls + '<p class="evidence-empty">Bu tarkib va turda natijasi ma’lum match yo‘q.</p>';
    const percent = value => value === null ? '—' : `${fmt(value)}%`;
    const change = (a, b, unit = '') => a === null || b === null ? '—' : `${b > a ? '+' : ''}${fmt(b - a)}${unit}`;
    const { current, previous } = report;
    const period = this.evidencePeriod === 'previous' ? previous : current;
    const byId = new Map(period.rows.map(o => [o.match.id, o]));
    this.momentList = this.playerId ? [...period.rows].reverse().map(o => ({ ...o, reasons: [] })) : [];
    return `${controls}<div class="progress-windows">
      ${[['Joriy davr', current], ['Oldingi davr', previous]].map(([label, value]) => `<section><h3>${label}</h3><small>${value.from} – ${value.to}</small>
      <div class="evidence-result-numbers"><strong>${percent(value.winRate)}</strong><span>${value.count} match</span></div><p>${value.wins}W · ${value.losses}L</p>
      ${value.count ? `<meter min="0" max="${value.count}" value="${value.wins}" aria-label="${label} g‘alabalar ulushi"></meter>` : ''}</section>`).join('')}
      <div class="progress-window-delta"><span>WR farqi</span><strong>${change(previous.winRate, current.winRate, ' punkt')}</strong><small>${previous.count} → ${current.count} match</small></div></div>
      <section class="evidence-panel"><header class="evidence-heading"><div><h3>G‘alabalar bo‘yicha trend</h3><p>Joriy davr · qisqa oraliqlar bo‘yicha</p></div></header>
        <div class="progress-history-bars">${report.trend.map(bucket => {
          const label = bucket.from === bucket.to ? bucket.from.slice(5) : `${bucket.from.slice(5)} – ${bucket.to.slice(5)}`;
          return `<div><small>${label}</small><strong>${bucket.count ? percent(100 * bucket.wins / bucket.count) : '—'}</strong>
            ${bucket.count ? `<meter min="0" max="${bucket.count}" value="${bucket.wins}" aria-label="${label} g‘alaba ulushi"></meter>` : ''}
            <small>${bucket.count} match</small></div>`;
        }).join('')}</div></section>
      <section class="evidence-panel"><header class="evidence-heading"><div><h3>Ko‘rsatkichlar</h3><p>Oldingi → joriy. n — qiymati ma’lum kuzatuv.</p></div></header>
        <div class="progress-measures">${Object.entries(METRICS).map(([key, name]) => {
          const a = previous.metrics[key], b = current.metrics[key];
          return `<div><h4>${esc(name)}</h4><p><strong>${fmt(a.mean)}</strong> → <strong>${fmt(b.mean)}</strong></p><small>n=${a.n} → ${b.n} · farq ${change(a.mean, b.mean)}</small></div>`;
        }).join('')}</div></section>
      ${!this.playerId ? `<section class="evidence-panel"><h3>O‘yinchilar</h3><div class="evidence-form">${report.players.map(({ player, current: c, previous: p }) => `
        <button class="progress-player-row" type="button" data-select-player="${esc(player.id)}"><strong>${esc(player.name)}</strong><span>${p.count} → ${c.count} match</span><span>WR ${percent(p.winRate)} → ${percent(c.winRate)}</span><span aria-hidden="true">↗</span></button>`).join('') || '<p>Mos qatnashuvlar yo‘q.</p>'}</div></section>` : ''}
      <section class="evidence-panel"><header class="evidence-heading"><div><h3>Match dalillari</h3><p>${period.count} match · ${period.from} – ${period.to}</p></div>
        ${this.select('evidencePeriod', 'Ko‘rilayotgan davr', [['current', 'Joriy'], ['previous', 'Oldingi']])}</header>
        <ol class="progress-evidence-list">${[...period.matches].reverse().slice(0, this.evidenceLimit).map((match, index) => {
          const row = this.playerId ? byId.get(match.id)?.row : null;
          return `<li><button type="button" class="evidence-match" data-progress-match="${esc(match.id)}">
            <b>${match.result === 'win' ? 'G‘alaba' : 'Mag‘lubiyat'}</b><span>${esc(match.date)} · ${esc(row?.heroUsed || match.matchType || 'Tur noma’lum')}</span>${row ? `<small>Rating ${fmt(row.inGameScore)}</small>` : ''}</button>${row ? button(`moment-${index}`, 'PNG') : ''}</li>`;
        }).join('')}</ol>
        ${!period.count ? '<p>Bu davrda mos match yo‘q.</p>' : ''}${period.count > this.evidenceLimit ? button('more-evidence', 'Yana ko‘rsatish') : ''}
      </section>`;
  }

  weeklyMarkup() {
    const draft = weeklyReport(this.data, this.date, this.scope);
    const saved = this.reports.find(r => r.start === draft.start && r.scope === draft.scope);
    const admin = this.app.authManager.isAdmin();
    const report = admin ? draft : saved;
    this.shownReport = report;
    const isLiveWeek = draft.end >= today();
    const topMvp = report?.players?.reduce((best, p) => p.mvps > (best?.mvps || 0) ? p : best, null);
    const navBar = `<div class="weekly-nav-bar">
      <div class="weekly-nav-controls">
        <button type="button" class="btn btn-secondary btn-sm" data-week-nav="-1" title="Oldingi hafta">◀ Oldingi hafta</button>
        <div class="weekly-current-badge">
          <span class="weekly-calendar-icon">📅</span>
          <strong>${draft.start} — ${draft.end}</strong>
          ${isLiveWeek ? '<span class="status-pill status-pill-live">Joriy hafta</span>' : '<span class="status-pill status-pill-past">Yakunlangan</span>'}
        </div>
        <button type="button" class="btn btn-secondary btn-sm" data-week-nav="1" title="Keyingi hafta">Keyingi hafta ▶</button>
        <button type="button" class="btn btn-secondary btn-sm" data-week-nav="0" title="Joriy haftaga qaytish">Bugun</button>
      </div>
    </div>`;

    const reportMarkup = report ? `<article class="progress-report weekly-main-report">
      <div class="weekly-report-top">
        <div>
          <p class="section-eyebrow">ECLIPSE WEEKLY / ${esc(scopeName(report.scope))}</p>
          <h3>${report.start} — ${report.end}</h3>
          <p class="weekly-report-meta">${report.publishedAt ? `Nashr qilingan snapshot · ${esc(report.publishedAt.slice(0, 16).replace('T', ' '))} UTC.` : 'Joriy bazadan preview.'}${isLiveWeek ? ' Hafta hali davom etmoqda.' : ''}</p>
        </div>
        <div class="weekly-report-actions">
          ${button('weekly-png', '📸 PNG yuklab olish', !report.count)}
          ${admin ? button('publish', saved ? 'Hisobotni qayta publish qilish' : 'Jamoaga publish qilish', !report.count) : ''}
          ${admin && saved ? button('unpublish', 'Unpublish') : ''}
        </div>
      </div>
      <div class="progress-numbers progress-kpi-grid">
        <div class="kpi-card">
          <strong>${report.count}</strong>
          <span>MATCH</span>
          <small class="kpi-sub">${report.wins} W / ${report.losses} L</small>
        </div>
        <div class="kpi-card">
          <strong class="${(report.winRate ?? 0) >= 50 ? 'rate-positive' : 'rate-negative'}">${fmt(report.winRate)}%</strong>
          <span>WIN RATE</span>
          <div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width: ${Math.min(100, Math.max(0, report.winRate || 0))}%"></div></div>
        </div>
        <div class="kpi-card">
          <strong class="kpi-highlight">${topMvp && topMvp.mvps > 0 ? esc(topMvp.name) : '—'}</strong>
          <span>HAFTA MVP'SI</span>
          <small class="kpi-sub">${topMvp && topMvp.mvps > 0 ? `${topMvp.mvps} ta MVP` : 'Hali yo‘q'}</small>
        </div>
        <div class="kpi-card">
          <strong class="kpi-hero">${report.heroes[0]?.[0] || '—'}</strong>
          <span>ENG KO‘P O‘YNALGAN</span>
          <small class="kpi-sub">${report.heroes[0]?.[1] ? `${report.heroes[0][1]} ta match` : '—'}</small>
        </div>
      </div>
      <p class="progress-sample-note">${report.count < 5 ? '⚠️ Kichik sample — yo‘nalish haqida xulosa qilishga hali erta.' : '✓ Ushbu haftadagi qayd etilgan natijalar.'}</p>
      <div class="progress-table-wrap">
        <table>
          <caption>Har bir a’zoning haftasi · ${report.players.length} o‘yinchi</caption>
          <thead>
            <tr>
              <th>O‘yinchi</th>
              <th>Match</th>
              <th>W / L</th>
              <th>Win Rate</th>
              <th>MVP</th>
              <th>Damage / min</th>
            </tr>
          </thead>
          <tbody>
            ${report.players.map(p => {
              const wr = p.count ? Math.round(p.wins * 100 / p.count) : 0;
              return `<tr>
                <th>
                  <div class="player-cell">
                    <span class="player-avatar-mini">${esc(p.name.slice(0, 2).toUpperCase())}</span>
                    <span class="player-cell-name">${esc(p.name)}</span>
                  </div>
                </th>
                <td><strong>${p.count}</strong></td>
                <td><span class="text-win">${p.wins} W</span> / <span class="text-loss">${p.count - p.wins} L</span></td>
                <td>
                  <div class="cell-wr-wrap">
                    <span>${wr}%</span>
                    <div class="cell-wr-bar"><div class="cell-wr-fill" style="width: ${wr}%"></div></div>
                  </div>
                </td>
                <td>${p.mvps > 0 ? `<span class="badge-mvp">★ ${p.mvps}</span>` : '<span class="text-dim">—</span>'}</td>
                <td>${fmt(p.metrics.damagePerMinute.mean)} <small>n=${p.metrics.damagePerMinute.n}</small></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="weekly-hero-pills">
        <span class="weekly-hero-label">Ko‘p tanlangan hero:</span>
        ${report.heroes.map(([name, n]) => `<span class="hero-count-pill">${esc(name)} <b>×${n}</b></span>`).join(' · ') || '<span class="text-dim">—</span>'}
      </div>
    </article>` : `<div class="progress-empty"><h3>Bu hafta hali publish qilinmagan.</h3><p>Captain hisobotni ko‘rib chiqqach shu yerda paydo bo‘ladi.</p></div>`;

    return `${admin ? `<p class="progress-note">Captain preview · bazadan avtomatik hisoblangan. Publish qilgach jamoa saqlangan hisobotni ko‘radi.${saved ? ` Oldingi nashr: ${esc(saved.publishedAt.slice(0, 10))}.` : ''}</p>` : ''}
      ${navBar}
      ${reportMarkup}
      ${this.focusMarkup(draft)}
      <details class="progress-archive"><summary>Nashrlar arxivi · ${this.reports.length}</summary>${[...this.reports].sort((a, b) => b.start.localeCompare(a.start)).map(r => `<button type="button" data-report="${esc(r.id)}">${r.start} · ${esc(scopeName(r.scope))} · ${r.count} match</button>`).join('') || '<p>Hali hisobot yo‘q.</p>'}</details>
      ${this.qualityMarkup()}`;
  }
  focusSignal(signal) {
    return signal ? `${esc(FOCUS_METRICS[signal.metric])}: ${fmt(signal.previous)} → ${fmt(signal.current)}. ${signal.cohorts} mos guruh · ${signal.beforeN} → ${signal.afterN} ishtirok.` : 'Yetarli mos ma’lumot yoki bu yo‘nalishda o‘zgarish yo‘q.';
  }
  focusMarkup(week) {
    const id = `${week.start}_${week.scope}`, saved = this.focuses.find(f => f.id === id);
    const previous = this.focuses.find(f => f.scope === week.scope && f.start === adjacentWeek(week.start, -1));
    const admin = this.app.authManager.isAdmin(), editable = admin && week.start <= today() && week.end >= today();
    const draft = this.focusDrafts.get(id) || { task: saved?.task || '', metric: saved?.metric || 'deathsPerMinute' };
    const signals = saved?.signals || (admin ? focusSignals(this.data, adjacentWeek(week.start, -1), week.scope) : null);
    const followup = previous ? compareFocus(previous.baseline, focusBaseline(this.data, previous.start, week.scope, previous.metric)) : null;
    this.focusId = id;
    return `<section class="weekly-focus" aria-labelledby="weekly-focus-title">
      <header class="weekly-focus-header">
        <div>
          <p class="section-eyebrow">BIR HAFTA / BIR VAZIFA</p>
          <h3 id="weekly-focus-title">Bu haftaning fokusi</h3>
          <p class="weekly-focus-sub">${week.start} — ${week.end} · ${esc(scopeName(week.scope))} · Faqat Ranked</p>
        </div>
        <div class="weekly-focus-badge">
          ${saved ? '<span class="focus-status-badge saved">✓ Saqlangan</span>' : editable ? '<span class="focus-status-badge pending">● Vazifa kutilmoqda</span>' : ''}
        </div>
      </header>
      ${signals ? `<dl class="weekly-focus-signals">
        <div class="focus-signal-card signal-positive">
          <dt><span class="signal-icon">▲</span> Ijobiy signal</dt>
          <dd>${this.focusSignal(signals.positive)}</dd>
        </div>
        <div class="focus-signal-card signal-review">
          <dt><span class="signal-icon">●</span> Ko‘rib chiqish nuqtasi</dt>
          <dd>${this.focusSignal(signals.review)}</dd>
        </div>
      </dl>
      <details class="progress-info-toggle">
        <summary>ℹ️ Signallar qanday hisoblangan? (Metodologiya)</summary>
        <p class="progress-note">Oldingi ikki hafta kuzatuvi. Bir xil o‘yinchi, hero, layn va tarkib hajmi; har haftada kamida 5 matchli guruhlar. Guruhlar teng vaznda. Raqib va sharoit tenglashtirilmagan — bu sabab yoki isbotlangan o‘sish emas.</p>
      </details>` : ''}
      ${editable ? `<div class="weekly-focus-editor">
        <label for="weekly-focus-task"><strong>Captain vazifasi</strong></label>
        <textarea id="weekly-focus-task" class="form-input" maxlength="280" rows="3" placeholder="Masalan: har matchdan keyin bitta o‘lim vaziyatini VOD orqali birga ko‘rib chiqish.">${esc(draft.task)}</textarea>
        <div class="weekly-focus-actions">
          <label>Keyingi tekshiruv metrikasi
            <select id="weekly-focus-metric" class="form-select">${this.options(Object.entries(FOCUS_METRICS), draft.metric)}</select>
          </label>
          ${button('save-focus', saved ? 'Fokusni yangilash' : 'Fokusni jamoaga saqlash')}
        </div>
        <details class="progress-info-toggle">
          <summary>ℹ️ Asos va tekshiruv qoidalari</summary>
          <p class="progress-note">Saqlangach jamoa darhol ko‘radi; Weekly publish’dan alohida. Asos — vazifadan oldingi hafta. Keyingi haftada vazifa haftasi bilan solishtiriladi. Yetarli sample bo‘lmasa baho qo‘yilmaydi.</p>
        </details>
      </div>` : saved ? `<div class="weekly-focus-display">
        <h4>Captain vazifasi</h4>
        <p class="weekly-focus-task">${esc(saved.task)}</p>
        <p class="weekly-focus-metric-tag">Kuzatiladi: <strong>${esc(FOCUS_METRICS[saved.metric])}</strong></p>
      </div>` : '<p class="text-dim">Captain bu hafta uchun hali vazifa belgilamagan.</p>'}
      ${previous ? `<aside class="weekly-focus-followup">
        <h4>Oldingi fokusga qaytish · ${previous.start}</h4>
        <p class="previous-task-quote">“${esc(previous.task)}”</p>
        <p class="previous-followup-signal">${followup ? this.focusSignal(followup) : 'Taqqoslash uchun har ikki haftada kamida 5 ta mos matchli guruh topilmadi. Bu vazifa bajarilmadi degani emas.'}</p>
        <small class="text-dim">Oldingi asos saqlangan snapshot; vazifa haftasi joriy bazadan. Natija vazifaning ta’sirini isbotlamaydi.</small>
      </aside>` : ''}
      <p class="weekly-focus-status" role="status" aria-live="polite">${this.focusDrafts.has(id) ? 'Saqlanmagan qoralama · shu sessiyada saqlanadi.' : saved ? 'Jamoaga saqlangan.' : ''}</p>
    </section>`;
  }
  qualityMarkup() {
    if (!this.app.authManager.isAdmin()) return '';
    const q = this.scanQuality;
    if (!q || q.unavailable) return '<details class="progress-archive"><summary>AI foydalanish kuzatuvi</summary><p>O‘lchov yuklanmadi. Yangilash orqali qayta urinishingiz mumkin; matchlar ishlashiga ta’sir qilmaydi.</p></details>';
    return `<details class="progress-archive scan-quality"><summary>AI foydalanish kuzatuvi · ${q.pilot.count}/30 yuborish</summary>
      <p>Bu aniqlik testi emas. Tuzatishsiz yuborilgan natija ham xato bo‘lishi mumkin. Faqat yangi, ushbu sessiyada skan qilingan yuborishlar o‘lchanadi; eski matchlar qo‘shilmaydi.</p>
      <dl><div><dt>Oxirgi 30 kuzatilgan yuborish</dt><dd>${q.pilot.unchanged} tuzatishsiz / ${q.pilot.count} jami</dd></div><div><dt>Skan vaqti medianasi</dt><dd>${fmt(q.medianMs === null ? null : q.medianMs / 1000)} soniya</dd></div><div><dt>Saqlangan urinishlar</dt><dd>${q.attempts} jami · ${q.failed} xato · ${q.cancelled} bekor qilingan</dd></div></dl>
      <p>Ko‘p to‘ldirilgan yoki o‘zgartirilgan maydonlar: ${q.pilot.fields.map(([field, n]) => `${esc(field)} (${n})`).join(' · ') || 'Hali yo‘q'}.</p>
      <p class="progress-note">Skan vaqti rasm tayyorlash, AI va hero tekshiruvini qamraydi; fayl tanlash vaqtini emas. Sana, match turi, izoh va yuboruvchi kirmaydi. Faqat maydon nomlari va vaqt saqlanadi, rasmlar va qiymatlar saqlanmaydi. Oxirgi 300 urinish; ${q.pruned} eskisi chiqarilgan. Oflayn yoki sahifa yopilgan urinishlar yetib kelmasligi mumkin.</p></details>`;
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
    const rememberFocus = () => {
      this.focusDrafts.set(this.focusId, { task: this.container.querySelector('#weekly-focus-task').value, metric: this.container.querySelector('#weekly-focus-metric').value });
      this.container.querySelector('.weekly-focus-status').textContent = 'Saqlanmagan qoralama · shu sessiyada saqlanadi.';
    };
    this.container.querySelector('#weekly-focus-task')?.addEventListener('input', rememberFocus);
    this.container.querySelector('#weekly-focus-metric')?.addEventListener('change', rememberFocus);
    const redraw = (attribute, value) => {
      this.extraExpanded = this.container.querySelector('.progress-extra')?.open || false;
      this.draw();
      [...this.container.querySelectorAll(`[${attribute}]`)].find(node => node.getAttribute(attribute) === value)?.focus({ preventScroll: true });
    };
    this.container.querySelectorAll('[data-progress-tab]').forEach(b => b.onclick = () => {
      this.tab = b.dataset.progressTab; redraw('data-progress-tab', this.tab);
    });
    this.container.querySelectorAll('[data-progress-filter]').forEach(el => el.onchange = () => {
      const key = el.dataset.progressFilter;
      if (el.value || key !== 'date') this[key] = el.value;
      this.evidenceLimit = 8; redraw('data-progress-filter', key);
    });
    this.container.querySelectorAll('[data-week-nav]').forEach(b => b.onclick = () => {
      const offset = Number(b.dataset.weekNav);
      this.date = offset === 0 ? today() : adjacentWeek(this.date, offset);
      redraw('data-week-nav', b.dataset.weekNav);
    });
    this.container.querySelectorAll('[data-select-player]').forEach(b => b.onclick = () => {
      this.playerId = b.dataset.selectPlayer; this.hero = ''; this.role = ''; this.evidenceLimit = 8;
      redraw('data-select-player', this.playerId);
    });
    this.container.querySelectorAll('[data-progress-match]').forEach(b => b.onclick = () => {
      this.app.matchManager?.renderMatchDetailModal(b.dataset.progressMatch, this.data.players, { snapshot: this.data.matches });
    });
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
    if (action === 'more-evidence') {
      const firstNew = this.evidenceLimit;
      this.evidenceLimit += 8; this.draw();
      this.container.querySelectorAll('[data-progress-match]')[firstNew]?.focus();
      return;
    }
    if (action === 'weekly-png') return exportProgressPng(this.app, { report: this.shownReport, draft: this.app.authManager.isAdmin() });
    if (action.startsWith('moment-')) {
      const o = this.momentList[Number(action.slice(7))];
      return exportProgressPng(this.app, { moment: o, player: this.data.players.find(p => p.id === this.playerId), scope: this.scope });
    }
    if (!this.app.authManager.isAdmin()) throw new Error('Faqat Captain uchun.');
    if (this.app.cloudSync.getStatus().pending || this.app.cloudSync.getStatus().syncing) throw new Error('Avval mahalliy o‘zgarishlarni cloudga saqlang.');
    if (action === 'save-focus') {
      const id = this.focusId, task = this.container.querySelector('#weekly-focus-task').value.trim(), metric = this.container.querySelector('#weekly-focus-metric').value;
      if (!task) throw new Error('Avval bitta aniq vazifa yozing.');
      this.container.querySelector('.weekly-focus-status').textContent = 'Saqlanmoqda…';
      try { await this.request('', { action: 'save_weekly_focus', date: this.date, scope: this.scope, task, metric, expectedRevision: this.data.revision, expectedFocusRevision: this.focusRevision }); }
      catch (error) { const status = this.container.querySelector('.weekly-focus-status'); if (status) status.textContent = 'Saqlanmadi. Qoralamangiz saqlanib turibdi.'; throw error; }
      const currentDraft = this.focusDrafts.get(id);
      // The user may keep typing or change tabs while the request is in flight.
      if (!currentDraft || currentDraft.task.trim() === task && currentDraft.metric === metric) this.focusDrafts.delete(id);
    } else if (action.startsWith('undo-')) {
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
