/**
 * encounterView.js
 * ---------------------------------------------------------------------------
 * "Encounter"-Tab: Initiative-Tracker und Kampfverwaltung. Zeigt die aktive
 * Encounter-Liste der Kampagne, lässt Encounter anlegen/umbenennen/löschen/
 * wechseln, und innerhalb eines Encounters: sortierte Initiative-Reihenfolge,
 * aktueller Zug, Rundenzähler, Vor-/Zurück, Verzögern/Bereitmachen,
 * tot/bewusstlos, sowie das volle Tracking (TP, Ressourcen, Zustände, ...)
 * pro Kampfteilnehmer über dieselben Widgets wie im Roster. Monster haben
 * ab 1.1 keine Todesrettungswürfe und keine Rast-Buttons; ihr Statblock
 * wird als Freitext angezeigt.
 * ---------------------------------------------------------------------------
 */

import { el, openModal, closeModal, confirmModal, toast, collapsible } from './shared.js';
import { renderAbilityPanel } from './abilityPanel.js';
import { renderCharacterDetails } from './characterDetails.js';
import {
  renderHpBlock, renderSpellSlotsBlock, renderResourcesBlock, renderConditionsBlock,
  renderConcentrationBlock, renderExhaustionBlock, renderDeathSavesBlock, renderRestButtons,
  renderInitiativeRoller,
} from './trackerWidgets.js';
import { Store } from '../state.js';
import { ABILITIES, ABILITY_SHORT, abilityMod, fmtMod } from '../data/rules.js';

const expanded = new Set();

export function renderEncounterView(store, container, nav) {
  const camp = store.getActiveCampaign();
  container.innerHTML = '';
  if (!camp) {
    container.appendChild(el('p', { class: 'muted', text: 'Keine aktive Kampagne.' }));
    return;
  }

  const rerender = () => renderEncounterView(store, container, nav);

  // --- Encounter-Auswahl ---------------------------------------------------
  const selectRow = el('div', { class: 'row gap wrap align-center toolbar' });
  const select = el('select', { class: 'input' });
  select.appendChild(el('option', { value: '', text: '— Encounter wählen —' }));
  camp.encounters.forEach((enc) => select.appendChild(el('option', { value: enc.id, text: enc.name })));
  select.value = camp.activeEncounterId || '';
  select.addEventListener('change', () => { store.setActiveEncounter(select.value || null); });
  selectRow.appendChild(select);
  selectRow.appendChild(el('button', {
    class: 'btn btn-primary', text: '+ Neuer Encounter',
    onclick: () => {
      const name = prompt('Name des neuen Encounters:', 'Neuer Encounter');
      if (name == null) return;
      store.createEncounter(name);
    },
  }));
  const encounter = store.getActiveEncounter();
  if (encounter) {
    selectRow.appendChild(el('button', {
      class: 'btn btn-sm', text: '✎ Umbenennen',
      onclick: () => {
        const name = prompt('Neuer Name:', encounter.name);
        if (name != null && name.trim()) store.renameEncounter(encounter.id, name.trim());
      },
    }));
    selectRow.appendChild(el('button', {
      class: 'btn btn-sm btn-danger', text: '🗑 Encounter löschen',
      onclick: async () => { if (await confirmModal(`Encounter "${encounter.name}" wirklich löschen?`)) store.deleteEncounter(encounter.id); },
    }));
  }
  container.appendChild(selectRow);

  // Szenen aus dem Story-Reiter, die auf diesen Encounter verweisen.
  const scenes = encounter && camp.story ? (camp.story.scenes || []).filter((sc) => (sc.encounterIds || []).includes(encounter.id)) : [];
  if (scenes.length) {
    container.appendChild(el('div', { class: 'link-group toolbar' }, [
      el('span', { class: 'link-group-label', text: 'Szene:' }),
      ...scenes.sort((a, b) => a.order - b.order).map((sc) => el('button', {
        class: 'chip chip-link', text: `🎬 ${sc.order}. ${sc.title || 'Szene'}`,
        onclick: () => nav && nav.openStory('scenes', sc.id),
      })),
    ]));
  }

  if (!encounter) {
    container.appendChild(el('p', { class: 'muted', text: 'Kein Encounter gewählt. Lege einen neuen an oder wähle oben einen aus.' }));
    return;
  }

  // --- Runden-/Zug-Kontrolle -------------------------------------------------
  const combatControls = el('div', { class: 'row gap wrap align-center toolbar' }, [
    el('span', { class: 'badge badge-lg', text: 'Runde ' + encounter.round }),
    el('button', {
      class: 'btn btn-primary', text: encounter.currentTurnId ? '↻ Kampf neu starten' : '▶ Kampf starten',
      onclick: () => store.startCombat(encounter.id),
    }),
    el('button', { class: 'btn', text: '◂ Vorheriger Zug', disabled: !encounter.currentTurnId, onclick: () => store.prevTurn(encounter.id) }),
    el('button', { class: 'btn btn-primary', text: 'Nächster Zug ▸', disabled: !encounter.currentTurnId, onclick: () => store.nextTurn(encounter.id) }),
  ]);
  container.appendChild(combatControls);
  container.appendChild(el('div', { class: 'row gap toolbar' }, [
    renderRestButtons({
      onShortRest: () => store.restAllInEncounter(encounter.id, 'short'),
      onLongRest: () => store.restAllInEncounter(encounter.id, 'long'),
      shortLabel: '🌙 Kurze Rast (alle Charaktere)',
      longLabel: '🌕 Lange Rast (alle Charaktere)',
    }),
  ]));

  container.appendChild(el('div', { class: 'row gap toolbar' }, [
    el('button', { class: 'btn btn-primary', text: '+ Kampfteilnehmer hinzufügen', onclick: () => openAddCombatantModal(store, encounter, rerender) }),
  ]));

  if (!encounter.combatants.length) {
    container.appendChild(el('p', { class: 'muted', text: 'Noch keine Kampfteilnehmer. Füge Charaktere oder Monster hinzu.' }));
    return;
  }

  const sorted = Store.sortedCombatants(encounter, (cb) => store._displayName(camp, cb));
  sorted.forEach((cb) => container.appendChild(renderCombatantCard(store, camp, encounter, cb, rerender)));
}

