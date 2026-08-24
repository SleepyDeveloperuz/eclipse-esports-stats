window.DataStore = class DataStore {
  constructor() {
    this.PLAYERS_KEY = 'eclipse_players';
    this.MATCHES_KEY = 'eclipse_matches';
    this.HEROES_KEY = 'eclipse_heroes';
    
    // Seed default 5 players if brand new setup
    if (this.getPlayers().length === 0 && !localStorage.getItem('eclipse_has_initialized')) {
      this.seedDefaultRoster();
    }
  }

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  seedDefaultRoster() {
    const defaultPlayerNames = ['Viper', 'Shadow', 'Mystic', 'Bullet', 'Titan', 'Apex'];
    const players = defaultPlayerNames.map(name => ({
      id: this.generateId(),
      name: name,
      createdAt: new Date().toISOString()
    }));
    this.savePlayers(players);

    // Seed 2 sample matches so new viewers on Vercel see full stats
    const pViper = players[0].id;
    const pShadow = players[1].id;
    const pMystic = players[2].id;
    const pBullet = players[3].id;
    const pTitan = players[4].id;
    const pApex = players[5].id;

    const sampleMatches = [
      {
        id: this.generateId(),
        date: "2026-08-22",
        matchType: "tournament",
        result: "win",
        durationSeconds: 980,
        durationFormatted: "16m 20s",
        teamTurtles: 3,
        teamLords: 2,
        teamTurrets: 9,
        notes: "MPL Qualifier Semifinals — Clean macro & Lord execution",
        playerStats: [
          { playerId: pShadow, rolePlayed: "EXP Laner", heroUsed: "Paquito", kills: 6, deaths: 1, assists: 7, inGameScore: 12.0, damageDealt: 54000, damageReceived: 29000, turretDamage: 4500, teamfightParticipation: 70, goldEarned: 11500, medal: "gold" },
          { playerId: pViper, rolePlayed: "Jungler", heroUsed: "Ling", kills: 11, deaths: 0, assists: 5, inGameScore: 15.0, damageDealt: 82000, damageReceived: 18000, turretDamage: 3000, teamfightParticipation: 85, goldEarned: 14000, medal: "mvp", savage: true },
          { playerId: pMystic, rolePlayed: "Mid Laner", heroUsed: "Xavier", kills: 5, deaths: 2, assists: 11, inGameScore: 10.5, damageDealt: 68000, damageReceived: 19000, turretDamage: 2200, teamfightParticipation: 80, goldEarned: 11000, medal: "silver" },
          { playerId: pBullet, rolePlayed: "Gold Laner", heroUsed: "Claude", kills: 7, deaths: 1, assists: 6, inGameScore: 11.8, damageDealt: 62000, damageReceived: 14000, turretDamage: 7500, teamfightParticipation: 70, goldEarned: 13000, medal: "gold" },
          { playerId: pTitan, rolePlayed: "Roamer", heroUsed: "Tigreal", kills: 1, deaths: 2, assists: 15, inGameScore: 10.8, damageDealt: 16000, damageReceived: 72000, turretDamage: 500, teamfightParticipation: 90, goldEarned: 9000, medal: "gold" }
        ],
        substitutes: [pApex],
        createdAt: new Date().toISOString()
      },
      {
        id: this.generateId(),
        date: "2026-08-23",
        matchType: "scrim",
        result: "win",
        durationSeconds: 1120,
        durationFormatted: "18m 40s",
        teamTurtles: 2,
        teamLords: 1,
        teamTurrets: 8,
        notes: "Pro Scrim vs Blacklist Academy — Late game teamfight win",
        playerStats: [
          { playerId: pShadow, rolePlayed: "EXP Laner", heroUsed: "Ruby", kills: 4, deaths: 2, assists: 9, inGameScore: 11.0, damageDealt: 49000, damageReceived: 31000, turretDamage: 4000, teamfightParticipation: 65, goldEarned: 11000, medal: "gold" },
          { playerId: pViper, rolePlayed: "Jungler", heroUsed: "Hayabusa", kills: 10, deaths: 1, assists: 6, inGameScore: 14.0, damageDealt: 76000, damageReceived: 18500, turretDamage: 2800, teamfightParticipation: 80, goldEarned: 13500, medal: "mvp", maniac: true },
          { playerId: pMystic, rolePlayed: "Mid Laner", heroUsed: "Pharsa", kills: 6, deaths: 1, assists: 10, inGameScore: 12.0, damageDealt: 73000, damageReceived: 16000, turretDamage: 2000, teamfightParticipation: 80, goldEarned: 12000, medal: "gold" },
          { playerId: pBullet, rolePlayed: "Gold Laner", heroUsed: "Beatrix", kills: 8, deaths: 0, assists: 4, inGameScore: 13.5, damageDealt: 71000, damageReceived: 13000, turretDamage: 8000, teamfightParticipation: 70, goldEarned: 14000, medal: "gold" },
          { playerId: pApex, rolePlayed: "Roamer", heroUsed: "Mathilda", kills: 1, deaths: 1, assists: 16, inGameScore: 11.5, damageDealt: 19000, damageReceived: 46000, turretDamage: 800, teamfightParticipation: 85, goldEarned: 9500, medal: "silver" }
        ],
        substitutes: [pTitan],
        createdAt: new Date().toISOString()
      }
    ];

    this.saveMatches(sampleMatches);
    localStorage.setItem('eclipse_has_initialized', 'true');
  }

  // --- PLAYERS ---
  getPlayers() {
    const data = localStorage.getItem(this.PLAYERS_KEY);
    return data ? JSON.parse(data) : [];
  }

  savePlayers(players) {
    localStorage.setItem(this.PLAYERS_KEY, JSON.stringify(players));
  }

  addPlayer(name) {
    const players = this.getPlayers();
    const newPlayer = {
      id: this.generateId(),
      name: name,
      createdAt: new Date().toISOString()
    };
    players.push(newPlayer);
    this.savePlayers(players);
    return newPlayer;
  }

  updatePlayer(id, name) {
    const players = this.getPlayers();
    const index = players.findIndex(p => p.id === id);
    if (index !== -1) {
      players[index].name = name;
      this.savePlayers(players);
      return players[index];
    }
    return null;
  }

  deletePlayer(id) {
    const players = this.getPlayers();
    const filtered = players.filter(p => p.id !== id);
    this.savePlayers(filtered);
  }

  // --- MATCHES ---
  getMatches() {
    const data = localStorage.getItem(this.MATCHES_KEY);
    return data ? JSON.parse(data) : [];
  }

  saveMatches(matches) {
    localStorage.setItem(this.MATCHES_KEY, JSON.stringify(matches));
  }

  addMatch(matchObj) {
    const matches = this.getMatches();
    matchObj.id = this.generateId();
    if (!matchObj.createdAt) {
      matchObj.createdAt = new Date().toISOString();
    }
    matches.push(matchObj);
    this.saveMatches(matches);
    return matchObj;
  }

  updateMatch(id, matchObj) {
    const matches = this.getMatches();
    const index = matches.findIndex(m => m.id === id);
    if (index !== -1) {
      matchObj.id = id;
      matches[index] = matchObj;
      this.saveMatches(matches);
      return matchObj;
    }
    return null;
  }

  deleteMatch(id) {
    const matches = this.getMatches();
    const filtered = matches.filter(m => m.id !== id);
    this.saveMatches(filtered);
  }

  // --- FILTERS ---
  getMatchesByDateRange(startDate, endDate) {
    const matches = this.getMatches();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    return matches.filter(m => {
      const matchDate = new Date(m.date).getTime();
      return matchDate >= start && matchDate <= end;
    });
  }

  getMatchesForWeek(dateString) {
    const date = new Date(dateString);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    
    monday.setHours(0,0,0,0);
    sunday.setHours(23,59,59,999);

    return this.getMatchesByDateRange(monday, sunday);
  }

  getMatchesForMonth(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return this.getMatchesByDateRange(start, end);
  }

  getMatchesForYear(year) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31, 23, 59, 59, 999);
    return this.getMatchesByDateRange(start, end);
  }

  // --- DATA MANAGEMENT ---
  exportData() {
    return JSON.stringify({
      players: this.getPlayers(),
      matches: this.getMatches(),
      heroes: localStorage.getItem(this.HEROES_KEY) ? JSON.parse(localStorage.getItem(this.HEROES_KEY)) : [],
      training_progress: localStorage.getItem('mlbb-jamoa-dasturi-progress') ? JSON.parse(localStorage.getItem('mlbb-jamoa-dasturi-progress')) : {}
    }, null, 2);
  }

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.players) this.savePlayers(data.players);
      if (data.matches) this.saveMatches(data.matches);
      if (data.heroes) localStorage.setItem(this.HEROES_KEY, JSON.stringify(data.heroes));
      if (data.training_progress) localStorage.setItem('mlbb-jamoa-dasturi-progress', JSON.stringify(data.training_progress));
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  }

  clearAll() {
    localStorage.removeItem(this.PLAYERS_KEY);
    localStorage.removeItem(this.MATCHES_KEY);
    localStorage.removeItem(this.HEROES_KEY);
    localStorage.removeItem('eclipse_has_initialized');
    localStorage.removeItem('eclipse_last_backup');
    localStorage.removeItem('mlbb-jamoa-dasturi-progress');
  }
};
