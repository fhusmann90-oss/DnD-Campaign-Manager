/**
 * sync.js
 * ---------------------------------------------------------------------------
 * Gerätübergreifende Synchronisierung über Supabase (ab 1.4) - bewusst ohne
 * Zusatzbibliothek, nur mit fetch() gegen die beiden Supabase-Schnittstellen:
 *   - Auth  (/auth/v1/...): Login per E-Mail-Link oder Code, Token erneuern
 *   - Daten (/rest/v1/campaign_state): EINE Zeile pro Konto mit dem gesamten
 *     Kampagnenstand als JSON (Spalte data) und updated_at (setzt die DB)
 *
 * Ablauf:
 *   - Jede lokale Änderung wird sofort in localStorage gespeichert (wie bisher)
 *     und als "ungesichert" markiert. ~1,5 s nach der letzten Änderung wird
 *     hochgeladen. Offline bleibt die Markierung stehen; beim nächsten
 *     Verbinden wird automatisch nachgeholt.
 *   - Beim Start, beim Wiederverbinden und beim Zurückkehren in den Tab wird
 *     geprüft, ob die Cloud einen neueren Stand hat (anderes Gerät).
 *   - Konflikt (lokal UND in der Cloud geändert seit dem letzten Abgleich):
 *     der zuletzt geänderte Stand gewinnt. Ist die Cloud-Version neuer als
 *     die lokale Änderung, wird vorher nachgefragt. Der jeweils verworfene
 *     Stand wird als Sicherung aufgehoben (im Sync-Menü herunterladbar).
 * ---------------------------------------------------------------------------
 */

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const META_KEY = 'dnd-campaign-tracker:sync-meta';
const SESSION_KEY = 'dnd-campaign-tracker:auth';
const BACKUP_KEY = 'dnd-campaign-tracker:sync-backup';
const LOCAL_CONFIG_KEY = 'dnd-campaign-tracker:cloud-config';
const PUSH_DELAY_MS = 1500;
const TABLE = 'campaign_state';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { console.warn('localStorage nicht beschreibbar', e); }
}

function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(part).split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json);
  } catch (e) { return {}; }
}

/** Zeitstempel aus Postgres ("2026-10-14T10:58:01.123456+00:00") robust
 *  in Millisekunden umwandeln (manche Browser mögen keine 6 Nachkommastellen). */
export function toMs(iso) {
  if (!iso) return 0;
  const norm = String(iso).replace(/(\.\d{3})\d+/, '$1').replace(/([+-]\d{2})$/, '$1:00');
  const t = Date.parse(norm);
  return Number.isFinite(t) ? t : 0;
}

/** Fehler, bei dem der Server gar nicht erreichbar war (offline, pausiert, DNS). */
class NetworkError extends Error {}
class AuthError extends Error {}

export function getCloudConfig() {
  if (SUPABASE_URL && SUPABASE_KEY) return { url: SUPABASE_URL.replace(/\/+$/, ''), key: SUPABASE_KEY, source: 'file' };
  const local = readJSON(LOCAL_CONFIG_KEY, null);
  if (local && local.url && local.key) return { url: String(local.url).replace(/\/+$/, ''), key: local.key, source: 'device' };
  return null;
}

export function setDeviceCloudConfig(url, key) {
  writeJSON(LOCAL_CONFIG_KEY, url && key ? { url: url.trim(), key: key.trim() } : null);
}

export class CloudSync {
  constructor(store, { onStatus = () => {}, onConflict = null, notify = () => {} } = {}) {
    this.store = store;
    this.onStatus = onStatus;
    this.onConflict = onConflict; // async ({remoteAt, localAt}) => 'remote' | 'local'
    this.notify = notify;
    this.config = getCloudConfig();
    this.session = readJSON(SESSION_KEY, null);
    this.meta = { remoteUpdatedAt: null, dirty: false, localChangedAt: null, lastSyncedAt: null, ...readJSON(META_KEY, {}) };
    this.status = 'local';
    this.lastError = '';
    this._timer = null;
    this._running = null;
    this._rerun = false;
    this._changeCounter = 0;
    this._conflictOpen = false;
    this._conflictDeferred = false;
  }

