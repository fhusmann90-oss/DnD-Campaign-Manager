/**
 * storySchema.js
 * ---------------------------------------------------------------------------
 * Beschreibung der sechs Bereiche im Story-Reiter (ab 1.3): welche Felder es
 * gibt, wie ein Eintrag betitelt/sortiert wird und welche Status-Filter es
 * gibt. Die Ansicht (storyView.js) und das Bearbeiten-Formular werden
 * komplett aus dieser Beschreibung aufgebaut.
 *
 * Gespeichert wird alles in campaign.story:
 *   { sessions: [], quests: [], npcs: [], locations: [], clues: [], scenes: [],
 *     currentSceneId }
 * Jeder Eintrag hat id, createdAt, links: [id, ...] (Verknüpfungen zu
 * beliebigen anderen Story-Einträgen) und seine Felder. Szenen haben zusätzlich
 * order (Reihenfolge) und encounterIds (Verweise auf den Encounter-Reiter).
 * ---------------------------------------------------------------------------
 */

const firstLine = (t, max = 80) => {
  const line = String(t || '').split('\n').find((l) => l.trim()) || '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
};

export function formatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso);
}

export const QUEST_STATUS = [
  { value: 'offen', label: 'offen', tone: 'muted' },
  { value: 'aktiv', label: 'aktiv', tone: 'primary' },
  { value: 'erledigt', label: 'erledigt', tone: 'success' },
  { value: 'gescheitert', label: 'gescheitert', tone: 'danger' },
];
export const NPC_ATTITUDE = [
  { value: 'freundlich', label: 'freundlich', tone: 'success' },
  { value: 'neutral', label: 'neutral', tone: 'muted' },
  { value: 'misstrauisch', label: 'misstrauisch', tone: 'warn' },
  { value: 'feindlich', label: 'feindlich', tone: 'danger' },
  { value: 'unbekannt', label: 'unbekannt', tone: 'muted' },
];
export const CLUE_STATUS = [
  { value: 'unbekannt', label: 'Spielern unbekannt', tone: 'warn' },
  { value: 'bekannt', label: 'Spielern bekannt', tone: 'success' },
];
export const SCENE_STATUS = [
  { value: 'geplant', label: 'geplant', tone: 'muted' },
  { value: 'gespielt', label: 'gespielt', tone: 'success' },
];

