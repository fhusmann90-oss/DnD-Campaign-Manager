# D&D 5e Kampagnen-Tracker (Version 1.4)

Eine Single-Page-App für Spielleiter:innen: Charaktere, Monster, Encounter (Initiative, TP, Zustände …) und die Story einer Kampagne an einem Ort. Läuft komplett im Browser, ohne Installation und ohne Build-Schritt.

- **Nur lokal:** Die Daten liegen im `localStorage` des Browsers. JSON-Export und -Import dienen als Backup.
- **Auf Handy und PC (optional):** Die App wird über GitHub Pages gehostet und über Supabase synchronisiert. Die Schritt-für-Schritt-Anleitung steht in **[SETUP.md](SETUP.md)**.

Was sich in welcher Version geändert hat, steht in **[CHANGELOG.md](CHANGELOG.md)**.

## Lokal starten (ohne Hosting)

`index.html` **nicht** per Doppelklick öffnen (`file://…`), weil Browser dann die ES-Module und den PDF-Worker blockieren. Stattdessen im Projektordner einen kleinen Webserver starten:

```bash
cd campaign-tracker
python3 -m http.server 8080
# oder: npx serve .
```

Danach `http://localhost:8080` öffnen.

## Reiter

- **Charaktere:** Charaktere manuell anlegen oder per PDF-Import (Formularfelder des bekannten Charakterbogens) einlesen. Auf der Karte gibt es TP, Zauberplätze (Voreinstellung nach Klasse und Stufe, Paktmagie), Ressourcen, Zustände, Konzentration, Erschöpfung, Todesrettungswürfe und Rasten. Einklappbar sind die **Fähigkeitenboni** (Attribute, Rettungswürfe, Fertigkeiten) sowie Angriffe, Zauber, Merkmale, Inventar und Notizen.
- **Monster:** Vorlagen mit Kernwerten (Attribute, RK, TP, Bewegung) und einem freien Statblock-Text. Legendäre Aktionen und Ressourcen sind anklickbare Zähler. Von hier aus lassen sich beliebig viele nummerierte Kopien in den aktiven Encounter ziehen (jede mit eigenen TP).
- **Encounter:** Initiative-Tracker mit manueller Eingabe oder W20-Knopf, sortierter Reihenfolge, Rundenzähler, Vor/Zurück, Verzögern/Bereit, tot/bewusstlos. Monster haben keine Todesrettungswürfe und keine Rast-Buttons.
- **Story:** Sitzungsprotokolle, Quests, NPCs, Orte, Hinweise und Szenen. Die Einträge lassen sich untereinander verknüpfen (sichtbar in beide Richtungen), Szenen verweisen auf Encounter. Es gibt einen Sitzungsmodus zum Durchklicken der Szenen sowie Suche und Filter.

## Ordnerstruktur

```
campaign-tracker/
├── index.html              Einstiegsseite
├── sw.js                   Service Worker (Offline-Betrieb)
├── manifest.webmanifest    App-Symbol für den Home-Bildschirm
├── css/styles.css          Styling (Dunkelmodus, Handy-optimiert)
├── icons/                  App-Symbole
├── lib/                    pdf.js (Mozilla, Apache-2.0) für den Charakterbogen-Import
├── supabase/setup.sql      Datenbank-Einrichtung (Tabelle + Zugriffsregeln)
└── js/
    ├── app.js              Start, Reiter, Kopfzeile, Export/Import, Sync-Menü
    ├── config.js           Supabase-Zugangsdaten (leer = nur lokal)
    ├── sync.js             Cloud-Synchronisierung (Login, Auto-Save, Konflikte)
    ├── state.js            Zentraler Store (localStorage), Rasten, Rückgängig
    ├── migrate.js          Hebt alte Spielstände/Exporte auf das aktuelle Format
    ├── version.js          Versionsnummer
    ├── pdfCharacterParser.js  Liest Charakterbögen aus den PDF-Formularfeldern
    ├── data/
    │   ├── rules.js        5e-Regeln: Fertigkeiten, Boni, Zauberplatz-Tabellen
    │   ├── srdMonsters.js  Eingebaute Monster (SRD + Graf aus „Das Vermächtnis der Villa“)
    │   └── storySchema.js  Felder/Status der sechs Story-Bereiche
    └── ui/                 Ansichten und Formulare der Reiter
```

## Hinweise

- **PDF-Import für Charaktere:** Der Import ist fest auf die Feldnamen des Formulars zugeschnitten, das die Gruppe benutzt. Eingetragene Boni werden übernommen, wenn sie vom berechneten Wert abweichen. Ein anderes Layout wird nicht erkannt, die Felder lassen sich dann in der Vorschau von Hand ausfüllen.
- **Alte Daten:** Spielstände und JSON-Exporte aus Version 1.0 bis 1.3 werden beim Laden automatisch umgewandelt, dabei geht nichts verloren.
- **Rückgängig:** Die letzten 40 Aktionen lassen sich zurücknehmen (pro Gerät).
