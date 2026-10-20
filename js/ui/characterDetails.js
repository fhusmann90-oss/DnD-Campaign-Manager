/**
 * characterDetails.js
 * ---------------------------------------------------------------------------
 * Einklappbare Nachschlage-Bereiche einer Charakterkarte: Angriffe, Zauber
 * (Freitext + Zauber-SG/Angriffsbonus), Merkmale (Klassen-, Unterklassen-,
 * Volksmerkmale, Hintergrund, Talente, Übungen), Inventar und Notizen.
 * Wird im Charaktere-Reiter (alle Bereiche) und im Encounter (nur die für
 * den Kampf relevanten) benutzt.
 * ---------------------------------------------------------------------------
 */

import { el, collapsible } from './shared.js';
import { ABILITY_LABEL, abilityMod, fmtMod, profBonusForLevel } from '../data/rules.js';

export const FEATURE_SECTIONS = [
  ['classFeatures', 'Klassenmerkmale'],
  ['subclassFeatures', 'Unterklassenmerkmale'],
  ['speciesTraits', 'Volksmerkmale'],
  ['background', 'Hintergrund'],
  ['feats', 'Talente'],
  ['proficienciesText', 'Übungen & Sprachen'],
];

const has = (t) => t != null && String(t).trim() !== '';

export function renderCharacterDetails(char, keyPrefix, { sections = ['attacks', 'spells', 'features', 'inventory', 'notes'] } = {}) {
  const out = [];

  if (sections.includes('attacks') && (char.attacks || []).length) {
    out.push(collapsible(keyPrefix + '-attacks', 'Angriffe & Aktionen', [
      el('ul', { class: 'plain-list' }, char.attacks.map((a) => el('li', {
        text: `${a.name}${a.toHit ? ` (${fmtMod(a.toHit)} zu treffen)` : ''}${a.range ? ` · ${a.range}` : ''}${a.damage ? ` · ${a.damage} ${a.damageType || ''}` : ''}${a.description ? ` — ${a.description}` : ''}`,
      }))),
    ], { badge: char.attacks.length }));
  }

  const sc = char.spellcasting || {};
  if (sections.includes('spells') && (has(char.spellsText) || (char.spellSlots || []).length)) {
    const ab = sc.ability || 'int';
    const pb = profBonusForLevel(char.stufe);
    const mod = abilityMod(char.abilities[ab]);
    out.push(collapsible(keyPrefix + '-spells', 'Zauber', [
      el('p', { class: 'small muted', text: `Zauberattribut ${ABILITY_LABEL[ab]} · Zauber-SG ${8 + pb + mod} · Zauberangriff ${fmtMod(pb + mod)}` }),
      has(char.spellsText) ? el('div', { class: 'statblock-text', text: char.spellsText }) : el('p', { class: 'muted small', text: 'Keine Zauber eingetragen.' }),
    ]));
  }

  if (sections.includes('features')) {
    const filled = FEATURE_SECTIONS.filter(([key]) => has(char[key]));
    if (filled.length) {
      const children = [];
      filled.forEach(([key, label]) => {
        children.push(el('div', { class: 'tracker-block-title', text: label }));
        children.push(el('div', { class: 'statblock-text feature-text', text: char[key] }));
      });
      out.push(collapsible(keyPrefix + '-features', 'Merkmale', children, { badge: filled.length }));
    }
  }

  if (sections.includes('inventory')) {
    const currencyText = Object.entries(char.currency || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(', ');
    const items = (char.inventory || []).map((i) => `${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ''}`);
    if (items.length || currencyText) {
      out.push(collapsible(keyPrefix + '-inventory', 'Inventar & Währung', [
        el('ul', { class: 'plain-list' }, [...items, ...(currencyText ? [currencyText] : [])].map((l) => el('li', { text: l }))),
      ]));
    }
  }

  if (sections.includes('notes') && has(char.notes)) {
    out.push(collapsible(keyPrefix + '-notes', 'Notizen', [el('div', { class: 'statblock-text', text: char.notes })]));
  }
  return out;
}
