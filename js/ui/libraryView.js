/**
 * libraryView.js
 * ---------------------------------------------------------------------------
 * "Monster"-Tab: die Monster-Bibliothek der aktiven Kampagne (SRD-Vorlagen +
 * selbst angelegte). Ab 1.1 werden Monster nur noch manuell angelegt. Jede Vorlage ist eine kompakte Karte mit
 * den Kernwerten; von hier aus lassen sich beliebig viele nummerierte
 * Kopien direkt in den aktiven Encounter ziehen (siehe encounterView.js für
 * die eigentliche Verwaltung während des Kampfes).
 * ---------------------------------------------------------------------------
 */

import { el, openModal, closeModal, confirmModal, toast, collapsible } from './shared.js';
import { buildMonsterEditor } from './monsterEditor.js';
import { ABILITIES, ABILITY_SHORT, abilityMod, fmtMod } from '../data/rules.js';

export function renderLibraryView(store, container) {
  const camp = store.getActiveCampaign();
  container.innerHTML = '';
  if (!camp) {
    container.appendChild(el('p', { class: 'muted', text: 'Keine aktive Kampagne.' }));
    return;
  }

  const toolbar = el('div', { class: 'row gap wrap toolbar' }, [
    el('button', { class: 'btn btn-primary', text: '+ Neues Monster', onclick: () => openMonsterEditorModal(store, null) }),
  ]);
  container.appendChild(toolbar);

  if (!camp.monsterLibrary.length) {
    container.appendChild(el('p', { class: 'muted', text: 'Noch keine Monster in der Bibliothek.' }));
    return;
  }

  const grid = el('div', { class: 'card-grid' });
  camp.monsterLibrary.forEach((tpl) => grid.appendChild(renderMonsterCard(store, tpl)));
  container.appendChild(grid);
}

function renderMonsterCard(store, tpl) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'card-header no-hover' }, [
    el('div', {}, [
      el('div', { class: 'card-title', text: tpl.name }),
      el('div', { class: 'muted small', text: `RK ${tpl.ac} · TP ${tpl.hpMax} · ${tpl.speed || '–'}` }),
    ]),
    tpl.builtin ? el('span', { class: 'badge badge-muted', text: 'SRD' }) : null,
  ]));

  const body = el('div', { class: 'card-body' });
  const abilityRow = el('div', { class: 'row gap wrap stat-row' });
  ABILITIES.forEach((ab) => {
    abilityRow.appendChild(el('div', { class: 'stat-pill' }, [
      el('div', { class: 'stat-pill-label', text: ABILITY_SHORT[ab] }),
      el('div', { class: 'stat-pill-value', text: `${tpl.abilities[ab]} (${fmtMod(abilityMod(tpl.abilities[ab]))})` }),
    ]));
  });
  body.appendChild(abilityRow);
  const counters = [];
  if (tpl.legendary && (tpl.legendary.actionsMax || tpl.legendary.resistancesMax)) {
    counters.push(`Legendär: ${tpl.legendary.actionsMax} Aktion(en)/Runde, ${tpl.legendary.resistancesMax} Resistenz(en)/Tag`);
  }
  (tpl.resources || []).forEach((r) => counters.push(`${r.name}: ${r.max}`));
  if (counters.length) body.appendChild(el('p', { class: 'small muted', text: counters.join(' · ') }));
  if (tpl.statblockText && tpl.statblockText.trim()) {
    body.appendChild(collapsible('lib-statblock-' + tpl.id, 'Statblock', [
      el('div', { class: 'statblock-text', text: tpl.statblockText }),
    ]));
  }

  const encounter = store.getActiveEncounter();
  const addRow = el('div', { class: 'row gap align-center wrap' });
  const countInput = el('input', { type: 'number', class: 'input input-sm', value: '1', min: '1', style: 'width:4.5em' });
  addRow.appendChild(countInput);
  addRow.appendChild(el('button', {
    class: 'btn btn-sm btn-primary',
    text: encounter ? `+ zu "${encounter.name}" hinzufügen` : 'kein Encounter gewählt',
    disabled: !encounter,
    onclick: () => {
      if (!encounter) return;
      store.addCombatantsFromTemplate(encounter.id, tpl.id, Math.max(1, Number(countInput.value) || 1));
      toast(`${countInput.value}x ${tpl.name} zu "${encounter.name}" hinzugefügt.`, 'success');
    },
  }));
  body.appendChild(addRow);

  body.appendChild(el('div', { class: 'row gap justify-end' }, [
    el('button', { class: 'btn btn-sm', onclick: () => openMonsterEditorModal(store, tpl), text: '✎ Bearbeiten' }),
    el('button', {
      class: 'btn btn-sm btn-danger', text: '🗑 Löschen',
      onclick: async () => { if (await confirmModal(`"${tpl.name}" wirklich aus der Bibliothek löschen?`)) store.deleteMonsterTemplate(tpl.id); },
    }),
  ]));

  card.appendChild(body);
  return card;
}

function openMonsterEditorModal(store, existingTpl) {
  const { node, collect } = buildMonsterEditor(existingTpl || {});
  const wrapper = el('div', {}, [
    node,
    el('div', { class: 'row gap justify-end sticky-footer' }, [
      el('button', { class: 'btn', onclick: () => closeModal(), text: 'Abbrechen' }),
      el('button', {
        class: 'btn btn-primary', text: 'Speichern',
        onclick: () => {
          const data = collect();
          if (existingTpl) store.updateMonsterTemplate(existingTpl.id, data);
          else store.addMonsterTemplate(data);
          closeModal();
          toast('Gespeichert.', 'success');
        },
      }),
    ]),
  ]);
  openModal(wrapper, { title: existingTpl ? 'Monster bearbeiten' : 'Neues Monster', wide: true });
}
