/**
 * srdMonsters.js
 * ---------------------------------------------------------------------------
 * Eingebaute Monster-Vorlagen (SRD-Standardgegner + die beiden Statblöcke
 * aus "Das Vermächtnis der Villa"). Die Daten sind hier noch in den
 * ausführlichen Einzelfeldern von Version 1.0 notiert und werden beim Export
 * per migrateMonsterTemplate() in das Format ab 1.1 umgewandelt
 * (Kernwerte + Freitext-Statblock). Jede Vorlage kann beliebig oft als
 * nummerierte Kopie in einen Encounter gezogen werden.
 *
 * Werte sind SRD-Standardwerte (OGL/ORC), keine proprietären Textblöcke.
 * Beim Anlegen einer neuen Kampagne wird eine Kopie dieser Liste in die
 * Monster-Bibliothek der Kampagne übernommen. "builtin: true" dient nur
 * als Kennzeichnung ("SRD") in der Oberfläche - die Kopien in einer
 * Kampagne lassen sich wie jede andere Vorlage bearbeiten oder entfernen,
 * ohne diese Quelldatei zu beeinflussen.
 * ---------------------------------------------------------------------------
 */

import { migrateMonsterTemplate } from '../migrate.js';

function tpl(data) {
  return {
    id: 'srd_' + data.name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '_'),
    builtin: true,
    size: 'mittelgroß',
    type: 'Humanoid',
    speed: '9 m',
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    conditionImmunities: [],
    sensesText: '',
    languagesText: '',
    skillsText: '',
    savesText: '',
    features: [],
    attacks: [],
    legendary: { actionsMax: 0, resistancesMax: 0 },
    resources: [],
    inventory: [],
    currency: { pm: 0, gm: 0, em: 0, sm: 0, km: 0 },
    notes: '',
    ...data,
  };
}