function renderCombatantCard(store, camp, encounter, cb, rerender) {
  const isPc = cb.type === 'pc';
  const rosterChar = isPc ? camp.roster.find((c) => c.id === cb.refId) : null;
  // Für PCs leben die eigentlichen Werte im Roster-Eintrag (patchCombatant
  // schreibt dort automatisch durch) - hier daher den Roster-Eintrag als
  // Datenquelle für die Tracker-Widgets benutzen, nicht die schlanke Hülle.
  const dataObj = isPc ? rosterChar : cb;
  if (!dataObj) return el('div', {});
  const name = isPc ? rosterChar.name : cb.name;
  const isCurrentTurn = encounter.currentTurnId === cb.instanceId;
  const isOpen = expanded.has(cb.instanceId);

  const card = el('div', { class: 'card' + (isCurrentTurn ? ' current-turn' : '') + (cb.isDead ? ' is-dead' : cb.isUnconscious ? ' is-unconscious' : '') });

  const initInput = el('input', {
    type: 'number', class: 'input input-sm', value: cb.initiative ?? '', placeholder: '–', style: 'width:4.5em',
    onchange: (e) => store.setInitiative(encounter.id, cb.instanceId, e.target.value === '' ? null : Number(e.target.value)),
  });
  const initExtra = isPc ? (rosterChar.initExtra || 0) + abilityMod(rosterChar.abilities.dex) : abilityMod((cb.abilities || {}).dex || 10);

  const header = el('div', { class: 'card-header enc-header', onclick: (e) => { if (e.target.closest('input,button,select')) return; toggleExpanded(cb.instanceId); rerender(); } }, [
    el('div', {}, [
      el('div', { class: 'card-title', text: (isCurrentTurn ? '▶ ' : '') + name + (cb.isDead ? ' (tot)' : cb.isUnconscious ? ' (bewusstlos)' : '') + (cb.delayed ? ' (verzögert)' : '') + (cb.ready ? ' (bereit)' : '') }),
      el('div', { class: 'muted small', text: `${isPc ? 'Charakter' : 'Monster'} · RK ${dataObj.ac ?? '–'}` }),
    ]),
    el('div', { class: 'row gap align-center enc-header-controls' }, [
      initInput,
      renderInitiativeRoller(initExtra, ({ roll, total }) => {
        store.setInitiative(encounter.id, cb.instanceId, total);
        toast(`${name}: W20 (${roll}) + ${fmtMod(initExtra)} = ${total}`, 'info');
      }),
      el('span', { class: 'badge', text: `TP ${dataObj.hp.current}/${dataObj.hp.max}` + (dataObj.hp.temp ? `+${dataObj.hp.temp}` : '') }),
      el('span', { class: 'chevron', text: isOpen ? '▾' : '▸' }),
    ]),
  ]);
  card.appendChild(header);

  if (!isOpen) return card;

  const body = el('div', { class: 'card-body' });
  const patch = (partial) => store.patchCombatant(encounter.id, cb.instanceId, partial);

  const quickControls = el('div', { class: 'row gap wrap' });
  quickControls.appendChild(toggleButton('Tot', cb.isDead, () => patch({ isDead: !cb.isDead, isUnconscious: false })));
  quickControls.appendChild(toggleButton('Bewusstlos', cb.isUnconscious, () => patch({ isUnconscious: !cb.isUnconscious, isDead: false })));
  quickControls.appendChild(toggleButton('Verzögert', cb.delayed, () => patch({ delayed: !cb.delayed, ready: false })));
  quickControls.appendChild(toggleButton('Bereit', cb.ready, () => patch({ ready: !cb.ready, delayed: false })));
  quickControls.appendChild(el('button', {
    class: 'btn btn-sm btn-danger', text: '🗑 Aus Kampf entfernen',
    onclick: async () => { if (await confirmModal(`${name} aus dem Kampf entfernen?`)) store.removeCombatant(encounter.id, cb.instanceId); },
  }));
  body.appendChild(quickControls);

  body.appendChild(renderHpBlock(dataObj, patch));
  if (isPc) body.appendChild(renderAbilityPanel(dataObj, patch, 'enc-' + cb.instanceId));
  const slotsBlock = renderSpellSlotsBlock(dataObj, patch);
  if (slotsBlock) body.appendChild(slotsBlock);
  if (!isPc) body.appendChild(renderLegendaryBlock(cb, patch));
  if (isPc || (dataObj.resources && dataObj.resources.length)) body.appendChild(renderResourcesBlock(dataObj, patch));
  body.appendChild(renderConditionsBlock(dataObj, patch));
  body.appendChild(renderConcentrationBlock(dataObj, patch));
  body.appendChild(renderExhaustionBlock(dataObj, patch));
  if (isPc) {
    body.appendChild(renderDeathSavesBlock(dataObj, patch));
    body.appendChild(renderRestButtons({
      onShortRest: () => store.restCombatant(encounter.id, cb.instanceId, 'short'),
      onLongRest: () => store.restCombatant(encounter.id, cb.instanceId, 'long'),
    }));
    renderCharacterDetails(dataObj, 'enc-' + cb.instanceId, { sections: ['attacks', 'spells', 'features'] }).forEach((n) => body.appendChild(n));
  } else {
    const abilityRow = el('div', { class: 'row gap wrap stat-row' });
    ABILITIES.forEach((ab) => {
      const score = (cb.abilities || {})[ab] ?? 10;
      abilityRow.appendChild(el('div', { class: 'stat-pill' }, [
        el('div', { class: 'stat-pill-label', text: ABILITY_SHORT[ab] }),
        el('div', { class: 'stat-pill-value', text: `${score} (${fmtMod(abilityMod(score))})` }),
      ]));
    });
    const statblock = [abilityRow, el('p', { class: 'small', text: `Bewegungsrate: ${cb.speed || '–'}` })];
    if (cb.statblockText && cb.statblockText.trim()) statblock.push(el('div', { class: 'statblock-text', text: cb.statblockText }));
    body.appendChild(collapsible('enc-statblock-' + cb.instanceId, 'Statblock', statblock, { defaultOpen: true }));
  }

  card.appendChild(body);
  return card;
}

