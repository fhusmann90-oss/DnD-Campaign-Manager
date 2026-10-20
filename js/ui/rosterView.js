/**
 * rosterView.js
 * ---------------------------------------------------------------------------
 * "Charaktere"-Tab: Liste der Spielercharaktere der aktiven Kampagne, als
 * aufklappbare Karten mit vollem Tracking (TP, Zauberplätze, Ressourcen,
 * Zustände, Konzentration, Erschöpfung, Todesrettungswürfe, Rasten) sowie
 * einem kompakten Kopf (RK/Bewegung/Trefferwürfel) und dem einklappbaren
 * Bereich "Fähigkeitenboni" (siehe abilityPanel.js).
 * ---------------------------------------------------------------------------
 */

import { el, escapeHtml, openModal, closeModal, confirmModal, toast } from './shared.js';
import {
  renderHpBlock, renderSpellSlotsBlock, renderResourcesBlock, renderConditionsBlock,
  renderConcentrationBlock, renderExhaustionBlock, renderDeathSavesBlock, renderRestButtons,
} from './trackerWidgets.js';
import { buildCharacterEditor } from './characterEditor.js';
import { renderAbilityPanel } from './abilityPanel.js';
import { renderCharacterDetails } from './characterDetails.js';
import { importCharacterFromPdf, openEditablePreview } from './importFlow.js';
import { profBonusForLevel, fmtMod, effectiveSkillBonus } from '../data/rules.js';

// Welche Karten gerade aufgeklappt sind - reiner UI-Zustand, nicht Teil des
// gespeicherten Store-State (muss daher nicht in localStorage landen).
const expanded = new Set();

export function renderRosterView(store, container) {
  const camp = store.getActiveCampaign();
  container.innerHTML = '';
  if (!camp) {
    container.appendChild(el('p', { class: 'muted', text: 'Keine aktive Kampagne. Lege oben eine Kampagne an.' }));
    return;
  }

  const toolbar = el('div', { class: 'row gap wrap toolbar' }, [
    el('button', {
      class: 'btn btn-primary', text: '+ Charakter (manuell)',
      onclick: () => openCharacterEditorModal(store, null),
    }),
    el('button', {
      class: 'btn', text: '📄 Charakterbogen (PDF) importieren',
      onclick: async () => {
        const data = await importCharacterFromPdf();
        if (!data) return;
        openEditablePreview({
          kind: 'character', data, title: 'Charakter-Import prüfen',
          onSave: (collected) => { store.addRosterCharacter(collected); },
        });
      },
    }),
  ]);
  container.appendChild(toolbar);

  if (!camp.roster.length) {
    container.appendChild(el('p', { class: 'muted', text: 'Noch keine Charaktere angelegt.' }));
    return;
  }

  const rerender = () => renderRosterView(store, container);
  camp.roster.forEach((char) => container.appendChild(renderCharacterCard(store, char, rerender)));
}

function renderCharacterCard(store, char, rerender) {
  const isOpen = expanded.has(char.id);
  const profBonus = profBonusForLevel(char.stufe);
  const card = el('div', { class: 'card' });

  const header = el('div', { class: 'card-header', onclick: () => { toggleExpanded(char.id); rerender(); } }, [
    el('div', {}, [
      el('div', { class: 'card-title', text: char.name }),
      el('div', { class: 'muted small', text: [`${char.klasse || '—'}${char.unterklasse ? ' (' + char.unterklasse + ')' : ''} ${char.stufe}`, char.spezies, char.spielername].filter(Boolean).join(' · ') }),
    ]),
    el('div', { class: 'row gap align-center' }, [
      el('span', { class: 'badge', text: 'RK ' + (char.ac ?? '–') }),
      el('span', { class: 'badge', text: `TP ${char.hp.current}/${char.hp.max}` + (char.hp.temp ? `+${char.hp.temp}` : '') }),
      el('span', { class: 'chevron', text: isOpen ? '▾' : '▸' }),
    ]),
  ]);
  card.appendChild(header);

  if (!isOpen) return card;

  const body = el('div', { class: 'card-body' });

  // --- Kompakte Übersicht ---------------------------------------------------
  body.appendChild(el('p', { class: 'small overview-line' }, [
    el('strong', { text: 'Bewegung ' }), document.createTextNode(char.speed || '–'),
    el('span', { class: 'sep', text: ' · ' }),
    el('strong', { text: 'Trefferwürfel ' }), document.createTextNode(`${char.hitDice.total - char.hitDice.used}/${char.hitDice.total} W${char.hitDice.die}`),
    el('span', { class: 'sep', text: ' · ' }),
    el('strong', { text: 'ÜB ' }), document.createTextNode(fmtMod(profBonus)),
    el('span', { class: 'sep', text: ' · ' }),
    el('strong', { text: 'Passive Wahrnehmung ' }), document.createTextNode(String(10 + effectiveSkillBonus(char, 'wahrnehmung'))),
  ]));

  const patch = (partial) => store.updateRosterCharacter(char.id, partial);
  body.appendChild(renderAbilityPanel(char, patch, 'roster-' + char.id));

  body.appendChild(renderHpBlock(char, patch));
  const slotsBlock = renderSpellSlotsBlock(char, patch);
  if (slotsBlock) body.appendChild(slotsBlock);
  body.appendChild(renderResourcesBlock(char, patch));
  body.appendChild(renderConditionsBlock(char, patch));
  body.appendChild(renderConcentrationBlock(char, patch));
  body.appendChild(renderExhaustionBlock(char, patch));
  body.appendChild(renderDeathSavesBlock(char, patch));
  body.appendChild(renderRestButtons({
    onShortRest: () => store.restRosterCharacter(char.id, 'short'),
    onLongRest: () => store.restRosterCharacter(char.id, 'long'),
  }));

  // --- Angriffe, Zauber, Merkmale, Inventar, Notizen (einklappbar) ------------
  renderCharacterDetails(char, 'roster-' + char.id).forEach((n) => body.appendChild(n));

  body.appendChild(el('div', { class: 'row gap justify-end' }, [
    el('button', { class: 'btn btn-sm', onclick: () => openCharacterEditorModal(store, char), text: '✎ Bearbeiten' }),
    el('button', {
      class: 'btn btn-sm btn-danger', text: '🗑 Löschen',
      onclick: async () => {
        if (await confirmModal(`"${char.name}" wirklich löschen?`)) store.deleteRosterCharacter(char.id);
      },
    }),
  ]));

  card.appendChild(body);
  return card;
}

function toggleExpanded(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
}

function openCharacterEditorModal(store, existingChar) {
  const { node, collect } = buildCharacterEditor(existingChar || {});
  const wrapper = el('div', {}, [
    node,
    el('div', { class: 'row gap justify-end sticky-footer' }, [
      el('button', { class: 'btn', onclick: () => closeModal(), text: 'Abbrechen' }),
      el('button', {
        class: 'btn btn-primary', text: 'Speichern',
        onclick: () => {
          const data = collect();
          if (existingChar) store.updateRosterCharacter(existingChar.id, data);
          else store.addRosterCharacter(data);
          closeModal();
          toast('Gespeichert.', 'success');
        },
      }),
    ]),
  ]);
  openModal(wrapper, { title: existingChar ? 'Charakter bearbeiten' : 'Neuer Charakter', wide: true });
}
