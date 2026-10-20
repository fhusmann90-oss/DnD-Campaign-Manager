# Einrichtung: Hosting (GitHub Pages) und Synchronisierung (Supabase)

Diese Anleitung bringt den Tracker ins Internet, damit du ihn auf Handy **und** PC mit demselben Kampagnenstand nutzen kannst. Beides ist kostenlos. Rechne mit etwa 30 Minuten.

**Was am Ende herauskommt:**
- Die App liegt unter einer festen Adresse, z. B. `https://felix-beispiel.github.io/dnd-tracker/`.
- Du meldest dich einmal pro Gerät per E-Mail an (Link oder Code, kein Passwort).
- Jede Änderung wird automatisch gespeichert. Offline arbeitet die App weiter und lädt beim nächsten Verbinden hoch.

> **Hinweis zu den Menünamen:** GitHub und Supabase ändern ihre Oberflächen gelegentlich. Steht ein Knopf nicht exakt so da, such nach einem ähnlich benannten an derselben Stelle.

---

## Teil 1: GitHub – die App ins Netz stellen

### Schritt 1: GitHub-Konto anlegen
1. Öffne <https://github.com> und klicke auf **Sign up**.
2. Gib E-Mail-Adresse, Passwort und Benutzernamen ein. Der Benutzername steht später in der Adresse der App, z. B. `felix-beispiel` → `felix-beispiel.github.io`.
3. Bestätige die E-Mail-Adresse über den Code bzw. Link, den GitHub dir schickt.
4. Fragen nach Team oder Plan kannst du überspringen. Der kostenlose Plan **Free** reicht.

### Schritt 2: Repository anlegen und Dateien hochladen
1. Oben rechts auf **+** → **New repository**.
2. **Repository name:** z. B. `dnd-tracker`.
3. **Public** auswählen. GitHub Pages ist im kostenlosen Plan nur mit öffentlichen Repositories möglich. Öffentlich ist nur der **Programmcode**, deine Kampagnendaten liegen geschützt bei Supabase.
4. Haken bei **Add a README file** setzen, dann **Create repository**.
5. Im neuen Repository: **Add file** → **Upload files**.
6. Entpacke die ZIP-Datei auf deinem PC. Öffne den Ordner `campaign-tracker` und ziehe **dessen Inhalt** (also `index.html`, `sw.js`, `manifest.webmanifest` und die Ordner `css`, `js`, `lib`, `icons`, `supabase` …) in das Upload-Feld im Browser. Ordner werden beim Ziehen mitgenommen.
   - Wichtig: `index.html` muss **direkt** im Repository liegen, nicht in einem Unterordner `campaign-tracker`.
   - Die vorhandene `README.md` darf überschrieben werden.
7. Unten auf **Commit changes** klicken.

### Schritt 3: GitHub Pages einschalten
1. Im Repository auf **Settings** (Zahnrad oben) → links **Pages**.
2. Unter **Build and deployment** → **Source**: **Deploy from a branch**.
3. **Branch**: `main` und Ordner `/ (root)` wählen → **Save**.
4. Nach 1–2 Minuten erscheint oben auf der Seite: *„Your site is live at https://…github.io/dnd-tracker/“*. Das ist die Adresse deiner App. **Notiere sie** und öffne sie zum Test.

Die App läuft jetzt schon, allerdings noch **nur lokal** (Anzeige oben „💾 Nur lokal“). Jetzt kommt die Synchronisierung.

---

## Teil 2: Supabase – Speicher in der Cloud

### Schritt 4: Supabase-Konto und Projekt anlegen
1. Öffne <https://supabase.com> → **Start your project**.
2. Melde dich am einfachsten mit **Continue with GitHub** an (das Konto aus Schritt 1).
   - **Wichtig:** Die Login-Mails der App gehen über den kostenlosen Mailversand von Supabase. Der schickt nur an E-Mail-Adressen von Mitgliedern deiner Supabase-Organisation, also an die Adresse deines Supabase-Kontos. Melde dich in der App später **mit genau dieser Adresse** an.
3. Lege eine Organisation an (Name egal, Plan **Free**).
4. **New project**:
   - **Name:** z. B. `dnd-tracker`
   - **Database Password:** auf **Generate a password** klicken und sicher aufbewahren. Die App braucht es nicht.
   - **Region:** *Central EU (Frankfurt)*
   - **Create new project**, dann 1–2 Minuten warten.

### Schritt 5: Tabelle und Zugriffsregeln anlegen
1. Links im Menü **SQL Editor** öffnen → **New query** (bzw. **+**).
2. Öffne aus der ZIP-Datei die Datei `supabase/setup.sql`, kopiere den **gesamten** Inhalt und füge ihn ein.
3. Auf **Run** klicken. Unten sollte *„Success. No rows returned“* stehen.