export const STORY_KINDS = [
  {
    key: 'sessions', label: 'Sitzungen', singular: 'Sitzungsprotokoll', prefix: 'ses', icon: '📜',
    fields: [
      { key: 'number', label: 'Sitzung Nr.', type: 'number' },
      { key: 'date', label: 'Datum', type: 'date' },
      { key: 'summary', label: 'Zusammenfassung', type: 'textarea', rows: 6 },
      { key: 'openThreads', label: 'Offene Fäden', type: 'textarea', rows: 4 },
    ],
    title: (e) => `Sitzung ${e.number || '?'}${e.date ? ' · ' + formatDate(e.date) : ''}`,
    sort: (a, b) => (Number(b.number) || 0) - (Number(a.number) || 0) || String(b.date || '').localeCompare(String(a.date || '')),
    blank: (all) => ({ number: all.reduce((m, e) => Math.max(m, Number(e.number) || 0), 0) + 1, date: new Date().toISOString().slice(0, 10) }),
  },
  {
    key: 'quests', label: 'Quests', singular: 'Quest', prefix: 'qst', icon: '🗺',
    statusField: 'status', statusOptions: QUEST_STATUS,
    filters: [
      { value: '', label: 'Alle' },
      { value: 'laufend', label: 'Offen & aktiv', test: (e) => e.status === 'offen' || e.status === 'aktiv' },
      ...QUEST_STATUS.map((s) => ({ value: s.value, label: s.label, test: (e) => e.status === s.value })),
    ],
    fields: [
      { key: 'title', label: 'Titel', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select', options: QUEST_STATUS },
      { key: 'giver', label: 'Auftraggeber', type: 'text' },
      { key: 'reward', label: 'Belohnung', type: 'text' },
      { key: 'notes', label: 'Notizen', type: 'textarea', rows: 5 },
    ],
    title: (e) => e.title || 'Unbenannte Quest',
    sort: (a, b) => QUEST_STATUS.findIndex((s) => s.value === a.status) - QUEST_STATUS.findIndex((s) => s.value === b.status)
      || String(a.title || '').localeCompare(String(b.title || ''), 'de'),
    blank: () => ({ status: 'offen' }),
  },
  {
    key: 'npcs', label: 'NPCs', singular: 'NPC', prefix: 'npc', icon: '🧑',
    statusField: 'attitude', statusOptions: NPC_ATTITUDE,
    filters: [{ value: '', label: 'Alle' }, ...NPC_ATTITUDE.map((s) => ({ value: s.value, label: s.label, test: (e) => e.attitude === s.value }))],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'role', label: 'Rolle', type: 'text' },
      { key: 'attitude', label: 'Haltung zur Gruppe', type: 'select', options: NPC_ATTITUDE },
      { key: 'secrets', label: 'Geheimnisse', type: 'textarea', rows: 4 },
      { key: 'notes', label: 'Notizen', type: 'textarea', rows: 4 },
    ],
    title: (e) => e.name || 'Unbenannter NPC',
    subtitle: (e) => e.role || '',
    sort: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'),
    blank: () => ({ attitude: 'neutral' }),
  },
  {
    key: 'locations', label: 'Orte', singular: 'Ort', prefix: 'loc', icon: '🏰',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Beschreibung', type: 'textarea', rows: 5 },
      { key: 'inhabitants', label: 'Bewohner', type: 'textarea', rows: 3 },
      { key: 'notes', label: 'Notizen', type: 'textarea', rows: 4 },
    ],
    title: (e) => e.name || 'Unbenannter Ort',
    sort: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'),
    blank: () => ({}),
  },
  {
    key: 'clues', label: 'Hinweise', singular: 'Hinweis', prefix: 'clu', icon: '🔎',
    statusField: 'status', statusOptions: CLUE_STATUS,
    filters: [{ value: '', label: 'Alle' }, ...CLUE_STATUS.map((s) => ({ value: s.value, label: s.label, test: (e) => e.status === s.value }))],
    fields: [
      { key: 'text', label: 'Hinweis', type: 'textarea', rows: 4, required: true },
      { key: 'status', label: 'Status', type: 'select', options: CLUE_STATUS },
      { key: 'source', label: 'Quelle (wo/wie zu finden)', type: 'text' },
    ],
    title: (e) => firstLine(e.text) || 'Leerer Hinweis',
    sort: (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    blank: () => ({ status: 'unbekannt' }),
    linkHint: 'Zugehörige Quest oder Ort unten unter „Verknüpfungen“ auswählen.',
  },
  {
    key: 'scenes', label: 'Szenen', singular: 'Szene', prefix: 'scn', icon: '🎬',
    statusField: 'status', statusOptions: SCENE_STATUS,
    filters: [{ value: '', label: 'Alle' }, ...SCENE_STATUS.map((s) => ({ value: s.value, label: s.label, test: (e) => e.status === s.value }))],
    fields: [
      { key: 'title', label: 'Titel', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select', options: SCENE_STATUS },
      { key: 'description', label: 'Beschreibung / Vorlesetext', type: 'textarea', rows: 7 },
      { key: 'notes', label: 'Notizen', type: 'textarea', rows: 4 },
    ],
    title: (e) => e.title || 'Unbenannte Szene',
    sort: (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
    blank: () => ({ status: 'geplant' }),
  },
];

export const STORY_KIND_KEYS = STORY_KINDS.map((k) => k.key);
export const kindByKey = (key) => STORY_KINDS.find((k) => k.key === key);

export function blankStory() {
  return { sessions: [], quests: [], npcs: [], locations: [], clues: [], scenes: [], currentSceneId: null };
}
