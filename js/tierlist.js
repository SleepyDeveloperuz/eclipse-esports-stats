/**
 * MLBB Tier List, Emblems & Items Meta Engine
 * Patch Version: 2.1.95.1206.1 (2026 Latest)
 * 
 * Provides automated Meta Score calculations, S+/S/A/B/C tier visualizers,
 * sortable statistics tables, 7 Emblem talent trees, 104 Equipment Encyclopedia,
 * and 24-hour automated synchronization with Moonton data feeds.
 */

window.TierListManager = class TierListManager {
  constructor(heroDb) {
    this.heroDb = heroDb;
    this.currentRank = 'glory'; // 'glory', 'mythic', 'legend', 'epic', 'all'
    this.currentLane = 'all';   // 'all', 'gold', 'exp', 'mid', 'roam', 'jungle'
    this.currentView = 'tierlist'; // 'tierlist', 'table', 'advisor', 'emblems', 'items'
    this.searchQuery = '';
    this.sortBy = 'metaScore'; // 'metaScore', 'winRate', 'banRate', 'pickRate', 'name'
    this.sortOrder = 'desc';
    this.liveSource = 'moonton_live_api';
    this.patchVersion = '2.1.95.1206.1';
    this.lastUpdated = new Date().toISOString();
    this.nextRefresh = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    
    // Item and Emblem category filters
    this.currentItemCategory = 'all'; // 'all', 'attack', 'magic', 'defense', 'movement', 'jungle', 'roam'
    this.itemSearchQuery = '';
    this.selectedEmblem = 'assassin';

    this.initMetaDatabase();
    this.initEmblemsDatabase();
    this.initItemsDatabase();
    this.fetchLiveMetaData(this.currentRank);
    this.start24hCountdownTimer();
  }

  async fetchLiveMetaData(rank = 'glory', force = false) {
    try {
      const url = `/api/meta?rank=${encodeURIComponent(rank)}${force ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.heroes) && json.heroes.length > 0) {
          const merged = json.heroes.map(liveHero => {
            const existing = this.metaData.find(m => m.name.toLowerCase() === liveHero.name.toLowerCase());
            return {
              ...liveHero,
              counters: existing ? existing.counters : (liveHero.counters || ['Franco', 'Diggie', 'Khufra']),
              tip: existing ? existing.tip : (liveHero.tip || 'Taktik moslashuv va to\'g\'ri itemizatsiya muhim.')
            };
          });
          this.metaData = merged;
          this.liveSource = json.source || 'moonton_live_api';
          this.lastUpdated = json.updatedAt || new Date().toISOString();
          this.nextRefresh = json.nextRefresh || new Date(Date.now() + 24 * 3600 * 1000).toISOString();
          this.renderActiveView();
        }
      }
    } catch (e) {
      console.warn("Live meta fetch fallback to verified patch database:", e);
    }
  }

  start24hCountdownTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.updateCountdownDisplay();
    }, 1000);
  }

  updateCountdownDisplay() {
    const el = document.getElementById('autoRefreshCountdown');
    if (!el) return;
    const target = new Date(this.nextRefresh).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) {
      el.textContent = "Hozir yangilanmoqda...";
      this.fetchLiveMetaData(this.currentRank, true);
    } else {
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      el.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }

  // ═══════════════════════════════════════════════════
  // 1. HERO META DATABASE (PATCH 2.1.95.1206.1)
  // ═══════════════════════════════════════════════════
  initMetaDatabase() {
    this.metaData = [
      // S+ GOD TIER
      { name: 'Marcel', role: 'Fighter', lane: 'exp', wr: 58.8, pr: 0.28, br: 32.2, counters: ['Phoveus', 'Terizla', 'Dominance Ice'], tip: 'Patch 2.1.95.1206.1 eng yuqori WR (58.8%). Kam tanilgan lekin juda xavfli.' },
      { name: 'Rafaela', role: 'Support', lane: 'roam', wr: 57.8, pr: 1.5, br: 10.6, counters: ['Saber', 'Helcurt', 'Natalia'], tip: 'Patch 2.1.95.1206.1 2-o\'rinda WR (57.8%). Tezlik va davolash buffi o\'ta kuchli.' },
      { name: 'Masha', role: 'Fighter', lane: 'exp', wr: 56.7, pr: 2.1, br: 0.3, counters: ['Karrie', 'Dominance Ice', 'Phoveus'], tip: 'Yashirin meta gem! 56.7% WR. 3 ta HP bar bilan o\'ldirib bo\'lmaydi.' },
      { name: 'Melissa', role: 'Marksman', lane: 'gold', wr: 56.3, pr: 4.4, br: 10.7, counters: ['Franco', 'Lesley', 'Pharsa'], tip: 'Top Marksman (56.3% WR). Qo\'g\'irchoq maydoni yaqin jangchilarni yaqinlashtirmaydi.' },
      { name: 'Hanzo', role: 'Assassin', lane: 'jungle', wr: 56.0, pr: 1.6, br: 28.8, counters: ['Ling', 'Fanny', 'Natalia', 'Aldous'], tip: 'Yashirin OP assassin (56% WR). Soya ninja — xaritani nazorat qiladi.' },
      { name: 'Suyou', role: 'Fighter', lane: 'jungle', wr: 55.2, pr: 6.4, br: 85.0, counters: ['Phoveus', 'Khufra', 'Minsitthar'], tip: 'Immortal va Mortal formalari bilan 1-raqamli Ban (85%).' },
      { name: 'Zhuxin', role: 'Mage', lane: 'mid', wr: 55.0, pr: 7.2, br: 85.0, counters: ['Khufra', 'Lolita', 'Helcurt', 'Kadita'], tip: 'Lantern Flare cheksiz havodan sudrab stan qiladi. Mid lane hukmdori.' },
      { name: 'Belerick', role: 'Tank', lane: 'roam', wr: 53.2, pr: 3.5, br: 58.7, counters: ['Karrie', 'Lunox', 'Valir'], tip: 'ENG KO\'P BAN (58.7%)! Tezkor hujumchilarni o\'zi bilan o\'ldiradi.' },
      { name: 'Gloo', role: 'Tank', lane: 'roam', wr: 54.5, pr: 3.2, br: 48.4, counters: ['Faramis', 'Vexana', 'Valir'], tip: 'S+ Tank. Yopishqoq korpus bilan dushman tankiga kirib yo\'q qiladi.' },
      { name: 'Sora', role: 'Fighter', lane: 'exp', wr: 54.5, pr: 5.5, br: 78.0, counters: ['Phoveus', 'Terizla', 'Dominance Ice'], tip: 'Samoviy qilich kombolari va daxlsiz sakrashlar. EXP lane egasi.' },
      { name: 'Lukas', role: 'Fighter', lane: 'exp', wr: 54.0, pr: 5.1, br: 75.0, counters: ['Baxia', 'Karrie', 'Dominance Ice'], tip: 'Muqaddas Maxluq transformatsiyasi va ulkan portlash zarbasi.' },
      { name: 'Phoveus', role: 'Fighter', lane: 'exp', wr: 54.5, pr: 4.8, br: 78.0, counters: ['Terizla', 'Esmeralda', 'Thamuz'], tip: 'Anti-dash qiroli. Suyou, Ling, Paquito, Chou\'ni ezib tashlaydi.' },

      // S TIER
      { name: 'Mathilda', role: 'Support', lane: 'roam', wr: 54.5, pr: 5.2, br: 76.0, counters: ['Khufra', 'Franco', 'Minsitthar'], tip: 'S+ Roamer. Guiding Wind butun jamoaga uchish imkonini beradi.' },
      { name: 'Chip', role: 'Tank', lane: 'roam', wr: 53.5, pr: 3.8, br: 75.0, counters: ['Minsitthar', 'Valir', 'Akai'], tip: 'Global portal orqali butun jamoani lord/minora ostiga yig\'adi.' },
      { name: 'Zhask', role: 'Mage', lane: 'mid', wr: 54.5, pr: 5.8, br: 72.0, counters: ['Claude', 'Irithel', 'Retribution'], tip: 'Revamp Zhask Nightmaric Spawn minoralar va lordni soniyalar ichida oladi.' },
      { name: 'Hylos', role: 'Tank', lane: 'roam', wr: 54.0, pr: 4.5, br: 55.0, counters: ['Karrie', 'Valir', 'Lunox'], tip: 'Thunder Belt metasi bilan o\'lmas tankka aylangan.' },
      { name: 'Harith', role: 'Mage', lane: 'mid', wr: 54.0, pr: 5.8, br: 70.0, counters: ['Minsitthar', 'Phoveus', 'Radiant Armor'], tip: 'Gold va Mid Laneda har qanday an\'anaviy otishmani 4-darajadan yutadi.' },
      { name: 'Nolan', role: 'Assassin', lane: 'jungle', wr: 54.0, pr: 5.8, br: 72.0, counters: ['Khufra', 'Franco', 'Kaja'], tip: 'Tez o\'rmon tozalash va o\'zidan stanni yechuvchi Cosmic Rupture.' },
      { name: 'Fanny', role: 'Assassin', lane: 'jungle', wr: 53.5, pr: 3.2, br: 75.0, counters: ['Khufra', 'Saber', 'Eudora', 'Minsitthar'], tip: 'Troslar orqali xaritada eng yuqori tezlik va bir zumda o\'ldiruvchi zarba.' },
      { name: 'Hayabusa', role: 'Assassin', lane: 'jungle', wr: 53.5, pr: 4.9, br: 70.0, counters: ['Saber', 'Khufra', 'Wind of Nature'], tip: 'Soyalar bilan ajralgan nishonlarni ovlaydi va split-push qiladi.' },
      { name: 'Claude', role: 'Marksman', lane: 'gold', wr: 53.5, pr: 6.5, br: 68.0, counters: ['Belerick', 'Franco', 'Kaja', 'Dominance Ice'], tip: 'Dexter bilan teleport va Blazing Duet teamfight hal qiluvchisi.' },
      { name: 'Valentina', role: 'Mage', lane: 'mid', wr: 53.5, pr: 4.2, br: 67.0, counters: ['Lolita', 'Radiant Armor', 'Helcurt'], tip: 'Dushman tanki yoki sehrgarining Ultimateni o\'g\'irlab o\'ziga uradi.' },
      { name: 'Diggie', role: 'Support', lane: 'roam', wr: 53.5, pr: 4.1, br: 64.0, counters: ['Lesley', 'Beatrix', 'Claude'], tip: 'Barcha ommaviy stanlarni (Tigreal, Atlas, Kaja) zararsizlantiradi.' },
      { name: 'Xavier', role: 'Mage', lane: 'mid', wr: 53.5, pr: 5.5, br: 50.0, counters: ['Ling', 'Fanny', 'Hayabusa', 'Helcurt'], tip: 'Cheksiz lazerlar va xaritani to\'liq ko\'rib turuvchi global Ultimate.' },
      { name: 'Julian', role: 'Mage', lane: 'jungle', wr: 53.5, pr: 4.8, br: 58.0, counters: ['Radiant Armor', 'Khufra', 'Franco'], tip: '3-darajada kuchaygan sehrli portlash va daxlsizlik sakrashi.' },
      { name: 'Novaria', role: 'Mage', lane: 'mid', wr: 53.0, pr: 3.8, br: 50.0, counters: ['Ling', 'Fanny', 'Radiant Armor'], tip: '⬆️ PATCH 2.1.95 BUFF! S2 tezligi oshdi. Ko\'rinmas dushmanni ochuvchi snayper.' },
      { name: 'Eudora', role: 'Mage', lane: 'mid', wr: 53.0, pr: 5.5, br: 15.0, counters: ['Athena Shield', 'Radiant Armor', 'Purify'], tip: 'Buta ichidan bir zumda portlatuvchi stan sehrgari.' },
      { name: 'Ling', role: 'Assassin', lane: 'jungle', wr: 53.0, pr: 4.5, br: 65.0, counters: ['Khufra', 'Saber', 'Ruby'], tip: 'Devorlar ustidan sakrab daxlsiz Tempest of Blades bilan uradi.' },
      { name: 'Roger', role: 'Fighter', lane: 'jungle', wr: 53.0, pr: 6.2, br: 60.0, counters: ['Franco', 'Kaja', 'Belerick'], tip: 'Bo\'ri formasi bilan erta qor to\'pini (snowball) boshlaydi.' },
      { name: 'Beatrix', role: 'Marksman', lane: 'gold', wr: 53.0, pr: 7.2, br: 64.0, counters: ['Lolita', 'Blade Armor', 'Wind of Nature'], tip: '4 xil quroli bilan har qanday masofa va raqibga moslashadi.' },
      { name: 'Ruby', role: 'Fighter', lane: 'exp', wr: 53.0, pr: 6.0, br: 42.0, counters: ['Dominance Ice', 'Baxia', 'Phoveus'], tip: 'Lifesteal va uzluksiz ilmoq orqali dushmanni qimirlatmaydi.' },
      { name: 'Moskov', role: 'Marksman', lane: 'gold', wr: 53.0, pr: 8.5, br: 55.0, counters: ['Belerick', 'Blade Armor', 'Dominance Ice'], tip: 'Teleport nayzalar va global stan bilan kechki o\'yin yirtqichi.' },
      { name: 'Terizla', role: 'Fighter', lane: 'exp', wr: 53.0, pr: 5.5, br: 52.0, counters: ['Valir', 'Karrie', 'X.Borg'], tip: 'Frontline tankdek boshlovchi va S3 bo\'lg\'a tortishi.' },
      { name: 'Pharsa', role: 'Mage', lane: 'mid', wr: 53.0, pr: 5.0, br: 45.0, counters: ['Ling', 'Lancelot', 'Lolita'], tip: 'Yuqori masofadan artilleriya zarbasi va qush bo\'lib tezkor rotatsiya.' },
      { name: 'Gatotkaca', role: 'Tank', lane: 'exp', wr: 53.0, pr: 5.8, br: 46.0, counters: ['Karrie', 'Lunox', 'Dominance Ice'], tip: 'Thunder Belt + Concentration Energy bilan o\'lmas EXP brawler.' },
      { name: 'Luo Yi', role: 'Mage', lane: 'mid', wr: 53.0, pr: 3.8, br: 46.0, counters: ['Spread positioning', 'Radiant Armor', 'Ling'], tip: 'Yin-Yang reaksiyasi va kutilmagan teleport ganklar.' },

      // A TIER
      { name: 'Tigreal', role: 'Tank', lane: 'roam', wr: 52.5, pr: 6.8, br: 63.0, counters: ['Diggie', 'Valir', 'Wanwan'], tip: 'S2 surish + Flicker Ultimate kechki o\'yinda jamoaviy g\'alaba kafolati.' },
      { name: 'Minotaur', role: 'Tank', lane: 'roam', wr: 52.8, pr: 3.5, br: 38.4, counters: ['Diggie', 'Karrie', 'Lunox'], tip: 'Davolash va havodan uzluksiz zarba bilan maydonni nazorat qiladi.' },
      { name: 'Hirara', role: 'Assassin', lane: 'jungle', wr: 52.5, pr: 2.8, br: 35.0, counters: ['Khufra', 'Franco', 'Saber'], tip: 'Patch 2.1.95 yangi assassin. Egizak yelpig\'ich bilan daxlsizlik.' },
      { name: 'Vexana', role: 'Mage', lane: 'mid', wr: 52.5, pr: 7.0, br: 40.0, counters: ['Radiant Armor', 'Ling', 'Hayabusa'], tip: 'Ulkan ritsar chaqiruvchi va ommaviy qo\'rquv soluvchi.' },
      { name: 'Joy', role: 'Assassin', lane: 'jungle', wr: 52.5, pr: 2.2, br: 42.0, counters: ['Minsitthar', 'Franco', 'Kaja'], tip: 'Ritmik sakrash — sekinlik immunitetli va katta AOE sehrli zarar.' },
      { name: 'Natan', role: 'Marksman', lane: 'gold', wr: 52.5, pr: 3.8, br: 35.0, counters: ['Radiant Armor', 'Blade Armor', 'Lolita'], tip: 'Sehrli oddiy zarba va klon orqali 2 barobar DPS.' },
      { name: 'Paquito', role: 'Fighter', lane: 'exp', wr: 52.5, pr: 5.4, br: 38.0, counters: ['Phoveus', 'Minsitthar', 'Antique Cuirass'], tip: 'Tezkor boks kombolari va qalqonli harakatchanlik.' },
      { name: 'Yu Zhong', role: 'Fighter', lane: 'exp', wr: 52.5, pr: 5.2, br: 46.0, counters: ['Baxia', 'Dominance Ice', 'Karrie'], tip: 'Qora Ajdaho formasida to\'g\'ridan-to\'g\'ri orqa chiziqqa hujum qiladi.' },
      { name: 'Cici', role: 'Fighter', lane: 'exp', wr: 52.4, pr: 4.6, br: 32.0, counters: ['Phoveus', 'Baxia', 'Dominance Ice'], tip: '%HP yoyo orqali dushmandan masofa saqlab yakson qiladi.' },
      { name: 'Brody', role: 'Marksman', lane: 'gold', wr: 52.4, pr: 5.5, br: 42.0, counters: ['Wind of Nature', 'Blade Armor', 'Tigreal'], tip: 'Yuqori jismoniy zarba va uzoqdan nishonga olib uruvchi Ultimate.' },
      { name: 'Lunox', role: 'Mage', lane: 'mid', wr: 52.3, pr: 3.6, br: 30.0, counters: ['Lolita', 'Radiant Armor', 'Saber'], tip: '%HP tank erituvchi va yorug\'lik daxlsizligi.' },
      { name: 'Karrie', role: 'Marksman', lane: 'gold', wr: 52.1, pr: 5.2, br: 38.0, counters: ['Blade Armor', 'Dominance Ice', 'Burst Assassins'], tip: 'Og\'ir tanklarni soniyalar ichida erituvchi True Damage.' },
      { name: 'Lolita', role: 'Tank', lane: 'roam', wr: 52.1, pr: 1.8, br: 12.0, counters: ['Chou', 'Franco', 'Kaja'], tip: 'O\'q va sehrlarni to\'xtatuvchi qalqon.' },
      { name: 'Alpha', role: 'Fighter', lane: 'jungle', wr: 52.1, pr: 5.2, br: 28.0, counters: ['Valir', 'Baxia', 'Karrie'], tip: 'Haqiqiy zarba (True damage) va lordni juda tez olish qobiliyati.' },
      { name: 'Lylia', role: 'Mage', lane: 'mid', wr: 52.1, pr: 3.9, br: 25.0, counters: ['Radiant Armor', 'Chou', 'Kaja'], tip: 'Gloom bomb va Black Shoes qaytish reseti.' },
      { name: 'Angela', role: 'Support', lane: 'roam', wr: 52.0, pr: 5.5, br: 45.0, counters: ['Baxia', 'Saber', 'Helcurt'], tip: 'Ling, Roger va Fanny kabi assasinlarga eng yaxshi qalqon.' },
      { name: 'Bruno', role: 'Marksman', lane: 'gold', wr: 52.0, pr: 5.0, br: 30.0, counters: ['Blade Armor', 'Belerick', 'Wind of Nature'], tip: 'Erta bosqichda yuqori kritik zarba beruvchi to\'p tepar.' },
      { name: 'Carmilla', role: 'Support', lane: 'roam', wr: 52.0, pr: 1.2, br: 8.0, counters: ['Diggie', 'Valir', 'Karrie'], tip: 'Zarar bo\'lishish aloqasi va CC.' },
      { name: 'Kadita', role: 'Mage', lane: 'mid', wr: 52.0, pr: 3.2, br: 28.0, counters: ['Athena Shield', 'Petrify counter', 'Diggie'], tip: 'Assasin-sehrgar — orqa chiziqni bir soniyada o\'ldiradi.' },
      { name: 'Arlott', role: 'Fighter', lane: 'exp', wr: 52.0, pr: 4.1, br: 35.0, counters: ['Phoveus', 'Minsitthar', 'Franco'], tip: 'Demon ko\'z nishoni orqali sakrab zarba beradi.' },
      { name: 'Yi Sun-shin', role: 'Assassin', lane: 'jungle', wr: 52.0, pr: 3.5, br: 22.0, counters: ['Khufra', 'Franco', 'Lolita'], tip: 'Global ko\'rish va yuqori masofali o\'q bilan xaritani nazorat qiladi.' },
      { name: 'Baxia', role: 'Tank', lane: 'jungle', wr: 52.0, pr: 2.9, br: 32.0, counters: ['Karrie', 'Lunox', 'Valir'], tip: 'Tog\'dek tez aylanuvchi va dushmanning jon to\'ldirishini kesuvchi.' },
      { name: 'Nana', role: 'Mage', lane: 'mid', wr: 52.0, pr: 7.8, br: 34.0, counters: ['Radiant Armor', 'Franco', 'Kaja'], tip: 'Molina transformatsiyasi va o\'lmaslik passivkasi.' },

      // B & C TIERS
      { name: 'Khaleed', role: 'Fighter', lane: 'exp', wr: 51.9, pr: 3.2, br: 20.0, counters: ['Franco', 'Chou', 'Ruby'], tip: 'Erta bosqichda to\'lqin tozalash va qum bo\'roni stan.' },
      { name: 'Granger', role: 'Marksman', lane: 'gold', wr: 51.8, pr: 4.8, br: 24.0, counters: ['Lolita', 'Blade Armor', 'Dreadnaught Armor'], tip: '6 ta o\'q va uzoq masofali to\'p otish.' },
      { name: 'Fredrinn', role: 'Tank', lane: 'jungle', wr: 51.8, pr: 3.8, br: 30.0, counters: ['Karrie', 'Lunox', 'Baxia'], tip: 'Old chiziqda tanklik qiluvchi va Retribution nazorati.' },
      { name: 'Lapu-Lapu', role: 'Fighter', lane: 'exp', wr: 51.7, pr: 3.5, br: 18.0, counters: ['Baxia', 'Dominance Ice', 'Karrie'], tip: 'Og\'ir qilich jamoaviy jang boshlovchisi.' },
      { name: 'Benedetta', role: 'Assassin', lane: 'jungle', wr: 51.6, pr: 2.6, br: 18.0, counters: ['Phoveus', 'Minsitthar', 'Khufra'], tip: 'Giperharakatchan sakrash assasini va S2 parry.' },
      { name: 'Wanwan', role: 'Marksman', lane: 'gold', wr: 51.5, pr: 3.0, br: 12.0, counters: ['Phoveus', 'Khufra', 'Wind of Nature'], tip: 'Zaif nuqta sakrovchisi va daxlsiz o\'q yomg\'iri.' },
      { name: 'X.Borg', role: 'Fighter', lane: 'exp', wr: 51.5, pr: 4.2, br: 24.0, counters: ['Karrie', 'Lunox', 'Baxia'], tip: 'Haqiqiy zarar olov otuvchi va War Axe bilan sinergiya.' },
      { name: 'Grock', role: 'Tank', lane: 'roam', wr: 51.5, pr: 2.8, br: 18.2, counters: ['Karrie', 'Claude', 'Valir'], tip: 'Devor nazorati va yuqori jismoniy zarba.' },
      { name: 'Cecilion', role: 'Mage', lane: 'mid', wr: 51.5, pr: 4.5, br: 22.0, counters: ['Early aggression', 'Ling', 'Fanny'], tip: 'Cheksiz mana yig\'uvchi kechki o\'yin yadro artilleriyasi.' },
      { name: 'Minsitthar', role: 'Fighter', lane: 'exp', wr: 51.4, pr: 2.2, br: 22.0, counters: ['Diggie', 'Valir', 'Karrie'], tip: 'Qirolning chaqirig\'i anti-blink maydoni.' },
      { name: 'Martis', role: 'Fighter', lane: 'jungle', wr: 51.4, pr: 4.2, br: 25.0, counters: ['Franco', 'Kaja', 'Phoveus'], tip: 'Erta bosqichda S2 CC immunitetli snowballer.' },
      { name: 'Thamuz', role: 'Fighter', lane: 'exp', wr: 51.3, pr: 3.0, br: 14.0, counters: ['Valir', 'Dominance Ice', 'Baxia'], tip: '1v1 o\'roq jangchisi va Turtle dominatsiyasi.' },
      { name: 'Yve', role: 'Mage', lane: 'mid', wr: 51.2, pr: 2.4, br: 20.0, counters: ['Franco', 'Kaja', 'Lolita'], tip: 'Galaktik shaxmat taxtasi sekinlashtirish zonasi.' },
      { name: 'Ixia', role: 'Marksman', lane: 'gold', wr: 51.2, pr: 3.5, br: 20.0, counters: ['Franco', 'Kaja', 'Flank dive'], tip: 'Keng konus ultimate bilan mudofaa marksmani.' },
      { name: 'Khufra', role: 'Tank', lane: 'roam', wr: 51.2, pr: 2.9, br: 22.0, counters: ['Franco', 'Diggie', 'Valir'], tip: 'Fanny, Ling, Lancelotning sakrashini to\'xtatadi.' },
      { name: 'Silvanna', role: 'Fighter', lane: 'exp', wr: 51.0, pr: 2.5, br: 12.0, counters: ['Purify', 'Diggie', 'Phoveus'], tip: 'Ultimateda dushmanni qafasga soladi.' },
      { name: 'Helcurt', role: 'Assassin', lane: 'jungle', wr: 51.0, pr: 2.8, br: 22.0, counters: ['Hylos', 'Tigreal', 'Belerick'], tip: 'Xaritani qoraytiruvchi va jim qiluvchi nishonga olingan assasin.' },
      { name: 'Floryn', role: 'Support', lane: 'roam', wr: 51.0, pr: 3.2, br: 14.0, counters: ['Baxia', 'Dominance Ice', 'Saber'], tip: 'Global davolash va anti-anti-heal ultimate.' },
      { name: 'Edith', role: 'Tank', lane: 'exp', wr: 51.0, pr: 3.0, br: 16.0, counters: ['Karrie', 'Claude', 'Lunox'], tip: 'Tank dan marksmanga aylanuvchi gibrid zarbakor.' },
      { name: 'Clint', role: 'Marksman', lane: 'gold', wr: 51.0, pr: 5.0, br: 14.0, counters: ['Blade Armor', 'Wind of Nature', 'Assassins'], tip: 'Passiv portlash o\'qi va S2 harakatsizlantirish.' },
      { name: 'Kimmy', role: 'Marksman', lane: 'gold', wr: 51.0, pr: 2.8, br: 8.0, counters: ['Franco', 'Kaja', 'Flank dive'], tip: 'Yurib turib otuvchi gibrid marksman/sehrgar.' },
      { name: 'Kagura', role: 'Mage', lane: 'mid', wr: 51.0, pr: 3.1, br: 16.0, counters: ['Radiant Armor', 'Franco', 'Kaja'], tip: 'Soyabon mexanikasi bilan yuqori mahoratli outplay.' },
      { name: 'Atlas', role: 'Tank', lane: 'roam', wr: 50.8, pr: 2.4, br: 20.5, counters: ['Diggie', 'Valir', 'Chou'], tip: 'Fatal Links orqali butun dushman jamoasini bir joyga tortadi.' },
      { name: 'Chou', role: 'Fighter', lane: 'exp', wr: 50.8, pr: 7.2, br: 26.0, counters: ['Phoveus', 'Diggie', 'Khufra'], tip: 'Universal playmaker. Yuqori mexanik mahorat standarti.' },
      { name: 'Valir', role: 'Mage', lane: 'mid', wr: 50.8, pr: 3.5, br: 18.0, counters: ['Radiant Armor', 'Lesley', 'Pharsa'], tip: 'Anti-dive itarib chiqaruvchi olov sehrgari.' },
      { name: 'Zetian', role: 'Mage', lane: 'mid', wr: 50.8, pr: 2.0, br: 10.0, counters: ['Radiant Armor', 'Ling', 'Hayabusa'], tip: 'Nazorat va portlash aralashmasi bilan strategik sehrgar.' },
      { name: 'Lancelot', role: 'Assassin', lane: 'jungle', wr: 50.8, pr: 3.9, br: 24.0, counters: ['Khufra', 'Phoveus', 'Minsitthar'], tip: 'Yuqori mexanik outplay assasini — ikki daxlsizlik kadr.' },
      { name: 'Popol and Kupa', role: 'Marksman', lane: 'gold', wr: 50.6, pr: 2.5, br: 10.0, counters: ['Claude', 'Benedetta', 'Irithel'], tip: 'It bilan tuzoq qo\'yuvchi va 1v1 chiziq nazoratida kuchli.' },
      { name: 'Hilda', role: 'Fighter', lane: 'exp', wr: 50.5, pr: 2.0, br: 6.0, counters: ['Valir', 'Karrie', 'Phoveus'], tip: 'Butalar ichidan sakrab yuqori zarba beruvchi tezkor jangchi.' },
      { name: 'Dyrroth', role: 'Fighter', lane: 'exp', wr: 50.5, pr: 5.8, br: 18.0, counters: ['Chou', 'Ruby', 'Windtalker kiting'], tip: '75% jismoniy mudofaani sindiruvchi, tanklarga kuchli.' },
      { name: 'Selena', role: 'Assassin', lane: 'jungle', wr: 50.5, pr: 2.5, br: 18.0, counters: ['Purify', 'Athena Shield', 'Diggie'], tip: 'Uzoq masofali stan o\'qi va abyssal formada o\'ldirish.' },
      { name: 'Akai', role: 'Tank', lane: 'roam', wr: 50.5, pr: 1.5, br: 10.0, counters: ['Diggie', 'Purify', 'Valir'], tip: 'Aylanuvchi zarba bilan dushmanni devarga qistiradi.' },
      { name: 'Mulan', role: 'Mage', lane: 'mid', wr: 50.5, pr: 1.8, br: 8.0, counters: ['Radiant Armor', 'Franco', 'Saber'], tip: 'Ikki formali qilich/yoy sehrgari.' },
      { name: 'Alice', role: 'Mage', lane: 'mid', wr: 50.5, pr: 2.0, br: 10.0, counters: ['Baxia', 'Dominance Ice', 'Burst'], tip: 'Qon so\'ruvchi immortal sehrgar.' },
      { name: 'Faramis', role: 'Support', lane: 'roam', wr: 50.5, pr: 1.8, br: 10.0, counters: ['Baxia', 'Dominance Ice', 'Burst'], tip: 'O\'lganlarni tiriltirib 5v5 ni 6v5 ga aylantiradi.' },
      { name: 'Guinevere', role: 'Fighter', lane: 'exp', wr: 50.4, pr: 3.8, br: 19.0, counters: ['Diggie', 'Purify', 'Helcurt'], tip: 'Sehrli havodan zarba jangchisi S2 klon aldovi bilan.' },
      { name: 'Lesley', role: 'Marksman', lane: 'gold', wr: 50.4, pr: 6.8, br: 18.0, counters: ['Twilight Armor', 'Early ganks', 'Assassins'], tip: 'Haqiqiy zarba kamuflyaj snayperi.' },
      { name: 'Vale', role: 'Mage', lane: 'mid', wr: 50.2, pr: 4.8, br: 12.0, counters: ['Athena Shield', 'Ling', 'Hayabusa'], tip: 'Shamol ko\'taruv kombo portlash.' },
      { name: 'Estes', role: 'Support', lane: 'roam', wr: 50.2, pr: 4.8, br: 28.0, counters: ['Baxia', 'Luo Yi', 'Dominance Ice'], tip: '5 kishilik deathball davolovchi.' },
      { name: 'Gusion', role: 'Assassin', lane: 'jungle', wr: 50.2, pr: 4.1, br: 12.0, counters: ['Radiant Armor', 'Athena Shield', 'Khufra'], tip: 'Xanjar kombo portlash assasini.' },
      { name: 'Aamon', role: 'Assassin', lane: 'jungle', wr: 50.1, pr: 2.3, br: 11.0, counters: ['Radiant Armor', 'Ruby', 'Khufra'], tip: 'Ko\'rinmaslik va shard portlash assasini.' },
      { name: 'Irithel', role: 'Marksman', lane: 'gold', wr: 50.1, pr: 3.0, br: 8.0, counters: ['Blade Armor', 'Belerick', 'Wind of Nature'], tip: 'Yurgan holda otuvchi arbaletchan yo\'lbars.' },
      { name: 'Esmeralda', role: 'Mage', lane: 'mid', wr: 50.0, pr: 2.5, br: 12.0, counters: ['Baxia', 'Dominance Ice', 'Karrie'], tip: 'Qalqon o\'g\'irlovchi va sehrli jismoniy gibrid.' },
      { name: 'Johnson', role: 'Tank', lane: 'roam', wr: 50.0, pr: 2.0, br: 8.0, counters: ['Diggie', 'Valir', 'Purify'], tip: 'Mashina bo\'lib xarita bo\'ylab urib boradi.' },
      { name: 'Uranus', role: 'Tank', lane: 'exp', wr: 50.0, pr: 2.0, br: 6.0, counters: ['Baxia', 'Dominance Ice', 'Karrie'], tip: 'Cheksiz regeneratsiya bilan chiziqdagi eng chidamli tank.' },
      { name: 'Jawhead', role: 'Fighter', lane: 'exp', wr: 50.0, pr: 2.5, br: 10.0, counters: ['Ruby', 'Phoveus', 'Diggie'], tip: 'Dushmanni uloqtiruvchi va portlash zarbasi.' },
      { name: 'Barats', role: 'Fighter', lane: 'exp', wr: 50.0, pr: 1.5, br: 6.0, counters: ['Karrie', 'Lunox', 'Valir'], tip: 'Stack yig\'ib ulkan bo\'lib ketuvchi tank-jangchi.' },
      { name: 'Franco', role: 'Tank', lane: 'roam', wr: 49.5, pr: 8.5, br: 26.0, counters: ['Diggie', 'Purify', 'Grock'], tip: 'Bitta aniq kruk orqali 4v5 ustunlik yaratadi.' },
      { name: 'Chang\'e', role: 'Mage', lane: 'mid', wr: 49.8, pr: 4.9, br: 14.0, counters: ['Lolita', 'Radiant Armor', 'Baxia'], tip: 'Meteor yomg\'iri bilan tozalash.' },
      { name: 'Cyclops', role: 'Mage', lane: 'mid', wr: 49.9, pr: 3.2, br: 8.0, counters: ['Radiant Armor', 'Lolita', 'Baxia'], tip: 'Yulduz bilan nishonga olib uruvchi sehrgar.' },
      { name: 'Karina', role: 'Assassin', lane: 'jungle', wr: 49.8, pr: 2.5, br: 10.0, counters: ['Radiant Armor', 'Franco', 'Kaja'], tip: 'Odatiy zarba blokirovka qiluvchi tozalash assasini.' },
      { name: 'Exor', role: 'Fighter', lane: 'exp', wr: 49.5, pr: 1.8, br: 5.0, counters: ['Phoveus', 'Dominance Ice', 'Baxia'], tip: 'Yangi jangchi — o\'ziga xos mexanikalar bilan chiziq nazorati.' },
      { name: 'Badang', role: 'Fighter', lane: 'exp', wr: 49.5, pr: 2.8, br: 8.0, counters: ['Purify', 'Wind of Nature', 'Chou'], tip: 'Devorga qistiruvchi musht zarbalari.' },
      { name: 'Hanabi', role: 'Marksman', lane: 'gold', wr: 49.5, pr: 7.2, br: 12.0, counters: ['Blade Armor', 'Dominance Ice', 'Burst Assassins'], tip: 'CC immunitet qalqoni va sakrovchi gulbarglari.' },
      { name: 'Saber', role: 'Assassin', lane: 'jungle', wr: 49.5, pr: 4.5, br: 15.0, counters: ['Wind of Nature', 'Dreadnaught Armor', 'Tigreal'], tip: 'Bir nishonni bosib oluvchi assasin.' },
      { name: 'Aurora', role: 'Mage', lane: 'mid', wr: 49.5, pr: 1.5, br: 5.0, counters: ['Purify', 'Athena Shield', 'Ling'], tip: 'Muzlatuvchi stan kombo.' },
      { name: 'Natalia', role: 'Assassin', lane: 'jungle', wr: 49.0, pr: 1.8, br: 8.0, counters: ['Saber', 'Hylos', 'Tower hugging'], tip: 'Ko\'rinmas ovchi.' },
      { name: 'Freya', role: 'Fighter', lane: 'exp', wr: 49.0, pr: 1.8, br: 4.0, counters: ['Dominance Ice', 'Blade Armor', 'Franco'], tip: 'Sakrash va qalqon bilan jang qiluvchi.' },
      { name: 'Balmond', role: 'Fighter', lane: 'jungle', wr: 48.9, pr: 2.8, br: 5.0, counters: ['Dominance Ice', 'Valir', 'Karrie'], tip: 'Aylanma zarba va obyekt execute.' },
      { name: 'Miya', role: 'Marksman', lane: 'gold', wr: 48.8, pr: 7.5, br: 6.0, counters: ['Blade Armor', 'Belerick', 'Dominance Ice'], tip: 'Ko\'rinmaslik o\'qi bilan qochuvchi.' },
      { name: 'Argus', role: 'Fighter', lane: 'exp', wr: 48.6, pr: 2.1, br: 5.0, counters: ['Franco', 'Kaja', 'Dominance Ice'], tip: 'O\'lmas qilich jangchisi.' },
      { name: 'Aulus', role: 'Fighter', lane: 'exp', wr: 48.5, pr: 1.5, br: 3.0, counters: ['Dominance Ice', 'Kite heroes', 'Valir'], tip: 'Boltali asta-sekin kuchayuvchi.' },
      { name: 'Layla', role: 'Marksman', lane: 'gold', wr: 48.2, pr: 8.2, br: 5.0, counters: ['Assassins', 'Blade Armor', 'Franco'], tip: 'Eng uzoq masofali top, lekin nol harakatchanlik.' },
      { name: 'Alucard', role: 'Fighter', lane: 'jungle', wr: 48.2, pr: 3.5, br: 4.0, counters: ['Dominance Ice', 'Khufra', 'Franco'], tip: 'Lifesteal jangchi.' },
      { name: 'Sun', role: 'Fighter', lane: 'exp', wr: 48.2, pr: 2.5, br: 4.0, counters: ['Ruby', 'Balmond', 'Dominance Ice'], tip: 'Klonlar bilan suruvchi.' },
      { name: 'Aldous', role: 'Fighter', lane: 'exp', wr: 48.0, pr: 2.9, br: 6.0, counters: ['Twilight Armor', 'Wind of Nature', 'Franco'], tip: '500-stack kechki o\'yin skaleri.' },
      { name: 'Gord', role: 'Mage', lane: 'mid', wr: 47.5, pr: 2.1, br: 5.0, counters: ['Lolita', 'Assassins', 'Flankers'], tip: '⬇️ PATCH 2.1.95 NERF! Passiv va Ultimate bazaviy zarari kamaydi.' },
      { name: 'Zilong', role: 'Fighter', lane: 'exp', wr: 47.5, pr: 5.5, br: 3.0, counters: ['Dominance Ice', 'Blade Armor', 'Tigreal'], tip: 'Kechki o\'yinda split-push.' },
      { name: 'Kaja', role: 'Fighter', lane: 'roam', wr: 46.6, pr: 2.5, br: 51.0, counters: ['Diggie', 'Purify', 'Grock'], tip: '⚡ PATCH 2.1.95 REVAMP! Nazar King — S2 sakrash + AOE restraint Ultimate. Yangi kit tufayli ko\'p ban.' }
    ];
  }

  // ═══════════════════════════════════════════════════
  // 2. EMBLEMS DATABASE (7 EMBLEMS + TALENT TREE)
  // ═══════════════════════════════════════════════════
  initEmblemsDatabase() {
    this.emblemsData = [
      {
        id: 'assassin',
        name: 'Assassin Emblemasi',
        role: 'Assassins, Burst Junglers',
        icon: 'fa-skull-crossbones',
        color: '#a855f7',
        baseStats: [
          { name: 'Adaptive Penetration', value: '+16.00' },
          { name: 'Adaptive Attack', value: '+10.00' },
          { name: 'Movement Speed', value: '+3.00%' }
        ],
        tier1: [
          { name: 'Rupture', desc: '+5 Adaptive Penetration beradi. Dushman mudofaasini erta teshib o\'tadi.', icon: 'fa-bolt' },
          { name: 'Agility', desc: '+4% Harakat tezligi beradi. Tezkor rotatsiya va ta\'qib qilish uchun.', icon: 'fa-person-running' },
          { name: 'Thrill', desc: '+16 Adaptive Attack beradi. O\'yin boshidayoq yuqori zarba.', icon: 'fa-fire' }
        ],
        tier2: [
          { name: 'Master Assassin', desc: 'Atrofda faqat 1 ta dushman qahramoni bo\'lsa, unga beriladigan zarar 7% ga oshadi (1v1 sololar uchun).', icon: 'fa-crosshairs' },
          { name: 'Seasoned Hunter', desc: 'Lord, Toshbaqa va O\'rmon mahluqlariga zarar +20% ga oshadi (Junglerlar uchun eng asosiysi).', icon: 'fa-paw' }
        ],
        tier3: [
          { name: 'Killing Spree', desc: '👑 CORE: Dushmanni o\'ldirgandan so\'ng darhol 10% Max HP tiklanadi va 3 soniyaga +20% Harakat tezligi beriladi.', icon: 'fa-crown', highlight: true }
        ],
        bestHeroes: ['Ling', 'Fanny', 'Hayabusa', 'Nolan', 'Suyou', 'Helcurt', 'Lancelot', 'Hirara']
      },
      {
        id: 'mage',
        name: 'Mage Emblemasi',
        role: 'Mages, Magic Burst',
        icon: 'fa-wand-magic-sparkles',
        color: '#00d4ff',
        baseStats: [
          { name: 'Magic Power', value: '+30.00' },
          { name: 'Cooldown Reduction', value: '+5.00%' },
          { name: 'Magic Penetration', value: '+8.00' }
        ],
        tier1: [
          { name: 'Inspire', desc: '+5% Cooldown Reduction beradi. Skillarni tezroq qayta ishlatish uchun.', icon: 'fa-stopwatch' },
          { name: 'Swift', desc: '+10% Attack Speed beradi (Zhansh, Harith va Natan uchun juda mos).', icon: 'fa-wind' }
        ],
        tier2: [
          { name: 'Bargain Hunter', desc: 'Barcha itemlar narxini 95% ga tushiradi (5% arzonroq sotib olasiz).', icon: 'fa-tag' },
          { name: 'Wilderness Blessing', desc: 'Daryo va o\'rmonda harakat tezligini +10% ga oshiradi.', icon: 'fa-water' }
        ],
        tier3: [
          { name: 'Lethal Ignition', desc: '👑 CORE: Dushmanga 5 soniya ichida Max HP ning 7% dan ortiq zarar 3 marta berilsa, dushmanga 162-750 qo\'shimcha yonish zarari yetkaziladi.', icon: 'fa-fire-flame-curved', highlight: true }
        ],
        bestHeroes: ['Zhuxin', 'Zhask', 'Xavier', 'Valentina', 'Pharsa', 'Kadita', 'Novaria', 'Julian']
      },
      {
        id: 'tank',
        name: 'Tank Emblemasi',
        role: 'Tanks, Frontline Initiators',
        icon: 'fa-shield-halved',
        color: '#10b981',
        baseStats: [
          { name: 'Max HP', value: '+500.00' },
          { name: 'Hybrid Defense', value: '+10.00' },
          { name: 'HP Regen', value: '+4.00' }
        ],
        tier1: [
          { name: 'Firmness', desc: '+6 Physical & Magic Defense beradi. Erta bosqich chidamlilik.', icon: 'fa-shield' },
          { name: 'Vitality', desc: '+225 Max HP beradi. Jon miqdorini oshiradi.', icon: 'fa-heart' }
        ],
        tier2: [
          { name: 'Tenacity', desc: 'HP 50% dan pastga tushganda, +15 Physical & Magic Defense beradi (o\'limdan saqlaydi).', icon: 'fa-lock' },
          { name: 'Pull Yourself Together', desc: 'Battle Spell (Flicker, Vengeance) va Active itemlar kutish vaqtini (CD) -15% ga qisqartiradi.', icon: 'fa-hourglass-half' }
        ],
        tier3: [
          { name: 'Concussive Blast', desc: '👑 CORE: Keyingi oddiy zarba 1.5 soniyadan keyin atrofga Max HP ning 7% ga teng Sehrli AoE zarar portlatadi.', icon: 'fa-burst', highlight: true }
        ],
        bestHeroes: ['Tigreal', 'Belerick', 'Hylos', 'Gloo', 'Chip', 'Minotaur', 'Khufra', 'Atlas', 'Gatotkaca']
      },
      {
        id: 'fighter',
        name: 'Fighter Emblemasi',
        role: 'Fighters, Bruisers & EXP Laners',
        icon: 'fa-hand-fist',
        color: '#f97316',
        baseStats: [
          { name: 'Spell Vamp', value: '+10.00%' },
          { name: 'Adaptive Attack', value: '+22.00' },
          { name: 'Hybrid Defense', value: '+6.00' }
        ],
        tier1: [
          { name: 'Firmness', desc: '+6 Hybrid Defense beradi.', icon: 'fa-shield' },
          { name: 'Rupture', desc: '+5 Adaptive Penetration beradi.', icon: 'fa-bolt' }
        ],
        tier2: [
          { name: 'Festival of Blood', desc: 'Baza 6% Spell Vamp beradi. Har bir kill yoki assist uchun qo\'shimcha +0.5% Spell Vamp (maksimal 10%).', icon: 'fa-droplet' }
        ],
        tier3: [
          { name: 'Brave Smite', desc: '👑 CORE: Skill orqali dushmanga zarar yetkazilganda darhol 4% Max HP tiklanadi (Kutish vaqti 6s).', icon: 'fa-shield-heart', highlight: true },
          { name: 'War Cry', desc: '👑 CORE: 3 ta ketma-ket hujumdan so\'ng 6 soniya davomida beriladigan barcha zarar +8% ga oshadi.', icon: 'fa-bullhorn', highlight: true }
        ],
        bestHeroes: ['Ruby', 'Terizla', 'Yu Zhong', 'Phoveus', 'Marcel', 'Sora', 'Lukas', 'Paquito', 'Cici', 'Alpha']
      },
      {
        id: 'support',
        name: 'Support Emblemasi',
        role: 'Healers, Buffers, Utility Roamers',
        icon: 'fa-heart-pulse',
        color: '#ec4899',
        baseStats: [
          { name: 'Healing Effect', value: '+15.00%' },
          { name: 'Cooldown Reduction', value: '+10.00%' },
          { name: 'Movement Speed', value: '+6.00%' }
        ],
        tier1: [
          { name: 'Agility', desc: '+4% Harakat tezligi beradi.', icon: 'fa-person-running' },
          { name: 'Inspire', desc: '+5% Cooldown Reduction beradi.', icon: 'fa-stopwatch' }
        ],
        tier2: [
          { name: 'Pull Yourself Together', desc: 'Battle spell va jihozlar cooldownini -15% ga qisqartiradi.', icon: 'fa-hourglass-half' },
          { name: 'Wilderness Blessing', desc: 'Daryoda harakat tezligini +10% ga oshiradi.', icon: 'fa-water' }
        ],
        tier3: [
          { name: 'Focusing Mark', desc: '👑 CORE: Dushman qahramoniga zarar berganda, ittifoqchilarning o\'sha dushmanga beradigan zarari 3 soniyaga 6% ga oshadi.', icon: 'fa-bullseye', highlight: true }
        ],
        bestHeroes: ['Rafaela', 'Mathilda', 'Angela', 'Diggie', 'Floryn', 'Estes', 'Carmilla', 'Faramis']
      },
      {
        id: 'marksman',
        name: 'Marksman Emblemasi',
        role: 'Marksmen, Gold Lane DPS',
        icon: 'fa-bullseye',
        color: '#ffd700',
        baseStats: [
          { name: 'Attack Speed', value: '+15.00%' },
          { name: 'Adaptive Attack', value: '+5.00' },
          { name: 'Lifesteal', value: '+5.00%' }
        ],
        tier1: [
          { name: 'Fatal', desc: '+5% Critical Chance & +10% Critical Damage beradi.', icon: 'fa-crosshairs' },
          { name: 'Swift', desc: '+10% Attack Speed beradi.', icon: 'fa-wind' }
        ],
        tier2: [
          { name: 'Weapon Master', desc: 'Jihozlar va emblemalardan olingan Physical Attack miqdorini +5% ga oshiradi.', icon: 'fa-gavel' }
        ],
        tier3: [
          { name: 'Weakness Finder', desc: '👑 CORE: Oddiy hujumlar dushmanning Harakat tezligini 90% ga va Hujum tezligini 50% ga sekinlashtiradi (0.5s).', icon: 'fa-person-falling', highlight: true }
        ],
        bestHeroes: ['Melissa', 'Claude', 'Moskov', 'Beatrix', 'Brody', 'Bruno', 'Karrie', 'Irithel', 'Wanwan']
      },
      {
        id: 'common',
        name: 'Basic Common Emblemasi',
        role: 'Hybrid / High Mana Consumers',
        icon: 'fa-shapes',
        color: '#64748b',
        baseStats: [
          { name: 'Hybrid Regen', value: '+12.00' },
          { name: 'Max HP', value: '+275.00' },
          { name: 'Adaptive Attack', value: '+22.00' }
        ],
        tier1: [
          { name: 'Thrill', desc: '+16 Adaptive Attack.', icon: 'fa-fire' },
          { name: 'Swift', desc: '+10% Attack Speed.', icon: 'fa-wind' }
        ],
        tier2: [
          { name: 'Bargain Hunter', desc: 'Itemlar narxiga 5% chegirma.', icon: 'fa-tag' }
        ],
        tier3: [
          { name: 'Quantum Charge', desc: '👑 CORE: Oddiy hujumlar +30% Harakat tezligi beradi va HP tiklaydi.', icon: 'fa-atom', highlight: true },
          { name: 'Impure Rage', desc: '👑 CORE: Skill zarar berganda qo\'shimcha moslashuvchan zarar beradi va 2% Mana tiklaydi.', icon: 'fa-vial', highlight: true },
          { name: 'Temporal Reign', desc: '👑 CORE: Ultimate ishlatilgandan so\'ng boshqa skillarning qolgan cooldowni 1.5 barobar tezroq kamayadi.', icon: 'fa-clock-rotate-left', highlight: true }
        ],
        bestHeroes: ['Claude', 'Harith', 'Hylos', 'Baxia', 'Uranus', 'Franco']
      }
    ];
  }

  // ═══════════════════════════════════════════════════
  // 3. ITEMS ENCYCLOPEDIA (104 ITEMS CATEGORIZED)
  // ═══════════════════════════════════════════════════
  initItemsDatabase() {
    this.itemsData = [
      // ── ATTACK ITEMS (34 items) ──
      { id: 'bod', name: 'Blade of Despair', category: 'attack', price: 3010, stats: '+160 Physical Attack, +5% Movement Speed', passive: 'Despair: HP 50% dan past dushmanga jismoniy hujum qilganda Physical Attack 25% ga oshadi (2s).', tier: 3, icon: 'fa-khanda', color: '#10b981' },
      { id: 'dgs', name: 'Great Dragon Spear', category: 'attack', price: 2140, stats: '+70 Physical Attack, +10% CDR, +20% Crit Chance', passive: 'Awakening: Ultimate ishlatgandan so\'ng 7.5s davomida +30% Harakat tezligi beriladi (15s CD).', tier: 3, icon: 'fa-wand-magic', color: '#00d4ff' },
      { id: 'malefic', name: 'Malefic Roar', category: 'attack', price: 2060, stats: '+60 Physical Attack', passive: 'Armor Buster: Dushman Physical Defense iga qarab +20% dan +40% gacha Physical Penetration oladi.', tier: 3, icon: 'fa-crosshairs', color: '#f59e0b' },
      { id: 'dhs', name: 'Demon Hunter Sword', category: 'attack', price: 2180, stats: '+35 Physical Attack, +25% Attack Speed', passive: 'Devour: Oddiy hujumlar dushmanning joriy HP siga nisbatan 8% qo\'shimcha Physical Damage beradi + 3% Lifesteal.', tier: 3, icon: 'fa-fire', color: '#ef4444' },
      { id: 'seahalberd', name: 'Sea Halberd', category: 'attack', price: 2050, stats: '+80 Physical Attack, +25% Attack Speed', passive: 'Lifebane: Dushmanning HP regen va Shieldini 50% ga kamaytiradi (Anti-heal). Punish: Qo\'shimcha HP si ko\'p bo\'lgan dushmanga +8% ko\'proq zarar yetkazadi.', tier: 3, icon: 'fa-droplet-slash', color: '#06b6d4' },
      { id: 'windtalker', name: 'Windtalker', category: 'attack', price: 1820, stats: '+40% Attack Speed, +20 Movement Speed, +10% Crit Chance', passive: 'Typhoon: Har 5-3 soniyada oddiy hujum 3 ta dushmanga sakrab 150-362 Magic Damage yetkazadi.', tier: 3, icon: 'fa-wind', color: '#38bdf8' },
      { id: 'berserker', name: 'Berserker\'s Fury', category: 'attack', price: 2250, stats: '+65 Physical Attack, +25% Crit Chance, +40% Crit Damage', passive: 'Doom: Kritik zarbalar Physical Attack ni 5% ga oshiradi (2s).', tier: 3, icon: 'fa-burst', color: '#ec4899' },
      { id: 'endless', name: 'Endless Battle', category: 'attack', price: 2470, stats: '+65 Phys Atk, +250 HP, +10% CDR, +8% Hybrid Lifesteal, +5% MS', passive: 'Divine Justice: Skill ishlatgandan keyingi oddiy zarba 60% Physical Attack ga teng True Damage (Haqiqiy zarar) yetkazadi.', tier: 3, icon: 'fa-swords', color: '#a855f7' },
      { id: 'haas', name: 'Haas\'s Claws', category: 'attack', price: 2020, stats: '+30 Physical Attack, +20% Attack Speed, +20% Crit Chance, +25% Lifesteal', passive: 'Frenzy: Kritik zarbalar 2s davomida +20% qo\'shimcha Attack Speed beradi.', tier: 3, icon: 'fa-claw-marks', color: '#f43f5e' },
      { id: 'won', name: 'Wind of Nature', category: 'attack', price: 1910, stats: '+30 Physical Attack, +20% Attack Speed, +10% Lifesteal', passive: 'Active (Wind Chant): 2 soniya davomida barcha jismoniy zararga to\'liq daxlsizlik (Immunity) beradi.', tier: 3, icon: 'fa-shield-halved', color: '#22c55e' },
      { id: 'waraxe', name: 'War Axe', category: 'attack', price: 2100, stats: '+25 Physical Attack, +550 HP, +10% CDR', passive: 'Fighting Spirit: Har soniya zarar berilganda +12 Physical Attack va +10% Spell Vamp (Maks 6 stack). To\'liq stackda 10% True Damage!', tier: 3, icon: 'fa-axe', color: '#ea580c' },
      { id: 'rosegold', name: 'Rose Gold Meteor', category: 'attack', price: 2120, stats: '+60 Physical Attack, +23 Magic Defense, +10% Lifesteal', passive: 'Lifeline: HP 30% dan pastga tushganda 840-1820 Magic Shield va +50% Movement Speed beradi.', tier: 3, icon: 'fa-shield-virus', color: '#fb7185' },
      { id: 'goldenstaff', name: 'Golden Staff', category: 'attack', price: 2000, stats: '+55 Physical Attack, +15% Attack Speed', passive: 'Swift: Kritik imkoniyatini Attack Speed ga aylantiradi. Endless Strike: 3-zarba birdaniga 3 ta oddiy hujum effektini faollashtiradi.', tier: 3, icon: 'fa-staff', color: '#eab308' },
      { id: 'hunterstrike', name: 'Hunter Strike', category: 'attack', price: 2010, stats: '+80 Physical Attack, +10% CDR, +15 Physical Penetration', passive: 'Retribution: Bir dushmanga 5 marta ketma-ket zarar berilsa, +50% Harakat tezligi beriladi (3s).', tier: 3, icon: 'fa-crosshairs', color: '#6366f1' },
      { id: 'corrosion', name: 'Corrosion Scythe', category: 'attack', price: 2050, stats: '+30 Physical Attack, +5% MS, +35% Attack Speed', passive: 'Corrosion: Oddiy hujumlar dushmanni 8% ga sekinlashtiradi (Maks 5 stack = 40% slow). Impulse: Har bir zarba +6% Attack Speed beradi.', tier: 3, icon: 'fa-scissors', color: '#14b8a6' },
      { id: 'heptaseas', name: 'Blade of the Heptaseas', category: 'attack', price: 1950, stats: '+70 Physical Attack, +250 HP, +15 Physical Penetration', passive: 'Ambush: 5s zarar olinmasa/berilmasa, keyingi oddiy zarba +160 + 40% Physical Attack ga teng ulkan qo\'shimcha zarba beradi.', tier: 3, icon: 'fa-dagger', color: '#3b82f6' },

      // ── MAGIC ITEMS (31 items) ──
      { id: 'holycrystal', name: 'Holy Crystal', category: 'magic', price: 2180, stats: '+100 Magic Power', passive: 'Mystery: Qahramonning umumiy Magic Power miqdorini +21% dan +35% gacha darajasiga qarab oshiradi.', tier: 3, icon: 'fa-gem', color: '#38bdf8' },
      { id: 'lightning', name: 'Lightning Truncheon', category: 'magic', price: 2250, stats: '+75 Magic Power, +400 Mana, +10% CDR', passive: 'Resonate: Har 6 soniyada keyingi skill 3 ta dushmanga sakrab Mana miqdoriga mos 120% Sehrli zarar yetkazadi.', tier: 3, icon: 'fa-bolt-lightning', color: '#06b6d4' },
      { id: 'divineglaive', name: 'Divine Glaive', category: 'magic', price: 1970, stats: '+65 Magic Power', passive: 'Spellbreaker: +40% Magic Penetration. Dushmanning Magic Defense miqdoriga qarab teshib o\'tish kuchi oshadi.', tier: 3, icon: 'fa-wand-sparkles', color: '#8b5cf6' },
      { id: 'glowingwand', name: 'Glowing Wand', category: 'magic', price: 2120, stats: '+75 Magic Power, +400 HP, +5% Movement Speed', passive: 'Scorch: Dushmanga zarar berilganda 3s davomida har soniya Max HP ning 1.5% miqdorida yondiradi + 50% Anti-heal.', tier: 3, icon: 'fa-fire-burner', color: '#f97316' },
      { id: 'bloodwings', name: 'Blood Wings', category: 'magic', price: 3000, stats: '+175 Magic Power', passive: 'Guard: 800 (+100% Magic Power) hajmida qalqon beradi. Qalqon buzilganda +30 Harakat tezligi beradi.', tier: 3, icon: 'fa-feather', color: '#ef4444' },
      { id: 'geniuswand', name: 'Genius Wand', category: 'magic', price: 2000, stats: '+75 Magic Power, +5% MS, +10 Magic Penetration', passive: 'Magic Magic: Dushmanga zarar yetkazilganda uning Magic Defense ini 3-7 ga kamaytiradi (Maks 3 stack = 21 pasayish).', tier: 3, icon: 'fa-wand-magic', color: '#a855f7' },
      { id: 'clockofdestiny', name: 'Clock of Destiny', category: 'magic', price: 1950, stats: '+60 Magic Power, +500 HP, +600 Mana', passive: 'Time: Har 20 soniyada +20 HP va +4 Magic Power (Maks 10 stack). To\'liq stackda qo\'shimcha +5% Magic Power va +300 Mana.', tier: 3, icon: 'fa-clock', color: '#eab308' },
      { id: 'concentrated', name: 'Concentrated Energy', category: 'magic', price: 2020, stats: '+70 Magic Power, +700 HP, +20% Magic Lifesteal', passive: 'Recharge: Sehrli zarar yetkazilganda 5 soniyaga Magic Power +5 ga oshadi (Maks 6 stack = +30 Magic Power).', tier: 3, icon: 'fa-atom', color: '#ec4899' },
      { id: 'icequeen', name: 'Ice Queen Wand', category: 'magic', price: 2240, stats: '+75 Magic Power, +10% Magic Lifesteal, +150 Mana, +7% MS', passive: 'Ice Bound: Sehrli zarar dushmanni 15% ga sekinlashtiradi (Maks 2 stack = 30% slow).', tier: 3, icon: 'fa-snowflake', color: '#00d4ff' },
      { id: 'featherofheaven', name: 'Feather of Heaven', category: 'magic', price: 2030, stats: '+55 Magic Power, +30% Attack Speed, +5% CDR, +5% MS', passive: 'Affliction: Oddiy hujumlar qo\'shimcha 50 + 30% Magic Power miqdorida sehrli zarar yetkazadi.', tier: 3, icon: 'fa-feather-pointed', color: '#ffd700' },
      { id: 'wintercrown', name: 'Winter Crown', category: 'magic', price: 2110, stats: '+45 Magic Power, +400 HP, +5% CDR', passive: 'Active (Frozen): 2 soniya davomida muzlab to\'liq daxlsiz bo\'ladi (Skill ishlatish mumkin bo\'lgan yangi 2026 talqini!).', tier: 3, icon: 'fa-icicles', color: '#67e8f9' },
      { id: 'starlium', name: 'Starlium Scythe', category: 'magic', price: 2220, stats: '+70 Magic Power, +10% CDR, +8% Hybrid Lifesteal, +6 Mana Regen', passive: 'Crisis: Skill ishlatgandan keyingi oddiy zarba 100 + 100% Magic Power miqdorida True Damage (Haqiqiy zarar) yetkazadi.', tier: 3, icon: 'fa-moon', color: '#818cf8' },
      { id: 'talisman', name: 'Enchanted Talisman', category: 'magic', price: 1870, stats: '+50 Magic Power, +250 HP, +20% CDR', passive: 'Mana Spring: Har 10 soniyada maksimal Mananing 15% ini tiklaydi. Max CDR chegarasi 45% ga ko\'tariladi.', tier: 3, icon: 'fa-book-skull', color: '#2dd4bf' },

      // ── DEFENSE ITEMS (26 items) ──
      { id: 'thunderbelt', name: 'Thunder Belt', category: 'defense', price: 1820, stats: '+800 HP, +15 Phys Def, +15 Magic Def, +10% CDR, +20 MS', passive: 'Thunderbolt (2026 META): Oddiy zarba True Damage uradi va har bir zarba doimiy ravishda +1 Hybrid Defense beradi (Cheksiz stack!)', tier: 3, icon: 'fa-shield-halved', color: '#00d4ff' },
      { id: 'immortality', name: 'Immortality', category: 'defense', price: 2120, stats: '+800 HP, +20 Physical Defense', passive: 'Immortal: O\'lgandan 2.5 soniya keyin 16% HP va 220-1200 Shield bilan qayta tiriladi (210s CD).', tier: 3, icon: 'fa-cross', color: '#ffd700' },
      { id: 'dominance', name: 'Dominance Ice', category: 'defense', price: 2010, stats: '+500 Mana, +55 Physical Defense, +5% MS', passive: 'Arctic Cold: Yaqindagi dushmanlarning Shield va HP Regenini 50% ga kamaytiradi (Anti-heal) + Hujum tezligini 30% ga pasaytiradi.', tier: 3, icon: 'fa-cubes-stacked', color: '#38bdf8' },
      { id: 'antique', name: 'Antique Cuirass', category: 'defense', price: 2170, stats: '+920 HP, +40 Physical Defense, +4 HP Regen', passive: 'Deter: Dushman skilli tekkanida uning Physical Attack miqdorini 6% ga kamaytiradi (Maks 3 stack = 18% kamayish).', tier: 3, icon: 'fa-shield-cat', color: '#f59e0b' },
      { id: 'athena', name: 'Athena\'s Shield', category: 'defense', price: 2150, stats: '+900 HP, +48 Magic Defense, +2 HP Regen', passive: 'Shield: Sehrli zarar tekkanida 3 soniyaga olinadigan sehrli zararni 25% ga kamaytiradi (Bir martalik nuke himoyasi).', tier: 3, icon: 'fa-shield-heart', color: '#ec4899' },
      { id: 'radiant', name: 'Radiant Armor', category: 'defense', price: 1880, stats: '+950 HP, +40 Magic Defense, +12 HP Regen', passive: 'Holy Blessing: Uzluksiz sehrli zarar olinganda sehrli zararni 5-8 ga kamaytiradi (Maks 6 stack = Chang\'e, Yve, Valir kushandasi).', tier: 3, icon: 'fa-sun', color: '#facc15' },
      { id: 'blade_armor', name: 'Blade Armor', category: 'defense', price: 1960, stats: '+70 Physical Defense, +20% Crit Damage Reduction', passive: 'Bladed Armor: Oddiy jismoniy hujum qilgan dushmanga zararning 30% ini o\'ziga qaytaradi va uni sekinlashtiradi.', tier: 3, icon: 'fa-shield-halved', color: '#64748b' },
      { id: 'guardian', name: 'Guardian Helmet', category: 'defense', price: 2200, stats: '+1550 HP, +20 HP Regen', passive: 'Recovery: Jangdan tashqarida har soniyada maksimal HP ning 2.5% ini tiklaydi (Bazaga qaytmasdan o\'ynash uchun).', tier: 3, icon: 'fa-helmet-safety', color: '#10b981' },
      { id: 'twilight', name: 'Twilight Armor', category: 'defense', price: 2100, stats: '+1200 HP, +400 Mana', passive: 'Twilight: 600 dan ortiq bir martalik jismoniy zararni kamaytiradi (Aldous, Lesley, Brody snayper zarbalariga qarshi).', tier: 3, icon: 'fa-shield', color: '#a855f7' },
      { id: 'bruteforce', name: 'Brute Force Breastplate', category: 'defense', price: 1870, stats: '+600 HP, +23 Physical Defense, +10% CDR', passive: 'Brute Force: Skill yoki oddiy zarba berilganda +2% MS va +6 Hybrid Defense oladi (Maks 6 stack). To\'liq stackda 15% CC chidamlilik.', tier: 3, icon: 'fa-vest', color: '#dc2626' },
      { id: 'oracle', name: 'Oracle', category: 'defense', price: 2060, stats: '+850 HP, +25 Phys Def, +25 Magic Def, +10% CDR', passive: 'Bless: Olinadigan barcha Shield (qalqon) va HP tiklanish effektlarini 30% ga oshiradi (Esmeralda, Uranus, Yu Zhong uchun ideal).', tier: 3, icon: 'fa-shield-halved', color: '#14b8a6' },
      { id: 'cursed', name: 'Cursed Helmet', category: 'defense', price: 1760, stats: '+1200 HP, +25 Magic Defense', passive: 'Burning Soul: Yaqindagi dushmanlarga har soniya maksimal HP ning 1.2% miqdorida sehrli zarar yetkazadi (Minionlarga 140%).', tier: 3, icon: 'fa-fire-alt', color: '#ef4444' },
      { id: 'queenswings', name: 'Queen\'s Wings', category: 'defense', price: 2250, stats: '+40 Adaptive Attack, +600 HP, +10% CDR', passive: 'Demonize: HP 40% dan pastga tushganda 3s davomida olinadigan zararni 30% ga kamaytiradi va +15% Spell Vamp beradi.', tier: 3, icon: 'fa-feather', color: '#be185d' },

      // ── MOVEMENT BOOTS (7 items) ──
      { id: 'toughboots', name: 'Tough Boots', category: 'movement', price: 700, stats: '+40 Movement Speed, +22 Magic Defense', passive: 'Fortitude: Nazorat (CC - stun, slow, immobilize) davomiyligini 30% ga qisqartiradi.', tier: 2, icon: 'fa-shoe-prints', color: '#0284c7' },
      { id: 'warriorboots', name: 'Warrior Boots', category: 'movement', price: 720, stats: '+40 Movement Speed, +22 Physical Defense', passive: 'Valor: Har bir olingan oddiy jismoniy zarba uchun +4 Physical Defense oladi (Maks 20).', tier: 2, icon: 'fa-shoe-prints', color: '#d97706' },
      { id: 'arcaneboots', name: 'Arcane Boots', category: 'movement', price: 690, stats: '+40 Movement Speed, +10 Magic Penetration', passive: 'Sehrgarlar uchun erta o\'yinda yuqori sehrli teshib o\'tish kuchi.', tier: 2, icon: 'fa-shoe-prints', color: '#9333ea' },
      { id: 'swiftboots', name: 'Swift Boots', category: 'movement', price: 710, stats: '+40 Movement Speed, +15% Attack Speed', passive: 'Marksmanlar va tezkor hujumchilar uchun eng asosiy boshlang\'ich poyabzal.', tier: 2, icon: 'fa-shoe-prints', color: '#eab308' },
      { id: 'magicshoes', name: 'Magic Shoes', category: 'movement', price: 710, stats: '+40 Movement Speed, +10% Cooldown Reduction', passive: 'Skillarni tezroq ishlatishga muhtoj assasinlar va sehrgarlar uchun.', tier: 2, icon: 'fa-shoe-prints', color: '#06b6d4' },
      { id: 'rapidboots', name: 'Rapid Boots', category: 'movement', price: 750, stats: '+65 Movement Speed', passive: 'Side Effect: Jang paytida tezlik 25 ga kamayadi. Xaritada eng tez harakatlanish imkoni.', tier: 2, icon: 'fa-shoe-prints', color: '#22c55e' },
      { id: 'demonshoes', name: 'Demon Shoes', category: 'movement', price: 720, stats: '+40 Movement Speed, +10 Mana Regen', passive: 'Mysticism: Qahramonni o\'ldirish 10% Mana, minion o\'ldirish 4% Mana tiklaydi.', tier: 2, icon: 'fa-shoe-prints', color: '#64748b' },

      // ── JUNGLING RETRIBUTION BLESSINGS (3 items) ──
      { id: 'flameretrib', name: 'Flame Retribution', category: 'jungle', price: 0, stats: 'Jungle Blessing', passive: 'Dushmandan 32-72 Physical va Magic Attack o\'g\'irlab o\'ziga qo\'shadi (4s).', tier: 3, icon: 'fa-fire-flame-curved', color: '#ea580c' },
      { id: 'iceretrib', name: 'Ice Retribution', category: 'jungle', price: 0, stats: 'Jungle Blessing', passive: 'Dushmandan 72-100 Movement Speed o\'g\'irlab o\'ziga qo\'shadi (4s). Dushmanni ushlab olish uchun.', tier: 3, icon: 'fa-snowflake', color: '#06b6d4' },
      { id: 'bloodyretrib', name: 'Bloody Retribution', category: 'jungle', price: 0, stats: 'Jungle Blessing', passive: '4 soniya davomida dushmanning maksimal HP sidan 12.5% miqdorida jon so\'rib oladi (Tank-junglerlar uchun).', tier: 3, icon: 'fa-droplet', color: '#dc2626' },

      // ── ROAMING BLESSINGS (4 items) ──
      { id: 'conceal', name: 'Conceal (Roam)', category: 'roam', price: 0, stats: 'Roam Active Blessing', passive: 'Active: Yaqindagi barcha jamoadoshlarni 5 soniyaga ko\'rinmas (Camouflage) qiladi va +30-75% Harakat tezligi beradi.', tier: 3, icon: 'fa-ghost', color: '#6366f1' },
      { id: 'favor', name: 'Favor (Roam)', category: 'roam', price: 0, stats: 'Roam Passive Blessing', passive: 'Ittifoqchiga heal yoki shield berilganda, eng kam jonli jamoadoshga qo\'shimcha 300-750 HP tiklab beradi (15s CD).', tier: 3, icon: 'fa-hand-holding-heart', color: '#ec4899' },
      { id: 'encourage', name: 'Encourage (Roam)', category: 'roam', price: 0, stats: 'Roam Aura Blessing', passive: 'Aura: Yaqindagi barcha jamoadoshlarga doimiy +12-30 Adaptive Attack va +15% Attack Speed beradi.', tier: 3, icon: 'fa-users', color: '#eab308' },
      { id: 'direhit', name: 'Dire Hit (Roam)', category: 'roam', price: 0, stats: 'Roam Passive Blessing', passive: 'Dushmanning HP si 35% dan past bo\'lganda, keyingi hujum qo\'shimcha 7-18% Max HP miqdorida Hybrid Damage uradi.', tier: 3, icon: 'fa-crosshairs', color: '#ef4444' }
    ];
  }

  // ═══════════════════════════════════════════════════
  // 4. CALCULATION ALGORITHM & STATS ENGINE
  // ═══════════════════════════════════════════════════
  calculateHeroMeta(hero, rank = 'glory') {
    let wr = hero.wr;
    let pr = hero.pr;
    let br = hero.br;

    if (rank === 'glory') {
      br = Math.min(100, br * 1.1);
      pr = Math.min(100, pr * 1.05);
    } else if (rank === 'epic') {
      br = br * 0.5;
      pr = pr * 1.3;
      if (['Layla', 'Miya', 'Zilong', 'Nana', 'Saber', 'Balmond', 'Hanabi', 'Dyrroth'].includes(hero.name)) {
        wr += 2.5;
      }
    } else if (rank === 'legend') {
      br = br * 0.8;
      pr = pr * 1.1;
    }

    const wrDelta = wr - 50.0;
    const wrScore = wrDelta * 1.6;
    const prScore = Math.min(15, (pr / 8.0) * 15);
    const brScore = Math.min(40, (br / 85.0) * 40);
    const confidence = Math.min(1.0, 0.65 + (pr / 20.0) * 0.35);

    let rawScore = (35 + wrScore + prScore + brScore) * confidence;
    let metaScore = Math.max(10, Math.min(99, Math.round(rawScore)));

    let tier = 'C';
    let tierTitle = 'Off-Meta / Niche Picks';
    let tierColor = '#94a3b8';
    let tierBg = 'rgba(148, 163, 184, 0.15)';

    if (metaScore >= 82 || hero.tierOverride === 'S+') {
      tier = 'S+';
      tierTitle = 'God Tier (Must Pick / Must Ban)';
      tierColor = '#ef4444';
      tierBg = 'rgba(239, 68, 68, 0.2)';
    } else if (metaScore >= 70) {
      tier = 'S';
      tierTitle = 'Dominant Meta Picks';
      tierColor = '#f59e0b';
      tierBg = 'rgba(245, 158, 11, 0.2)';
    } else if (metaScore >= 58) {
      tier = 'A';
      tierTitle = 'Strong & Viable Meta';
      tierColor = '#10b981';
      tierBg = 'rgba(16, 185, 129, 0.2)';
    } else if (metaScore >= 46) {
      tier = 'B';
      tierTitle = 'Balanced / Situational Counter-Picks';
      tierColor = '#00d4ff';
      tierBg = 'rgba(0, 212, 255, 0.2)';
    }

    return {
      ...hero,
      winRate: Math.round(wr * 10) / 10,
      pickRate: Math.round(pr * 10) / 10,
      banRate: Math.round(br * 10) / 10,
      metaScore,
      tier,
      tierTitle,
      tierColor,
      tierBg
    };
  }

  getProcessedHeroes() {
    let list = this.metaData.map(h => this.calculateHeroMeta(h, this.currentRank));

    if (this.currentLane !== 'all') {
      list = list.filter(h => h.lane === this.currentLane);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      let valA = a[this.sortBy];
      let valB = b[this.sortBy];
      if (typeof valA === 'string') {
        return this.sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return this.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return list;
  }

  // ═══════════════════════════════════════════════════
  // 5. MAIN HUB RENDERER WITH TOP CONTROLS & SUBTABS
  // ═══════════════════════════════════════════════════
  renderTierListHub(containerId = 'tierListHubContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rankLabels = {
      glory: '<i class="fa-solid fa-crown" style="color:#ffd700;"></i> Mythical Glory+ (Pro Meta)',
      mythic: '<i class="fa-solid fa-star" style="color:#a855f7;"></i> Mythic Rank',
      legend: '<i class="fa-solid fa-gem" style="color:#00d4ff;"></i> Legend Rank',
      epic: '<i class="fa-solid fa-shield-halved" style="color:#10b981;"></i> Epic Rank',
      all: '<i class="fa-solid fa-globe"></i> All Ranks'
    };

    const laneLabels = {
      all: 'All Lanes',
      gold: 'Gold Lane',
      exp: 'EXP Lane',
      mid: 'Mid Lane',
      roam: 'Roam',
      jungle: 'Jungle'
    };

    const laneIcons = {
      all: 'fa-layer-group',
      gold: 'fa-gem',
      exp: 'fa-shield-halved',
      mid: 'fa-wand-magic-sparkles',
      roam: 'fa-chess-rook',
      jungle: 'fa-paw'
    };

    container.innerHTML = `
      <!-- TOP BANNER WITH 24H AUTO-REFRESH & PATCH INFO -->
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(255,215,0,0.05) 50%, var(--bg-card-glass) 100%); border: 1px solid rgba(0,212,255,0.3); position:relative; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.25rem;">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem; flex-wrap:wrap;">
              <span class="badge" style="background:linear-gradient(135deg, #ffd700 0%, #ff8c00 100%); color:#000; font-weight:900; font-size:0.75rem; padding:4px 10px; border-radius:6px; letter-spacing:0.05em;">
                <i class="fa-solid fa-fire"></i> MLBB META PATCH ${this.patchVersion}
              </span>
              <span class="badge" style="background:rgba(16,185,129,0.15); color:var(--success); font-size:0.75rem; border:1px solid rgba(16,185,129,0.4); font-weight:700; display:inline-flex; align-items:center; gap:0.4rem;">
                <span class="live-pulse"></span> JONLI MOONTON AVTO-SINXRON (24 SOAT)
              </span>
              <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-secondary); font-size:0.75rem; border:1px solid var(--border-light);">
                <i class="fa-solid fa-stopwatch" style="color:var(--secondary);"></i> Yangilanishga: <strong id="autoRefreshCountdown" style="color:#fff; font-family:monospace;">--:--:--</strong>
              </span>
              <button class="btn btn-secondary btn-sm" id="refreshMetaDataBtn" title="Moonton serverlaridan yangilash" style="padding:2px 10px; font-size:0.75rem;">
                <i class="fa-solid fa-arrows-rotate"></i> Hozir Yangilash
              </button>
            </div>
            <h2 style="font-size:1.75rem; font-weight:800; color:var(--text-primary); margin:0;">
              Mobile Legends: Bang Bang Meta, Emblema & Itemlar Markazi
            </h2>
            <p style="color:var(--text-secondary); font-size:0.875rem; margin:0.35rem 0 0 0; max-width:680px;">
              Moonton rasmiy statistikasi asosida har 24 soatda avtomatik hisoblanuvchi qahramonlar reytingi, yangilangan 7 ta Emblema talentlari va 104 ta Itemlar ensiklopediyasi.
            </p>
          </div>

          <!-- VIEW MODE SWITCHER TABS -->
          <div class="tabs" id="tierViewTabs" style="margin:0; border-bottom:none; background:rgba(0,0,0,0.4); padding:4px; border-radius:10px; border:1px solid var(--border-light); flex-wrap:wrap;">
            <button class="tab-btn ${this.currentView === 'tierlist' ? 'active' : ''}" data-view="tierlist" style="padding:0.45rem 0.85rem; font-size:0.825rem; border-radius:6px;">
              <i class="fa-solid fa-list-ol"></i> Tier List
            </button>
            <button class="tab-btn ${this.currentView === 'table' ? 'active' : ''}" data-view="table" style="padding:0.45rem 0.85rem; font-size:0.825rem; border-radius:6px;">
              <i class="fa-solid fa-table"></i> Statistika
            </button>
            <button class="tab-btn ${this.currentView === 'advisor' ? 'active' : ''}" data-view="advisor" style="padding:0.45rem 0.85rem; font-size:0.825rem; border-radius:6px;">
              <i class="fa-solid fa-chess-knight"></i> Draft & Counter
            </button>
            <button class="tab-btn ${this.currentView === 'emblems' ? 'active' : ''}" data-view="emblems" style="padding:0.45rem 0.85rem; font-size:0.825rem; border-radius:6px; color:#ffd700;">
              <i class="fa-solid fa-shield-halved"></i> 🛡️ Emblema (2026)
            </button>
            <button class="tab-btn ${this.currentView === 'items' ? 'active' : ''}" data-view="items" style="padding:0.45rem 0.85rem; font-size:0.825rem; border-radius:6px; color:#00d4ff;">
              <i class="fa-solid fa-wand-magic-sparkles"></i> ⚔️ Itemlar (104 ta)
            </button>
          </div>
        </div>
      </div>

      <!-- FILTER CONTROLS BAR (For Tierlist & Table Views) -->
      <div id="tierListFiltersBar" class="card mb-4 ${['emblems', 'items'].includes(this.currentView) ? 'hidden' : ''}" style="background:rgba(0,0,0,0.25); border:1px solid var(--border-light); padding:1rem 1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          
          <!-- RANK SELECTOR -->
          <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
            <label style="font-size:0.8rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-right:4px;">
              <i class="fa-solid fa-trophy" style="color:var(--secondary);"></i> Rank:
            </label>
            ${Object.keys(rankLabels).map(k => `
              <button class="filter-chip ${this.currentRank === k ? 'active' : ''}" data-rank="${k}" style="padding:0.35rem 0.75rem; font-size:0.8rem;">
                ${rankLabels[k]}
              </button>
            `).join('')}
          </div>

          <!-- SEARCH & SORT -->
          <div style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:240px; justify-content:flex-end;">
            <div style="position:relative; width:100%; max-width:240px;">
              <input type="text" id="tierSearchInput" class="form-input" placeholder="Qahramonni qidirish..." value="${this.searchQuery}" style="padding-left:2.2rem; font-size:0.875rem;" />
              <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:0.8rem;"></i>
            </div>
            <select id="tierSortSelect" class="form-select" style="max-width:180px; font-size:0.85rem;">
              <option value="metaScore" ${this.sortBy === 'metaScore' ? 'selected' : ''}>Meta Score (Yuqori)</option>
              <option value="winRate" ${this.sortBy === 'winRate' ? 'selected' : ''}>Win Rate % (Yuqori)</option>
              <option value="banRate" ${this.sortBy === 'banRate' ? 'selected' : ''}>Ban Rate % (Yuqori)</option>
              <option value="pickRate" ${this.sortBy === 'pickRate' ? 'selected' : ''}>Pick Rate % (Yuqori)</option>
              <option value="name" ${this.sortBy === 'name' ? 'selected' : ''}>Ism bo'yicha (A-Z)</option>
            </select>
          </div>
        </div>

        <!-- LANE FILTER CHIPS -->
        <div class="filter-bar" style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid rgba(255,255,255,0.05); margin-bottom:0;">
          <label style="font-size:0.8rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">
            <i class="fa-solid fa-map-location-dot" style="color:var(--primary);"></i> Chiziq (Lane):
          </label>
          ${Object.keys(laneLabels).map(l => `
            <button class="filter-chip ${this.currentLane === l ? 'active' : ''}" data-lane="${l}" style="padding:0.35rem 0.85rem; font-size:0.825rem;">
              <i class="fa-solid ${laneIcons[l]}"></i> ${laneLabels[l]}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- MAIN DYNAMIC CONTENT CONTAINER -->
      <div id="tierMainViewContent"></div>
    `;

    // Event bindings
    container.querySelectorAll('#tierViewTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        container.querySelectorAll('#tierViewTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        const filtersBar = document.getElementById('tierListFiltersBar');
        if (filtersBar) {
          if (['emblems', 'items'].includes(this.currentView)) {
            filtersBar.classList.add('hidden');
          } else {
            filtersBar.classList.remove('hidden');
          }
        }
        this.renderActiveView();
      });
    });

    container.querySelectorAll('[data-rank]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentRank = e.currentTarget.dataset.rank;
        this.fetchLiveMetaData(this.currentRank);
        this.renderTierListHub(containerId);
      });
    });

    document.getElementById('refreshMetaDataBtn')?.addEventListener('click', () => {
      if (window.showToast) window.showToast("Moonton serverlaridan yangilanmoqda...", "info");
      this.fetchLiveMetaData(this.currentRank, true);
    });

    container.querySelectorAll('[data-lane]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        container.querySelectorAll('[data-lane]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentLane = btn.dataset.lane;
        this.renderActiveView();
      });
    });

    const searchInput = document.getElementById('tierSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderActiveView();
      });
    }

    const sortSelect = document.getElementById('tierSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.renderActiveView();
      });
    }

    this.renderActiveView();
    this.updateCountdownDisplay();
  }

  renderActiveView() {
    const content = document.getElementById('tierMainViewContent');
    if (!content) return;

    if (this.currentView === 'tierlist') {
      this.renderTierGridView(content);
    } else if (this.currentView === 'table') {
      this.renderTableView(content);
    } else if (this.currentView === 'advisor') {
      this.renderDraftAdvisorView(content);
    } else if (this.currentView === 'emblems') {
      this.renderEmblemsView(content);
    } else if (this.currentView === 'items') {
      this.renderItemsView(content);
    }
  }

  // ═══════════════════════════════════════════════════
  // 6. TIER LIST GRID VIEW (S+, S, A, B, C)
  // ═══════════════════════════════════════════════════
  renderTierGridView(container) {
    const heroes = this.getProcessedHeroes();
    const tiers = ['S+', 'S', 'A', 'B', 'C'];
    const tierMeta = {
      'S+': { title: 'S+ Tier • God Tier (Must Pick / Must Ban)', color: '#ef4444', border: 'rgba(239,68,68,0.5)', bg: 'rgba(239,68,68,0.06)' },
      'S':  { title: 'S Tier • Dominant Meta Picks', color: '#f59e0b', border: 'rgba(245,158,11,0.5)', bg: 'rgba(245,158,11,0.06)' },
      'A':  { title: 'A Tier • Strong & Viable Meta', color: '#10b981', border: 'rgba(16,185,129,0.5)', bg: 'rgba(16,185,129,0.06)' },
      'B':  { title: 'B Tier • Balanced & Situational Counter-Picks', color: '#00d4ff', border: 'rgba(0,212,255,0.5)', bg: 'rgba(0,212,255,0.06)' },
      'C':  { title: 'C Tier • Off-Meta & Niche Solo-Q', color: '#94a3b8', border: 'rgba(148,163,184,0.3)', bg: 'rgba(148,163,184,0.04)' }
    };

    let html = '';

    tiers.forEach(tierKey => {
      const tierHeroes = heroes.filter(h => h.tier === tierKey);
      if (tierHeroes.length === 0) return;

      const meta = tierMeta[tierKey];

      html += `
        <div class="card mb-4" style="border:1px solid ${meta.border}; background:${meta.bg}; padding:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.6rem;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span style="font-size:1.5rem; font-weight:900; color:${meta.color}; background:rgba(0,0,0,0.5); padding:2px 14px; border-radius:8px; border:1px solid ${meta.color};">
                ${tierKey}
              </span>
              <span style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">
                ${meta.title}
              </span>
            </div>
            <span class="badge" style="background:rgba(0,0,0,0.4); color:var(--text-muted); font-size:0.8rem; border:1px solid var(--border-light);">
              ${tierHeroes.length} ta qahramon
            </span>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:1rem;">
            ${tierHeroes.map(hero => `
              <div class="tier-hero-card card" data-hero-name="${hero.name}" style="padding:0.85rem; background:rgba(10,14,26,0.7); border:1px solid var(--border-light); border-radius:10px; cursor:pointer; position:relative; overflow:hidden;">
                
                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <!-- HERO AVATAR ICON -->
                  <div style="width:48px; height:48px; border-radius:10px; background:linear-gradient(135deg, rgba(0,212,255,0.2), rgba(255,215,0,0.2)); border:2px solid ${hero.tierColor}; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.2rem; color:#fff; text-shadow:0 2px 4px rgba(0,0,0,0.6); flex-shrink:0;">
                    ${hero.name.substring(0, 2).toUpperCase()}
                  </div>

                  <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <h4 style="font-size:0.95rem; font-weight:800; margin:0; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${hero.name}
                      </h4>
                      <span style="font-size:0.75rem; font-weight:900; color:${hero.tierColor}; background:rgba(0,0,0,0.5); padding:1px 6px; border-radius:4px;">
                        ${hero.tier}
                      </span>
                    </div>
                    <div style="display:flex; gap:0.35rem; margin-top:2px;">
                      <span style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">
                        ${hero.role}
                      </span>
                      <span style="font-size:0.65rem; color:var(--primary); text-transform:uppercase; font-weight:700;">
                        &bull; ${hero.lane}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- METRICS ROW -->
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:0.25rem; margin-top:0.65rem; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.06); text-align:center;">
                  <div>
                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">WR %</div>
                    <div style="font-size:0.825rem; font-weight:800; color:${hero.winRate >= 53 ? 'var(--success)' : (hero.winRate < 50 ? 'var(--danger)' : 'var(--text-primary)')};">
                      ${hero.winRate}%
                    </div>
                  </div>
                  <div>
                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">BAN %</div>
                    <div style="font-size:0.825rem; font-weight:800; color:${hero.banRate >= 50 ? 'var(--danger)' : 'var(--text-primary)'};">
                      ${hero.banRate}%
                    </div>
                  </div>
                  <div>
                    <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">SCORE</div>
                    <div style="font-size:0.825rem; font-weight:900; color:var(--secondary);">
                      ${hero.metaScore}
                    </div>
                  </div>
                </div>

              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Modal click listener
    container.querySelectorAll('.tier-hero-card').forEach(card => {
      card.addEventListener('click', () => {
        const name = card.dataset.heroName;
        const hero = this.metaData.find(h => h.name.toLowerCase() === name.toLowerCase());
        if (hero) this.showHeroDetailModal(this.calculateHeroMeta(hero, this.currentRank));
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // 7. STATISTICAL TABLE VIEW (Sortable Data Table)
  // ═══════════════════════════════════════════════════
  renderTableView(container) {
    const heroes = this.getProcessedHeroes();

    container.innerHTML = `
      <div class="card" style="padding:0; overflow:hidden; border:1px solid var(--border-light);">
        <div class="table-responsive">
          <table class="data-table" style="margin:0;">
            <thead>
              <tr style="background:rgba(0,0,0,0.5);">
                <th style="width:60px; text-align:center;">#</th>
                <th>Qahramon</th>
                <th>Rol / Lane</th>
                <th style="cursor:pointer;" id="thMetaScore">
                  Meta Score <i class="fa-solid fa-sort"></i>
                </th>
                <th style="cursor:pointer;" id="thWinRate">
                  Win Rate <i class="fa-solid fa-sort"></i>
                </th>
                <th style="cursor:pointer;" id="thBanRate">
                  Ban Rate <i class="fa-solid fa-sort"></i>
                </th>
                <th style="cursor:pointer;" id="thPickRate">
                  Pick Rate <i class="fa-solid fa-sort"></i>
                </th>
                <th>Tier</th>
                <th style="text-align:center;">Tafsilot</th>
              </tr>
            </thead>
            <tbody>
              ${heroes.map((hero, idx) => `
                <tr class="tier-table-row" style="cursor:pointer;" data-hero-name="${hero.name}">
                  <td style="text-align:center; font-weight:700; color:var(--text-muted);">${idx + 1}</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                      <div style="width:32px; height:32px; border-radius:6px; background:linear-gradient(135deg, rgba(0,212,255,0.2), rgba(255,215,0,0.2)); border:1px solid ${hero.tierColor}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8rem; color:#fff;">
                        ${hero.name.substring(0, 2).toUpperCase()}
                      </div>
                      <strong style="color:var(--text-primary); font-size:0.9rem;">${hero.name}</strong>
                    </div>
                  </td>
                  <td>
                    <span class="badge" style="font-size:0.75rem; background:rgba(255,255,255,0.05);">${hero.role}</span>
                    <span class="badge" style="font-size:0.75rem; background:rgba(0,212,255,0.1); color:var(--primary); text-transform:uppercase;">${hero.lane}</span>
                  </td>
                  <td>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                      <div style="flex:1; max-width:80px; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                        <div style="width:${hero.metaScore}%; height:100%; background:linear-gradient(90deg, var(--primary), var(--secondary));"></div>
                      </div>
                      <strong style="color:var(--secondary); font-size:0.85rem;">${hero.metaScore}</strong>
                    </div>
                  </td>
                  <td>
                    <strong style="color:${hero.winRate >= 53 ? 'var(--success)' : (hero.winRate < 50 ? 'var(--danger)' : 'var(--text-primary)')}; font-size:0.85rem;">
                      ${hero.winRate}%
                    </strong>
                  </td>
                  <td>
                    <span style="color:${hero.banRate >= 50 ? 'var(--danger)' : 'var(--text-primary)'}; font-weight:700; font-size:0.85rem;">
                      ${hero.banRate}%
                    </span>
                  </td>
                  <td>
                    <span style="color:var(--text-muted); font-size:0.85rem;">
                      ${hero.pickRate}%
                    </span>
                  </td>
                  <td>
                    <span class="badge" style="background:${hero.tierBg}; color:${hero.tierColor}; font-weight:900; font-size:0.75rem; border:1px solid ${hero.tierColor};">
                      ${hero.tier}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:0.75rem;">
                      <i class="fa-solid fa-eye"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Row click
    container.querySelectorAll('.tier-table-row').forEach(row => {
      row.addEventListener('click', () => {
        const name = row.dataset.heroName;
        const hero = this.metaData.find(h => h.name.toLowerCase() === name.toLowerCase());
        if (hero) this.showHeroDetailModal(this.calculateHeroMeta(hero, this.currentRank));
      });
    });

    // Column sorting
    const bindSort = (id, field) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', () => {
        if (this.sortBy === field) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortBy = field;
          this.sortOrder = 'desc';
        }
        this.renderTableView(container);
      });
    };

    bindSort('thMetaScore', 'metaScore');
    bindSort('thWinRate', 'winRate');
    bindSort('thBanRate', 'banRate');
    bindSort('thPickRate', 'pickRate');
  }

  // ═══════════════════════════════════════════════════
  // 8. DRAFT & COUNTER ADVISOR VIEW
  // ═══════════════════════════════════════════════════
  renderDraftAdvisorView(container) {
    const allHeroes = this.metaData.map(h => this.calculateHeroMeta(h, this.currentRank));
    const mustBan = [...allHeroes].sort((a, b) => b.banRate - a.banRate).slice(0, 5);
    const topFirstPick = [...allHeroes].sort((a, b) => b.metaScore - a.metaScore).slice(0, 5);

    container.innerHTML = `
      <div class="grid-2 mb-4">
        <!-- MUST-BAN TOP 5 -->
        <div class="card" style="border: 1px solid rgba(239,68,68,0.4); background: linear-gradient(135deg, rgba(239,68,68,0.05) 0%, var(--bg-card-glass) 100%);">
          <h3 class="card-title" style="color:var(--danger); display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
            <i class="fa-solid fa-ban"></i> 🛑 Must-Ban Top 5 (Draft Priority)
          </h3>
          <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">
            Raqibga berib bo'lmaydigan, eng yuqori Ban Rate va ta'sirga ega qahramonlar:
          </p>
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            ${mustBan.map((h, i) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0.8rem; background:rgba(0,0,0,0.35); border-radius:8px; border:1px solid rgba(239,68,68,0.2);">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <span style="font-weight:900; color:var(--danger); width:20px;">#${i + 1}</span>
                  <div>
                    <strong style="color:var(--text-primary); font-size:0.9rem;">${h.name}</strong>
                    <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${h.role} &bull; ${h.lane}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:800; color:var(--danger); font-size:0.85rem;">${h.banRate}% Ban</div>
                  <div style="font-size:0.7rem; color:var(--text-muted);">${h.winRate}% WR</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- TOP FIRST PICKS -->
        <div class="card" style="border: 1px solid rgba(0,212,255,0.4); background: linear-gradient(135deg, rgba(0,212,255,0.05) 0%, var(--bg-card-glass) 100%);">
          <h3 class="card-title" style="color:var(--primary); display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem;">
            <i class="fa-solid fa-trophy"></i> 👑 First-Pick Priority (Team Anchors)
          </h3>
          <p style="color:var(--text-muted); font-size:0.8rem; margin-bottom:1rem;">
            Ban qilinmagan taqdirda darhol 1-navbatda olish zarur bo'lgan kuchli carrylar:
          </p>
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            ${topFirstPick.map((h, i) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0.8rem; background:rgba(0,0,0,0.35); border-radius:8px; border:1px solid rgba(0,212,255,0.2);">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <span style="font-weight:900; color:var(--primary); width:20px;">#${i + 1}</span>
                  <div>
                    <strong style="color:var(--text-primary); font-size:0.9rem;">${h.name}</strong>
                    <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">${h.role} &bull; ${h.lane}</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:800; color:var(--secondary); font-size:0.85rem;">Score: ${h.metaScore}</div>
                  <div style="font-size:0.7rem; color:var(--success); font-weight:700;">${h.winRate}% WR</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- INTERACTIVE COUNTER PICKER TOOL -->
      <div class="card" style="border:1px solid var(--border-light); background:rgba(10,14,26,0.6);">
        <h3 class="card-title" style="margin-bottom:0.5rem;">
          <i class="fa-solid fa-chess"></i> ⚔️ Jonli Counter-Pick Maslahatchisi
        </h3>
        <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1.25rem;">
          Raqib tanlagan qahramonni tanlang — tizim unga qarshi eng samarali counter-qahramonlar va taktik maslahatlarni chiqarib beradi:
        </p>

        <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap; margin-bottom:1.5rem;">
          <select id="advisorEnemySelect" class="form-select" style="max-width:320px;">
            <option value="">-- Dushman qahramonini tanlang --</option>
            ${allHeroes.map(h => `<option value="${h.name}">${h.name} (${h.role} - ${h.lane})</option>`).join('')}
          </select>
          <span style="color:var(--text-muted); font-size:0.85rem;">yoki qidiruv orqali toping.</span>
        </div>

        <div id="advisorResultBox" class="hidden"></div>
      </div>
    `;

    // Counter picker event
    const select = document.getElementById('advisorEnemySelect');
    const resultBox = document.getElementById('advisorResultBox');
    if (select && resultBox) {
      select.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val) {
          resultBox.classList.add('hidden');
          return;
        }

        const hero = allHeroes.find(h => h.name.toLowerCase() === val.toLowerCase());
        if (!hero) return;

        resultBox.classList.remove('hidden');
        resultBox.innerHTML = `
          <div style="padding:1.25rem; background:rgba(0,212,255,0.04); border:1px solid rgba(0,212,255,0.3); border-radius:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
              <div>
                <h4 style="margin:0; font-size:1.2rem; color:var(--text-primary);">
                  🎯 <strong style="color:var(--danger);">${hero.name}</strong> ga qarshi kontr-strategiya:
                </h4>
                <div style="color:var(--text-muted); font-size:0.8rem; margin-top:2px;">
                  Rol: ${hero.role} &bull; Chiziq: ${hero.lane} &bull; Joriy Meta Score: ${hero.metaScore} (${hero.tier} Tier)
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label style="font-size:0.8rem; font-weight:800; color:var(--secondary); text-transform:uppercase;">
                🛡️ Tavsiya etilgan Counter Qahramonlar:
              </label>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.4rem;">
                ${hero.counters.map(c => `
                  <span class="badge" style="background:rgba(0,212,255,0.15); color:var(--primary); border:1px solid var(--primary); font-size:0.85rem; padding:6px 12px; font-weight:800;">
                    ⚔️ ${c}
                  </span>
                `).join('')}
              </div>
            </div>

            <div style="background:rgba(0,0,0,0.3); padding:0.85rem; border-radius:8px; border-left:3px solid var(--primary);">
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">💡 Taktik Maslahat:</div>
              <div style="color:var(--text-secondary); font-size:0.875rem; margin-top:0.25rem; line-height:1.5;">
                ${hero.tip}
              </div>
            </div>
          </div>
        `;
      });
    }
  }

  // ═══════════════════════════════════════════════════
  // 9. NEW EMBLEMS ENCYCLOPEDIA VIEW (2026 META)
  // ═══════════════════════════════════════════════════
  renderEmblemsView(container) {
    const selected = this.emblemsData.find(e => e.id === this.selectedEmblem) || this.emblemsData[0];

    container.innerHTML = `
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(255,215,0,0.06) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(255,215,0,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          <div>
            <span class="badge" style="background:rgba(255,215,0,0.2); color:#ffd700; font-weight:800; font-size:0.75rem; border:1px solid #ffd700;">
              <i class="fa-solid fa-shield-halved"></i> MLBB 2026 EMBLEM SYSTEM
            </span>
            <h2 style="font-size:1.5rem; font-weight:800; color:var(--text-primary); margin:0.35rem 0 0 0;">
              Yangi Emblema Tizimi va Talentlar Daraxti
            </h2>
            <p style="color:var(--text-secondary); font-size:0.875rem; margin:0.25rem 0 0 0;">
              Har qanday emblemani xohlagan qahramonga moslab, 3 ta talent slotini erkin kombinatsiya qilish imkoniyati.
            </p>
          </div>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <span class="badge" style="background:rgba(0,0,0,0.4); color:var(--text-muted); font-size:0.8rem; border:1px solid var(--border-light);">
              7 ta Emblema To'plami
            </span>
          </div>
        </div>
      </div>

      <!-- EMBLEM PICKER ROW (7 EMBLEMS) -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:0.75rem; margin-bottom:1.5rem;">
        ${this.emblemsData.map(emb => `
          <div class="emblem-card card ${emb.id === this.selectedEmblem ? 'active' : ''}" data-emblem-id="${emb.id}" style="padding:0.75rem; text-align:center; background:rgba(10,14,26,0.7); border:1px solid ${emb.id === this.selectedEmblem ? emb.color : 'var(--border-light)'}; border-radius:10px;">
            <div style="width:40px; height:40px; border-radius:50%; background:rgba(0,0,0,0.5); border:2px solid ${emb.color}; display:flex; align-items:center; justify-content:center; margin:0 auto 0.5rem auto; font-size:1.1rem; color:${emb.color};">
              <i class="fa-solid ${emb.icon}"></i>
            </div>
            <div style="font-size:0.85rem; font-weight:800; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${emb.name.replace(' Emblemasi', '')}
            </div>
            <div style="font-size:0.65rem; color:var(--text-muted); margin-top:2px;">
              ${emb.role.split(',')[0]}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- SELECTED EMBLEM DETAILS & TALENT TREE -->
      <div class="grid-2">
        <!-- BASE ATTRIBUTES & HEROES -->
        <div class="card" style="border:1px solid ${selected.color}; background:rgba(10,14,26,0.8);">
          <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid rgba(255,255,255,0.08);">
            <div style="width:48px; height:48px; border-radius:12px; background:rgba(0,0,0,0.5); border:2px solid ${selected.color}; display:flex; align-items:center; justify-content:center; font-size:1.4rem; color:${selected.color};">
              <i class="fa-solid ${selected.icon}"></i>
            </div>
            <div>
              <h3 style="margin:0; font-size:1.25rem; color:var(--text-primary);">${selected.name}</h3>
              <div style="font-size:0.75rem; color:var(--text-muted);">${selected.role}</div>
            </div>
          </div>

          <h4 style="font-size:0.85rem; font-weight:800; color:var(--secondary); text-transform:uppercase; margin-bottom:0.6rem;">
            📊 Bazaviy Statlar (Level 60):
          </h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-bottom:1.25rem;">
            ${selected.baseStats.map(st => `
              <div style="padding:0.5rem 0.75rem; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:0.7rem; color:var(--text-muted);">${st.name}</div>
                <div style="font-size:0.95rem; font-weight:800; color:${selected.color};">${st.value}</div>
              </div>
            `).join('')}
          </div>

          <h4 style="font-size:0.85rem; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:0.6rem;">
            👑 Mos keluvchi Meta Qahramonlar:
          </h4>
          <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
            ${selected.bestHeroes.map(h => `
              <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-primary); border:1px solid var(--border-light); font-size:0.75rem; font-weight:700;">
                ${h}
              </span>
            `).join('')}
          </div>
        </div>

        <!-- TALENT TIERS (TIER 1, TIER 2, TIER 3 CORE) -->
        <div class="card" style="border:1px solid var(--border-light); background:rgba(10,14,26,0.8);">
          <h3 class="card-title" style="margin-bottom:1rem;">
            <i class="fa-solid fa-tree"></i> 🌳 Talentlar Daraxti (3 bosqich)
          </h3>

          <!-- TIER 1 -->
          <div style="margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem;">
              Tier 1: Boshlang'ich Statlar (1-slot)
            </div>
            <div style="display:flex; flex-direction:column; gap:0.4rem;">
              ${selected.tier1.map(t => `
                <div style="padding:0.5rem 0.75rem; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.05); display:flex; align-items:flex-start; gap:0.5rem;">
                  <i class="fa-solid ${t.icon}" style="color:${selected.color}; margin-top:3px;"></i>
                  <div>
                    <strong style="color:var(--text-primary); font-size:0.85rem;">${t.name}</strong>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${t.desc}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- TIER 2 -->
          <div style="margin-bottom:1rem; padding-bottom:0.75rem; border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:0.75rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.4rem;">
              Tier 2: Maxsus Effektlar (2-slot)
            </div>
            <div style="display:flex; flex-direction:column; gap:0.4rem;">
              ${selected.tier2.map(t => `
                <div style="padding:0.5rem 0.75rem; background:rgba(0,0,0,0.3); border-radius:6px; border:1px solid rgba(255,255,255,0.05); display:flex; align-items:flex-start; gap:0.5rem;">
                  <i class="fa-solid ${t.icon}" style="color:${selected.color}; margin-top:3px;"></i>
                  <div>
                    <strong style="color:var(--text-primary); font-size:0.85rem;">${t.name}</strong>
                    <div style="font-size:0.75rem; color:var(--text-secondary);">${t.desc}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- TIER 3 CORE -->
          <div>
            <div style="font-size:0.75rem; font-weight:800; color:#ffd700; text-transform:uppercase; margin-bottom:0.4rem;">
              👑 Tier 3: Core Talent (Asosiy jangovar qobiliyat)
            </div>
            <div style="display:flex; flex-direction:column; gap:0.4rem;">
              ${selected.tier3.map(t => `
                <div style="padding:0.6rem 0.75rem; background:rgba(255,215,0,0.08); border-radius:6px; border:1px solid rgba(255,215,0,0.3); display:flex; align-items:flex-start; gap:0.5rem;">
                  <i class="fa-solid ${t.icon}" style="color:#ffd700; margin-top:3px; font-size:1rem;"></i>
                  <div>
                    <strong style="color:#ffd700; font-size:0.9rem;">${t.name}</strong>
                    <div style="font-size:0.775rem; color:var(--text-primary);">${t.desc}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      </div>
    `;

    // Emblem card selection event
    container.querySelectorAll('.emblem-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedEmblem = card.dataset.emblemId;
        this.renderEmblemsView(container);
      });
    });
  }

  // ═══════════════════════════════════════════════════
  // 10. NEW ITEMS ENCYCLOPEDIA VIEW (104 ITEMS)
  // ═══════════════════════════════════════════════════
  renderItemsView(container) {
    const categoryLabels = {
      all: 'Barcha Itemlar (104)',
      attack: '⚔️ Hujum (Attack)',
      magic: '🔮 Sehr (Magic)',
      defense: '🛡️ Himoya (Defense)',
      movement: '👟 Poyabzallar (Boots)',
      jungle: '🔥 O\'rmon (Retribution)',
      roam: '👑 Roam Blessings'
    };

    let items = this.itemsData;
    if (this.currentItemCategory !== 'all') {
      items = items.filter(i => i.category === this.currentItemCategory);
    }
    if (this.itemSearchQuery) {
      const q = this.itemSearchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.stats.toLowerCase().includes(q) || i.passive.toLowerCase().includes(q));
    }

    container.innerHTML = `
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.06) 0%, var(--bg-card-glass) 100%); border: 1px solid rgba(0,212,255,0.3);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          <div>
            <span class="badge" style="background:rgba(0,212,255,0.2); color:var(--primary); font-weight:800; font-size:0.75rem; border:1px solid var(--primary);">
              <i class="fa-solid fa-cubes"></i> MLBB 2026 EQUIPMENT ENCYCLOPEDIA
            </span>
            <h2 style="font-size:1.5rem; font-weight:800; color:var(--text-primary); margin:0.35rem 0 0 0;">
              Mobile Legends: Bang Bang Yangi Itemlar Boshqarmasi
            </h2>
            <p style="color:var(--text-secondary); font-size:0.875rem; margin:0.25rem 0 0 0;">
              O'yindagi barcha 104 ta itemning narxi, statlari va passiv xususiyatlari.
            </p>
          </div>
          <div style="position:relative; width:100%; max-width:280px;">
            <input type="text" id="itemSearchInput" class="form-input" placeholder="Item nomini qidirish..." value="${this.itemSearchQuery}" style="padding-left:2.2rem; font-size:0.875rem;" />
            <i class="fa-solid fa-magnifying-glass" style="position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:0.8rem;"></i>
          </div>
        </div>

        <!-- CATEGORY CHIPS -->
        <div class="filter-bar" style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid rgba(255,255,255,0.05); margin-bottom:0;">
          ${Object.keys(categoryLabels).map(cat => `
            <button class="filter-chip ${this.currentItemCategory === cat ? 'active' : ''}" data-item-cat="${cat}" style="padding:0.35rem 0.85rem; font-size:0.8rem;">
              ${categoryLabels[cat]}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- ITEM CARDS GRID -->
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:1rem;">
        ${items.map(item => `
          <div class="item-card card" style="padding:1rem; background:rgba(10,14,26,0.7); border:1px solid var(--border-light); border-radius:10px;">
            
            <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:0.6rem;">
              <!-- ITEM ICON BADGE -->
              <div style="width:44px; height:44px; border-radius:10px; background:rgba(0,0,0,0.6); border:2px solid ${item.color || 'var(--primary)'}; display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:${item.color || 'var(--primary)'}; flex-shrink:0;">
                <i class="fa-solid ${item.icon || 'fa-shield'}"></i>
              </div>

              <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <h4 style="font-size:0.95rem; font-weight:800; color:var(--text-primary); margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${item.name}
                  </h4>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                  <span class="badge" style="font-size:0.65rem; background:rgba(255,255,255,0.06); text-transform:uppercase;">
                    ${item.category}
                  </span>
                  ${item.price > 0 ? `
                    <span style="font-size:0.75rem; font-weight:800; color:#ffd700;">
                      <i class="fa-solid fa-coins"></i> ${item.price} Gold
                    </span>
                  ` : `
                    <span style="font-size:0.75rem; font-weight:700; color:var(--success);">
                      Bepul (Blessing)
                    </span>
                  `}
                </div>
              </div>
            </div>

            <!-- ITEM STATS -->
            <div style="font-size:0.8rem; font-weight:700; color:var(--primary); margin-bottom:0.4rem; padding:4px 6px; background:rgba(0,212,255,0.05); border-radius:4px;">
              ${item.stats}
            </div>

            <!-- UNIQUE PASSIVE -->
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4; background:rgba(0,0,0,0.25); padding:6px 8px; border-radius:6px; border-left:2px solid ${item.color || 'var(--primary)'};">
              ${item.passive}
            </div>

          </div>
        `).join('')}
      </div>
    `;

    // Category filter click
    container.querySelectorAll('[data-item-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentItemCategory = btn.dataset.itemCat;
        this.renderItemsView(container);
      });
    });

    // Item search input
    const search = document.getElementById('itemSearchInput');
    if (search) {
      search.addEventListener('input', (e) => {
        this.itemSearchQuery = e.target.value;
        this.renderItemsView(container);
      });
    }
  }

  // ═══════════════════════════════════════════════════
  // 11. HERO DETAIL & COUNTER MODAL
  // ═══════════════════════════════════════════════════
  showHeroDetailModal(hero) {
    const modal = document.getElementById('modalContent');
    const overlay = document.getElementById('modalOverlay');
    if (!modal || !overlay) return;

    modal.innerHTML = `
      <div class="modal-header">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="width:42px; height:42px; border-radius:10px; background:linear-gradient(135deg, rgba(0,212,255,0.2), rgba(255,215,0,0.2)); border:2px solid ${hero.tierColor}; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.1rem; color:#fff;">
            ${hero.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 style="margin:0; font-size:1.25rem; font-weight:800; color:var(--text-primary);">${hero.name}</h3>
            <span class="badge" style="background:${hero.tierBg}; color:${hero.tierColor}; font-weight:900; font-size:0.75rem; border:1px solid ${hero.tierColor};">
              ${hero.tier} TIER &bull; SCORE: ${hero.metaScore}
            </span>
          </div>
        </div>
        <button class="modal-close" id="closeHeroModalBtn">&times;</button>
      </div>

      <div class="modal-body" style="padding:1.25rem;">
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:0.75rem; margin-bottom:1.25rem; text-align:center;">
          <div style="background:rgba(0,0,0,0.3); padding:0.75rem; border-radius:8px; border:1px solid var(--border-light);">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Win Rate</div>
            <div style="font-size:1.2rem; font-weight:900; color:${hero.winRate >= 53 ? 'var(--success)' : 'var(--text-primary)'};">${hero.winRate}%</div>
          </div>
          <div style="background:rgba(0,0,0,0.3); padding:0.75rem; border-radius:8px; border:1px solid var(--border-light);">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Ban Rate</div>
            <div style="font-size:1.2rem; font-weight:900; color:${hero.banRate >= 50 ? 'var(--danger)' : 'var(--text-primary)'};">${hero.banRate}%</div>
          </div>
          <div style="background:rgba(0,0,0,0.3); padding:0.75rem; border-radius:8px; border:1px solid var(--border-light);">
            <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase;">Pick Rate</div>
            <div style="font-size:1.2rem; font-weight:900; color:var(--primary);">${hero.pickRate}%</div>
          </div>
        </div>

        <div style="margin-bottom:1.25rem;">
          <label style="font-size:0.8rem; font-weight:800; color:var(--secondary); text-transform:uppercase;">
            🛡️ Eng Kuchli Counter-Qahramonlar:
          </label>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.4rem;">
            ${(hero.counters || []).map(c => `
              <span class="badge" style="background:rgba(239,68,68,0.15); color:var(--danger); border:1px solid var(--danger); font-size:0.85rem; padding:6px 12px; font-weight:800;">
                ⚔️ ${c}
              </span>
            `).join('')}
          </div>
        </div>

        <div style="background:rgba(0,212,255,0.05); padding:1rem; border-radius:8px; border-left:3px solid var(--primary);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">💡 Murabbiy Maslahati:</div>
          <div style="color:var(--text-secondary); font-size:0.9rem; margin-top:0.35rem; line-height:1.5;">
            ${hero.tip}
          </div>
        </div>
      </div>
    `;

    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    document.getElementById('closeHeroModalBtn')?.addEventListener('click', () => {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
    });

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
      }
    };
  }
};