Damit gibt es eine Tabelle `campaign_state` mit einer Zeile pro Konto. Row Level Security ist eingeschaltet: Jedes Konto darf nur seine eigene Zeile lesen und schreiben, nicht angemeldete Besucher dürfen gar nichts.

### Schritt 6: Login einstellen (nur du)
1. **Adresse der App eintragen:** links **Authentication** → **URL Configuration**.
   - **Site URL:** deine App-Adresse aus Schritt 3, z. B. `https://felix-beispiel.github.io/dnd-tracker/` → **Save**.
   - Unter **Redirect URLs** → **Add URL** → dieselbe Adresse noch einmal eintragen → speichern.
2. **Dein Konto anlegen:** **Authentication** → **Users** → **Add user** → **Create new user**.
   - E-Mail: **deine** Adresse (dieselbe wie dein Supabase-Konto, siehe Schritt 4)
   - Passwort: irgendein langes Passwort, es wird nicht gebraucht
   - **Auto Confirm User** anhaken → **Create user**.
3. **Weitere Registrierungen abschalten:** **Authentication** → **Sign In / Providers** (je nach Version auch „Sign In / Up“ oder „Settings“) → Schalter **Allow new users to sign up** ausschalten → **Save**.
   Ab jetzt kann sich niemand mehr neu registrieren, nur dein Konto kann sich anmelden.
4. **Empfohlen: Code in der Login-Mail.** **Authentication** → **Emails** (bzw. **Email Templates**) → Vorlage **Magic Link**. Füge im Feld *Message body* zusätzlich diese Zeile ein → **Save**:
   ```html
   <p>Oder in der App diesen Code eingeben: <strong>{{ .Token }}</strong></p>
   ```
   So kannst du dich auch anmelden, wenn der Link im falschen Browser aufgeht (typisch, wenn die App als Symbol auf dem Handy-Home-Bildschirm liegt).

