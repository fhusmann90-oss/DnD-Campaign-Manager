# Änderungsprotokoll

## 1.4 – Handy und PC (Hosting und Synchronisierung)

- **Hosting über GitHub Pages:** eine statische Seite, weiterhin ohne Build-Schritt. Die Anleitung steht in `SETUP.md`.
- **Synchronisierung über Supabase:** Der gesamte Kampagnenstand liegt als **ein** JSON-Dokument (eine Tabellenzeile pro Konto) in der Cloud. Es wird keine Zusatzbibliothek gebraucht, die App spricht Supabase direkt per `fetch` an.
- **Login per E-Mail:** Link oder Code (Code empfohlen für das App-Symbol auf dem Handy). Neue Registrierungen sind abgeschaltet, Row Level Security lässt nur das eigene Konto lesen und schreiben (`supabase/setup.sql`).
- **Automatisches Speichern** ca. 1,5 s nach der letzten Änderung. Mehrere schnelle Änderungen werden zu einem Upload zusammengefasst.
- **Statusanzeige** oben: Gespeichert, Ungesichert, Speichert, Offline, Anmelden, Konflikt, Nur lokal. Ein Tipp darauf öffnet das Sync-Menü.
- **Offline-Betrieb:** Die Daten bleiben wie bisher lokal gespeichert. Ein Service Worker hält die App-Dateien im Cache, sodass die App auch ohne Netz startet. Beim Wiederverbinden wird automatisch hochgeladen.
- **Abgleich zwischen Geräten:** Beim Start und beim Zurückwechseln in den Tab wird ein neuerer Cloud-Stand automatisch geladen.
- **Konflikte:** Der letzte Stand gewinnt. Ist die Cloud-Version neuer als die lokale Änderung, fragt die App vorher nach. Der verworfene Stand wird als Sicherung aufgehoben und lässt sich herunterladen.
- **Erstes Anmelden auf einem Gerät mit eigenen Daten:** Die App fragt, welcher Stand gelten soll. Ein leeres Gerät übernimmt den Cloud-Stand still.
- **Pausiertes Supabase-Projekt:** Die App arbeitet lokal weiter und zeigt einen Hinweis. Die Reaktivierung ist in `SETUP.md` beschrieben.
- **Theme pro Gerät:** Hell/Dunkel wird nicht synchronisiert.
- **App-Symbol für den Home-Bildschirm** (Web-App-Manifest).
- **JSON-Export/-Import** bleibt als Backup erhalten.
- Kleinigkeit: Bestätigungsdialoge, die per ✕/Esc oder Klick daneben geschlossen werden, zählen jetzt sauber als „Abbrechen“.

## 1.3 – Story-Reiter

- **Neuer Reiter „Story“** mit sechs Unter-Reitern:
  - **Sitzungen:** Nummer, Datum (beides vorbelegt), Zusammenfassung, offene Fäden
  - **Quests:** Titel, Status (offen/aktiv/erledigt/gescheitert), Auftraggeber, Belohnung, Notizen
  - **NPCs:** Name, Rolle, Haltung zur Gruppe, Geheimnisse, Notizen
  - **Orte:** Name, Beschreibung, Bewohner, Notizen
  - **Hinweise:** Text, Status (Spielern bekannt/unbekannt), Quelle; die zugehörige Quest bzw. der Ort wird über eine Verknüpfung gesetzt
  - **Szenen:** Titel, Reihenfolge, Status (geplant/gespielt), Beschreibung/Vorlesetext, Notizen
- **Verknüpfungen:** Jeder Eintrag lässt sich mit beliebigen anderen verknüpfen. Die Verknüpfung ist auf beiden Seiten sichtbar (z. B. sieht man beim NPC seine Quests, Orte, Szenen und Sitzungen), ein Klick springt zum Eintrag. Wird eine Verknüpfung abgewählt, verschwindet sie auf beiden Seiten. Beim Löschen eines Eintrags werden alle Verweise darauf entfernt.
- **Szenen → Encounter:** Szenen können auf Encounter verweisen, ein Klick öffnet den Encounter. Umgekehrt zeigt der Encounter-Reiter, zu welcher Szene ein Encounter gehört. Szenen speichern nur Verweise, nichts wird doppelt angelegt.
- **Sitzungsmodus:** Die Szenen lassen sich während des Spiels der Reihe nach durchklicken (Start, Weiter, Zurück, „Gespielt & weiter“). Die aktuelle Szene ist markiert, ihr Vorlesetext und ihre Encounter stehen direkt oben. Die Reihenfolge lässt sich mit ▲▼ ändern.
- **Suche und Filter** pro Bereich, z. B. „Offen & aktiv“ bei Quests oder „Spielern unbekannt“ bei Hinweisen. Der Status lässt sich direkt auf der Karte umstellen.
- Die Story ist im JSON-Export/-Import enthalten. Alte Exporte bekommen beim Laden eine leere Story.

## 1.2 – Spielercharaktere bis Stufe 5