function renderLegendaryBlock(cb, patch) {
  const leg = cb.legendary || { actionsMax: 0, actionsCurrent: 0, resistancesMax: 0, resistancesCurrent: 0 };
  if (!leg.actionsMax && !leg.resistancesMax) return el('div', {});
  const node = el('div', { class: 'tracker-block' }, [el('div', { class: 'tracker-block-title', text: 'Legendäre Aktionen & Resistenzen' })]);
  if (leg.actionsMax) {
    node.appendChild(pipRowFor('Legendäre Aktionen', leg.actionsCurrent, leg.actionsMax, (v) => patch({ legendary: { ...leg, actionsCurrent: v } })));
  }
  if (leg.resistancesMax) {
    node.appendChild(pipRowFor('Legendäre Resistenzen', leg.resistancesCurrent, leg.resistancesMax, (v) => patch({ legendary: { ...leg, resistancesCurrent: v } })));
  }
  node.appendChild(el('button', {
    class: 'btn btn-sm', text: 'Zu Rundenbeginn zurücksetzen (Aktionen)',
    onclick: () => patch({ legendary: { ...leg, actionsCurrent: leg.actionsMax } }),
  }));
  return node;
}

function pipRowFor(label, current, max, onSet) {
  const row = el('div', { class: 'row gap align-center' }, [el('span', { class: 'pip-label', text: label })]);
  const pipRow = el('div', { class: 'pip-row' });
  for (let i = 0; i < max; i += 1) {
    const filled = i < current;
    pipRow.appendChild(el('button', {
      class: 'pip' + (filled ? ' pip-filled' : ''),
      onclick: () => onSet(i < current ? i : i + 1),
    }));
  }
  row.appendChild(pipRow);
  row.appendChild(el('span', { class: 'muted small', text: `${current}/${max}` }));
  return row;
}

