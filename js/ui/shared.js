/**
 * shared.js
 * ---------------------------------------------------------------------------
 * Kleine, abhängigkeitsfreie Helfer, die von allen UI-Modulen gebraucht
 * werden: HTML-Escaping, DOM-Kurzschreibweisen, ein generisches Modal und
 * ein Toast für kurze Hinweise ("Gespeichert", "Import fehlgeschlagen" ...).
 * Kein App-Zustand - reine Darstellungs-Hilfsmittel.
 * ---------------------------------------------------------------------------
 */

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/** Baut ein DOM-Element mit Attributen/Kindern - für die wenigen Stellen,
 *  an denen innerHTML-Strings unhandlich wären. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

// -----------------------------------------------------------------------
// Modal: ein einzelner wiederverwendbarer Overlay-Container im <body>.
// openModal(contentHtmlOrNode, {title, wide, onClose}) ersetzt den Inhalt
// und zeigt ihn an; closeModal() blendet aus. Für Formulare mit eigenem
// Event-Handling reicht document.getElementById(...) nach dem Öffnen.
// -----------------------------------------------------------------------

let modalRoot = null;
let modalOnClose = null;

function ensureModalRoot() {
  if (modalRoot) return modalRoot;
  modalRoot = el('div', { class: 'modal-overlay', id: 'modal-overlay' });
  modalRoot.addEventListener('click', (e) => {
    if (e.target === modalRoot) closeModal();
  });
  document.body.appendChild(modalRoot);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalRoot.classList.contains('open')) closeModal();
  });
  return modalRoot;
}

export function openModal(content, { title = '', wide = false, onClose = null } = {}) {
  const root = ensureModalRoot();
  // Ein noch offenes Modal mit Rückruf wird dabei als "geschlossen" gemeldet.
  const prev = modalOnClose;
  modalOnClose = null;
  if (prev) prev();
  modalOnClose = onClose;
  root.innerHTML = '';
  const box = el('div', { class: 'modal-box' + (wide ? ' modal-wide' : '') });
  const header = el('div', { class: 'modal-header' }, [
    el('h2', { text: title }),
    el('button', { class: 'btn-icon', 'aria-label': 'Schließen', onclick: () => closeModal(), text: '✕' }),
  ]);
  box.appendChild(header);
  const body = el('div', { class: 'modal-body' });
  if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
  box.appendChild(body);
  root.appendChild(box);
  root.classList.add('open');
  return body;
}

export function closeModal() {
  if (modalRoot) modalRoot.classList.remove('open');
  const cb = modalOnClose;
  modalOnClose = null;
  if (cb) cb();
}

// -----------------------------------------------------------------------
// Toast - kurze, sich selbst entfernende Hinweise unten rechts.
// -----------------------------------------------------------------------

export function toast(message, kind = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = el('div', { class: 'toast-root', id: 'toast-root' });
    document.body.appendChild(root);
  }
  const node = el('div', { class: 'toast toast-' + kind, text: message });
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, 3200);
}

/** Einfacher Bestätigungsdialog über das Modal-System (ersetzt confirm(),
 *  das in manchen eingebetteten Kontexten blockiert/unterdrückt wird). */
export function confirmModal(message, { okLabel = 'Löschen', danger = true } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const body = el('div', { class: 'confirm-box' }, [
      el('p', { text: message }),
      el('div', { class: 'row gap justify-end wrap' }, [
        el('button', { class: 'btn', onclick: () => { result = false; closeModal(); }, text: 'Abbrechen' }),
        el('button', {
          class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'),
          onclick: () => { result = true; closeModal(); },
          text: okLabel,
        }),
      ]),
    ]);
    // Schließen über ✕, Esc oder Klick daneben zählt als "Abbrechen".
    openModal(body, { title: 'Bestätigen', onClose: () => resolve(result) });
  });
}

// -----------------------------------------------------------------------
// Einklappbare Bereiche. Da jede Store-Änderung die Ansicht komplett neu
// aufbaut, merkt sich ein Modul-Set, welche Bereiche gerade offen sind
// (reiner UI-Zustand pro Gerät, wird nicht gespeichert/synchronisiert).
// -----------------------------------------------------------------------

const collapsibleState = new Map(); // key -> boolean (offen?)

export function collapsible(key, title, children, { defaultOpen = false, badge = null } = {}) {
  const open = collapsibleState.has(key) ? collapsibleState.get(key) : defaultOpen;
  const details = el('details', { class: 'collapsible' });
  if (open) details.open = true;
  const summary = el('summary', { class: 'collapsible-summary' }, [
    el('span', { text: title }),
    badge != null ? el('span', { class: 'badge badge-muted', text: String(badge) }) : null,
  ]);
  details.appendChild(summary);
  details.appendChild(el('div', { class: 'collapsible-body' }, children));
  details.addEventListener('toggle', () => collapsibleState.set(key, details.open));
  return details;
}

/** w20 + Modifikator würfeln (für Initiative). */
export function rollD20(mod = 0) {
  const roll = 1 + Math.floor(Math.random() * 20);
  return { roll, total: roll + Number(mod || 0) };
}
