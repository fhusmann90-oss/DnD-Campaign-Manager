/**
 * pdfCharacterParser.js
 * ---------------------------------------------------------------------------
 * Liest das bekannte ausfüllbare Charakterbogen-Formular aus (AlegreyaSans-
 * Vorlage mit Feldnamen wie "Charaktername_page1", "StrMod", "Zauber1_1",
 * "AkrobatikProf" usw. - das Format, das in der Kampagne tatsächlich benutzt
 * wird). Bewusst FEST auf diese Feldnamen zugeschnitten statt generisch zu
 * raten: dafür zuverlässig, dafür aber nutzlos für ein komplett anderes
 * PDF-Layout (dann bleiben die Felder einfach leer, und man trägt es im
 * Vorschau-Formular von Hand ein).
 *
 * Aufgeteilt in zwei Schritte, damit der eigentliche Mapping-Code ohne
 * Browser/pdf.js testbar ist:
 *   1. extractFieldMap(pdfDocProxy)   -> { feldname: wert, ... }   (braucht pdf.js)
 *   2. mapFieldsToCharacter(fieldMap) -> Character-Objekt (reine Funktion)
 * ---------------------------------------------------------------------------
 */

import { blankCharacter } from './state.js';
import {
  SKILLS, saveBonus, skillBonusFor, profBonusForLevel, parseSignedNumber, detectCasterType, presetSpellSlots,
} from './data/rules.js';

// Mögliche Feldnamen für die eingetragenen BONUS-Werte. Das Formular ist
// nicht in allen Varianten gleich benannt, daher werden mehrere Kandidaten
// probiert (erster Wert, der wie "+3"/"-1" aussieht, gewinnt). Wird nichts
// gefunden, rechnet die App den Bonus selbst aus Attribut + Übung aus.
const SAVE_BONUS_SUFFIXES = ['RW', 'RWMod', 'Rettungswurf', 'RettungswurfMod', 'Save', 'RWBonus'];
const SAVE_BONUS_PREFIXES = ['RW', 'Rettungswurf'];
const SKILL_BONUS_SUFFIXES = ['', 'Mod', 'Bonus', 'Wert'];

// Zuordnung: unser Attribut-Kürzel -> mögliche Feld-Präfixe im PDF.
// Zwei Varianten des Formulars sind im Umlauf: eine schreibt "Str", die
// andere (v2.4) "Stä" - beide werden akzeptiert (erster nicht-leerer Wert).
const ABILITY_FIELD_ALIASES = {
  str: ['Str', 'Stä'], dex: ['Ges'], con: ['Kon'], int: ['Int'], wis: ['Wei'], cha: ['Cha'],
};

// Zuordnung: Feld-Präfix im PDF -> unser Fertigkeits-Schlüssel (siehe rules.js).
const SKILL_FIELD = {
  Akrobatik: 'akrobatik',
  ArkaneKunde: 'arkanekunde',
  Athletik: 'athletik',
  Auftreten: 'auftreten',
  Einschüchtern: 'einschuechtern',
  Fingerfertigkeit: 'fingerfertigkeit',
  Geschichte: 'geschichte',
  Heilkunde: 'heilkunde',
  Heimlichkeit: 'heimlichkeit',
  MotivErkennen: 'menschenkenntnis',
  Nachforschungen: 'nachforschung',
  Naturkunde: 'naturkunde',
  Religion: 'religion',
  Täuschen: 'taeuschen',
  MitTierenUmgehen: 'tierumgang',
  Überlebenskunst: 'ueberlebenskunst',
  Überzeugen: 'ueberzeugen',
  Wahrnehmung: 'wahrnehmung',
};

const SPELL_ABILITY_TEXT = {
  weisheit: 'wis', intelligenz: 'int', charisma: 'cha',
};

function isChecked(v) {
  return typeof v === 'string' && v.replace('/', '').toLowerCase() === 'yes';
}

function nonEmpty(v) {
  return v != null && String(v).trim() !== '';
}

