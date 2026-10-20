/**
 * migrate.js
 * ---------------------------------------------------------------------------
 * Bringt gespeicherte Zustände und JSON-Exporte älterer Versionen auf das
 * aktuelle Datenmodell. Läuft beim Laden aus localStorage, beim JSON-Import
 * und beim Laden aus der Cloud. Alle Funktionen sind idempotent: ein bereits
 * aktueller Zustand bleibt unverändert, ein mehrfaches Ausführen schadet nicht.
 *
 * Schema-Versionen:
 *   1  Version 1.0 (Monster mit vielen Einzelfeldern)
 *   2  Version 1.1 (Monster: Kernwerte + Freitext-Statblock; Bonus-Overrides
 *      für Rettungswürfe und Fertigkeiten)
 *   3  Version 1.2 (Charakter-Merkmale und Zauber als Freitext, Zauberplätze
 *      mit Voreinstellung nach Klasse/Stufe)
 *   4  Version 1.3 (Story-Reiter: campaign.story)
 * ---------------------------------------------------------------------------
 */

import { fmtMod, detectCasterType, presetSpellSlots } from './data/rules.js';

import { STORY_KIND_KEYS, blankStory } from './data/storySchema.js';

export const CURRENT_SCHEMA = 4;

function nonEmpty(v) { return v != null && String(v).trim() !== ''; }

/**
 * Baut aus den Einzelfeldern eines Monsters (Format 1.0) einen lesbaren
 * Statblock-Text, damit beim Umstieg auf das Freitextfeld nichts verloren geht.
 */
export function legacyMonsterFieldsToText(m) {
  const lines = [];
  const head = [m.size, m.type].filter(nonEmpty).join(' ');
  const headLine = [head, m.crText].filter(nonEmpty).join(' · ');
  if (headLine) lines.push(headLine);
  if (nonEmpty(m.hpFormula)) lines.push(`TP-Formel: ${m.hpFormula}`);
  if (nonEmpty(m.savesText)) lines.push(`Rettungswürfe: ${m.savesText}`);
  if (nonEmpty(m.skillsText)) lines.push(`Fertigkeiten: ${m.skillsText}`);
  const list = (arr) => (Array.isArray(arr) ? arr.filter(nonEmpty).join(', ') : '');
  if (list(m.vulnerabilities)) lines.push(`Schadensanfälligkeiten: ${list(m.vulnerabilities)}`);
  if (list(m.resistances)) lines.push(`Schadensresistenzen: ${list(m.resistances)}`);
  if (list(m.immunities)) lines.push(`Schadensimmunitäten: ${list(m.immunities)}`);
  if (list(m.conditionImmunities)) lines.push(`Zustandsimmunitäten: ${list(m.conditionImmunities)}`);
  if (nonEmpty(m.sensesText)) lines.push(`Sinne: ${m.sensesText}`);
  if (nonEmpty(m.languagesText)) lines.push(`Sprachen: ${m.languagesText}`);

  const features = (m.features || []).filter((f) => nonEmpty(f.name) || nonEmpty(f.description));
  if (features.length) {
    lines.push('', 'MERKMALE');
    features.forEach((f) => lines.push(`${f.name || ''}. ${f.description || ''}`.trim()));
  }
  const attacks = (m.attacks || []).filter((a) => nonEmpty(a.name));
  if (attacks.length) {
    lines.push('', 'AKTIONEN');
    attacks.forEach((a) => {
      const parts = [];
      if (a.toHit) parts.push(`${fmtMod(a.toHit)} zum Treffen`);
      if (nonEmpty(a.range)) parts.push(`Reichweite ${a.range}`);
      if (nonEmpty(a.damage) && a.damage !== '-') parts.push(`Treffer: ${a.damage}${nonEmpty(a.damageType) && a.damageType !== '-' ? ' ' + a.damageType : ''}`);
      let line = `${a.name}.` + (parts.length ? ' ' + parts.join(', ') + '.' : '');
      if (nonEmpty(a.description)) line += ' ' + a.description;
      lines.push(line);
    });
  }
  const inv = (m.inventory || []).filter((i) => nonEmpty(i.name));
  if (inv.length) {
    lines.push('', 'INVENTAR');
    lines.push(inv.map((i) => `${i.name}${i.qty > 1 ? ` (${i.qty}x)` : ''}`).join(', '));
  }
  const cur = m.currency ? Object.entries(m.currency).filter(([, v]) => v).map(([k, v]) => `${v} ${k.toUpperCase()}`) : [];
  if (cur.length) lines.push(`Münzen: ${cur.join(', ')}`);
  if (nonEmpty(m.notes)) lines.push('', 'NOTIZEN', m.notes);
  return lines.join('\n').trim();
}

