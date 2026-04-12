# IfDAU – Institut für Digitale Arbeitsunterweisungen

Eine vollständige Web-App für digitale Arbeitsunterweisungen mit Quiz, Zertifikatsgenerierung und automatischen E-Mail-Erinnerungen.

## Technischer Stack

- **Backend**: Node.js + Express.js
- **Datenbank**: MySQL
- **Frontend**: HTML, CSS, JavaScript (EJS Templates)
- **PDF**: PDFKit
- **E-Mail**: Nodemailer
- **Authentication**: express-session + bcrypt

---

## Voraussetzungen

- Node.js >= 16
- MySQL >= 5.7 oder MariaDB >= 10.3
- npm

---

## Installation

### 1. Repository klonen / Dateien kopieren

```bash
cd /pfad/zum/projekt/ifdau
```

### 2. Abhängigkeiten installieren

```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren

Kopieren Sie `.env.example` nach `.env` und passen Sie die Werte an:

```bash
cp .env.example .env
```

Bearbeiten Sie `.env`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=IhrPasswort
DB_NAME=ifdau
PORT=3000
SESSION_SECRET=ein-langer-zufaelliger-string

MAIL_HOST=smtp.ihr-anbieter.de
MAIL_PORT=587
MAIL_USER=noreply@ifdau.de
MAIL_PASS=mail-passwort
MAIL_FROM=IfDAU <noreply@ifdau.de>
```

> **Hinweis**: Die MySQL-Datenbank wird beim ersten Start automatisch erstellt. Der DB-User benötigt `CREATE DATABASE`-Rechte oder die Datenbank muss bereits existieren.

### 4. App starten

```bash
npm start
```

Beim ersten Start werden automatisch:
- Alle Tabellen erstellt
- Ein Admin-Account angelegt: `admin@ifdau.de` / `Admin2026!`
- 6 Kategorien angelegt (Arbeitsschutz, Brandschutz, Datenschutz, AGG, Fremdfirmen, Infektionsschutz)
- Eine Beispiel-Unterweisung "Allgemeine Arbeitsschutzunterweisung" mit 5 Fragen

Die App ist dann erreichbar unter: **http://localhost:3000**

### 5. Entwicklungsmodus (automatischer Neustart)

```bash
npm run dev
```

---

## Standard-Zugangsdaten

| Rolle | E-Mail | Passwort |
|-------|--------|----------|
| Admin | admin@ifdau.de | Admin2026! |

**Bitte ändern Sie das Passwort nach dem ersten Login!**

---

## Funktionsübersicht

### Mitarbeiter-Bereich

- **Login** mit E-Mail und Passwort
- **Dashboard** mit Fortschrittsübersicht und Unterweisungs-Liste
- **Meine Unterweisungen** – alle zugewiesenen Unterweisungen mit Status
- **Unterweisung lesen** – Lerninhalt mit Lesefortschritts-Balken
- **Quiz / Lernerfolgskontrolle** – Single & Multiple Choice, Frage für Frage
- **Ergebnis** – Sofortige Auswertung mit Zertifikat-Download
- **Meine Zertifikate** – alle bestandenen Zertifikate als PDF

### Admin-Bereich

- **Dashboard** – Übersicht aller KPIs
- **Unterweisungen** – CRUD mit Rich-Text-Editor (Quill.js) und dynamischem Fragebogen-Builder
- **Mitarbeiter** – CRUD, CSV-Import, Aktivieren/Deaktivieren
- **Zuweisungen** – Zuweisung an Einzelpersonen, Abteilungen oder alle Mitarbeiter
- **Auswertungen** – Statusübersicht mit CSV-Export
- **Kategorien** – Kategorie-Verwaltung
- **Erinnerungen** – Übersicht aller versendeten E-Mail-Erinnerungen

---

## CSV-Import Format (Mitarbeiter)

```csv
name,email,abteilung,position,role,password
Max Mustermann,max@firma.de,Produktion,Mitarbeiter,mitarbeiter,Sicheres123!
Anna Admin,anna@firma.de,IT,Administratorin,admin,Admin2026!
```

Felder `password`, `role`, `abteilung`, `position` sind optional.  
Standard-Passwort wenn nicht angegeben: `Passwort123!`

---

## Datenbank-Schema

```
users           – Benutzer (admin/mitarbeiter)
categories      – Unterweisungskategorien
trainings       – Unterweisungen mit Inhalt
questions       – Fragen (single/multiple choice)
answers         – Antworten mit is_correct-Flag
assignments     – Zuweisungen (Unterweisung ↔ Mitarbeiter)
results         – Quiz-Ergebnisse
certificates    – Ausgestellte Zertifikate (mit PDF-Pfad)
reminders       – Versendete E-Mail-Erinnerungen
```

---

## E-Mail-Erinnerungen

Das System prüft **stündlich** auf fällige Zuweisungen und sendet automatisch eine E-Mail an Mitarbeiter, deren Unterweisung in **7 Tagen** fällig ist.

Für den Test-Betrieb ohne SMTP-Server können Sie `MAIL_HOST` auf einen lokalen Mail-Catcher wie [MailHog](https://github.com/mailhog/MailHog) zeigen:

```env
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_USER=
MAIL_PASS=
```

---

## PDF-Zertifikate

Zertifikate werden automatisch nach dem Bestehen eines Quiz generiert und unter `public/uploads/certificates/` gespeichert. Mitarbeiter können sie direkt herunterladen.

---

## Sicherheitshinweise für Produktion

1. Starkes `SESSION_SECRET` setzen (mind. 32 zufällige Zeichen)
2. `cookie.secure: true` in `app.js` setzen (HTTPS erforderlich)
3. Admin-Passwort ändern
4. MySQL-User mit minimalen Rechten verwenden
5. Firewall: nur Port 3000 (oder hinter Reverse-Proxy wie nginx)
6. Regelmäßige Datenbank-Backups einrichten

---

## Projektstruktur

```
ifdau/
├── app.js                  # Einstiegspunkt
├── .env                    # Umgebungsvariablen (nicht committen!)
├── .env.example            # Vorlage
├── package.json
├── db/
│   ├── connection.js       # MySQL Connection Pool
│   └── init.js             # Tabellen + Seed-Daten
├── middleware/
│   └── auth.js             # isAuthenticated, isAdmin
├── utils/
│   ├── pdf.js              # PDF-Zertifikat-Generierung (PDFKit)
│   ├── mail.js             # E-Mail-Versand (Nodemailer)
│   └── reminders.js        # Automatische Erinnerungen
├── routes/
│   ├── auth.js             # Login, Logout, Passwort vergessen
│   ├── user.js             # Mitarbeiter-Routen
│   └── admin.js            # Admin-Routen
├── public/
│   ├── css/style.css       # Stylesheet
│   ├── js/main.js          # Client-seitiges JS
│   └── uploads/
│       └── certificates/   # Generierte PDF-Zertifikate
└── views/
    ├── partials/           # EJS-Partials (head, sidebar, topbar)
    ├── auth/               # Login, Passwort vergessen
    ├── user/               # Mitarbeiter-Views
    └── admin/              # Admin-Views
```

---

© 2026 IfDAU – Institut für Digitale Arbeitsunterweisungen
