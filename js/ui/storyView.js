/**
 * storyView.js
 * ---------------------------------------------------------------------------
 * "Story"-Reiter (ab 1.3): Sitzungsprotokolle, Quests, NPCs, Orte, Hinweise
 * und Szenen als Unter-Reiter. Jeder Eintrag ist eine aufklappbare Karte,
 * Einträge lassen sich beliebig untereinander verknüpfen (sichtbar in beide
 * Richtungen, ein Klick springt zum verknüpften Eintrag). Szenen verweisen
 * zusätzlich auf Begegnungen aus dem Encounter-Reiter und lassen sich während
 * der Sitzung der Reihe nach durchklicken.
 *
 * Szenen sind reine Verweis-Container: Encounter, Monster und Charaktere
 * werden weiterhin nur in ihren eigenen Reitern angelegt und bearbeitet.
 * ---------------------------------------------------------------------------
 */

import { el, openModal, closeModal, confirmModal, toast } from './shared.js';
import { field, textInput, numberInput, textarea } from './formHelpers.js';
import { STORY_KINDS, kindByKey, blankStory } from '../data/storySchema.js';

// Felder, die schon im Kartentitel stehen bzw. als Status-Auswahl oben auf
// der Karte erscheinen - im Kartentext daher nicht noch einmal anzeigen.
const TITLE_KEYS = {
  sessions: ['number', 'date'], quests: ['title', 'status'], npcs: ['name', 'role', 'attitude'],
  locations: ['name'], clues: ['status'], scenes: ['title', 'status'],
};

// Reiner UI-Zustand (pro Gerät, wird nicht gespeichert).
const ui = { kind: 'sessions', search: {}, filter: {}, expanded: new Set(), focusId: null };

/** Von außen (z.B. aus dem Encounter-Reiter) zu einem Eintrag springen. */
export function focusStoryEntry(kind, id) {
  if (!kindByKey(kind)) return;
  ui.kind = kind;
  ui.search[kind] = '';
  ui.filter[kind] = '';
  if (id) { ui.expanded.add(id); ui.focusId = id; }
}

function buildIndex(story) {
  const index = new Map();
  STORY_KINDS.forEach((k) => (story[k.key] || []).forEach((e) => index.set(e.id, { kind: k.key, entry: e })));
  return index;
}

/** Alle Verknüpfungen eines Eintrags - in beide Richtungen. */
export function storyLinksOf(story, entry, index = buildIndex(story)) {
  const ids = new Set((entry.links || []).filter((id) => index.has(id)));
  STORY_KINDS.forEach((k) => (story[k.key] || []).forEach((other) => {
    if (other.id !== entry.id && (other.links || []).includes(entry.id)) ids.add(other.id);
  }));
  ids.delete(entry.id);
  return ids;
}

function statusBadge(kindDef, entry) {
  if (!kindDef.statusField) return null;
  const opt = (kindDef.statusOptions || []).find((o) => o.value === entry[kindDef.statusField]);
  if (!opt) return null;
  return el('span', { class: `badge status-${opt.tone}`, text: opt.label });
}

