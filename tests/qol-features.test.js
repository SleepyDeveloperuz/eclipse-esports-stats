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

  const subJs = readFileSync(new URL('../js/submissions.js', import.meta.url), 'utf8');
  assert.match(subJs, /Ctrl\+V/);
  assert.match(subJs, /submission-dropzone__hint/);
});