const RAW_MONSTERS = [
  tpl({
    name: 'Goblin',
    crText: 'CR 1/4',
    ac: 15,
    hpFormula: '2W6',
    hpMax: 7,
    abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    skillsText: 'Heimlichkeit +6',
    sensesText: 'Dunkelsicht 18 m',
    languagesText: 'Goblinisch',
    features: [
      { name: 'Nimble Escape', description: 'Kann als Bonusaktion die Ausweichen- oder Verstecken-Aktion ausführen.' },
    ],
    attacks: [
      { name: 'Krummsäbel', toHit: 4, range: '1,5 m', damage: '1W6+2', damageType: 'Hieb', description: '' },
      { name: 'Kurzbogen', toHit: 4, range: '24/96 m', damage: '1W6+2', damageType: 'Stich', description: '' },
    ],
  }),
  tpl({
    name: 'Goblin-Boss',
    crText: 'CR 1',
    ac: 17,
    hpFormula: '5W6+4',
    hpMax: 21,
    abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 8, cha: 10 },
    sensesText: 'Dunkelsicht 18 m',
    languagesText: 'Goblinisch',
    features: [
      { name: 'Nimble Escape', description: 'Kann als Bonusaktion die Ausweichen- oder Verstecken-Aktion ausführen.' },
      { name: 'Reaktion – Angriff umlenken', description: 'Wenn ein Angriff den Boss treffen würde, kann er stattdessen einen Goblin in Reichweite treffen lassen.' },
    ],
    attacks: [
      { name: 'Krummsäbel', toHit: 4, range: '1,5 m', damage: '1W6+2', damageType: 'Hieb', description: '+1W6 Schaden, wenn das Ziel bereits von einem Verbündeten getroffen wurde.' },
    ],
  }),
  tpl({
    name: 'Ork',
    crText: 'CR 1/2',
    ac: 13,
    hpFormula: '2W8+6',
    hpMax: 15,
    abilities: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    skillsText: 'Einschüchtern +2',
    sensesText: 'Dunkelsicht 18 m',
    languagesText: 'Gemeinsprache, Orkisch',
    features: [
      { name: 'Aggressiv', description: 'Bonusaktion: bewegt sich bis zu seinem Tempo auf einen sichtbaren Feind zu.' },
    ],
    attacks: [
      { name: 'Großaxt', toHit: 5, range: '1,5 m', damage: '1W12+3', damageType: 'Hieb', description: '' },
      { name: 'Wurfspeer', toHit: 5, range: '1,5 m / 9/36 m', damage: '1W6+3', damageType: 'Stich', description: 'Nahkampf oder geworfen.' },
    ],
  }),
  tpl({
    name: 'Wegelagerer (Bandit)',
    crText: 'CR 1/8',
    ac: 12,
    hpFormula: '2W8+2',
    hpMax: 11,
    abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    sensesText: 'normal',
    languagesText: 'Gemeinsprache',
    attacks: [
      { name: 'Krummsäbel', toHit: 3, range: '1,5 m', damage: '1W6+1', damageType: 'Hieb', description: '' },
      { name: 'Leichte Armbrust', toHit: 3, range: '24/96 m', damage: '1W8+1', damageType: 'Stich', description: '' },
    ],
  }),
  tpl({
    name: 'Wolf',
    crText: 'CR 1/4',
    type: 'Bestie',
    ac: 13,
    hpFormula: '2W8+2',
    hpMax: 11,
    speed: '12 m',
    abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    skillsText: 'Wahrnehmung +3, Heimlichkeit +4',
    sensesText: 'normal',
    languagesText: '-',
    features: [
      { name: 'Rudeltaktik', description: 'Vorteil bei Angriffswürfen gegen ein Ziel, wenn mindestens ein Verbündeter in 1,5 m zum Ziel ist und nicht kampfunfähig.' },
    ],
    attacks: [
      { name: 'Biss', toHit: 4, range: '1,5 m', damage: '2W4+2', damageType: 'Stich', description: 'Bei Treffer: DC 11 Stärke-Rettungswurf oder das Ziel liegt am Boden.' },
    ],
  }),
  tpl({
    name: 'Riesenratte',
    crText: 'CR 1/8',
    type: 'Bestie',
    ac: 12,
    hpFormula: '2W6',
    hpMax: 7,
    abilities: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 },
    sensesText: 'Dunkelsicht 18 m',
    languagesText: '-',
    features: [
      { name: 'Rudeltaktik', description: 'Vorteil bei Angriffswürfen gegen ein Ziel, wenn mindestens ein Verbündeter in 1,5 m zum Ziel ist und nicht kampfunfähig.' },
    ],
    attacks: [
      { name: 'Biss', toHit: 4, range: '1,5 m', damage: '1W4+2', damageType: 'Stich', description: '' },
    ],
  }),
  tpl({
    name: 'Skelett',
    crText: 'CR 1/4',
    type: 'Untot',
    ac: 13,
    hpFormula: '2W8+4',
    hpMax: 13,
    abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    vulnerabilities: ['Wucht'],
    immunities: ['Vergiftet'],
    conditionImmunities: ['Vergiftet'],
    sensesText: 'Dunkelsicht 18 m',
    languagesText: 'versteht Sprachen zu Lebzeiten, spricht nicht',
    attacks: [
      { name: 'Kurzschwert', toHit: 4, range: '1,5 m', damage: '1W6+2', damageType: 'Stich', description: '' },
      { name: 'Kurzbogen', toHit: 4, range: '24/96 m', damage: '1W6+2', damageType: 'Stich', description: '' },
    ],
  }),
  tpl({
    name: 'Zombie',
    crText: 'CR 1/4',
    type: 'Untot',
    ac: 8,
    hpFormula: '3W8+9',
    hpMax: 22,
    speed: '6 m',
    abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    immunities: ['Vergiftet'],
    conditionImmunities: ['Vergiftet'],
    sensesText: 'Dunkelsicht 18 m',
    languagesText: 'versteht Sprachen zu Lebzeiten, spricht nicht',
    features: [
      { name: 'Untote Zähigkeit', description: 'Fällt bei Schaden, der ihn auf 0 TP bringen würde, mit einem CON-Rettungswurf (DC 5 + Schaden) auf 1 TP, außer bei radiantem Schaden oder einem kritischen Treffer.' },
    ],
    attacks: [
      { name: 'Faustschlag', toHit: 3, range: '1,5 m', damage: '1W6+1', damageType: 'Wucht', description: '' },
    ],
  }),
  tpl({
    name: 'Schwarzbär',
    crText: 'CR 1/2',
    type: 'Bestie',
    ac: 11,
    hpFormula: '3W8+6',
    hpMax: 19,
    speed: '12 m, Klettern 9 m',
    abilities: { str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7 },
    skillsText: 'Wahrnehmung +3',
    sensesText: 'normal',
    languagesText: '-',
    features: [
      { name: 'Scharfe Sinne', description: 'Vorteil bei Wahrnehmungswürfen, die auf Gehör oder Geruch basieren.' },
    ],
    attacks: [
      { name: 'Biss', toHit: 3, range: '1,5 m', damage: '1W6+2', damageType: 'Stich', description: '' },
      { name: 'Klaue (Multiattack: Biss + Klaue)', toHit: 3, range: '1,5 m', damage: '2W4+2', damageType: 'Hieb', description: '' },
    ],
  }),
  tpl({
    name: 'Riesenspinne',
    crText: 'CR 1',
    type: 'Bestie',
    ac: 14,
    hpFormula: '4W10+4',
    hpMax: 26,
    speed: '9 m, Klettern 9 m',
    abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
    skillsText: 'Heimlichkeit +7, Wahrnehmung +3',
    sensesText: 'Blindsicht 3 m, Dunkelsicht 15 m',
    languagesText: '-',
    features: [
      { name: 'Netzwandler', description: 'Ignoriert Bewegungseinschränkungen durch Spinnweben.' },
      { name: 'Spinnennetz-Gespür', description: 'Weiß automatisch, wo jeder andere Kreatur ist, die ein eigenes Netz berührt, solange beide dasselbe Netz berühren.' },
    ],
    attacks: [
      { name: 'Biss', toHit: 5, range: '1,5 m', damage: '1W8+3', damageType: 'Stich', description: 'Plus 2W8 Gift (DC 11 KON-Rettungswurf, bei Erfolg halber Giftschaden).' },
      { name: 'Netz (Fernkampf)', toHit: 5, range: '9/18 m', damage: '-', damageType: '-', description: 'DC 12 Stärke-Rettungswurf oder das Ziel ist festgenagelt, solange es im Netz ist.' },
    ],
  }),
  tpl({
    name: 'Graf Aldric Morvane (geschwächter Vampir)',
    crText: 'Zwischenboss, angepasst für Stufe 1-2 (Original CR 13)',
    type: 'Untot',
    ac: 15,
    hpFormula: 'angepasst',
    hpMax: 45,
    speed: '9 m, Fliegen 9 m (nur in Nebelgestalt)',
    abilities: { str: 16, dex: 16, con: 14, int: 14, wis: 12, cha: 16 },
    resistances: ['Nekrotisch', 'Wucht/Stich/Hieb durch nichtmagische, nicht versilberte Waffen'],
    immunities: ['Bezaubert (außer durch ihn selbst)', 'Gruseleffekte'],
    sensesText: 'Dunkelsicht 36 m',
    languagesText: 'Gemeinsprache + weitere',
    skillsText: '',
    savesText: '',
    features: [
      { name: 'Untoter Ursprung', description: 'Nimmt doppelten Schaden von Weihwasser und von radiantem/Feuerschaden.' },
      { name: 'Sonnenlicht-Empfindlichkeit', description: 'Im direkten Sonnenlicht Nachteil auf Angriffswürfe und Wahrnehmungswürfe.' },
      { name: 'Regeneration', description: 'Heilt 10 TP zu Beginn seines Zuges, außer er hat in der Vorrunde Feuer- oder radianten Schaden erlitten - zentraler taktischer Hebel für die Gruppe.' },
      { name: 'Nebelgestalt', description: '1x pro Kampf als Bonusaktion: wird immun gegen nichtmagischen Schaden, kann durch Ritzen entkommen, kann in dieser Form nicht angreifen.' },
      { name: 'Pfahl ins Herz', description: 'Nur möglich, wenn der Graf wehrlos/bewusstlos ist (z.B. bei 0 TP): beendet den Kampf sofort und endgültig.' },
    ],
    attacks: [
      { name: 'Klauenangriff', toHit: 6, range: '1,5 m', damage: '1W8+3', damageType: '-', description: '' },
      { name: 'Bissangriff', toHit: 6, range: '1,5 m', damage: '1W6+3 + 2W6 Nekrotisch', damageType: 'Nekrotisch', description: 'Nur gegen wehrlose/gepackte Ziele. Das Ziel-Maximum an TP sinkt um den Nekrotisch-Betrag bis zur nächsten langen Rast.' },
    ],
    resources: [
      { id: 'res_nebelgestalt', name: 'Nebelgestalt', max: 1, current: 1, reset: 'manual' },
    ],
    notes: 'Aus "Das Vermächtnis der Villa", Akt 3 Showdown. Ohne Beute aus dem Goblin-Lager (Weihwasser/Feuerstein/Silberkette): HP auf 30 senken und keine Regeneration geben, dann reicht reiner Nahkampf.',
  }),
];

export const SRD_MONSTERS = RAW_MONSTERS.map((m) => migrateMonsterTemplate(m));
