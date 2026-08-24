window.ChartHelper = class ChartHelper {
  static PLAYER_COLORS = [
    '#00f0ff', // neon cyan (primary)
    '#fbbf24', // cyber gold (secondary)
    '#10b981', // emerald green (success)
    '#f43f5e', // rose red (danger)
    '#a855f7', // electric purple
    '#f97316', // bright orange
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
    const cy = height / 2 + 10;
    const radius = Math.min(width, height) / 2.5;

    data.forEach(slice => {
      const sliceAngle = (slice.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.fillStyle = slice.color;
      ctx.fill();
      ctx.strokeStyle = '#0c101c';
      ctx.lineWidth = 2;
      ctx.stroke();
      startAngle += sliceAngle;
    });

    // Draw inner hole for clean donut look
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#0c101c';
    ctx.fill();

    if (title) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 13px Plus Jakarta Sans, Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, cx, 20);
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
    if (!datasets || datasets.length === 0) return;

    const padding = { top: 40, right: 30, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find overall max value and longest labels array
    let maxVal = 1;
    let longestLabels = [];
    
    datasets.forEach(ds => {
      ds.data.forEach(d => {
        if (d.value > maxVal) maxVal = d.value;
      });
      if (ds.data.length > longestLabels.length) {
        longestLabels = ds.data.map(item => item.matchLabel);
      }
    });
    // Give maxVal a little headroom
    maxVal = Math.ceil(maxVal * 1.1);
    
    // Draw horizontal grid lines and Y-axis labels
    const gridLinesCount = 5;
    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;

    for (let i = 0; i < gridLinesCount; i++) {
      const yPos = padding.top + (i / (gridLinesCount - 1)) * chartHeight;
      const val = Math.round(maxVal - (i / (gridLinesCount - 1)) * maxVal);
      
      // grid line
      ctx.beginPath();
      ctx.moveTo(padding.left, yPos);
      ctx.lineTo(width - padding.right, yPos);
      ctx.stroke();
      
      // label
      ctx.fillText(val.toString(), padding.left - 10, yPos);
    }

    // Draw X-axis labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const numPoints = Math.max(longestLabels.length, 2);
    longestLabels.forEach((label, i) => {
      const xPos = padding.left + (i / (numPoints - 1)) * chartWidth;
      ctx.fillText(label, xPos, height - padding.bottom + 10);
    });

    // Draw Title
    if (title) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 14px Plus Jakarta Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(title, width / 2, 10);
    }

    // Draw Lines with smooth styling
    datasets.forEach(ds => {
      if (!ds.data || ds.data.length < 2) return;
      
      ctx.beginPath();
      ctx.strokeStyle = ds.color || '#ffffff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.95;
      
      ds.data.forEach((item, i) => {
        const xPos = padding.left + (i / (numPoints - 1)) * chartWidth;
        const yPos = padding.top + chartHeight - (item.value / maxVal) * chartHeight;
        
        if (i === 0) ctx.moveTo(xPos, yPos);
        else ctx.lineTo(xPos, yPos);
      });
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });

    // Draw Points with outer ring
    datasets.forEach(ds => {
      if (!ds.data) return;
      ctx.fillStyle = ds.color || '#ffffff';
      
      ds.data.forEach((item, i) => {
        const xPos = padding.left + (i / (numPoints - 1)) * chartWidth;
        const yPos = padding.top + chartHeight - (item.value / maxVal) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(xPos, yPos, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#06080d'; 
        ctx.lineWidth = 2;
        ctx.stroke();
      });
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
    const mainAccent = isWin ? '#00d4ff' : '#ef4444';
    const winGold = '#ffd700';

    // 1. Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, '#0a0e1a');
    bgGrad.addColorStop(0.5, '#0f172a');
    bgGrad.addColorStop(1, '#05070e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // 2. Ambient Cyber Glow Spots
    const glow1 = ctx.createRadialGradient(W * 0.2, 80, 10, W * 0.2, 80, 350);
    glow1.addColorStop(0, isWin ? 'rgba(0, 212, 255, 0.15)' : 'rgba(239, 68, 68, 0.15)');
    glow1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);

    const glow2 = ctx.createRadialGradient(W * 0.8, H * 0.7, 10, W * 0.8, H * 0.7, 400);
    glow2.addColorStop(0, isWin ? 'rgba(255, 215, 0, 0.12)' : 'rgba(245, 158, 11, 0.1)');
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
    ctx.strokeStyle = isWin ? 'rgba(0, 212, 255, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(15, 15, W - 30, H - 30);

    // Corner Accents
    ctx.fillStyle = isWin ? '#00d4ff' : '#ef4444';
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
    ctx.fillText('🌑 ECLIPSE ESPORTS', 40, 40);

    ctx.font = '700 13px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = mainAccent;
    ctx.fillText('MOBILE LEGENDS: BANG BANG • MATCH REPORT', 40, 75);

    // Match Result Badge
    ctx.textAlign = 'right';
    ctx.font = '900 36px Plus Jakarta Sans, Inter, Arial, sans-serif';
    ctx.fillStyle = isWin ? '#10b981' : '#ef4444';
    ctx.fillText(isWin ? 'VICTORY' : 'DEFEAT', W - 40, 35);

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

    let tKills = 0, tDeaths = 0, tAssists = 0;
    (match.playerStats || []).forEach(p => {
      tKills += Number(p.kills) || 0;
      tDeaths += Number(p.deaths) || 0;
      tAssists += Number(p.assists) || 0;
    });

    const objText = `TEAM SCORE:  ${tKills} KILLS  /  ${tDeaths} DEATHS  /  ${tAssists} ASSISTS`;
    ctx.fillText(objText, 60, objY + 21);

    ctx.textAlign = 'right';
    const objDetails = `TURTLES: ${match.teamTurtles || 0}   •   LORDS: ${match.teamLords || 0}   •   TURRETS: ${match.teamTurrets || 0}`;
    ctx.fillStyle = winGold;
    ctx.fillText(objDetails, W - 60, objY + 21);

    // 5. 5 Player Column Cards
    const activeStats = (match.playerStats || []).slice(0, 5);
    const cardWidth = 210;
    const cardGap = 16;
    const startX = 40;
    const startY = 175;
    const cardHeight = 425;

    const roleColors = {
      'EXP Laner': '#f59e0b',
      'Jungler': '#a855f7',
      'Mid Laner': '#00d4ff',
      'Gold Laner': '#ffd700',
      'Roamer': '#10b981'
    };

    activeStats.forEach((ps, idx) => {
      const x = startX + idx * (cardWidth + cardGap);
      const pObj = players.find(p => p.id === ps.playerId) || { name: `Player ${idx+1}` };
      const role = ps.rolePlayed || 'EXP Laner';
      const roleColor = roleColors[role] || '#00d4ff';
      const isMvp = ps.medal === 'mvp';
      const isGold = ps.medal === 'gold';
      const isSilver = ps.medal === 'silver';
      const isBronze = ps.medal === 'bronze';
      const hasMedal = isMvp || isGold || isSilver || isBronze;

      // Card Background Glass — tinted by medal
      const cardGrad = ctx.createLinearGradient(x, startY, x, startY + cardHeight);
      if (isMvp) {
        cardGrad.addColorStop(0, 'rgba(255, 215, 0, 0.14)');
        cardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      } else if (isGold) {
        cardGrad.addColorStop(0, 'rgba(255, 215, 0, 0.08)');
        cardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      } else if (isSilver) {
        cardGrad.addColorStop(0, 'rgba(203, 213, 225, 0.08)');
        cardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      } else if (isBronze) {
        cardGrad.addColorStop(0, 'rgba(180, 120, 60, 0.08)');
        cardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      } else {
        cardGrad.addColorStop(0, 'rgba(30, 41, 59, 0.7)');
        cardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
      }
      ctx.fillStyle = cardGrad;
      ctx.beginPath();
      ctx.roundRect(x, startY, cardWidth, cardHeight, 10);
      ctx.fill();

      // Card Border — colored by medal
      if (isMvp) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.lineWidth = 2;
      } else if (isGold) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
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
      ctx.fillText(role.toUpperCase(), x + cardWidth / 2, startY + 23);

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
        ctx.fillStyle = 'rgba(255, 215, 0, 0.22)';
        ctx.beginPath();
        ctx.roundRect(medalPillX, medalBannerY, medalPillW, medalBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = winGold;
        ctx.font = '800 12px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑 MVP OF THE MATCH', x + cardWidth / 2, medalBannerY + medalBannerH / 2 + 1);
      } else if (isGold) {
        // Gold Medal — warm gold banner
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.beginPath();
        ctx.roundRect(medalPillX, medalBannerY, medalPillW, medalBannerH, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffd700';
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
      ctx.fillText(`${ps.kills || 0} / ${ps.deaths || 0} / ${ps.assists || 0}`, x + cardWidth / 2, kdaY + 42);

      // In-Game Rating Score
      const scoreY = kdaY + 75;
      ctx.textAlign = 'left';
      ctx.font = '600 12px Plus Jakarta Sans, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Match Score:', x + 20, scoreY);
      ctx.textAlign = 'right';
      ctx.font = '800 14px JetBrains Mono, monospace';
      ctx.fillStyle = (isMvp || isGold) ? winGold : isSilver ? '#e2e8f0' : isBronze ? '#d97706' : '#00d4ff';
      ctx.fillText(Number(ps.inGameScore || 0).toFixed(1), x + cardWidth - 20, scoreY);

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
      ctx.fillStyle = '#00d4ff';
      ctx.fillText(`${ps.teamfightParticipation || 0}%`, x + cardWidth - 20, tfY);

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
      if (window.showToast) window.showToast('Direct image copy not supported in this browser. Please use Download PNG!', 'warning');
      return false;
    }
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        if (window.showToast) window.showToast('📋 Match card copied to clipboard! Paste directly into Discord or WhatsApp.', 'success');
      });
      return true;
    } catch (err) {
      if (window.showToast) window.showToast('Could not copy to clipboard. Please use Download PNG!', 'warning');
      return false;
    }
  }
};

