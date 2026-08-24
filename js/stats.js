window.StatsEngine = class StatsEngine {
  constructor(dataStore) {
    this.db = dataStore;
  }

  static ROLES = ['EXP Laner', 'Jungler', 'Mid Laner', 'Gold Laner', 'Roamer'];

  static ROLE_ICONS = {
    'EXP Laner': 'fa-shield',
    'Jungler': 'fa-bolt',
    'Mid Laner': 'fa-wand-magic-sparkles',
    'Gold Laner': 'fa-coins',
    'Roamer': 'fa-compass'
  };

  static ROLE_COLORS = {
    'EXP Laner': '#f59e0b',  // amber
    'Jungler': '#a855f7',    // purple
    'Mid Laner': '#00d4ff',   // cyan
    'Gold Laner': '#ffd700',  // gold
    'Roamer': '#10b981'      // green
  };

  static formatLargeNumber(num) {
    if (num === null || num === undefined) return '0';
    const n = Number(num);
    if (isNaN(n)) return '0';
    if (n >= 1000000000) return (n / 1000000000).toFixed(2) + 'B';
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  static formatDateFormatted(dateString) {
    if (!dateString) return '-';
    try {
      const d = new Date(dateString + 'T00:00:00');
      const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
      return d.toLocaleDateString('en-US', options);
    } catch(e) {
      return dateString;
    }
  }

  static formatDuration(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return '-';
    const total = Math.round(Number(totalSeconds));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => (n < 10 ? '0' : '') + n;

    if (hrs > 0) {
      return `${hrs}h ${pad(mins)}m ${pad(secs)}s`;
    }
    return `${mins}m ${pad(secs)}s`;
  }

  static parseDurationToSeconds(durationStr) {
    if (!durationStr) return 0;
    if (typeof durationStr === 'number') return durationStr;
    const parts = String(durationStr).trim().split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      return (mins * 60) + secs;
    }
    const mins = parseInt(durationStr) || 0;
    return mins * 60;
  }

  getTeamStats(matches) {
    let wins = 0, losses = 0;
    let totalTurtles = 0, totalLords = 0, totalTurrets = 0;
    let totalSavages = 0, totalManiacs = 0;
    let savageList = [];
    let maniacList = [];
    let teamTotalDamageDealt = 0;
    let teamTotalDamageReceived = 0;
    let teamTotalTurretDamage = 0;
    let teamTotalGold = 0;
    let teamTotalKills = 0;
    let teamTotalDeaths = 0;
    let teamTotalAssists = 0;
    let totalDurationSeconds = 0;
    let matchesWithDuration = 0;

    matches.forEach(m => {
      if (m.result === 'win') wins++;
      if (m.result === 'loss') losses++;
      totalTurtles += (m.teamTurtles || 0);
      totalLords += (m.teamLords || 0);
      totalTurrets += (m.teamTurrets || 0);

      const durSec = Number(m.durationSeconds) || 0;
      if (durSec > 0) {
        totalDurationSeconds += durSec;
        matchesWithDuration++;
      }

      if (m.playerStats) {
        m.playerStats.forEach(ps => {
          teamTotalDamageDealt += (Number(ps.damageDealt) || 0);
          teamTotalDamageReceived += (Number(ps.damageReceived) || 0);
          teamTotalTurretDamage += (Number(ps.turretDamage) || 0);
          teamTotalGold += (Number(ps.goldEarned) || 0);
          teamTotalKills += (Number(ps.kills) || 0);
          teamTotalDeaths += (Number(ps.deaths) || 0);
          teamTotalAssists += (Number(ps.assists) || 0);

          if (ps.savage) {
            totalSavages++;
            savageList.push({ playerId: ps.playerId, heroUsed: ps.heroUsed, date: m.date });
          }
          if (ps.maniac) {
            totalManiacs++;
            maniacList.push({ playerId: ps.playerId, heroUsed: ps.heroUsed, date: m.date });
          }
        });
      }
    });

    const totalMatches = matches.length;
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : 0;
    const avgDurationSeconds = matchesWithDuration > 0 ? Math.round(totalDurationSeconds / matchesWithDuration) : 0;
    const avgDurationFormatted = StatsEngine.formatDuration(avgDurationSeconds);
    const totalDurationFormatted = StatsEngine.formatDuration(totalDurationSeconds);

    return {
      totalMatches, wins, losses, winRate,
      totalTurtles, totalLords, totalTurrets,
      totalSavages, totalManiacs, savageList, maniacList,
      teamTotalDamageDealt, teamTotalDamageReceived, teamTotalTurretDamage,
      teamTotalGold, teamTotalKills, teamTotalDeaths, teamTotalAssists,
      totalDurationSeconds, totalDurationFormatted,
      avgDurationSeconds, avgDurationFormatted,
      matchesWithDuration
    };
  }

  getPlayerStats(matches, playerId) {
    let stats = {
      matchesPlayed: 0,
      wins: 0, losses: 0, winRate: 0,
      totalKills: 0, totalDeaths: 0, totalAssists: 0,
      avgKills: 0, avgDeaths: 0, avgAssists: 0,
      kdaRatio: 0, avgInGameScore: 0,
      totalDamageDealt: 0, avgDamageDealt: 0,
      totalDamageReceived: 0, avgDamageReceived: 0,
      totalTurretDamage: 0, avgTurretDamage: 0,
      avgTeamfightParticipation: 0,
      totalGoldEarned: 0, avgGoldEarned: 0,
      mvpCount: 0, goldCount: 0, silverCount: 0, bronzeCount: 0,
      savageCount: 0, maniacCount: 0,
      heroesUsed: [],
      favoriteHero: 'None',
      uniqueHeroCount: 0,
      performanceScore: 0,
      rolesPlayed: {}
    };

    let totalScore = 0;
    let totalTf = 0;
    let heroMap = {};

    matches.forEach(m => {
      const ps = (m.playerStats || []).find(p => p.playerId === playerId);
      if (!ps) return; // Player was benched or not in this match

      stats.matchesPlayed++;
      if (m.result === 'win') stats.wins++;
      else stats.losses++;

      stats.totalKills += Number(ps.kills) || 0;
      stats.totalDeaths += Number(ps.deaths) || 0;
      stats.totalAssists += Number(ps.assists) || 0;
      stats.totalDamageDealt += Number(ps.damageDealt) || 0;
      stats.totalDamageReceived += Number(ps.damageReceived) || 0;
      stats.totalTurretDamage += Number(ps.turretDamage) || 0;
      stats.totalGoldEarned += Number(ps.goldEarned) || 0;

      totalScore += Number(ps.inGameScore) || 0;
      totalTf += Number(ps.teamfightParticipation) || 0;

      if (ps.medal === 'mvp') stats.mvpCount++;
      if (ps.medal === 'gold') stats.goldCount++;
      if (ps.medal === 'silver') stats.silverCount++;
      if (ps.medal === 'bronze') stats.bronzeCount++;

      if (ps.savage) stats.savageCount++;
      if (ps.maniac) stats.maniacCount++;

      if (ps.heroUsed) {
        if (!heroMap[ps.heroUsed]) {
          heroMap[ps.heroUsed] = { heroName: ps.heroUsed, timesUsed: 0, wins: 0, losses: 0 };
        }
        heroMap[ps.heroUsed].timesUsed++;
        if (m.result === 'win') heroMap[ps.heroUsed].wins++;
        else heroMap[ps.heroUsed].losses++;
      }

      const role = ps.rolePlayed || 'EXP Laner';
      stats.rolesPlayed[role] = (stats.rolesPlayed[role] || 0) + 1;
    });

    if (stats.matchesPlayed > 0) {
      stats.winRate = ((stats.wins / stats.matchesPlayed) * 100).toFixed(1);
      stats.avgKills = (stats.totalKills / stats.matchesPlayed).toFixed(1);
      stats.avgDeaths = (stats.totalDeaths / stats.matchesPlayed).toFixed(1);
      stats.avgAssists = (stats.totalAssists / stats.matchesPlayed).toFixed(1);
      stats.kdaRatio = ((stats.totalKills + stats.totalAssists) / Math.max(stats.totalDeaths, 1)).toFixed(2);
      
      stats.avgInGameScore = (totalScore / stats.matchesPlayed).toFixed(1);
      stats.avgDamageDealt = Math.round(stats.totalDamageDealt / stats.matchesPlayed);
      stats.avgDamageReceived = Math.round(stats.totalDamageReceived / stats.matchesPlayed);
      stats.avgTurretDamage = Math.round(stats.totalTurretDamage / stats.matchesPlayed);
      stats.avgGoldEarned = Math.round(stats.totalGoldEarned / stats.matchesPlayed);
      stats.avgTeamfightParticipation = (totalTf / stats.matchesPlayed).toFixed(1);

      stats.performanceScore = (
        (stats.totalKills * 1) + 
        (stats.totalAssists * 0.7) - 
        (stats.totalDeaths * 1) + 
        (stats.mvpCount * 3) + 
        (stats.goldCount * 2) + 
        (stats.silverCount * 1) + 
        (stats.savageCount * 10) + 
        (stats.maniacCount * 5)
      ) / stats.matchesPlayed;
    }

    stats.heroesUsed = Object.values(heroMap).map(h => {
      const winRate = ((h.wins / h.timesUsed) * 100).toFixed(1);
      const useRate = stats.matchesPlayed > 0 ? ((h.timesUsed / stats.matchesPlayed) * 100).toFixed(1) : '0.0';
      return {
        ...h,
        winRate,
        useRate
      };
    }).sort((a, b) => b.timesUsed - a.timesUsed);

    stats.uniqueHeroCount = stats.heroesUsed.length;
    if (stats.heroesUsed.length > 0) {
      stats.favoriteHero = stats.heroesUsed[0].heroName;
    }

    return stats;
  }

  // =========================================================================
  //  HERO POOL & WIN RATE / USE RATE ANALYTICS (EACH ROSTER & TEAM-WIDE)
  // =========================================================================

  getPlayerHeroAnalytics(matches, playerId) {
    const playerStats = this.getPlayerStats(matches, playerId);
    const totalMatches = playerStats.matchesPlayed;
    const heroMap = {};

    matches.forEach(m => {
      const ps = (m.playerStats || []).find(p => p.playerId === playerId);
      if (!ps || !ps.heroUsed) return;

      const hName = ps.heroUsed;
      if (!heroMap[hName]) {
        heroMap[hName] = {
          heroName: hName,
          timesUsed: 0,
          wins: 0,
          losses: 0,
          totalKills: 0,
          totalDeaths: 0,
          totalAssists: 0,
          totalScore: 0,
          totalDamageDealt: 0,
          totalDamageReceived: 0,
          totalTurretDamage: 0,
          totalGold: 0,
          totalTf: 0,
          mvpCount: 0,
          goldCount: 0,
          silverCount: 0,
          bronzeCount: 0,
          savageCount: 0,
          maniacCount: 0,
          rolesPlayed: {}
        };
      }

      const h = heroMap[hName];
      h.timesUsed++;
      if (m.result === 'win') h.wins++;
      else h.losses++;

      h.totalKills += Number(ps.kills) || 0;
      h.totalDeaths += Number(ps.deaths) || 0;
      h.totalAssists += Number(ps.assists) || 0;
      h.totalScore += Number(ps.inGameScore) || 0;
      h.totalDamageDealt += Number(ps.damageDealt) || 0;
      h.totalDamageReceived += Number(ps.damageReceived) || 0;
      h.totalTurretDamage += Number(ps.turretDamage) || 0;
      h.totalGold += Number(ps.goldEarned) || 0;
      h.totalTf += Number(ps.teamfightParticipation) || 0;

      if (ps.medal === 'mvp') h.mvpCount++;
      if (ps.medal === 'gold') h.goldCount++;
      if (ps.medal === 'silver') h.silverCount++;
      if (ps.medal === 'bronze') h.bronzeCount++;

      if (ps.savage) h.savageCount++;
      if (ps.maniac) h.maniacCount++;

      const role = ps.rolePlayed || 'EXP Laner';
      h.rolesPlayed[role] = (h.rolesPlayed[role] || 0) + 1;
    });

    const heroAnalyticsList = Object.values(heroMap).map(h => {
      const winRateNum = (h.wins / h.timesUsed) * 100;
      const winRate = winRateNum.toFixed(1);
      const useRateNum = totalMatches > 0 ? (h.timesUsed / totalMatches) * 100 : 0;
      const useRate = useRateNum.toFixed(1);

      const kdaRatio = ((h.totalKills + h.totalAssists) / Math.max(h.totalDeaths, 1)).toFixed(2);
      const avgKills = (h.totalKills / h.timesUsed).toFixed(1);
      const avgDeaths = (h.totalDeaths / h.timesUsed).toFixed(1);
      const avgAssists = (h.totalAssists / h.timesUsed).toFixed(1);
      const avgScore = (h.totalScore / h.timesUsed).toFixed(1);
      const avgDamageDealt = Math.round(h.totalDamageDealt / h.timesUsed);
      const avgTurretDamage = Math.round(h.totalTurretDamage / h.timesUsed);
      const avgGold = Math.round(h.totalGold / h.timesUsed);
      const avgTf = (h.totalTf / h.timesUsed).toFixed(1);

      let masteryTier = 'A';
      let masteryLabel = 'COMFORT PICK';
      let masteryColor = '#00d4ff';

      if (winRateNum >= 75 && h.timesUsed >= 2) {
        masteryTier = 'S+';
        masteryLabel = '👑 SIGNATURE GOD';
        masteryColor = '#ffd700';
      } else if (winRateNum >= 60 && h.timesUsed >= 2) {
        masteryTier = 'S';
        masteryLabel = '⚡ MAIN WEAPON';
        masteryColor = '#a855f7';
      } else if (winRateNum >= 50) {
        masteryTier = 'A';
        masteryLabel = '🛡️ COMFORT PICK';
        masteryColor = '#10b981';
      } else if (winRateNum >= 35) {
        masteryTier = 'B';
        masteryLabel = '⚔️ SITUATIONAL';
        masteryColor = '#f59e0b';
      } else {
        masteryTier = 'C';
        masteryLabel = '⚠️ NEEDS PRACTICE';
        masteryColor = '#ef4444';
      }

      return {
        ...h,
        winRate,
        winRateNum,
        useRate,
        useRateNum,
        kdaRatio,
        avgKills,
        avgDeaths,
        avgAssists,
        avgScore,
        avgDamageDealt,
        avgTurretDamage,
        avgGold,
        avgTf,
        masteryTier,
        masteryLabel,
        masteryColor
      };
    }).sort((a, b) => b.timesUsed !== a.timesUsed ? b.timesUsed - a.timesUsed : b.winRateNum - a.winRateNum);

    return {
      totalMatches,
      uniqueHeroesCount: heroAnalyticsList.length,
      heroes: heroAnalyticsList,
      mostPicked: heroAnalyticsList.length > 0 ? heroAnalyticsList[0] : null,
      highestWinRate: [...heroAnalyticsList].sort((a, b) => b.winRateNum !== a.winRateNum ? b.winRateNum - a.winRateNum : b.timesUsed - a.timesUsed)[0] || null
    };
  }

  getTeamHeroAnalytics(matches, players) {
    const totalMatches = matches.length;
    const heroMap = {};

    matches.forEach(m => {
      (m.playerStats || []).forEach(ps => {
        if (!ps.heroUsed) return;
        const hName = ps.heroUsed;

        if (!heroMap[hName]) {
          heroMap[hName] = {
            heroName: hName,
            totalPicks: 0,
            wins: 0,
            losses: 0,
            totalKills: 0,
            totalDeaths: 0,
            totalAssists: 0,
            totalDamageDealt: 0,
            totalTurretDamage: 0,
            totalScore: 0,
            playerUsage: {}
          };
        }

        const h = heroMap[hName];
        h.totalPicks++;
        if (m.result === 'win') h.wins++;
        else h.losses++;

        h.totalKills += Number(ps.kills) || 0;
        h.totalDeaths += Number(ps.deaths) || 0;
        h.totalAssists += Number(ps.assists) || 0;
        h.totalDamageDealt += Number(ps.damageDealt) || 0;
        h.totalTurretDamage += Number(ps.turretDamage) || 0;
        h.totalScore += Number(ps.inGameScore) || 0;

        if (!h.playerUsage[ps.playerId]) {
          const pObj = players.find(p => p.id === ps.playerId);
          h.playerUsage[ps.playerId] = {
            playerId: ps.playerId,
            playerName: pObj ? pObj.name : 'Unknown',
            picks: 0,
            wins: 0,
            losses: 0
          };
        }
        h.playerUsage[ps.playerId].picks++;
        if (m.result === 'win') h.playerUsage[ps.playerId].wins++;
        else h.playerUsage[ps.playerId].losses++;
      });
    });

    const heroList = Object.values(heroMap).map(h => {
      const winRateNum = (h.wins / h.totalPicks) * 100;
      const winRate = winRateNum.toFixed(1);
      const useRateNum = totalMatches > 0 ? (h.totalPicks / totalMatches) * 100 : 0;
      const useRate = useRateNum.toFixed(1);

      const kdaRatio = ((h.totalKills + h.totalAssists) / Math.max(h.totalDeaths, 1)).toFixed(2);
      const avgDamageDealt = Math.round(h.totalDamageDealt / h.totalPicks);
      const avgTurretDamage = Math.round(h.totalTurretDamage / h.totalPicks);
      const avgScore = (h.totalScore / h.totalPicks).toFixed(1);

      const pilots = Object.values(h.playerUsage).map(u => ({
        ...u,
        winRate: ((u.wins / u.picks) * 100).toFixed(1)
      })).sort((a, b) => b.picks - a.picks);

      let metaTier = 'A';
      if (winRateNum >= 75 && h.totalPicks >= 2) metaTier = 'S+';
      else if (winRateNum >= 60 && h.totalPicks >= 2) metaTier = 'S';
      else if (winRateNum >= 50) metaTier = 'A';
      else if (winRateNum >= 35) metaTier = 'B';
      else metaTier = 'C';

      return {
        ...h,
        winRate,
        winRateNum,
        useRate,
        useRateNum,
        kdaRatio,
        avgDamageDealt,
        avgTurretDamage,
        avgScore,
        pilots,
        metaTier
      };
    }).sort((a, b) => b.totalPicks !== a.totalPicks ? b.totalPicks - a.totalPicks : b.winRateNum - a.winRateNum);

    return {
      totalMatches,
      totalHeroesPicked: heroList.length,
      heroes: heroList,
      topMetaHero: heroList.length > 0 ? heroList[0] : null
    };
  }

  // =========================================================================
  //  DUO & TRIO SYNERGY MATRIX (WINNING COMBOS)
  // =========================================================================

  getSynergyStats(matches, players) {
    if (!players || players.length < 2 || !matches || matches.length === 0) {
      return { duos: [], trios: [], topDuo: null, topTrio: null, mostPlayedDuo: null };
    }

    const duoMap = {};
    const trioMap = {};

    matches.forEach(m => {
      const activeStats = (m.playerStats || []).filter(ps => ps.playerId);
      const activeIds = activeStats.map(ps => ps.playerId);
      const isWin = m.result === 'win';

      // Pairwise Duos
      for (let i = 0; i < activeIds.length; i++) {
        for (let j = i + 1; j < activeIds.length; j++) {
          const id1 = activeIds[i] < activeIds[j] ? activeIds[i] : activeIds[j];
          const id2 = activeIds[i] < activeIds[j] ? activeIds[j] : activeIds[i];
          const key = `${id1}_${id2}`;

          if (!duoMap[key]) {
            const p1 = players.find(p => p.id === id1) || { name: 'Player 1' };
            const p2 = players.find(p => p.id === id2) || { name: 'Player 2' };
            duoMap[key] = {
              player1: p1,
              player2: p2,
              matchesTogether: 0,
              wins: 0,
              losses: 0,
              totalKills: 0,
              totalDeaths: 0,
              totalAssists: 0,
              p1Roles: {},
              p2Roles: {}
            };
          }

          const duo = duoMap[key];
          duo.matchesTogether++;
          if (isWin) duo.wins++;
          else duo.losses++;

          const ps1 = activeStats.find(s => s.playerId === id1);
          const ps2 = activeStats.find(s => s.playerId === id2);

          if (ps1) {
            duo.totalKills += Number(ps1.kills) || 0;
            duo.totalDeaths += Number(ps1.deaths) || 0;
            duo.totalAssists += Number(ps1.assists) || 0;
            const r1 = ps1.rolePlayed || 'EXP Laner';
            duo.p1Roles[r1] = (duo.p1Roles[r1] || 0) + 1;
          }
          if (ps2) {
            duo.totalKills += Number(ps2.kills) || 0;
            duo.totalDeaths += Number(ps2.deaths) || 0;
            duo.totalAssists += Number(ps2.assists) || 0;
            const r2 = ps2.rolePlayed || 'Jungler';
            duo.p2Roles[r2] = (duo.p2Roles[r2] || 0) + 1;
          }
        }
      }

      // Trios
      for (let i = 0; i < activeIds.length; i++) {
        for (let j = i + 1; j < activeIds.length; j++) {
          for (let k = j + 1; k < activeIds.length; k++) {
            const trioIds = [activeIds[i], activeIds[j], activeIds[k]].sort();
            const key = trioIds.join('_');

            if (!trioMap[key]) {
              trioMap[key] = {
                players: trioIds.map(id => players.find(p => p.id === id) || { name: 'Player' }),
                matchesTogether: 0,
                wins: 0,
                losses: 0
              };
            }

            const trio = trioMap[key];
            trio.matchesTogether++;
            if (isWin) trio.wins++;
            else trio.losses++;
          }
        }
      }
    });

    const duosList = Object.values(duoMap).map(d => {
      const winRateNum = (d.wins / d.matchesTogether) * 100;
      const winRate = winRateNum.toFixed(1);
      const combinedKda = ((d.totalKills + d.totalAssists) / Math.max(d.totalDeaths, 1)).toFixed(2);

      const p1PrimaryRole = Object.entries(d.p1Roles).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Flex';
      const p2PrimaryRole = Object.entries(d.p2Roles).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Flex';

      let comboLabel = `${p1PrimaryRole.replace(' Laner','')} + ${p2PrimaryRole.replace(' Laner','')}`;
      if (comboLabel.includes('Mid') && comboLabel.includes('Jungle')) comboLabel = '⚡ Mid-Jungle Core';
      else if (comboLabel.includes('Roam') && comboLabel.includes('Gold')) comboLabel = '🏹 Roam-Gold Lane';
      else if (comboLabel.includes('EXP') && comboLabel.includes('Jungle')) comboLabel = '🛡️ EXP-Jungle Duo';
      else if (comboLabel.includes('Mid') && comboLabel.includes('Roam')) comboLabel = '🔮 Mid-Roam Rotation';

      return {
        ...d,
        winRate,
        winRateNum,
        combinedKda,
        comboLabel,
        p1PrimaryRole,
        p2PrimaryRole
      };
    }).sort((a, b) => b.winRateNum !== a.winRateNum ? b.winRateNum - a.winRateNum : b.matchesTogether - a.matchesTogether);

    const triosList = Object.values(trioMap).map(t => {
      const winRateNum = (t.wins / t.matchesTogether) * 100;
      const winRate = winRateNum.toFixed(1);
      return {
        ...t,
        winRate,
        winRateNum
      };
    }).sort((a, b) => b.winRateNum !== a.winRateNum ? b.winRateNum - a.winRateNum : b.matchesTogether - a.matchesTogether);

    const topDuo = duosList.find(d => d.matchesTogether >= 2) || duosList[0] || null;
    const mostPlayedDuo = [...duosList].sort((a, b) => b.matchesTogether - a.matchesTogether)[0] || null;
    const topTrio = triosList.find(t => t.matchesTogether >= 2) || triosList[0] || null;

    return {
      duos: duosList,
      trios: triosList,
      topDuo,
      mostPlayedDuo,
      topTrio
    };
  }

  // =========================================================================
  //  1v1 HEAD-TO-HEAD PLAYER COMPARISON ENGINE
  // =========================================================================

  getPlayerComparison(matches, player1Id, player2Id) {
    const p1Stats = this.getPlayerStats(matches, player1Id);
    const p2Stats = this.getPlayerStats(matches, player2Id);
    const p1Roles = this.getPlayerRoleBreakdown(matches, player1Id);
    const p2Roles = this.getPlayerRoleBreakdown(matches, player2Id);
    const p1HeroAnalytics = this.getPlayerHeroAnalytics(matches, player1Id);
    const p2HeroAnalytics = this.getPlayerHeroAnalytics(matches, player2Id);

    const metrics = [
      { key: 'performanceScore', label: 'Overall Rating', val1: Number(p1Stats.performanceScore.toFixed(2)), val2: Number(p2Stats.performanceScore.toFixed(2)), higherIsBetter: true, format: (v) => v.toFixed(2) },
      { key: 'winRate', label: 'Win Rate (%)', val1: Number(p1Stats.winRate), val2: Number(p2Stats.winRate), higherIsBetter: true, format: (v) => v + '%' },
      { key: 'kdaRatio', label: 'KDA Ratio', val1: Number(p1Stats.kdaRatio), val2: Number(p2Stats.kdaRatio), higherIsBetter: true, format: (v) => v.toFixed(2) },
      { key: 'avgInGameScore', label: 'Avg Match Score', val1: Number(p1Stats.avgInGameScore), val2: Number(p2Stats.avgInGameScore), higherIsBetter: true, format: (v) => v.toFixed(1) },
      { key: 'avgDamageDealt', label: 'Avg Hero Damage', val1: p1Stats.avgDamageDealt, val2: p2Stats.avgDamageDealt, higherIsBetter: true, format: (v) => window.StatsEngine.formatLargeNumber(v) },
      { key: 'avgDamageReceived', label: 'Avg Dmg Taken', val1: p1Stats.avgDamageReceived, val2: p2Stats.avgDamageReceived, higherIsBetter: false, format: (v) => window.StatsEngine.formatLargeNumber(v) },
      { key: 'avgTurretDamage', label: 'Avg Turret Dmg', val1: p1Stats.avgTurretDamage, val2: p2Stats.avgTurretDamage, higherIsBetter: true, format: (v) => window.StatsEngine.formatLargeNumber(v) },
      { key: 'avgTeamfightParticipation', label: 'Teamfight Part.', val1: Number(p1Stats.avgTeamfightParticipation), val2: Number(p2Stats.avgTeamfightParticipation), higherIsBetter: true, format: (v) => v + '%' },
      { key: 'avgGoldEarned', label: 'Avg Gold per Game', val1: p1Stats.avgGoldEarned, val2: p2Stats.avgGoldEarned, higherIsBetter: true, format: (v) => window.StatsEngine.formatLargeNumber(v) },
      { key: 'mvpCount', label: 'Total MVPs', val1: p1Stats.mvpCount, val2: p2Stats.mvpCount, higherIsBetter: true, format: (v) => v },
      { key: 'savageCount', label: 'Savages & Maniacs', val1: p1Stats.savageCount + p1Stats.maniacCount, val2: p2Stats.savageCount + p2Stats.maniacCount, higherIsBetter: true, format: (v) => v }
    ];

    let p1WinsCount = 0;
    let p2WinsCount = 0;

    const evaluatedMetrics = metrics.map(m => {
      let winner = 'tie';
      if (m.higherIsBetter) {
        if (m.val1 > m.val2) { winner = 'p1'; p1WinsCount++; }
        else if (m.val2 > m.val1) { winner = 'p2'; p2WinsCount++; }
      } else {
        if (m.val1 < m.val2) { winner = 'p1'; p1WinsCount++; }
        else if (m.val2 < m.val1) { winner = 'p2'; p2WinsCount++; }
      }

      const total = (m.val1 + m.val2) || 1;
      const p1Pct = Math.round((m.val1 / total) * 100);
      const p2Pct = 100 - p1Pct;

      return {
        ...m,
        winner,
        p1Pct,
        p2Pct
      };
    });

    // Find shared heroes
    const sharedHeroes = [];
    p1HeroAnalytics.heroes.forEach(h1 => {
      const h2 = p2HeroAnalytics.heroes.find(h => h.heroName.toLowerCase() === h1.heroName.toLowerCase());
      if (h2) {
        sharedHeroes.push({
          heroName: h1.heroName,
          p1: { timesUsed: h1.timesUsed, winRate: h1.winRate, kdaRatio: h1.kdaRatio, avgScore: h1.avgScore },
          p2: { timesUsed: h2.timesUsed, winRate: h2.winRate, kdaRatio: h2.kdaRatio, avgScore: h2.avgScore }
        });
      }
    });

    return {
      p1Stats,
      p2Stats,
      p1Roles,
      p2Roles,
      p1HeroAnalytics,
      p2HeroAnalytics,
      metrics: evaluatedMetrics,
      p1WinsCount,
      p2WinsCount,
      overallWinner: p1WinsCount > p2WinsCount ? 'p1' : p2WinsCount > p1WinsCount ? 'p2' : 'tie',
      sharedHeroes
    };
  }

  // =========================================================================
  //  ROLE-SPECIFIC PERFORMANCE ANALYSIS
  // =========================================================================

  getPlayerStatsForRole(matches, playerId, targetRole) {
    let stats = {
      role: targetRole,
      matchesPlayed: 0,
      wins: 0, losses: 0, winRate: 0,
      totalKills: 0, totalDeaths: 0, totalAssists: 0,
      avgKills: 0, avgDeaths: 0, avgAssists: 0,
      kdaRatio: 0, avgInGameScore: 0,
      totalDamageDealt: 0, avgDamageDealt: 0,
      totalDamageReceived: 0, avgDamageReceived: 0,
      totalTurretDamage: 0, avgTurretDamage: 0,
      avgTeamfightParticipation: 0,
      totalGoldEarned: 0, avgGoldEarned: 0,
      mvpCount: 0, goldCount: 0, silverCount: 0, bronzeCount: 0,
      savageCount: 0, maniacCount: 0,
      heroesUsed: [],
      favoriteHero: 'None',
      performanceScore: 0
    };

    let totalScore = 0;
    let totalTf = 0;
    let heroMap = {};

    matches.forEach(m => {
      const ps = (m.playerStats || []).find(p => p.playerId === playerId);
      if (!ps) return;
      
      const role = ps.rolePlayed || 'EXP Laner';
      if (role !== targetRole) return;

      stats.matchesPlayed++;
      if (m.result === 'win') stats.wins++;
      else stats.losses++;

      stats.totalKills += Number(ps.kills) || 0;
      stats.totalDeaths += Number(ps.deaths) || 0;
      stats.totalAssists += Number(ps.assists) || 0;
      stats.totalDamageDealt += Number(ps.damageDealt) || 0;
      stats.totalDamageReceived += Number(ps.damageReceived) || 0;
      stats.totalTurretDamage += Number(ps.turretDamage) || 0;
      stats.totalGoldEarned += Number(ps.goldEarned) || 0;

      totalScore += Number(ps.inGameScore) || 0;
      totalTf += Number(ps.teamfightParticipation) || 0;

      if (ps.medal === 'mvp') stats.mvpCount++;
      if (ps.medal === 'gold') stats.goldCount++;
      if (ps.medal === 'silver') stats.silverCount++;
      if (ps.medal === 'bronze') stats.bronzeCount++;

      if (ps.savage) stats.savageCount++;
      if (ps.maniac) stats.maniacCount++;

      if (ps.heroUsed) {
        if (!heroMap[ps.heroUsed]) {
          heroMap[ps.heroUsed] = { heroName: ps.heroUsed, timesUsed: 0, wins: 0, losses: 0 };
        }
        heroMap[ps.heroUsed].timesUsed++;
        if (m.result === 'win') heroMap[ps.heroUsed].wins++;
        else heroMap[ps.heroUsed].losses++;
      }
    });

    if (stats.matchesPlayed > 0) {
      stats.winRate = ((stats.wins / stats.matchesPlayed) * 100).toFixed(1);
      stats.avgKills = (stats.totalKills / stats.matchesPlayed).toFixed(1);
      stats.avgDeaths = (stats.totalDeaths / stats.matchesPlayed).toFixed(1);
      stats.avgAssists = (stats.totalAssists / stats.matchesPlayed).toFixed(1);
      stats.kdaRatio = ((stats.totalKills + stats.totalAssists) / Math.max(stats.totalDeaths, 1)).toFixed(2);
      
      stats.avgInGameScore = (totalScore / stats.matchesPlayed).toFixed(1);
      stats.avgDamageDealt = Math.round(stats.totalDamageDealt / stats.matchesPlayed);
      stats.avgDamageReceived = Math.round(stats.totalDamageReceived / stats.matchesPlayed);
      stats.avgTurretDamage = Math.round(stats.totalTurretDamage / stats.matchesPlayed);
      stats.avgGoldEarned = Math.round(stats.totalGoldEarned / stats.matchesPlayed);
      stats.avgTeamfightParticipation = (totalTf / stats.matchesPlayed).toFixed(1);

      stats.performanceScore = (
        (stats.totalKills * 1) + 
        (stats.totalAssists * 0.7) - 
        (stats.totalDeaths * 1) + 
        (stats.mvpCount * 3) + 
        (stats.goldCount * 2) + 
        (stats.silverCount * 1) + 
        (stats.savageCount * 10) + 
        (stats.maniacCount * 5)
      ) / stats.matchesPlayed;
    }

    stats.heroesUsed = Object.values(heroMap).sort((a, b) => b.timesUsed - a.timesUsed);
    if (stats.heroesUsed.length > 0) {
      stats.favoriteHero = stats.heroesUsed[0].heroName;
    }

    return stats;
  }

  getPlayerRoleBreakdown(matches, playerId) {
    const roles = StatsEngine.ROLES;
    const roleStatsList = roles.map(role => this.getPlayerStatsForRole(matches, playerId, role));
    
    // Find primary role (most games played)
    const playedRoles = roleStatsList.filter(r => r.matchesPlayed > 0);
    const sortedByGames = [...playedRoles].sort((a, b) => b.matchesPlayed - a.matchesPlayed);
    const primaryRole = sortedByGames.length > 0 ? sortedByGames[0].role : 'Flex';

    // Find best performing role (highest performanceScore with >= 1 game)
    const sortedByScore = [...playedRoles].sort((a, b) => b.performanceScore - a.performanceScore);
    const bestRole = sortedByScore.length > 0 ? sortedByScore[0].role : primaryRole;

    return {
      roles: roleStatsList,
      primaryRole,
      bestRole,
      totalRolesPlayed: playedRoles.length
    };
  }

  // =========================================================================
  //  TEAM OF THE PERIOD (DREAM TEAM 5-LANE FORMATION)
  // =========================================================================

  getTeamOfPeriod(matches, players) {
    if (!players || players.length === 0) return null;

    const roles = StatsEngine.ROLES;
    const lineup = {};
    let totalScoreSum = 0;
    let candidatesFound = 0;

    roles.forEach(role => {
      let bestCandidate = null;
      let highestScore = -9999;

      players.forEach(p => {
        const roleStats = this.getPlayerStatsForRole(matches, p.id, role);
        if (roleStats.matchesPlayed > 0 && roleStats.performanceScore > highestScore) {
          highestScore = roleStats.performanceScore;
          bestCandidate = {
            player: p,
            stats: roleStats,
            role: role
          };
        }
      });

      // Fallback: If no player played this specific role during this period,
      // fallback to the player with the best career stats in this role
      if (!bestCandidate) {
        const allMatches = this.db.getMatches();
        let fallbackHighest = -9999;
        players.forEach(p => {
          const careerRoleStats = this.getPlayerStatsForRole(allMatches, p.id, role);
          if (careerRoleStats.matchesPlayed > 0 && careerRoleStats.performanceScore > fallbackHighest) {
            fallbackHighest = careerRoleStats.performanceScore;
            bestCandidate = {
              player: p,
              stats: careerRoleStats,
              role: role,
              isCareerFallback: true
            };
          }
        });
      }

      lineup[role] = bestCandidate;
      if (bestCandidate) {
        totalScoreSum += bestCandidate.stats.performanceScore;
        candidatesFound++;
      }
    });

    return {
      lineup,
      avgLineupScore: candidatesFound > 0 ? (totalScoreSum / candidatesFound).toFixed(2) : '0.00',
      candidatesFound
    };
  }

  getCareerTotals(allMatches, players) {
    return players.map(p => {
      const pStats = this.getPlayerStats(allMatches, p.id);
      return {
        player: p,
        stats: pStats
      };
    }).filter(item => item.stats.matchesPlayed > 0);
  }

  getPlayerOfPeriod(matches, players) {
    if (!matches.length || !players.length) return null;
    let topPlayer = null;
    let maxScore = -9999;
    
    players.forEach(p => {
      const pStats = this.getPlayerStats(matches, p.id);
      if (pStats.matchesPlayed > 0 && pStats.performanceScore > maxScore) {
        maxScore = pStats.performanceScore;
        topPlayer = { player: p, stats: pStats };
      }
    });
    return topPlayer;
  }

  getMostMvps(matches, players) {
    if (!matches.length || !players.length) return null;
    let topPlayer = null;
    let maxMvps = 0;

    players.forEach(p => {
      const pStats = this.getPlayerStats(matches, p.id);
      if (pStats.mvpCount > maxMvps) {
        maxMvps = pStats.mvpCount;
        topPlayer = { player: p, mvpCount: maxMvps, stats: pStats };
      }
    });

    return topPlayer;
  }

  getPlayerTrends(allMatches, players, period = 'week') {
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();

    let currMatches = [];
    let prevMatches = [];

    if (period === 'week') {
      currMatches = this.db.getMatchesForWeek(todayStr);
      const prevWeekDate = new Date(now.setDate(now.getDate() - 7)).toISOString().split('T')[0];
      prevMatches = this.db.getMatchesForWeek(prevWeekDate);
    } else if (period === 'month') {
      currMatches = this.db.getMatchesForMonth(now.getFullYear(), now.getMonth() + 1);
      const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      prevMatches = this.db.getMatchesForMonth(prevYear, prevMonth);
    } else if (period === 'year') {
      currMatches = this.db.getMatchesForYear(now.getFullYear());
      prevMatches = this.db.getMatchesForYear(now.getFullYear() - 1);
    }

    return players.map(p => {
      const currStats = this.getPlayerStats(currMatches, p.id);
      const prevStats = this.getPlayerStats(prevMatches, p.id);
      const careerStats = this.getPlayerStats(allMatches, p.id);

      let baselineScore = 0;
      let isComparedToCareer = false;

      if (prevStats.matchesPlayed > 0) {
        baselineScore = prevStats.performanceScore;
      } else if (careerStats.matchesPlayed > 0) {
        baselineScore = careerStats.performanceScore;
        isComparedToCareer = true;
      }

      const currentScore = currStats.matchesPlayed > 0 ? currStats.performanceScore : (careerStats.performanceScore || 0);
      const diff = currentScore - baselineScore;
      let growthPct = 0;

      if (baselineScore > 0) {
        growthPct = (diff / baselineScore) * 100;
      } else if (currentScore > 0) {
        growthPct = 100;
      }

      let status = 'stable';
      if (diff >= 1.5 || growthPct >= 15) status = 'spiking';
      else if (diff >= 0.5 || growthPct >= 5) status = 'growing';
      else if (diff <= -1.5 || growthPct <= -15) status = 'falling';
      else if (diff <= -0.5 || growthPct <= -5) status = 'declining';

      return {
        player: p,
        currStats: currStats.matchesPlayed > 0 ? currStats : careerStats,
        prevScore: baselineScore,
        currentScore: currentScore,
        diff: diff,
        growthPct: growthPct,
        status: status,
        isComparedToCareer
      };
    }).sort((a, b) => b.diff - a.diff);
  }

  // =========================================================================
  //  MATCH DURATION & PACING ANALYTICS
  // =========================================================================

  getMatchDurationStats(matches) {
    const validMatches = matches.filter(m => Number(m.durationSeconds) > 0);
    if (validMatches.length === 0) {
      return {
        hasData: false,
        count: 0,
        totalDurationSeconds: 0,
        totalDurationFormatted: '-',
        avgDurationSeconds: 0,
        avgDurationFormatted: '-',
        longestMatch: null,
        shortestMatch: null,
        fastestWin: null,
        longestWin: null
      };
    }

    let totalSec = 0;
    let longest = validMatches[0];
    let shortest = validMatches[0];
    let fastestWin = null;
    let longestWin = null;

    validMatches.forEach(m => {
      const sec = Number(m.durationSeconds);
      totalSec += sec;

      if (sec > Number(longest.durationSeconds)) longest = m;
      if (sec < Number(shortest.durationSeconds)) shortest = m;

      if (m.result === 'win') {
        if (!fastestWin || sec < Number(fastestWin.durationSeconds)) fastestWin = m;
        if (!longestWin || sec > Number(longestWin.durationSeconds)) longestWin = m;
      }
    });

    const avgSec = Math.round(totalSec / validMatches.length);

    return {
      hasData: true,
      count: validMatches.length,
      totalDurationSeconds: totalSec,
      totalDurationFormatted: StatsEngine.formatDuration(totalSec),
      avgDurationSeconds: avgSec,
      avgDurationFormatted: StatsEngine.formatDuration(avgSec),
      longestMatch: longest,
      shortestMatch: shortest,
      fastestWin,
      longestWin
    };
  }

  getAllTimeRecords(allMatches, players) {
    let highestKills = { value: -1 }, highestAssists = { value: -1 };
    let highestDamage = { value: -1 }, highestGold = { value: -1 }, highestInGameScore = { value: -1 };
    
    let currentStreak = { type: null, count: 0 };
    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    let longestMatch = null;
    let shortestMatch = null;
    let fastestWin = null;

    const sorted = [...allMatches].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sorted.forEach(m => {
      if (m.result === 'win') {
        tempWinStreak++;
        tempLossStreak = 0;
        if (tempWinStreak > longestWinStreak) longestWinStreak = tempWinStreak;
        currentStreak = { type: 'win', count: tempWinStreak };
      } else {
        tempLossStreak++;
        tempWinStreak = 0;
        if (tempLossStreak > longestLossStreak) longestLossStreak = tempLossStreak;
        currentStreak = { type: 'loss', count: tempLossStreak };
      }

      const durSec = Number(m.durationSeconds) || 0;
      if (durSec > 0) {
        if (!longestMatch || durSec > Number(longestMatch.durationSeconds)) longestMatch = m;
        if (!shortestMatch || durSec < Number(shortestMatch.durationSeconds)) shortestMatch = m;
        if (m.result === 'win' && (!fastestWin || durSec < Number(fastestWin.durationSeconds))) fastestWin = m;
      }

      (m.playerStats || []).forEach(ps => {
        const pObj = players.find(p => p.id === ps.playerId) || { name: 'Unknown' };
        const recordBase = { playerName: pObj.name, heroUsed: ps.heroUsed, rolePlayed: ps.rolePlayed || 'EXP Laner', date: m.date };
        
        if (ps.kills > highestKills.value) highestKills = { value: ps.kills, ...recordBase };
        if (ps.assists > highestAssists.value) highestAssists = { value: ps.assists, ...recordBase };
        if (ps.damageDealt > highestDamage.value) highestDamage = { value: ps.damageDealt, ...recordBase };
        if (ps.goldEarned > highestGold.value) highestGold = { value: ps.goldEarned, ...recordBase };
        if (ps.inGameScore > highestInGameScore.value) highestInGameScore = { value: ps.inGameScore, ...recordBase };
      });
    });

    return {
      highestKills,
      highestAssists,
      highestDamage,
      highestGold,
      highestInGameScore,
      longestWinStreak,
      longestLossStreak,
      currentStreak,
      longestMatch,
      shortestMatch,
      fastestWin
    };
  }

  getLeaderboard(matches, players) {
    return players.map(p => {
      return { player: p, stats: this.getPlayerStats(matches, p.id) };
    }).filter(p => p.stats.matchesPlayed > 0)
      .sort((a, b) => b.stats.performanceScore - a.stats.performanceScore);
  }
};
