import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let JSDOM;
try {
  ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH.' }, fn);

domTest('player recent form calculates win/loss streaks and renders pills correctly', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="roster"></div></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  // Load date-utils and players.js
  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/players.js', import.meta.url), 'utf8'));

  const manager = new window.PlayerManager({}, {});

  const sampleMatches = [
    { date: '2026-10-18T10:00:00Z', result: 'win', players: [{ id: 'p1', heroName: 'Chou', kills: 5, deaths: 1, assists: 7 }] },
    { date: '2026-10-17T10:00:00Z', result: 'win', players: [{ id: 'p1', heroName: 'Chou', kills: 4, deaths: 0, assists: 9 }] },
    { date: '2026-10-16T10:00:00Z', result: 'win', players: [{ id: 'p1', heroName: 'Paquito', kills: 8, deaths: 2, assists: 4 }] },
    { date: '2026-10-15T10:00:00Z', result: 'loss', players: [{ id: 'p1', heroName: 'Yu Zhong', kills: 2, deaths: 4, assists: 3 }] },
    { date: '2026-10-14T10:00:00Z', result: 'win', players: [{ id: 'p1', heroName: 'Chou', kills: 6, deaths: 2, assists: 5 }] }
  ];

  const recent = manager.getPlayerRecentForm(sampleMatches, 'p1', 5);
  assert.equal(recent.results.length, 5);
  assert.equal(recent.streakCount, 3);
  assert.equal(recent.streakType, 'win');

  const html = manager.renderRecentFormHtml(recent);
  assert.match(html, /player-recent-form/);
  assert.match(html, /form-pill is-win/);
  assert.match(html, /form-pill is-loss/);
  assert.match(html, /player-streak-badge is-fire/);
  assert.match(html, /3 ketma-ket/);

  dom.window.close();
});

domTest('command palette registers, searches routes and heroes, and handles open/close', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><button id="quickCmdTrigger"></button></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  // Mock dialog showModal & close in JSDOM if needed
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    window.HTMLDialogElement.prototype.close = function() { this.open = false; };
  }

  window.eval(readFileSync(new URL('../js/command-palette.js', import.meta.url), 'utf8'));

  const palette = new window.CommandPalette();
  assert.ok(palette.dialog, 'Palette dialog element created');
  assert.equal(palette.isOpen, false);

  palette.open();
  assert.equal(palette.isOpen, true);

  // Search "meta"
  palette.renderItems('meta');
  assert.ok(palette.filteredItems.length > 0, 'Found results for "meta"');
  assert.ok(palette.filteredItems.some(i => i.label.toLowerCase().includes('meta')));

  palette.close();
  assert.equal(palette.isOpen, false);

  dom.window.close();
});

domTest('index.html contains mobile dock navigation and submissions hint', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /mobile-dock/);
  assert.match(indexHtml, /quickCmdTrigger/);
  assert.match(indexHtml, /command-palette\.js/);
  assert.match(indexHtml, /sidebarCloseBtn/);
  assert.match(indexHtml, /sidebarFooterCloseBtn/);

  const subJs = readFileSync(new URL('../js/submissions.js', import.meta.url), 'utf8');
  assert.match(subJs, /Ctrl\+V/);
  assert.match(subJs, /submission-dropzone__hint/);
});

