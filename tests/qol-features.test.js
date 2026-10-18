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


