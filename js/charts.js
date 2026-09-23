window.ChartHelper = class ChartHelper {
  static PLAYER_COLORS = [
    '#e7c36b', // corona gold (primary)
    '#d98245', // solar flare (secondary)
    '#63b99d', // muted success
    '#d76578', // muted danger
    '#9b7bb8', // lunar violet
    '#c78154', // solar copper
  ];

  static setupCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    return { ctx, width: rect.width, height: rect.height };
  }

  static drawPieChart(canvasId, data, title) {
    const info = this.setupCanvas(canvasId);
    if (!info) return;
    const { ctx, width, height } = info;
    ctx.clearRect(0, 0, width, height);

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return;

    let startAngle = -0.5 * Math.PI;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2.55;
    const ringWidth = Math.max(14, radius * 0.28);

    // Solar-orbit track: the result ring reads as one instrument, not a generic pie chart.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    data.forEach(slice => {
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      const gap = data.length > 1 ? Math.min(0.025, sliceAngle * 0.12) : 0;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle + gap, startAngle + sliceAngle - gap);
      ctx.strokeStyle = slice.color;
      ctx.lineWidth = ringWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Subtle corona inside the ring.
    const corona = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.7);
    corona.addColorStop(0, 'rgba(231,195,107,0.055)');
    corona.addColorStop(1, 'rgba(231,195,107,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.73, 0, Math.PI * 2);
    ctx.fillStyle = corona;
    ctx.fill();

    if (title) {
      ctx.fillStyle = '#857d6c';
      ctx.font = '700 11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title.toUpperCase(), cx, 14);
    }
  }

  static drawBarChart(canvasId, data, title) {
    const info = this.setupCanvas(canvasId);
    if (!info) return;
    const { ctx, width, height } = info;
    ctx.clearRect(0, 0, width, height);

    const padding = 40;
    const barWidth = (width - padding * 2) / data.length - 12;
    const maxVal = Math.max(...data.map(d => d.value), 1);

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(padding, height - padding, width - padding * 2, 1); // X axis

    data.forEach((item, i) => {
      const barHeight = (item.value / maxVal) * (height - padding * 2 - 24);
      const x = padding + i * (barWidth + 12) + 6;
      const y = height - padding - barHeight;

      // Rounded top bar
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, x + barWidth / 2, height - padding + 16);

      ctx.font = '700 11px JetBrains Mono, monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(item.value.toString(), x + barWidth / 2, y - 6);
    });

    if (title) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 13px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 20);
    }
  }

  static drawLineChart(canvasId, data, color, title) {
    const info = this.setupCanvas(canvasId);
    if (!info) return;
    const { ctx, width, height } = info;
    ctx.clearRect(0, 0, width, height);
    if (data.length < 2) return;

    const padding = 30;
    const maxVal = Math.max(...data.map(d => d.value), 1);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;

    data.forEach((item, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (item.value / maxVal) * (height - padding * 2 - 20);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw points
    data.forEach((item, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (item.value / maxVal) * (height - padding * 2 - 20);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0c101c';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    if (title) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 13px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, width / 2, 20);
    }
  }

  /**
   * Draws a multi-line performance flow chart.
   * @param {string} canvasId - Canvas element ID
   * @param {Array} datasets - Array of { label: string, data: Array<{matchLabel: string, value: number}>, color: string }
   * @param {string} title - Chart title
   */
  static drawMultiLineChart(canvasId, datasets, title) {
    const info = this.setupCanvas(canvasId);
    if (!info) return;
    const { ctx, width, height } = info;
    ctx.clearRect(0, 0, width, height);
    if (!Array.isArray(datasets) || datasets.length === 0) return;

    const compact = width < 620;
    const padding = { top: title ? 38 : 18, right: compact ? 14 : 24, bottom: 34, left: compact ? 38 : 46 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const pointKey = (point, fallbackIndex) => point?.matchId || point?.key || `index:${fallbackIndex}`;
    const timelineMap = new Map();

    datasets.forEach(dataset => {
      (dataset.data || []).forEach((point, index) => {
        const key = pointKey(point, index);
        if (!timelineMap.has(key)) {
          timelineMap.set(key, {
            key,
            label: point?.matchLabel || '',
            order: Number.isFinite(point?.timelineIndex) ? point.timelineIndex : timelineMap.size
          });
        }
      });
    });

    const timeline = [...timelineMap.values()].sort((a, b) => a.order - b.order);
    const timelineIndex = new Map(timeline.map((point, index) => [point.key, index]));
    const values = datasets.flatMap(dataset => (dataset.data || [])
      .map(point => Number(point?.value))
      .filter(value => Number.isFinite(value)));
    if (!timeline.length || !values.length) return;

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const spread = Math.max(maxValue - minValue, 10);
    const yMin = Math.max(0, Math.floor((minValue - spread * 0.12) / 5) * 5);
    const yMax = Math.ceil((maxValue + spread * 0.12) / 5) * 5 || 10;
    const yRange = Math.max(1, yMax - yMin);
    const numPoints = Math.max(timeline.length, 2);
    const xFor = index => padding.left + (index / (numPoints - 1)) * chartWidth;
    const yFor = value => padding.top + chartHeight - ((value - yMin) / yRange) * chartHeight;

    const gridLinesCount = 5;
    ctx.font = `${compact ? 9 : 10}px JetBrains Mono, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let index = 0; index < gridLinesCount; index += 1) {
      const ratio = index / (gridLinesCount - 1);
      const y = padding.top + ratio * chartHeight;
      const value = Math.round(yMax - ratio * yRange);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = '#8f897d';
      ctx.fillText(String(value), padding.left - 9, y);
    }

    ctx.fillStyle = '#8f897d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelStep = Math.max(1, Math.ceil(timeline.length / (compact ? 4 : 6)));
    timeline.forEach((point, index) => {
      const isEdge = index === 0 || index === timeline.length - 1;
      if (!isEdge && index % labelStep !== 0) return;
      ctx.fillText(point.label, xFor(index), height - padding.bottom + 10);
    });

    if (title) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 12px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(title, width / 2, 10);
    }

    datasets.forEach(dataset => {
      const aligned = new Map((dataset.data || []).map((point, index) => [pointKey(point, index), point]));
      let pathOpen = false;
      ctx.beginPath();
      ctx.strokeStyle = dataset.color || '#ffffff';
      ctx.lineWidth = compact ? 1.65 : 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.76;

      timeline.forEach((timelinePoint, index) => {
        const point = aligned.get(timelinePoint.key);
        const value = Number(point?.value);
        if (!Number.isFinite(value)) {
          pathOpen = false;
          return;
        }
        const x = xFor(index);
        const y = yFor(value);
        if (!pathOpen) {
          ctx.moveTo(x, y);
          pathOpen = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      const data = dataset.data || [];
      const endpoint = [...data].reverse().find(point => Number.isFinite(Number(point?.value)));
      if (!endpoint) return;
      const endpointDataIndex = data.lastIndexOf(endpoint);
      const endpointIndex = timelineIndex.get(pointKey(endpoint, endpointDataIndex));
      if (!Number.isFinite(endpointIndex)) return;
      ctx.beginPath();
      ctx.arc(xFor(endpointIndex), yFor(Number(endpoint.value)), compact ? 3 : 4, 0, Math.PI * 2);
      ctx.fillStyle = dataset.color || '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#090805';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // =========================================================================
  //  ESPORTS MATCH POSTER & SHAREABLE GRAPHIC GENERATOR
  // =========================================================================

  static generateMatchGraphic(canvas, match, players) {
    if (!canvas || !match) return;
    const ctx = canvas.getContext('2d');
    const W = 1200;
    const H = 675;
    canvas.width = W;
    canvas.height = H;

    const isWin = match.result === 'win';
    const isLoss = match.result === 'loss';
    const mainAccent = isWin ? '#e7c36b' : isLoss ? '#d76578' : '#c99555';
    const winGold = '#e7c36b';

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#111008');
    bgGrad.addColorStop(0.5, '#090907');
    bgGrad.addColorStop(1, '#040403');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Ambient Cyber Glow Spots
    const glow1 = ctx.createRadialGradient(W * 0.2, 80, 10, W * 0.2, 80, 350);
    glow1.addColorStop(0, isWin ? 'rgba(231, 195, 107, 0.14)' : 'rgba(215, 101, 120, 0.14)');
    glow1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);

    const glow2 = ctx.createRadialGradient(W * 0.8, H * 0.7, 10, W * 0.8, H * 0.7, 400);
    glow2.addColorStop(0, isWin ? 'rgba(217, 130, 69, 0.11)' : 'rgba(201, 149, 85, 0.1)');
    glow2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // 3. Cyber Grid Lines (Subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Outer Border Frame
    ctx.strokeStyle = isWin ? 'rgba(231, 195, 107, 0.38)' : 'rgba(215, 101, 120, 0.38)';
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, W - 30, H - 30);

    // Corner Accents
    ctx.fillStyle = isWin ? '#e7c36b' : '#d76578';
    ctx.fillRect(10, 10, 30, 4);
    ctx.fillRect(10, 10, 4, 30);
    ctx.fillRect(W - 40, 10, 30, 4);
    ctx.fillRect(W - 14, 10, 4, 30);
    ctx.fillRect(10, H - 14, 30, 4);
    ctx.fillRect(10, H - 40, 4, 30);
    ctx.fillRect(W - 40, H - 14, 30, 4);
    ctx.fillRect(W - 14, H - 40, 4, 30);

    // 4. Header Bar
    // Team Logo Text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '900 28px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('ECLIPSE ESPORTS', 40, 40);

    ctx.font = '700 13px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = mainAccent;
    ctx.fillText('MOBILE LEGENDS: BANG BANG • MATCH REPORT', 40, 75);

    // Match Result Badge
    ctx.textAlign = 'right';
    ctx.font = '900 36px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = isWin ? '#63b99d' : isLoss ? '#d76578' : '#c99555';
    ctx.fillText(isWin ? 'VICTORY' : isLoss ? 'DEFEAT' : 'REVIEW', W - 40, 35);

    // Date & Duration Subtitle
    ctx.font = '600 13px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const durStr = match.durationFormatted || (match.durationSeconds ? window.StatsEngine.formatDuration(match.durationSeconds) : '');
    const dateStr = window.StatsEngine.formatDateFormatted(match.date);
    ctx.fillText(`${dateStr} ${durStr ? `• ⏱️ ${durStr}` : ''}`, W - 40, 78);

    // Team Objectives Summary Pill
    const objY = 110;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.roundRect(40, objY, W - 80, 42, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    ctx.textBaseline = 'middle';
    ctx.font = '700 13px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'left';

    const participants = [
      ...(match.playerStats || []).map(stat => ({ ...stat, isGuest: false })),
      ...(match.guestStats || []).map(stat => ({ ...stat, isGuest: true }))
    ].slice(0, 5);
    const hasCompleteKda = participants.length > 0 && participants.every(stat =>
      ['kills', 'deaths', 'assists'].every(key => stat[key] !== null && stat[key] !== undefined && Number.isFinite(Number(stat[key]))));
    const teamKda = hasCompleteKda
      ? participants.reduce((total, stat) => ({
        kills: total.kills + Number(stat.kills),
        deaths: total.deaths + Number(stat.deaths),
        assists: total.assists + Number(stat.assists)
      }), { kills: 0, deaths: 0, assists: 0 })
      : null;

    const objText = teamKda
      ? `TEAM SCORE:  ${teamKda.kills} KILLS  /  ${teamKda.deaths} DEATHS  /  ${teamKda.assists} ASSISTS`
      : 'TEAM SCORE:  DATA UNAVAILABLE';
    ctx.fillText(objText, 60, objY + 21);

    ctx.textAlign = 'right';
    const optional = value => value === null || value === undefined ? '—' : String(value);
    const objDetails = `TURTLES: ${optional(match.teamTurtles)}   •   LORDS: ${optional(match.teamLords)}   •   TURRETS: ${optional(match.teamTurrets)}`;
    ctx.fillStyle = winGold;
    ctx.fillText(objDetails, W - 60, objY + 21);

    // 5. 5 Player Column Cards
    const activeStats = participants;
    const cardWidth = 210;
    const cardGap = 16;
    const startX = 40;
    const startY = 175;
    const cardHeight = 425;

    const roleColors = {
      'EXP Laner': '#f59e0b',
      'Jungler': '#a855f7',
      'Mid Laner': '#e7c36b',
      'Gold Laner': '#d98245',
      'Roamer': '#10b981'
    };

    activeStats.forEach((ps, idx) => {
      const x = startX + idx * (cardWidth + cardGap);
      const pObj = ps.isGuest
        ? { name: ps.guestName || `Guest ${idx + 1}` }
        : (players.find(p => p.id === ps.playerId) || { name: ps.playerName || `Player ${idx + 1}` });
      const role = ps.rolePlayed || 'Rol noma’lum';
      const roleColor = roleColors[role] || '#e7c36b';
      const isMvp = ps.medal === 'mvp';
      const isGold = ps.medal === 'gold';
      const isSilver = ps.medal === 'silver';
      const isBronze = ps.medal === 'bronze';
      const hasMedal = isMvp || isGold || isSilver || isBronze;

      // Card Background Glass — tinted by medal
      const cardGrad = ctx.createLinearGradient(x, startY, x, startY + cardHeight);
      if (isMvp) {
        cardGrad.addColorStop(0, 'rgba(231, 195, 107, 0.13)');
        cardGrad.addColorStop(1, 'rgba(10, 10, 7, 0.97)');
      } else if (isGold) {
        cardGrad.addColorStop(0, 'rgba(231, 195, 107, 0.075)');
        cardGrad.addColorStop(1, 'rgba(10, 10, 7, 0.97)');
      } else if (isSilver) {
        cardGrad.addColorStop(0, 'rgba(203, 213, 225, 0.08)');
        cardGrad.addColorStop(1, 'rgba(10, 10, 7, 0.97)');
      } else if (isBronze) {
        cardGrad.addColorStop(0, 'rgba(180, 120, 60, 0.08)');
        cardGrad.addColorStop(1, 'rgba(10, 10, 7, 0.97)');
      } else {
        cardGrad.addColorStop(0, 'rgba(31, 28, 18, 0.72)');
        cardGrad.addColorStop(1, 'rgba(10, 10, 7, 0.97)');
      }
      ctx.fillStyle = cardGrad;
      ctx.beginPath();
      ctx.roundRect(x, startY, cardWidth, cardHeight, 10);
      ctx.fill();

      // Card Border — colored by medal
      if (isMvp) {
        ctx.strokeStyle = 'rgba(231, 195, 107, 0.68)';
        ctx.lineWidth = 2;
      } else if (isGold) {
        ctx.strokeStyle = 'rgba(231, 195, 107, 0.38)';
        ctx.lineWidth = 1.5;
      } else if (isSilver) {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.4)';
        ctx.lineWidth = 1.5;
      } else if (isBronze) {
        ctx.strokeStyle = 'rgba(180, 120, 60, 0.4)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Role Pill Top
      ctx.fillStyle = roleColor;
      ctx.beginPath();
      ctx.roundRect(x + 12, startY + 12, cardWidth - 24, 22, 4);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.font = '800 11px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${ps.isGuest ? 'GUEST • ' : ''}${role.toUpperCase()}`, x + cardWidth / 2, startY + 23);

      // Player Name — auto-shrink for long IGNs
      const nameMaxW = cardWidth - 28;
      let nameFontSize = 18;
      ctx.font = `800 ${nameFontSize}px Plus Jakarta Sans, sans-serif`;
      while (ctx.measureText(pObj.name).width > nameMaxW && nameFontSize > 11) {
        nameFontSize -= 1;
        ctx.font = `800 ${nameFontSize}px Plus Jakarta Sans, sans-serif`;
      }
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(pObj.name, x + cardWidth / 2, startY + 58, nameMaxW);

      // Hero Used Name — also constrained
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 13px Plus Jakarta Sans, sans-serif';
      ctx.fillText(ps.heroUsed || 'Unknown', x + cardWidth / 2, startY + 80, nameMaxW);

      // Medal Banner — prominent visual pill for all medal types
      const medalBannerY = startY + 96;
      const medalBannerH = 28;
      const medalPillX = x + 14;
      const medalPillW = cardWidth - 28;

      if (isMvp) {
        // MVP — golden glow banner
        ctx.fillStyle = 'rgba(231, 195, 107, 0.2)';
        ctx.beginPath();
        ctx.roundRect(medalPillX, medalBannerY, medalPillW, medalBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(231, 195, 107, 0.48)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = winGold;
        ctx.font = '800 12px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑 MVP OF THE MATCH', x + cardWidth / 2, medalBannerY + medalBannerH / 2 + 1);
      } else if (isGold) {
        // Gold Medal — warm gold banner
        ctx.fillStyle = 'rgba(231, 195, 107, 0.14)';
        ctx.beginPath();
        ctx.roundRect(medalPillX, medalBannerY, medalPillW, medalBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(231, 195, 107, 0.33)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#e7c36b';
        ctx.font = '800 12px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🥇 GOLD MEDAL', x + cardWidth / 2, medalBannerY + medalBannerH / 2 + 1);
      } else if (isSilver) {
        // Silver Medal — cool silver banner
        ctx.fillStyle = 'rgba(203, 213, 225, 0.12)';
        ctx.beginPath();
        ctx.roundRect(medalPillX, medalBannerY, medalPillW, medalBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '800 12px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🥈 SILVER MEDAL', x + cardWidth / 2, medalBannerY + medalBannerH / 2 + 1);
      } else if (isBronze) {
        // Chocolate/Bronze — warm brown banner
        ctx.fillStyle = 'rgba(180, 120, 60, 0.15)';
        ctx.beginPath();
        ctx.roundRect(medalPillX, medalBannerY, medalPillW, medalBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#d97706';
        ctx.font = '800 12px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🍫 CHOCOLATE MEDAL', x + cardWidth / 2, medalBannerY + medalBannerH / 2 + 1);
      }

      // K / D / A Main Box
      const kdaY = startY + 140;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.roundRect(x + 12, kdaY, cardWidth - 24, 62, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 10px Plus Jakarta Sans, sans-serif';
      ctx.fillText('KILLS / DEATHS / ASSISTS', x + cardWidth / 2, kdaY + 16);

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 20px JetBrains Mono, monospace';
      const kdaText = ['kills', 'deaths', 'assists'].every(key => ps[key] !== null && ps[key] !== undefined)
        ? `${ps.kills} / ${ps.deaths} / ${ps.assists}`
        : '— / — / —';
      ctx.fillText(kdaText, x + cardWidth / 2, kdaY + 42);

      // In-Game Rating Score
      const scoreY = kdaY + 75;
      ctx.textAlign = 'left';
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Match Score:', x + 20, scoreY);
      ctx.textAlign = 'right';
      ctx.font = '800 14px JetBrains Mono, monospace';
      ctx.fillStyle = (isMvp || isGold) ? winGold : isSilver ? '#d9e2e5' : isBronze ? '#92703f' : '#e7c36b';
      const score = window.StatsEngine.numberOrNull(ps.inGameScore);
      ctx.fillText(score === null ? '—' : score.toFixed(1), x + cardWidth - 20, scoreY);

      // Hero Damage Dealt
      const dmgY = scoreY + 26;
      ctx.textAlign = 'left';
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Hero Damage:', x + 20, dmgY);
      ctx.textAlign = 'right';
      ctx.font = '700 13px JetBrains Mono, monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(window.StatsEngine.formatLargeNumber(ps.damageDealt), x + cardWidth - 20, dmgY);

      // Turret Damage
      const turrY = dmgY + 26;
      ctx.textAlign = 'left';
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Turret Dmg:', x + 20, turrY);
      ctx.textAlign = 'right';
      ctx.font = '700 13px JetBrains Mono, monospace';
      ctx.fillStyle = '#10b981';
      ctx.fillText(window.StatsEngine.formatLargeNumber(ps.turretDamage), x + cardWidth - 20, turrY);

      // Teamfight Part.
      const tfY = turrY + 26;
      ctx.textAlign = 'left';
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('TF Part.:', x + 20, tfY);
      ctx.textAlign = 'right';
      ctx.font = '700 13px JetBrains Mono, monospace';
      ctx.fillStyle = '#e7c36b';
      const teamfight = window.StatsEngine.numberOrNull(ps.teamfightParticipation);
      ctx.fillText(teamfight === null ? '—' : `${teamfight}%`, x + cardWidth - 20, tfY);

      // Gold Earned
      const goldY = tfY + 26;
      ctx.textAlign = 'left';
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Gold Earned:', x + 20, goldY);
      ctx.textAlign = 'right';
      ctx.font = '700 13px JetBrains Mono, monospace';
      ctx.fillStyle = winGold;
      ctx.fillText(window.StatsEngine.formatLargeNumber(ps.goldEarned), x + cardWidth - 20, goldY);

      // Special Savage / Maniac Badges Bottom
      if (ps.savage || ps.maniac) {
        const achY = goldY + 28;
        ctx.textAlign = 'center';
        ctx.font = '800 11px Plus Jakarta Sans, sans-serif';
        if (ps.savage) {
          ctx.fillStyle = '#ef4444';
          ctx.fillText('🔥 SAVAGE ACHIEVED', x + cardWidth / 2, achY);
        } else if (ps.maniac) {
          ctx.fillStyle = '#a855f7';
          ctx.fillText('⚡ MANIAC ACHIEVED', x + cardWidth / 2, achY);
        }
      }
    });

    // 6. Watermark Footer
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillText('ECLIPSE ESPORTS STATS TRACKER • OFFICIAL PRO REPORT', W / 2, H - 22);
  }

  static downloadCanvasAsPng(canvas, filename = 'eclipse_match_report.png') {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  static async copyCanvasToClipboard(canvas) {
    if (!canvas || !navigator.clipboard || !window.ClipboardItem) {
      if (window.showToast) window.showToast('Bu brauzer rasmni to‘g‘ridan-to‘g‘ri nusxalamaydi. PNG yuklab oling.', 'warning');
      return false;
    }
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        if (window.showToast) window.showToast('Match kartasi nusxalandi — Discord yoki WhatsAppga joylang.', 'success');
      });
      return true;
    } catch (err) {
      if (window.showToast) window.showToast('Rasmni nusxalab bo‘lmadi. PNG yuklab olishdan foydalaning.', 'warning');
      return false;
    }
  }
};
