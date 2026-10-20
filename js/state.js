/**
 * state.js
 * ---------------------------------------------------------------------------
 * Der gesamte App-Zustand lebt in EINEM Store-Objekt, das bei jeder Änderung
 * komplett nach localStorage geschrieben wird (einfach, robust, und klein
 * genug für eine Handvoll Kampagnen). Jede Mutation läuft über Store.mutate(),
 * das vorher einen JSON-Snapshot für die Rückgängig-Funktion ablegt.
 *
 * Datenmodell (siehe auch factories.js für Default-Objekte):
 *
 *   state
 *     .campaigns: Campaign[]
 *     .activeCampaignId
 *     .theme: 'system' | 'light' | 'dark'
 *
 *   Campaign
 *     .id, .name, .createdAt
 *     .roster: Character[]            // Spielercharaktere, bleiben über
 *                                      // Encounter hinweg bestehen
 *     .monsterLibrary: MonsterTemplate[]
 *     .encounters: Encounter[]
 *     .activeEncounterId
 *
 *   Encounter
 *     .id, .name, .createdAt
 *     .round, .currentTurnId          // instanceId des aktiven Zuges
 *     .combatants: Combatant[]
 *
 *   Combatant (type: 'pc' | 'monster')
 *     - PCs tragen nur eine schlanke Kampf-Hülle (instanceId, refId auf die
 *       Roster-Figur, initiative, delayed, ready, isDead, isUnconscious).
 *       Die eigentlichen Werte (TP, Ressourcen, ...) leben IMMER im Roster-
 *       Eintrag - patchCombatant() schreibt bei PCs direkt dorthin durch.
 *       So gibt es nie zwei widersprüchliche Wahrheiten.
 *     - Monster tragen ihre vollständigen, unabhängigen Werte direkt im
 *       Combatant-Objekt (jede Kopie hat eigene TP etc.), refId zeigt nur
 *       zurück auf die Vorlage (für "Ressourcen zurücksetzen" u.ä.).
 * ---------------------------------------------------------------------------
 */

import { RESET_TYPES } from './data/rules.js';
import { migrateState, migrateMonsterTemplate, CURRENT_SCHEMA } from './migrate.js';
import { STORY_KIND_KEYS, blankStory, kindByKey } from './data/storySchema.js';

const STORAGE_KEY = 'dnd-campaign-tracker:v1';
const MAX_UNDO = 40;

// -----------------------------------------------------------------------
// Factories - liefern immer frische, unabhängige Objekte (keine geteilten
// Referenzen zwischen zwei Characters/Encountern).
// -----------------------------------------------------------------------

export function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function blankCurrency() {
  return { pm: 0, gm: 0, em: 0, sm: 0, km: 0 };
}

