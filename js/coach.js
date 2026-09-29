import { coachContexts, coachReport } from './coach-model.js?v=2.36.0';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = v => v === null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
const choices = new Map();
const options = (list, selected) => list.map(([key, label]) => `<option value="${esc(key)}" ${key === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
function signalMarkup(signal, compact) {
  return `<article class="coach-signal is-${signal.kind}"><p class="coach-kicker">${signal.kind === 'review' ? 'TEKSHIRISH KERAK' : 'IJOBIY SIGNAL'}</p><h4>${esc(signal.label)} ${signal.delta > 0 ? 'oshgan' : 'kamaygan'}</h4>
    <p class="coach-values">${fmt(signal.before.mean)} → ${fmt(signal.after.mean)} <small>5 match → 5 match</small></p>
    ${!compact ? `<p>${signal.kind === 'review' ? esc(signal.action) : 'Bu kuzatilgan o‘zgarish. Foydali qarorlarni VOD orqali aniqlab, keyingi matchlarda kuzatishda davom eting.'}</p>` : ''}</article>`;
}
export function renderCoach(container, app, { playerId = '', compact = false } = {}) {
  if (!container || !app?.dataStore) return;
  try {
    const players = app.dataStore.getAllPlayers?.() || app.dataStore.getPlayers();
    if (!players.length) { container.innerHTML = '<section class="eclipse-coach"><h3>Rivojlanish fokusi</h3><p>Avval rosterga o‘yinchi qo‘shing.</p></section>'; return; }
    let selected = playerId;
    if (!selected) { try { selected = localStorage.getItem('eclipse_coach_player'); } catch (_) {} }
    const player = players.find(p => p.id === selected) || players.find(p => p.active !== false) || players[0];
    const scope = app.currentAnalyticsMode === 'squad' ? 'squad' : 'team5';
    const stateKey = `${player.id}:${scope}`, state = choices.get(stateKey) || { matchType: 'ranked', context: '' };
    const data = { players, matches: app.dataStore.getMatches() };
    const contexts = coachContexts(data, player.id, scope, state.matchType, today());
    const group = contexts.groups.find(g => g.key === state.context) || contexts.groups[0];
    state.context = group?.key || ''; choices.set(stateKey, state);
    const report = coachReport(group, today());
    const notice = !group ? 'Mos hero va layn ma’lumoti yo‘q.' : report.status === 'collecting' ? `Taqqoslash uchun yana ${report.remaining} ta mos match kerak (${report.count}/10). Hozircha shaxsiy hukm yoki tavsiya chiqarilmaydi.`
      : report.status === 'stale' ? 'Taqqoslash eskirgan: oxirgi guruh 30 kundan eski yoki ikki guruh oralig‘i 90 kundan uzun. Yangi mos matchlar kerak.'
        : !report.metrics.some(m => m.delta !== null) ? '10 match bor, lekin metrikalar to‘liq emas. Hozircha tavsiya uchun ma’lumot yetarli emas.'
          : report.primary ? '' : 'Hozircha belgilangan chegaradan oshgan salbiy signal yo‘q. Bu xatosiz o‘yin yoki yuqori mahorat isboti emas.';
    const fields = `<div class="coach-controls">${compact ? `<label>Ko‘rilayotgan o‘yinchi<select data-coach-player>${options(players.map(p => [p.id, `${p.name}${p.active === false ? ' · arxiv' : ''}`]), player.id)}</select></label><label>Coach tarkibi<select data-coach-scope>${options([['team5', 'Team 5'], ['squad', 'Practice · 1–4']], scope)}</select></label>` : ''}
      <label>Match turi<select data-coach-type>${options([['ranked', 'Ranked'], ['scrim', 'Scrim'], ['tournament', 'Tournament'], ['casual', 'Casual']], state.matchType)}</select></label>
      ${contexts.groups.length ? `<label>Hero · layn · tarkib<select data-coach-context>${options(contexts.groups.map(g => [g.key, `${g.hero} · ${g.role} · ${g.party} kishi · ${g.rows.length} match`]), state.context)}</select></label>` : ''}</div>`;
    container.innerHTML = `<section class="eclipse-coach ${compact ? 'is-compact' : ''}" aria-label="Eclipse Coach"><header><p class="coach-kicker">ECLIPSE COACH / JAMOAGA OCHIQ</p><h3>${compact ? 'Rivojlanish fokusi' : `${esc(player.name)} — shaxsiy kuzatuv`}</h3><p>O‘z natijalaringiz bilan taqqoslash · ${scope === 'team5' ? 'Team 5' : 'Practice · 1–4'}. Bu AI hukmi yoki kuch reytingi emas.</p></header>${fields}
      ${notice ? `<p class="coach-notice" role="status">${notice}</p>` : ''}
      ${report.primary ? signalMarkup(report.primary, compact) : ''}
      ${!compact ? report.extras.map(s => signalMarkup(s, false)).join('') : !report.primary && report.extras[0] ? signalMarkup(report.extras[0], true) : ''}
      ${report.previous ? `<p class="coach-context">${report.from} — ${report.to} · Oldingi 5: ${report.previous.wins} W / ${report.previous.losses} L → keyingi 5: ${report.recent.wins} W / ${report.recent.losses} L.</p><p class="coach-context">Qayta tekshiruv: ${report.pending}/5 yangi mos match. Yana ${report.remaining} ta yig‘ilgach yangi ikki guruh solishtiriladi. Hozirgi ${report.pending} ta match taqqoslashga hali kirmagan.</p>` : ''}
      ${compact ? '<button type="button" class="btn btn-secondary" data-coach-profile>Profilida batafsil ko‘rish →</button>' : report.previous ? `<details class="coach-evidence"><summary>Raqamlar va solishtirilgan 10 match</summary><div class="coach-table"><table><caption>Faqat ma’lum qiymatlar; n = metrika mavjud matchlar</caption><thead><tr><th>Metrika</th><th>Oldingi 5</th><th>Keyingi 5</th><th>Farq</th></tr></thead><tbody>${report.metrics.map(m => `<tr><th>${esc(m.label)}</th><td>${fmt(m.before.mean)} <small>n=${m.before.n}</small></td><td>${fmt(m.after.mean)} <small>n=${m.after.n}</small></td><td>${m.delta === null ? 'Yetarli emas' : fmt(m.delta)}</td></tr>`).join('')}</tbody></table></div><ol>${report.evidence.map(e => `<li><button type="button" data-coach-match="${esc(e.id)}">${e.date} · ${e.result === 'win' ? 'W' : 'L'} · ${e.period === 'previous' ? 'oldingi guruh' : 'keyingi guruh'}</button></li>`).join('')}</ol></details>` : ''}
      ${!compact && app.authManager?.isAdmin() && report.primary && ['deathsPerMinute', 'damagePerMinute', 'goldPerMinute'].includes(report.primary.key) ? '<button type="button" class="btn btn-secondary" data-coach-weekly>Weekly vazifasiga qoralama olish</button><p class="coach-context">Faqat vazifa qoralamasi. Weekly metrikasi butun tanlangan tarkib uchun hisoblanadi, shaxsiy Coach bilan bir xil emas. Captain ko‘rib chiqib saqlaydi.</p>' : ''}
      <details class="coach-method"><summary>Bu tavsiya qanday chiqdi?</summary><p>Bir xil o‘yinchi, hero, o‘ynalgan layn, match turi va kuzatilgan tarkib hajmi. Har 5 mos matchdan keyin oxirgi ikki to‘liq guruh yangilanadi. Har metrika uchun har ikki guruhda 5 tadan ma’lum qiymat kerak.</p><p>Tekshirish chegaralari: deaths/min +20% va kamida +0.1; teamfight −10 foiz punkt; gold/min −15% va −50; damage/min −15% va −300; turret/min −20% va −100. Ijobiy signallar teskari yo‘nalishda. Bu mahsulot qoidalari, statistik ishonchlilik testi emas.</p><p>Roamerda gold, damage va turret signalga aylantirilmaydi. Raqib, patch, draft va vaziyat tenglashtirilmagan. W/L — kontekst, sabab emas. Scoreboard pozitsiya, rotatsiya yoki qarorning sifatini isbotlamaydi.</p><p>${contexts.unknownLane} ta matchda hero/layn noma’lum — chiqarilgan. Tanlangan 10 matchda ${report.inferredRoles || 0} ta layn inferred yoki manbasi noma’lum bo‘lishi mumkin. Noto‘g‘ri matchni tuzatsangiz, kuzatuv qayta hisoblanadi.</p></details>
      <p class="coach-feedback" role="status" aria-live="polite"></p></section>`;
    const rerender = () => renderCoach(container, app, { playerId: player.id, compact });
    container.querySelector('[data-coach-player]')?.addEventListener('change', e => { try { localStorage.setItem('eclipse_coach_player', e.target.value); } catch (_) {} renderCoach(container, app, { playerId: e.target.value, compact }); });
    container.querySelector('[data-coach-scope]')?.addEventListener('change', e => { app.currentAnalyticsMode = e.target.value; try { localStorage.setItem('eclipse_analytics_mode', e.target.value); } catch (_) {} app.updateAnalyticsScopeControl?.(); renderCoach(container, app, { playerId: player.id, compact }); });
    container.querySelector('[data-coach-type]')?.addEventListener('change', e => { state.matchType = e.target.value; state.context = ''; rerender(); });
    container.querySelector('[data-coach-context]')?.addEventListener('change', e => { state.context = e.target.value; rerender(); });
    container.querySelector('[data-coach-profile]')?.addEventListener('click', () => app.showPlayerProfile(player.id));
    container.querySelectorAll('[data-coach-match]').forEach(b => b.addEventListener('click', () => app.matchManager.renderMatchDetailModal(b.dataset.coachMatch, players)));
    container.querySelector('[data-coach-weekly]')?.addEventListener('click', () => {
      const hub = app.progressHub ||= new window.ProgressHub(app);
      hub.scope = scope; hub.date = today(); hub.tab = 'weekly';
      const day = new Date(`${today()}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
      const id = `${day.toISOString().slice(0, 10)}_${scope}`;
      if (hub.focusDrafts.has(id)) { container.querySelector('.coach-feedback').textContent = 'Weekly ichida saqlanmagan qoralama bor. Avval uni ko‘rib chiqing.'; return; }
      const metric = report.primary.key;
      hub.focusDrafts.set(id, { task: `${player.name} · ${group.hero} / ${group.role}: ${report.primary.action}`.slice(0, 280), metric });
      app.navigate('progress');
    });
  } catch (_) {
    container.innerHTML = '<section class="eclipse-coach"><h3>Eclipse Coach</h3><p role="alert">Kuzatuv hisoblanmadi. Sahifani qayta ochib ko‘ring; matchlaringiz o‘zgartirilmadi.</p></section>';
  }
}
window.EclipseCoach = { render: renderCoach };
