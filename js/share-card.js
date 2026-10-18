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
      ctx.letterSpacing = '2px';
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
        const isWin = r.isWin === true;
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
  }

  if (typeof window !== 'undefined') {
    window.EclipseShareCard = EclipseShareCard;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EclipseShareCard };
  }
})();