/** Ein leerer/neuer Spielercharakter für das Roster. */
export function blankCharacter(overrides = {}) {
  return {
    id: newId('pc'),
    name: 'Neuer Charakter',
    klasse: '', unterklasse: '', spezies: '', stufe: 1, spielername: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProf: { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skillProf: {}, // skillKey -> 0|1|2
    // Manuell eingetragene bzw. aus dem PDF übernommene Boni. Fehlt ein
    // Eintrag (oder ist er null), wird aus Attribut + Übungsbonus berechnet.
    saveBonusOverride: {}, // ability -> number|null
    skillBonusOverride: {}, // skillKey -> number|null
    ac: 10, speed: '9 m', initExtra: 0,
    hp: { max: 10, current: 10, temp: 0 },
    hitDice: { die: 8, total: 1, used: 0 },
    deathSaves: { success: 0, fail: 0 },
    exhaustion: 0,
    conditions: [], // {id, name, rounds: number|null}
    concentration: { active: false, spellName: '' },
    resources: [], // {id, name, max, current, reset}
    // casterType: 'auto' (aus Klasse/Unterklasse) oder fest gewählt, siehe
    // CASTER_TYPES in rules.js. slotsManual: Plätze von Hand statt Voreinstellung.
    // enabled und slotsResetOn werden beim Speichern abgeleitet.
    spellcasting: { enabled: false, ability: 'int', slotsResetOn: 'long', casterType: 'auto', slotsManual: false },
    spellSlots: [], // {level, max, current, pact?}
    spellsText: '', // Zauber als reiner Freitext (keine Zauberdatenbank)
    attacks: [], // {id, name, toHit, range, damage, damageType, description}
    // Merkmale als Freitextfelder (ab 1.2)
    classFeatures: '', subclassFeatures: '', speciesTraits: '', background: '', feats: '', proficienciesText: '',
    inventory: [], // {id, name, qty}
    currency: blankCurrency(),
    notes: '',
    ...overrides,
  };
}

/** Eine leere/neue Monster-Vorlage für die Bibliothek (Format ab 1.1:
 *  Kernwerte als Felder, alles Weitere im Freitext statblockText). */
export function blankMonsterTemplate(overrides = {}) {
  return {
    id: newId('mon'),
    name: 'Neues Monster',
    ac: 10, hpMax: 10, speed: '9 m',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    statblockText: '', // Angriffe, Aktionen, Merkmale, Resistenzen, Sinne, ...
    legendary: { actionsMax: 0, resistancesMax: 0 },
    resources: [], // {id, name, max, current, reset}
    ...overrides,
  };
}

/** Erzeugt einen frischen PC-Kampf-Verweis für einen neuen Encounter. */
function combatantFromRoster(rosterChar) {
  return {
    instanceId: newId('cb'),
    type: 'pc',
    refId: rosterChar.id,
    initiative: null,
    delayed: false, ready: false,
    isDead: false, isUnconscious: false,
  };
}

/** Erzeugt eine unabhängige Monster-Kopie (mit eigener TP usw.) für einen Encounter. */
function combatantFromTemplate(template, displayName) {
  const legendary = template.legendary || { actionsMax: 0, resistancesMax: 0 };
  return {
    instanceId: newId('cb'),
    type: 'monster',
    refId: template.id,
    name: displayName,
    ac: template.ac,
    speed: template.speed,
    abilities: { ...template.abilities },
    hp: { max: template.hpMax, current: template.hpMax, temp: 0 },
    statblockText: template.statblockText || '',
    exhaustion: 0,
    conditions: [],
    concentration: { active: false, spellName: '' },
    resources: (template.resources || []).map((r) => ({ ...r, current: r.max })),
    legendary: {
      actionsMax: legendary.actionsMax || 0, actionsCurrent: legendary.actionsMax || 0,
      resistancesMax: legendary.resistancesMax || 0, resistancesCurrent: legendary.resistancesMax || 0,
    },
    initiative: null,
    delayed: false, ready: false,
    isDead: false, isUnconscious: false,
  };
}

function defaultState() {
  return {
    schemaVersion: CURRENT_SCHEMA,
    theme: 'system',
    campaigns: [],
    activeCampaignId: null,
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// -----------------------------------------------------------------------
// Rest-Hilfsfunktionen - pure Funktionen, die ein Character/Combatant-
// ähnliches Objekt in-place verändern. Werden sowohl für Roster-Charaktere
// als auch für Combatants im Encounter benutzt.
// -----------------------------------------------------------------------

export function applyShortRest(obj) {
  (obj.resources || []).forEach((r) => { if (r.reset === 'short') r.current = r.max; });
  // Paktmagie (Hexenmeister): Plätze regenerieren bei kurzer Rast.
  if (obj.spellcasting && obj.spellcasting.slotsResetOn === 'short') {
    (obj.spellSlots || []).forEach((s) => { s.current = s.max; });
  }
  return obj;
}

export function applyLongRest(obj) {
  (obj.resources || []).forEach((r) => { if (r.reset === 'short' || r.reset === 'long' || r.reset === 'day') r.current = r.max; });
  (obj.spellSlots || []).forEach((s) => { s.current = s.max; });
  if (obj.hp) { obj.hp.current = obj.hp.max; obj.hp.temp = 0; }
  if (obj.deathSaves) { obj.deathSaves = { success: 0, fail: 0 }; }
  if (obj.hitDice) {
    const regain = Math.max(1, Math.ceil((obj.hitDice.total || 1) / 2));
    obj.hitDice.used = Math.max(0, obj.hitDice.used - regain);
  }
  if (typeof obj.exhaustion === 'number' && obj.exhaustion > 0) obj.exhaustion -= 1;
  return obj;
}

/** Setzt nur die "1/Kampf"-Ressourcen zurück (reset:'manual'), z.B. beim
 *  Hinzufügen einer frischen Monsterkopie oder per Extra-Button. */
export function resetManualResources(obj) {
  obj.resources.forEach((r) => { if (r.reset === 'manual') r.current = r.max; });
  return obj;
}

// -----------------------------------------------------------------------
// Store
// -----------------------------------------------------------------------

export class Store {
  constructor() {
    this.state = this._load();
    this._listeners = [];
    this._changeListeners = [];
    this._undoStack = [];
  }

  /** Wird bei jeder LOKALEN Änderung aufgerufen (nicht beim Laden aus der
   *  Cloud) - die Cloud-Synchronisierung hängt sich hier ein. */
  onLocalChange(fn) {
    this._changeListeners.push(fn);
  }

  _emitLocalChange() {
    this._changeListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }

  /** Zustand ohne gerätespezifische Einstellungen (Theme) - so wird er in
   *  die Cloud geschrieben. */
  getSyncPayload() {
    const { theme, ...rest } = this.state;
    return deepClone(rest);
  }

  /** Zustand aus der Cloud übernehmen: ersetzt alles außer dem Theme dieses
   *  Geräts, leert den Rückgängig-Verlauf und löst KEIN erneutes Hochladen aus. */
  replaceFromRemote(data) {
    const next = migrateState(deepClone(data));
    if (!next || !Array.isArray(next.campaigns)) throw new Error('Ungültige Daten aus der Cloud.');
    next.theme = this.state.theme || 'system';
    this.state = next;
    this._undoStack = [];
    this._persist();
    this._notify();
  }

  // --- Persistenz -------------------------------------------------------

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.campaigns)) return defaultState();
      return migrateState(parsed);
    } catch (e) {
      console.warn('Konnte gespeicherten Zustand nicht lesen, starte neu.', e);
      return defaultState();
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      return true;
    } catch (e) {
      console.error('Speichern fehlgeschlagen (localStorage voll oder blockiert):', e);
      return false;
    }
  }

  subscribe(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter((f) => f !== fn); };
  }

  _notify() {
    this._listeners.forEach((fn) => fn(this.state));
  }

  /** Alle veränderenden Aktionen laufen hier durch: legt vorher einen
   *  Undo-Snapshot an, führt fn(state) aus, speichert, informiert die UI. */
  mutate(label, fn) {
    this._undoStack.push(JSON.stringify(this.state));
    if (this._undoStack.length > MAX_UNDO) this._undoStack.shift();
    fn(this.state);
    this._persist();
    this._notify();
    if (label !== 'Theme ändern') this._emitLocalChange();
  }

  canUndo() { return this._undoStack.length > 0; }

  undo() {
    if (!this._undoStack.length) return false;
    this.state = JSON.parse(this._undoStack.pop());
    this._persist();
    this._notify();
    this._emitLocalChange();
    return true;
  }

  // --- Kampagnen ----------------------------------------------------------

  getActiveCampaign() {
    return this.state.campaigns.find((c) => c.id === this.state.activeCampaignId) || null;
  }

  createCampaign(name, seedMonsters) {
    let newCampId = null;
    this.mutate('Kampagne anlegen', (s) => {
      const camp = {
        id: newId('camp'), name: name || 'Neue Kampagne', createdAt: new Date().toISOString(),
        roster: [], monsterLibrary: deepClone(seedMonsters || []).map(migrateMonsterTemplate), encounters: [], activeEncounterId: null,
        story: blankStory(),
      };
      s.campaigns.push(camp);
      s.activeCampaignId = camp.id;
      newCampId = camp.id;
    });
    return newCampId;
  }

  renameCampaign(id, name) {
    this.mutate('Kampagne umbenennen', (s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (c) c.name = name;
    });
  }

  deleteCampaign(id) {
    this.mutate('Kampagne löschen', (s) => {
      s.campaigns = s.campaigns.filter((c) => c.id !== id);
      if (s.activeCampaignId === id) {
        s.activeCampaignId = s.campaigns.length ? s.campaigns[0].id : null;
      }
    });
  }

  setActiveCampaign(id) {
    this.mutate('Kampagne wechseln', (s) => { s.activeCampaignId = id; });
  }

  // --- Roster (Spielercharaktere) ------------------------------------------

  addRosterCharacter(data) {
    let newCharId = null;
    this.mutate('Charakter hinzufügen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (!camp) return;
      const char = blankCharacter(data);
      camp.roster.push(char);
      newCharId = char.id;
    });
    return newCharId;
  }

  updateRosterCharacter(charId, patch) {
    this.mutate('Charakter bearbeiten', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const char = camp && camp.roster.find((c) => c.id === charId);
      if (char) Object.assign(char, patch);
    });
  }

  deleteRosterCharacter(charId) {
    this.mutate('Charakter löschen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (!camp) return;
      camp.roster = camp.roster.filter((c) => c.id !== charId);
      camp.encounters.forEach((enc) => {
        enc.combatants = enc.combatants.filter((cb) => !(cb.type === 'pc' && cb.refId === charId));
      });
    });
  }

  restRosterCharacter(charId, type) {
    this.mutate(type === 'long' ? 'Lange Rast' : 'Kurze Rast', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const char = camp && camp.roster.find((c) => c.id === charId);
      if (!char) return;
      if (type === 'long') applyLongRest(char); else applyShortRest(char);
    });
  }

  // --- Monster-Bibliothek --------------------------------------------------

  addMonsterTemplate(data) {
    let newId_ = null;
    this.mutate('Monster-Vorlage hinzufügen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (!camp) return;
      const tpl = blankMonsterTemplate(data);
      camp.monsterLibrary.push(tpl);
      newId_ = tpl.id;
    });
    return newId_;
  }

  updateMonsterTemplate(tplId, patch) {
    this.mutate('Monster-Vorlage bearbeiten', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const tpl = camp && camp.monsterLibrary.find((t) => t.id === tplId);
      if (tpl) Object.assign(tpl, patch);
    });
  }

  deleteMonsterTemplate(tplId) {
    this.mutate('Monster-Vorlage löschen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (camp) camp.monsterLibrary = camp.monsterLibrary.filter((t) => t.id !== tplId);
    });
  }

  // --- Encounter ------------------------------------------------------------

  createEncounter(name) {
    let newEncId = null;
    this.mutate('Encounter anlegen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (!camp) return;
      const enc = {
        id: newId('enc'), name: name || 'Neuer Kampf', createdAt: new Date().toISOString(),
        round: 1, currentTurnId: null, combatants: [],
      };
      camp.encounters.push(enc);
      camp.activeEncounterId = enc.id;
      newEncId = enc.id;
    });
    return newEncId;
  }

  renameEncounter(encId, name) {
    this.mutate('Encounter umbenennen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (enc) enc.name = name;
    });
  }

  deleteEncounter(encId) {
    this.mutate('Encounter löschen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (!camp) return;
      camp.encounters = camp.encounters.filter((e) => e.id !== encId);
      // Verweise aus Szenen entfernen
      ((camp.story && camp.story.scenes) || []).forEach((sc) => {
        sc.encounterIds = (sc.encounterIds || []).filter((id) => id !== encId);
      });
      if (camp.activeEncounterId === encId) {
        camp.activeEncounterId = camp.encounters.length ? camp.encounters[0].id : null;
      }
    });
  }

  setActiveEncounter(encId) {
    this.mutate('Encounter wechseln', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      if (camp) camp.activeEncounterId = encId;
    });
  }

  getActiveEncounter() {
    const camp = this.getActiveCampaign();
    return camp ? camp.encounters.find((e) => e.id === camp.activeEncounterId) || null : null;
  }

  addCombatantFromRoster(encId, rosterCharId) {
    this.mutate('Charakter zum Kampf hinzufügen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      const char = camp && camp.roster.find((c) => c.id === rosterCharId);
      if (!enc || !char) return;
      if (enc.combatants.some((cb) => cb.type === 'pc' && cb.refId === rosterCharId)) return; // schon drin
      enc.combatants.push(combatantFromRoster(char));
    });
  }

  /** Fügt `count` nummerierte Kopien einer Monster-Vorlage hinzu
   *  ("Goblin 1", "Goblin 2", ... fortlaufend, auch wenn schon welche von
   *  derselben Vorlage im Kampf sind). Eine einzelne Kopie bleibt unnummeriert,
   *  bis eine zweite dazukommt - dann wird die erste zu "... 1". */
  addCombatantsFromTemplate(encId, templateId, count = 1) {
    this.mutate('Monster hinzufügen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      const tpl = camp && camp.monsterLibrary.find((t) => t.id === templateId);
      if (!enc || !tpl) return;
      const siblings = enc.combatants.filter((cb) => cb.type === 'monster' && cb.refId === templateId);
      const numberOf = (name) => {
        const m = String(name || '').match(/\s(\d+)$/);
        return m ? Number(m[1]) : 0;
      };
      let maxN = siblings.reduce((acc, cb) => Math.max(acc, numberOf(cb.name)), 0);
      if (siblings.length === 0 && count === 1) {
        enc.combatants.push(combatantFromTemplate(tpl, tpl.name));
        return;
      }
      siblings.forEach((cb) => {
        if (cb.name === tpl.name) { maxN += 1; cb.name = `${tpl.name} ${maxN}`; }
      });
      for (let i = 1; i <= count; i += 1) {
        maxN += 1;
        enc.combatants.push(combatantFromTemplate(tpl, `${tpl.name} ${maxN}`));
      }
    });
  }

  /** Fügt einen formlosen Kampfteilnehmer ohne Vorlage/Roster-Bezug hinzu
   *  (schneller Ad-hoc-Gegner, z.B. ein NSC ohne vollen Statblock). */
  addAdhocCombatant(encId, name) {
    this.mutate('Kampfteilnehmer hinzufügen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (!enc) return;
      const tpl = blankMonsterTemplate({ name: name || 'NSC' });
      enc.combatants.push(combatantFromTemplate(tpl, tpl.name));
    });
  }

  removeCombatant(encId, instanceId) {
    this.mutate('Kampfteilnehmer entfernen', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (enc) enc.combatants = enc.combatants.filter((cb) => cb.instanceId !== instanceId);
    });
  }

  /** Zentrale Schreibfunktion für alles, was während des Kampfes an einem
   *  Kampfteilnehmer verändert wird. Bei PCs wird derselbe Patch (minus der
   *  reinen Initiative-Felder) zusätzlich in den Roster-Eintrag geschrieben,
   *  damit TP/Ressourcen/Zustände campaignweit konsistent bleiben. */
  patchCombatant(encId, instanceId, patch, label = 'Kampfteilnehmer bearbeiten') {
    this.mutate(label, (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      const cb = enc && enc.combatants.find((c) => c.instanceId === instanceId);
      if (!cb) return;
      if (cb.type === 'pc') {
        // Kampf-Hülle bekommt nur die kampfbezogenen Felder, alles andere
        // (TP, Ressourcen, Zustände, ...) landet im Roster-Eintrag.
        const { initiative, delayed, ready, isDead, isUnconscious, instanceId: _i, type: _t, refId: _r, ...persistent } = patch;
        const hullPatch = {};
        Object.entries({ initiative, delayed, ready, isDead, isUnconscious }).forEach(([k, v]) => { if (v !== undefined) hullPatch[k] = v; });
        Object.assign(cb, hullPatch);
        const char = camp.roster.find((c) => c.id === cb.refId);
        if (char) Object.assign(char, persistent);
      } else {
        Object.assign(cb, patch);
      }
    });
  }

  restCombatant(encId, instanceId, type) {
    this.mutate(type === 'long' ? 'Lange Rast' : 'Kurze Rast', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      const cb = enc && enc.combatants.find((c) => c.instanceId === instanceId);
      if (!cb || cb.type !== 'pc') return; // Monster rasten nicht (ab 1.1)
      const char = camp.roster.find((c) => c.id === cb.refId);
      if (char) { if (type === 'long') applyLongRest(char); else applyShortRest(char); }
    });
  }

  restAllInEncounter(encId, type) {
    this.mutate(type === 'long' ? 'Lange Rast (alle)' : 'Kurze Rast (alle)', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (!enc) return;
      enc.combatants.forEach((cb) => {
        if (cb.type !== 'pc') return; // Monster rasten nicht (ab 1.1)
        const char = camp.roster.find((c) => c.id === cb.refId);
        if (char) { if (type === 'long') applyLongRest(char); else applyShortRest(char); }
      });
    });
  }

  // --- Initiative & Runden ---------------------------------------------------

  setInitiative(encId, instanceId, value) {
    this.patchCombatant(encId, instanceId, { initiative: value }, 'Initiative setzen');
  }

  /** Liefert die Kampfteilnehmer sortiert nach Initiative (höher zuerst,
   *  ohne gewürfelte Initiative landen am Ende, stabil nach Name sortiert). */
  static sortedCombatants(encounter, resolveName) {
    return [...encounter.combatants].sort((a, b) => {
      const ai = a.initiative, bi = b.initiative;
      if (ai == null && bi == null) return resolveName(a).localeCompare(resolveName(b));
      if (ai == null) return 1;
      if (bi == null) return -1;
      if (bi !== ai) return bi - ai;
      return resolveName(a).localeCompare(resolveName(b));
    });
  }

  startCombat(encId) {
    this.mutate('Kampf starten', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (!enc || !enc.combatants.length) return;
      enc.round = 1;
      const sorted = Store.sortedCombatants(enc, (cb) => this._displayName(camp, cb));
      enc.currentTurnId = sorted[0].instanceId;
    });
  }

  nextTurn(encId) {
    this.mutate('Nächster Zug', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (!enc || !enc.combatants.length) return;
      const sorted = Store.sortedCombatants(enc, (cb) => this._displayName(camp, cb));
      const idx = sorted.findIndex((cb) => cb.instanceId === enc.currentTurnId);
      const nextIdx = idx === -1 ? 0 : (idx + 1) % sorted.length;
      if (nextIdx === 0) enc.round += 1;
      enc.currentTurnId = sorted[nextIdx].instanceId;
      // Zustände mit Rundendauer runterzählen (passiert einmal pro vollem
      // Rundendurchlauf, also beim Zurückspringen auf den ersten Teilnehmer).
      if (nextIdx === 0) {
        const tick = (obj) => {
          obj.conditions = (obj.conditions || [])
            .map((c) => (c.rounds == null ? c : { ...c, rounds: c.rounds - 1 }))
            .filter((c) => c.rounds == null || c.rounds > 0);
        };
        enc.combatants.forEach((cb) => {
          // Bei Spielercharakteren leben die Zustände im Roster-Eintrag.
          if (cb.type === 'pc') {
            const char = camp.roster.find((c) => c.id === cb.refId);
            if (char) tick(char);
          } else tick(cb);
        });
      }
    });
  }

  prevTurn(encId) {
    this.mutate('Vorheriger Zug', (s) => {
      const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
      const enc = camp && camp.encounters.find((e) => e.id === encId);
      if (!enc || !enc.combatants.length) return;
      const sorted = Store.sortedCombatants(enc, (cb) => this._displayName(camp, cb));
      const idx = sorted.findIndex((cb) => cb.instanceId === enc.currentTurnId);
      const prevIdx = idx <= 0 ? sorted.length - 1 : idx - 1;
      if (idx === 0) enc.round = Math.max(1, enc.round - 1);
      enc.currentTurnId = sorted[prevIdx].instanceId;
    });
  }

  _displayName(camp, cb) {
    if (cb.type === 'pc') {
      const char = camp.roster.find((c) => c.id === cb.refId);
      return char ? char.name : '???';
    }
    return cb.name || '???';
  }

  // --- Story (ab 1.3) -----------------------------------------------------
  //
  // Verknüpfungen: jeder Eintrag speichert in links die IDs, die beim
  // Bearbeiten DIESES Eintrags angehakt wurden. Angezeigt wird eine
  // Verknüpfung in beide Richtungen, sobald einer der beiden Einträge sie
  // speichert (siehe storyLinksOf). Wird eine Verknüpfung abgewählt, wird sie
  // auf beiden Seiten entfernt.

  _story(s) {
    const camp = s.campaigns.find((c) => c.id === s.activeCampaignId);
    if (!camp) return null;
    if (!camp.story) camp.story = blankStory();
    return camp.story;
  }

  /** Legt einen neuen Eintrag an oder aktualisiert einen bestehenden.
   *  links (optional): vollständige Liste der gewünschten Verknüpfungen. */
  saveStoryEntry(kind, id, data, links) {
    let savedId = id;
    this.mutate(id ? 'Story-Eintrag bearbeiten' : 'Story-Eintrag anlegen', (s) => {
      const story = this._story(s);
      if (!story || !STORY_KIND_KEYS.includes(kind)) return;
      let entry = id ? story[kind].find((e) => e.id === id) : null;
      if (!entry) {
        entry = { id: newId(kindByKey(kind).prefix), createdAt: new Date().toISOString(), links: [] };
        if (kind === 'scenes') {
          entry.order = story.scenes.reduce((m, e) => Math.max(m, Number(e.order) || 0), 0) + 1;
          entry.encounterIds = [];
        }
        story[kind].push(entry);
      }
      const { id: _i, links: _l, createdAt: _c, ...fields } = data || {};
      Object.assign(entry, fields);
      savedId = entry.id;
      if (Array.isArray(links)) {
        const wanted = new Set(links.filter((l) => l && l !== entry.id));
        entry.links = [...wanted];
        // Abgewählte Verknüpfungen auch auf der Gegenseite entfernen.
        STORY_KIND_KEYS.forEach((k) => story[k].forEach((other) => {
          if (other.id !== entry.id && (other.links || []).includes(entry.id) && !wanted.has(other.id)) {
            other.links = other.links.filter((l) => l !== entry.id);
          }
        }));
      }
    });
    return savedId;
  }

  /** Nur einzelne Felder ändern (z.B. Status direkt auf der Karte). */
  patchStoryEntry(kind, id, patch) {
    this.mutate('Story-Eintrag ändern', (s) => {
      const story = this._story(s);
      const entry = story && (story[kind] || []).find((e) => e.id === id);
      if (entry) Object.assign(entry, patch);
    });
  }

  deleteStoryEntry(kind, id) {
    this.mutate('Story-Eintrag löschen', (s) => {
      const story = this._story(s);
      if (!story || !story[kind]) return;
      story[kind] = story[kind].filter((e) => e.id !== id);
      STORY_KIND_KEYS.forEach((k) => story[k].forEach((e) => { e.links = (e.links || []).filter((l) => l !== id); }));
      if (story.currentSceneId === id) story.currentSceneId = null;
      if (kind === 'scenes') story.scenes.sort((a, b) => a.order - b.order).forEach((sc, i) => { sc.order = i + 1; });
    });
  }

  /** Szene in der Reihenfolge nach oben (-1) oder unten (+1) schieben. */
  moveScene(id, dir) {
    this.mutate('Szene verschieben', (s) => {
      const story = this._story(s);
      if (!story) return;
      const list = [...story.scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
      const idx = list.findIndex((e) => e.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= list.length) return;
      [list[idx], list[target]] = [list[target], list[idx]];
      list.forEach((sc, i) => { sc.order = i + 1; });
    });
  }

  setCurrentScene(id) {
    this.mutate('Aktuelle Szene', (s) => {
      const story = this._story(s);
      if (story) story.currentSceneId = id;
    });
  }

  /** Zur nächsten/vorherigen Szene in der Reihenfolge springen; optional die
   *  bisherige Szene als "gespielt" markieren. */
  stepScene(dir, markPlayed = false) {
    this.mutate('Szene wechseln', (s) => {
      const story = this._story(s);
      if (!story || !story.scenes.length) return;
      const list = [...story.scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
      const idx = list.findIndex((e) => e.id === story.currentSceneId);
      if (markPlayed && idx >= 0) list[idx].status = 'gespielt';
      const next = idx < 0 ? 0 : Math.max(0, Math.min(list.length - 1, idx + dir));
      story.currentSceneId = list[next].id;
    });
  }

  // --- Export / Import --------------------------------------------------

  exportJSON() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), ...this.state }, null, 2);
  }

  /** mode: 'replace' ersetzt den gesamten Zustand, 'merge' hängt die
   *  importierten Kampagnen mit neuen IDs an die bestehenden an (keine
   *  Kollisionen, nichts geht verloren). */
  importJSON(jsonString, mode = 'merge') {
    let imported;
    try {
      imported = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('Ungültiges JSON: ' + e.message);
    }
    if (!imported || !Array.isArray(imported.campaigns)) {
      throw new Error('Datei enthält keine erkennbaren Kampagnendaten.');
    }
    delete imported.exportedAt;
    migrateState(imported);
    this.mutate('Import', (s) => {
      if (mode === 'replace') {
        s.campaigns = imported.campaigns;
        s.activeCampaignId = imported.activeCampaignId || (s.campaigns[0] && s.campaigns[0].id) || null;
        s.theme = imported.theme || s.theme;
      } else {
        // IDs neu vergeben, um Kollisionen mit bestehenden Kampagnen zu vermeiden.
        imported.campaigns.forEach((camp) => {
          camp.id = newId('camp');
          s.campaigns.push(camp);
        });
        if (imported.campaigns.length) s.activeCampaignId = imported.campaigns[0].id;
      }
    });
  }

  setTheme(theme) {
    this.mutate('Theme ändern', (s) => { s.theme = theme; });
  }
}

export { RESET_TYPES };
