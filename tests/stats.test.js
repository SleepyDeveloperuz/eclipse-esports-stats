import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
await import('../js/stats.js');
const StatsEngine = globalThis.window.StatsEngine;
const engine = new StatsEngine({});

const players = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Bravo' },
  { id: 'p3', name: 'Charlie' },
  { id: 'p4', name: 'Delta' },
  { id: 'p5', name: 'Echo' }
];
const roles = StatsEngine.ROLES;

test('unknown match role counts in general statistics but not role-specific ratings', () => {
  const input = match('unknown-role'); input.playerStats[0].rolePlayed = null;
  const all = engine.getPlayerStats([input], 'p1', { scope: 'all' });
  const gold = engine.getPlayerStats([input], 'p1', { scope: 'all', role: 'Gold Laner' });
  assert.equal(all.matchesPlayed, 1);
  assert.equal(gold.matchesPlayed, 0);
  assert.equal(engine._eclipseIndex([input], 'p1').value, null);
  assert.equal(StatsEngine.normalizeRole(null), 'Unknown');
});

function match(id, { scope = 'team5', result = 'win', score = 10, lineup = players, date = '2026-08-01' } = {}) {
  return {
    id,
    date,
    createdAt: `${date}T12:00:00.000Z`,
    scope,
    result,
    durationSeconds: 600,
    teamTurtles: 1,
    teamLords: 1,
    teamTurrets: 7,
    playerStats: lineup.map((player, index) => ({
      playerId: player.id,
      playerName: player.name,
      rolePlayed: roles[index % roles.length],
      inGameScore: score + index,
      kills: 3,
      deaths: 2,
      assists: 6,
      damageDealt: 20000 + index * 1000,
      damageReceived: 15000,
      turretDamage: 2500,
      goldEarned: 9000,
      teamfightParticipation: 70,
      medal: index === 0 ? 'mvp' : null
    }))
  };
}

test('team statistics exclude squad and individual practice matches', () => {
  const matches = [
    match('team'),
    match('squad', { scope: 'squad', lineup: players.slice(0, 3) }),
    match('solo', { scope: 'individual', lineup: players.slice(0, 1) })
  ];
  const stats = engine.getTeamStats(matches);
  assert.equal(stats.totalMatches, 1);
  assert.equal(stats.excludedMatches, 2);
  assert.equal(stats.wins, 1);
});

test('analytics modes keep official Team5 separate from valid 1-4 player matches', () => {
  const official = match('official');
  const squad = match('squad', { scope: 'squad', lineup: players.slice(0, 4) });
  squad.guestStats = [{ playerId: 'guest-1', damageDealt: 999999 }];
  const solo = match('solo', { scope: 'individual', lineup: players.slice(0, 1) });
  const draft = match('draft');
  draft.status = 'draft';
  const teamWithGuest = match('team-with-guest');
  teamWithGuest.guestStats = [{ playerId: 'guest-2' }];
  const mismatched = match('mismatched', { scope: 'team5', lineup: players.slice(0, 4) });

  const source = [official, squad, solo, draft, teamWithGuest, mismatched];
  assert.deepEqual(StatsEngine.filterAnalyticsMatches(source, 'team5').map(item => item.id), ['official']);
  assert.deepEqual(StatsEngine.filterAnalyticsMatches(source, 'squad').map(item => item.id), ['squad', 'solo']);
  assert.deepEqual(StatsEngine.filterAnalyticsMatches(source, 'unknown'), []);

  const leaderboard = engine.getLeaderboard(StatsEngine.filterAnalyticsMatches(source, 'squad'), players, { scope: 'all' });
  assert.equal(leaderboard.find(item => item.player.id === 'p1').stats.matchesPlayed, 2);
  assert.ok(leaderboard.every(item => item.player.id !== 'guest-1'));
});

test('dataset quality keeps verification and metric completeness distinct', () => {
  const verifiedPartial = match('verified-partial');
  verifiedPartial.verificationStatus = 'verified';
  verifiedPartial.playerStats.forEach(stat => { stat.heroUsed = 'Fanny'; });
  verifiedPartial.playerStats[0].damageDealt = null;

  const fullUnverified = match('full-unverified');
  fullUnverified.verificationStatus = 'unverified';
  fullUnverified.playerStats.forEach(stat => { stat.heroUsed = 'Fanny'; });

  const quality = StatsEngine.getDatasetQuality([verifiedPartial, fullUnverified]);
  assert.equal(quality.totalMatches, 2);
  assert.equal(quality.verifiedMatches, 1);
  assert.equal(quality.fullMatches, 1);
  assert.equal(quality.verifiedRate, 50);
  assert.equal(quality.fullRate, 50);
});

