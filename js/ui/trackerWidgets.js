/**
 * trackerWidgets.js
 * ---------------------------------------------------------------------------
 * Wiederverwendbare Tracking-Bausteine (TP, Zauberplätze, Ressourcen,
 * Zustände, Konzentration, Erschöpfung, Todesrettungswürfe, Rast-Buttons).
 * Werden sowohl für Roster-Charaktere (rosterView.js) als auch für
 * Kampfteilnehmer im Encounter (encounterView.js) benutzt - daher kennen
 * sie den Store NICHT direkt, sondern bekommen immer:
 *   - obj:   das Objekt mit den Werten (Character oder Combatant - beide
 *            haben dieselbe Form für hp/spellSlots/resources/conditions/...)
 *   - patch: eine Funktion patch(partialObj), die der Aufrufer so verdrahtet,
 *            dass sie am richtigen Ort im Store landet (Roster-Eintrag oder
 *            Kampfteilnehmer).
 *
 * Jede render*-Funktion baut ein fertiges DOM-Element MIT bereits
 * angehängten Event-Listenern zurück. Nach jeder Store-Änderung baut die
 * aufrufende View die ganze Karte neu auf (einfaches, robustes
 * "re-render alles"-Modell statt feingranularem Diffing) - die Widgets
 * selbst halten keinen eigenen Zustand.
 * ---------------------------------------------------------------------------
 */

import { el, escapeHtml, rollD20 } from './shared.js';
import { CONDITIONS, EXHAUSTION_EFFECTS, RESET_TYPES } from '../data/rules.js';

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

// --- Trefferpunkte ----------------------------------------------------------

export function renderHpBlock(obj, patch) {
  const hp = obj.hp || { max: 0, current: 0, temp: 0 };
  const pct = hp.max ? clamp(Math.round((hp.current / hp.max) * 100), 0, 100) : 0;
  const barClass = pct <= 25 ? 'hp-bar-fill critical' : pct <= 50 ? 'hp-bar-fill warn' : 'hp-bar-fill';

  const node = el('div', { class: 'tracker-block' }, [
    el('div', { class: 'tracker-block-title', text: 'Trefferpunkte' }),
    el('div', { class: 'hp-bar' }, [el('div', { class: barClass, style: `width:${pct}%` })]),
    el('div', { class: 'row gap align-center wrap' }, [
      labeledNumberInput('Aktuell', hp.current, (v) => patch({ hp: { ...hp, current: clamp(v, -9999, hp.max + (hp.temp || 0)) } })),
      labeledNumberInput('Max', hp.max, (v) => patch({ hp: { ...hp, max: Math.max(0, v) } })),
      labeledNumberInput('Temp', hp.temp, (v) => patch({ hp: { ...hp, temp: Math.max(0, v) } })),
    ]),
  ]);

  const quickRow = el('div', { class: 'row gap wrap' });
  const amountInput = el('input', { type: 'number', class: 'input input-sm', value: '1', min: '0', style: 'width:4.5em' });
  const applyDamage = () => {
    let amount = Math.max(0, Number(amountInput.value) || 0);
    let temp = hp.temp || 0;
    const fromTemp = Math.min(temp, amount);
    temp -= fromTemp;
    amount -= fromTemp;
    const current = Math.max(0, hp.current - amount);
    patch({ hp: { ...hp, current, temp } });
  };
  const applyHeal = () => {
    const amount = Math.max(0, Number(amountInput.value) || 0);
    const current = clamp(hp.current + amount, 0, hp.max);
    patch({ hp: { ...hp, current } });
  };
  const applyTemp = () => {
    const amount = Math.max(0, Number(amountInput.value) || 0);
    // Temp-TP überschreiben sich nicht gegenseitig additiv (5e-Regel):
    // der höhere Wert gewinnt.
    patch({ hp: { ...hp, temp: Math.max(hp.temp || 0, amount) } });
  };
  quickRow.append(
    amountInput,
    el('button', { class: 'btn btn-sm btn-danger', onclick: applyDamage, text: '⚔ Schaden' }),
    el('button', { class: 'btn btn-sm btn-success', onclick: applyHeal, text: '✚ Heilung' }),
    el('button', { class: 'btn btn-sm', onclick: applyTemp, text: '🛡 Temp-TP' }),
  );
  node.appendChild(quickRow);
  return node;
}

function labeledNumberInput(label, value, onChange) {
  const input = el('input', {
    type: 'number', class: 'input input-sm', value: String(value ?? ''), style: 'width:4.5em',
    onchange: (e) => onChange(Number(e.target.value) || 0),
  });
  return el('label', { class: 'inline-label' }, [el('span', { text: label }), input]);
}

// --- Zauberplätze -------------------------------------------------------------

