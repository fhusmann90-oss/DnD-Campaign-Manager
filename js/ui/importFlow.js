/**
 * importFlow.js
 * ---------------------------------------------------------------------------
 * Verbindet pdf.js, den Charakterbogen-Parser (Formularfelder) und die
 * editierbare Vorschau zu einem
 * Ablauf: PDF auswählen -> auslesen -> Vorschau im selben Formular wie
 * "manuell anlegen" zeigen -> Spielleiter korrigiert -> Speichern.
 *
 * pdf.js liegt als klassisches UMD-Bundle unter lib/ und wird in index.html
 * per <script>-Tag geladen (nicht als ES-Modul) - es hängt sich dadurch als
 * window.pdfjsLib ein. initPdfWorker() muss einmal beim App-Start laufen.
 * ---------------------------------------------------------------------------
 */

import { openModal, closeModal, toast, el } from './shared.js';
import { extractFieldMap, mapFieldsToCharacter } from '../pdfCharacterParser.js';
import { buildCharacterEditor } from './characterEditor.js';
import { buildMonsterEditor } from './monsterEditor.js';

export function initPdfWorker() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  } else {
    console.warn('pdfjsLib wurde nicht gefunden - lib/pdf.min.js wurde nicht geladen?');
  }
}

function pickPdfFile() {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: 'application/pdf', style: 'display:none' });
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    });
    input.click();
  });
}

async function loadPdfDoc(file) {
  const buffer = await file.arrayBuffer();
  const task = window.pdfjsLib.getDocument({ data: buffer });
  return task.promise;
}

/** PDF auswählen und als Charakter-Daten auslesen (Formularfelder). */
export async function importCharacterFromPdf() {
  const file = await pickPdfFile();
  if (!file) return null;
  try {
    const pdfDoc = await loadPdfDoc(file);
    const fieldMap = await extractFieldMap(pdfDoc);
    if (!Object.keys(fieldMap).length) {
      toast('Keine ausfüllbaren Formularfelder in dieser PDF gefunden. Bitte Werte manuell eintragen.', 'warn');
    }
    return mapFieldsToCharacter(fieldMap);
  } catch (e) {
    console.error(e);
    toast('PDF konnte nicht gelesen werden: ' + e.message, 'error');
    return null;
  }
}

/**
 * Zeigt die editierbare Vorschau (Charakter oder Monster) in einem Modal.
 * `kind`: 'character' | 'monster'. `onSave(collectedData)` wird beim Klick
 * auf "Speichern" aufgerufen; das Modal schließt sich danach automatisch.
 */
export function openEditablePreview({ kind, data, title, onSave }) {
  const builder = kind === 'character' ? buildCharacterEditor : buildMonsterEditor;
  const { node, collect } = builder(data);
  const wrapper = el('div', {}, [
    el('p', { class: 'muted small', text: 'Vom Import übernommene Werte bitte prüfen und bei Bedarf korrigieren, bevor gespeichert wird.' }),
    node,
    el('div', { class: 'row gap justify-end sticky-footer' }, [
      el('button', { class: 'btn', onclick: () => closeModal(), text: 'Abbrechen' }),
      el('button', {
        class: 'btn btn-primary', text: 'Speichern',
        onclick: () => { onSave(collect()); closeModal(); toast('Gespeichert.', 'success'); },
      }),
    ]),
  ]);
  openModal(wrapper, { title: title || (kind === 'character' ? 'Charakter-Vorschau' : 'Monster-Vorschau'), wide: true });
}