domTest('sidebar close buttons and escape handler close open sidebar', () => {
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <div class="app-container">
          <aside class="sidebar open" id="sidebar">
            <button id="sidebarCloseBtn"></button>
            <button id="sidebarFooterCloseBtn"></button>
          </aside>
          <div class="sidebar-overlay active" id="sidebarOverlay"></div>
          <button id="hamburgerBtn" aria-expanded="true"></button>
        </div>
      </body>
    </html>
  `, { runScripts: 'outside-only' });
  const { window } = dom;
  window.innerWidth = 500;
  window.DataStore = class { constructor() {} };
  window.StatsEngine = class { constructor() {} };
  window.AuthManager = class { constructor() {} };
  window.HeroDatabase = class { constructor() {} };
  window.SubmissionManager = class { constructor() {} };
  window.BatchManager = class { constructor() {} };
  window.BriefingManager = class { constructor() {} };
  window.MlbbDataManager = class { constructor() {} };
  window.ProgressManager = class { constructor() {} };
  window.CoachManager = class { constructor() {} };

  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'));

  const app = window.EclipseApp;
  app.bindMobileNav();

  const sidebar = window.document.getElementById('sidebar');
  const overlay = window.document.getElementById('sidebarOverlay');
  const closeBtn = window.document.getElementById('sidebarCloseBtn');

  assert.ok(sidebar.classList.contains('open'));
  closeBtn.click();
  assert.ok(!sidebar.classList.contains('open'));
  assert.ok(!overlay.classList.contains('active'));

  // Test footer close button
  sidebar.classList.add('open');
  overlay.classList.add('active');
  const footerClose = window.document.getElementById('sidebarFooterCloseBtn');
  footerClose.click();
  assert.ok(!sidebar.classList.contains('open'));

  // Test Escape key
  sidebar.classList.add('open');
  overlay.classList.add('active');
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.ok(!sidebar.classList.contains('open'));

  dom.window.close();
});

domTest('EclipseAudio initializes, toggles mute state, and saves to localStorage', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><button class="sfx-toggle-btn"></button></body></html>', {
    url: 'https://eclipseesports.vercel.app',
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8'));

  const audio = window.eclipseAudio;
  assert.ok(audio, 'EclipseAudio instance exists');
  assert.equal(audio.enabled, false, 'Default is muted/disabled');

  // Toggle on
  const newState = audio.toggle();
  assert.equal(newState, true, 'Toggled on');
  assert.equal(audio.enabled, true);
  assert.equal(window.localStorage.getItem('eclipse:sfx:enabled'), 'true');

  // Toggle off
  audio.toggle();
  assert.equal(audio.enabled, false);
  assert.equal(window.localStorage.getItem('eclipse:sfx:enabled'), 'false');

  dom.window.close();
});

domTest('EclipseApp.filterHistoryMatches filters by result, scope, and query', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'));

  const app = window.EclipseApp;
  const sampleMatches = [
    {
      id: 'm1',
      date: '2026-10-18',
      result: 'win',
      scope: 'team5',
      type: 'ranked',
      opponent: 'Team Alpha',
      playerStats: [
        { playerId: 'p1', playerName: 'Heavenlyyy', heroUsed: 'Chou', rolePlayed: 'EXP' },
        { playerId: 'p2', playerName: 'Vortex', heroUsed: 'Ling', rolePlayed: 'Jungle' }
      ]
    },
    {
      id: 'm2',
      date: '2026-10-17',
      result: 'loss',
      scope: 'team5',
      type: 'scrim',
      opponent: 'Team Beta',
      playerStats: [
        { playerId: 'p1', playerName: 'Heavenlyyy', heroUsed: 'Paquito', rolePlayed: 'EXP' },
        { playerId: 'p3', playerName: 'Shadow', heroUsed: 'Novaria', rolePlayed: 'Mid' }
      ]
    },
    {
      id: 'm3',
      date: '2026-10-16',
      result: 'win',
      scope: 'squad',
      type: 'ranked',
      opponent: 'Team Gamma',
      playerStats: [
        { playerId: 'p2', playerName: 'Vortex', heroUsed: 'Fanny', rolePlayed: 'Jungle' }
      ]
    }
  ];

  // 1. All
  assert.equal(app.filterHistoryMatches(sampleMatches, 'all', '').length, 3);

  // 2. Wins only
  const wins = app.filterHistoryMatches(sampleMatches, 'wins', '');
  assert.equal(wins.length, 2);
  assert.ok(wins.every(m => m.result === 'win'));

  // 3. Losses only
  const losses = app.filterHistoryMatches(sampleMatches, 'losses', '');
  assert.equal(losses.length, 1);
  assert.equal(losses[0].id, 'm2');

  // 4. Team5 only
  const team5 = app.filterHistoryMatches(sampleMatches, 'team5', '');
  assert.equal(team5.length, 2);

  // 5. Query hero "chou"
  const chouMatches = app.filterHistoryMatches(sampleMatches, 'all', 'Chou');
  assert.equal(chouMatches.length, 1);
  assert.equal(chouMatches[0].id, 'm1');

  // 6. Query player name "shadow"
  const shadowMatches = app.filterHistoryMatches(sampleMatches, 'all', 'shadow');
  assert.equal(shadowMatches.length, 1);
  assert.equal(shadowMatches[0].id, 'm2');

  // 7. Query opponent "alpha"
  const alphaMatches = app.filterHistoryMatches(sampleMatches, 'all', 'alpha');
  assert.equal(alphaMatches.length, 1);
  assert.equal(alphaMatches[0].id, 'm1');

  dom.window.close();
});

domTest('DraftAssistant creates board, handles slot picking, damage balance and analysis', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="metaLabContainer"></div></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    window.HTMLDialogElement.prototype.close = function() { this.open = false; };
  }

  // Provide sample hero catalog
  window.HeroDatabase = {
    DEFAULT_HEROES: [
      { id: 1, name: 'Tigreal', roles: ['Tank'], lanes: ['Roam'], damageType: 'physical', ccTier: 'high' },
      { id: 2, name: 'Kagura', roles: ['Mage'], lanes: ['Mid'], damageType: 'magic', ccTier: 'medium' },
      { id: 3, name: 'Chou', roles: ['Fighter'], lanes: ['EXP', 'Roam'], damageType: 'physical', ccTier: 'high' },
      { id: 4, name: 'Claude', roles: ['Marksman'], lanes: ['Gold'], damageType: 'physical', ccTier: 'low' },
      { id: 5, name: 'Ling', roles: ['Assassin'], lanes: ['Jungle'], damageType: 'physical', ccTier: 'low' },
      { id: 6, name: 'Diggie', roles: ['Support'], lanes: ['Roam'], damageType: 'magic', ccTier: 'high', counters: [1] }
    ]
  };

  window.eval(readFileSync(new URL('../js/draft-helper.js', import.meta.url), 'utf8'));

  const draft = window.draftAssistant;
  assert.ok(draft, 'DraftAssistant is instantiated');
  assert.ok(draft.dialog, 'Draft dialog is created');

  // Test open and close
  draft.open();
  assert.equal(draft.dialog.open, true);

  // Pick heroes directly
  draft.allyPicks[0] = window.HeroDatabase.DEFAULT_HEROES[0]; // Tigreal
  draft.allyPicks[1] = window.HeroDatabase.DEFAULT_HEROES[1]; // Kagura
  draft.enemyPicks[0] = window.HeroDatabase.DEFAULT_HEROES[0]; // Tigreal
  draft.renderSlots();
  draft.renderAnalysis();

  const allyCount = draft.dialog.querySelector('#allyPickCount')?.textContent;
  assert.equal(allyCount, '2 / 5');
  const enemyCount = draft.dialog.querySelector('#enemyPickCount')?.textContent;
  assert.equal(enemyCount, '1 / 5');

  const analysisContainer = draft.dialog.querySelector('#draftAnalytics');
  assert.ok(analysisContainer.querySelector('.draft-dmg-bar'), 'Analysis rendered damage bars');
  assert.ok(analysisContainer.querySelector('.draft-lane-badges'), 'Analysis rendered lane badges');

  draft.reset();
  assert.equal(draft.allyPicks.every(p => p === null), true);
  assert.equal(draft.enemyPicks.every(p => p === null), true);

  draft.close();
  assert.equal(draft.dialog.open, false);

  dom.window.close();
});

domTest('PlayerManager renders team chemistry tandem banner when synergy is detected', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/players.js', import.meta.url), 'utf8'));

  const samplePlayers = [
    { id: 'p1', name: 'Heavenlyyy', primaryRole: 'EXP Laner', active: true },
    { id: 'p2', name: 'Vortex', primaryRole: 'Jungler', active: true }
  ];

  const mockDb = {
    getPlayers: () => samplePlayers,
    getActivePlayers: () => samplePlayers,
    getArchivedPlayers: () => [],
    getMatches: () => []
  };

  const mockStatsEngine = {
    getPlayerTrends: () => [],
    getPlayerStats: () => ({ matchesPlayed: 10, winRate: 70, kdaRatio: '3.5', mvpCount: 2 }),
    getPlayerRoleBreakdown: () => ({ bestRole: 'EXP Laner' }),
    getPlayerHeroAnalytics: () => ({ uniqueHeroesCount: 5, mostPicked: { heroName: 'Chou', useRate: 50, winRate: 80 } }),
    getSynergyStats: () => ({
      duos: [
        {
          player1: { id: 'p1', name: 'Heavenlyyy' },
          player2: { id: 'p2', name: 'Vortex' },
          matchesTogether: 8,
          wins: 7,
          losses: 1,
          winRate: '87.5',
          combinedKda: '4.20'
        }
      ]
    })
  };
  window.StatsEngine = { ROLE_COLORS: {} };

  const pm = new window.PlayerManager(mockDb, {});
  pm.statsEngine = mockStatsEngine;

  pm.renderPlayersList('container');

  const container = window.document.getElementById('container');
  const banner = container.querySelector('.team-chemistry-highlight');
  assert.ok(banner, 'Team chemistry banner is rendered');
  assert.match(banner.innerHTML, /Heavenlyyy/);
  assert.match(banner.innerHTML, /Vortex/);
  assert.match(banner.innerHTML, /87\.5%/);
  assert.match(banner.innerHTML, /#1 TANDEM/);

  dom.window.close();
});

domTest('EclipseShareCard generates 1200x630 canvas and triggers PNG download', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only' });
  const { window } = dom;

  // Mock HTMLCanvasElement
  window.HTMLCanvasElement.prototype.getContext = function() {
    return {
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      strokeRect: () => {},
      fill: () => {},
      arc: () => {},
      roundRect: () => {},
      fillText: () => {},
      save: () => {},
      restore: () => {}
    };
  };
  window.HTMLCanvasElement.prototype.toDataURL = function() {
    return 'data:image/png;base64,mockpng';
  };

  let clickedLink = null;
  window.HTMLAnchorElement.prototype.click = function() {
    clickedLink = this;
  };

  window.eval(readFileSync(new URL('../js/share-card.js', import.meta.url), 'utf8'));

  assert.ok(window.EclipseShareCard, 'EclipseShareCard is defined');
  await window.EclipseShareCard.downloadPlayerCard({
    name: 'Heavenlyyy',
    role: 'EXP Laner',
    winRate: '75.0%',
    matchesCount: 20,
    kda: '4.50',
    mvpCount: 5,
    streakCount: 4,
    recentResults: ['win', 'win', 'win', 'win', 'loss'],
    topHero: 'Chou'
  });

  assert.ok(clickedLink, 'Download link clicked');
  assert.equal(clickedLink.download, 'eclipse-heavenlyyy-card.png');
  assert.equal(clickedLink.href, 'data:image/png;base64,mockpng');

  dom.window.close();
});

domTest('ThemeManager toggles cyber accent themes and persists to localStorage', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><button id="themeSwitcherBtn"></button></body></html>', {
    runScripts: 'outside-only',
    url: 'https://eclipse-esports.uz/'
  });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/theme.js', import.meta.url), 'utf8'));

  assert.ok(window.ThemeManager, 'ThemeManager class is loaded');
  const tm = new window.ThemeManager();
  assert.equal(tm.currentTheme, 'gold', 'Default theme is gold');

  tm.applyTheme('cyan', false);
  assert.equal(tm.currentTheme, 'cyan');
  assert.equal(window.document.documentElement.getAttribute('data-theme'), 'cyan');
  assert.equal(window.localStorage.getItem('eclipse:theme'), 'cyan');

  tm.applyTheme('crimson', false);
  assert.equal(tm.currentTheme, 'crimson');
  assert.equal(window.document.documentElement.getAttribute('data-theme'), 'crimson');
  assert.equal(window.localStorage.getItem('eclipse:theme'), 'crimson');

  dom.window.close();
});

domTest('EclipseAudio supports sound packs (cyber, arena, arcade) and pack persistence', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><button class="sfx-toggle-btn"></button></body></html>', {
    runScripts: 'outside-only',
    url: 'https://eclipse-esports.uz/'
  });
  const { window } = dom;

  // Mock AudioContext
  window.AudioContext = class MockAudioContext {
    constructor() { this.state = 'running'; }
    createGain() { return { gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {} }; }
    createOscillator() { return { type: 'sine', frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {} }; }
    get currentTime() { return 0; }
  };

  window.eval(readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8'));

  assert.ok(window.EclipseAudio, 'EclipseAudio is defined');
  assert.equal(window.EclipseAudio.getSoundPack(), 'cyber', 'Default sound pack is cyber');

  window.EclipseAudio.setSoundPack('arena');
  assert.equal(window.EclipseAudio.getSoundPack(), 'arena');
  assert.equal(window.localStorage.getItem('eclipse:sfx:pack'), 'arena');

  window.EclipseAudio.setSoundPack('arcade');
  assert.equal(window.EclipseAudio.getSoundPack(), 'arcade');
  assert.equal(window.localStorage.getItem('eclipse:sfx:pack'), 'arcade');

  dom.window.close();
});

domTest('PlayerManager calculates 6-axis radar metrics and renders SVG playstyle chart', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/players.js', import.meta.url), 'utf8'));

  const pm = new window.PlayerManager({}, {});

  const mockStats = {
    kdaRatio: '4.80',
    avgDamageShare: 28.5,
    avgGoldPerMinute: 780,
    avgTurretDamageShare: 32.0,
    avgTeamfightParticipation: 72.0,
    avgDeaths: 1.8
  };

  const metrics = pm.getPlayerRadarMetrics(mockStats);
  assert.ok(metrics.kda.score > 0, 'KDA score computed');
  assert.ok(metrics.damage.score > 0, 'Damage score computed');
  assert.ok(metrics.farm.score > 0, 'Farm score computed');
  assert.ok(metrics.push.score > 0, 'Push score computed');
  assert.ok(metrics.teamfight.score > 0, 'Teamfight score computed');
  assert.ok(metrics.survival.score > 0, 'Survival score computed');
  assert.ok(metrics.playstyle.title, 'Playstyle title designated');

  const svgHtml = pm.renderPlayerRadarSvg(metrics, 'God_speed');
  assert.match(svgHtml, /player-radar-card/, 'Radar card container rendered');
  assert.match(svgHtml, /<svg class="player-radar-svg"/, 'SVG radar element present');
  assert.match(svgHtml, /<polygon points=/, 'Polygon vertices rendered');
  assert.match(svgHtml, /6-O‘qli Taktik Radar/, 'Radar title in Uzbek rendered');
  assert.match(svgHtml, /radar-playstyle-banner/, 'Playstyle banner present');

  dom.window.close();
});

domTest('StatsEngine computes duration breakdown (early, mid, late) and renders HTML', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/stats.js', import.meta.url), 'utf8'));

  const engine = new window.StatsEngine({});

  const sampleMatches = [
    { id: 'm1', result: 'win', durationSeconds: 540 },  // 9 min -> early win
    { id: 'm2', result: 'win', durationSeconds: 580 },  // 9.6 min -> early win
    { id: 'm3', result: 'loss', durationSeconds: 720 }, // 12 min -> mid loss
    { id: 'm4', result: 'win', durationSeconds: 840 },  // 14 min -> mid win
    { id: 'm5', result: 'win', durationSeconds: 1100 }  // 18.3 min -> late win
  ];

  const breakdown = engine.getGameDurationBreakdown(sampleMatches, { scope: 'all' });
  assert.equal(breakdown.hasData, true);
  assert.equal(breakdown.totalCount, 5);
  assert.equal(breakdown.phases.early.wins, 2);
  assert.equal(breakdown.phases.early.losses, 0);
  assert.equal(breakdown.phases.early.winRate, '100.0');

  assert.equal(breakdown.phases.mid.wins, 1);
  assert.equal(breakdown.phases.mid.losses, 1);
  assert.equal(breakdown.phases.mid.winRate, '50.0');

  assert.equal(breakdown.phases.late.wins, 1);
  assert.equal(breakdown.phases.late.losses, 0);

  assert.equal(breakdown.peakPhase, 'early', 'Peak phase detected as early with 100% WR');

  const html = window.StatsEngine.renderDurationAnalyticsHtml(breakdown);
  assert.match(html, /duration-analytics-card/);
  assert.match(html, /O‘yin Davomiyligi & Power Spike Tahlili/);
  assert.match(html, /PEAK BOSQICH/);
  assert.match(html, /Erta bosqich \(≤10m\)/);

  dom.window.close();
});

domTest('PlayerManager renders interactive Synergy Constellation SVG graph', () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="constellationContainer"></div></body></html>', {
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/players.js', import.meta.url), 'utf8'));

  const mockDb = {
    getAllPlayers: () => [
      { id: 'p1', name: 'Heavenlyyy', matchesCount: 15 },
      { id: 'p2', name: 'God_speed', matchesCount: 14 },
      { id: 'p3', name: 'Tofik', matchesCount: 13 },
      { id: 'p4', name: 'Trouble', matchesCount: 12 },
      { id: 'p5', name: 'Hiko', matchesCount: 11 }
    ]
  };

  const mockMatches = [
    { result: 'win', players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }, { id: 'p5' }] },
    { result: 'win', players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }, { id: 'p5' }] },
    { result: 'loss', players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }, { id: 'p5' }] }
  ];

  const pm = new window.PlayerManager(mockDb, {});
  pm.renderSynergyConstellation('constellationContainer', mockMatches);

  const container = window.document.getElementById('constellationContainer');
  assert.ok(container.querySelector('.synergy-constellation-card'), 'Constellation card created');
  assert.ok(container.querySelector('.constellation-svg'), 'SVG constellation present');
  const links = container.querySelectorAll('.constellation-link');
  // 5 players -> 10 pairs
  assert.equal(links.length, 10, 'All 10 pair links rendered');
  const nodes = container.querySelectorAll('.constellation-node');
  assert.equal(nodes.length, 5, '5 player nodes rendered');
  assert.ok(container.querySelector('#constellationTooltip'), 'Tooltip element present');

  dom.window.close();
});

domTest('Dashboard Widget Manager renders modal, toggles visibility, and persists to localStorage', () => {
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(indexHtml, /themeSwitcherBtn/, 'index.html has themeSwitcherBtn');
  assert.match(indexHtml, /customizeWidgetsBtn/, 'index.html has customizeWidgetsBtn');
  assert.match(indexHtml, /js\/theme\.js/, 'index.html loads js/theme.js');

  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <body>
        <button id="customizeWidgetsBtn"></button>
        <div id="widget-command">Command</div>
        <div id="widget-constellation">Constellation</div>
        <div id="widget-duration">Duration</div>
        <div id="widget-coach">Coach</div>
      </body>
    </html>
  `, { runScripts: 'outside-only', url: 'https://eclipse-esports.uz/' });
  const { window } = dom;

  // Mock dialog showModal & close
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    window.HTMLDialogElement.prototype.close = function() { this.open = false; };
  }

  window.eval(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'));

  const app = window.EclipseApp;
  app.initWidgetManager();

  const cmdWidget = window.document.getElementById('widget-command');
  const durWidget = window.document.getElementById('widget-duration');
  assert.equal(cmdWidget.style.display, '');
  assert.equal(durWidget.style.display, '');

  // Open modal
  const customizeBtn = window.document.getElementById('customizeWidgetsBtn');
  customizeBtn.click();

  const dialog = window.document.getElementById('widgetManagerDialog');
  assert.ok(dialog, 'Widget manager dialog created');

  // Toggle duration off
  const durItem = dialog.querySelector('.widget-toggle-item[data-widget-id="widget-duration"]');
  assert.ok(durItem, 'Duration toggle item exists');
  durItem.click();

  assert.equal(durWidget.style.display, 'none', 'Duration widget hidden after toggle');
  const saved = JSON.parse(window.localStorage.getItem('eclipse:dashboard_widgets') || '{}');
  assert.equal(saved['widget-duration'], false, 'Preference persisted in localStorage');

  dom.window.close();
});

