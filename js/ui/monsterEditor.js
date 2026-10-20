/**
 * monsterEditor.js
 * ---------------------------------------------------------------------------
 * Bearbeitungsformular für eine Monster-Vorlage (Monster-Bibliothek).
 * Ab Version 1.1 nur noch manuelle Eingabe (kein PDF-Import mehr):
 *   - Kernwerte als Felder: Name, Attribute, Bewegungsrate, TP, RK
 *   - alles Weitere (Angriffe, Aktionen, Merkmale, Resistenzen, Sinne,
 *     Sprachen, HG, ...) in EINEM freien Textfeld
 *   - zusätzlich nur das, was im Kampf anklickbar gezählt wird: legendäre
 *     Aktionen/Resistenzen und Ressourcen mit Nutzungen (z.B. "Odem 1/Tag")
 * ---------------------------------------------------------------------------
 */

import { el } from './shared.js';
import { field, textInput, numberInput, textarea, repeatableList } from './formHelpers.js';
import { ABILITIES, ABILITY_LABEL, RESET_TYPES, abilityMod, fmtMod } from '../data/rules.js';
import { blankMonsterTemplate } from '../state.js';

export function buildMonsterEditor(data) {
  const source = { ...blankMonsterTemplate(), ...data };

  const nameInput = textInput(source.name);
  const acInput = numberInput(source.ac, { min: '0' });
  const hpMaxInput = numberInput(source.hpMax, { min: '1' });
  const speedInput = textInput(source.speed, { placeholder: 'z.B. 9 m, Fliegen 18 m' });

  const headerGrid = el('div', { class: 'form-grid' }, [
    field('Name', nameInput),
    field('Rüstungsklasse', acInput),
    field('Trefferpunkte (max)', hpMaxInput),
    field('Bewegungsrate', speedInput),
  ]);

  const abilityInputs = {};
  const abilityGrid = el('div', { class: 'ability-grid ability-grid-compact' });
  ABILITIES.forEach((ab) => {
    const modLabel = el('div', { class: 'muted small', text: fmtMod(abilityMod(source.abilities[ab])) });
    const input = numberInput(source.abilities[ab], { min: '1', max: '30' });
    input.addEventListener('input', () => { modLabel.textContent = fmtMod(abilityMod(input.value)); });
    abilityInputs[ab] = input;
    abilityGrid.appendChild(el('div', { class: 'ability-cell' }, [
      el('div', { class: 'ability-cell-label', text: ABILITY_LABEL[ab] }),
      input,
      modLabel,
    ]));
  });

  const statblockInput = textarea(source.statblockText, {
    rows: '12',
    placeholder: 'Freitext, z.B.:\nMittelgroßer Untoter · HG 2\nRettungswürfe: WEI +3\nSchadensresistenzen: Kälte\nSinne: Dunkelsicht 18 m\n\nAKTIONEN\nEisige Berührung. +5 zum Treffen, Reichweite 1,5 m, Treffer: 2W6+3 Kälte.',
  });
  statblockInput.classList.add('statblock-input');

  const legendaryActionsInput = numberInput(source.legendary.actionsMax, { min: '0' });
  const legendaryResistInput = numberInput(source.legendary.resistancesMax, { min: '0' });
  const legendaryGrid = el('div', { class: 'form-grid' }, [
    field('Legendäre Aktionen pro Runde', legendaryActionsInput),
    field('Legendäre Resistenzen pro Tag', legendaryResistInput),
  ]);

  const resourcesList = repeatableList(source.resources, [
    { key: 'name', label: 'Name (z.B. Odem)', type: 'text' },
    { key: 'max', label: 'Max. Nutzungen', type: 'number', width: '6em' },
    {
      key: 'reset', label: 'Regeneriert bei', type: 'select',
      options: RESET_TYPES.map((r) => ({ value: r.key, label: r.label })),
    },
  ], { addLabel: '+ Ressource', blank: { name: '', max: 1, reset: 'manual' } });

  const node = el('div', { class: 'editor-form' }, [
    sectionTitle('Grunddaten'), headerGrid,
    sectionTitle('Attribute'), abilityGrid,
    sectionTitle('Statblock (Angriffe, Aktionen, Merkmale, Resistenzen, Sinne, ...)'), statblockInput,
    sectionTitle('Zähler für den Kampf (optional)'),
    el('p', { class: 'muted small', text: 'Nur für Dinge, die du im Kampf anklicken willst. Alles andere gehört in den Statblock-Text.' }),
    legendaryGrid,
    el('div', { class: 'tracker-block-title', text: 'Ressourcen mit Nutzungen (z.B. Odem 1/Tag, Aufladen 5–6)' }),
    resourcesList.node,
  ]);

  function collect() {
    const abilities = {};
    ABILITIES.forEach((ab) => { abilities[ab] = Number(abilityInputs[ab].value) || 10; });
    return {
      ...source,
      name: nameInput.value.trim() || 'Unbenanntes Monster',
      ac: Number(acInput.value) || 10,
      hpMax: Math.max(1, Number(hpMaxInput.value) || 1),
      speed: speedInput.value.trim(),
      abilities,
      statblockText: statblockInput.value,
      legendary: {
        actionsMax: Math.max(0, Number(legendaryActionsInput.value) || 0),
        resistancesMax: Math.max(0, Number(legendaryResistInput.value) || 0),
      },
      // Vorhandene Ressourcen behalten ihre aktuelle Nutzungszahl, sonst
      // würde jedes Bearbeiten der Vorlage sie auf "voll" zurücksetzen.
      resources: resourcesList.collect().map((r) => {
        const existing = (source.resources || []).find((sr) => sr.name.toLowerCase() === r.name.toLowerCase());
        return {
          id: existing ? existing.id : 'res_' + r.name.toLowerCase().replace(/[^a-zäöüß0-9]+/gi, '_') + '_' + Math.random().toString(36).slice(2, 6),
          name: r.name, max: r.max, current: existing ? Math.min(existing.current, r.max) : r.max, reset: r.reset,
        };
      }),
    };
  }

  return { node, collect };
}

function sectionTitle(text) {
  return el('h3', { class: 'editor-section-title', text });
}
