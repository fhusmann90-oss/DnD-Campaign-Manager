/**
 * formHelpers.js
 * ---------------------------------------------------------------------------
 * Generische Bausteine für die Bearbeitungsformulare (Charakter- und
 * Monster-Editor, die auch als editierbare Import-Vorschau dienen - siehe
 * importFlow.js). Jede Liste von Unterobjekten (Angriffe, Merkmale,
 * Inventar, Zaubersprüche, Zauberplätze) nutzt dieselbe
 * "wiederholbare Zeilen"-Logik: Zeilen hinzufügen/entfernen, am Ende per
 * collect() als Array von Objekten auslesen.
 * ---------------------------------------------------------------------------
 */

import { el } from './shared.js';

/**
 * Baut eine Liste von Formular-Zeilen für ein Array von gleichartigen
 * Objekten (z.B. Angriffe). `fields` beschreibt die Spalten:
 *   { key, label, type: 'text'|'number'|'textarea', width }
 * Gibt { node, collect() } zurück - collect() liest alle aktuell
 * vorhandenen Zeilen aus und liefert ein frisches Array.
 */
export function repeatableList(items, fields, { addLabel = '+ Hinzufügen', blank = {} } = {}) {
  const rowsContainer = el('div', { class: 'repeat-rows' });
  const node = el('div', { class: 'repeat-list' }, [rowsContainer]);

  function makeRow(item) {
    const row = el('div', { class: 'repeat-row' });
    fields.forEach((f) => {
      const value = item && item[f.key] != null ? item[f.key] : '';
      let input;
      if (f.type === 'textarea') {
        input = el('textarea', { class: 'input input-sm', rows: '2', placeholder: f.label });
        input.value = value;
      } else if (f.type === 'select') {
        input = el('select', { class: 'input input-sm' });
        (f.options || []).forEach((opt) => input.appendChild(el('option', { value: opt.value, text: opt.label })));
        input.value = value || (f.options && f.options[0] && f.options[0].value) || '';
      } else {
        input = el('input', {
          type: f.type === 'number' ? 'number' : 'text', class: 'input input-sm', placeholder: f.label,
        });
        input.value = value;
      }
      input.dataset.field = f.key;
      input.dataset.type = f.type || 'text';
      if (f.width) input.style.width = f.width;
      row.appendChild(input);
    });
    row.appendChild(el('button', { class: 'btn-icon', title: 'Entfernen', onclick: () => row.remove(), text: '✕' }));
    return row;
  }

  (items || []).forEach((item) => rowsContainer.appendChild(makeRow(item)));

  node.appendChild(el('button', {
    class: 'btn btn-sm', text: addLabel,
    onclick: (e) => { e.preventDefault(); rowsContainer.appendChild(makeRow(blank)); },
  }));

  function collect() {
    return Array.from(rowsContainer.children).map((row) => {
      const obj = {};
      Array.from(row.querySelectorAll('[data-field]')).forEach((input) => {
        obj[input.dataset.field] = input.dataset.type === 'number' ? (Number(input.value) || 0) : input.value;
      });
      return obj;
    // Eine Zeile zählt nur, wenn ihr erstes Feld (üblicherweise "name")
    // ausgefüllt ist - verhindert, dass eine frisch angehängte, noch leere
    // Zeile (bei der ein <select> trotzdem schon einen Default-Wert hat)
    // als "ausgefüllt" durchgeht.
    }).filter((obj) => {
      const keyField = fields[0] && fields[0].key;
      return keyField ? String(obj[keyField] ?? '').trim() !== '' : Object.values(obj).some((v) => v !== '' && v !== 0);
    });
  }

  return { node, collect };
}

/** Ein einzelnes beschriftetes Eingabefeld, kompakt für Formular-Grids. */
export function field(label, inputEl) {
  return el('label', { class: 'form-field' }, [el('span', { text: label }), inputEl]);
}

export function textInput(value, opts = {}) {
  return el('input', { type: 'text', class: 'input', value: value ?? '', ...opts });
}

export function numberInput(value, opts = {}) {
  return el('input', { type: 'number', class: 'input', value: value ?? 0, ...opts });
}

export function textarea(value, opts = {}) {
  const node = el('textarea', { class: 'input', rows: opts.rows || '3', ...opts });
  node.value = value ?? '';
  return node;
}