domTest('Player profile share card button downloads player card without throwing error', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="playerProfileContainer"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'https://eclipse-esports.uz/'
  });
  const { window } = dom;

  let downloadedCardData = null;
  window.EclipseShareCard = {
    downloadPlayerCard: async (data) => {
      downloadedCardData = data;
    }
  };
  window.showToast = (msg, type) => {
    if (type === 'error') throw new Error(`Unexpected error toast: ${msg}`);
  };

  window.eval(readFileSync(new URL('../js/date-utils.js', import.meta.url), 'utf8'));
  window.eval(readFileSync(new URL('../js/players.js', import.meta.url), 'utf8'));

  const mockDb = {
    getAllPlayers: () => [
      { id: 'p1', name: 'God_speed', primaryRole: 'Jungler' }
    ]
  };

  const mockStatsEngine = {
    getPlayerStats: () => ({
      matchesPlayed: 10,
      winRate: '70.0',
      kdaRatio: '5.20',
      performanceScore: 4.8,
      mvpCount: 3,
      avgInGameScore: 9.2,
      totalDamageDealt: 120000,
      avgDamageDealt: 12000,
      totalDamageReceived: 80000,
      avgDamageReceived: 8000,
      totalTurretDamage: 45000,
      avgTurretDamage: 4500,
      totalGoldEarned: 85000,
      avgGoldEarned: 8500,
      totalKills: 45,
      totalDeaths: 12,
      totalAssists: 55,
      avgKills: '4.5',
      avgDeaths: '1.2',
      avgAssists: '5.5',
      avgDamageShare: 28,
      avgGoldShare: 24,
      avgGoldPerMinute: 780,
      avgTurretDamageShare: 32,
      avgTeamfightParticipation: 75,
      goldCount: 2,
      silverCount: 4,
      bronzeCount: 1,
      savageCount: 0,
      maniacCount: 1
    }),
    getPlayerRoleBreakdown: () => ({ bestRole: 'Jungler', roles: [] }),
    getPlayerHeroAnalytics: () => ({ heroes: [], uniqueHeroesCount: 3, mostPicked: { heroName: 'Ling' } }),
    getPlayerTrends: () => [{ player: { id: 'p1' }, comparisonAvailable: false, diff: null }]
  };
  window.StatsEngine = {
    ROLE_COLORS: {},
    ROLE_ICONS: {},
    formatLargeNumber: (n) => String(n)
  };

  const pm = new window.PlayerManager(mockDb, mockStatsEngine);
  const sampleMatches = [
    { date: '2026-10-18T10:00:00Z', result: 'win', players: [{ id: 'p1', heroName: 'Ling', kills: 8, deaths: 1, assists: 6 }] },
    { date: '2026-10-17T10:00:00Z', result: 'win', players: [{ id: 'p1', heroName: 'Ling', kills: 7, deaths: 2, assists: 8 }] },
    { date: '2026-10-16T10:00:00Z', result: 'loss', players: [{ id: 'p1', heroName: 'Fanny', kills: 4, deaths: 4, assists: 2 }] }
  ];

  pm.renderPlayerProfile('playerProfileContainer', 'p1', sampleMatches);

  const shareBtn = window.document.getElementById('sharePlayerCardBtn');
  assert.ok(shareBtn, 'Share button exists in profile');

  // Trigger click
  await shareBtn.click();

  assert.ok(downloadedCardData, 'downloadPlayerCard was successfully called');
  assert.equal(downloadedCardData.name, 'God_speed');
  assert.equal(downloadedCardData.role, 'Jungler');
  assert.equal(downloadedCardData.winRate, '70.0%');
  assert.equal(downloadedCardData.kda, '5.20');
  assert.equal(downloadedCardData.streakCount, 2, '2 consecutive wins detected');
  assert.deepEqual(downloadedCardData.recentResults, ['win', 'win', 'loss']);

  dom.window.close();
});

