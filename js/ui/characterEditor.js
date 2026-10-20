/**
 * characterEditor.js
 * ---------------------------------------------------------------------------
 * Das vollständige Bearbeitungsformular für einen Spielercharakter. Wird an
 * zwei Stellen benutzt:
 *   1. Roster-Ansicht: "Charakter manuell anlegen" / "bearbeiten"
 *   2. Import-Vorschau: dieselbe Form, vorausgefüllt mit den aus dem PDF
 *      ausgelesenen Werten, damit der Spielleiter Fehler vor dem Speichern
 *      korrigieren kann (siehe importFlow.js).
 *
 * buildCharacterEditor(data) gibt { node, collect() } zurück. collect()
 * liest den aktuellen Formularinhalt aus und liefert ein vollständiges
 * Charakter-Objekt (gleiche Form wie blankCharacter()).
 * ---------------------------------------------------------------------------
 */

import { el } from './shared.js';
import { field, textInput, numberInput, textarea, repeatableList } from './formHelpers.js';
import {
  ABILITIES, ABILITY_LABEL, SKILLS, RESET_TYPES, abilityMod, fmtMod, profBonusForLevel, saveBonus, skillBonusFor,
  parseSignedNumber, CASTER_TYPES, detectCasterType, presetSpellSlots, describeSlots,
} from '../data/rules.js';
import { blankCharacter } from '../state.js';

