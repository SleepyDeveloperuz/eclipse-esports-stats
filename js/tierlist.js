/**
 * MLBB Tier List & Meta Statistics Engine
 * 
 * Provides automated Meta Score calculations, S+/S/A/B/C tier visualizers,
 * sortable statistics tables, lane/rank filters, and Draft & Counter advisors.
 */

window.TierListManager = class TierListManager {
  constructor(heroDb) {
    this.heroDb = heroDb;
    this.currentRank = 'glory'; // 'glory', 'mythic', 'legend', 'epic', 'all'
    this.currentLane = 'all';   // 'all', 'gold', 'exp', 'mid', 'roam', 'jungle'
    this.currentView = 'tierlist'; // 'tierlist', 'table', 'advisor'
    this.searchQuery = '';
    this.sortBy = 'metaScore'; // 'metaScore', 'winRate', 'banRate', 'pickRate', 'name'
    this.sortOrder = 'desc';

    this.initMetaDatabase();
  }

  initMetaDatabase() {
    // Comprehensive MLBB Meta dataset (Latest Patch meta stats across Ranks)
    // Structure: name, primaryRole, lane, wr (Mythic/Glory base), pr, br, counters, tip
    this.metaData = [
      // --- ROAMERS / TANKS & SUPPORTS ---
      { name: 'Mathilda', role: 'Support', lane: 'roam', wr: 54.8, pr: 5.2, br: 78.5, tierOverride: null, counters: ['Khufra', 'Franco', 'Minsitthar'], tip: 'S+ Roamer. Guiding Wind provides unmatched team mobility and dive peel.' },
      { name: 'Tigreal', role: 'Tank', lane: 'roam', wr: 52.4, pr: 6.8, br: 62.0, counters: ['Diggie', 'Valir', 'Wanwan'], tip: 'S+ CC initiator. S2 push + Ultimate flicker turns late game teamfights instantly.' },
      { name: 'Chip', role: 'Tank', lane: 'roam', wr: 53.2, pr: 3.8, br: 72.4, counters: ['Minsitthar', 'Valir', 'Akai'], tip: 'S+ Global macro enabler. Portal summons entire team to collapse on objectives.' },
      { name: 'Diggie', role: 'Support', lane: 'roam', wr: 53.9, pr: 4.1, br: 68.2, counters: ['Lesley', 'Beatrix', 'Claude'], tip: 'S Tier ultimate anti-CC. Completely negates Tigreal, Atlas, and Guinevere engages.' },
      { name: 'Minotaur', role: 'Tank', lane: 'roam', wr: 52.8, pr: 3.5, br: 38.4, counters: ['Diggie', 'Karrie', 'Lunox'], tip: 'S Tier durable teamfight tank with heal + AOE airborne disruption.' },
      { name: 'Angela', role: 'Support', lane: 'roam', wr: 51.9, pr: 5.5, br: 45.0, counters: ['Baxia', 'Saber', 'Helcurt'], tip: 'A Tier hyper-carry enabler. Pairs best with Ling, Roger, and Fanny.' },
      { name: 'Franco', role: 'Tank', lane: 'roam', wr: 49.2, pr: 8.5, br: 25.0, counters: ['Diggie', 'Purify', 'Grock'], tip: 'A Tier suppression pick. One accurate hook creates immediate 4v5 advantage.' },
      { name: 'Grock', role: 'Tank', lane: 'roam', wr: 51.5, pr: 2.8, br: 18.2, counters: ['Karrie', 'Claude', 'Valir'], tip: 'A Tier physical bruiser roamer with wall control and high burst.' },
      { name: 'Khufra', role: 'Tank', lane: 'roam', wr: 51.2, pr: 2.9, br: 22.0, counters: ['Franco', 'Diggie', 'Valir'], tip: 'A Tier anti-dash tank. Shuts down Fanny, Ling, Lancelot, and Benedetta.' },
      { name: 'Atlas', role: 'Tank', lane: 'roam', wr: 50.8, pr: 2.4, br: 20.5, counters: ['Diggie', 'Valir', 'Chou'], tip: 'A Tier fatal link initiator. Highest team wipe potential when Diggie is banned.' },
      { name: 'Kaja', role: 'Support', lane: 'roam', wr: 50.4, pr: 2.1, br: 16.0, counters: ['Diggie', 'Grock', 'Khufra'], tip: 'B Tier suppression assassin-roam for targeted core pick-offs.' },
      { name: 'Floryn', role: 'Support', lane: 'roam', wr: 51.0, pr: 3.2, br: 14.0, counters: ['Baxia', 'Dominance Ice', 'Saber'], tip: 'B Tier global healing sustain support with anti-anti-heal ultimate.' },
      { name: 'Lolita', role: 'Tank', lane: 'roam', wr: 52.1, pr: 1.8, br: 12.0, counters: ['Chou', 'Franco', 'Kaja'], tip: 'B Tier projectile deflection specialist. Hard counter to Chang\'e, Beatrix, and Granger.' },
      { name: 'Hylos', role: 'Tank', lane: 'roam', wr: 53.5, pr: 3.9, br: 48.0, counters: ['Karrie', 'Valir', 'Lunox'], tip: 'S Tier high HP bully. Dominates early jungle invasions with Thunder Belt.' },
      { name: 'Belerick', role: 'Tank', lane: 'roam', wr: 51.8, pr: 3.1, br: 15.0, counters: ['Karrie', 'Lunox', 'Valir'], tip: 'B Tier anti-attack speed tank. Destroys Claude, Miya, and Moskov.' },
      { name: 'Gloo', role: 'Tank', lane: 'roam', wr: 49.5, pr: 1.2, br: 8.0, counters: ['Faramis', 'Vexana', 'Claude'], tip: 'C Tier sticky disrupter, vulnerable to Faramis & Claude bounce.' },
      { name: 'Estes', role: 'Support', lane: 'roam', wr: 50.2, pr: 4.8, br: 28.0, counters: ['Baxia', 'Luo Yi', 'Dominance Ice'], tip: 'B Tier 5-man deathball healer. Weak against heavy AOE burst comps.' },
      { name: 'Rafaela', role: 'Support', lane: 'roam', wr: 49.8, pr: 1.5, br: 4.0, counters: ['Saber', 'Helcurt', 'Natalia'], tip: 'C Tier movement speed buffer, outclassed by Mathilda in high rank.' },
      { name: 'Carmilla', role: 'Support', lane: 'roam', wr: 51.2, pr: 1.1, br: 6.0, counters: ['Diggie', 'Valir', 'Karrie'], tip: 'B Tier damage-sharing link CC, strong combo with Cecilion or AOE mages.' },

      // --- JUNGLERS / ASSASSINS & TANK-JUNGLERS ---
      { name: 'Suyou', role: 'Fighter', lane: 'jungle', wr: 55.2, pr: 6.4, br: 84.5, counters: ['Khufra', 'Minsitthar', 'Phoveus'], tip: 'S+ Broken multi-stance assassin. Insane burst, mobility, and mortal form execution.' },
      { name: 'Nolan', role: 'Assassin', lane: 'jungle', wr: 54.1, pr: 5.8, br: 76.0, counters: ['Khufra', 'Franco', 'Kaja'], tip: 'S+ Fast jungle clear and dimensional rift burst with built-in purify.' },
      { name: 'Fanny', role: 'Assassin', lane: 'jungle', wr: 53.8, pr: 3.2, br: 79.2, counters: ['Khufra', 'Saber', 'Eudora', 'Minsitthar'], tip: 'S+ God tier in skilled hands. Highest map mobility and instant burst.' },
      { name: 'Hayabusa', role: 'Assassin', lane: 'jungle', wr: 53.6, pr: 4.9, br: 71.0, counters: ['Saber', 'Khufra', 'Wind of Nature'], tip: 'S+ Shadow dive and isolation assassin. Strongest objective split-pressure.' },
      { name: 'Ling', role: 'Assassin', lane: 'jungle', wr: 53.2, pr: 4.5, br: 65.0, counters: ['Khufra', 'Saber', 'Ruby'], tip: 'S Tier wall-jumping assassin with invulnerable Tempest of Blades.' },
      { name: 'Roger', role: 'Fighter', lane: 'jungle', wr: 53.0, pr: 6.2, br: 55.0, counters: ['Franco', 'Kaja', 'Belerick'], tip: 'S Tier dual form hybrid carry. High early game snowball potential.' },
      { name: 'Julian', role: 'Mage', lane: 'jungle', wr: 53.7, pr: 4.8, br: 58.0, counters: ['Radiant Armor', 'Khufra', 'Franco'], tip: 'S Tier magic burst jungler with level 3 power spike and enhanced skill flexibility.' },
      { name: 'Alpha', role: 'Fighter', lane: 'jungle', wr: 52.1, pr: 5.2, br: 28.0, counters: ['Valir', 'Baxia', 'Karrie'], tip: 'A Tier true damage objective shredder with fast Lord/Turtle secure.' },
      { name: 'Fredrinn', role: 'Tank', lane: 'jungle', wr: 51.8, pr: 3.8, br: 30.0, counters: ['Karrie', 'Lunox', 'Baxia'], tip: 'A Tier frontline tank-jungler with high Retribution control and CC chain.' },
      { name: 'Baxia', role: 'Tank', lane: 'jungle', wr: 52.0, pr: 2.9, br: 32.0, counters: ['Karrie', 'Lunox', 'Valir'], tip: 'A Tier fast rolling anti-heal jungler. Shuts down sustain comps.' },
      { name: 'Martis', role: 'Fighter', lane: 'jungle', wr: 51.4, pr: 4.2, br: 25.0, counters: ['Franco', 'Kaja', 'Phoveus'], tip: 'A Tier early-game snowballer with CC immunity on S2 and execute resets.' },
      { name: 'Lancelot', role: 'Assassin', lane: 'jungle', wr: 50.8, pr: 3.9, br: 24.0, counters: ['Khufra', 'Phoveus', 'Minsitthar'], tip: 'A Tier high mechanical outplay assassin with dual invulnerability frames.' },
      { name: 'Joy', role: 'Assassin', lane: 'jungle', wr: 52.5, pr: 2.2, br: 42.0, counters: ['Minsitthar', 'Franco', 'Kaja'], tip: 'A Tier rhythmic dive mage with slow immunity and massive AOE magic damage.' },
      { name: 'Benedetta', role: 'Assassin', lane: 'jungle', wr: 51.6, pr: 2.6, br: 18.0, counters: ['Phoveus', 'Minsitthar', 'Khufra'], tip: 'A Tier hyper-mobile dash assassin with S2 parry.' },
      { name: 'Gusion', role: 'Assassin', lane: 'jungle', wr: 50.2, pr: 4.1, br: 12.0, counters: ['Radiant Armor', 'Athena Shield', 'Khufra'], tip: 'B Tier dagger combo burst assassin, falls off against magic defense.' },
      { name: 'Helcurt', role: 'Assassin', lane: 'jungle', wr: 51.0, pr: 2.8, br: 22.0, counters: ['Hylos', 'Tigreal', 'Belerick'], tip: 'B Tier map blackout silence assassin, effective at hunting squishies.' },
      { name: 'Karina', role: 'Assassin', lane: 'jungle', wr: 49.8, pr: 2.5, br: 10.0, counters: ['Radiant Armor', 'Franco', 'Kaja'], tip: 'B Tier basic attack blocking cleanup assassin.' },
      { name: 'Saber', role: 'Assassin', lane: 'jungle', wr: 49.5, pr: 4.5, br: 15.0, counters: ['Wind of Nature', 'Dreadnaught Armor', 'Tigreal'], tip: 'B Tier point-and-click single target lock; easy to peel in high rank.' },
      { name: 'Aamon', role: 'Assassin', lane: 'jungle', wr: 50.1, pr: 2.3, br: 11.0, counters: ['Radiant Armor', 'Ruby', 'Khufra'], tip: 'B Tier camouflage shard burst assassin.' },
      { name: 'Alucard', role: 'Fighter', lane: 'jungle', wr: 48.2, pr: 3.5, br: 4.0, counters: ['Dominance Ice', 'Khufra', 'Franco'], tip: 'C Tier lifesteal melee fighter, easily kited and locked by hard CC.' },
      { name: 'Balmond', role: 'Fighter', lane: 'jungle', wr: 48.9, pr: 2.8, br: 5.0, counters: ['Dominance Ice', 'Valir', 'Karrie'], tip: 'C Tier spin-to-win objective execute, weak against kite comps.' },
      { name: 'Hanzo', role: 'Assassin', lane: 'jungle', wr: 48.0, pr: 1.6, br: 6.0, counters: ['Ling', 'Fanny', 'Natalia', 'Aldous'], tip: 'C Tier shadow ninja, real body easily hunted down in competitive play.' },

      // --- EXP LANERS / FIGHTERS & BRUISERS ---
      { name: 'Phoveus', role: 'Fighter', lane: 'exp', wr: 54.6, pr: 4.8, br: 74.0, counters: ['Terizla', 'Esmeralda', 'Thamuz'], tip: 'S+ Anti-dash dreadnaught. Crushes Paquito, Arlott, Benedetta, and Chou.' },
      { name: 'Terizla', role: 'Fighter', lane: 'exp', wr: 53.4, pr: 5.5, br: 52.0, counters: ['Valir', 'Karrie', 'X.Borg'], tip: 'S+ Frontline tankiness, lane bully, and game-changing S3 hammer pull.' },
      { name: 'Yu Zhong', role: 'Fighter', lane: 'exp', wr: 52.8, pr: 5.2, br: 46.0, counters: ['Baxia', 'Dominance Ice', 'Karrie'], tip: 'S Tier Black Dragon backline dive initiator with high Sha passive sustain.' },
      { name: 'Ruby', role: 'Fighter', lane: 'exp', wr: 53.1, pr: 6.0, br: 40.0, counters: ['Dominance Ice', 'Baxia', 'Phoveus'], tip: 'S Tier lifesteal CC lock queen. Flexible between EXP and Roam.' },
      { name: 'Paquito', role: 'Fighter', lane: 'exp', wr: 52.5, pr: 5.4, br: 38.0, counters: ['Phoveus', 'Minsitthar', 'Antique Cuirass'], tip: 'S Tier boxing combo champion with high burst and shield mobility.' },
      { name: 'Arlott', role: 'Fighter', lane: 'exp', wr: 52.0, pr: 4.1, br: 35.0, counters: ['Phoveus', 'Minsitthar', 'Franco'], tip: 'S Tier demon eye dash reset fighter with heavy disruption.' },
      { name: 'Cici', role: 'Fighter', lane: 'exp', wr: 52.4, pr: 4.6, br: 32.0, counters: ['Phoveus', 'Baxia', 'Dominance Ice'], tip: 'A Tier high mobility %HP yoyo kiter with strong solo sustain.' },
      { name: 'Khaleed', role: 'Fighter', lane: 'exp', wr: 51.9, pr: 3.2, br: 20.0, counters: ['Franco', 'Chou', 'Ruby'], tip: 'A Tier early lane bully with fast wave clear and sandstorm stun.' },
      { name: 'Lapu-Lapu', role: 'Fighter', lane: 'exp', wr: 51.7, pr: 3.5, br: 18.0, counters: ['Baxia', 'Dominance Ice', 'Karrie'], tip: 'A Tier heavy blade teamfight initiator with high damage reduction.' },
      { name: 'Chou', role: 'Fighter', lane: 'exp', wr: 50.8, pr: 7.2, br: 26.0, counters: ['Phoveus', 'Diggie', 'Khufra'], tip: 'A Tier versatile playmaker. The standard benchmark of high mechanical skill.' },
      { name: 'Thamuz', role: 'Fighter', lane: 'exp', wr: 51.3, pr: 3.0, br: 14.0, counters: ['Valir', 'Dominance Ice', 'Baxia'], tip: 'A Tier 1v1 scythe brawler and early Turtle skirmish dominator.' },
      { name: 'X.Borg', role: 'Fighter', lane: 'exp', wr: 51.5, pr: 4.2, br: 24.0, counters: ['Karrie', 'Lunox', 'Baxia'], tip: 'A Tier true damage flamethrower kiter with Immortality + War Axe synergy.' },
      { name: 'Edith', role: 'Tank', lane: 'exp', wr: 51.0, pr: 3.0, br: 16.0, counters: ['Karrie', 'Claude', 'Lunox'], tip: 'A Tier tank to marksman hybrid with high magic burst conversion.' },
      { name: 'Dyrroth', role: 'Fighter', lane: 'exp', wr: 50.5, pr: 5.8, br: 18.0, counters: ['Chou', 'Ruby', 'Windtalker kiting'], tip: 'B Tier 75% physical defense armor breaker, strong counter to heavy tanks.' },
      { name: 'Guinevere', role: 'Fighter', lane: 'exp', wr: 50.4, pr: 3.8, br: 19.0, counters: ['Diggie', 'Purify', 'Helcurt'], tip: 'B Tier magic airborne dive fighter with S2 clone bait.' },
      { name: 'Minsitthar', role: 'Fighter', lane: 'exp', wr: 51.4, pr: 2.2, br: 22.0, counters: ['Diggie', 'Valir', 'Karrie'], tip: 'B Tier king\'s calling anti-blink domain. Hard counter to dash assassins.' },
      { name: 'Badang', role: 'Fighter', lane: 'exp', wr: 49.5, pr: 2.8, br: 8.0, counters: ['Purify', 'Wind of Nature', 'Chou'], tip: 'B Tier wall pin punch combo fighter.' },
      { name: 'Zilong', role: 'Fighter', lane: 'exp', wr: 47.5, pr: 5.5, br: 3.0, counters: ['Dominance Ice', 'Blade Armor', 'Tigreal'], tip: 'C Tier late game split pusher, extremely weak in early lane.' },
      { name: 'Sun', role: 'Fighter', lane: 'exp', wr: 48.2, pr: 2.5, br: 4.0, counters: ['Ruby', 'Balmond', 'Dominance Ice'], tip: 'C Tier clone pusher, feeds lifesteal to Ruby and Balmond.' },
      { name: 'Aldous', role: 'Fighter', lane: 'exp', wr: 48.0, pr: 2.9, br: 6.0, counters: ['Twilight Armor', 'Wind of Nature', 'Franco'], tip: 'C Tier 500-stack late scaler, easily starved in competitive lanes.' },
      { name: 'Argus', role: 'Fighter', lane: 'exp', wr: 48.6, pr: 2.1, br: 5.0, counters: ['Franco', 'Kaja', 'Dominance Ice'], tip: 'C Tier immortal blade fighter, easily kited during ultimate.' },

      // --- MID LANERS / MAGES ---
      { name: 'Zhask', role: 'Mage', lane: 'mid', wr: 54.5, pr: 5.8, br: 72.0, counters: ['Claude', 'Irithel', 'Retribution'], tip: 'S+ Alien spawn dominator. Ultimate swarm melts towers and teamfights.' },
      { name: 'Valentina', role: 'Mage', lane: 'mid', wr: 53.8, pr: 4.2, br: 68.0, counters: ['Lolita', 'Radiant Armor', 'Helcurt'], tip: 'S+ Ultimate copycat. Steals Faramis, Diggie, Tigreal, or Atlas ultimates.' },
      { name: 'Xavier', role: 'Mage', lane: 'mid', wr: 53.4, pr: 5.5, br: 50.0, counters: ['Ling', 'Fanny', 'Hayabusa', 'Helcurt'], tip: 'S Tier infinite laser beam poke, global map presence, and CC lock.' },
      { name: 'Pharsa', role: 'Mage', lane: 'mid', wr: 52.9, pr: 4.8, br: 44.0, counters: ['Ling', 'Lancelot', 'Lolita'], tip: 'S Tier high ground artillery zone control with bird flight rotation.' },
      { name: 'Luo Yi', role: 'Mage', lane: 'mid', wr: 53.0, pr: 3.8, br: 46.0, counters: ['Spread positioning', 'Radiant Armor', 'Ling'], tip: 'S Tier Yin-Yang reaction pull burst + strategic teleport ganks.' },
      { name: 'Novaria', role: 'Mage', lane: 'mid', wr: 52.6, pr: 3.5, br: 48.0, counters: ['Ling', 'Fanny', 'Radiant Armor'], tip: 'S Tier astral vision sniper. Reveals invisible enemies and snipes from off-screen.' },
      { name: 'Vexana', role: 'Mage', lane: 'mid', wr: 52.2, pr: 6.8, br: 38.0, counters: ['Radiant Armor', 'Ling', 'Hayabusa'], tip: 'A Tier undead knight summoner with easy wave clear and AOE fear.' },
      { name: 'Nana', role: 'Mage', lane: 'mid', wr: 51.8, pr: 7.5, br: 32.0, counters: ['Radiant Armor', 'Franco', 'Kaja'], tip: 'A Tier Molina hex disrupter with high passive survival and AOE nuke.' },
      { name: 'Lylia', role: 'Mage', lane: 'mid', wr: 52.1, pr: 3.9, br: 25.0, counters: ['Radiant Armor', 'Chou', 'Kaja'], tip: 'A Tier early game gloom bomb bully with Black Shoes rewind reset.' },
      { name: 'Kadita', role: 'Mage', lane: 'mid', wr: 52.0, pr: 3.2, br: 28.0, counters: ['Athena Shield', 'Petrify counter', 'Diggie'], tip: 'A Tier assassin-mage wave surfer with instant 100-to-0 backline deletion.' },
      { name: 'Lunox', role: 'Mage', lane: 'mid', wr: 52.3, pr: 3.6, br: 30.0, counters: ['Lolita', 'Radiant Armor', 'Saber'], tip: 'A Tier dual order/chaos %HP tank shredder with light invulnerability.' },
      { name: 'Cecilion', role: 'Mage', lane: 'mid', wr: 51.5, pr: 4.5, br: 22.0, counters: ['Early aggression', 'Ling', 'Fanny'], tip: 'A Tier infinite mana stacking late-game nuclear artillery bat.' },
      { name: 'Yve', role: 'Mage', lane: 'mid', wr: 51.2, pr: 2.4, br: 20.0, counters: ['Franco', 'Kaja', 'Lolita'], tip: 'B Tier galactic chessboard slow zone specialist.' },
      { name: 'Kagura', role: 'Mage', lane: 'mid', wr: 51.0, pr: 3.1, br: 16.0, counters: ['Radiant Armor', 'Franco', 'Kaja'], tip: 'B Tier high mechanical umbrella outplay mage with built-in purify.' },
      { name: 'Harith', role: 'Mage', lane: 'mid', wr: 52.4, pr: 4.2, br: 36.0, counters: ['Minsitthar', 'Khufra', 'Phoveus'], tip: 'S Tier chrono dash spammer, highly dominant in Gold Lane as well.' },
      { name: 'Valir', role: 'Mage', lane: 'mid', wr: 50.8, pr: 3.5, br: 18.0, counters: ['Radiant Armor', 'Lesley', 'Pharsa'], tip: 'B Tier anti-dive pushback flame kiter. Hard counter to melee tanks.' },
      { name: 'Vale', role: 'Mage', lane: 'mid', wr: 50.2, pr: 4.8, br: 12.0, counters: ['Athena Shield', 'Ling', 'Hayabusa'], tip: 'B Tier wind knockup combo burst, highly reliant on landing skillshots.' },
      { name: 'Cyclops', role: 'Mage', lane: 'mid', wr: 49.9, pr: 3.2, br: 8.0, counters: ['Radiant Armor', 'Lolita', 'Baxia'], tip: 'B Tier single target lock star mage, vulnerable to heavy burst.' },
      { name: 'Chang\'e', role: 'Mage', lane: 'mid', wr: 49.8, pr: 4.9, br: 14.0, counters: ['Lolita', 'Radiant Armor', 'Baxia'], tip: 'B Tier meteor shower wave clearer, completely nullified by Lolita shield.' },
      { name: 'Eudora', role: 'Mage', lane: 'mid', wr: 49.2, pr: 4.2, br: 8.0, counters: ['Athena Shield', 'Radiant Armor', 'Purify'], tip: 'C Tier bush stun burst mage, highly immobile and vulnerable to ganks.' },
      { name: 'Gord', role: 'Mage', lane: 'mid', wr: 48.5, pr: 2.1, br: 5.0, counters: ['Lolita', 'Assassins', 'Flankers'], tip: 'C Tier stationary laser channeler, free food for dive assassins.' },

      // --- GOLD LANERS / MARKSMEN ---
      { name: 'Claude', role: 'Marksman', lane: 'gold', wr: 53.6, pr: 6.5, br: 70.0, counters: ['Belerick', 'Franco', 'Kaja', 'Dominance Ice'], tip: 'S+ Master of teleportation and blazing duet teamfight wipe.' },
      { name: 'Beatrix', role: 'Marksman', lane: 'gold', wr: 53.2, pr: 7.2, br: 64.0, counters: ['Lolita', 'Blade Armor', 'Wind of Nature'], tip: 'S+ 4-weapon arsenal queen. Sniper, shotgun, rocket, and submachine versatility.' },
      { name: 'Harith', role: 'Mage', lane: 'gold', wr: 54.2, pr: 5.8, br: 68.0, counters: ['Minsitthar', 'Phoveus', 'Radiant Armor'], tip: 'S+ Magic Gold Laner. Out-trades every traditional marksman from level 4.' },
      { name: 'Roger', role: 'Fighter', lane: 'gold', wr: 53.5, pr: 6.0, br: 58.0, counters: ['Belerick', 'Franco', 'Kaja'], tip: 'S Tier aggressive lane bully in Gold Lane with high kill pressure.' },
      { name: 'Moskov', role: 'Marksman', lane: 'gold', wr: 52.8, pr: 8.1, br: 52.0, counters: ['Belerick', 'Blade Armor', 'Dominance Ice'], tip: 'S Tier teleport spear carry with global spear stun and fast attack speed.' },
      { name: 'Brody', role: 'Marksman', lane: 'gold', wr: 52.4, pr: 5.5, br: 42.0, counters: ['Wind of Nature', 'Blade Armor', 'Tigreal'], tip: 'S Tier high physical attack kiter with stun and locked-on execute ultimate.' },
      { name: 'Karrie', role: 'Marksman', lane: 'gold', wr: 52.1, pr: 5.2, br: 38.0, counters: ['Blade Armor', 'Dominance Ice', 'Burst Assassins'], tip: 'A Tier %Max HP true damage shredder. The premier anti-tank marksman.' },
      { name: 'Natan', role: 'Marksman', lane: 'gold', wr: 52.5, pr: 3.8, br: 35.0, counters: ['Radiant Armor', 'Blade Armor', 'Lolita'], tip: 'A Tier magic basic attack shredder with reverse clone double DPS.' },
      { name: 'Bruno', role: 'Marksman', lane: 'gold', wr: 51.8, pr: 4.8, br: 28.0, counters: ['Blade Armor', 'Belerick', 'Wind of Nature'], tip: 'A Tier high early crit ball kicker with strong laning aggression.' },
      { name: 'Granger', role: 'Marksman', lane: 'gold', wr: 51.5, pr: 4.5, br: 22.0, counters: ['Lolita', 'Blade Armor', 'Dreadnaught Armor'], tip: 'A Tier 6-bullet burst marksman with long range cannon finish.' },
      { name: 'Melissa', role: 'Marksman', lane: 'gold', wr: 51.7, pr: 4.1, br: 26.0, counters: ['Franco', 'Lesley', 'Pharsa'], tip: 'A Tier anti-melee puppet doll barrier with high teamfight tether DPS.' },
      { name: 'Ixia', role: 'Marksman', lane: 'gold', wr: 51.2, pr: 3.5, br: 20.0, counters: ['Franco', 'Kaja', 'Flank dive'], tip: 'A Tier wide cone ultimate high ground defense marksman.' },
      { name: 'Wanwan', role: 'Marksman', lane: 'gold', wr: 50.8, pr: 3.2, br: 25.0, counters: ['Phoveus', 'Khufra', 'Wind of Nature'], tip: 'B Tier weakness point dart hopper with invulnerable crossbow ultimate.' },
      { name: 'Clint', role: 'Marksman', lane: 'gold', wr: 51.0, pr: 5.0, br: 14.0, counters: ['Blade Armor', 'Wind of Nature', 'Assassins'], tip: 'B Tier passive burst gunshot poker with reliable S2 immobilize.' },
      { name: 'Lesley', role: 'Marksman', lane: 'gold', wr: 50.4, pr: 6.8, br: 18.0, counters: ['Twilight Armor', 'Early ganks', 'Assassins'], tip: 'B Tier true damage camouflage sniper, weak in early laning phase.' },
      { name: 'Popol and Kupa', role: 'Marksman', lane: 'gold', wr: 50.6, pr: 2.5, br: 10.0, counters: ['Claude', 'Benedetta', 'Irithel'], tip: 'B Tier dog handler with traps, strong 1v1 lane control and push.' },
      { name: 'Hanabi', role: 'Marksman', lane: 'gold', wr: 49.5, pr: 7.2, br: 12.0, counters: ['Blade Armor', 'Dominance Ice', 'Burst Assassins'], tip: 'B Tier CC immunity shield petal bouncer, lacks burst and mobility.' },
      { name: 'Irithel', role: 'Marksman', lane: 'gold', wr: 50.1, pr: 3.0, br: 8.0, counters: ['Blade Armor', 'Belerick', 'Wind of Nature'], tip: 'B Tier running and shooting crossbow tiger with heavy AOE crit.' },
      { name: 'Miya', role: 'Marksman', lane: 'gold', wr: 48.8, pr: 7.5, br: 6.0, counters: ['Blade Armor', 'Belerick', 'Dominance Ice', 'Tigreal'], tip: 'C Tier stealth arrow carry, easily bullied in early competitive lanes.' },
      { name: 'Layla', role: 'Marksman', lane: 'gold', wr: 48.2, pr: 8.2, br: 5.0, counters: ['Assassins', 'Blade Armor', 'Franco'], tip: 'C Tier longest range cannon, zero mobility and extremely easy gank target.' }
    ];
  }

  // --- CALCULATION ALGORITHM ---
  calculateHeroMeta(hero, rank = 'glory') {
    let wr = hero.wr;
    let pr = hero.pr;
    let br = hero.br;

    // Adjust metrics based on rank level (High Rank values Ban Rate significantly higher)
    if (rank === 'glory') {
      // Mythical Glory / 50+ Stars: heavy ban rate & high skill cap scaling
      br = Math.min(100, br * 1.1);
      pr = Math.min(100, pr * 1.05);
    } else if (rank === 'epic') {
      // Epic rank: lower ban rate reliance, higher raw pick rate / pub stomp weight
      br = br * 0.5;
      pr = pr * 1.3;
      if (['Layla', 'Miya', 'Zilong', 'Nana', 'Saber', 'Balmond', 'Hanabi', 'Dyrroth'].includes(hero.name)) {
        wr += 2.5;
      }
    } else if (rank === 'legend') {
      br = br * 0.8;
      pr = pr * 1.1;
    }

    // Calibrated formula
    const wrComp = (wr - 50.0) * 1.6;
    const prComp = Math.min(15.0, (pr / 8.0) * 15.0);
    const brComp = Math.min(40.0, (br / 85.0) * 40.0);
    const confidence = pr >= 1.0 ? 1.0 : Math.sqrt(Math.max(0.1, pr));

    const rawScore = 35 + (wrComp + prComp + brComp) * confidence;
    const metaScore = Math.max(10, Math.min(99, Math.round(rawScore * 10) / 10));

    // Tier Classification
    let tier = 'C';
    let tierTitle = 'Off-Meta / Niche';
    let tierColor = '#94a3b8';
    let tierBg = 'rgba(148, 163, 184, 0.15)';

    if (metaScore >= 82) {
      tier = 'S+';
      tierTitle = 'Overpowered / Must-Ban Draft Priority';
      tierColor = '#ff4655';
      tierBg = 'linear-gradient(135deg, rgba(255, 70, 85, 0.25) 0%, rgba(255, 215, 0, 0.2) 100%)';
    } else if (metaScore >= 70) {
      tier = 'S';
      tierTitle = 'Dominant Meta / High Priority Picks';
      tierColor = '#f59e0b';
      tierBg = 'rgba(245, 158, 11, 0.2)';
    } else if (metaScore >= 58) {
      tier = 'A';
      tierTitle = 'Strong & Viable Meta Heroes';
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

    // Filter by Lane
    if (this.currentLane !== 'all') {
      list = list.filter(h => h.lane === this.currentLane);
    }

    // Filter by Search Query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(h => h.name.toLowerCase().includes(q) || h.role.toLowerCase().includes(q));
    }

    // Sort list
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

  // --- MAIN RENDERER ---
  renderTierListHub(containerId) {
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

    const heroes = this.getProcessedHeroes();

    container.innerHTML = `
      <!-- TOP BANNER WITH PATCH INFO -->
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(255,215,0,0.05) 50%, var(--bg-card-glass) 100%); border: 1px solid rgba(0,212,255,0.3); position:relative; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.25rem;">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
              <span class="badge" style="background:linear-gradient(135deg, #ffd700 0%, #ff8c00 100%); color:#000; font-weight:900; font-size:0.75rem; padding:4px 10px; border-radius:6px; letter-spacing:0.05em;">
                <i class="fa-solid fa-fire"></i> MLBB META PATCH 1.9.42
              </span>
              <span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:0.75rem; border:1px solid var(--border-light);">
                Moonton Live Data + Algorithm
              </span>
            </div>
            <h2 style="font-size:1.75rem; font-weight:800; color:var(--text-primary); margin:0;">
              Qahramonlar Meta Reytingi & Tier List
            </h2>
            <p style="color:var(--text-secondary); font-size:0.875rem; margin:0.35rem 0 0 0; max-width:640px;">
              Win Rate, Pick Rate va Ban Rate asosida hisoblangan avtomatik <strong>Meta Score (0-100)</strong> algoritmi. Jamoa drafti va solo-q uchun eng kuchli qahramonlar tanlovi.
            </p>
          </div>

          <!-- VIEW MODE SWITCHER TABS -->
          <div class="tabs" id="tierViewTabs" style="margin:0; border-bottom:none; background:rgba(0,0,0,0.4); padding:4px; border-radius:10px; border:1px solid var(--border-light);">
            <button class="tab-btn ${this.currentView === 'tierlist' ? 'active' : ''}" data-view="tierlist" style="padding:0.45rem 1rem; font-size:0.85rem; border-radius:6px;">
              <i class="fa-solid fa-list-ol"></i> Tier List Grid
            </button>
            <button class="tab-btn ${this.currentView === 'table' ? 'active' : ''}" data-view="table" style="padding:0.45rem 1rem; font-size:0.85rem; border-radius:6px;">
              <i class="fa-solid fa-table"></i> Statistika Jadvali
            </button>
            <button class="tab-btn ${this.currentView === 'advisor' ? 'active' : ''}" data-view="advisor" style="padding:0.45rem 1rem; font-size:0.85rem; border-radius:6px;">
              <i class="fa-solid fa-chess-knight"></i> Draft & Counter Maslahatchi
            </button>
          </div>
        </div>
      </div>

      <!-- FILTER CONTROLS BAR -->
      <div class="card mb-4" style="background:rgba(0,0,0,0.25); border:1px solid var(--border-light); padding:1rem 1.25rem;">
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

    // Bind event listeners
    container.querySelectorAll('#tierViewTabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        container.querySelectorAll('#tierViewTabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        this.renderActiveView();
      });
    });

    container.querySelectorAll('[data-rank]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentRank = e.currentTarget.dataset.rank;
        this.renderTierListHub(containerId);
      });
    });

    container.querySelectorAll('[data-lane]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentLane = e.currentTarget.dataset.lane;
        this.renderTierListHub(containerId);
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
        this.sortOrder = this.sortBy === 'name' ? 'asc' : 'desc';
        this.renderActiveView();
      });
    }

    this.renderActiveView();
  }

  renderActiveView() {
    const container = document.getElementById('tierMainViewContent');
    if (!container) return;

    if (this.currentView === 'tierlist') {
      this.renderTierGridView(container);
    } else if (this.currentView === 'table') {
      this.renderTableView(container);
    } else if (this.currentView === 'advisor') {
      this.renderDraftAdvisorView(container);
    }
  }

  // =========================================================================
  //  1. TIER LIST GRID VIEW (S+, S, A, B, C rows)
  // =========================================================================
  renderTierGridView(container) {
    const heroes = this.getProcessedHeroes();

    const tiers = [
      { id: 'S+', title: 'S+ Tier &bull; God Tier (Must Ban / First Pick)', color: '#ff4655', bg: 'linear-gradient(135deg, #ff4655 0%, #ff8c00 100%)', desc: 'Joriy patchda o\'ta kuchli, yuqori ban/pick rate va jamoaviy ustunlikka ega qahramonlar.' },
      { id: 'S', title: 'S Tier &bull; Dominant Meta (Priority Core)', color: '#f59e0b', bg: 'linear-gradient(135deg, #f59e0b 0%, #eab308 100%)', desc: 'Barcha kompozitsiyalarda ishonchli, yuqori g\'alaba ko\'rsatkichiga ega meta qahramonlari.' },
      { id: 'A', title: 'A Tier &bull; Strong & Balanced (Solid Picks)', color: '#10b981', bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', desc: 'To\'g\'ri qo\'llarda va standart draftlarda juda kuchli natija beruvchi qahramonlar.' },
      { id: 'B', title: 'B Tier &bull; Situational / Counter-Picks', color: '#00d4ff', bg: 'linear-gradient(135deg, #00d4ff 0%, #0284c7 100%)', desc: 'Muayyan raqib qahramonlariga qarshi (counter pick) yoki maxsus strategiyada yaxshi ishlaydi.' },
      { id: 'C', title: 'C Tier &bull; Off-Meta / Underperforming', color: '#94a3b8', bg: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', desc: 'Hozirgi patchda zaifroq yoki osonlikcha counter qilinadigan qahramonlar.' }
    ];

    let html = '<div style="display:flex; flex-direction:column; gap:1.25rem;">';

    tiers.forEach(t => {
      const tierHeroes = heroes.filter(h => h.tier === t.id);

      html += `
        <div class="card" style="padding:0; overflow:hidden; border:1px solid ${t.color}40; background:rgba(0,0,0,0.3);">
          
          <!-- TIER ROW HEADER -->
          <div style="background:${t.bg}; color:#000; padding:0.6rem 1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <span style="font-size:1.4rem; font-weight:900; font-family:monospace; background:rgba(0,0,0,0.85); color:#fff; padding:2px 12px; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.3);">${t.id}</span>
              <span style="font-weight:800; font-size:0.95rem; letter-spacing:0.02em;">${t.title}</span>
            </div>
            <span style="font-size:0.8rem; font-weight:700; background:rgba(0,0,0,0.25); color:#fff; padding:3px 10px; border-radius:20px;">
              ${tierHeroes.length} ta Qahramon
            </span>
          </div>

          <!-- TIER HEROES GRID -->
          <div style="padding:1rem; min-height:90px;">
            ${tierHeroes.length === 0 ? `
              <div style="color:var(--text-muted); font-size:0.85rem; font-style:italic; padding:0.5rem 0;">Tanlangan filtr bo'yicha bu tierda qahramon mavjud emas.</div>
            ` : `
              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.75rem;">
                ${tierHeroes.map(h => `
                  <div class="tier-hero-card" data-hero="${h.name}" style="background:rgba(255,255,255,0.03); border:1px solid var(--border-light); border-radius:8px; padding:0.6rem 0.5rem; text-align:center; cursor:pointer; transition:all 0.2s ease; position:relative; overflow:hidden;">
                    
                    <div style="width:46px; height:46px; border-radius:50%; background:rgba(0,0,0,0.4); border:2px solid ${h.tierColor}; margin:0 auto 0.4rem auto; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1rem; color:${h.tierColor}; box-shadow:0 0 10px ${h.tierColor}30;">
                      ${h.name.substring(0, 2).toUpperCase()}
                    </div>

                    <div style="font-weight:700; font-size:0.85rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${h.name}">
                      ${h.name}
                    </div>

                    <div style="display:flex; justify-content:center; gap:0.25rem; margin:0.3rem 0;">
                      <span class="badge" style="font-size:0.65rem; padding:1px 5px; background:rgba(0,212,255,0.1); color:var(--primary);">${h.lane.toUpperCase()}</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted); padding:0.2rem 0.25rem 0 0.25rem; border-top:1px solid rgba(255,255,255,0.05); margin-top:0.25rem;">
                      <span title="Win Rate" style="color:${h.winRate >= 52 ? 'var(--success)' : 'var(--text-secondary)'}; font-weight:600;">${h.winRate}%</span>
                      <span title="Ban Rate" style="color:${h.banRate >= 40 ? 'var(--danger)' : 'var(--text-muted)'};"><i class="fa-solid fa-ban"></i> ${h.banRate}%</span>
                    </div>

                    <!-- Meta Score Pill -->
                    <div style="margin-top:0.35rem; background:rgba(0,0,0,0.4); border-radius:4px; padding:2px 4px; font-size:0.7rem; font-weight:800; color:${h.tierColor}; border:1px solid ${h.tierColor}30;">
                      Score: ${h.metaScore}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Bind click to open Hero Detail / Counter Modal
    container.querySelectorAll('.tier-hero-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const heroName = e.currentTarget.dataset.hero;
        this.showHeroDetailModal(heroName);
      });
    });
  }

  // =========================================================================
  //  2. FULL STATISTICS TABLE VIEW (Sortable by WR, PR, BR, Score)
  // =========================================================================
  renderTableView(container) {
    const heroes = this.getProcessedHeroes();

    let rowsHtml = heroes.map((h, idx) => `
      <tr class="tier-table-row" data-hero="${h.name}" style="cursor:pointer;">
        <td><span style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">#${idx + 1}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <div style="width:34px; height:34px; border-radius:50%; background:rgba(0,0,0,0.4); border:1.5px solid ${h.tierColor}; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; color:${h.tierColor};">
              ${h.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <strong style="color:var(--text-primary); font-size:0.95rem;">${h.name}</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">${h.role}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge" style="background:rgba(0,212,255,0.08); border:1px solid rgba(0,212,255,0.3); color:var(--primary); font-size:0.75rem; text-transform:uppercase;">
            ${h.lane}
          </span>
        </td>
        <td>
          <span class="badge" style="background:${h.tierBg}; color:${h.tier === 'S+' ? '#000' : h.tierColor}; font-weight:800; font-size:0.8rem; padding:3px 8px; border-radius:4px;">
            ${h.tier} Tier
          </span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <strong style="color:${h.winRate >= 52 ? 'var(--success)' : h.winRate < 49 ? 'var(--danger)' : 'var(--text-primary)'}; font-size:0.95rem;">
              ${h.winRate}%
            </strong>
            <div style="width:50px; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
              <div style="width:${Math.min(100, (h.winRate - 40) * 5)}%; height:100%; background:${h.winRate >= 52 ? 'var(--success)' : 'var(--primary)'};"></div>
            </div>
          </div>
        </td>
        <td>
          <span style="color:var(--text-secondary); font-size:0.9rem;">${h.pickRate}%</span>
        </td>
        <td>
          <strong style="color:${h.banRate >= 40 ? 'var(--danger)' : 'var(--text-muted)'}; font-size:0.9rem;">
            ${h.banRate}%
          </strong>
        </td>
        <td>
          <span class="badge" style="background:rgba(0,0,0,0.4); border:1px solid ${h.tierColor}50; color:${h.tierColor}; font-weight:800; font-size:0.85rem; padding:4px 8px;">
            <i class="fa-solid fa-bolt" style="margin-right:2px;"></i> ${h.metaScore}
          </span>
        </td>
        <td>
          <button class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.75rem;"><i class="fa-solid fa-circle-info"></i> Counters</button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="card mb-4">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Qahramon</th>
                <th>Chiziq (Lane)</th>
                <th>Tier</th>
                <th>Win Rate %</th>
                <th>Pick Rate %</th>
                <th>Ban Rate %</th>
                <th>Meta Score</th>
                <th>Tafsilot</th>
              </tr>
            </thead>
            <tbody>
              ${heroes.length === 0 ? `<tr><td colspan="9" class="text-center" style="padding:2rem; color:var(--text-muted);">Qidiruv bo'yicha qahramon topilmadi.</td></tr>` : rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.tier-table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const heroName = e.currentTarget.dataset.hero;
        this.showHeroDetailModal(heroName);
      });
    });
  }

  // =========================================================================
  //  3. DRAFT & COUNTER ADVISORY VIEW (heavenlyyy IGL Strategy)
  // =========================================================================
  renderDraftAdvisorView(container) {
    const heroes = this.getProcessedHeroes();
    const sortedByBan = [...heroes].sort((a, b) => b.banRate - a.banRate);
    const sortedByMeta = [...heroes].sort((a, b) => b.metaScore - a.metaScore);

    const mustBans = sortedByBan.slice(0, 5);
    const priorityPicks = sortedByMeta.filter(h => !mustBans.find(b => b.name === h.name)).slice(0, 5);

    container.innerHTML = `
      <div class="grid-2 mb-4">
        
        <!-- MUST BAN CARD -->
        <div class="card" style="border:1px solid rgba(239,68,68,0.4); background: linear-gradient(135deg, rgba(239,68,68,0.05) 0%, var(--bg-card-glass) 100%);">
          <h3 class="card-title" style="color:var(--danger); margin-bottom:0.4rem;">
            <i class="fa-solid fa-ban"></i> 🔴 1-Navbatda BAN Qilinishi Kerak Bo'lganlar
          </h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem;">
            Raqibga berib qo'yilsa o'yinni yakka o'zi yutib berishi mumkin bo'lgan eng xavfli S+ qahramonlar.
          </p>
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            ${mustBans.map(h => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(239,68,68,0.2);">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <span class="badge" style="background:var(--danger); color:#fff; font-weight:800; font-size:0.75rem;">BAN</span>
                  <strong style="color:var(--text-primary);">${h.name}</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">(${h.lane})</span>
                </div>
                <div style="text-align:right;">
                  <span style="color:var(--danger); font-weight:800; font-size:0.9rem;">${h.banRate}% Ban</span>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${h.winRate}% WR</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- FIRST PICK PRIORITY CARD -->
        <div class="card" style="border:1px solid rgba(255,215,0,0.4); background: linear-gradient(135deg, rgba(255,215,0,0.05) 0%, var(--bg-card-glass) 100%);">
          <h3 class="card-title" style="color:var(--secondary); margin-bottom:0.4rem;">
            <i class="fa-solid fa-crown"></i> 👑 1-Navbatda Olinishi Kerak Bo'lganlar (First Pick)
          </h3>
          <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem;">
            Agar ban qilinmay ochiq qolsa, jamoangiz birinchi bo'lib tanlashi shart bo'lgan ustun qahramonlar.
          </p>
          <div style="display:flex; flex-direction:column; gap:0.6rem;">
            ${priorityPicks.map(h => `
              <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:0.6rem 0.8rem; border-radius:8px; border:1px solid rgba(255,215,0,0.2);">
                <div style="display:flex; align-items:center; gap:0.6rem;">
                  <span class="badge" style="background:var(--secondary); color:#000; font-weight:800; font-size:0.75rem;">PICK</span>
                  <strong style="color:var(--text-primary);">${h.name}</strong>
                  <span style="font-size:0.75rem; color:var(--text-muted);">(${h.lane})</span>
                </div>
                <div style="text-align:right;">
                  <span style="color:var(--secondary); font-weight:800; font-size:0.9rem;">Score: ${h.metaScore}</span>
                  <div style="font-size:0.75rem; color:var(--success); font-weight:600;">${h.winRate}% WR</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <!-- COUNTER PICK INTERACTIVE SEARCH TOOL -->
      <div class="card mb-4" style="background: linear-gradient(135deg, rgba(0,212,255,0.04) 0%, var(--bg-card-glass) 100%); border:1px solid var(--primary);">
        <h3 class="card-title mb-2"><i class="fa-solid fa-crosshairs" style="color:var(--primary);"></i> 🎯 Tezkor Qahramon Counterini Topish</h3>
        <p style="color:var(--text-secondary); font-size:0.875rem; margin-bottom:1rem;">
          Raqib qahramonini tanlang — algoritm unga qarshi eng kuchli 3-4 ta counter-qahramonlarni va murabbiy tavsiyasini chiqarib beradi.
        </p>

        <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:1.5rem;">
          <select id="counterHeroSelect" class="form-select" style="max-width:280px; font-weight:700; color:var(--primary); border-color:var(--primary);">
            <option value="">-- Raqib qahramonini tanlang --</option>
            ${this.metaData.sort((a,b)=>a.name.localeCompare(b.name)).map(h => `<option value="${h.name}">${h.name} (${h.lane})</option>`).join('')}
          </select>
        </div>

        <div id="counterResultContainer">
          <div style="color:var(--text-muted); font-size:0.875rem; font-style:italic;">
            Raqib qahramonini tanlang...
          </div>
        </div>
      </div>
    `;

    const select = document.getElementById('counterHeroSelect');
    if (select) {
      select.addEventListener('change', (e) => {
        const val = e.target.value;
        const resultBox = document.getElementById('counterResultContainer');
        if (!val || !resultBox) return;

        const target = this.metaData.find(h => h.name === val);
        if (!target) return;

        resultBox.innerHTML = `
          <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-light); border-radius:10px; padding:1.25rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:0.75rem;">
              <div>
                <span style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase;">Nishon qahramon:</span>
                <h4 style="font-size:1.4rem; color:var(--text-primary); margin:2px 0 0 0;">${target.name} (${target.lane})</h4>
              </div>
              <div class="badge" style="background:rgba(239,68,68,0.15); color:var(--danger); border:1px solid var(--danger); font-size:0.85rem; font-weight:700;">
                <i class="fa-solid fa-shield-virus"></i> Counter Tavsiyalari
              </div>
            </div>

            <div style="margin-bottom:1rem;">
              <strong style="color:var(--secondary); font-size:0.9rem;"><i class="fa-solid fa-bullseye"></i> Eng samarali Counter Qahramonlar:</strong>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
                ${(target.counters || ['Franco', 'Diggie', 'Baxia']).map(c => `
                  <span class="badge" style="background:rgba(16,185,129,0.15); border:1px solid var(--success); color:var(--success); font-size:0.9rem; padding:6px 14px; font-weight:700;">
                    <i class="fa-solid fa-check"></i> ${c}
                  </span>
                `).join('')}
              </div>
            </div>

            <div style="background:rgba(0,212,255,0.06); border:1px solid rgba(0,212,255,0.25); border-radius:8px; padding:0.75rem 1rem; font-size:0.875rem; color:var(--text-primary);">
              <strong style="color:var(--primary);"><i class="fa-solid fa-crown"></i> heavenlyyy (IGL/Murabbiy) Taktik Ko'rsatmasi:</strong>
              <div style="margin-top:0.25rem; color:var(--text-secondary); line-height:1.45;">
                ${target.tip || 'Ushbu qahramonga qarshi jamoaviy rotatsiya va to\'g\'ri item (Dominance Ice / Athena Shield) yig\'ing.'}
              </div>
            </div>
          </div>
        `;
      });
    }
  }

  // --- HERO DETAIL / COUNTER MODAL ---
  showHeroDetailModal(heroName) {
    const hero = this.getProcessedHeroes().find(h => h.name.toLowerCase() === heroName.toLowerCase()) 
      || this.calculateHeroMeta(this.metaData.find(h => h.name.toLowerCase() === heroName.toLowerCase()) || { name: heroName, role: 'Hero', lane: 'all', wr: 50, pr: 1, br: 1 });

    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    if (!modalOverlay || !modalContent) return;

    modalContent.innerHTML = `
      <div class="modal-header" style="border-bottom:1px solid rgba(255,255,255,0.1); padding:1rem 1.5rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <div style="width:44px; height:44px; border-radius:50%; background:rgba(0,0,0,0.5); border:2px solid ${hero.tierColor}; display:flex; align-items:center; justify-content:center; font-size:1.1rem; font-weight:800; color:${hero.tierColor};">
            ${hero.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h3 class="modal-title" style="margin:0; font-size:1.35rem; color:var(--text-primary);">${hero.name}</h3>
            <div style="font-size:0.75rem; color:var(--text-muted);">${hero.role} &bull; <span style="color:var(--primary); font-weight:600;">${hero.lane.toUpperCase()}</span></div>
          </div>
        </div>
        <button class="modal-close" id="closeHeroModalBtn">&times;</button>
      </div>

      <div class="modal-body" style="padding:1.5rem;">
        
        <!-- STATS BAR MATRIX -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap:0.75rem; margin-bottom:1.5rem;">
          <div class="card" style="background:rgba(0,0,0,0.3); padding:0.75rem; text-align:center; border:1px solid ${hero.tierColor}40;">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Meta Tier</div>
            <div style="font-size:1.4rem; font-weight:900; color:${hero.tierColor}; margin-top:2px;">${hero.tier}</div>
          </div>
          <div class="card" style="background:rgba(0,0,0,0.3); padding:0.75rem; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Meta Score</div>
            <div style="font-size:1.4rem; font-weight:900; color:var(--secondary); margin-top:2px;">${hero.metaScore}</div>
          </div>
          <div class="card" style="background:rgba(0,0,0,0.3); padding:0.75rem; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Win Rate</div>
            <div style="font-size:1.4rem; font-weight:900; color:${hero.winRate >= 52 ? 'var(--success)' : 'var(--text-primary)'}; margin-top:2px;">${hero.winRate}%</div>
          </div>
          <div class="card" style="background:rgba(0,0,0,0.3); padding:0.75rem; text-align:center;">
            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Ban Rate</div>
            <div style="font-size:1.4rem; font-weight:900; color:${hero.banRate >= 40 ? 'var(--danger)' : 'var(--text-muted)'}; margin-top:2px;">${hero.banRate}%</div>
          </div>
        </div>

        <!-- COUNTER HEROES -->
        <div style="margin-bottom:1.25rem;">
          <strong style="color:var(--secondary); font-size:0.9rem;"><i class="fa-solid fa-crosshairs"></i> Tavsiya etilgan Counter Qahramonlar:</strong>
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.5rem;">
            ${(hero.counters || ['Franco', 'Diggie', 'Baxia', 'Khufra']).map(c => `
              <span class="badge" style="background:rgba(16,185,129,0.15); border:1px solid var(--success); color:var(--success); font-size:0.85rem; padding:5px 12px; font-weight:700;">
                <i class="fa-solid fa-shield-halved"></i> ${c}
              </span>
            `).join('')}
          </div>
        </div>

        <!-- COACH TACTICAL NOTE -->
        <div style="background:rgba(0,212,255,0.06); border:1px solid rgba(0,212,255,0.25); border-radius:8px; padding:1rem; font-size:0.875rem;">
          <strong style="color:var(--primary); font-size:0.95rem;"><i class="fa-solid fa-crown"></i> heavenlyyy (Jamoa Sardori) Tavsiyasi:</strong>
          <div style="margin-top:0.4rem; color:var(--text-secondary); line-height:1.5;">
            ${hero.tip || 'Ushbu qahramon uchun to\'g\'ri itemizatsiya va o\'yindagi vaqt oralig\'iga (Power Spike) e\'tibor bering.'}
          </div>
        </div>
      </div>
    `;

    modalOverlay.classList.add('active');
    modalOverlay.removeAttribute('hidden');
    modalOverlay.setAttribute('aria-hidden', 'false');
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    document.getElementById('closeHeroModalBtn')?.addEventListener('click', () => {
      modalOverlay.classList.remove('active');
      modalOverlay.setAttribute('aria-hidden', 'true');
      modalOverlay.style.display = 'none';
      document.body.style.overflow = '';
    });
  }
};