const LEGACY_MONSTER_FIELDS = [
  'size', 'type', 'crText', 'hpFormula', 'savesText', 'skillsText', 'sensesText', 'languagesText',
  'resistances', 'immunities', 'vulnerabilities', 'conditionImmunities',
  'features', 'attacks', 'inventory', 'currency', 'notes',
];

/** Monster-Vorlage (Bibliothek) auf das Format ab 1.1 bringen. */
export function migrateMonsterTemplate(tpl) {
  if (!tpl || typeof tpl !== 'object') return tpl;
  if (tpl.statblockText == null) {
    tpl.statblockText = legacyMonsterFieldsToText(tpl);
  }
  LEGACY_MONSTER_FIELDS.forEach((k) => { delete tpl[k]; });
  tpl.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...(tpl.abilities || {}) };
  tpl.legendary = { actionsMax: 0, resistancesMax: 0, ...(tpl.legendary || {}) };
  if (!Array.isArray(tpl.resources)) tpl.resources = [];
  if (tpl.hpMax == null) tpl.hpMax = 1;
  if (tpl.ac == null) tpl.ac = 10;
  if (tpl.speed == null) tpl.speed = '';
  return tpl;
}

/** Monster-Kopie in einem Encounter auf das Format ab 1.1 bringen. */
export function migrateMonsterCombatant(cb) {
  if (!cb || cb.type === 'pc') return cb;
  // Fehler in 1.0: der Kreaturtyp ("Untoter", "Humanoid", ...) hat beim
  // Kopieren das interne Feld type:'monster' überschrieben. Der Kreaturtyp
  // landet über legacyMonsterFieldsToText im Statblock, danach wird type
  // wieder auf 'monster' gesetzt.
  if (cb.statblockText == null && cb.type === 'monster') cb.type = '';
  if (cb.statblockText == null) cb.statblockText = legacyMonsterFieldsToText(cb);
  LEGACY_MONSTER_FIELDS.forEach((k) => { if (k !== 'type') delete cb[k]; });
  cb.type = 'monster';
  delete cb.deathSaves;
  if (!cb.legendary) cb.legendary = { actionsMax: 0, actionsCurrent: 0, resistancesMax: 0, resistancesCurrent: 0 };
  if (!Array.isArray(cb.resources)) cb.resources = [];
  if (!Array.isArray(cb.conditions)) cb.conditions = [];
  if (!cb.concentration) cb.concentration = { active: false, spellName: '' };
  if (typeof cb.exhaustion !== 'number') cb.exhaustion = 0;
  return cb;
}

const PC_HULL_KEYS = ['instanceId', 'type', 'refId', 'initiative', 'delayed', 'ready', 'isDead', 'isUnconscious'];

/** In 1.0 wurden TP, Zustände usw. zusätzlich (veraltet) in die schlanke
 *  Kampf-Hülle eines Spielercharakters kopiert. Maßgeblich war und ist immer
 *  der Roster-Eintrag - die Kopien werden hier entfernt. */
export function migratePcHull(cb) {
  Object.keys(cb).forEach((k) => { if (!PC_HULL_KEYS.includes(k)) delete cb[k]; });
  return cb;
}

/** Zauberliste aus 1.0/1.1 ([{name, note}]) als lesbarer Freitext. */
export function legacySpellsToText(spells) {
  const groups = new Map();
  const loose = [];
  (spells || []).forEach((sp) => {
    if (!sp || !nonEmpty(sp.name)) return;
    const note = String(sp.note || '').trim();
    const key = /^zaubertrick/i.test(note) ? 'Zaubertricks' : /^grad\s*\d+$/i.test(note) ? note.replace(/^grad/i, 'Grad') : null;
    if (key) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(sp.name); } else loose.push(note ? `${sp.name} (${note})` : sp.name);
  });
  const order = [...groups.keys()].sort((a, b) => (a === 'Zaubertricks' ? -1 : b === 'Zaubertricks' ? 1 : a.localeCompare(b, 'de', { numeric: true })));
  const lines = order.map((k) => `${k}: ${groups.get(k).join(', ')}`);
  return [...lines, ...loose].join('\n');
}