domTest('ProgressHub QoL redesign provides week navigator, quick player switcher, and hero chips', async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="progressContainer"></div></body></html>', {
    runScripts: 'outside-only',
    url: 'https://eclipse-esports.uz/'
  });
  const { window } = dom;

  const model = await import('../js/progress-model.js');
  const focusModel = await import('../js/weekly-focus-model.js');
  Object.assign(window, model, focusModel);

  const progressScript = readFileSync(new URL('../js/progress.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/export (class|function|async function)/g, '$1');

  window.eval(progressScript);

  const players = [
    { id: 'p1', name: 'God_speed', primaryRole: 'Jungler' },
    { id: 'p2', name: 'Shadow', primaryRole: 'EXP Laner' }
  ];
  const row1 = { playerId: 'p1', heroId: 1, heroUsed: 'Ling', rolePlayed: 'Jungler', kills: 8, deaths: 1, assists: 6, inGameScore: 9.5, damageDealt: 65000, medal: 'mvp' };
  const row2 = { playerId: 'p1', heroId: 2, heroUsed: 'Fanny', rolePlayed: 'Jungler', kills: 5, deaths: 3, assists: 4, inGameScore: 7.2, damageDealt: 45000, medal: 'gold' };
  const data = {
    revision: 1,
    players,
    matches: [
      { id: 'm1', date: '2026-10-15', scope: 'individual', result: 'win', matchType: 'ranked', durationSeconds: 720, playerStats: [row1] },
      { id: 'm2', date: '2026-10-14', scope: 'individual', result: 'loss', matchType: 'ranked', durationSeconds: 680, playerStats: [row2] }
    ]
  };

  const app = {
    authManager: { isAdmin: () => true, getAccessToken: () => 'token', getToken: () => 'token' },
    cloudSync: { getStatus: () => ({ pending: false, syncing: false }), async syncDown() {} }
  };

  const hub = new window.ProgressHub(app);
  hub.container = window.document.getElementById('progressContainer');
  hub.data = data;
  hub.date = '2026-10-15';
  hub.scope = 'squad';
  hub.playerId = 'p1';

  // 1. Weekly tab: Navigator controls & Scorecards
  hub.tab = 'weekly';
  hub.draw();

  const prevBtn = hub.container.querySelector('[data-week-nav="-1"]');
  const nextBtn = hub.container.querySelector('[data-week-nav="1"]');
  const todayBtn = hub.container.querySelector('[data-week-nav="0"]');
  assert.ok(prevBtn, 'Previous week button exists');
  assert.ok(nextBtn, 'Next week button exists');
  assert.ok(todayBtn, 'Today week button exists');

  const initialDate = hub.date;
  prevBtn.click();
  assert.notEqual(hub.date, initialDate, 'Clicking previous week shifts the week date');

  // 2. Personal tab: Quick player switcher
  hub.tab = 'compare';
  hub.draw();

  const playerChips = hub.container.querySelectorAll('[data-select-player]');
  assert.equal(playerChips.length, 2, '2 quick player switcher buttons rendered');
  assert.ok(playerChips[0].classList.contains('active'), 'First player is active initially');

  playerChips[1].click();
  assert.equal(hub.playerId, 'p2', 'Clicking player chip switches active player');

  // 3. Hero Journey: Hero chip picker when no hero is selected
  hub.playerId = 'p1';
  hub.hero = '';
  hub.tab = 'journey';
  hub.draw();

  const heroChips = hub.container.querySelectorAll('[data-select-hero]');
  assert.ok(heroChips.length >= 1, 'Top hero chips rendered when hero is unselected');

  heroChips[0].click();
  assert.ok(hub.hero, 'Clicking hero chip selects that hero for journey analysis');

  dom.window.close();
});

