window.CloudSync = class CloudSync {
  constructor(dataStore) {
    this.db = dataStore;
    this.LEGACY_CONFIG_KEY = 'eclipse_firebase_url';
    this.LAST_SYNC_KEY = 'eclipse_last_cloud_sync';
    this.PENDING_KEY = 'eclipse_cloud_pending_write';
    this.WRITE_ID_KEY = 'eclipse_cloud_write_id';
    this.ACK_ID_KEY = 'eclipse_cloud_ack_id';
    this.REVISION_KEY = 'eclipse_cloud_revision';
    this.BASELINE_KEY = 'eclipse_cloud_baseline';
    this.CONFLICT_KEY = 'eclipse_cloud_conflict';
    this.isSyncing = false;
    this.status = 'idle';
    this.lastError = '';
    this.listeners = new Set();
    this.activeReads = 0;
    this.queuedWrites = 0;
    this.writeGeneration = 0;
    this.writeQueue = Promise.resolve();

    // Older builds allowed arbitrary Firebase URLs. They are deliberately
    // retired so an Eclipse bearer token can never leave this origin.
    localStorage.removeItem(this.LEGACY_CONFIG_KEY);
  }

  subscribe(callback) {
    if (typeof callback !== 'function') return () => {};
    this.listeners.add(callback);
    callback(this.getStatus());
    return () => this.listeners.delete(callback);
  }

  getStatus() {
    return {
      state: this.status,
      syncing: this.isSyncing,
      pending: this.hasPendingWrite(),
      lastSync: localStorage.getItem(this.LAST_SYNC_KEY),
      error: this.lastError
    };
  }

  hasPendingWrite() {
    const writeId = localStorage.getItem(this.WRITE_ID_KEY);
    // Separate write/ack IDs survive another tab clearing the legacy flag.
    // An old response can acknowledge only its own mutation, never a newer one.
    return localStorage.getItem(this.PENDING_KEY) === 'true'
      || (!!writeId && writeId !== localStorage.getItem(this.ACK_ID_KEY));
  }

  notifyStatus() {
    const snapshot = this.getStatus();
    this.listeners.forEach(callback => callback(snapshot));
    window.dispatchEvent?.(new CustomEvent('eclipse:sync-status', { detail: snapshot }));
  }

  setStatus(state, error = '') {
    this.status = state;
    this.lastError = error;
    this.notifyStatus();
  }

  refreshSyncing() {
    this.isSyncing = this.activeReads > 0 || this.queuedWrites > 0;
    this.notifyStatus();
  }

  getCloudUrl() {
    return '';
  }

  getEffectiveUrl() {
    return '/api/sync';
  }

  setCloudUrl() {
    localStorage.removeItem(this.LEGACY_CONFIG_KEY);
    return false;
  }

  isConfigured() {
    return true;
  }

  cleanHeroes(heroes) {
    const invalidNames = new Set(['azuma', 'exor', 'mulan']);
    return Array.isArray(heroes)
      ? heroes.filter(hero => hero?.name && !invalidNames.has(String(hero.name).toLowerCase()))
      : [];
  }

  replaceHeroesFromRemote(data) {
    if (!Array.isArray(data?.heroes)) return false;
    const cleanHeroes = this.cleanHeroes(data.heroes);
    const explicitEmptyCatalog = data.heroCatalogInitialized === true && data.heroes.length === 0;

    // An old/empty remote payload must not erase the full built-in MLBB list.
    // An intentional empty catalog is only accepted with the explicit marker.
    if (cleanHeroes.length === 0 && !explicitEmptyCatalog) return false;

    localStorage.setItem(this.db.HEROES_KEY, JSON.stringify(cleanHeroes));
    const heroDb = window.EclipseApp?.heroDb;
    if (heroDb) {
      heroDb.heroes = cleanHeroes;
      heroDb.save?.();
    }
    return true;
  }

  async syncDown() {
    const url = this.getEffectiveUrl();

    // Never overwrite unsynced local admin work with an older cloud snapshot.
    if (this.hasPendingWrite()) {
      window.showToast?.('Lokal o‘zgarishlar hali bulutga saqlanmagan. Avval sinxronlashni qayta urinib ko‘ring.', 'warning');
      return false;
    }

    const generation = this.writeGeneration;
    const sharedWriteAtStart = localStorage.getItem(this.WRITE_ID_KEY);
    const localAtStart = this.localSnapshotSignature();

    this.activeReads += 1;
    this.isSyncing = true;
    this.setStatus('syncing');
    try {
      const token = window.EclipseApp?.authManager?.getAccessToken?.() || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(url, { headers, cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        if (res.status === 401) {
          this.setStatus('locked', payload.error || 'Jamoa kirishi talab qilinadi');
          window.EclipseApp?.authManager?.showViewerLoginModal?.(
            () => this.syncDown(),
            { mandatory: true }
          );
          return false;
        }
        if (res.status === 404) {
          this.setStatus('empty');
          return false;
        }
        if (res.status === 503) {
          this.setStatus('error', payload.error || 'Cloud sync serveri sozlanmagan');
          return false;
        }
        throw new Error(payload.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const hasSnapshot = data && typeof data === 'object' && (
        Object.prototype.hasOwnProperty.call(data, 'players')
        || Object.prototype.hasOwnProperty.call(data, 'matches')
        || Object.prototype.hasOwnProperty.call(data, 'heroes')
      );
      if (!hasSnapshot) {
        this.setStatus('empty');
        return false;
      }

      const remoteRevision = this.parseRevision(data.revision);
      if (remoteRevision === null) {
        this.setStatus('error', 'Cloud snapshot revisioni noto‘g‘ri');
        return false;
      }
      if (remoteRevision < this.getRevision()) {
        this.setStatus('error', 'Cloud snapshot lokal holatdan eski. Lokal ma’lumot saqlandi.');
        return false;
      }

      // A write can start (and even finish) while GET/JSON decoding is pending.
      // Compare actual local content too: not every editor queues a write at once.
      if (generation !== this.writeGeneration || localAtStart !== this.localSnapshotSignature()
        || sharedWriteAtStart !== localStorage.getItem(this.WRITE_ID_KEY) || this.hasPendingWrite()) return false;

      if (Array.isArray(data.players)) this.db.savePlayers(data.players);
      if (Array.isArray(data.matches)) this.db.saveMatches(data.matches);
      this.replaceHeroesFromRemote(data);
      this.setRevision(remoteRevision);
      this.storeBaseline(data, remoteRevision);
      localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
      this.setStatus('synced');
      return true;
    } catch (error) {
      console.warn('Cloud sync down warning:', error.message);
      this.setStatus(navigator.onLine ? 'error' : 'offline', error.message);
      return false;
    } finally {
      this.activeReads = Math.max(0, this.activeReads - 1);
      this.refreshSyncing();
    }
  }

  getLiveHeroPayload() {
    // HeroDatabase is in-memory per tab; the saved catalog is shared by tabs.
    const stored = localStorage.getItem(this.db.HEROES_KEY);
    if (stored) {
      try {
        const heroes = JSON.parse(stored);
        if (Array.isArray(heroes)) return { heroes: this.cleanHeroes(heroes), initialized: true };
      } catch { /* Fall back to the live catalog, never manufacture an empty one. */ }
    }
    const heroDb = window.EclipseApp?.heroDb;
    if (heroDb?.getAll) {
      return { heroes: this.cleanHeroes(heroDb.getAll()), initialized: true };
    }

    return { heroes: [], initialized: false };
  }

  buildPayload() {
    const heroPayload = this.getLiveHeroPayload();
    return {
      players: this.db.getPlayers(),
      matches: this.db.getMatches(),
      heroes: heroPayload.heroes,
      heroCatalogInitialized: heroPayload.initialized,
      baseRevision: this.getRevision(),
      updatedAt: new Date().toISOString()
    };
  }

  getRevision() {
    const value = Number(localStorage.getItem(this.REVISION_KEY));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }

  parseRevision(value) {
    const revision = Number(value);
    return Number.isInteger(revision) && revision >= 0 ? revision : null;
  }

  setRevision(value) {
    const revision = this.parseRevision(value);
    if (revision !== null) {
      localStorage.setItem(this.REVISION_KEY, String(revision));
    }
  }

  recordVersion(item) {
    const source = JSON.stringify(item || {});
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `h:${(hash >>> 0).toString(36)}`;
  }

  localSnapshotSignature() {
    return JSON.stringify([this.db.getPlayers(), this.db.getMatches(), this.getLiveHeroPayload()]);
  }

  buildVersionList(items) {
    return (Array.isArray(items) ? items : [])
      .filter(item => item?.id)
      .map(item => [String(item.id), this.recordVersion(item)]);
  }

  storeBaseline(snapshot, revision = snapshot?.revision) {
    const parsedRevision = this.parseRevision(revision);
    if (parsedRevision === null) return false;
    const baseline = {
      version: 2,
      revision: parsedRevision,
      players: this.buildVersionList(snapshot?.players),
      matches: this.buildVersionList(snapshot?.matches),
      records: { players: snapshot?.players || [], matches: snapshot?.matches || [] }
    };
    try {
      localStorage.setItem(this.BASELINE_KEY, JSON.stringify(baseline));
      return true;
    } catch {
      localStorage.removeItem(this.BASELINE_KEY);
      return false;
    }
  }

  getBaseline(expectedRevision) {
    try {
      const baseline = JSON.parse(localStorage.getItem(this.BASELINE_KEY) || 'null');
      if (!baseline || ![1, 2].includes(baseline.version) || baseline.revision !== expectedRevision) return null;
      const toMap = entries => new Map(
        (Array.isArray(entries) ? entries : [])
          .filter(entry => Array.isArray(entry) && entry.length === 2)
      );
      return {
        players: toMap(baseline.players),
        matches: toMap(baseline.matches),
        records: baseline.records || {}
      };
    } catch {
      return null;
    }
  }

  async fetchRemoteSnapshot() {
    const token = window.EclipseApp?.authManager?.getAccessToken?.() || '';
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(this.getEffectiveUrl(), { headers, cache: 'no-store' });
    if (!response.ok) throw new Error('Cloud yangiliklarini olib bo‘lmadi');
    const data = await response.json();
    if (!data || !Array.isArray(data.players) || !Array.isArray(data.matches)) {
      throw new Error('Cloud snapshot formati noto‘g‘ri');
    }
    if (this.parseRevision(data.revision) === null) {
      throw new Error('Cloud snapshot revisioni noto‘g‘ri');
    }
    return data;
  }

  mergeRemoteSnapshot(remote, choices = {}) {
    const localRevision = this.getRevision();
    const remoteRevision = this.parseRevision(remote?.revision);
    if (remoteRevision === null || remoteRevision < localRevision) {
      throw new Error('Cloud conflict snapshot revisioni yaroqsiz');
    }
    const baseline = this.getBaseline(localRevision);
    const conflicts = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const mergeById = (kind, remoteItems, localItems, baselineVersions) => {
      const originals = new Map((baseline?.records?.[kind] || []).map(item => [String(item.id), item]));
      const remoteById = new Map((Array.isArray(remoteItems) ? remoteItems : [])
        .filter(item => item?.id)
        .map(item => [String(item.id), item]));
      const localById = new Map((Array.isArray(localItems) ? localItems : [])
        .filter(item => item?.id)
        .map(item => [String(item.id), item]));
      const ids = new Set([...remoteById.keys(), ...localById.keys()]);
      const merged = [];

      ids.forEach(id => {
        const remoteItem = remoteById.get(id);
        const localItem = localById.get(id);
        const baselineVersion = baselineVersions?.get(id);
        const choiceKey = `${kind}:${id}`;
        let selected;
        let resolved = false;
        if (choices[choiceKey] === 'local' || choices[choiceKey] === 'remote') {
          selected = choices[choiceKey] === 'local' ? localItem : remoteItem;
          resolved = true;
        } else if (same(localItem, remoteItem)) {
          selected = localItem;
          resolved = true;
        } else if (baselineVersion !== undefined) {
          const localChanged = !localItem || this.recordVersion(localItem) !== baselineVersion;
          const remoteChanged = !remoteItem || this.recordVersion(remoteItem) !== baselineVersion;
          if (!localChanged) { selected = remoteItem; resolved = true; }
          else if (!remoteChanged) { selected = localItem; resolved = true; }
        }

        if (!resolved && remoteItem && localItem && originals.has(id)) {
          const original = originals.get(id);
          const mergedFields = { ...remoteItem };
          const disputed = [];
          const fields = new Set([...Object.keys(original), ...Object.keys(localItem), ...Object.keys(remoteItem)]);
          fields.delete('updatedAt');
          for (const field of fields) {
            if (same(localItem[field], remoteItem[field]) || same(localItem[field], original[field])) continue;
            if (same(remoteItem[field], original[field])) {
              if (localItem[field] === undefined) delete mergedFields[field];
              else mergedFields[field] = localItem[field];
            } else disputed.push(field);
          }
          if (!disputed.length) {
            selected = { ...mergedFields, updatedAt: new Date().toISOString() };
            resolved = true;
          } else conflicts.push({ key: choiceKey, kind, id, fields: disputed, local: localItem, remote: remoteItem });
        } else if (!resolved && baselineVersion === undefined && (!remoteItem || !localItem)) {
          selected = localItem || remoteItem;
          resolved = true;
        } else if (!resolved) {
          conflicts.push({ key: choiceKey, kind, id, fields: ['record'], local: localItem, remote: remoteItem });
        }

        if (selected) merged.push(selected);
      });
      return merged;
    };
    const players = mergeById('players', remote.players, this.db.getPlayers(), baseline?.players);
    const matches = mergeById('matches', remote.matches, this.db.getMatches(), baseline?.matches);
    if (conflicts.length) {
      this.pendingConflict = { remote, conflicts, localSignature: this.localSnapshotSignature() };
      try { localStorage.setItem(this.CONFLICT_KEY, JSON.stringify(this.pendingConflict)); } catch { /* local data remains untouched */ }
      const error = new Error('Bir yozuv ikki qurilmada o‘zgargan. Nusxalarni tanlang; hech biri ustidan yozilmadi.');
      error.code = 'LOCAL_MERGE_CONFLICT';
      throw error;
    }
    this.db.savePlayers(players);
    this.db.saveMatches(matches);
    if (!this.getLiveHeroPayload().initialized) this.replaceHeroesFromRemote(remote);
    this.setRevision(remoteRevision);
    this.storeBaseline(remote, remoteRevision);
    localStorage.removeItem(this.CONFLICT_KEY);
    this.pendingConflict = null;
  }

  showConflictDialog() {
    if (typeof document === 'undefined' || document.getElementById('syncConflictDialog')) return;
    let pending = this.pendingConflict;
    try { pending ||= JSON.parse(localStorage.getItem(this.CONFLICT_KEY) || 'null'); } catch { return; }
    if (!pending?.conflicts?.length) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'syncConflictDialog';
    dialog.className = 'sync-conflict-dialog';
    const form = document.createElement('form');
    const title = document.createElement('h2');
    title.textContent = 'Ikki qurilmadagi o‘zgarishlar';
    const intro = document.createElement('p');
    intro.textContent = 'Har yozuv uchun saqlanadigan nusxani tanlang. Bekor qilsangiz, lokal ma’lumot saqlanib turadi.';
    form.append(title, intro);
    pending.conflicts.forEach((conflict, index) => {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = `${conflict.kind === 'players' ? 'O‘yinchi' : 'Match'}: ${conflict.local?.name || conflict.remote?.name || conflict.id} · ${conflict.fields.join(', ')}`;
      fieldset.append(legend);
      ['local', 'remote'].forEach(side => {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = `record-${index}`; radio.value = side; radio.required = true;
        const detail = document.createElement('pre');
        detail.textContent = conflict[side] ? JSON.stringify(conflict[side], null, 2) : 'O‘chirilgan';
        label.append(radio, side === 'local' ? ' Shu qurilma' : ' Server', detail);
        fieldset.append(label);
      });
      form.append(fieldset);
    });
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const save = document.createElement('button'); save.type = 'submit'; save.className = 'btn btn-primary'; save.textContent = 'Tanlangan nusxalarni saqlash';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = 'Keyinroq';
    cancel.addEventListener('click', () => dialog.close());
    form.append(status, save, cancel);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!window.EclipseApp?.authManager?.isAdmin?.()) { status.textContent = 'Admin sifatida kiring.'; return; }
      if (pending.localSignature !== this.localSnapshotSignature()) {
        status.textContent = 'Lokal ma’lumot o‘zgardi. Oynani yoping va sinxronlashni qayta bosing.';
        return;
      }
      const selections = Object.fromEntries(pending.conflicts.map((item, i) => [item.key, form.elements[`record-${i}`].value]));
      save.disabled = true;
      try {
        this.mergeRemoteSnapshot(pending.remote, selections);
        dialog.close();
        await this.syncUp();
      } catch (error) { status.textContent = error.message; save.disabled = false; }
    });
    dialog.append(form); document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  syncUp() {
    const generation = ++this.writeGeneration;
    const writeId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${generation}`;
    this.queuedWrites += 1;
    localStorage.setItem(this.WRITE_ID_KEY, writeId);
    localStorage.setItem(this.PENDING_KEY, 'true');
    this.isSyncing = true;
    this.setStatus('syncing');

    const operation = this.writeQueue.then(
      () => this.performSyncUp(generation, 0, writeId),
      () => this.performSyncUp(generation, 0, writeId)
    );
    this.writeQueue = operation.catch(() => false);

    return operation.finally(() => {
      this.queuedWrites = Math.max(0, this.queuedWrites - 1);
      this.refreshSyncing();
    });
  }

  async performSyncUp(generation, conflictRetry = 0, writeId) {
    const url = this.getEffectiveUrl();
    try {
      const token = window.EclipseApp?.authManager?.getToken?.() || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const requestPayload = this.buildPayload();
      const sentSignature = this.localSnapshotSignature();
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestPayload)
      });

      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        const acceptedRevision = this.parseRevision(payload.revision);
        if (acceptedRevision === null || acceptedRevision <= requestPayload.baseRevision) {
          if (generation === this.writeGeneration) {
            this.setStatus('error', 'Cloud serveri yaroqli yangi revision qaytarmadi');
          }
          return false;
        }
        // Another tab may have accepted a later revision while this response
        // was in flight. Never move the shared revision/baseline backwards.
        if (acceptedRevision < this.getRevision()) return true;
        this.setRevision(acceptedRevision);
        this.storeBaseline(requestPayload, acceptedRevision);
        localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
        if (generation === this.writeGeneration
          && writeId === localStorage.getItem(this.WRITE_ID_KEY)
          && sentSignature === this.localSnapshotSignature()) {
          localStorage.setItem(this.ACK_ID_KEY, writeId);
          localStorage.removeItem(this.PENDING_KEY);
          this.setStatus('synced');
          window.showToast?.("Ma'lumotlar bulutga saqlandi", 'success');
        }
        return true;
      }

      if (res.status === 401) {
        if (generation === this.writeGeneration) {
          this.setStatus('locked', payload.error || 'Admin sessiyasi eskirgan');
          window.showToast?.("Sessiya eskirgan yoki ruxsat yo'q. Iltimos Admin sifatida kiring.", 'warning');
          window.EclipseApp?.authManager?.logout?.();
          window.EclipseApp?.authManager?.showLoginModal?.();
        }
        return false;
      }

      if (res.status === 409 && payload.code === 'DATA_REVISION_CONFLICT' && conflictRetry < 1) {
        const remote = await this.fetchRemoteSnapshot();
        this.mergeRemoteSnapshot(remote);
        window.showToast?.('Cloud yangiligi lokal ma’lumot bilan birlashtirildi. Saqlash qayta urinilmoqda.', 'info');
        return this.performSyncUp(generation, conflictRetry + 1, writeId);
      }

      if (generation === this.writeGeneration) {
        const message = res.status === 404
          ? 'Cloud sync endpointi topilmadi'
          : payload.error || 'Cloud saqlash bajarilmadi';
        this.setStatus('error', message);
        window.showToast?.('Cloud saqlash bajarilmadi. Lokal ma’lumot saqlandi va keyingi syncda qayta yuboriladi.', 'warning');
      }
      return false;
    } catch (error) {
      console.error('Cloud sync up error:', error);
      if (generation === this.writeGeneration) {
        this.setStatus(error.code === 'LOCAL_MERGE_CONFLICT' ? 'conflict' : navigator.onLine ? 'error' : 'offline', error.message);
        if (error.code === 'LOCAL_MERGE_CONFLICT') this.showConflictDialog();
      }
      return false;
    }
  }
};
