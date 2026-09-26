import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let JSDOM;
try { ({ JSDOM } = await import(process.env.ECLIPSE_JSDOM_PATH || 'jsdom')); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const domTest = JSDOM ? test : (name, fn) => test(name, { skip: 'Set ECLIPSE_JSDOM_PATH.' }, fn);
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

function surface({ privatePage = false, width = 1440 } = {}) {
  const w = new JSDOM(read(privatePage ? 'index.html' : 'meta-lab.html')).window;
  // JSDOM has no layout engine. Resolve width media queries explicitly, then test
  // the stylesheet cascade and structural constraints, not pixel geometry.
  function rulesForWidth(rules) {
    return Array.from(rules).map(rule => {
      if (rule.media) {
        const query = rule.conditionText || rule.media.mediaText;
        if (/prefers-|orientation|hover|pointer|print/.test(query)) return '';
        const max = /max-width:\s*(\d+)px/.exec(query);
        const min = /min-width:\s*(\d+)px/.exec(query);
        return ((!max || width <= Number(max[1])) && (!min || width >= Number(min[1]))) ? rulesForWidth(rule.cssRules) : '';
      }
      return rule.cssText;
    }).join('\n');
  }
  for (const link of w.document.querySelectorAll('link[rel="stylesheet"]')) {
    const href = link.getAttribute('href'); if (/^https?:/.test(href)) continue;
    const style = w.document.createElement('style');
    style.textContent = read(href.replace(/^\//, '').split('?')[0]);
    w.document.head.append(style);
    assert.ok(style.sheet, href);
    style.textContent = rulesForWidth(style.sheet.cssRules);
  }
  w.document.querySelector('#metaLabContainer').innerHTML = '<section class="meta-lab-hero"><div class="meta-lab-hero__copy"><h2>Meta Lab</h2></div><div class="meta-lab-telemetry"></div></section><section class="meta-lab-commandbar"><nav class="meta-lab-tabs"></nav></section><section class="meta-explore"><header class="meta-section-header"><div>Rank Lens</div><label>Qahramon<select><option>Miya</option></select></label></header><div class="meta-lens-grid"></div><div class="meta-timeline-scroll"></div></section>';
  w.document.querySelector('.meta-lab-commandbar').insertAdjacentHTML('afterbegin', '<label class="meta-mobile-navigation">Bo‘lim<select><option>Draft</option></select></label>');
  w.document.querySelector('#metaLabContainer').insertAdjacentHTML('beforeend', '<section class="meta-decision"><div class="meta-draft-groups"></div><div class="meta-draft-results"></div><select><option>Hero</option></select></section>');
  return w;
}

domTest('public body stacks header, content and footer rather than inheriting private flex-row', () => {
  const w = surface();
  try {
    assert.equal(w.getComputedStyle(w.document.body).display, 'block');
    assert.equal(w.getComputedStyle(w.document.querySelector('header.public-meta-header')).display, 'grid');
    const children = Array.from(w.document.body.children).map(node => node.tagName);
    assert.ok(children.indexOf('HEADER') < children.indexOf('MAIN'));
    assert.ok(children.indexOf('MAIN') < children.indexOf('FOOTER'));
    assert.equal(w.document.querySelectorAll('.public-meta-actions > .btn').length, 2);
    assert.equal(w.getComputedStyle(w.document.querySelector('.public-meta-content')).minWidth, '0');
  } finally { w.close(); }
});

domTest('layout repair stays isolated from the private application shell', () => {
  const w = surface({ privatePage: true });
  try {
    assert.equal(w.getComputedStyle(w.document.body).display, 'flex');
    assert.ok(w.document.querySelector('.app-container'));
    assert.equal(w.getComputedStyle(w.document.querySelector('.meta-lab-hero')).gridTemplateColumns, 'minmax(0,1fr)');
  } finally { w.close(); }
});

domTest('desktop, tablet and phone CSS constrain controls and keep table scrolling local', () => {
  for (const [width, columns] of [[1440, 'repeat(4,minmax(0,1fr))'], [1024, 'repeat(2,minmax(0,1fr))'], [768, 'repeat(2,minmax(0,1fr))'], [390, 'minmax(0,1fr)'], [320, 'minmax(0,1fr)']]) {
    const w = surface({ width });
    try {
      const style = selector => w.getComputedStyle(w.document.querySelector(selector));
      assert.equal(style('.meta-lens-grid').gridTemplateColumns, columns, `${width}px ranks`);
      assert.equal(style('.meta-lab-hero').gridTemplateColumns, 'minmax(0,1fr)', 'Decorative orb must not reserve a fixed-width column');
      assert.equal(style('.meta-timeline-scroll').overflow, 'auto');
      assert.equal(style('.meta-timeline-scroll').maxWidth, '100%');
      assert.equal(style('.meta-section-header').flexDirection, 'row', 'Selector flex-basis must not become an oversized column height');
      if (width <= 600) assert.equal(style('.public-meta-header').gridTemplateColumns, 'minmax(0, 1fr)');
      if (width <= 700) assert.equal(style('.meta-lab-tabs').gridTemplateColumns, 'repeat(2,minmax(0,1fr))');
      assert.equal(style('.meta-lab-tabs').display, width <= 700 ? 'none' : 'flex');
      assert.equal(style('.meta-mobile-navigation').display, width <= 700 ? 'grid' : 'none');
      assert.equal(style('.meta-decision select').fontSize, '16px');
      assert.equal(style('.meta-decision').minWidth, '0');
      assert.equal(style('.meta-draft-groups').gridTemplateColumns, width <= 1000 ? 'minmax(0,1fr)' : 'repeat(3,minmax(0,1fr))');
      assert.equal(style('.meta-draft-results').gridTemplateColumns, width <= 700 ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))');
      if (width <= 1100) assert.equal(style('.meta-lab-commandbar').position, 'relative');
    } finally { w.close(); }
  }
});

test('both entry pages reference the corrected, cache-busted layout styles', () => {
  for (const file of ['index.html', 'meta-lab.html']) {
    assert.match(read(file), /public-meta\.css\?v=2\.30\.1/);
    assert.match(read(file), /meta-explore\.css\?v=2\.30\.1/);
  }
});

domTest('compact controls wrap on mobile and preserve usable targets on both entry pages', () => {
  for (const privatePage of [false, true]) for (const width of [320, 390, 768, 1440]) {
    const w = surface({ privatePage, width });
    try {
      const root = w.document.querySelector('#metaLabContainer'); root.classList.add('meta-qol');
      root.innerHTML = '<div class="meta-workspace"><div class="meta-workspace-heading"><header>Tierlist</header></div><div class="meta-workspace-controls"><div class="meta-rank-picker"><span>Rank</span><button class="btn">Mythical Glory+</button></div></div><div class="meta-tier-tools"><label><input></label><div class="meta-tier-legend"><button>SS</button></div></div><button hidden>Hidden</button></div>';
      const style = selector => w.getComputedStyle(root.querySelector(selector));
      assert.equal(style('.meta-workspace').minWidth, '0');
      assert.equal(style('.btn').minHeight, '44px');
      assert.equal(style('.meta-tier-legend button').minHeight, '44px');
      assert.equal(style('input').fontSize, '1rem');
      assert.equal(style('[hidden]').display, 'none');
      if (width <= 700) {
        assert.equal(style('.meta-rank-picker').gridTemplateColumns, 'repeat(2,minmax(0,1fr))');
        assert.equal(style('.meta-workspace-controls').display, 'grid');
      }
      assert.equal(style('.meta-workspace-heading').gridTemplateColumns, width <= 1000 ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto');
    } finally { w.close(); }
  }
});