  get configured() { return !!this.config; }
  get signedIn() { return !!(this.session && this.session.access_token); }
  get userEmail() { return this.session && this.session.user ? this.session.user.email : ''; }
  get hasBackup() { return !!readJSON(BACKUP_KEY, null); }

  _setStatus(status, error = '') {
    this.status = status;
    this.lastError = error;
    this.onStatus(status, error);
  }

  _saveMeta() { writeJSON(META_KEY, this.meta); }

  _saveSession(session) {
    this.session = session;
    writeJSON(SESSION_KEY, session);
  }

  // --- Start ---------------------------------------------------------------

  async init() {
    // Lokale Änderungen protokollieren - auch ohne Cloud, damit beim
    // späteren Einrichten klar ist, ob es ungesicherte Änderungen gibt.
    this.store.onLocalChange(() => {
      this.meta.dirty = true;
      this.meta.localChangedAt = new Date().toISOString();
      this._changeCounter += 1;
      this._saveMeta();
      this._schedulePush();
    });

    if (!this.configured) { this._setStatus('local'); return; }

    this._consumeRedirectHash();
    // Falls die App schon offen ist und der Login-Link im selben Tab landet.
    window.addEventListener('hashchange', () => {
      if (this._consumeRedirectHash()) this.syncNow('login');
    });
    window.addEventListener('online', () => this.syncNow('online'));
    window.addEventListener('offline', () => { if (this.signedIn) this._setStatus('offline'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.syncNow('focus'); });

    if (!this.signedIn) { this._setStatus('signed-out'); return; }
    await this.syncNow('startup');
  }

  /** Nach Klick auf den Login-Link landet Supabase mit den Tokens im
   *  URL-Fragment (#access_token=...&refresh_token=...). */
  _consumeRedirectHash() {
    const hash = window.location.hash || '';
    if (!hash.includes('access_token=') && !hash.includes('error_description=')) return false;
    const params = new URLSearchParams(hash.slice(1));
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (params.get('error_description')) {
      this.notify('Login fehlgeschlagen: ' + params.get('error_description').replace(/\+/g, ' '), 'error');
      return false;
    }
    this._sessionFromTokens({
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in: Number(params.get('expires_in')) || 3600,
    });
    this.notify('Angemeldet.', 'success');
    return true;
  }

  _sessionFromTokens(tok) {
    const claims = decodeJwt(tok.access_token);
    const session = {
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: tok.expires_at || (claims.exp ? claims.exp : Math.floor(Date.now() / 1000) + (tok.expires_in || 3600)),
      user: { id: (tok.user && tok.user.id) || claims.sub, email: (tok.user && tok.user.email) || claims.email || '' },
    };
    this._saveSession(session);
    return session;
  }

  // --- HTTP ------------------------------------------------------------------

  async _fetch(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    const h = { apikey: this.config.key, ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (auth) {
      await this._ensureFreshToken();
      if (!this.session) throw new AuthError('Nicht angemeldet.');
      h.Authorization = 'Bearer ' + this.session.access_token;
    }
    let res;
    try {
      res = await fetch(this.config.url + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new NetworkError('Server nicht erreichbar');
    }
    if (res.status === 401 && auth) {
      // Token abgelaufen/ungültig: einmal erneuern und wiederholen.
      if (await this._refresh()) {
        h.Authorization = 'Bearer ' + this.session.access_token;
        try {
          res = await fetch(this.config.url + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
        } catch (e) { throw new NetworkError('Server nicht erreichbar'); }
      }
      if (res.status === 401) { this._saveSession(null); throw new AuthError('Anmeldung abgelaufen – bitte neu anmelden.'); }
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      // 5xx/540 = Projekt pausiert oder Server-Problem -> wie offline behandeln.
      if (res.status >= 500) throw Object.assign(new NetworkError(msg), { status: res.status });
      throw err;
    }
    return data;
  }

  async _ensureFreshToken() {
    if (!this.session) return;
    const now = Math.floor(Date.now() / 1000);
    if (this.session.expires_at && this.session.expires_at - 60 > now) return;
    await this._refresh();
  }

  async _refresh() {
    if (!this.session || !this.session.refresh_token) return false;
    try {
      const data = await this._fetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', auth: false, body: { refresh_token: this.session.refresh_token },
      });
      this._sessionFromTokens(data);
      return true;
    } catch (e) {
      if (e instanceof NetworkError) throw e;
      this._saveSession(null);
      return false;
    }
  }

  // --- Login / Logout -------------------------------------------------------

  async sendLoginLink(email) {
    const redirect = window.location.origin + window.location.pathname;
    try {
      await this._fetch('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), {
        method: 'POST', auth: false, body: { email: email.trim(), create_user: false },
      });
    } catch (e) {
      if (/signup|not allowed|not found/i.test(e.message)) {
        throw new Error('Für diese E-Mail-Adresse gibt es kein Konto. Lege den Benutzer im Supabase-Dashboard an (SETUP.md, Schritt 6).');
      }
      if (e.status === 429 || /rate limit/i.test(e.message)) {
        throw new Error('Zu viele Login-Mails in kurzer Zeit. Bitte etwas warten und es dann erneut versuchen.');
      }
      throw e;
    }
  }

  async verifyCode(email, code) {
    const data = await this._fetch('/auth/v1/verify', {
      method: 'POST', auth: false, body: { type: 'email', email: email.trim(), token: String(code).trim() },
    });
    this._sessionFromTokens(data);
    await this.syncNow('login');
  }

  async signOut() {
    try { await this._fetch('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* egal */ }
    this._saveSession(null);
    // Lokale Daten bleiben erhalten. Basisversion vergessen, damit beim
    // nächsten Login sauber abgeglichen wird.
    this.meta.remoteUpdatedAt = null;
    this.meta.dirty = true;
    this._saveMeta();
    this._setStatus('signed-out');
  }

  // --- Abgleich -----------------------------------------------------------------

  _schedulePush() {
    if (!this.configured || !this.signedIn) return;
    clearTimeout(this._timer);
    if (!navigator.onLine) { this._setStatus('offline'); return; }
    this._setStatus('pending');
    this._timer = setTimeout(() => this.syncNow('change'), PUSH_DELAY_MS);
  }

  /** Abgleich anstoßen. Läuft bereits einer, wird danach genau einmal
   *  nachgeholt (keine parallelen Uploads). */
  async syncNow(reason = 'manual') {
    if (!this.configured || !this.signedIn) return;
    if (this._conflictOpen) return;
    if (this._running) { this._rerun = true; return this._running; }
    this._running = this._sync(reason).finally(() => {
      this._running = null;
      if (this._rerun) { this._rerun = false; this.syncNow('rerun'); }
    });
    return this._running;
  }

  async _sync(reason) {
    if (!navigator.onLine) { this._setStatus('offline'); return; }
    this._setStatus(this.meta.dirty ? 'saving' : 'checking');
    try {
      const rows = await this._fetch(`/rest/v1/${TABLE}?select=updated_at`);
      const remoteAt = rows && rows[0] ? rows[0].updated_at : null;
      const remoteChanged = !!remoteAt && remoteAt !== this.meta.remoteUpdatedAt;

      if (!remoteAt) {
        // Noch nichts in der Cloud: aktuellen Stand hochladen.
        await this._push();
      } else if (!this.meta.remoteUpdatedAt) {
        // Erster Abgleich auf diesem Gerät, aber in der Cloud liegt schon
        // etwas: ein leeres Gerät übernimmt still, sonst wird gefragt.
        if (this._localIsEmpty()) await this._pull();
        else await this._resolveConflict(remoteAt, true);
      } else if (!this.meta.dirty) {
        if (remoteChanged) {
          await this._pull();
          if (reason !== 'startup' && reason !== 'login') this.notify('Neuerer Stand aus der Cloud geladen.', 'info');
        }
      } else if (!remoteChanged) {
        await this._push();
      } else {
        await this._resolveConflict(remoteAt);
      }
      if (this._conflictDeferred) { this._setStatus('conflict'); return; }
      this.meta.lastSyncedAt = new Date().toISOString();
      this._saveMeta();
      this._setStatus(this.meta.dirty ? 'pending' : 'saved');
      if (this.meta.dirty) this._schedulePush();
    } catch (e) {
      if (e instanceof NetworkError) this._setStatus('offline', e.status ? `Cloud antwortet nicht (HTTP ${e.status}) – evtl. ist das Supabase-Projekt pausiert.` : '');
      else if (e instanceof AuthError) this._setStatus('signed-out', e.message);
      else { console.error(e); this._setStatus('error', e.message); }
    }
  }

  async _pull() {
    const rows = await this._fetch(`/rest/v1/${TABLE}?select=data,updated_at`);
    if (!rows || !rows[0]) return;
    this.store.replaceFromRemote(rows[0].data);
    this.meta.remoteUpdatedAt = rows[0].updated_at;
    this.meta.dirty = false;
    this._saveMeta();
  }

  async _push() {
    const counterAtStart = this._changeCounter;
    const userId = this.session.user && this.session.user.id;
    const rows = await this._fetch(`/rest/v1/${TABLE}?on_conflict=user_id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { user_id: userId, data: this.store.getSyncPayload() },
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.updated_at) this.meta.remoteUpdatedAt = row.updated_at;
    // Gab es während des Uploads neue Änderungen, bleibt der Stand "ungesichert".
    if (this._changeCounter === counterAtStart) this.meta.dirty = false;
    this._saveMeta();
  }

  /** Hat dieses Gerät noch keine eigenen Daten (nur die eingebauten
   *  SRD-Monster)? Dann darf ein Cloud-Stand ohne Rückfrage übernommen werden. */
  _localIsEmpty() {
    const camps = this.store.state.campaigns || [];
    return camps.every((c) => !(c.roster || []).length && !(c.encounters || []).length
      && !(c.monsterLibrary || []).some((m) => !m.builtin)
      && !Object.values(c.story || {}).some((v) => Array.isArray(v) && v.length));
  }

  /** Lokal UND in der Cloud geändert seit dem letzten Abgleich (oder erster
   *  Abgleich eines Geräts mit eigenen Daten). */
  async _resolveConflict(remoteAt, firstSync = false) {
    const localAt = this.meta.localChangedAt;
    const cloudIsNewer = firstSync || !localAt || toMs(remoteAt) > toMs(localAt);
    let choice = 'local';
    if (cloudIsNewer && this.onConflict) {
      this._conflictOpen = true;
      this._setStatus('conflict');
      try { choice = await this.onConflict({ remoteAt, localAt, firstSync }); } finally { this._conflictOpen = false; }
    } else if (cloudIsNewer) {
      choice = 'remote';
    }
    if (!choice) {
      // Dialog ohne Entscheidung geschlossen: nichts überschreiben, beim
      // nächsten Abgleich (oder über das Sync-Menü) erneut fragen.
      this._conflictDeferred = true;
      return;
    }
    this._conflictDeferred = false;
    if (choice === 'remote') {
      this._backup('lokal', this.store.getSyncPayload());
      await this._pull();
      this.notify('Cloud-Version geladen. Deine lokale Version liegt als Sicherung im Sync-Menü.', 'info');
    } else {
      const rows = await this._fetch(`/rest/v1/${TABLE}?select=data,updated_at`);
      if (rows && rows[0]) this._backup('Cloud', rows[0].data, rows[0].updated_at);
      await this._push();
      if (!cloudIsNewer) this.notify('Ein älterer Cloud-Stand wurde mit deinem neueren lokalen Stand überschrieben (Sicherung im Sync-Menü).', 'info');
    }
  }

  _backup(kind, data, at = new Date().toISOString()) {
    writeJSON(BACKUP_KEY, { kind, at, savedAt: new Date().toISOString(), data });
  }

  getBackup() { return readJSON(BACKUP_KEY, null); }
}
