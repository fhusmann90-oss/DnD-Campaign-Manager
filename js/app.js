/**
 * app.js
 * ---------------------------------------------------------------------------
 * Einstiegspunkt der App: Store aufsetzen, Theme anwenden, Tab-Umschaltung,
 * Rückgängig, JSON-Export/Import. Ab 1.1 ist die App auf EINE Kampagne
 * ausgelegt: die Kampagnenauswahl erscheint nur noch, falls (z.B. durch einen
 * alten Import) mehrere Kampagnen vorhanden sind. Ab 1.4 kommt die
 * Cloud-Synchronisierung (sync.js) mit Statusanzeige und Sync-Menü dazu.
 * Jeder Tab-Inhalt wird bei jeder Zustandsänderung
 * komplett neu aufgebaut (siehe state.js-Kommentar: einfaches, robustes
 * "re-render alles"-Modell statt feingranularem Diffing - für die
 * Datenmenge einer Handvoll Kampagnen völlig ausreichend performant).
 * ---------------------------------------------------------------------------
 */

import { Store } from './state.js';
import { SRD_MONSTERS } from './data/srdMonsters.js';
import { el, toast, confirmModal, openModal, closeModal } from './ui/shared.js';
import { CloudSync, getCloudConfig, setDeviceCloudConfig } from './sync.js';
import { initPdfWorker } from './ui/importFlow.js';
import { renderRosterView } from './ui/rosterView.js';
import { renderLibraryView } from './ui/libraryView.js';
import { renderEncounterView } from './ui/encounterView.js';
import { renderStoryView, focusStoryEntry } from './ui/storyView.js';
import { APP_VERSION } from './version.js';

const store = new Store();
initPdfWorker();

// Beim allerersten Start (keine Kampagne vorhanden) direkt eine Kampagne
// mit der eingebauten SRD-Bibliothek anlegen, damit die App nicht mit
// einer komplett leeren Oberfläche startet.
if (!store.state.campaigns.length) {
  store.createCampaign('Meine Kampagne', SRD_MONSTERS);
}

let activeTab = 'roster'; // 'roster' | 'library' | 'encounter' | 'story'

const TABS = [
  { key: 'roster', label: 'Charaktere', render: renderRosterView },
  { key: 'library', label: 'Monster', render: renderLibraryView },
  { key: 'encounter', label: 'Encounter', render: renderEncounterView },
  { key: 'story', label: 'Story', render: renderStoryView },
];

// Navigation zwischen den Reitern (z.B. Sprung von einer Szene zu ihrem
// Encounter). Wird an die Ansichten durchgereicht.
const nav = {
  goto(tabKey) {
    if (!TABS.some((t) => t.key === tabKey)) return;
    activeTab = tabKey;
    renderAll();
    window.scrollTo(0, 0);
  },
  /** Zum Story-Reiter springen und dort einen Eintrag aufklappen. */
  openStory(kind, id) {
    focusStoryEntry(kind, id);
    activeTab = 'story';
    renderAll();
  },
};

function applyTheme() {
  const theme = store.state.theme || 'system';
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const idx = order.indexOf(store.state.theme || 'system');
  store.setTheme(order[(idx + 1) % order.length]);
}

function themeLabel() {
  const t = store.state.theme || 'system';
  return t === 'system' ? '🖥 System' : t === 'light' ? '☀ Hell' : '🌙 Dunkel';
}

function downloadExport() {
  downloadJSON(store.exportJSON(), `kampagnen-tracker-export-${new Date().toISOString().slice(0, 10)}.json`);
}

async function pickImportFile() {
  const ok = await confirmModal(
    'Der Import ERSETZT alle aktuellen Daten (Charaktere, Monster, Encounter, Story) durch den Inhalt der Datei. Tipp: vorher selbst exportieren, falls du den aktuellen Stand behalten willst. Fortfahren?',
    { okLabel: 'Datei wählen & ersetzen', danger: true },
  );
  if (!ok) return;
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    try {
      const text = await file.text();
      store.importJSON(text, 'replace');
      toast('Import erfolgreich.', 'success');
    } catch (e) {
      toast('Import fehlgeschlagen: ' + e.message, 'error');
    }
  });
  input.click();
}

