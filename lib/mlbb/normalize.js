const MEDIA_HOST = 'akmweb.youngjoygame.com';
const OFFICIAL_LINK_HOSTS = new Set(['www.mobilelegends.com', 'mobilelegends.com', 'play.mobilelegends.com']);

export class ValidationError extends Error {
  constructor(message, code = 'UPSTREAM_SCHEMA_INVALID') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.status = 502;
  }
}

export function cleanText(value, maxLength = 400) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function decodeEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', uarr: '↑', darr: '↓', rarr: '→', hellip: '…'
  };
  return String(value ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

export function stripMarkup(value, maxLength = 4_000) {
  const text = String(value ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|h[1-6]|strong)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

export function normalizeHeroKey(value) {
  return cleanText(value, 100)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

export function safeMediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === MEDIA_HOST ? url.toString() : '';
  } catch (_) {
    return '';
  }
}

export function safeOfficialUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && OFFICIAL_LINK_HOSTS.has(url.hostname) ? url.toString() : '';
  } catch (_) {
    return '';
  }
}

function finiteRate(value, label) {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') {
    throw new ValidationError(`${label} qiymati mavjud emas`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new ValidationError(`${label} 0 va 1 oralig‘ida emas`);
  }
  return number;
}

function unique(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).reduce((items, value) => {
    const cleaned = cleanText(value, 80);
    const key = cleaned.toLocaleLowerCase('en-US');
    if (!cleaned || seen.has(key)) return items;
    seen.add(key);
    items.push(cleaned);
    return items;
  }, []);
}

function recordsFrom(payload, options = {}) {
  const { label = 'Upstream', minRecords = 1, maxRecords = 500 } = options;
  if (!payload || Number(payload.code) !== 0 || !Array.isArray(payload.data?.records)) {
    throw new ValidationError(`${label} javob formati o‘zgargan`);
  }
  const records = payload.data.records;
  if (records.length < minRecords || records.length > maxRecords) {
    throw new ValidationError(`${label} rekordlar soni shubhali: ${records.length}`);
  }
  const reportedTotal = Number(payload.data.total);
  // CMS endpoints report the full collection total even when we intentionally
  // request only one bounded page. Reject impossible totals, not valid pagination.
  if (Number.isFinite(reportedTotal) && (reportedTotal < records.length || reportedTotal > Math.max(10_000, maxRecords * 50))) {
    throw new ValidationError(`${label} total qiymati shubhali`);
  }
  return records;
}