test('current-like Team5 and Squad samples expose raw delta without claiming comparability', () => {
  const teamMatches = Array.from({ length: 6 }, (_, index) =>
    match(`team-${index}`, { result: index < 5 ? 'win' : 'loss', date: '2026-08-27' }));
  const squadMatches = Array.from({ length: 9 }, (_, index) =>
    match(`squad-${index}`, {
      scope: 'squad',
      result: 'win',
      lineup: players.slice(0, 4),
      date: '2026-08-27'
    }));

  const comparison = StatsEngine.getAnalyticsScopeComparison([...teamMatches, ...squadMatches]);
  assert.equal(comparison.team5.totalMatches, 6);
  assert.equal(comparison.squad.totalMatches, 9);
  assert.equal(comparison.team5.winRate, 83.3);
  assert.equal(comparison.squad.winRate, 100);
  assert.equal(comparison.rawDelta, 16.7);
  assert.equal(comparison.comparable, false);
  assert.equal(comparison.status, 'early');
  assert.equal(comparison.adjustedDelta, null);
});

test('missing player metrics stay unavailable instead of becoming zero', () => {
  const partial = match('partial');
  partial.playerStats[0].damageDealt = null;
  partial.playerStats[0].kills = null;
  const stats = engine.getPlayerStats([partial], 'p1');
  assert.equal(stats.totalDamageDealt, null);
  assert.equal(stats.totalKills, null);
  assert.equal(stats.avgDamagePerMinute, null);
});

test('partial team metrics never create fake shares or partial team totals', () => {
  const partial = match('partial-team');
  partial.playerStats[1].damageDealt = null;
  partial.playerStats[1].goldEarned = null;
  partial.playerStats[1].turretDamage = null;

  const playerStats = engine.getPlayerStats([partial], 'p1');
  assert.equal(playerStats.avgDamageShare, null);
  assert.equal(playerStats.avgGoldShare, null);
  assert.equal(playerStats.avgTurretDamageShare, null);
  assert.equal(playerStats.rateSampleSizes.damageShare, 0);

  const teamStats = engine.getTeamStats([partial]);
  assert.equal(teamStats.teamTotalDamageDealt, null);
  assert.equal(teamStats.teamTotalGold, null);
  assert.equal(teamStats.teamTotalTurretDamage, null);
  assert.equal(teamStats.teamDamagePerMinute, null);
  assert.equal(teamStats.teamGoldPerMinute, null);
});

test('period windows use inclusive rolling 7, 30, and 365 day boundaries', () => {
  const source = [match('anchor', { date: '2026-08-31' })];
  const cases = [
    ['week', 7, '2026-08-25', '2026-08-31', '2026-08-18', '2026-08-24'],
    ['month', 30, '2026-08-02', '2026-08-31', '2026-07-03', '2026-08-01'],
    ['year', 365, '2025-09-01', '2026-08-31', '2024-09-01', '2025-08-31']
  ];

  cases.forEach(([period, days, currentFrom, currentTo, previousFrom, previousTo]) => {
    const windows = StatsEngine.getPeriodWindows(source, period, { today: '2026-08-31' });
    assert.equal(windows.days, days);
    assert.deepEqual(windows.current, {
      from: currentFrom,
      to: currentTo,
      label: StatsEngine.formatWindowLabel(currentFrom, currentTo)
    });
    assert.deepEqual(windows.previous, {
      from: previousFrom,
      to: previousTo,
      label: StatsEngine.formatWindowLabel(previousFrom, previousTo)
    });

    const boundaryMatches = [
      match(`${period}-current-from`, { date: currentFrom }),
      match(`${period}-current-to`, { date: currentTo }),
      match(`${period}-previous-from`, { date: previousFrom }),
      match(`${period}-previous-to`, { date: previousTo })
    ];
    assert.deepEqual(
      StatsEngine.filterMatchesByDateWindow(boundaryMatches, windows.current).map(item => item.id),
      [`${period}-current-from`, `${period}-current-to`]
    );
    assert.deepEqual(
      StatsEngine.filterMatchesByDateWindow(boundaryMatches, windows.previous).map(item => item.id),
      [`${period}-previous-from`, `${period}-previous-to`]
    );
  });
});

test('period anchor ignores future matches relative to the supplied today', () => {
  const windows = StatsEngine.getPeriodWindows([
    match('latest-eligible', { date: '2026-08-27' }),
    match('future', { date: '2026-09-02' })
  ], 'week', { today: '2026-08-31' });
  assert.equal(windows.anchorDate, '2026-08-27');
  assert.equal(windows.current.from, '2026-08-21');
  assert.equal(windows.current.to, '2026-08-27');
});