function renderTopBar(root) {
  const campaigns = store.state.campaigns;
  let campControl;
  if (campaigns.length > 1) {
    campControl = el('select', { class: 'input input-sm', title: 'Kampagne' });
    campaigns.forEach((c) => campControl.appendChild(el('option', { value: c.id, text: c.name })));
    campControl.value = store.state.activeCampaignId || '';
    campControl.addEventListener('change', () => store.setActiveCampaign(campControl.value));
  } else {
    campControl = null;
  }

  const bar = el('div', { class: 'topbar' }, [
    el('div', { class: 'row gap align-center wrap' }, [
      el('span', { class: 'app-title', text: '⚔ D&D Kampagnen-Tracker' }),
      el('span', { class: 'version-tag', text: 'v' + APP_VERSION }),
      campControl,
    ]),
    el('div', { class: 'row gap align-center wrap topbar-actions' }, [
      renderSyncButton(),
      el('button', {
        class: 'btn btn-sm', disabled: !store.canUndo(), text: '↶ Rückgängig',
        onclick: () => { if (store.undo()) toast('Rückgängig gemacht.', 'info'); },
      }),
      el('button', { class: 'btn btn-sm', onclick: cycleTheme, text: themeLabel() }),
      el('button', { class: 'btn btn-sm', onclick: downloadExport, text: '⭳ Export' }),
      el('button', { class: 'btn btn-sm', onclick: pickImportFile, text: '⭱ Import' }),
    ]),
  ]);
  root.innerHTML = '';
  root.appendChild(bar);
}

function renderTabs(root) {
  const nav = el('div', { class: 'tabs' });
  TABS.forEach((tab) => {
    nav.appendChild(el('button', {
      class: 'tab-btn' + (tab.key === activeTab ? ' active' : ''),
      onclick: () => { activeTab = tab.key; renderAll(); },
      text: tab.label,
    }));
  });
  root.innerHTML = '';
  root.appendChild(nav);
}

function renderAll() {
  applyTheme();
  renderTopBar(document.getElementById('topbar'));
  renderTabs(document.getElementById('tabs'));
  const content = document.getElementById('content');
  const activeDef = TABS.find((t) => t.key === activeTab) || TABS[0];
  activeDef.render(store, content, nav);
}

// ---------------------------------------------------------------------------
// Cloud-Synchronisierung (ab 1.4)
// ---------------------------------------------------------------------------

const SYNC_LABEL = {
  local: ['💾', 'Nur lokal'],
  'signed-out': ['☁', 'Anmelden'],
  pending: ['●', 'Ungesichert'],
  saving: ['⟳', 'Speichert…'],
  checking: ['⟳', 'Prüft…'],
  saved: ['✓', 'Gespeichert'],
  offline: ['⚠', 'Offline'],
  error: ['⚠', 'Sync-Fehler'],
  conflict: ['⚠', 'Konflikt'],
};

const sync = new CloudSync(store, {
  onStatus: () => updateSyncButton(),
  notify: (msg, kind) => toast(msg, kind),
  onConflict: askConflict,
});

function fmtDateTime(iso) {
  if (!iso) return '–';
  try { return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return iso; }
}

function renderSyncButton() {
  const btn = el('button', { class: 'btn btn-sm sync-btn', id: 'sync-btn', onclick: openSyncMenu });
  fillSyncButton(btn);
  return btn;
}

function fillSyncButton(btn) {
  const [icon, label] = SYNC_LABEL[sync.status] || SYNC_LABEL.local;
  btn.className = 'btn btn-sm sync-btn sync-' + sync.status;
  btn.textContent = `${icon} ${label}`;
  btn.title = sync.lastError || 'Speicherstatus – antippen für Details';
}

function updateSyncButton() {
  const btn = document.getElementById('sync-btn');
  if (btn) fillSyncButton(btn);
  // Offenes Sync-Menü aktualisieren (nicht während des Logins, sonst gingen
  // gerade eingetippte Werte verloren).
  if (sync.signedIn && document.querySelector('.modal-overlay.open #sync-menu')) openSyncMenu();
}

