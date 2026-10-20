/**
 * abilityPanel.js
 * ---------------------------------------------------------------------------
 * Einklappbarer Bereich "Fähigkeitenboni" auf der Charakterkarte (Roster und
 * Encounter): alle sechs Attribute mit Wert und Modifikator, alle sechs
 * Rettungswürfe und alle 18 Fertigkeiten mit Bonus. Übung/Expertise sind
 * markiert und direkt auf der Karte umschaltbar, jeder Bonus ist direkt
 * editierbar.
 *
 * Boni werden aus Attribut + Übungsbonus berechnet, außer es gibt einen
 * eigenen Wert (aus dem PDF übernommen oder von Hand eingetragen) - dann hat
 * dieser Vorrang und ist mit einem ↺-Knopf wieder auf "berechnet" zurück-
 * setzbar. Wird ein Wert eingetragen, der exakt dem berechneten entspricht,
 * wird kein Override gespeichert (dann rechnet er bei Stufenaufstieg mit).
 * ---------------------------------------------------------------------------
 */

import { el, collapsible } from './shared.js';
import {
  ABILITIES, ABILITY_SHORT, ABILITY_LABEL, SKILLS, abilityMod, fmtMod, profBonusForLevel,
  saveBonus, skillBonusFor, effectiveSaveBonus, effectiveSkillBonus, parseSignedNumber,
} from '../data/rules.js';

const TIER_LABEL = ['–', 'Ü', 'E'];
const TIER_TITLE = ['ungeübt', 'geübt', 'Expertise'];

function hasOverride(map, key) {
  return map && map[key] != null && map[key] !== '' && Number.isFinite(Number(map[key]));
}

function bonusInput(value, isOverride, onCommit) {
  const input = el('input', {
    type: 'text', inputmode: 'numeric', class: 'input input-sm bonus-input' + (isOverride ? ' is-override' : ''),
    value: fmtMod(value), 'aria-label': 'Bonus',
  });
  input.addEventListener('focus', () => input.select());
  input.addEventListener('change', () => {
    const v = parseSignedNumber(input.value);
    if (v == null) { input.value = fmtMod(value); return; }
    onCommit(v);
  });
  return input;
}

export function renderAbilityPanel(char, patch, keyPrefix) {
  const pb = profBonusForLevel(char.stufe);
  const saveOv = char.saveBonusOverride || {};
  const skillOv = char.skillBonusOverride || {};

  // --- Attribute -----------------------------------------------------------
  const abilityGrid = el('div', { class: 'ability-panel-grid' });
  ABILITIES.forEach((ab) => {
    const scoreInput = el('input', {
      type: 'number', class: 'input input-sm', value: String(char.abilities[ab] ?? 10), min: '1', max: '30',
      'aria-label': ABILITY_LABEL[ab],
      onchange: (e) => patch({ abilities: { ...char.abilities, [ab]: Number(e.target.value) || 10 } }),
    });
    abilityGrid.appendChild(el('div', { class: 'ability-panel-cell' }, [
      el('div', { class: 'stat-pill-label', text: ABILITY_SHORT[ab] }),
      scoreInput,
      el('div', { class: 'ability-mod', text: fmtMod(abilityMod(char.abilities[ab])) }),
    ]));
  });

  // --- Rettungswürfe -----------------------------------------------------------
  const saveGrid = el('div', { class: 'bonus-grid' });
  ABILITIES.forEach((ab) => {
    const prof = !!(char.saveProf && char.saveProf[ab]);
    const computed = () => saveBonus(char.abilities, char.saveProf || {}, pb, ab);
    const isOv = hasOverride(saveOv, ab);
    const row = el('div', { class: 'bonus-row' + (prof ? ' prof' : '') }, [
      el('button', {
        class: 'tier-btn' + (prof ? ' t1' : ''), title: prof ? 'geübt (antippen zum Umschalten)' : 'ungeübt (antippen zum Umschalten)',
        text: prof ? 'Ü' : '–',
        onclick: () => patch({ saveProf: { ...(char.saveProf || {}), [ab]: !prof } }),
      }),
      el('span', { class: 'bonus-name', text: ABILITY_LABEL[ab] }),
      bonusInput(effectiveSaveBonus(char, ab), isOv, (v) => {
        patch({ saveBonusOverride: { ...saveOv, [ab]: v === computed() ? null : v } });
      }),
      isOv ? el('button', {
        class: 'btn-icon reset-btn', title: `Eigener Wert. Zurück auf berechnet (${fmtMod(computed())})`, text: '↺',
        onclick: () => patch({ saveBonusOverride: { ...saveOv, [ab]: null } }),
      }) : el('span', { class: 'reset-placeholder' }),
    ]);
    saveGrid.appendChild(row);
  });

  // --- Fertigkeiten ------------------------------------------------------------
  const skillGrid = el('div', { class: 'bonus-grid' });
  SKILLS.forEach((skill) => {
    const tier = (char.skillProf && char.skillProf[skill.key]) || 0;
    const computed = () => skillBonusFor(char.abilities, char.skillProf || {}, pb, skill.key);
    const isOv = hasOverride(skillOv, skill.key);
    skillGrid.appendChild(el('div', { class: 'bonus-row' + (tier ? ' prof' : '') + (tier === 2 ? ' exp' : '') }, [
      el('button', {
        class: 'tier-btn' + (tier ? ' t' + tier : ''), title: TIER_TITLE[tier] + ' (antippen zum Umschalten)', text: TIER_LABEL[tier],
        onclick: () => patch({ skillProf: { ...(char.skillProf || {}), [skill.key]: (tier + 1) % 3 } }),
      }),
      el('span', { class: 'bonus-name' }, [
        document.createTextNode(skill.name + ' '),
        el('span', { class: 'muted small', text: ABILITY_SHORT[skill.ab] }),
      ]),
      bonusInput(effectiveSkillBonus(char, skill.key), isOv, (v) => {
        patch({ skillBonusOverride: { ...skillOv, [skill.key]: v === computed() ? null : v } });
      }),
      isOv ? el('button', {
        class: 'btn-icon reset-btn', title: `Eigener Wert. Zurück auf berechnet (${fmtMod(computed())})`, text: '↺',
        onclick: () => patch({ skillBonusOverride: { ...skillOv, [skill.key]: null } }),
      }) : el('span', { class: 'reset-placeholder' }),
    ]));
  });

  const passive = 10 + effectiveSkillBonus(char, 'wahrnehmung');
  return collapsible(keyPrefix + '-abilities', 'Fähigkeitenboni', [
    el('p', { class: 'muted small', text: `Übungsbonus ${fmtMod(pb)} · Passive Wahrnehmung ${passive} · Ü = geübt, E = Expertise. Blau umrandete Boni sind eigene Werte (↺ = wieder berechnen).` }),
    el('div', { class: 'tracker-block-title', text: 'Attribute' }), abilityGrid,
    el('div', { class: 'tracker-block-title', text: 'Rettungswürfe' }), saveGrid,
    el('div', { class: 'tracker-block-title', text: 'Fertigkeiten' }), skillGrid,
  ], { defaultOpen: false });
}