test('rolling week comparison is provisional with three valid samples in each window', () => {
  const previous = ['22', '23', '24'].map((day, index) =>
    match(`previous-${index}`, { score: 8, date: `2026-08-${day}` }));
  const current = ['29', '30', '31'].map((day, index) =>
    match(`current-${index}`, { score: 12, date: `2026-08-${day}` }));
  const trend = engine.getPlayerTrends([...previous, ...current], players, 'week', {
    scope: 'all', today: '2026-08-31'
  }).find(item => item.player.id === 'p1');

  assert.equal(trend.comparisonAvailable, true);
  assert.equal(trend.window.currentValidSamples, 3);
  assert.equal(trend.window.previousValidSamples, 3);
  assert.equal(trend.confidence.level, 'provisional');
  assert.ok(trend.diff > 0);
  assert.equal(trend.isComparedToCareer, false);
});

test('six samples in two sessions remain provisional rather than stable', () => {
  const previous = Array.from({ length: 6 }, (_, index) =>
    match(`stable-previous-${index}`, { score: 8, date: '2026-08-23' }));
  const current = Array.from({ length: 6 }, (_, index) =>
    match(`stable-current-${index}`, { score: 12, date: '2026-08-30' }));
  const trend = engine.getPlayerTrends([...previous, ...current], players, 'week', {
    scope: 'all', today: '2026-08-31'
  }).find(item => item.player.id === 'p1');

  assert.equal(trend.comparisonAvailable, true);
  assert.equal(trend.confidence.level, 'provisional');
  assert.equal(trend.window.currentValidSamples, 6);
  assert.equal(trend.window.previousValidSamples, 6);
});

test('ten current samples cannot compensate for one previous sample', () => {
  const previous = [match('thin-previous', { score: 8, date: '2026-08-23' })];
  const current = Array.from({ length: 10 }, (_, index) =>
    match(`deep-current-${index}`, { score: 12, date: '2026-08-30' }));
  const trend = engine.getPlayerTrends([...previous, ...current], players, 'week', {
    scope: 'all', today: '2026-08-31'
  }).find(item => item.player.id === 'p1');

  assert.equal(trend.window.currentValidSamples, 10);
  assert.equal(trend.window.previousValidSamples, 1);
  assert.equal(trend.comparisonAvailable, false);
  assert.equal(trend.confidence.level, 'insufficient');
  assert.equal(trend.diff, null);
  assert.equal(trend.reasonCode, 'PREVIOUS_WINDOW_LOW_SAMPLE');
});

test('trend sample counts only valid Eclipse Index observations', () => {
  const previous = ['22', '23', '24'].map((day, index) =>
    match(`valid-previous-${index}`, { score: 8, date: `2026-08-${day}` }));
  const current = ['29', '30', '31'].map((day, index) =>
    match(`partial-current-${index}`, { score: 12, date: `2026-08-${day}` }));
  current[0].playerStats.find(stat => stat.playerId === 'p1').inGameScore = null;
  const trend = engine.getPlayerTrends([...previous, ...current], players, 'week', {
    scope: 'all', today: '2026-08-31'
  }).find(item => item.player.id === 'p1');

  assert.equal(trend.window.currentMatches, 3);
  assert.equal(trend.window.currentValidSamples, 2);
  assert.equal(trend.window.previousValidSamples, 3);
  assert.equal(trend.comparisonAvailable, false);
  assert.equal(trend.diff, null);
  assert.equal(trend.reasonCode, 'CURRENT_WINDOW_LOW_SAMPLE');
});

test('a current window without previous samples never falls back to career claims', () => {
  const current = ['29', '30', '31'].map((day, index) =>
    match(`only-current-${index}`, { date: `2026-08-${day}` }));
  const trend = engine.getPlayerTrends(current, players, 'week', {
    scope: 'all', today: '2026-08-31'
  }).find(item => item.player.id === 'p1');

  assert.equal(trend.window.currentValidSamples, 3);
  assert.equal(trend.window.previousValidSamples, 0);
  assert.equal(trend.comparisonAvailable, false);
  assert.equal(trend.diff, null);
  assert.equal(trend.status, 'insufficient');
  assert.equal(trend.isComparedToCareer, false);
  assert.equal(trend.reasonCode, 'PREVIOUS_WINDOW_LOW_SAMPLE');
});

test('MVP leader is selected by MVP medals, not generic index', () => {
  const first = match('mvp-1');
  const second = match('mvp-2');
  second.playerStats.forEach(stat => { stat.medal = null; });
  second.playerStats[1].medal = 'mvp';
  const third = match('mvp-3');
  third.playerStats.forEach(stat => { stat.medal = null; });
  third.playerStats[1].medal = 'mvp';
  const leader = engine.getMostMvps([first, second, third], players);
  assert.equal(leader.player.id, 'p2');
  assert.equal(leader.mvpCount, 2);
  assert.equal(leader.selectionMetric, 'mvpCount');
});