/** Merkmalsliste aus 1.0/1.1 auf die neuen Freitextfelder verteilen. */
function distributeLegacyFeatures(ch) {
  const add = (key, text) => { if (!nonEmpty(text)) return; ch[key] = ch[key] ? ch[key] + '\n\n' + text : text; };
  (ch.features || []).forEach((f) => {
    if (!f) return;
    const name = String(f.name || '').trim();
    const desc = String(f.description || '').trim();
    if (/^rassenmerkmal|^volksmerkmal/i.test(name)) add('speciesTraits', desc);
    else if (/^klassenmerkmal/i.test(name)) add('classFeatures', desc);
    else if (/^übungen/i.test(name)) add('proficienciesText', desc);
    else add('classFeatures', name && desc ? `${name}: ${desc}` : name || desc);
  });
}

/** Spielercharakter auf das aktuelle Format bringen. */
export function migrateCharacter(ch) {
  if (!ch || typeof ch !== 'object') return ch;
  ['unterklasse', 'classFeatures', 'subclassFeatures', 'speciesTraits', 'background', 'feats', 'proficienciesText'].forEach((k) => {
    if (typeof ch[k] !== 'string') ch[k] = '';
  });
  if (Array.isArray(ch.features)) { distributeLegacyFeatures(ch); delete ch.features; }
  if (typeof ch.spellsText !== 'string') ch.spellsText = legacySpellsToText(ch.spells);
  delete ch.spells;
  if (!Array.isArray(ch.spellSlots)) ch.spellSlots = [];
  const sc = ch.spellcasting || (ch.spellcasting = { enabled: false, ability: 'int', slotsResetOn: 'long' });
  if (!sc.casterType) {
    // Bestehende Plätze nur dann der Automatik überlassen, wenn sie exakt
    // der Voreinstellung entsprechen - sonst bleiben sie als manuelle Plätze.
    const detected = sc.slotsResetOn === 'short' ? 'pact' : detectCasterType(ch.klasse, ch.unterklasse);
    const preset = presetSpellSlots(detected, ch.stufe);
    const same = preset.length === ch.spellSlots.length
      && preset.every((p) => ch.spellSlots.some((s) => s.level === p.level && s.max === p.max));
    sc.casterType = sc.slotsResetOn === 'short' && detected === 'pact' && detectCasterType(ch.klasse) !== 'pact' ? 'pact' : 'auto';
    sc.slotsManual = ch.spellSlots.length > 0 && !same;
  }
  if (typeof sc.slotsManual !== 'boolean') sc.slotsManual = false;
  if (ch.spellSlots.length || (ch.spellsText || '').trim()) sc.enabled = true;
  if (!ch.saveBonusOverride || typeof ch.saveBonusOverride !== 'object') ch.saveBonusOverride = {};
  if (!ch.skillBonusOverride || typeof ch.skillBonusOverride !== 'object') ch.skillBonusOverride = {};
  if (!ch.saveProf) ch.saveProf = {};
  if (!ch.skillProf) ch.skillProf = {};
  return ch;
}

function migrateStory(story) {
  const out = { ...blankStory(), ...(story && typeof story === 'object' ? story : {}) };
  STORY_KIND_KEYS.forEach((k) => {
    out[k] = (Array.isArray(out[k]) ? out[k] : []).filter((e) => e && e.id).map((e) => {
      if (!Array.isArray(e.links)) e.links = [];
      if (k === 'scenes' && !Array.isArray(e.encounterIds)) e.encounterIds = [];
      return e;
    });
  });
  if (out.currentSceneId && !out.scenes.some((sc) => sc.id === out.currentSceneId)) out.currentSceneId = null;
  return out;
}

export function migrateCampaign(camp) {
  if (!camp || typeof camp !== 'object') return camp;
  camp.story = migrateStory(camp.story);
  camp.roster = (camp.roster || []).map(migrateCharacter);
  camp.monsterLibrary = (camp.monsterLibrary || []).map(migrateMonsterTemplate);
  camp.encounters = (camp.encounters || []).map((enc) => {
    enc.combatants = (enc.combatants || []).map((cb) => (cb.type === 'pc' ? migratePcHull(cb) : migrateMonsterCombatant(cb)));
    return enc;
  });
  return camp;
}

/** Kompletten App-Zustand migrieren (in-place, gibt ihn zurück). */
export function migrateState(state) {
  if (!state || !Array.isArray(state.campaigns)) return state;
  state.campaigns = state.campaigns.map(migrateCampaign);
  state.schemaVersion = CURRENT_SCHEMA;
  return state;
}
