/**
 * rules.js
 * ---------------------------------------------------------------------------
 * Statische D&D-5e-Regelwerte, die an mehreren Stellen der App gebraucht
 * werden (Fertigkeitenliste, Attribut-Labels, Formeln). Keine App-Logik,
 * kein State - nur Konstanten und reine Hilfsfunktionen.
 * ---------------------------------------------------------------------------
 */

// Die sechs Attribute in der Standard-Reihenfolge, wie sie auf jedem Bogen
// auftauchen. Wird an vielen Stellen zum Iterieren benutzt.
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABEL = {
  str: 'Stärke',
  dex: 'Geschicklichkeit',
  con: 'Konstitution',
  int: 'Intelligenz',
  wis: 'Weisheit',
  cha: 'Charisma',
};

export const ABILITY_SHORT = {
  str: 'STÄ',
  dex: 'GES',
  con: 'KON',
  int: 'INT',
  wis: 'WEI',
  cha: 'CHA',
};

// Die 18 Standard-Fertigkeiten mit ihrem zugehörigen Attribut. "key" ist der
// interne Schlüssel, der in skillProf-Objekten verwendet wird.
export const SKILLS = [
  { key: 'akrobatik', name: 'Akrobatik', ab: 'dex' },
  { key: 'arkanekunde', name: 'Arkane Kunde', ab: 'int' },
  { key: 'athletik', name: 'Athletik', ab: 'str' },
  { key: 'auftreten', name: 'Auftreten', ab: 'cha' },
  { key: 'einschuechtern', name: 'Einschüchtern', ab: 'cha' },
  { key: 'fingerfertigkeit', name: 'Fingerfertigkeit', ab: 'dex' },
  { key: 'geschichte', name: 'Geschichte', ab: 'int' },
  { key: 'heilkunde', name: 'Heilkunde', ab: 'wis' },
  { key: 'heimlichkeit', name: 'Heimlichkeit', ab: 'dex' },
  { key: 'menschenkenntnis', name: 'Menschenkenntnis', ab: 'wis' },
  { key: 'nachforschung', name: 'Nachforschung', ab: 'int' },
  { key: 'naturkunde', name: 'Naturkunde', ab: 'int' },
  { key: 'religion', name: 'Religion', ab: 'int' },
  { key: 'taeuschen', name: 'Täuschen', ab: 'cha' },
  { key: 'tierumgang', name: 'Tierumgang', ab: 'wis' },
  { key: 'ueberlebenskunst', name: 'Überlebenskunst', ab: 'wis' },
  { key: 'ueberzeugen', name: 'Überzeugen', ab: 'cha' },
  { key: 'wahrnehmung', name: 'Wahrnehmung', ab: 'wis' },
];

// Ressourcen- und Zauberplatz-Regeneration.
export const RESET_TYPES = [
  { key: 'short', label: 'kurze Rast' },
  { key: 'long', label: 'lange Rast' },
  { key: 'day', label: '1/Tag (nach langer Rast)' },
  { key: 'manual', label: 'nur manuell (z.B. 1/Kampf)' },
];

// Standard-Zustände nach 5e (Gruppe und Monster können trotzdem einen
// beliebigen eigenen Text als Zustand eintragen - das ist nur die
// Schnellauswahl).
export const CONDITIONS = [
  'Bezaubert', 'Erschöpfung', 'Erschreckt', 'Festgenagelt', 'Blind',
  'Betäubt', 'Gelähmt', 'Gepackt', 'Liegend', 'Taub', 'Unsichtbar',
  'Vergiftet', 'Bewusstlos', 'Verwirrt',
];

export const CURRENCY_KEYS = ['pm', 'gm', 'em', 'sm', 'km'];
export const CURRENCY_LABEL = { pm: 'PM', gm: 'GM', em: 'EM', sm: 'SM', km: 'KM' };

// Erschöpfungsgrade nach 5e (2014-Regeln), Index = Grad (0 = keine).
// Wird nur zur Anzeige benutzt (Tooltip/Hinweistext), nichts davon wird
// automatisch auf Werte angewendet - der Spielleiter behält die Kontrolle.
export const EXHAUSTION_EFFECTS = [
  'Keine Erschöpfung',
  'Nachteil bei Attributswürfen',
  'Bewegungsrate halbiert',
  'Nachteil bei Angriffswürfen und Rettungswürfen',
  'Trefferpunkte-Maximum halbiert',
  'Bewegungsrate auf 0',
  'Tod',
];

/** Rundet wie D&D 5e ab: Math.floor((Wert-10)/2). */
export function abilityMod(score) {
  return Math.floor((Number(score ?? 10) - 10) / 2);
}

/** Übungsbonus nach Stufe (1-20). */
export function profBonusForLevel(level) {
  const lvl = Math.max(1, Number(level) || 1);
  return Math.ceil(lvl / 4) + 1;
}

/** Bonus für einen Rettungswurf: Attributsmodifikator + ggf. Übungsbonus. */
export function saveBonus(abilities, saveProf, profBonus, ability) {
  return abilityMod(abilities[ability]) + (saveProf[ability] ? profBonus : 0);
}

/**
 * Bonus für eine Fertigkeit. tier: 0 = ungeübt, 1 = geübt, 2 = Expertise.
 */
export function skillBonusFor(abilities, skillProf, profBonus, skillKey) {
  const skill = SKILLS.find((s) => s.key === skillKey);
  if (!skill) return 0;
  const tier = (skillProf && skillProf[skillKey]) || 0;
  return abilityMod(abilities[skill.ab]) + (tier >= 1 ? profBonus : 0) + (tier === 2 ? profBonus : 0);
}