function toInt(v, fallback = 0) {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Liest aus einer geladenen pdf.js-Dokument-Instanz ein einfaches
 * { feldname: wert }-Objekt aus (erster nicht-leerer Wert pro Feldname,
 * falls derselbe Feldname über mehrere Seiten/Widgets existiert).
 */
export async function extractFieldMap(pdfDoc) {
  const fieldObjects = await pdfDoc.getFieldObjects();
  const map = {};
  if (!fieldObjects) return map;
  Object.entries(fieldObjects).forEach(([name, widgets]) => {
    const withValue = widgets.find((w) => nonEmpty(w.value)) || widgets[0];
    map[name] = withValue ? withValue.value : '';
  });
  return map;
}

/**
 * Reine Mapping-Funktion: { feldname: wert } -> Character-Objekt (gleiche
 * Form wie blankCharacter()). Fehlende/unbekannte Felder bleiben auf den
 * Default-Werten - die Vorschau im UI macht sie sichtbar korrigierbar.
 */
export function mapFieldsToCharacter(f) {
  const char = blankCharacter();
  const get = (name) => (f[name] != null ? f[name] : '');

  // --- Kopfzeile -----------------------------------------------------
  char.name = get('Charaktername_page1') || get('Charaktername') || char.name;
  char.spielername = get('Spielername');
  char.spezies = get('Volk');

  if (nonEmpty(get('Klasse')) || nonEmpty(get('Stufe'))) {
    // Neuere Bogen-Variante: Klasse und Stufe als getrennte Felder.
    char.klasse = get('Klasse');
    char.stufe = toInt(get('Stufe'), 1);
  } else {
    // Ältere Variante: ein Textfeld "Kämpfer Stufe 1" o.ä.
    const combo = get('KlasseUndStufe');
    const m = combo.match(/^(.*?)\s*(?:Stufe)?\s*(\d+)\s*$/i);
    if (m) { char.klasse = m[1].trim(); char.stufe = toInt(m[2], 1); }
    else char.klasse = combo;
  }

  // --- Attribute & Rettungswürfe --------------------------------------
  Object.entries(ABILITY_FIELD_ALIASES).forEach(([ourKey, prefixes]) => {
    const scorePrefix = prefixes.find((p) => nonEmpty(get(p)));
    if (scorePrefix) char.abilities[ourKey] = toInt(get(scorePrefix), 10);
    char.saveProf[ourKey] = prefixes.some((p) => isChecked(get(p + 'Prof')));
  });

  // --- Fertigkeiten: Übung/Expertise ------------------------------------
  Object.entries(SKILL_FIELD).forEach(([pdfPrefix, skillKey]) => {
    const expert = isChecked(get(pdfPrefix + 'Exp'));
    const prof = isChecked(get(pdfPrefix + 'Prof'));
    if (expert) char.skillProf[skillKey] = 2;
    else if (prof) char.skillProf[skillKey] = 1;
  });

  // --- Eingetragene Boni übernehmen (ab 1.1) ------------------------------
  // Nur Werte, die vom berechneten Bonus ABWEICHEN, werden als eigener Wert
  // gespeichert - stimmt der PDF-Wert mit der Berechnung überein, rechnet die
  // App weiter automatisch (z.B. nach einem Stufenaufstieg).
  const pb = profBonusForLevel(char.stufe);
  const firstNumber = (names) => {
    for (const n of names) {
      const v = parseSignedNumber(get(n));
      if (v != null) return v;
    }
    return null;
  };
  char.saveBonusOverride = {};
  Object.entries(ABILITY_FIELD_ALIASES).forEach(([ourKey, prefixes]) => {
    const names = [];
    prefixes.forEach((p) => {
      SAVE_BONUS_SUFFIXES.forEach((suf) => names.push(p + suf));
      SAVE_BONUS_PREFIXES.forEach((pre) => names.push(pre + p));
    });
    const v = firstNumber(names);
    if (v != null && v !== saveBonus(char.abilities, char.saveProf, pb, ourKey)) char.saveBonusOverride[ourKey] = v;
  });
  char.skillBonusOverride = {};
  Object.entries(SKILL_FIELD).forEach(([pdfPrefix, skillKey]) => {
    const v = firstNumber(SKILL_BONUS_SUFFIXES.map((suf) => pdfPrefix + suf));
    if (v != null && v !== skillBonusFor(char.abilities, char.skillProf, pb, skillKey)) char.skillBonusOverride[skillKey] = v;
  });

  // --- Kampfwerte -------------------------------------------------------
  // AC/HP bleiben "null" statt eines stillen Default-Werts, wenn das Feld im
  // PDF leer war - so fällt das in der Vorschau sofort auf, statt als
  // plausibel aussehende Zahl durchzurutschen.
  char.ac = nonEmpty(get('Rüstungsklasse')) ? toInt(get('Rüstungsklasse'), 10) : null;
  if (nonEmpty(get('Bewegungsrate'))) char.speed = String(get('Bewegungsrate'));

  const hpMaxRaw = get('TrefferpunkteMaximum');
  const hpMax = nonEmpty(hpMaxRaw) ? toInt(hpMaxRaw, 0) : null;
  char.hp.max = hpMax;
  char.hp.current = nonEmpty(get('AktTrefferpunkte')) ? toInt(get('AktTrefferpunkte'), hpMax) : hpMax;
  char.hp.temp = toInt(get('TempTrefferpunkte'), 0);

  const dieText = get('Trefferwürfel') || get('GesamtTW') || '';
  const dieMatch = String(dieText).match(/[dDwW](\d+)/);
  if (dieMatch) char.hitDice.die = toInt(dieMatch[1], 8);
  const totalMatch = String(get('GesamtTW')).match(/^(\d+)/);
  char.hitDice.total = totalMatch ? toInt(totalMatch[1], char.stufe || 1) : (char.stufe || 1);

  // --- Merkmale -> Freitextfelder (ab 1.2) ----------------------------
  char.classFeatures = ['Klassenmerkmale1', 'Klassenmerkmale2'].map(get).filter(nonEmpty).map(String).join('\n\n');
  char.speciesTraits = nonEmpty(get('Rassenmerkmale')) ? String(get('Rassenmerkmale')) : String(get('Volksmerkmale') || '');
  char.subclassFeatures = String(get('Unterklassenmerkmale') || '');
  char.feats = ['Talente', 'Talente1', 'Talente2'].map(get).filter(nonEmpty).map(String).join('\n');
  char.background = String(get('Hintergrund') || '');
  if (nonEmpty(get('Unterklasse'))) char.unterklasse = String(get('Unterklasse'));

  // Übungen (Rüstung/Waffen) + Sprachen/Werkzeuge als eine Merkmal-Zeile.
  const profFlags = [
    ['LeichteRüstungProf', 'Leichte Rüstung'], ['MittlereRüstungProf', 'Mittlere Rüstung'],
    ['SchwereRüstungProf', 'Schwere Rüstung'], ['SchildeProf', 'Schilde'],
    ['EinfachWaffenProf', 'Einfache Waffen'], ['KriegswaffenProf', 'Kriegswaffen'],
  ].filter(([key]) => isChecked(get(key))).map(([, label]) => label);
  const languages = [1, 2, 3].map((n) => get('Sprache' + n)).filter(nonEmpty);
  const tools = [1, 2].map((n) => get('WerkzeugUndAndere' + n)).filter(nonEmpty);
  const profText = [
    profFlags.length ? 'Übungen: ' + profFlags.join(', ') : '',
    languages.length ? 'Sprachen: ' + languages.join(', ') : '',
    tools.length ? 'Werkzeuge: ' + tools.join(', ') : '',
  ].filter(Boolean).join('\n');
  char.proficienciesText = profText;

  // --- Angriffe / Aktionen ---------------------------------------------
  for (let n = 1; n <= 5; n += 1) {
    const name = get('Angriff' + n);
    if (!nonEmpty(name)) continue;
    const bonusRaw = String(get('Bonus' + n) || '');
    // Manche Zauber tragen hier "SG13" (Rettungswurf-SG) statt eines
    // Angriffsbonus ein - das landet dann in der Beschreibung statt als
    // (falscher) numerischer Trefferbonus.
    const isSaveDC = /sg/i.test(bonusRaw);
    const description = [
      String(get('Beschreibung' + n) || ''),
      isSaveDC ? `Rettungswurf ${bonusRaw}` : '',
    ].filter(Boolean).join(' · ');
    char.attacks.push({
      id: 'atk' + n,
      name: String(name),
      toHit: isSaveDC ? 0 : toInt(bonusRaw, 0),
      range: String(get('Reichweite' + n) || ''),
      damage: String(get('Schaden' + n) || ''),
      damageType: String(get('Schadentyp' + n) || ''),
      description,
    });
  }

  // --- Zauber -------------------------------------------------------------
  const cantrips = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => get('Zaubertrick' + n)).filter(nonEmpty);
  let anySpellText = cantrips.length > 0;
  const preparedSpells = [];
  for (let grade = 1; grade <= 9; grade += 1) {
    for (let n = 1; n <= 13; n += 1) {
      const spellName = get(`Zauber${grade}_${n}`);
      if (nonEmpty(spellName)) { preparedSpells.push({ grade, name: String(spellName) }); anySpellText = true; }
    }
  }
  const slots = [];
  for (let grade = 1; grade <= 9; grade += 1) {
    const total = get('ZauberplätzeGesamt' + grade);
    if (nonEmpty(total) && toInt(total, 0) > 0) {
      const used = toInt(get('ZauberplätzeVerbraucht' + grade), 0);
      slots.push({ level: grade, max: toInt(total, 0), current: Math.max(0, toInt(total, 0) - used) });
    }
  }
  if (anySpellText || slots.length) {
    char.spellcasting.enabled = true;
    const abilityText = String(get('AttributZauberwirken') || '').toLowerCase();
    char.spellcasting.ability = SPELL_ABILITY_TEXT[abilityText] || char.spellcasting.ability;
  }
  char.spellSlots = slots;
  // Zauber als Freitext, gruppiert nach Grad.
  const spellLines = [];
  if (cantrips.length) spellLines.push('Zaubertricks: ' + cantrips.map(String).join(', '));
  for (let grade = 1; grade <= 9; grade += 1) {
    const names = preparedSpells.filter((sp) => sp.grade === grade).map((sp) => sp.name);
    if (names.length) spellLines.push(`Grad ${grade}: ${names.join(', ')}`);
  }
  char.spellsText = spellLines.join('\n');
  // Zauberplätze: stimmen die Plätze im Bogen mit der Voreinstellung für
  // Klasse/Stufe überein, übernimmt die Automatik - sonst bleiben sie manuell.
  const detected = detectCasterType(char.klasse, char.unterklasse);
  const preset = presetSpellSlots(detected, char.stufe);
  const samePreset = preset.length === slots.length && preset.every((p) => slots.some((sl) => sl.level === p.level && sl.max === p.max));
  char.spellcasting.casterType = 'auto';
  char.spellcasting.slotsManual = slots.length > 0 && !samePreset;
  if (detected === 'pact') char.spellcasting.slotsResetOn = 'short';

  // --- Inventar & Währung -----------------------------------------------
  for (let n = 1; n <= 11; n += 1) {
    const item = get('Inventar' + n);
    if (nonEmpty(item)) char.inventory.push({ id: 'inv' + n, name: String(item), qty: toInt(get('InventarAnz' + n), 1) || 1 });
  }
  if (nonEmpty(get('GM'))) char.currency.gm = toInt(get('GM'), 0);

  // --- Rollenspiel-Infos -> Notizen (Freitext, da sehr heterogen) ------
  const noteParts = [];
  const noteField = (label, key) => { const v = get(key); if (nonEmpty(v)) noteParts.push(`${label}: ${v}`); };
  noteField('Gesinnung', 'Gesinnung');
  noteField('Glaube', 'Glaube');
  noteField('Persönlichkeitsmerkmale', 'Persönlichkeitsmerkmale');
  noteField('Ideale', 'Ideale');
  noteField('Bindungen', 'Bindungen');
  noteField('Makel', 'Makel');
  noteField('Aussehen', 'Aussehen');
  noteField('Alter', 'Alter');
  noteField('Hintergrundgeschichte', 'Hintergrundgeschichte1');
  noteField('(Fortsetzung)', 'Hintergrundgeschichte2');
  char.notes = noteParts.join('\n\n');

  return char;
}