function toggleButton(label, active, onclick) {
  return el('button', { class: 'btn btn-sm' + (active ? ' btn-primary' : ''), onclick, text: label });
}

function toggleExpanded(id) {
  if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
}

// --- "Kampfteilnehmer hinzufügen"-Modal ---------------------------------------

function openAddCombatantModal(store, encounter, rerender) {
  const camp = store.getActiveCampaign();
  const body = el('div', {});

  body.appendChild(el('h3', { class: 'editor-section-title', text: 'Charaktere' }));
  const rosterAvailable = camp.roster.filter((c) => !encounter.combatants.some((cb) => cb.type === 'pc' && cb.refId === c.id));
  if (!rosterAvailable.length) {
    body.appendChild(el('p', { class: 'muted small', text: 'Alle Charaktere sind schon im Kampf (oder es gibt keine).' }));
  } else {
    rosterAvailable.forEach((c) => {
      body.appendChild(el('div', { class: 'row gap align-center' }, [
        el('span', { text: c.name, style: 'flex:1' }),
        el('button', {
          class: 'btn btn-sm btn-primary', text: '+ hinzufügen',
          onclick: () => { store.addCombatantFromRoster(encounter.id, c.id); toast(`${c.name} zum Kampf hinzugefügt.`, 'success'); closeModal(); },
        }),
      ]));
    });
  }

  body.appendChild(el('h3', { class: 'editor-section-title', text: 'Aus der Monster-Bibliothek' }));
  if (!camp.monsterLibrary.length) {
    body.appendChild(el('p', { class: 'muted small', text: 'Bibliothek ist leer.' }));
  } else {
    camp.monsterLibrary.forEach((tpl) => {
      const countInput = el('input', { type: 'number', class: 'input input-sm', value: '1', min: '1', style: 'width:4.5em' });
      body.appendChild(el('div', { class: 'row gap align-center' }, [
        el('span', { text: tpl.name, style: 'flex:1' }),
        countInput,
        el('button', {
          class: 'btn btn-sm btn-primary', text: '+ hinzufügen',
          onclick: () => {
            const n = Math.max(1, Number(countInput.value) || 1);
            store.addCombatantsFromTemplate(encounter.id, tpl.id, n);
            toast(`${n}x ${tpl.name} zum Kampf hinzugefügt.`, 'success');
            closeModal();
          },
        }),
      ]));
    });
  }

  body.appendChild(el('h3', { class: 'editor-section-title', text: 'Ad-hoc-NSC (ohne Vorlage)' }));
  const adhocName = el('input', { type: 'text', class: 'input', placeholder: 'Name' });
  body.appendChild(el('div', { class: 'row gap align-center' }, [
    adhocName,
    el('button', {
      class: 'btn btn-sm btn-primary', text: '+ hinzufügen',
      onclick: () => {
        if (!adhocName.value.trim()) return;
        store.addAdhocCombatant(encounter.id, adhocName.value.trim());
        closeModal();
      },
    }),
  ]));

  openModal(body, { title: 'Kampfteilnehmer hinzufügen', wide: true });
}