function relationIds(relation) {
  return (Array.isArray(relation?.target_hero_id) ? relation.target_hero_id : [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0);
}

export function normalizeHeroCatalog(payload, options = {}) {
  const now = options.now || new Date().toISOString();
  const records = recordsFrom(payload, {
    label: 'Hero catalog',
    minRecords: options.minRecords ?? 100,
    maxRecords: options.maxRecords ?? 180
  });
  const seen = new Set();
  const heroes = records.map(record => {
    const data = record?.data || {};
    const heroData = data.hero?.data || {};
    const id = Number(data.hero_id);
    const name = cleanText(heroData.name, 80);
    if (!Number.isInteger(id) || id <= 0 || !name || seen.has(id)) {
      throw new ValidationError('Hero catalogda yaroqsiz yoki takroriy hero bor');
    }
    seen.add(id);
    return {
      id,
      key: normalizeHeroKey(name),
      name,
      aliases: [],
      roles: [],
      lanes: [],
      specialties: [],
      story: '',
      images: {
        portrait: safeMediaUrl(heroData.head),
        minimap: safeMediaUrl(heroData.smallmap),
        splash: ''
      },
      skills: [],
      relations: {
        synergies: relationIds(data.relation?.assist),
        strongAgainst: relationIds(data.relation?.strong),
        weakAgainst: relationIds(data.relation?.weak),
        descriptions: { synergies: '', strongAgainst: '', weakAgainst: '' }
      },
      officialUrl: '',
      availability: 'available',
      firstSeenAt: now,
      lastSeenAt: now,
      missingSyncs: 0,
      detailsUpdatedAt: null,
      source: {
        provider: 'Rone Arena API',
        providerUrl: 'https://github.com/ridwaanhall/rone-arena-api',
        license: 'BSD-3-Clause',
        fetchedAt: now
      }
    };
  });
  return heroes.sort((a, b) => a.name.localeCompare(b.name));
}

function nestedLabels(items, key) {
  return (Array.isArray(items) ? items : [])
    .map(item => typeof item === 'string' ? item : item?.data?.[key])
    .filter(Boolean);
}

export function normalizeHeroDetail(payload, options = {}) {
  const now = options.now || new Date().toISOString();
  const record = recordsFrom(payload, { label: 'Hero detail', minRecords: 1, maxRecords: 2 })[0];
  const data = record?.data || {};
  const heroData = data.hero?.data || {};
  const id = Number(data.hero_id ?? heroData.heroid ?? options.catalogHero?.id);
  const name = cleanText(heroData.name || options.catalogHero?.name, 80);
  if (!Number.isInteger(id) || id <= 0 || !name) throw new ValidationError('Hero detail identifikatori yaroqsiz');

  const skills = (Array.isArray(heroData.heroskilllist) ? heroData.heroskilllist : [])
    .flatMap(group => Array.isArray(group?.skilllist) ? group.skilllist : [])
    .map(skill => ({
      id: Number.isFinite(Number(skill?.skillid)) ? Number(skill.skillid) : null,
      name: cleanText(skill?.skillname, 100),
      description: stripMarkup(skill?.skilldesc, 1_800),
      cooldownCost: cleanText(skill?.['skillcd&cost'], 180),
      icon: safeMediaUrl(skill?.skillicon),
      tags: unique((Array.isArray(skill?.skilltag) ? skill.skilltag : []).map(tag => tag?.tagname || tag))
    }))
    .filter(skill => skill.name && skill.description)
    .slice(0, 8);

  const roles = unique([
    ...(Array.isArray(heroData.sortlabel) ? heroData.sortlabel : []),
    ...nestedLabels(heroData.sortid, 'sort_title')
  ]);
  const lanes = unique([
    ...(Array.isArray(heroData.roadsortlabel) ? heroData.roadsortlabel : []),
    ...nestedLabels(heroData.roadsort, 'road_sort_title')
  ]);

  return {
    ...(options.catalogHero || {}),
    id,
    key: normalizeHeroKey(name),
    name,
    roles,
    lanes,
    specialties: unique(heroData.speciality),
    story: stripMarkup(heroData.story, 1_200),
    images: {
      portrait: safeMediaUrl(heroData.head || data.head || options.catalogHero?.images?.portrait),
      minimap: safeMediaUrl(heroData.smallmap || options.catalogHero?.images?.minimap),
      splash: safeMediaUrl(heroData.painting || data.head_big || options.catalogHero?.images?.splash)
    },
    skills,
    relations: {
      synergies: relationIds(data.relation?.assist),
      strongAgainst: relationIds(data.relation?.strong),
      weakAgainst: relationIds(data.relation?.weak),
      descriptions: {
        synergies: stripMarkup(data.relation?.assist?.desc, 700),
        strongAgainst: stripMarkup(data.relation?.strong?.desc, 700),
        weakAgainst: stripMarkup(data.relation?.weak?.desc, 700)
      }
    },
    officialUrl: safeOfficialUrl(data.url),
    availability: 'available',
    lastSeenAt: now,
    missingSyncs: 0,
    detailsUpdatedAt: now,
    source: {
      provider: 'Rone Arena API',
      providerUrl: 'https://github.com/ridwaanhall/rone-arena-api',
      license: 'BSD-3-Clause',
      upstreamUpdatedAt: Number.isFinite(Number(record.updatedAt)) ? new Date(Number(record.updatedAt)).toISOString() : null,
      fetchedAt: now
    }
  };
}

export function normalizeRankPayload(payload, options = {}) {
  const now = options.now || new Date().toISOString();
  const records = recordsFrom(payload, {
    label: 'Hero rank',
    minRecords: options.minRecords ?? 80,
    maxRecords: options.maxRecords ?? 180
  });
  if (Number.isFinite(Number(payload.data.total)) && Number(payload.data.total) !== records.length) {
    throw new ValidationError('Hero rank ro‘yxati to‘liq kelmadi; oldingi ma’lumot saqlanadi');
  }
  const seen = new Set();
  return records.map((record, index) => {
    const data = record?.data || {};
    const id = Number(data.main_heroid);
    const name = cleanText(data.main_hero?.data?.name, 80);
    if (!Number.isInteger(id) || id <= 0 || !name || seen.has(id)) {
      throw new ValidationError('Rank jadvalida yaroqsiz yoki takroriy hero bor');
    }
    seen.add(id);
    return {
      heroId: id,
      name,
      image: safeMediaUrl(data.main_hero?.data?.head),
      winRate: finiteRate(data.main_hero_win_rate, 'Win rate'),
      pickRate: finiteRate(data.main_hero_appearance_rate, 'Pick rate'),
      banRate: finiteRate(data.main_hero_ban_rate, 'Ban rate'),
      officialRank: index + 1,
      rank: cleanText(options.rank || 'mythic', 20).toLowerCase(),
      days: String(options.days || '7'),
      fetchedAt: now
    };
  });
}

export function normalizeCounterPayload(payload, options = {}) {
  const record = recordsFrom(payload, { label: options.label || 'Hero matchup', minRecords: 1, maxRecords: 2 })[0];
  const data = record?.data || {};
  const normalizeRows = rows => (Array.isArray(rows) ? rows : []).map(row => ({
    heroId: Number(row?.heroid),
    image: safeMediaUrl(row?.hero?.data?.head),
    winRate: Number.isFinite(Number(row?.hero_win_rate)) ? Number(row.hero_win_rate) : null,
    pickRate: Number.isFinite(Number(row?.hero_appearance_rate)) ? Number(row.hero_appearance_rate) : null,
    deltaWinRate: Number.isFinite(Number(row?.increase_win_rate)) ? Number(row.increase_win_rate) : null
  })).filter(row => Number.isInteger(row.heroId) && row.heroId > 0).slice(0, 10);
  return {
    heroId: Number(data.main_heroid),
    favorable: normalizeRows(data.sub_hero),
    unfavorable: normalizeRows(data.sub_hero_last)
  };
}

export function normalizePatchFeed(payload, options = {}) {
  const now = options.now || new Date().toISOString();
  const records = recordsFrom(payload, { label: 'Patch feed', minRecords: 1, maxRecords: 120 });
  return records.map(record => {
    const data = record?.data || {};
    const channels = unique((Array.isArray(data.channel) ? data.channel : []).map(item => item?.title));
    const tags = unique((Array.isArray(data.tag) ? data.tag : []).map(item => item?.title));
    const isPatch = [...channels, ...tags].some(value => /^patch$/i.test(value)) || /patch/i.test(data.title || '');
    const id = Number(record?.id);
    const timestamp = Number(data.start_time);
    if (!isPatch || !Number.isInteger(id) || id <= 0 || !cleanText(data.title, 160)) return null;
    return {
      id,
      title: cleanText(data.title, 160),
      brief: cleanText(data.brief, 400),
      kind: cleanText(data.kind || 'article', 30),
      channels,
      tags,
      cover: safeMediaUrl(data.cover),
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      officialUrl: `https://www.mobilelegends.com/news/articleldetail?newsid=${id}`,
      fetchedAt: now
    };
  }).filter(Boolean).sort((a, b) => {
    const aTime = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bTime = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bTime - aTime || b.id - a.id;
  });
}

export function mergeHeroCatalog(previous = [], incoming = [], now = new Date().toISOString()) {
  const incomingById = new Map(incoming.map(hero => [hero.id, hero]));
  const previousById = new Map(previous.map(hero => [Number(hero.id), hero]));
  const merged = incoming.map(hero => {
    const old = previousById.get(hero.id);
    if (!old) return hero;
    return {
      ...old,
      ...hero,
      aliases: unique([...(old.aliases || []), ...(hero.aliases || [])]),
      roles: hero.roles?.length ? hero.roles : old.roles,
      lanes: hero.lanes?.length ? hero.lanes : old.lanes,
      specialties: hero.specialties?.length ? hero.specialties : old.specialties,
      // Full copy belongs in the per-hero cache. Keeping it in the shared
      // catalog makes every list request grow after a dossier is opened.
      story: '',
      skills: [],
      images: { ...old.images, ...Object.fromEntries(Object.entries(hero.images || {}).filter(([, value]) => value)) },
      relations: {
        synergies: hero.relations?.synergies ?? old.relations?.synergies ?? [],
        strongAgainst: hero.relations?.strongAgainst ?? old.relations?.strongAgainst ?? [],
        weakAgainst: hero.relations?.weakAgainst ?? old.relations?.weakAgainst ?? [],
        descriptions: { synergies: '', strongAgainst: '', weakAgainst: '' }
      },
      officialUrl: old.officialUrl || hero.officialUrl,
      firstSeenAt: old.firstSeenAt || hero.firstSeenAt,
      lastSeenAt: now,
      missingSyncs: 0,
      availability: 'available',
      detailsUpdatedAt: old.detailsUpdatedAt || null
    };
  });

  previous.forEach(hero => {
    if (incomingById.has(Number(hero.id))) return;
    const missingSyncs = Math.max(0, Number(hero.missingSyncs) || 0) + 1;
    merged.push({
      ...hero,
      missingSyncs,
      availability: missingSyncs >= 3 ? 'unavailable' : 'checking'
    });
  });
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}