export function renderSpellSlotsBlock(obj, patch) {
  const slots = obj.spellSlots || [];
  if (!slots.length) return null;
  const pact = obj.spellcasting && obj.spellcasting.slotsResetOn === 'short';
  const node = el('div', { class: 'tracker-block' }, [
    el('div', { class: 'tracker-block-title' }, [
      document.createTextNode(pact ? 'Zauberplätze (Paktmagie)' : 'Zauberplätze'),
      el('span', { class: 'title-hint', text: pact ? ' · regenerieren bei kurzer Rast' : ' · regenerieren bei langer Rast' }),
    ]),
  ]);
  slots.forEach((slot) => {
    const row = el('div', { class: 'row gap align-center slot-row' }, [
      el('span', { class: 'pip-label', text: 'Grad ' + slot.level }),
    ]);
    const pipRow = el('div', { class: 'pip-row' });
    // Jeder Platz ist ein eigener Schalter: gefüllt = verfügbar, leer =
    // verbraucht. Antippen eines gefüllten Platzes verbraucht einen, Antippen
    // eines leeren gibt einen zurück (Plätze eines Grades sind gleichwertig).
    for (let i = 0; i < slot.max; i += 1) {
      const filled = i < slot.current;
      pipRow.appendChild(el('button', {
        class: 'pip' + (filled ? ' pip-filled' : ''),
        'aria-label': `Grad ${slot.level}, Platz ${i + 1}: ${filled ? 'verfügbar' : 'verbraucht'}`,
        title: filled ? 'verfügbar – antippen zum Verbrauchen' : 'verbraucht – antippen zum Zurückgeben',
        onclick: () => {
          const newCurrent = clamp(slot.current + (filled ? -1 : 1), 0, slot.max);
          const newSlots = slots.map((s) => (s.level === slot.level ? { ...s, current: newCurrent } : s));
          patch({ spellSlots: newSlots });
        },
      }));
    }
    row.appendChild(pipRow);
    row.appendChild(el('span', { class: 'muted small', text: `${slot.current}/${slot.max} verfügbar` }));
    node.appendChild(row);
  });
  return node;
}

// --- Ressourcen & Klassenmerkmale ---------------------------------------------

export function renderResourcesBlock(obj, patch) {
  const resources = obj.resources || [];
  const node = el('div', { class: 'tracker-block' }, [el('div', { class: 'tracker-block-title', text: 'Ressourcen' })]);
  if (!resources.length) {
    node.appendChild(el('p', { class: 'muted small', text: 'Keine Ressourcen hinterlegt.' }));
    return node;
  }
  resources.forEach((res) => {
    const resetLabel = (RESET_TYPES.find((r) => r.key === res.reset) || {}).label || res.reset;
    const row = el('div', { class: 'row gap align-center wrap' }, [
      el('span', { class: 'pip-label', text: `${res.name} (${resetLabel})` }),
    ]);
    if (res.max <= 30) {
      const pipRow = el('div', { class: 'pip-row' });
      for (let i = 0; i < res.max; i += 1) {
        const filled = i < res.current;
        pipRow.appendChild(el('button', {
          class: 'pip' + (filled ? ' pip-filled' : ''),
          onclick: () => {
            const newCurrent = i < res.current ? i : i + 1;
            const newResources = resources.map((r) => (r.id === res.id ? { ...r, current: newCurrent } : r));
            patch({ resources: newResources });
          },
        }));
      }
      row.appendChild(pipRow);
    } else {
      row.appendChild(el('button', {
        class: 'btn btn-sm', text: '−',
        onclick: () => patch({ resources: resources.map((r) => (r.id === res.id ? { ...r, current: clamp(r.current - 1, 0, r.max) } : r)) }),
      }));
      row.appendChild(el('button', {
        class: 'btn btn-sm', text: '+',
        onclick: () => patch({ resources: resources.map((r) => (r.id === res.id ? { ...r, current: clamp(r.current + 1, 0, r.max) } : r)) }),
      }));
    }
    row.appendChild(el('span', { class: 'muted small', text: `${res.current}/${res.max}` }));
    node.appendChild(row);
  });
  return node;
}

// --- Zustände -------------------------------------------------------------

