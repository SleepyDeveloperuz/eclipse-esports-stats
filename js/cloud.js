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

  setCloudUrl(url) {
    let cleanUrl = (url || '').trim();
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    if (cleanUrl && !cleanUrl.endsWith('.json')) cleanUrl += '/eclipse_data.json';
    localStorage.setItem(this.CONFIG_KEY, cleanUrl);
  }

  isConfigured() {
    return !!this.getCloudUrl();
  }

  async syncDown() {
    const url = this.getCloudUrl();
    if (!url) return false;

    try {
      this.isSyncing = true;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data && (data.matches || data.players)) {
        if (data.players) this.db.savePlayers(data.players);
        if (data.matches) this.db.saveMatches(data.matches);
        if (data.heroes) localStorage.setItem(this.db.HEROES_KEY, JSON.stringify(data.heroes));
        if (data.training_progress) localStorage.setItem('mlbb-jamoa-dasturi-progress', JSON.stringify(data.training_progress));
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
    const url = this.getCloudUrl();
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

      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
        if (window.showToast) window.showToast("Ma'lumotlar bulutga sinxronlandi! ☁️", "success");
        return true;
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