test('synergy is unavailable when the lineup never changes', () => {
  const matches = Array.from({ length: 6 }, (_, index) => match(`same-${index}`));
  const synergy = engine.getSynergyStats(matches, players);
  assert.equal(synergy.available, false);
  assert.match(synergy.reason, /Tarkib o‘zgarmagan/);
});

test('teammate 1v1 ranking is explicitly deprecated', () => {
  const comparison = engine.getPlayerComparison([match('cmp')], 'p1', 'p2');
  assert.equal(comparison.available, false);
  assert.equal(comparison.replacement, 'self-progress');
  assert.equal(comparison.overallWinner, null);
});

test('auto insights are hypotheses with sample and captain controls', () => {
  const current = match('insight');
  const insights = engine.getMatchInsights(current, [current], players);
  assert.equal(insights.length, 3);
  assert.ok(insights.every(item => item.isHypothesis));
  assert.ok(insights.every(item => item.captainActions.approvable));
  assert.ok(insights.every(item => item.confidence.level === 'insufficient'));
});

test('review-invalid and roster-incomplete team matches cannot produce publishable insights', () => {
  const reviewInvalid = match('review-invalid');
  reviewInvalid.needsReview = true;
  reviewInvalid.validForAnalytics = false;
  assert.deepEqual(engine.getMatchInsights(reviewInvalid, [reviewInvalid], players), []);

  const incompleteTeam = match('incomplete-team', { lineup: players.slice(0, 4) });
  assert.deepEqual(engine.getMatchInsights(incompleteTeam, [incompleteTeam], players), []);
  const teamStats = engine.getTeamStats([incompleteTeam]);
  assert.equal(teamStats.totalMatches, 0);
  assert.equal(teamStats.teamTotalDamageDealt, null);
  assert.equal(teamStats.teamDamagePerMinute, null);
});

test('individual matches never create a fake 100 percent team Damage concentration signal', () => {
  const individual = match('individual-insight', { scope: 'individual', lineup: players.slice(0, 1) });
  const insights = engine.getMatchInsights(individual, [individual], players);
  assert.equal(insights.length, 3);
  assert.ok(insights.every(item => !item.reasonCodes.includes('DAMAGE_CONCENTRATION')));
  assert.ok(insights.every(item => !item.reasonCodes.includes('OBJECTIVE_SIGNAL')));
});

test('match insight baselines count only records with the required complete metric', () => {
  const first = match('baseline-1', { date: '2026-08-01' });
  const second = match('baseline-2', { date: '2026-08-02' });
  const third = match('baseline-3', { date: '2026-08-03' });
  second.playerStats[0].deaths = null;
  third.playerStats[0].deaths = null;
  const current = match('baseline-current', { result: 'loss', date: '2026-08-04' });
  current.playerStats.forEach(stat => { stat.deaths = 8; });

  const risk = engine.getMatchInsights(current, [first, second, third, current], players)[1];
  assert.ok(!risk.reasonCodes.includes('DEATHS_PER_MINUTE_UP'));
  assert.equal(risk.sample.metricSamples.deathsPerMinute, 1);
  assert.equal(risk.sample.metricSamples.turrets, 3);
  assert.equal(risk.sample.baselineMatches, 1);
  assert.equal(risk.confidence.level, 'insufficient');
});

test('death-rate insight exposes its own valid baseline sample and confidence', () => {
  const previous = [1, 2, 3].map(index => {
    const item = match(`death-${index}`, { date: `2026-08-0${index}` });
    item.playerStats.forEach(stat => { stat.deaths = 1; });
    return item;
  });
  const current = match('death-current', { result: 'loss', date: '2026-08-04' });
  current.playerStats.forEach(stat => { stat.deaths = 4; });

  const risk = engine.getMatchInsights(current, [...previous, current], players)[1];
  assert.ok(risk.reasonCodes.includes('DEATHS_PER_MINUTE_UP'));
  assert.equal(risk.sample.baselineMetric, 'deaths-per-minute');
  assert.equal(risk.sample.baselineMatches, 3);
  assert.equal(risk.confidence.level, 'provisional');
});

test('Uzbek match date labels are deterministic and reject impossible dates', () => {
  assert.equal(StatsEngine.formatDateFormatted('2026-08-23'), 'Yak, 23-avg, 2026');
  assert.equal(StatsEngine.formatDateFormatted('2026-02-30'), '2026-02-30');
  assert.equal(StatsEngine.formatDateFormatted(''), '-');
});
