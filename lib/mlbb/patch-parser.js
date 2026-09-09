import { cleanText, normalizeHeroKey, stripMarkup } from './normalize.js';

function bodyLines(html) {
  return stripMarkup(html, 250_000)
    .split(/\n+/)
    .map(line => cleanText(line, 1_200))
    .filter(Boolean);
}

function firstNarrative(lines, start) {
  for (let index = start + 1; index < Math.min(lines.length, start + 8); index += 1) {
    const line = lines[index];
    if (!/^\[.+\](?:\s*\([↑↓~]\))?$/.test(line) && !/^\d+\.\s/.test(line)) return line;
  }
  return '';
}

function changeType(symbol) {
  if (symbol === '↑') return 'buff';
  if (symbol === '↓') return 'nerf';
  return 'adjustment';
}

export function parsePatchArticle(article, catalog = [], options = {}) {
  const now = options.now || new Date().toISOString();
  const lines = bodyLines(article?.body || '');
  const heroNames = new Map(catalog.map(hero => [normalizeHeroKey(hero.name), hero]));
  const adjustments = [];
  const seenAdjustments = new Set();

  lines.forEach((line, index) => {
    const match = line.match(/^\[([^\]]{2,80})\]\s*\(([↑↓~])\)$/);
    if (!match) return;
    const hero = heroNames.get(normalizeHeroKey(match[1]));
    if (!hero || seenAdjustments.has(hero.id)) return;
    seenAdjustments.add(hero.id);
    adjustments.push({
      heroId: hero.id,
      heroName: hero.name,
      change: changeType(match[2]),
      summary: firstNarrative(lines, index).slice(0, 320)
    });
  });

  const newHeroes = [];
  lines.forEach((line, index) => {
    const match = line.match(/^New Hero:\s*(.+?)(?:\s+-\s+|\s+–\s+)([^-–]{2,80})$/i);
    if (!match) return;
    const rawName = cleanText(match[2], 80);
    const hero = heroNames.get(normalizeHeroKey(rawName));
    newHeroes.push({
      heroId: hero?.id || null,
      heroName: hero?.name || rawName,
      epithet: cleanText(match[1], 120),
      summary: firstNarrative(lines, index).slice(0, 320)
    });
  });

  const designersIndex = lines.findIndex(line => /^From the Designers$/i.test(line));
  const overview = designersIndex >= 0
    ? lines.slice(designersIndex + 1).filter(line => !/^\d+\.\s/.test(line)).slice(0, 2)
    : [];
  const battlefieldSignals = lines.filter(line =>
    /^\[(?:Battlefield|Jungle|Equipment|Retribution|Creeps|Bush|Lord|Turtle|Minion)[^\]]*\]/i.test(line)
    || /^\d+\.\s+(?:Battlefield|System|Mode) Adjustments/i.test(line)
  ).slice(0, 10);

  const title = cleanText(article?.title, 160);
  const classification = /preview|advanced server/i.test(`${title} ${(article?.tags || []).join(' ')}`)
    ? 'preview'
    : /patch notes/i.test(title) ? 'official-release' : 'patch-update';
  // Finding supported headings does not prove complete article coverage.
  const confidence = adjustments.length || newHeroes.length ? 'partial' : 'review';

  return {
    id: Number(article?.id),
    title,
    brief: cleanText(article?.brief || overview.join(' '), 500),
    cover: article?.cover || '',
    kind: article?.kind || 'article',
    tags: Array.isArray(article?.tags) ? article.tags : [],
    channels: Array.isArray(article?.channels) ? article.channels : [],
    publishedAt: article?.publishedAt || null,
    officialUrl: article?.officialUrl || '',
    classification,
    confidence,
    parseCoverage: 'partial',
    parseNote: 'Faqat avtomatik aniqlangan sarlavhalar. To‘liq o‘zgarishlar uchun original patch notesni tekshiring.',
    overview,
    newHeroes,
    heroAdjustments: adjustments,
    battlefieldSignals,
    changeCounts: {
      buffs: adjustments.filter(item => item.change === 'buff').length,
      nerfs: adjustments.filter(item => item.change === 'nerf').length,
      adjustments: adjustments.filter(item => item.change === 'adjustment').length
    },
    parsedAt: now,
    source: { provider: 'Official Mobile Legends CMS', official: true }
  };
}
