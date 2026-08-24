import re
import sys

css_path = '/Users/khusniddindev/.gemini/antigravity/scratch/eclipse-esports-stats/css/style.css'
with open(css_path, 'r') as f:
    css = f.read()

# 1. TOPBAR
css = re.sub(
    r'\.topbar \{.*?\n\}',
    '''.topbar {
  height: var(--header-height);
  background: var(--bg-card-glass);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-light);
  border-image: linear-gradient(to right, transparent, rgba(0, 212, 255, 0.5), transparent) 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-4);
  position: sticky;
  top: 0;
  z-index: 90;
}''',
    css, flags=re.DOTALL
)

css = css.replace('.mobile-toggle {', '/* removed .mobile-toggle */ .old-mobile-toggle {')

css += '''
.hamburger {
  position: absolute;
  left: var(--space-4);
  display: none; 
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 1.5rem;
  cursor: pointer;
}
'''

# 2. SIDEBAR LOGO
css = re.sub(
    r'\.sidebar-logo \{.*?\n\}',
    '''.sidebar-logo {
  height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border-light);
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 1px;
}''',
    css, flags=re.DOTALL
)

css = css.replace('.sidebar-logo span {', '.sidebar-logo span.old {')
css += '''
.sidebar-logo .logo-icon {
  font-size: 2rem;
  color: var(--primary);
}
.sidebar-logo h1 {
  font-size: 1rem;
  margin-top: 0.25rem;
  margin-bottom: 0;
  color: var(--text-primary);
}
.sidebar-logo .logo-subtitle {
  font-size: 0.7rem;
  color: var(--text-muted);
}
'''

# 3 & 4. SUB BADGE AND CHART
css += '''
/* Substitution Indicator Badge Styles */
.sub-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}
.sub-toggle.playing {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: var(--success);
}
.sub-toggle.benched {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: var(--warning);
}
.player-stat-row.benched {
  opacity: 0.4;
  pointer-events: none;
  filter: grayscale(0.5);
}
.player-stat-row.benched .form-input,
.player-stat-row.benched .form-select {
  background: rgba(0,0,0,0.3);
}

/* Performance Chart Styles */
.trend-chart-container {
  position: relative;
  width: 100%;
  height: 280px;
  background: rgba(0,0,0,0.2);
  border-radius: 10px;
  border: 1px solid var(--border-light);
  padding: 1rem;
}
.trend-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.75rem;
}
.trend-chart-legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
.trend-chart-legend-item .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
'''

# 5. GENERAL DESIGN POLISH
css = css.replace('.page-section.active {\\n  display: block;\\n}', '.page-section.active {\\n  display: block;\\n  padding: var(--space-4);\\n  max-width: 1440px;\\n  margin: 0 auto;\\n}')
css = css.replace('.stat-card--primary:hover { border-color: var(--primary); box-shadow: 0 0 20px rgba(0, 212, 255, 0.15); }', 
                  '.stat-card--primary:hover { border-color: var(--primary); box-shadow: 0 0 20px rgba(0, 212, 255, 0.15); }\\n.stat-card--gold:hover { border-color: var(--secondary); box-shadow: 0 0 20px rgba(255, 215, 0, 0.15); }\\n.stat-card--danger:hover { border-color: var(--danger); box-shadow: 0 0 20px rgba(239, 68, 68, 0.15); }')
css = css.replace('background: rgba(255, 255, 255, 0.02);', 'background: rgba(0, 212, 255, 0.04);', 1)

css += '''
.btn i {
  margin-right: 0.35rem;
}
.sidebar-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-light);
  color: var(--text-muted);
  font-size: 0.75rem;
  text-align: center;
}
.award-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 20px rgba(255,215,0,0.15);
}
'''

css = css.replace('max-width: 600px;', 'max-width: 800px;')

css = css.replace('@media (max-width: 768px) {', '@media (max-width: 768px) {\\n  .hamburger {\\n    display: block;\\n  }')

with open(css_path, 'w') as f:
    f.write(css)

print("CSS updated via python.")