const STATUS_TEXT = {
  local: 'Die Daten liegen nur in diesem Browser. Für die Nutzung auf Handy und PC die Cloud einrichten (siehe SETUP.md).',
  'signed-out': 'Cloud ist eingerichtet, aber du bist auf diesem Gerät nicht angemeldet. Deine Änderungen werden lokal gespeichert.',
  pending: 'Es gibt Änderungen, die gleich hochgeladen werden.',
  saving: 'Speichert in der Cloud …',
  checking: 'Prüft, ob es einen neueren Stand gibt …',
  saved: 'Alles gespeichert und synchronisiert.',
  offline: 'Keine Verbindung zur Cloud. Alles wird lokal gespeichert und beim nächsten Verbinden automatisch hochgeladen.',
  error: 'Beim Synchronisieren ist ein Fehler aufgetreten.',
  conflict: 'Lokal und in der Cloud gibt es unterschiedliche Änderungen. Bitte entscheiden, welcher Stand gelten soll.',
};

function openSyncMenu() {
  const body = el('div', { id: 'sync-menu', class: 'sync-menu' });
  body.appendChild(el('p', {}, [el('strong', { text: (SYNC_LABEL[sync.status] || SYNC_LABEL.local).join(' ') + ': ' }), document.createTextNode(STATUS_TEXT[sync.status] || '')]));
  if (sync.lastError) body.appendChild(el('p', { class: 'small sync-error', text: sync.lastError }));

  if (!sync.configured) {
    body.appendChild(renderDeviceConfigForm());
  } else if (!sync.signedIn) {
    body.appendChild(renderLoginForm());
  } else {
    body.appendChild(el('p', { class: 'small muted', text: `Angemeldet als ${sync.userEmail || '?'} · letzter Abgleich ${fmtDateTime(sync.meta.lastSyncedAt)} · Cloud-Stand vom ${fmtDateTime(sync.meta.remoteUpdatedAt)}` }));
    body.appendChild(el('div', { class: 'row gap wrap' }, [
      el('button', { class: 'btn btn-primary', text: '⟳ Jetzt synchronisieren', onclick: () => sync.syncNow('manual') }),
      el('button', {
        class: 'btn', text: 'Abmelden',
        onclick: async () => {
          if (await confirmModal('Auf diesem Gerät abmelden? Die Daten bleiben lokal erhalten, werden aber nicht mehr synchronisiert.', { okLabel: 'Abmelden', danger: false })) {
            await sync.signOut();
            toast('Abgemeldet.', 'info');
          }
        },
      }),
    ]));
  }

  const backup = sync.getBackup();
  if (backup) {
    body.appendChild(el('h3', { class: 'editor-section-title', text: 'Sicherung bei Konflikt' }));
    body.appendChild(el('p', { class: 'small muted', text: `Zuletzt verworfener Stand (${backup.kind}, vom ${fmtDateTime(backup.at)}). Lässt sich über „Import“ wieder einspielen.` }));
    body.appendChild(el('button', {
      class: 'btn btn-sm', text: '⭳ Sicherung herunterladen',
      onclick: () => downloadJSON(JSON.stringify({ exportedAt: backup.savedAt, ...backup.data }, null, 2), `kampagnen-tracker-sicherung-${(backup.savedAt || '').slice(0, 10)}.json`),
    }));
  }
  const cfg = getCloudConfig();
  if (cfg && cfg.source === 'device') {
    body.appendChild(el('p', { class: 'small muted', text: `Cloud-Zugang auf diesem Gerät eingetragen (${cfg.url}).` }));
    body.appendChild(el('button', {
      class: 'btn btn-sm', text: 'Cloud-Zugang auf diesem Gerät entfernen',
      onclick: () => { setDeviceCloudConfig(null, null); location.reload(); },
    }));
  }
  openModal(body, { title: 'Speichern & Synchronisieren' });
}