export function buildCharacterEditor(data) {
  const source = { ...blankCharacter(), ...data };
  source.spellcasting = { ...blankCharacter().spellcasting, ...(data && data.spellcasting) };

  // --- Kopfzeile: Name, Klasse/Stufe, Volk, Spieler -----------------------
  const nameInput = textInput(source.name);
  const klasseInput = textInput(source.klasse, { placeholder: 'z.B. Kleriker' });
  const unterklasseInput = textInput(source.unterklasse, { placeholder: 'z.B. Domäne des Lebens' });
  const stufeInput = numberInput(source.stufe, { min: '1', max: '20', style: 'width:5em' });
  const speziesInput = textInput(source.spezies);
  const spielernameInput = textInput(source.spielername);

  const headerGrid = el('div', { class: 'form-grid' }, [
    field('Name', nameInput),
    field('Klasse', klasseInput),
    field('Unterklasse', unterklasseInput),
    field('Stufe', stufeInput),
    field('Volk', speziesInput),
    field('Spieler:in', spielernameInput),
  ]);

  // --- Bonus-Felder mit "automatisch berechnet"-Logik --------------------------
  // Jedes Bonusfeld zeigt den aktuell gültigen Wert. Solange es nicht von Hand
  // geändert wurde (bzw. kein Wert aus dem PDF vorliegt), rechnet es live mit,
  // wenn sich Attribute, Stufe oder Übung ändern. Ein eigener Wert wird blau
  // markiert und lässt sich mit ↺ wieder auf "berechnet" zurücksetzen.
  const bonusFields = []; // { input, resetBtn, compute: () => number }

  function makeBonusField(overrideValue, compute) {
    const manual = overrideValue != null && overrideValue !== '' && Number.isFinite(Number(overrideValue));
    const input = el('input', { type: 'text', inputmode: 'numeric', class: 'input input-sm bonus-input' });
    const resetBtn = el('button', { class: 'btn-icon reset-btn', title: 'Zurück auf berechnet', text: '↺', type: 'button' });
    const entry = { input, resetBtn, compute, manual };
    const sync = () => {
      input.classList.toggle('is-override', entry.manual);
      resetBtn.style.visibility = entry.manual ? 'visible' : 'hidden';
      if (!entry.manual) input.value = fmtMod(compute());
    };
    // Startwert wird erst gesetzt, wenn alle Formularfelder existieren
    // (siehe initBonuses weiter unten) - compute() liest die anderen Felder.
    entry.init = () => { input.value = fmtMod(manual ? Number(overrideValue) : compute()); sync(); };
    input.addEventListener('input', () => { entry.manual = true; sync(); });
    resetBtn.addEventListener('click', (e) => { e.preventDefault(); entry.manual = false; sync(); });
    entry.sync = sync;
    entry.read = () => {
      if (!entry.manual) return null;
      const v = parseSignedNumber(input.value);
      return v == null || v === compute() ? null : v;
    };
    bonusFields.push(entry);
    return entry;
  }
  const recomputeBonuses = () => bonusFields.forEach((f) => f.sync());

  // --- Attribute + Rettungswürfe -----------------------------------------------
  const abilityInputs = {};
  const saveProfInputs = {};
  const saveBonusFields = {};
  const currentAbilities = () => {
    const a = {};
    ABILITIES.forEach((ab) => { a[ab] = Number(abilityInputs[ab].value) || 10; });
    return a;
  };
  const currentSaveProf = () => {
    const p = {};
    ABILITIES.forEach((ab) => { p[ab] = !!saveProfInputs[ab].checked; });
    return p;
  };
  const currentProfBonus = () => profBonusForLevel(stufeInput.value);
  const abilityGrid = el('div', { class: 'ability-grid' });
  ABILITIES.forEach((ab) => {
    const scoreInput = numberInput(source.abilities[ab], { min: '1', max: '30' });
    const modLabel = el('div', { class: 'muted small', text: fmtMod(abilityMod(source.abilities[ab])) });
    const saveCheck = el('input', { type: 'checkbox' });
    saveCheck.checked = !!source.saveProf[ab];
    abilityInputs[ab] = scoreInput;
    saveProfInputs[ab] = saveCheck;
    scoreInput.addEventListener('input', () => { modLabel.textContent = fmtMod(abilityMod(scoreInput.value)); recomputeBonuses(); });
    saveCheck.addEventListener('change', recomputeBonuses);
    const bf = makeBonusField((source.saveBonusOverride || {})[ab], () => saveBonus(currentAbilities(), currentSaveProf(), currentProfBonus(), ab));
    saveBonusFields[ab] = bf;
    abilityGrid.appendChild(el('div', { class: 'ability-cell' }, [
      el('div', { class: 'ability-cell-label', text: ABILITY_LABEL[ab] }),
      scoreInput,
      modLabel,
      el('label', { class: 'inline-label small' }, [saveCheck, document.createTextNode('RW geübt')]),
      el('div', { class: 'row gap align-center justify-center' }, [el('span', { class: 'small muted', text: 'RW' }), bf.input, bf.resetBtn]),
    ]));
  });

  // --- Fertigkeiten (0 ungeübt / 1 geübt / 2 Expertise) + Bonus ---------------
  const skillSelects = {};
  const skillBonusFields = {};
  const currentSkillProf = () => {
    const p = {};
    SKILLS.forEach((sk) => { p[sk.key] = Number(skillSelects[sk.key].value) || 0; });
    return p;
  };
  const skillGrid = el('div', { class: 'skill-grid' });
  SKILLS.forEach((skill) => {
    const select = el('select', { class: 'input input-sm' });
    [[0, 'ungeübt'], [1, 'geübt'], [2, 'Expertise']].forEach(([v, label]) => {
      select.appendChild(el('option', { value: String(v), text: label }));
    });
    select.value = String(source.skillProf[skill.key] || 0);
    select.addEventListener('change', recomputeBonuses);
    skillSelects[skill.key] = select;
    const bf = makeBonusField((source.skillBonusOverride || {})[skill.key], () => skillBonusFor(currentAbilities(), currentSkillProf(), currentProfBonus(), skill.key));
    skillBonusFields[skill.key] = bf;
    skillGrid.appendChild(el('div', { class: 'skill-row' }, [
      el('span', { class: 'skill-row-name', text: `${skill.name} (${ABILITY_LABEL[skill.ab].slice(0, 3)})` }),
      el('span', { class: 'row gap align-center' }, [select, bf.input, bf.resetBtn]),
    ]));
  });
  stufeInput.addEventListener('input', recomputeBonuses);
  bonusFields.forEach((f) => f.init());

  // --- Kampfwerte ------------------------------------------------------------
  const acInput = numberInput(source.ac, { style: 'width:5em' });
  const speedInput = textInput(source.speed);
  const initExtraInput = numberInput(source.initExtra, { style: 'width:5em' });
  const hpMaxInput = numberInput(source.hp.max, { style: 'width:5em' });
  const hpCurrentInput = numberInput(source.hp.current, { style: 'width:5em' });
  const hitDieInput = numberInput(source.hitDice.die, { style: 'width:5em' });
  const hitDiceTotalInput = numberInput(source.hitDice.total, { style: 'width:5em' });

  const combatGrid = el('div', { class: 'form-grid' }, [
    field('Rüstungsklasse', acInput),
    field('Bewegungsrate', speedInput),
    field('Initiative-Bonus (zusätzlich zu GES)', initExtraInput),
    field('TP maximal', hpMaxInput),
    field('TP aktuell', hpCurrentInput),
    field('Trefferwürfel (Seiten, z.B. 8 für 1W8)', hitDieInput),
    field('Trefferwürfel gesamt', hitDiceTotalInput),
  ]);

  // --- Zauberwirken (ab 1.2) -----------------------------------------------------
  // Zauberplätze kommen standardmäßig aus der Voreinstellung nach Klasse und
  // Stufe (Voll-/Halb-/Drittelzauberwirker, Paktmagie). Mit "manuell festlegen"
  // lassen sie sich frei überschreiben. Verbrauchte Plätze bleiben beim
  // Speichern erhalten (z.B. wenn nur eine Notiz geändert wird).
  const spellAbilitySelect = el('select', { class: 'input input-sm' });
  ['int', 'wis', 'cha'].forEach((ab) => spellAbilitySelect.appendChild(el('option', { value: ab, text: ABILITY_LABEL[ab] })));
  spellAbilitySelect.value = source.spellcasting.ability || 'int';
  const casterTypeSelect = el('select', { class: 'input input-sm' });
  CASTER_TYPES.forEach((t) => casterTypeSelect.appendChild(el('option', { value: t.key, text: t.label })));
  casterTypeSelect.value = source.spellcasting.casterType || 'auto';
  const manualCheck = el('input', { type: 'checkbox' });
  manualCheck.checked = !!source.spellcasting.slotsManual;
  const presetInfo = el('p', { class: 'small preset-info' });

  const spellSlotsList = repeatableList(source.spellSlots.map((sl) => ({ level: sl.level, max: sl.max })), [
    { key: 'level', label: 'Grad', type: 'number', width: '5em' },
    { key: 'max', label: 'Anzahl Plätze', type: 'number', width: '7em' },
  ], { addLabel: '+ Zaubergrad', blank: { level: 1, max: 1 } });
  const manualBox = el('div', { class: 'subsection' }, [spellSlotsList.node]);

  const resolvedType = () => (casterTypeSelect.value === 'auto'
    ? detectCasterType(klasseInput.value, unterklasseInput.value) : casterTypeSelect.value);
  const updatePreset = () => {
    const type = resolvedType();
    const label = (CASTER_TYPES.find((t) => t.key === type) || {}).label || type;
    const preset = presetSpellSlots(type, stufeInput.value);
    const reset = type === 'pact' ? 'kurzer Rast' : 'langer Rast';
    presetInfo.textContent = `Voreinstellung (${casterTypeSelect.value === 'auto' ? 'erkannt: ' : ''}${label}, Stufe ${stufeInput.value || 1}): ${describeSlots(preset)}${preset.length ? ` – regenerieren bei ${reset}` : ''}`;
    manualBox.style.display = manualCheck.checked ? '' : 'none';
    presetInfo.classList.toggle('muted', manualCheck.checked);
  };
  manualCheck.addEventListener('change', () => {
    // Beim Einschalten mit der aktuell gültigen Voreinstellung vorbelegen
    // (außer der Charakter hatte schon vorher eigene, manuelle Plätze).
    if (manualCheck.checked && (!source.spellcasting.slotsManual || !spellSlotsList.collect().length)) {
      spellSlotsList.node.querySelectorAll('.repeat-row').forEach((r) => r.remove());
      presetSpellSlots(resolvedType(), stufeInput.value).forEach(() => spellSlotsList.node.querySelector('button.btn-sm').click());
      const rows = spellSlotsList.node.querySelectorAll('.repeat-row');
      presetSpellSlots(resolvedType(), stufeInput.value).forEach((p, i) => {
        rows[i].querySelector('[data-field="level"]').value = p.level;
        rows[i].querySelector('[data-field="max"]').value = p.max;
      });
    }
    updatePreset();
  });
  [casterTypeSelect, klasseInput, unterklasseInput, stufeInput].forEach((n) => n.addEventListener('input', updatePreset));
  casterTypeSelect.addEventListener('change', updatePreset);
  updatePreset();

  const spellsTextInput = textarea(source.spellsText, {
    rows: '6', placeholder: 'z.B.\nZaubertricks: Heilige Flamme, Thaumaturgie\nGrad 1: Segnen, Wunden heilen\nGrad 2: Spirituelle Waffe',
  });

  const spellBlock = el('div', { class: 'subsection' }, [
    el('div', { class: 'form-grid' }, [
      field('Zauberwirker-Typ', casterTypeSelect),
      field('Zauberattribut', spellAbilitySelect),
    ]),
    presetInfo,
    el('label', { class: 'row gap align-center small' }, [manualCheck, document.createTextNode('Zauberplätze manuell festlegen (überschreibt die Voreinstellung)')]),
    manualBox,
    el('div', { class: 'tracker-block-title', text: 'Zauber & Zaubertricks (Freitext)' }), spellsTextInput,
  ]);

  // --- Ressourcen (Klassenmerkmale mit Nutzungen) ------------------------------
  const resourcesList = repeatableList(source.resources, [
    { key: 'name', label: 'Name (z.B. Wut, Ki)', type: 'text' },
    { key: 'max', label: 'Max. Nutzungen', type: 'number', width: '6em' },
    {
      key: 'reset', label: 'Regeneriert bei', type: 'select',
      options: RESET_TYPES.map((r) => ({ value: r.key, label: r.label })),
    },
  ], { addLabel: '+ Ressource', blank: { name: '', max: 1, reset: 'long' } });

  // --- Angriffe/Aktionen ---------------------------------------------------
  const attacksList = repeatableList(source.attacks, [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'toHit', label: 'Bonus', type: 'number', width: '4.5em' },
    { key: 'range', label: 'Reichweite', type: 'text', width: '7em' },
    { key: 'damage', label: 'Schaden', type: 'text', width: '7em' },
    { key: 'damageType', label: 'Typ', type: 'text', width: '6em' },
    { key: 'description', label: 'Beschreibung', type: 'text' },
  ], { addLabel: '+ Angriff/Aktion' });

  // --- Merkmale als Freitext (ab 1.2) ---------------------------------------------
  const FEATURE_FIELDS = [
    ['classFeatures', 'Klassenmerkmale'],
    ['subclassFeatures', 'Unterklassenmerkmale'],
    ['speciesTraits', 'Volksmerkmale'],
    ['background', 'Hintergrund'],
    ['feats', 'Talente'],
    ['proficienciesText', 'Übungen & Sprachen'],
  ];
  const featureInputs = {};
  const featureGrid = el('div', { class: 'feature-text-grid' });
  FEATURE_FIELDS.forEach(([key, label]) => {
    featureInputs[key] = textarea(source[key], { rows: '4' });
    featureGrid.appendChild(field(label, featureInputs[key]));
  });

  // --- Inventar & Währung --------------------------------------------------
  const inventoryList = repeatableList(source.inventory, [
    { key: 'name', label: 'Gegenstand', type: 'text' },
    { key: 'qty', label: 'Anzahl', type: 'number', width: '5em' },
  ], { addLabel: '+ Gegenstand' });

  const currencyInputs = {};
  const currencyGrid = el('div', { class: 'row gap' });
  ['pm', 'gm', 'em', 'sm', 'km'].forEach((k) => {
    const input = numberInput(source.currency[k], { style: 'width:4.5em' });
    currencyInputs[k] = input;
    currencyGrid.appendChild(field(k.toUpperCase(), input));
  });

  const notesInput = textarea(source.notes, { rows: '4' });

  // --- Zusammenbau -----------------------------------------------------------
  const node = el('div', { class: 'editor-form' }, [
    sectionTitle('Grunddaten'), headerGrid,
    sectionTitle('Attribute & Rettungswürfe'),
    el('p', { class: 'muted small', text: 'Boni werden automatisch aus Attribut, Stufe und Übung berechnet. Ein eigener Wert (z.B. aus dem PDF oder durch einen magischen Gegenstand) wird blau markiert; ↺ setzt ihn zurück.' }),
    abilityGrid,
    sectionTitle('Fertigkeiten'), skillGrid,
    sectionTitle('Kampfwerte'), combatGrid,
    sectionTitle('Zauberwirken'), spellBlock,
    sectionTitle('Ressourcen'), resourcesList.node,
    sectionTitle('Angriffe & Aktionen'), attacksList.node,
    sectionTitle('Merkmale'), featureGrid,
    sectionTitle('Inventar & Währung'), inventoryList.node, currencyGrid,
    sectionTitle('Notizen (Hintergrund, Persönlichkeit, ...)'), notesInput,
  ]);

  function collectSpellcasting() {
    const type = resolvedType();
    const manual = manualCheck.checked;
    const base = manual
      ? spellSlotsList.collect()
        .map((sl) => ({ level: Math.max(1, Math.min(9, Number(sl.level) || 1)), max: Math.max(0, Number(sl.max) || 0) }))
        .filter((sl) => sl.max > 0)
        .sort((a, b) => a.level - b.level)
      : presetSpellSlots(type, stufeInput.value);
    // Verbrauchte Plätze pro Grad übernehmen.
    const spellSlots = base.map((sl) => {
      const old = (source.spellSlots || []).find((o) => o.level === sl.level);
      const used = old ? Math.max(0, (old.max || 0) - (old.current || 0)) : 0;
      const out = { level: sl.level, max: sl.max, current: Math.max(0, sl.max - used) };
      if (type === 'pact') out.pact = true;
      return out;
    });
    const spellsText = spellsTextInput.value;
    return {
      spellSlots,
      spellsText,
      spellcasting: {
        ability: spellAbilitySelect.value,
        casterType: casterTypeSelect.value,
        slotsManual: manual,
        slotsResetOn: type === 'pact' ? 'short' : 'long',
        enabled: spellSlots.length > 0 || spellsText.trim() !== '' || type !== 'none',
      },
    };
  }

  function collect() {
    const abilities = {};
    const saveProf = {};
    ABILITIES.forEach((ab) => {
      abilities[ab] = Number(abilityInputs[ab].value) || 10;
      saveProf[ab] = !!saveProfInputs[ab].checked;
    });
    const skillProf = {};
    SKILLS.forEach((skill) => { skillProf[skill.key] = Number(skillSelects[skill.key].value) || 0; });
    const saveBonusOverride = {};
    ABILITIES.forEach((ab) => { const v = saveBonusFields[ab].read(); if (v != null) saveBonusOverride[ab] = v; });
    const skillBonusOverride = {};
    SKILLS.forEach((sk) => { const v = skillBonusFields[sk.key].read(); if (v != null) skillBonusOverride[sk.key] = v; });
    const currency = {};
    Object.entries(currencyInputs).forEach(([k, input]) => { currency[k] = Number(input.value) || 0; });

    return {
      ...source,
      name: nameInput.value.trim() || 'Unbenannt',
      klasse: klasseInput.value.trim(),
      unterklasse: unterklasseInput.value.trim(),
      stufe: Number(stufeInput.value) || 1,
      spezies: speziesInput.value.trim(),
      spielername: spielernameInput.value.trim(),
      abilities,
      saveProf,
      skillProf,
      saveBonusOverride,
      skillBonusOverride,
      ac: Number(acInput.value) || 10,
      speed: speedInput.value.trim(),
      initExtra: Number(initExtraInput.value) || 0,
      hp: { ...source.hp, max: Number(hpMaxInput.value) || 0, current: Number(hpCurrentInput.value) || 0 },
      hitDice: { ...source.hitDice, die: Number(hitDieInput.value) || 8, total: Number(hitDiceTotalInput.value) || 1 },
      ...collectSpellcasting(),
      // Bereits vorhandene Ressourcen (gleicher Name) behalten ihre aktuelle
      // Nutzungszahl - sonst würde jedes Öffnen des Editors (z.B. nur um
      // eine Notiz zu ändern) mitten in einer Kampagne alle Ressourcen auf
      // "voll" zurücksetzen.
      resources: resourcesList.collect().map((r) => {
        const existing = source.resources.find((sr) => sr.name.toLowerCase() === r.name.toLowerCase());
        return {
          id: existing ? existing.id : 'res_' + r.name.toLowerCase().replace(/[^a-zäöüß0-9]+/gi, '_') + '_' + Math.random().toString(36).slice(2, 6),
          name: r.name, max: r.max, current: existing ? Math.min(existing.current, r.max) : r.max, reset: r.reset,
        };
      }),
      attacks: attacksList.collect().map((a, i) => ({ id: 'atk' + i, ...a })),
      ...Object.fromEntries(FEATURE_FIELDS.map(([key]) => [key, featureInputs[key].value])),
      inventory: inventoryList.collect().map((i, idx) => ({ id: 'inv' + idx, ...i })),
      currency,
      notes: notesInput.value,
    };
  }

  return { node, collect };
}

function sectionTitle(text) {
  return el('h3', { class: 'editor-section-title', text });
}