/**
 * Tatsächlich angezeigter Rettungswurf-Bonus eines Charakters: ein manuell
 * eingetragener bzw. aus dem PDF übernommener Wert (saveBonusOverride) hat
 * Vorrang, sonst wird aus Attribut + Übungsbonus berechnet.
 */
export function effectiveSaveBonus(char, ability) {
  const o = char.saveBonusOverride && char.saveBonusOverride[ability];
  if (o != null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  return saveBonus(char.abilities, char.saveProf || {}, profBonusForLevel(char.stufe), ability);
}

/** Wie effectiveSaveBonus, für eine der 18 Fertigkeiten. */
export function effectiveSkillBonus(char, skillKey) {
  const o = char.skillBonusOverride && char.skillBonusOverride[skillKey];
  if (o != null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  return skillBonusFor(char.abilities, char.skillProf || {}, profBonusForLevel(char.stufe), skillKey);
}

/** Liest "+3", "-1", "−2", "3" als Zahl; alles andere -> null. */
export function parseSignedNumber(v) {
  if (v == null) return null;
  const s = String(v).trim().replace('−', '-').replace(/\s+/g, '');
  if (!/^[+-]?\d{1,2}$/.test(s)) return null;
  return Number(s);
}

// ---------------------------------------------------------------------------
// Zauberplätze nach Klasse und Stufe (ab 1.2)
// ---------------------------------------------------------------------------

export const CASTER_TYPES = [
  { key: 'auto', label: 'Automatisch (nach Klasse)' },
  { key: 'none', label: 'Kein Zauberwirker' },
  { key: 'full', label: 'Vollzauberwirker (Barde, Druide, Kleriker, Magier, Zauberer)' },
  { key: 'half', label: 'Halbzauberwirker (Paladin, Waldläufer)' },
  { key: 'third', label: 'Drittelzauberwirker (Mystischer Ritter, Arkaner Betrüger)' },
  { key: 'artificer', label: 'Magieschmied (Halbzauberwirker, aufgerundet)' },
  { key: 'pact', label: 'Paktmagie (Hexenmeister)' },
];

// Plätze pro Grad (Index 0 = Grad 1) für Vollzauberwirker, Stufe 1-20.
const FULL_CASTER_SLOTS = [
  null,
  [2], [3], [4, 2], [4, 3], [4, 3, 2],
  [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

// Drittelzauberwirker (Mystischer Ritter / Arkaner Betrüger), Stufe 1-20.
const THIRD_CASTER_SLOTS = [
  null,
  [], [], [2], [3], [3],
  [3], [4, 2], [4, 2], [4, 2], [4, 3],
  [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 2],
  [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1],
];

function norm(s) { return String(s || '').toLowerCase(); }

/** Erkennt den Zauberwirker-Typ aus dem Klassen- (und Unterklassen-)Text.
 *  Deutsche und englische Namen; bei Mehrfachklassen bitte manuell wählen. */
export function detectCasterType(klasse, unterklasse = '') {
  const k = norm(klasse);
  const all = k + ' ' + norm(unterklasse);
  if (/hexenmeister|warlock/.test(k)) return 'pact';
  if (/barde|bard|druide|druid|kleriker|cleric|magier|wizard|zauberer|sorcerer/.test(k)) return 'full';
  if (/paladin|waldläufer|waldlaeufer|ranger/.test(k)) return 'half';
  if (/magieschmied|artificer|konstrukteur/.test(k)) return 'artificer';
  if (/(kämpfer|kaempfer|fighter)/.test(k) && /(mystischer ritter|arkaner ritter|eldritch knight)/.test(all)) return 'third';
  if (/(schurke|rogue)/.test(k) && /(arkaner betrüger|arkaner betrueger|arkaner trickser|arcane trickster)/.test(all)) return 'third';
  return 'none';
}

export function resolveCasterType(char) {
  const t = (char.spellcasting && char.spellcasting.casterType) || 'auto';
  return t === 'auto' ? detectCasterType(char.klasse, char.unterklasse) : t;
}

/** Voreingestellte Zauberplätze: [{level, max}] für Typ und Stufe. */
export function presetSpellSlots(type, level) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  let row = [];
  if (type === 'full') row = FULL_CASTER_SLOTS[lvl];
  else if (type === 'half') row = lvl >= 2 ? FULL_CASTER_SLOTS[Math.ceil(lvl / 2)] : [];
  else if (type === 'artificer') row = FULL_CASTER_SLOTS[Math.ceil(lvl / 2)];
  else if (type === 'third') row = THIRD_CASTER_SLOTS[lvl];
  else if (type === 'pact') {
    const count = lvl >= 17 ? 4 : lvl >= 11 ? 3 : lvl >= 2 ? 2 : 1;
    const slotLevel = Math.min(5, Math.ceil(lvl / 2));
    return [{ level: slotLevel, max: count, pact: true }];
  }
  return (row || []).map((max, i) => ({ level: i + 1, max }));
}

/** Kurzbeschreibung wie "Grad 1: 4 · Grad 2: 2" für Vorschau/Hinweise. */
export function describeSlots(slots) {
  if (!slots || !slots.length) return 'keine Zauberplätze';
  return slots.map((s) => `Grad ${s.level}: ${s.max}`).join(' · ');
}

/** Formatiert einen Bonus/Modifikator mit Vorzeichen, z.B. 3 -> "+3". */
export function fmtMod(n) {
  const num = Number(n) || 0;
  return (num >= 0 ? '+' : '') + num;
}