domTest('hotkeysTriggerBtn opens hotkeys dialog and close button closes it without double-trigger race condition', () => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <button type="button" class="hotkeys-trigger-btn topbar-icon-btn" id="hotkeysTriggerBtn"><kbd>?</kbd></button>
    <dialog class="hotkeys-dialog" id="hotkeysDialog">
      <div class="hotkeys-modal">
        <button type="button" class="hotkeys-modal__close" id="hotkeysCloseBtn"><kbd>Esc</kbd></button>
      </div>
    </dialog>
  </body></html>`, {
    runScripts: 'outside-only',
    url: 'https://eclipse-esports.uz/'
  });
  const { window } = dom;

  // Mock HTMLDialogElement methods in JSDOM
  window.HTMLDialogElement.prototype.showModal = function() {
    this.open = true;
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function() {
    this.open = false;
    this.removeAttribute('open');
  };

  // Load draft-helper.js (which has global triggers)
  window.eval(readFileSync(new URL('../js/draft-helper.js', import.meta.url), 'utf8'));

  // DraftAssistant is auto-initialized by draft-helper.js
  const da = window.draftAssistant;

  const triggerBtn = window.document.getElementById('hotkeysTriggerBtn');
  const closeBtn = window.document.getElementById('hotkeysCloseBtn');
  const dialog = window.document.getElementById('hotkeysDialog');

  // Also attach app.js bindQolControls logic to simulate the real app environment
  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dialog.open) {
      dialog.showModal();
    }
  });

  assert.equal(dialog.open, false, 'Dialog is closed initially');

  // Click on the <kbd>?</kbd> or triggerBtn
  triggerBtn.querySelector('kbd').click();
  assert.equal(dialog.open, true, 'Dialog opens on hotkeysTriggerBtn click');

  // Click close button
  closeBtn.click();
  assert.equal(dialog.open, false, 'Dialog closes on hotkeysCloseBtn click');

  // Trigger keydown '?'
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true }));
  assert.equal(dialog.open, true, 'Dialog toggles open on ? keydown');

  // Trigger keydown '?' again to toggle close
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true }));
  assert.equal(dialog.open, false, 'Dialog toggles closed on second ? keydown');

  dom.window.close();
});
