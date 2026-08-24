window.CloudSync = class CloudSync {
  constructor(dataStore) {
    this.db = dataStore;
    this.CONFIG_KEY = 'eclipse_firebase_url';
    this.LAST_SYNC_KEY = 'eclipse_last_cloud_sync';
    this.isSyncing = false;
  }

  getCloudUrl() {
    return localStorage.getItem(this.CONFIG_KEY) || '';
  }

  getEffectiveUrl() {
    const custom = this.getCloudUrl();
    if (custom) return custom;
    // Built-in Vercel serverless API sync endpoint
    return '/api/sync';
  }

  setCloudUrl(url) {
    let cleanUrl = (url || '').trim();
    if (cleanUrl) {
      if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
      if (!cleanUrl.endsWith('.json') && cleanUrl.includes('firebaseio.com')) {
        cleanUrl += '/eclipse_data.json';
      }
    }
    localStorage.setItem(this.CONFIG_KEY, cleanUrl);
  }

  isConfigured() {
    return true; // Built-in cloud sync is always available
  }

  async syncDown() {
    const url = this.getEffectiveUrl();
    if (!url) return false;

    try {
      this.isSyncing = true;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) return false;
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data && (data.matches || data.players)) {
        if (Array.isArray(data.players) && data.players.length > 0) {
          this.db.savePlayers(data.players);
        }
        if (Array.isArray(data.matches)) {
          this.db.saveMatches(data.matches);
        }
        if (Array.isArray(data.heroes) && data.heroes.length > 0) {
          localStorage.setItem(this.db.HEROES_KEY, JSON.stringify(data.heroes));
        }
        if (data.training_progress) {
          localStorage.setItem('mlbb-jamoa-dasturi-progress', JSON.stringify(data.training_progress));
        }
        localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
        return true;
      }
      return false;
    } catch (e) {
      console.warn("Cloud sync down warning:", e.message);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  async syncUp() {
    const url = this.getEffectiveUrl();
    if (!url) return false;

    try {
      this.isSyncing = true;
      const payload = {
        players: this.db.getPlayers(),
        matches: this.db.getMatches(),
        heroes: localStorage.getItem(this.db.HEROES_KEY) ? JSON.parse(localStorage.getItem(this.db.HEROES_KEY)) : [],
        training_progress: localStorage.getItem('mlbb-jamoa-dasturi-progress') ? JSON.parse(localStorage.getItem('mlbb-jamoa-dasturi-progress')) : {},
        updatedAt: new Date().toISOString()
      };

      const isCustomFirebase = url.includes('firebaseio.com') || url.endsWith('.json');
      const method = isCustomFirebase ? 'PUT' : 'POST';

      const token = window.EclipseApp && window.EclipseApp.authManager ? window.EclipseApp.authManager.getToken() : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(url, {
        method: method,
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
        if (window.showToast) window.showToast("Ma'lumotlar bulutga avtomatik saqlandi! ☁️", "success");
        return true;
      } else if (res.status === 401) {
        if (window.showToast) window.showToast("Sessiya eskirgan yoki ruxsat yo'q. Iltimos Admin sifatida kiring.", "warning");
        if (window.EclipseApp && window.EclipseApp.authManager) {
          window.EclipseApp.authManager.logout();
          window.EclipseApp.authManager.showLoginModal();
        }
        return false;
      }
      return false;
    } catch (e) {
      console.error("Cloud sync up error:", e);
      return false;
    } finally {
      this.isSyncing = false;
    }
  }
};
