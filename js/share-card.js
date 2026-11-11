// Eclipse Esports Stats — High-Resolution Canvas Share Card Generator (PNG)
(() => {
  'use strict';

  class EclipseShareCard {
    static async downloadPlayerCard(playerData) {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const {
        name = 'Eclipse Operative',
        role = 'All-Rounder',
        winRate = '—',
        matchesCount = 0,
        kda = '—',
        mvpCount = 0,
        streakCount = 0,
        recentResults = [],
        topHero = 'MLBB Hero'
      } = playerData;

      // 1. Background Gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
      bgGrad.addColorStop(0, '#0a0d14');
      bgGrad.addColorStop(0.5, '#0f121a');
      bgGrad.addColorStop(1, '#080a0f');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1200, 630);

      // 2. Cyberpunk Grid & Accent Lines
      ctx.strokeStyle = 'rgba(228, 196, 110, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 40; x < 1200; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 630);
        ctx.stroke();
      }
      for (let y = 40; y < 630; y += 60) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1200, y);
        ctx.stroke();
      }

      // Outer Gold Frame
      ctx.strokeStyle = '#e4c46e';
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 24, 1152, 582);

      // Inner subtle border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(32, 32, 1136, 566);

      // Corner tech brackets
      ctx.fillStyle = '#e4c46e';
      const cornerSize = 16;
      ctx.fillRect(20, 20, cornerSize, 4);
      ctx.fillRect(20, 20, 4, cornerSize);
      ctx.fillRect(1180 - cornerSize, 20, cornerSize, 4);
      ctx.fillRect(1176, 20, 4, cornerSize);
      ctx.fillRect(20, 606, cornerSize, 4);
      ctx.fillRect(20, 594, 4, cornerSize);
      ctx.fillRect(1180 - cornerSize, 606, cornerSize, 4);
      ctx.fillRect(1176, 594, 4, cornerSize);

      // 3. Top Header
      ctx.fillStyle = '#e4c46e';
      ctx.font = 'bold 16px monospace';
      try { ctx.letterSpacing = '2px'; } catch (_) {}
      ctx.fillText('ECLIPSE ESPORTS // OPERATIVE STATS DOSSIER', 60, 72);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '14px monospace';
      ctx.fillText('OFFICIAL MLBB ANALYTICS', 940, 72);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(60, 92);
      ctx.lineTo(1140, 92);
      ctx.stroke();

      // 4. Player Identity (Left Column)
      // Avatar placeholder circle with gold glow
      ctx.save();
      ctx.shadowColor = 'rgba(228, 196, 110, 0.4)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#181b24';
      ctx.strokeStyle = '#e4c46e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(130, 210, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Initials in avatar
      ctx.fillStyle = '#e4c46e';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      const initials = (name.slice(0, 2) || 'EC').toUpperCase();
      ctx.fillText(initials, 130, 225);

      // Player Name
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 46px sans-serif';
      ctx.fillText(name, 220, 195);

      // Role Badge
      ctx.fillStyle = 'rgba(228, 196, 110, 0.18)';
      ctx.strokeStyle = 'rgba(228, 196, 110, 0.5)';
      ctx.lineWidth = 1;
      ctx.fillRect(220, 215, 200, 36);
      ctx.strokeRect(220, 215, 200, 36);
      ctx.fillStyle = '#e4c46e';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(role.toUpperCase(), 235, 240);

      // 5. Stat Metric Cards (Right Column)
      const metrics = [
        { label: 'WIN RATE', val: winRate, color: '#e4c46e' },
        { label: 'MATCHLAR', val: String(matchesCount), color: '#ffffff' },
        { label: 'KDA RATIO', val: kda, color: '#4ee2db' },
        { label: 'MVP COUNT', val: String(mvpCount), color: '#fbbf24' }
      ];

      metrics.forEach((m, idx) => {
        const x = 60 + idx * 270;
        const y = 300;
        const w = 250;
        const h = 120;

        // Card background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        // Metric label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(m.label, x + 20, y + 36);

        // Metric value
        ctx.fillStyle = m.color;
        ctx.font = 'bold 42px monospace';
        ctx.fillText(m.val, x + 20, y + 92);
      });

      // 6. Recent Form (Pills) & Signature Hero (Bottom Row)
      // Form Label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('SO‘NGGI MATCHLAR FORMASI:', 60, 475);

      // Form Pills
      recentResults.slice(0, 5).forEach((r, idx) => {
        const px = 300 + idx * 46;
        const py = 452;
        const isWin = typeof r === 'string'
          ? (r.toLowerCase() === 'win' || r.toLowerCase() === 'w')
          : (r?.isWin === true);
        ctx.fillStyle = isWin ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = isWin ? '#10b981' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.fillRect(px, py, 36, 32);
        ctx.strokeRect(px, py, 36, 32);

        ctx.fillStyle = isWin ? '#10b981' : '#ef4444';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isWin ? 'W' : 'L', px + 18, py + 22);
      });

      // Win Streak if present
      ctx.textAlign = 'left';
      if (streakCount >= 2) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.fillRect(550, 452, 190, 32);
        ctx.strokeRect(550, 452, 190, 32);
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`🔥 ${streakCount} KETMA-KET G‘ALABA`, 565, 474);
      }

      // Signature Hero
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('ENG KO‘P O‘YNALGAN HERO:', 770, 475);
      ctx.fillStyle = '#e4c46e';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(topHero, 990, 475);

      // 7. Footer Watermark
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(60, 530);
      ctx.lineTo(1140, 530);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '13px monospace';
      ctx.fillText('ECLIPSE ESPORTS // eclipseesports.vercel.app', 60, 570);
      ctx.fillText(new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: 'long', day: 'numeric' }), 980, 570);

      // 8. Trigger PNG Download
      const dataUrl = canvas.toDataURL('image/png');
      const safeFilename = `eclipse-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-card.png`;

      const link = document.createElement('a');
      link.download = safeFilename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.showToast?.(`📸 ${name} statistikasi PNG rasm ko‘rinishida yuklandi!`);
      window.eclipseAudio?.playSuccess?.();
    }

    static async downloadDailyScrimCard(reportData) {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 675;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const {
        date = new Date().toISOString().slice(0, 10),
        totalMatches = 0,
        wins = 0,
        losses = 0,
        winRate = '0%',
        mvpName = 'Eclipse MVP',
        mvpKda = '0.0',
        mvpHero = 'MLBB Hero',
        earlyStats = { count: 0, wr: '—' },
        midStats = { count: 0, wr: '—' },
        lateStats = { count: 0, wr: '—' },
        coachVerdict = 'Barqaror jamoaviy o‘yin namoyish etildi.'
      } = reportData;

      // 1. Cyberpunk Dark Gradient Background
      const bg = ctx.createLinearGradient(0, 0, 1200, 675);
      bg.addColorStop(0, '#07090e');
      bg.addColorStop(0.5, '#0e121a');
      bg.addColorStop(1, '#05070a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1200, 675);

      // 2. Tactical grid pattern
      ctx.strokeStyle = 'rgba(228, 196, 110, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 40; x < 1200; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 675);
        ctx.stroke();
      }
      for (let y = 40; y < 675; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1200, y);
        ctx.stroke();
      }

      // Outer Gold Frame
      ctx.strokeStyle = '#e4c46e';
      ctx.lineWidth = 3;
      ctx.strokeRect(24, 24, 1152, 627);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(32, 32, 1136, 611);

      // Corner tech brackets
      const cSize = 18;
      ctx.fillStyle = '#e4c46e';
      ctx.fillRect(20, 20, cSize, 4);
      ctx.fillRect(20, 20, 4, cSize);
      ctx.fillRect(1180 - cSize, 20, cSize, 4);
      ctx.fillRect(1176, 20, 4, cSize);
      ctx.fillRect(20, 651, cSize, 4);
      ctx.fillRect(20, 651 - cSize + 4, 4, cSize);
      ctx.fillRect(1180 - cSize, 651, cSize, 4);
      ctx.fillRect(1176, 651 - cSize + 4, 4, cSize);

      // 3. Header
      ctx.fillStyle = '#e4c46e';
      ctx.font = 'bold 15px monospace';
      try { ctx.letterSpacing = '3px'; } catch (_) {}
      ctx.fillText('ECLIPSE ESPORTS // OFFICIAL DAILY SCRIM REPORT', 60, 72);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`SANASI: ${date}`, 1140, 72);
      ctx.textAlign = 'left';

      ctx.strokeStyle = 'rgba(228, 196, 110, 0.25)';
      ctx.beginPath();
      ctx.moveTo(60, 92);
      ctx.lineTo(1140, 92);
      ctx.stroke();

      // 4. Large Score Board (Left Side)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.fillRect(60, 115, 480, 240);
      ctx.strokeRect(60, 115, 480, 240);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('KUNNING UMUMIY HISOBI', 85, 148);

      ctx.font = 'bold 76px monospace';
      ctx.fillStyle = '#10b981';
      ctx.fillText(`${wins}W`, 85, 235);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 54px monospace';
      ctx.fillText('–', 225, 232);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 76px monospace';
      ctx.fillText(`${losses}L`, 270, 235);

      ctx.fillStyle = 'rgba(228, 196, 110, 0.15)';
      ctx.strokeStyle = '#e4c46e';
      ctx.lineWidth = 1.5;
      ctx.fillRect(85, 280, 230, 46);
      ctx.strokeRect(85, 280, 230, 46);

      ctx.fillStyle = '#e4c46e';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`⚡ ${winRate} WIN RATE`, 105, 310);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '14px monospace';
      ctx.fillText(`Jami: ${totalMatches} ta match`, 335, 310);

      // 5. Game Dynamics / Duration Section (Right Side)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(560, 115, 580, 240);
      ctx.strokeRect(560, 115, 580, 240);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('O‘YIN DAVOMIYLIGI DINAMIKASI', 585, 148);

      const timingItems = [
        { label: 'EARLY GAME (<12m)', wr: earlyStats.wr, count: earlyStats.count, color: '#10b981' },
        { label: 'MID GAME (12-18m)', wr: midStats.wr, count: midStats.count, color: '#60a5fa' },
        { label: 'LATE GAME (>18m)', wr: lateStats.wr, count: lateStats.count, color: '#f59e0b' }
      ];

      timingItems.forEach((t, i) => {
        const yPos = 180 + i * 50;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(585, yPos - 18, 530, 42);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(t.label, 600, yPos + 8);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '11px sans-serif';
        ctx.fillText(`${t.count} match`, 780, yPos + 8);

        ctx.fillStyle = t.color;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(t.wr, 1095, yPos + 9);
        ctx.textAlign = 'left';
      });

      // 6. MVP Operative Banner
      ctx.fillStyle = 'rgba(228, 196, 110, 0.05)';
      ctx.strokeStyle = 'rgba(228, 196, 110, 0.35)';
      ctx.fillRect(60, 375, 1080, 110);
      ctx.strokeRect(60, 375, 1080, 110);

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 13px monospace';
      ctx.fillText('🏆 KUNNING MVP O‘YINCHISI', 85, 405);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(mvpName, 85, 448);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '15px monospace';
      ctx.fillText(`KDA: ${mvpKda}  ·  Asosiy Hero: ${mvpHero}`, 85, 472);

      // 7. Coach Verdict
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(60, 505, 1080, 75);
      ctx.strokeRect(60, 505, 1080, 75);

      ctx.fillStyle = 'rgba(228, 196, 110, 0.8)';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('💡 MURABBIY XULOSASI (COACH VERDICT):', 85, 532);

      ctx.fillStyle = '#d1d5db';
      ctx.font = 'italic 14px sans-serif';
      ctx.fillText(coachVerdict.slice(0, 115) + (coachVerdict.length > 115 ? '...' : ''), 85, 558);

      // 8. Footer
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '12px monospace';
      ctx.fillText('ECLIPSE ESPORTS MLBB ANALYTICS // eclipseesports.vercel.app', 60, 615);
      ctx.textAlign = 'right';
      ctx.fillText('VERIFIED SCRIM LEDGER', 1140, 615);
      ctx.textAlign = 'left';

      // Download PNG
      const dataUrl = canvas.toDataURL('image/png');
      const safeFilename = `eclipse-scrim-report-${date}.png`;
      const link = document.createElement('a');
      link.download = safeFilename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.showToast?.(`📸 ${date} kunlik scrim hisoboti HD rasm sifatida yuklandi!`, 'success');
      window.eclipseAudio?.playSuccess?.();
    }

    static calculateDailyScrimData(matches = [], targetDate = null) {
      const date = targetDate || new Date().toISOString().slice(0, 10);
      const dayMatches = matches.filter(m => (m.date || '').slice(0, 10) === date);
      const totalMatches = dayMatches.length;

      let wins = 0;
      const timing = {
        early: { total: 0, wins: 0 },
        mid: { total: 0, wins: 0 },
        late: { total: 0, wins: 0 }
      };
      const playerStatsMap = {};

      dayMatches.forEach(m => {
        const isWin = m.result === 'win' || m.result === 'G‘alaba' || m.isWin === true;
        if (isWin) wins++;

        let durSec = 900;
        if (Number.isFinite(Number(m.durationSeconds))) {
          durSec = Number(m.durationSeconds);
        } else if (typeof m.duration === 'string') {
          const parts = m.duration.split(':').map(Number);
          durSec = (parts[0] || 0) * 60 + (parts[1] || 0);
        }

        if (durSec < 720) {
          timing.early.total++;
          if (isWin) timing.early.wins++;
        } else if (durSec <= 1080) {
          timing.mid.total++;
          if (isWin) timing.mid.wins++;
        } else {
          timing.late.total++;
          if (isWin) timing.late.wins++;
        }

        const participants = m.playerStats || m.participants || [];
        participants.forEach(p => {
          const name = p.playerName || p.name;
          if (!name) return;
          if (!playerStatsMap[name]) {
            playerStatsMap[name] = { name, kills: 0, deaths: 0, assists: 0, matches: 0, mvpCount: 0, heroes: [] };
          }
          const st = playerStatsMap[name];
          st.kills += Number(p.kills) || 0;
          st.deaths += Number(p.deaths) || 0;
          st.assists += Number(p.assists) || 0;
          st.matches++;
          if (p.medal === 'mvp' || p.isMvp) st.mvpCount++;
          if (p.heroUsed || p.heroName) st.heroes.push(p.heroUsed || p.heroName);
        });
      });

      const losses = totalMatches - wins;
      const winRate = totalMatches ? `${Math.round((wins / totalMatches) * 100)}%` : '0%';

      let mvpPlayer = null;
      let bestScore = -1;
      Object.values(playerStatsMap).forEach(p => {
        const kda = p.deaths === 0 ? (p.kills + p.assists) : (p.kills + p.assists) / p.deaths;
        const score = (kda * 10) + (p.mvpCount * 25) + (p.matches * 5);
        if (score > bestScore) {
          bestScore = score;
          mvpPlayer = { ...p, kda: kda.toFixed(1) };
        }
      });

      let coachVerdict = '';
      if (timing.late.total > 0 && (timing.late.wins / timing.late.total) < 0.5) {
        coachVerdict = '18+ daqiqadan oshgan uzun o‘yinlarda qiyinchilik sezildi. Lord atrofidagi positioning va teamfight timinglariga ko‘proq urg‘u berish zarur.';
      } else if (timing.early.total > 0 && (timing.early.wins / timing.early.total) >= 0.75) {
        coachVerdict = 'Erta o‘yin (Early game) va Turtle nazorati a’lo darajada o‘tdi. Tajovuzkor Snowball strategiyasini saqlab qolish kerak.';
      } else {
        coachVerdict = 'Barqaror jamoaviy o‘yin namoyish etildi. Xatolar kam va jamoaviy sinergiya o‘smoqda.';
      }

      const earlyWr = timing.early.total ? `${Math.round((timing.early.wins / timing.early.total) * 100)}%` : '—';
      const midWr = timing.mid.total ? `${Math.round((timing.mid.wins / timing.mid.total) * 100)}%` : '—';
      const lateWr = timing.late.total ? `${Math.round((timing.late.wins / timing.late.total) * 100)}%` : '—';

      return {
        date,
        totalMatches,
        wins,
        losses,
        winRate,
        mvpName: mvpPlayer?.name || 'Eclipse Jamoasi',
        mvpKda: mvpPlayer?.kda || '—',
        mvpHero: mvpPlayer?.heroes?.[0] || 'MLBB Hero',
        earlyStats: { count: timing.early.total, wr: earlyWr },
        midStats: { count: timing.mid.total, wr: midWr },
        lateStats: { count: timing.late.total, wr: lateWr },
        coachVerdict,
        mvpPlayer
      };
    }

    static generateDailyScrimText(matches = [], targetDate = null) {
      const data = this.calculateDailyScrimData(matches, targetDate);
      if (!data.totalMatches) {
        return `📊 **ECLIPSE ESPORTS // KUNLIK SCRIM HISOBOTI**\n📅 Sana: **${data.date}**\n\nUshbu kunda hali matchlar qayd etilmagan.`;
      }

      return [
        `📊 **ECLIPSE ESPORTS // KUNLIK SCRIM HISOBOTI**`,
        `📅 Sana: **${data.date}**`,
        `⚔️ Natija: **${data.totalMatches} ta match** (${data.wins}W – ${data.losses}L) · **${data.winRate} WR**`,
        ``,
        data.mvpPlayer ? `🏆 **KUNNING MVP O‘YINCHISI:**\n⭐️ **${data.mvpName}** — KDA: **${data.mvpKda}** · Asosiy Hero: ${data.mvpHero}\n` : '',
        `⏱ **O‘YIN DAVOMIYLIGI DINAMIKASI:**`,
        `• Early Game (<12m): **${data.earlyStats.count} ta** (${data.earlyStats.wr} WR)`,
        `• Mid Game (12-18m): **${data.midStats.count} ta** (${data.midStats.wr} WR)`,
        `• Late Game (>18m): **${data.lateStats.count} ta** (${data.lateStats.wr} WR) ${data.lateStats.count && parseInt(data.lateStats.wr) < 50 ? '⚠️' : ''}`,
        ``,
        `💡 **MURABBIY XULOSASI (COACH VERDICT):**`,
        `_${data.coachVerdict}_`,
        ``,
        `🔗 *Eclipse Esports Analytics Hub*`
      ].filter(Boolean).join('\n');
    }

    static openDailyScrimModal(matches = []) {
      document.getElementById('dailyScrimModal')?.remove();

      // Collect unique match dates descending
      const dates = [...new Set(matches.map(m => (m.date || '').slice(0, 10)).filter(Boolean))].sort().reverse();
      const initialDate = dates[0] || new Date().toISOString().slice(0, 10);

      const dialog = document.createElement('dialog');
      dialog.id = 'dailyScrimModal';
      dialog.className = 'scouting-dialog daily-scrim-dialog';

      dialog.innerHTML = `
        <div class="scouting-modal">
          <header class="scouting-modal__header">
            <div>
              <p class="scouting-modal__eyebrow">ECL // DAILY SCRIM SUMMARY</p>
              <h3><i class="fa-solid fa-file-invoice"></i> Kunlik Scrim Hisoboti</h3>
            </div>
            <button type="button" class="scouting-modal__close" data-close title="Yopish (Esc)"><kbd>ESC</kbd></button>
          </header>

          <div class="scouting-form">
            <div class="scouting-form-row">
              <label>
                <span>Hisobot Sanasini Tanlang:</span>
                <select class="form-select" id="scrimDateSelect">
                  ${dates.map(d => `<option value="${d}" ${d === initialDate ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
              </label>
            </div>

            <div id="scrimSummaryPreview" class="scrim-summary-preview">
              <!-- Live preview inserted here -->
            </div>

            <div class="scouting-form-footer">
              <button type="button" class="btn btn-secondary" id="copyScrimTextBtn">
                <i class="fa-solid fa-copy"></i> Telegram / Discord uchun nusxalash
              </button>
              <button type="button" class="btn btn-primary" id="downloadScrimCardBtn">
                <i class="fa-solid fa-image"></i> HD Rasm (1200x675) Yuklab olish
              </button>
              <button type="button" class="btn btn-secondary" id="sendTelegramBotBtn" title="Telegram kanalga yuborish">
                <i class="fa-brands fa-telegram"></i> Botga yuborish
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
      dialog.showModal();

      const updatePreview = () => {
        const selDate = dialog.querySelector('#scrimDateSelect').value;
        const data = this.calculateDailyScrimData(matches, selDate);
        const previewContainer = dialog.querySelector('#scrimSummaryPreview');

        if (!data.totalMatches) {
          previewContainer.innerHTML = `
            <div class="empty-state" style="padding: 1.5rem; text-align: center;">
              <p style="color: var(--text-muted); margin: 0;">Ushbu sanada matchlar topilmadi.</p>
            </div>
          `;
          return;
        }

        previewContainer.innerHTML = `
          <div class="scrim-preview-card">
            <div class="scrim-preview-header">
              <div class="scrim-preview-score">
                <span class="preview-win">${data.wins}W</span>
                <span class="preview-dash">–</span>
                <span class="preview-loss">${data.losses}L</span>
                <span class="preview-wr">${data.winRate} WR</span>
              </div>
              <span class="preview-count">${data.totalMatches} ta match</span>
            </div>

            <div class="scrim-preview-timing">
              <div class="preview-timing-box">
                <small>Early (<12m)</small>
                <strong>${data.earlyStats.count} ta · ${data.earlyStats.wr}</strong>
              </div>
              <div class="preview-timing-box">
                <small>Mid (12-18m)</small>
                <strong>${data.midStats.count} ta · ${data.midStats.wr}</strong>
              </div>
              <div class="preview-timing-box">
                <small>Late (>18m)</small>
                <strong>${data.lateStats.count} ta · ${data.lateStats.wr}</strong>
              </div>
            </div>

            <div class="scrim-preview-mvp">
              <i class="fa-solid fa-crown" style="color: #fbbf24;"></i>
              <div>
                <strong>${data.mvpName}</strong> (KDA: ${data.mvpKda} · ${data.mvpHero})
              </div>
            </div>

            <div class="scrim-preview-coach">
              <i class="fa-solid fa-lightbulb" style="color: var(--primary);"></i>
              <p>${data.coachVerdict}</p>
            </div>
          </div>
        `;
      };

      updatePreview();
      dialog.querySelector('#scrimDateSelect').addEventListener('change', updatePreview);

      // Copy text button
      dialog.querySelector('#copyScrimTextBtn').addEventListener('click', async () => {
        const selDate = dialog.querySelector('#scrimDateSelect').value;
        const text = this.generateDailyScrimText(matches, selDate);
        try {
          await navigator.clipboard.writeText(text);
          window.showToast?.('📋 Hisobot matni nusxalandi! Telegram yoki Discordga tashlashingiz mumkin.', 'success');
        } catch (_) {
          window.showToast?.('Nusxalashda xatolik yuz berdi.', 'error');
        }
      });

      // Download HD card button
      dialog.querySelector('#downloadScrimCardBtn').addEventListener('click', async () => {
        const selDate = dialog.querySelector('#scrimDateSelect').value;
        const data = this.calculateDailyScrimData(matches, selDate);
        await this.downloadDailyScrimCard(data);
      });

      // Send to Telegram Bot button
      dialog.querySelector('#sendTelegramBotBtn').addEventListener('click', async () => {
        const selDate = dialog.querySelector('#scrimDateSelect').value;
        const token = window.EclipseApp?.authManager?.getToken?.();
        if (!token) {
          window.showToast?.('Faqat login qilgan admin bot orqali yubora oladi.', 'error');
          return;
        }

        const btn = dialog.querySelector('#sendTelegramBotBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yuborilmoqda...';

        try {
          const res = await fetch('/api/telegram', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              action: 'send_daily_summary',
              date: selDate
            })
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.ok) {
            window.showToast?.('🚀 Kunlik scrim hisoboti Telegram kanalga yuborildi!', 'success');
          } else {
            throw new Error(json.error || 'Yuborishda xatolik');
          }
        } catch (err) {
          window.showToast?.(`Telegram xatosi: ${err.message}`, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-brands fa-telegram"></i> Botga yuborish';
        }
      });

      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => dialog.remove());
    }
  }

  if (typeof window !== 'undefined') {
    window.EclipseShareCard = EclipseShareCard;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EclipseShareCard };
  }
})();