export function renderConditionsBlock(obj, patch) {
  const conditions = obj.conditions || [];
  const node = el('div', { class: 'tracker-block' }, [el('div', { class: 'tracker-block-title', text: 'Zustände' })]);
  const chipRow = el('div', { class: 'row gap wrap' });
  conditions.forEach((c) => {
    chipRow.appendChild(el('span', { class: 'chip' }, [
      document.createTextNode(c.name + (c.rounds != null ? ` (${c.rounds})` : '')),
      el('button', {
        class: 'chip-remove', 'aria-label': 'Entfernen',
        onclick: () => patch({ conditions: conditions.filter((x) => x.id !== c.id) }),
        text: '✕',
      }),
    ]));
  });
  node.appendChild(chipRow);

  const select = el('select', { class: 'input input-sm' });
  CONDITIONS.forEach((name) => select.appendChild(el('option', { value: name, text: name })));
  select.appendChild(el('option', { value: '__custom__', text: '(eigener Text)' }));
  const customInput = el('input', { type: 'text', class: 'input input-sm', placeholder: 'eigener Zustand', style: 'display:none' });
  select.addEventListener('change', () => {
    customInput.style.display = select.value === '__custom__' ? '' : 'none';
  });
  const roundsInput = el('input', { type: 'number', class: 'input input-sm', placeholder: 'Runden', style: 'width:5em' });
  const addBtn = el('button', {
    class: 'btn btn-sm btn-primary', text: '+ Hinzufügen',
    onclick: () => {
      const name = select.value === '__custom__' ? customInput.value.trim() : select.value;
      if (!name) return;
      const rounds = roundsInput.value ? Math.max(1, Number(roundsInput.value)) : null;
      patch({ conditions: [...conditions, { id: 'cond_' + Date.now().toString(36), name, rounds }] });
    },
  });
  node.appendChild(el('div', { class: 'row gap align-center wrap' }, [select, customInput, roundsInput, addBtn]));
  return node;
}

// --- Konzentration ----------------------------------------------------------

export function renderConcentrationBlock(obj, patch) {
  const conc = obj.concentration || { active: false, spellName: '' };
  const toggle = el('input', {
    type: 'checkbox', onchange: (e) => patch({ concentration: { ...conc, active: e.target.checked } }),
  });
  toggle.checked = !!conc.active;
  const nameInput = el('input', {
    type: 'text', class: 'input input-sm', placeholder: 'Zauber', value: conc.spellName || '',
    onchange: (e) => patch({ concentration: { ...conc, spellName: e.target.value } }),
  });
  return el('div', { class: 'tracker-block' }, [
    el('div', { class: 'tracker-block-title', text: 'Konzentration' }),
    el('label', { class: 'row gap align-center' }, [toggle, document.createTextNode('aktiv auf:'), nameInput]),
  ]);
}

// --- Erschöpfung --------------------------------------------------------------

export function renderExhaustionBlock(obj, patch) {
  const level = obj.exhaustion || 0;
  const row = el('div', { class: 'row gap wrap' });
  for (let i = 0; i <= 6; i += 1) {
    row.appendChild(el('button', {
      class: 'btn btn-sm' + (i === level ? ' btn-primary' : ''),
      title: EXHAUSTION_EFFECTS[i],
      onclick: () => patch({ exhaustion: i }),
      text: String(i),
    }));
  }
  return el('div', { class: 'tracker-block' }, [
    el('div', { class: 'tracker-block-title', text: 'Erschöpfung' }),
    row,
    el('p', { class: 'muted small', text: EXHAUSTION_EFFECTS[level] }),
  ]);
}

// --- Todesrettungswürfe -------------------------------------------------------

export function renderDeathSavesBlock(obj, patch) {
  const ds = obj.deathSaves || { success: 0, fail: 0 };
  function pipGroup(label, count, key, cls) {
    const pipRow = el('div', { class: 'pip-row' });
    for (let i = 0; i < 3; i += 1) {
      const filled = i < count;
      pipRow.appendChild(el('button', {
        class: 'pip ' + cls + (filled ? ' pip-filled' : ''),
        onclick: () => {
          const next = i < count ? i : i + 1;
          patch({ deathSaves: { ...ds, [key]: next } });
        },
      }));
    }
    return el('div', { class: 'row gap align-center' }, [el('span', { class: 'pip-label', text: label }), pipRow]);
  }
  return el('div', { class: 'tracker-block' }, [
    el('div', { class: 'tracker-block-title', text: 'Todesrettungswürfe' }),
    pipGroup('Erfolge', ds.success, 'success', 'pip-success'),
    pipGroup('Fehlschläge', ds.fail, 'fail', 'pip-fail'),
    el('button', {
      class: 'btn btn-sm', text: 'zurücksetzen',
      onclick: () => patch({ deathSaves: { success: 0, fail: 0 } }),
    }),
  ]);
}

// --- Rast-Buttons --------------------------------------------------------------

export function renderRestButtons({ onShortRest, onLongRest, shortLabel = '🌙 Kurze Rast', longLabel = '🌕 Lange Rast' }) {
  return el('div', { class: 'row gap wrap' }, [
    el('button', { class: 'btn btn-sm', onclick: onShortRest, text: shortLabel }),
    el('button', { class: 'btn btn-sm btn-primary', onclick: onLongRest, text: longLabel }),
  ]);
}

// --- Initiative-Hilfe (Würfel-Button) ------------------------------------------

export function renderInitiativeRoller(initExtra, onRolled) {
  return el('button', {
    class: 'btn btn-sm', title: 'W20 + Modifikator würfeln',
    onclick: () => onRolled(rollD20(initExtra || 0)),
    text: '🎲 Init',
  });
}