### Schritt 7: Zugangsdaten in die App eintragen
1. In Supabase links unten **Project Settings** (Zahnrad) → **API Keys**. Alternativ oben im Projekt auf **Connect**.
2. Du brauchst zwei Werte:
   - **Project URL**, z. B. `https://abcdefghijklmnop.supabase.co`
   - **Publishable key** (beginnt mit `sb_publishable_…`). Bei älteren Projekten heißt er **anon** / **public** (langer Text, beginnt mit `eyJ…`).
   Beide Werte sind **nicht geheim**, sie dürfen im Browser stehen. Den **secret**/**service_role**-Schlüssel dagegen **niemals** eintragen.
3. Auf GitHub in deinem Repository die Datei `js/config.js` öffnen → Stift-Symbol (**Edit this file**).
4. Die beiden Werte zwischen die Anführungszeichen setzen:
   ```js
   export const SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
   export const SUPABASE_KEY = 'sb_publishable_xxxxxxxxxxxxxxxx';
   ```
5. **Commit changes** (zweimal bestätigen). Nach etwa 1 Minute ist die Änderung online.

---

## Teil 3: Geräte verbinden

### Schritt 8: Erste Anmeldung am PC
1. Öffne deine App-Adresse und lade die Seite einmal neu. Oben steht jetzt **☁ Anmelden**.
2. **Hast du die App schon vorher lokal benutzt** (z. B. über `localhost`)? Dann liegen deine bisherigen Daten in **jenem** Browser unter **jener** Adresse. Öffne dort einmal **⭳ Export** und hier danach **⭱ Import**. Am besten machst du das vor dem Anmelden.
3. Auf **☁ Anmelden** tippen → E-Mail-Adresse eingeben → **Login-Link senden**.
4. In der Mail auf den Link klicken **oder** den Code in der App eingeben → **Code bestätigen**.
5. Oben steht nach wenigen Sekunden **✓ Gespeichert**. Dein Kampagnenstand liegt jetzt in der Cloud.

### Schritt 9: Handy
1. App-Adresse im Handy-Browser öffnen → **☁ Anmelden** → Code aus der Mail eingeben.
2. Ein leeres Gerät übernimmt den Cloud-Stand automatisch.
3. Optional als App-Symbol:
   - **iPhone (Safari):** Teilen-Knopf → **Zum Home-Bildschirm**
   - **Android (Chrome):** Menü ⋮ → **App installieren** bzw. **Zum Startbildschirm hinzufügen**

   Das Symbol hat einen eigenen Speicher, du musst dich darin **noch einmal anmelden**, am besten per Code.

Die Anmeldung bleibt auf jedem Gerät gespeichert. Neu anmelden musst du dich nur nach dem Abmelden oder wenn du die Browserdaten löschst.

> **Mail-Limit:** Der kostenlose Mailversand von Supabase schickt nur wenige Login-Mails pro Stunde (aktuell 2). Kommt keine Mail, warte etwas, bevor du es erneut versuchst.

---

## So funktioniert der Alltag

### Statusanzeige oben
| Anzeige | Bedeutung |
|---|---|
| ✓ Gespeichert | Alles ist in der Cloud. |
| ● Ungesichert / ⟳ Speichert… | Eine Änderung wird gleich bzw. gerade hochgeladen (ca. 1,5 s nach der letzten Eingabe). |
| ⚠ Offline | Keine Verbindung (oder Supabase-Projekt pausiert). Alles wird lokal gespeichert und später automatisch nachgeholt. |
| ☁ Anmelden | Auf diesem Gerät nicht angemeldet. Änderungen bleiben lokal. |
| ⚠ Konflikt | Es muss entschieden werden, welcher Stand gilt (siehe unten). |
| 💾 Nur lokal | Keine Cloud eingerichtet (`js/config.js` leer). |

Ein Tipp auf die Anzeige öffnet das Sync-Menü mit **Jetzt synchronisieren**, **Abmelden** und gegebenenfalls einer **Sicherung** zum Herunterladen.

### Wechsel zwischen Handy und PC
Beim Öffnen der App und beim Zurückwechseln in den Browser-Tab lädt die App automatisch den neuesten Stand aus der Cloud. Du kannst also am PC vorbereiten und am Tisch mit dem Handy weitermachen.

### Konflikte
Ein Konflikt entsteht nur, wenn **beide** Geräte seit dem letzten Abgleich geändert wurden, z. B. das Handy offline und gleichzeitig der PC online.
- **Deine lokale Änderung ist neuer:** Sie gewinnt automatisch (der letzte Stand zählt).
- **Die Cloud-Version ist neuer:** Die App **warnt** dich und fragt, welcher Stand gelten soll.

In beiden Fällen wird der verworfene Stand als **Sicherung** aufgehoben. Du kannst ihn im Sync-Menü herunterladen und bei Bedarf über **⭱ Import** zurückholen.

### Backups
**⭳ Export** speichert weiterhin alles (Charaktere, Monster, Encounter, Story) in einer JSON-Datei. Mach das ab und zu, z. B. nach jeder Sitzung, als zusätzliche Sicherung.

---

## Supabase-Projekt nach einer Pause wieder aktivieren

Kostenlose Supabase-Projekte werden **pausiert, wenn sie 7 Tage lang kaum benutzt wurden**. Etwa eine Woche vorher kommt eine Warnmail.
- **Während der Pause** funktioniert die App weiter, sie zeigt **⚠ Offline** und speichert lokal.
- **Reaktivieren:**
  1. <https://supabase.com/dashboard> öffnen und anmelden.
  2. Organisation und dann das pausierte Projekt auswählen.
  3. Auf **Resume project** (bzw. **Restore project**) klicken und bestätigen.
  4. Ein paar Minuten warten, bis das Projekt wieder läuft.
  5. In der App auf die Statusanzeige tippen → **Jetzt synchronisieren**.
- Daten und Einstellungen bleiben bei der Pause erhalten. Ein pausiertes Projekt lässt sich laut Supabase für längere Zeit wiederherstellen (die Doku nennt hier 90 Tage bzw. 1 Jahr). Verlass dich trotzdem nicht darauf und exportiere ab und zu.
- **Vorbeugen:** Wenn du die App mindestens einmal pro Woche öffnest, wird das Projekt normalerweise nicht pausiert. Auch ein Besuch im Supabase-Dashboard nach der Warnmail reicht.

---

## Updates der App einspielen
Bei einer neuen Version die geänderten Dateien wie in Schritt 2 hochladen (**Add file** → **Upload files**, gleichnamige Dateien werden ersetzt). Die Datei `js/config.js` dabei **nicht** überschreiben, sonst sind deine Zugangsdaten weg. Die App holt sich online automatisch die neueste Version, gegebenenfalls die Seite einmal neu laden.

## Fehlerbehebung
- **„Für diese E-Mail-Adresse gibt es kein Konto“:** Den Benutzer in Schritt 6.2 anlegen, mit genau dieser Adresse.
- **„Email address not authorized“ oder es kommt keine Mail:** Die Adresse muss zu deinem Supabase-Konto bzw. deiner Organisation gehören (Schritt 4). Mail-Limit beachten, auch den Spam-Ordner prüfen.
- **Der Link in der Mail öffnet `localhost` oder eine falsche Seite:** **Site URL** und **Redirect URLs** in Schritt 6.1 prüfen (genau die Pages-Adresse mit `/` am Ende).
- **Dauerhaft „⚠ Offline“, obwohl Internet da ist:** Projekt pausiert (siehe oben) oder Tippfehler in `js/config.js`.
- **Die App zeigt nach einem Update noch die alte Version:** Seite neu laden. Hilft das nicht, den Tab schließen und neu öffnen.