function matchesSearch(kindDef, entry, q) {
  if (!q) return true;
  const hay = [kindDef.title(entry), ...kindDef.fields.map((f) => entry[f.key])].filter((v) => v != null).join(' \n ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

export function renderStoryView(store, container, nav) {
  const camp = store.getActiveCampaign();
  container.innerHTML = '';
  if (!camp) {
    container.appendChild(el('p', { class: 'muted', text: 'Keine aktive Kampagne.' }));
    return;
  }
  const story = camp.story || blankStory();
  const index = buildIndex(story);
  const kindDef = kindByKey(ui.kind) || STORY_KINDS[0];
  const rerender = () => renderStoryView(store, container, nav);

  // --- Unter-Reiter -----------------------------------------------------------
  const subtabs = el('div', { class: 'subtabs', role: 'tablist' });
  STORY_KINDS.forEach((k) => {
    subtabs.appendChild(el('button', {
      class: 'subtab-btn' + (k.key === kindDef.key ? ' active' : ''), role: 'tab',
      onclick: () => { ui.kind = k.key; rerender(); },
    }, [
      el('span', { text: k.label }),
      el('span', { class: 'subtab-count', text: String((story[k.key] || []).length) }),
    ]));
  });
  container.appendChild(subtabs);

  // --- Werkzeugleiste: Neu, Suche, Filter -----------------------------------
  const searchInput = el('input', {
    type: 'search', class: 'input story-search', placeholder: `${kindDef.label} durchsuchen…`, value: ui.search[kindDef.key] || '',
  });
  const toolbar = el('div', { class: 'row gap wrap align-center toolbar' }, [
    el('button', {
      class: 'btn btn-primary', text: `+ ${kindDef.singular}`,
      onclick: () => openStoryEditor(store, kindDef.key, null),
    }),
    searchInput,
  ]);
  let filterSelect = null;
  if (kindDef.filters) {
    filterSelect = el('select', { class: 'input', 'aria-label': 'Filter' });
    kindDef.filters.forEach((f) => filterSelect.appendChild(el('option', { value: f.value, text: f.label })));
    filterSelect.value = ui.filter[kindDef.key] || '';
    toolbar.appendChild(filterSelect);
  }
  container.appendChild(toolbar);

  // --- Szenen: Sitzungsmodus (Szenen der Reihe nach durchklicken) -----------
  if (kindDef.key === 'scenes') container.appendChild(renderScenePlayer(store, camp, story, index, nav, rerender));

  // --- Liste -------------------------------------------------------------------
  const listEl = el('div', { class: 'story-list' });
  container.appendChild(listEl);

  const renderList = () => {
    listEl.innerHTML = '';
    const q = ui.search[kindDef.key] || '';
    const fval = ui.filter[kindDef.key] || '';
    const fdef = (kindDef.filters || []).find((f) => f.value === fval);
    const all = [...(story[kindDef.key] || [])].sort(kindDef.sort);
    const shown = all.filter((e) => (!fdef || !fdef.test || fdef.test(e)) && matchesSearch(kindDef, e, q));
    if (!all.length) {
      listEl.appendChild(el('p', { class: 'muted', text: `Noch keine ${kindDef.label}. Lege oben einen ersten Eintrag an.` }));
      return;
    }
    if (!shown.length) {
      listEl.appendChild(el('p', { class: 'muted', text: 'Keine Treffer für Suche/Filter.' }));
      return;
    }
    if (q || fval) listEl.appendChild(el('p', { class: 'muted small', text: `${shown.length} von ${all.length} angezeigt` }));
    shown.forEach((entry) => listEl.appendChild(renderEntryCard(store, camp, story, index, kindDef, entry, renderList, nav, rerender)));
  };
  searchInput.addEventListener('input', () => { ui.search[kindDef.key] = searchInput.value; renderList(); });
  if (filterSelect) filterSelect.addEventListener('change', () => { ui.filter[kindDef.key] = filterSelect.value; renderList(); });
  renderList();

  if (ui.focusId) {
    const id = ui.focusId;
    ui.focusId = null;
    requestAnimationFrame(() => {
      const target = container.querySelector(`[data-story-id="${CSS.escape(id)}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('flash');
        setTimeout(() => target.classList.remove('flash'), 1400);
      }
    });
  }
}

// --- Sitzungsmodus für Szenen ------------------------------------------------

function renderScenePlayer(store, camp, story, index, nav, rerender) {
  const scenes = [...story.scenes].sort((a, b) => (a.order || 0) - (b.order || 0));
  const current = scenes.find((s) => s.id === story.currentSceneId) || null;
  const idx = current ? scenes.indexOf(current) : -1;
  const panel = el('div', { class: 'scene-player' });
  panel.appendChild(el('div', { class: 'tracker-block-title', text: 'Sitzungsmodus' }));
  if (!scenes.length) {
    panel.appendChild(el('p', { class: 'muted small', text: 'Lege Szenen an, um sie während der Sitzung der Reihe nach durchzuklicken.' }));
    return panel;
  }
  panel.appendChild(el('div', { class: 'scene-player-title' }, current ? [
    el('span', { class: 'muted', text: `Szene ${idx + 1} von ${scenes.length}: ` }),
    el('strong', { text: current.title || 'Unbenannte Szene' }),
    current.status === 'gespielt' ? el('span', { class: 'badge status-success', text: 'gespielt' }) : null,
  ] : [el('span', { class: 'muted', text: 'Noch keine aktuelle Szene. „Start“ beginnt mit der ersten.' })]));
  panel.appendChild(el('div', { class: 'row gap wrap' }, [
    el('button', { class: 'btn', text: '◂ Zurück', disabled: !current || idx === 0, onclick: () => store.stepScene(-1) }),
    el('button', { class: 'btn btn-primary', text: current ? 'Weiter ▸' : '▶ Start', disabled: current && idx === scenes.length - 1, onclick: () => store.stepScene(current ? 1 : 0) }),
    current ? el('button', {
      class: 'btn', text: idx === scenes.length - 1 ? '✓ Als gespielt markieren' : '✓ Gespielt & weiter',
      onclick: () => store.stepScene(1, true),
    }) : null,
  ]));
  if (current) {
    if (current.description && current.description.trim()) {
      panel.appendChild(el('div', { class: 'read-aloud', text: current.description }));
    }
    const encChips = encounterChips(store, camp, current, nav);
    if (encChips) panel.appendChild(encChips);
    const links = storyLinksOf(story, current, index);
    if (links.size) panel.appendChild(linkChips(story, index, links, rerender));
  }
  return panel;
}

// --- Karte eines Eintrags ----------------------------------------------------

function renderEntryCard(store, camp, story, index, kindDef, entry, renderList, nav, rerender) {
  const isOpen = ui.expanded.has(entry.id);
  const isCurrentScene = kindDef.key === 'scenes' && story.currentSceneId === entry.id;
  const card = el('div', { class: 'card story-card' + (isCurrentScene ? ' current-turn' : ''), 'data-story-id': entry.id });
  const subtitle = kindDef.subtitle ? kindDef.subtitle(entry) : '';
  const titleText = (kindDef.key === 'scenes' ? `${entry.order || '?'}. ` : '') + kindDef.title(entry);
  card.appendChild(el('div', {
    class: 'card-header',
    onclick: () => { if (isOpen) ui.expanded.delete(entry.id); else ui.expanded.add(entry.id); renderList(); },
  }, [
    el('div', { class: 'story-card-head' }, [
      el('div', { class: 'card-title', text: (isCurrentScene ? '▶ ' : '') + titleText }),
      subtitle ? el('div', { class: 'muted small', text: subtitle }) : null,
    ]),
    el('div', { class: 'row gap align-center' }, [
      statusBadge(kindDef, entry),
      linkCountBadge(story, index, entry),
      el('span', { class: 'chevron', text: isOpen ? '▾' : '▸' }),
    ]),
  ]));
  if (!isOpen) return card;

  const body = el('div', { class: 'card-body' });

  // Status direkt auf der Karte umschalten (z.B. Hinweis "bekannt", Quest "erledigt").
  if (kindDef.statusField) {
    const sel = el('select', { class: 'input input-sm', 'aria-label': 'Status' });
    kindDef.statusOptions.forEach((o) => sel.appendChild(el('option', { value: o.value, text: o.label })));
    sel.value = entry[kindDef.statusField] || kindDef.statusOptions[0].value;
    sel.addEventListener('change', () => store.patchStoryEntry(kindDef.key, entry.id, { [kindDef.statusField]: sel.value }));
    const statusLabel = kindDef.fields.find((f) => f.key === kindDef.statusField).label;
    body.appendChild(el('label', { class: 'row gap align-center story-status' }, [el('span', { class: 'small muted', text: statusLabel }), sel]));
  }

  const skip = TITLE_KEYS[kindDef.key] || [];
  kindDef.fields.filter((f) => !skip.includes(f.key)).forEach((f) => {
    const v = entry[f.key];
    if (v == null || String(v).trim() === '') return;
    body.appendChild(el('div', { class: 'story-field' }, [
      el('div', { class: 'tracker-block-title', text: f.label }),
      el('div', { class: 'statblock-text' + (f.key === 'description' && kindDef.key === 'scenes' ? ' read-aloud' : ''), text: String(v) }),
    ]));
  });

  if (kindDef.key === 'scenes') {
    const chips = encounterChips(store, camp, entry, nav);
    if (chips) body.appendChild(chips);
  }
  const links = storyLinksOf(story, entry, index);
  if (links.size) body.appendChild(linkChips(story, index, links, rerender));
  else body.appendChild(el('p', { class: 'muted small', text: 'Keine Verknüpfungen.' }));

  const actions = el('div', { class: 'row gap wrap justify-end story-actions' });
  if (kindDef.key === 'scenes') {
    actions.appendChild(el('button', { class: 'btn btn-sm', text: '▲', title: 'nach oben', onclick: () => store.moveScene(entry.id, -1) }));
    actions.appendChild(el('button', { class: 'btn btn-sm', text: '▼', title: 'nach unten', onclick: () => store.moveScene(entry.id, 1) }));
    if (!isCurrentScene) actions.appendChild(el('button', { class: 'btn btn-sm', text: '▶ Als aktuelle Szene', onclick: () => store.setCurrentScene(entry.id) }));
  }
  actions.appendChild(el('button', { class: 'btn btn-sm', text: '✎ Bearbeiten', onclick: () => openStoryEditor(store, kindDef.key, entry) }));
  actions.appendChild(el('button', {
    class: 'btn btn-sm btn-danger', text: '🗑 Löschen',
    onclick: async () => {
      if (await confirmModal(`"${kindDef.title(entry)}" wirklich löschen? Verknüpfungen zu diesem Eintrag werden ebenfalls entfernt.`)) {
        ui.expanded.delete(entry.id);
        store.deleteStoryEntry(kindDef.key, entry.id);
      }
    },
  }));
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

function linkCountBadge(story, index, entry) {
  const n = storyLinksOf(story, entry, index).size + (entry.encounterIds || []).length;
  return n ? el('span', { class: 'badge badge-muted', title: 'Verknüpfungen', text: '🔗 ' + n }) : null;
}

/** Chips der verknüpften Einträge, gruppiert nach Bereich. Klick springt hin. */
function linkChips(story, index, ids, rerender) {
  const wrap = el('div', { class: 'link-groups' });
  STORY_KINDS.forEach((k) => {
    const items = [...ids].map((id) => index.get(id)).filter((x) => x && x.kind === k.key).map((x) => x.entry).sort(k.sort);
    if (!items.length) return;
    wrap.appendChild(el('div', { class: 'link-group' }, [
      el('span', { class: 'link-group-label', text: k.label + ':' }),
      ...items.map((e) => el('button', {
        class: 'chip chip-link', text: (k.key === 'scenes' ? `${e.order}. ` : '') + k.title(e),
        onclick: () => {
          focusStoryEntry(k.key, e.id);
          rerender();
        },
      })),
    ]));
  });
  return wrap;
}

function encounterChips(store, camp, scene, nav) {
  const encs = (scene.encounterIds || []).map((id) => camp.encounters.find((e) => e.id === id)).filter(Boolean);
  if (!encs.length) return null;
  return el('div', { class: 'link-group' }, [
    el('span', { class: 'link-group-label', text: 'Encounter:' }),
    ...encs.map((enc) => el('button', {
      class: 'chip chip-link chip-encounter', text: '⚔ ' + enc.name,
      onclick: () => {
        if (camp.activeEncounterId !== enc.id) store.setActiveEncounter(enc.id);
        if (nav) nav.goto('encounter');
      },
    })),
  ]);
}

// --- Bearbeiten-Formular -------------------------------------------------------

function openStoryEditor(store, kind, entry) {
  const camp = store.getActiveCampaign();
  const story = camp.story || blankStory();
  const kindDef = kindByKey(kind);
  const index = buildIndex(story);
  const source = entry ? { ...entry } : { ...kindDef.blank(story[kind] || []) };

  const inputs = {};
  const form = el('div', { class: 'editor-form' });
  const grid = el('div', { class: 'form-grid' });
  const wide = [];
  kindDef.fields.forEach((f) => {
    let input;
    if (f.type === 'textarea') input = textarea(source[f.key], { rows: String(f.rows || 4) });
    else if (f.type === 'number') input = numberInput(source[f.key] ?? '', { min: '0' });
    else if (f.type === 'date') input = el('input', { type: 'date', class: 'input', value: source[f.key] || '' });
    else if (f.type === 'select') {
      input = el('select', { class: 'input' });
      f.options.forEach((o) => input.appendChild(el('option', { value: o.value, text: o.label })));
      input.value = source[f.key] || f.options[0].value;
    } else input = textInput(source[f.key]);
    inputs[f.key] = input;
    if (f.type === 'textarea') wide.push(field(f.label, input)); else grid.appendChild(field(f.label, input));
  });
  form.appendChild(grid);
  wide.forEach((w) => form.appendChild(w));
  if (kindDef.linkHint) form.appendChild(el('p', { class: 'muted small', text: kindDef.linkHint }));

  // --- Verknüpfungen ---------------------------------------------------------
  const selected = entry ? storyLinksOf(story, entry, index) : new Set();
  form.appendChild(el('h3', { class: 'editor-section-title', text: 'Verknüpfungen' }));
  form.appendChild(el('p', { class: 'muted small', text: 'Verknüpfungen sind in beide Richtungen sichtbar – z.B. erscheint eine hier angehakte Quest auch beim NPC.' }));
  STORY_KINDS.forEach((k) => {
    const options = (story[k.key] || []).filter((e) => !entry || e.id !== entry.id).sort(k.sort);
    form.appendChild(checkboxPicker(
      k.label, options.map((e) => ({ id: e.id, label: (k.key === 'scenes' ? `${e.order}. ` : '') + k.title(e) })),
      selected,
    ));
  });

  // --- Szenen: Encounter-Verweise -------------------------------------------------
  let encSelected = null;
  if (kind === 'scenes') {
    encSelected = new Set(source.encounterIds || []);
    form.appendChild(el('h3', { class: 'editor-section-title', text: 'Encounter dieser Szene' }));
    if (!camp.encounters.length) {
      form.appendChild(el('p', { class: 'muted small', text: 'Noch keine Encounter vorhanden – lege sie im Encounter-Reiter an.' }));
    } else {
      form.appendChild(checkboxPicker('Encounter', camp.encounters.map((e) => ({ id: e.id, label: e.name })), encSelected, { open: true }));
    }
  }

  const wrapper = el('div', {}, [
    form,
    el('div', { class: 'row gap justify-end sticky-footer' }, [
      el('button', { class: 'btn', onclick: () => closeModal(), text: 'Abbrechen' }),
      el('button', {
        class: 'btn btn-primary', text: 'Speichern',
        onclick: () => {
          const data = {};
          kindDef.fields.forEach((f) => {
            const v = inputs[f.key].value;
            data[f.key] = f.type === 'number' ? (v === '' ? null : Number(v)) : (f.type === 'textarea' ? v : v.trim());
          });
          const req = kindDef.fields.find((f) => f.required);
          if (req && !String(data[req.key] || '').trim()) {
            toast(`Bitte „${req.label}“ ausfüllen.`, 'warn');
            inputs[req.key].focus();
            return;
          }
          if (encSelected) data.encounterIds = [...encSelected];
          const id = store.saveStoryEntry(kind, entry ? entry.id : null, data, [...selected]);
          ui.expanded.add(id);
          closeModal();
          toast('Gespeichert.', 'success');
        },
      }),
    ]),
  ]);
  openModal(wrapper, { title: entry ? `${kindDef.singular} bearbeiten` : `Neu: ${kindDef.singular}`, wide: true });
}

/** Aufklappbare Checkbox-Liste mit eigener Suche (für viele Einträge). */
function checkboxPicker(label, options, selectedSet, { open = false } = {}) {
  const details = el('details', { class: 'collapsible picker' });
  const count = () => options.filter((o) => selectedSet.has(o.id)).length;
  const countBadge = el('span', { class: 'badge badge-muted', text: `${count()} / ${options.length}` });
  if (open || count() > 0) details.open = true;
  details.appendChild(el('summary', { class: 'collapsible-summary' }, [el('span', { text: label }), countBadge]));
  const body = el('div', { class: 'collapsible-body' });
  if (!options.length) {
    body.appendChild(el('p', { class: 'muted small', text: 'Noch keine Einträge.' }));
  } else {
    const list = el('div', { class: 'picker-list' });
    const filter = el('input', { type: 'search', class: 'input input-sm', placeholder: 'filtern…' });
    if (options.length > 6) body.appendChild(filter);
    options.forEach((o) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = selectedSet.has(o.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedSet.add(o.id); else selectedSet.delete(o.id);
        countBadge.textContent = `${count()} / ${options.length}`;
      });
      const row = el('label', { class: 'picker-row' }, [cb, el('span', { text: o.label })]);
      row.dataset.label = o.label.toLowerCase();
      list.appendChild(row);
    });
    filter.addEventListener('input', () => {
      const q = filter.value.toLowerCase();
      list.querySelectorAll('.picker-row').forEach((r) => { r.style.display = r.dataset.label.includes(q) ? '' : 'none'; });
    });
    body.appendChild(list);
  }
  details.appendChild(body);
  return details;
}