function renderLoginForm() {
  const email = el('input', { type: 'email', class: 'input', placeholder: 'deine@email.de', autocomplete: 'email' });
  try { email.value = localStorage.getItem('dnd-campaign-tracker:last-email') || ''; } catch (e) { /* egal */ }
  const code = el('input', { type: 'text', class: 'input', inputmode: 'numeric', placeholder: 'Code aus der Mail', autocomplete: 'one-time-code', style: 'max-width:12em' });
  const info = el('p', { class: 'small muted' });
  const form = el('div', { class: 'login-form' }, [
    el('label', { class: 'form-field' }, [el('span', { text: 'E-Mail-Adresse' }), email]),
    el('button', {
      class: 'btn btn-primary', text: 'Login-Link senden',
      onclick: async (e) => {
        if (!email.value.includes('@')) { toast('Bitte E-Mail-Adresse eingeben.', 'warn'); return; }
        e.target.disabled = true;
        try {
          localStorage.setItem('dnd-campaign-tracker:last-email', email.value.trim());
        } catch (err) { /* egal */ }
        try {
          await sync.sendLoginLink(email.value);
          info.textContent = 'Mail ist unterwegs. Tippe auf den Link in der Mail (auf diesem Gerät) – oder gib den Code aus der Mail hier ein.';
        } catch (err) {
          info.textContent = err.message;
        } finally { e.target.disabled = false; }
      },
    }),
    info,
    el('div', { class: 'row gap align-center wrap' }, [
      code,
      el('button', {
        class: 'btn', text: 'Code bestätigen',
        onclick: async () => {
          try {
            await sync.verifyCode(email.value, code.value);
            closeModal();
            toast('Angemeldet.', 'success');
          } catch (err) { info.textContent = 'Code ungültig oder abgelaufen: ' + err.message; }
        },
      }),
    ]),
    el('p', { class: 'small muted', text: 'Tipp: Wenn die App als Symbol auf dem Home-Bildschirm liegt, öffnet der Link in der Mail den normalen Browser. Dann besser den Code verwenden.' }),
  ]);
  return form;
}

function renderDeviceConfigForm() {
  const url = el('input', { type: 'url', class: 'input', placeholder: 'https://xxxx.supabase.co' });
  const key = el('input', { type: 'text', class: 'input', placeholder: 'sb_publishable_… oder anon key' });
  return el('div', {}, [
    el('p', { class: 'small muted', text: 'Empfohlen: Projekt-URL und Schlüssel einmal in js/config.js eintragen (gilt dann für alle Geräte). Alternativ hier nur für dieses Gerät:' }),
    el('label', { class: 'form-field' }, [el('span', { text: 'Projekt-URL' }), url]),
    el('label', { class: 'form-field' }, [el('span', { text: 'Publishable / anon key' }), key]),
    el('button', {
      class: 'btn btn-primary', text: 'Speichern & neu laden',
      onclick: () => {
        if (!/^https:\/\/.+/.test(url.value.trim()) || !key.value.trim()) { toast('Bitte URL (https://…) und Schlüssel eingeben.', 'warn'); return; }
        setDeviceCloudConfig(url.value, key.value);
        location.reload();
      },
    }),
  ]);
}

/** Konflikt-Dialog: liefert 'remote', 'local' oder null (später entscheiden). */
function askConflict({ remoteAt, localAt, firstSync }) {
  return new Promise((resolve) => {
    let choice = null;
    const text = firstSync
      ? `In der Cloud liegt bereits ein Kampagnenstand (vom ${fmtDateTime(remoteAt)}), und auf diesem Gerät gibt es eigene Daten. Welcher Stand soll gelten?`
      : `Die Cloud-Version (vom ${fmtDateTime(remoteAt)}) ist NEUER als deine lokalen Änderungen (vom ${fmtDateTime(localAt)}) – vermutlich wurde auf einem anderen Gerät weitergearbeitet. Welcher Stand soll gelten?`;
    const body = el('div', { class: 'confirm-box' }, [
      el('p', { text: text }),
      el('p', { class: 'small muted', text: 'Der nicht gewählte Stand wird als Sicherung aufgehoben (im Sync-Menü herunterladbar).' }),
      el('div', { class: 'row gap wrap justify-end' }, [
        el('button', { class: 'btn', text: 'Meine lokale Version behalten', onclick: () => { choice = 'local'; closeModal(); } }),
        el('button', { class: 'btn btn-primary', text: 'Cloud-Version laden', onclick: () => { choice = 'remote'; closeModal(); } }),
      ]),
    ]);
    openModal(body, { title: '⚠ Cloud-Version ist neuer', onClose: () => resolve(choice) });
  });
}

function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Offline-Fähigkeit: der Service Worker hält alle App-Dateien im Cache, damit
// die App auch ohne Netz startet (nur über https bzw. localhost möglich).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker nicht registriert:', e));
  });
}

store.subscribe(renderAll);
renderAll();
sync.init();
window.__cloudSync = sync;

// Für den gelegentlichen Debug-Blick in der Browser-Konsole hilfreich,
// ändert aber nichts am App-Verhalten.
window.__campaignTrackerStore = store;