- **Freitextfelder pro Charakter:** Klassenmerkmale, Unterklassenmerkmale, Volksmerkmale, Hintergrund, Talente sowie Übungen & Sprachen. Neu ist außerdem das Feld „Unterklasse“ in den Grunddaten.
- **Zauber als Freitext:** keine Zauberliste mehr, sondern ein Textfeld. Auf der Karte stehen zusätzlich Zauber-SG und Zauberangriffsbonus.
- **Zauberplätze nach Klasse und Stufe:** Die Plätze werden automatisch voreingestellt: Vollzauberwirker, Halbzauberwirker (Paladin, Waldläufer; Regeln von 2014, also Plätze ab Stufe 2), Drittelzauberwirker (Mystischer Ritter, Arkaner Betrüger, wird über die Unterklasse erkannt), Magieschmied und Paktmagie. Der Typ lässt sich fest wählen, die Plätze lassen sich manuell überschreiben.
- **Paktmagie:** Die Plätze des Hexenmeisters regenerieren bei kurzer Rast, alle anderen bei langer Rast.
- **Antippen je Platz:** Ein gefüllter Kreis bedeutet „verfügbar“. Antippen verbraucht einen Platz, ein leerer Kreis gibt ihn zurück.
- **Verbrauchte Plätze bleiben erhalten,** wenn der Charakter bearbeitet wird (z. B. Stufe oder Notiz geändert).
- **Einklappbare Bereiche auf der Charakterkarte:** Angriffe, Zauber, Merkmale, Inventar, Notizen. Im Encounter stehen Angriffe, Zauber und Merkmale direkt auf der Karte.
- **Automatische Umwandlung:** Die alte Merkmalsliste wird auf die neuen Textfelder verteilt, die alte Zauberliste wird zu Text („Zaubertricks: …“, „Grad 1: …“). Stimmen vorhandene Zauberplätze mit der Voreinstellung überein, übernimmt die Automatik, sonst bleiben sie manuell.
- **PDF-Import:** Hintergrund, Zauber und Merkmale landen in den neuen Feldern.
- Kein Level-up-Helfer: Stufe und Werte werden weiterhin von Hand angepasst. Nach dem Speichern rechnet die App die Zauberplätze passend neu.

## 1.1 – Monster vereinfacht, Fähigkeitenboni

- **Monster nur noch manuell:** Der PDF-Import für Monster-Statblöcke wurde entfernt (der PDF-Import für Charakterbögen bleibt).
- **Neues Monster-Formular:** Name, Attribute, Bewegungsrate, Trefferpunkte, Rüstungsklasse und ein freies Textfeld für alles andere (Angriffe, Aktionen, Merkmale, Resistenzen, Sinne, Sprachen, HG …). Legendäre Aktionen/Resistenzen und Ressourcen mit Nutzungen bleiben als anklickbare Zähler.
- **Bestehende Monster werden automatisch umgewandelt:** Alle Einzelfelder aus 1.0 (Größe, Typ, HG, TP-Formel, Rettungswürfe, Fertigkeiten, Sinne, Sprachen, Resistenzen, Immunitäten, Merkmale, Angriffe, Inventar, Notizen) landen als lesbarer Text im Statblock. Das gilt auch für Monster in bestehenden Encountern und für alte JSON-Exporte.
- **Monster im Encounter:** keine Todesrettungswürfe und keine Rast-Buttons mehr. Die Rast-Buttons oben im Encounter wirken nur auf Charaktere. Der Statblock wird direkt auf der Karte angezeigt.
- **Nummerierung:** „Goblin 1“, „Goblin 2“ … funktionieren jetzt auch, wenn später weitere Kopien dazukommen. Eine einzelne Kopie wird automatisch zu „… 1“, sobald eine zweite hinzukommt.
- **Fähigkeitenboni (Charaktere):** neuer, standardmäßig eingeklappter Bereich auf jeder Charakterkarte (auch im Encounter). Er zeigt Attribute mit Wert und Modifikator, alle 6 Rettungswürfe und alle 18 Fertigkeiten mit Bonus. Übung und Expertise lassen sich direkt antippen, jeder Bonus ist direkt editierbar. Eigene Werte sind blau markiert, ↺ rechnet wieder automatisch.
- **PDF-Import:** Eingetragene Rettungswurf- und Fertigkeitsboni werden aus dem Bogen übernommen, wenn sie vom berechneten Wert abweichen. Die Import-Vorschau rechnet live mit, wenn Attribute, Stufe oder Übung geändert werden.
- **Reiter umbenannt:** Charaktere, Monster, Encounter.
- **Eine Kampagne:** Die Kampagnenverwaltung ist ausgeblendet. Die Auswahl erscheint nur noch, wenn durch einen alten Import mehrere Kampagnen vorhanden sind. Der JSON-Import ersetzt jetzt immer den aktuellen Stand (mit Rückfrage).
- **Handy:** Die Kopfzeile bleibt beim Scrollen korrekt oben, die Tap-Ziele auf Touch-Geräten sind größer und Eingabefelder zoomen auf dem iPhone nicht mehr.
- **Fehlerbehebungen aus 1.0:**
  - Monster-Kopien verloren intern ihre Kennung (der Kreaturtyp überschrieb sie), dadurch war die Nummerierung falsch.
  - Eine Rast im Encounter konnte bei einem frisch hinzugefügten Charakter abstürzen.
  - Zustände mit Rundendauer zählten bei Charakteren nicht herunter.
