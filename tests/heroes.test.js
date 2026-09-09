import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const heroesSource = readFileSync(new URL('../js/heroes.js', import.meta.url), 'utf8');

function storageMock(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function createHeroDatabase(initialHeroes = [], removedHeroes = []) {
  const localStorage = storageMock({
    eclipse_heroes: JSON.stringify(initialHeroes),
    eclipse_removed_heroes: JSON.stringify(removedHeroes)
  });
  const window = {};
  const context = vm.createContext({ window, localStorage, console });
  vm.runInContext(heroesSource, context, { filename: 'heroes.js' });
  return { db: new window.HeroDatabase(), localStorage };
}

test('a successful canonical hydrate replaces unmatched hand-written hero rows', () => {
  const { db } = createHeroDatabase([
    { name: 'Fanny', role: 'Assassin' },
    { name: 'Legacy Ghost', role: 'Mage' },
    { name: 'Exor', role: 'Mage' }
  ]);

  db.hydrateCanonical([
    { id: 17, name: 'Fanny', roles: ['Assassin'], lanes: ['Jungle'] },
    { id: 18, name: 'Layla', roles: ['Marksman'], lanes: ['Gold Lane'] }
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(db.getAll().map(hero => ({ id: hero.id, name: hero.name })))),
    [{ id: 17, name: 'Fanny' }, { id: 18, name: 'Layla' }]
  );
  assert.equal(db.findByName('Legacy Ghost'), null);
});

test('an official hero returns even when an old manual removal marker exists', () => {
  const { db, localStorage } = createHeroDatabase(
    [{ name: 'Fanny', role: 'Assassin' }],
    ['layla']
  );

  db.hydrateCanonical([
    { id: 18, name: 'Layla', roles: ['Marksman'] }
  ]);

  assert.equal(db.findById(18)?.name, 'Layla');
  assert.deepEqual(JSON.parse(localStorage.getItem('eclipse_removed_heroes')), []);
});
