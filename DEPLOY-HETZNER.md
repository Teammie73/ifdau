# IfDAU – Vollständige Deployment-Anleitung für Hetzner

> **Ziel:** Die IfDAU-App läuft nach dieser Anleitung dauerhaft und automatisch
> auf einem Hetzner Cloud Server, erreichbar unter Ihrer Domain mit HTTPS.

---

## Inhaltsverzeichnis

1. [Welches Hetzner-Produkt brauche ich?](#1-welches-hetzner-produkt-brauche-ich)
2. [Hetzner Cloud Server erstellen](#2-hetzner-cloud-server-erstellen)
3. [Domain auf Server zeigen lassen](#3-domain-auf-server-zeigen-lassen)
4. [SSH-Verbindung herstellen](#4-ssh-verbindung-herstellen)
5. [Server einrichten (einmalig)](#5-server-einrichten-einmalig)
6. [Node.js installieren](#6-nodejs-installieren)
7. [Dateien hochladen via FileZilla (SFTP)](#7-dateien-hochladen-via-filezilla-sftp)
8. [.env Datei konfigurieren](#8-env-datei-konfigurieren)
9. [App-Abhängigkeiten installieren](#9-app-abhängigkeiten-installieren)
10. [App mit PM2 dauerhaft starten](#10-app-mit-pm2-dauerhaft-starten)
11. [Nginx als Reverse Proxy](#11-nginx-als-reverse-proxy)
12. [HTTPS / SSL-Zertifikat (kostenlos)](#12-https--ssl-zertifikat-kostenlos)
13. [Firewall aktivieren](#13-firewall-aktivieren)
14. [App testen](#14-app-testen)
15. [Updates einspielen](#15-updates-einspielen)
16. [Troubleshooting](#16-troubleshooting)
17. [Alle Befehle auf einen Blick](#17-alle-befehle-auf-einen-blick)

---

## 1. Welches Hetzner-Produkt brauche ich?

Node.js läuft **nicht** auf normalem PHP-Webhosting.
Sie benötigen einen **Cloud Server** oder **VPS**.

| Produkt | Node.js | Empfehlung |
|---|---|---|
| Webhosting (PHP) | ✗ Nein | Nicht geeignet |
| Cloud Server CX22 | ✓ Ja | **Empfohlen – ab ~4,50 €/Monat** |
| Cloud Server CX32 | ✓ Ja | Bei mehr Nutzern |
| VPS / Managed Server | ✓ Ja | Auch geeignet |

> Ihre **MySQL-Datenbank** bei Hetzner (`l23y.your-database.de`) bleibt
> wie sie ist – der Cloud Server verbindet sich damit von außen.

---

## 2. Hetzner Cloud Server erstellen

### 2.1 Hetzner Cloud Console öffnen

1. Gehen Sie zu **[console.hetzner.cloud](https://console.hetzner.cloud)**
2. Melden Sie sich mit Ihrem Hetzner-Konto an
3. Klicken Sie auf **„Neues Projekt"** → Namen eingeben (z. B. `ifdau`) → **Erstellen**

### 2.2 Server hinzufügen

1. Im Projekt auf **„Server hinzufügen"** klicken
2. Einstellungen:

   | Option | Wahl |
   |---|---|
   | **Standort** | Nürnberg oder Falkenstein (Deutschland) |
   | **Betriebssystem** | Ubuntu 24.04 |
   | **Typ** | Shared vCPU → **CX22** (2 vCPU, 4 GB RAM) |
   | **Networking** | IPv4 aktiviert lassen |
   | **SSH-Key** | Jetzt einrichten (siehe 2.3) |
   | **Name** | `ifdau-server` |

3. Auf **„Server kaufen"** klicken → Server wird in ~30 Sekunden erstellt

### 2.3 SSH-Key einrichten (sicherer als Passwort)

**Auf Ihrem Mac/PC im Terminal:**
```bash
# SSH-Key generieren (falls noch keiner vorhanden)
ssh-keygen -t ed25519 -C "ifdau-hetzner"
# → Enter drücken (Standard-Pfad übernehmen)
# → Passwort optional, kann leer bleiben

# Öffentlichen Key anzeigen und kopieren
cat ~/.ssh/id_ed25519.pub
```

Den angezeigten Text (beginnt mit `ssh-ed25519 ...`) komplett kopieren.

**In der Hetzner Console:**
1. Links auf **„SSH-Keys"** klicken → **„SSH-Key hinzufügen"**
2. Kopierten Key einfügen → Name vergeben → Speichern
3. Beim Server-Erstellen diesen Key auswählen

> Falls Sie keinen SSH-Key einrichten: Hetzner schickt das Root-Passwort per E-Mail.

### 2.4 Server-IP notieren

Nach dem Erstellen sehen Sie die **öffentliche IP-Adresse** des Servers (z. B. `65.21.123.45`).
Diese brauchen Sie für alle folgenden Schritte.

---

## 3. Domain auf Server zeigen lassen

Damit `ifdau.ihre-domain.de` auf Ihren Server zeigt:

### Bei Hetzner DNS (falls Domain bei Hetzner):
1. Console → **„DNS"** → Ihre Domain wählen
2. **„Record hinzufügen"** → Typ: `A`
3. Name: `@` (für nackte Domain) oder `ifdau` (für Subdomain)
4. Wert: **Ihre Server-IP**
5. Speichern

### Bei externem DNS-Anbieter (z. B. INWX, Strato, All-Inkl):
- Typ: `A-Record`
- Host: `@` oder `ifdau`
- Ziel: Ihre Server-IP
- TTL: 300

> DNS-Änderungen brauchen bis zu **24 Stunden** bis sie weltweit aktiv sind.
> Meist geht es aber schon nach wenigen Minuten.

---

## 4. SSH-Verbindung herstellen

### Mac / Linux – Terminal:
```bash
ssh root@IHRE-SERVER-IP
# Beispiel:
ssh root@65.21.123.45
```

Beim ersten Verbinden erscheint:
```
The authenticity of host '65.21.123.45' can't be established.
Are you sure you want to continue connecting? yes
```
→ `yes` eingeben und Enter drücken.

### Windows – Zwei Optionen:

**Option A: Windows Terminal / PowerShell** (Windows 10/11)
```powershell
ssh root@65.21.123.45
```

**Option B: PuTTY** (ältere Windows-Versionen)
1. PuTTY herunterladen: [putty.org](https://putty.org)
2. Öffnen → Host Name: `65.21.123.45` → Port: `22` → Open
3. Login: `root` → Passwort eingeben

---

## 5. Server einrichten (einmalig)

Nach dem ersten Login den Server aktualisieren:

```bash
# System aktualisieren
apt update && apt upgrade -y

# Notwendige Basis-Tools installieren
apt install -y curl wget git nano unzip ufw

# Zeitzone auf Deutschland setzen
timedatectl set-timezone Europe/Berlin

# Prüfen
date    # → sollte deutsche Uhrzeit zeigen
```

---

## 6. Node.js installieren

```bash
# Node.js 20 LTS via NodeSource installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Versionen prüfen
node --version    # → v20.x.x
npm --version     # → 10.x.x

# PM2 global installieren (Prozess-Manager)
npm install -g pm2

# Nginx installieren (Webserver / Reverse Proxy)
apt-get install -y nginx

# Nginx starten und für Autostart aktivieren
systemctl start nginx
systemctl enable nginx

# Prüfen
systemctl status nginx    # → active (running)
```

---

## 7. Dateien hochladen via FileZilla (SFTP)

### 7.1 FileZilla installieren und einrichten

1. FileZilla herunterladen: **[filezilla-project.org](https://filezilla-project.org/)** → kostenlos
2. FileZilla öffnen
3. Oben: **Datei → Servermanager** (oder `Strg+S`)
4. Klick auf **„Neuer Server"**

Zugangsdaten eingeben:

| Feld | Wert |
|---|---|
| Protokoll | **SFTP – SSH File Transfer Protocol** |
| Server | `65.21.123.45` (Ihre IP) |
| Port | `22` |
| Anmeldeart | **Normal** |
| Benutzer | `root` |
| Passwort | Ihr SSH-Passwort (oder leer bei SSH-Key) |

Bei SSH-Key: Anmeldeart → **„Schlüsseldatei"** → `~/.ssh/id_ed25519` auswählen.

5. Klick auf **„Verbinden"**
6. Sicherheitswarnung → **„OK"** (Fingerprint bestätigen)

### 7.2 Zielordner auf dem Server erstellen

Im rechten Bereich (Server-Seite):
1. Zu `/var/www/` navigieren
2. Rechtsklick → **„Verzeichnis erstellen"** → `ifdau` → OK
3. In `/var/www/ifdau/` hineinklicken

### 7.3 Projektdateien hochladen

Im linken Bereich (Ihr Computer):
1. Zum IfDAU-Projektordner navigieren
2. Alle Dateien und Ordner markieren (**außer** `node_modules` – dieser wird auf dem Server neu erstellt)

**Zu übertragende Dateien/Ordner:**
```
✓ app.js
✓ package.json
✓ package-lock.json
✓ .env
✓ db/
✓ middleware/
✓ utils/
✓ routes/
✓ public/
✓ views/
✗ node_modules/      ← NICHT hochladen (zu groß, wird neu erstellt)
✗ .git/              ← NICHT hochladen
```

3. Markierte Dateien in den rechten Bereich ziehen (Drag & Drop)
4. Warten bis alle Dateien übertragen sind

> Tipp: Rechtsklick auf `node_modules` → **„Aus Warteschlange entfernen"**
> falls er versehentlich in der Warteschlange landet.

---

## 8. .env Datei konfigurieren

Nach dem Upload per SSH prüfen und ggf. anpassen:

```bash
# .env anzeigen
cat /var/www/ifdau/.env
```

Falls die Datei fehlt oder angepasst werden muss:
```bash
nano /var/www/ifdau/.env
```

Inhalt (Ihre echten Werte eintragen):
```env
DB_HOST=l23y.your-database.de
DB_USER=a6pcny_0_w
DB_PASSWORD=x2%F:vKk1::N
DB_NAME=a6pcny_db0
PORT=3000
SESSION_SECRET=ifdauDamian041104!2026

MAIL_HOST=mail.your-server.de
MAIL_PORT=587
MAIL_USER=info@ifdau.de
MAIL_PASS=Damian041104!2026
MAIL_FROM=IfDAU <info@ifdau.de>

APP_URL=https://ihre-domain.de
```

Speichern: `Strg+O` → Enter → `Strg+X`

### Datenbankverbindung testen

```bash
cd /var/www/ifdau
npm install --production 2>/dev/null | tail -1

node -e "
require('dotenv').config();
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}).then(c => { console.log('✓ Datenbank verbunden'); c.end(); })
  .catch(e => console.error('✗ Fehler:', e.message));
"
```

Erwartete Ausgabe: `✓ Datenbank verbunden`

---

## 9. App-Abhängigkeiten installieren

```bash
cd /var/www/ifdau

# Pakete installieren (nur Produktions-Abhängigkeiten)
npm install --production

# Ausgabe sollte enden mit:
# added XXX packages in Xs
```

---

## 10. App mit PM2 dauerhaft starten

PM2 ist ein Prozess-Manager: Er startet die App automatisch neu
wenn sie abstürzt oder der Server neu gestartet wird.

```bash
cd /var/www/ifdau

# App starten
pm2 start app.js --name "ifdau"

# Status prüfen – sollte "online" zeigen
pm2 status
```

Erwartete Ausgabe:
```
┌────┬──────────┬─────────────┬─────────┬─────────┬──────────┐
│ id │ name     │ status      │ cpu     │ mem     │ uptime   │
├────┼──────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0  │ ifdau    │ online      │ 0%      │ 45mb    │ 5s       │
└────┴──────────┴─────────────┴─────────┴─────────┴──────────┘
```

```bash
# Logs anzeigen (Strg+C zum Beenden)
pm2 logs ifdau

# PM2 so einrichten, dass es beim Server-Neustart automatisch startet
pm2 startup
```

Nach `pm2 startup` erscheint ein langer Befehl, der mit `sudo env PATH=...` beginnt.
**Diesen Befehl kopieren und ausführen!** Danach:

```bash
# Aktuellen Zustand speichern
pm2 save

# Testen: App direkt ansprechen
curl http://localhost:3000
# → Sollte HTML zurückgeben (kein Fehler)
```

**PM2 Befehle – Referenz:**
```bash
pm2 status              # Alle Apps anzeigen
pm2 logs ifdau          # Live-Logs (Strg+C zum Beenden)
pm2 logs ifdau --lines 50  # Letzte 50 Zeilen
pm2 restart ifdau       # App neu starten
pm2 stop ifdau          # App stoppen
pm2 delete ifdau        # App aus PM2 entfernen
pm2 monit               # Live-Dashboard (CPU, RAM)
```

---

## 11. Nginx als Reverse Proxy

Die App läuft auf Port 3000 – von außen nicht direkt erreichbar.
Nginx nimmt Anfragen auf Port 80/443 entgegen und leitet sie weiter.

```bash
# Standard-Seite deaktivieren
rm -f /etc/nginx/sites-enabled/default

# Neue Konfiguration erstellen
nano /etc/nginx/sites-available/ifdau
```

Folgenden Inhalt einfügen – **Domain anpassen!**

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ihre-domain.de www.ihre-domain.de;

    # Maximale Upload-Größe (für CSV-Import)
    client_max_body_size 10M;

    # Statische Dateien direkt ausliefern (schneller)
    location /css/ {
        root /var/www/ifdau/public;
        expires 7d;
        add_header Cache-Control "public";
    }
    location /js/ {
        root /var/www/ifdau/public;
        expires 7d;
        add_header Cache-Control "public";
    }
    location /uploads/ {
        root /var/www/ifdau/public;
        expires 1d;
    }

    # Alle anderen Anfragen an Node.js
    location / {
        proxy_pass          http://localhost:3000;
        proxy_http_version  1.1;
        proxy_set_header    Upgrade           $http_upgrade;
        proxy_set_header    Connection        'upgrade';
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto $scheme;
        proxy_cache_bypass  $http_upgrade;
        proxy_read_timeout  60s;
    }
}
```

Speichern: `Strg+O` → Enter → `Strg+X`

```bash
# Konfiguration aktivieren
ln -s /etc/nginx/sites-available/ifdau /etc/nginx/sites-enabled/

# Syntax prüfen
nginx -t
# → Ausgabe: syntax is ok / test is successful

# Nginx neu laden
systemctl reload nginx

# Testen (Domain ersetzen oder IP nutzen)
curl -I http://ihre-domain.de
# → HTTP/1.1 200 OK
```

---

## 12. HTTPS / SSL-Zertifikat (kostenlos)

Let's Encrypt stellt kostenlose SSL-Zertifikate aus.
Voraussetzung: Domain zeigt bereits auf die Server-IP (Schritt 3).

```bash
# Certbot installieren
apt-get install -y certbot python3-certbot-nginx

# Zertifikat ausstellen (Domain anpassen)
certbot --nginx -d ihre-domain.de -d www.ihre-domain.de
```

Certbot fragt nach:
1. **E-Mail-Adresse** → Für Ablaufbenachrichtigungen eingeben
2. **Nutzungsbedingungen** → `A` für Agree
3. **Newsletter** → `N`
4. **Weiterleitung** → `2` (Redirect HTTP → HTTPS empfohlen)

Fertig! Certbot passt die Nginx-Konfiguration automatisch an.

```bash
# Zertifikat testen
certbot renew --dry-run
# → Congratulations, all simulated renewals succeeded

# Automatische Erneuerung prüfen (läuft als Cron/Timer)
systemctl status certbot.timer
```

> Zertifikate laufen nach 90 Tagen ab und werden automatisch erneuert.

---

## 13. Firewall aktivieren

```bash
# Regeln setzen
ufw allow OpenSSH          # SSH-Zugang behalten
ufw allow 'Nginx Full'     # HTTP (80) + HTTPS (443)

# Firewall aktivieren
ufw --force enable

# Status prüfen
ufw status
```

Erwartete Ausgabe:
```
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
Nginx Full                 ALLOW       Anywhere
```

---

## 14. App testen

```bash
# 1. PM2-Status
pm2 status
# → ifdau: online

# 2. App intern erreichbar?
curl -s http://localhost:3000 | head -5
# → <!DOCTYPE html>...

# 3. Über Nginx erreichbar?
curl -I http://ihre-domain.de
# → HTTP/1.1 301 (Weiterleitung zu HTTPS)

curl -I https://ihre-domain.de
# → HTTP/2 200
```

Öffnen Sie nun **https://ihre-domain.de** im Browser.

Sie sollten die IfDAU Login-Seite sehen.

**Test-Login:**
- E-Mail: `admin@ifdau.de`
- Passwort: `Admin2026!`

---

## 15. Updates einspielen

Wenn Sie lokal Änderungen an der App gemacht haben:

### Variante A – Via FileZilla (einfach)

1. Geänderte Dateien in FileZilla hochladen (überschreiben)
2. Per SSH die App neu starten:
```bash
pm2 restart ifdau
pm2 logs ifdau --lines 20
```

### Variante B – Nur bestimmte Dateien aktualisieren

```bash
# Auf dem Server – falls package.json geändert:
cd /var/www/ifdau
npm install --production
pm2 restart ifdau
```

### Variante C – Komplettes Neudeployment

```bash
cd /var/www/ifdau

# App stoppen
pm2 stop ifdau

# Alte Dateien sichern (optional)
cp -r /var/www/ifdau /var/www/ifdau-backup-$(date +%Y%m%d)

# Neue Dateien hochladen (via FileZilla)
# ...dann...

# Abhängigkeiten aktualisieren
npm install --production

# App starten
pm2 start ifdau
pm2 logs ifdau --lines 30
```

---

## 16. Troubleshooting

### Problem: App startet nicht

```bash
# Logs anzeigen
pm2 logs ifdau --lines 100

# Häufige Ursachen:
# - .env fehlt oder hat falsche Werte
# - node_modules fehlt → npm install --production
# - Port 3000 belegt → lsof -i :3000
```

### Problem: „502 Bad Gateway" im Browser

```bash
# Ist die App überhaupt gestartet?
pm2 status

# Nginx-Fehlerlog
tail -20 /var/log/nginx/error.log

# App neu starten
pm2 restart ifdau
systemctl reload nginx
```

### Problem: Datenbankverbindung schlägt fehl

```bash
cd /var/www/ifdau
node -e "
require('dotenv').config();
const mysql = require('mysql2/promise');
mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}).then(c => { console.log('✓ OK'); c.end(); })
  .catch(e => console.error('✗', e.message));
"
```

Häufige Ursachen:
- Hetzner-Datenbank erlaubt nur Verbindungen vom eigenen Hosting-Netz
  → In Hetzner-Konsole prüfen ob externe Verbindungen erlaubt sind
- Passwort enthält Sonderzeichen → `.env` in Anführungszeichen setzen:
  `DB_PASSWORD="x2%F:vKk1::N"`

### Problem: SSL-Zertifikat schlägt fehl

```bash
# Domain zeigt noch nicht auf Server-IP?
nslookup ihre-domain.de
# → Sollte Ihre Server-IP zeigen

# Port 80 offen?
ufw status
curl http://ihre-domain.de
```

### Problem: PDF-Zertifikate werden nicht erstellt

```bash
# Schreibrechte prüfen
ls -la /var/www/ifdau/public/uploads/
# → Ordner muss beschreibbar sein

# Rechte setzen
chmod -R 755 /var/www/ifdau/public/uploads/certificates/
```

### Problem: App läuft nach Server-Neustart nicht

```bash
# PM2 Autostart erneut einrichten
pm2 startup
# → Angezeigten Befehl ausführen
pm2 save

# Testen
reboot
# → Nach 1 Minute: ssh root@IP → pm2 status
```

---

## 17. Alle Befehle auf einen Blick

Komplette Einrichtung von Null auf fertig (zum Kopieren):

```bash
# ══ 1. SYSTEM ══════════════════════════════════════════
apt update && apt upgrade -y
apt install -y curl wget nano unzip ufw
timedatectl set-timezone Europe/Berlin

# ══ 2. NODE.JS + TOOLS ═════════════════════════════════
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx
npm install -g pm2

# ══ 3. PROJEKTORDNER ═══════════════════════════════════
mkdir -p /var/www/ifdau/public/uploads/certificates
# → Jetzt Dateien per FileZilla hochladen →

# ══ 4. APP STARTEN ═════════════════════════════════════
cd /var/www/ifdau
npm install --production
pm2 start app.js --name "ifdau"
pm2 startup   # → angezeigten Befehl ausführen!
pm2 save

# ══ 5. NGINX ═══════════════════════════════════════════
rm -f /etc/nginx/sites-enabled/default
# → /etc/nginx/sites-available/ifdau erstellen (siehe Schritt 11)
ln -s /etc/nginx/sites-available/ifdau /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# ══ 6. SSL ═════════════════════════════════════════════
certbot --nginx -d ihre-domain.de -d www.ihre-domain.de

# ══ 7. FIREWALL ════════════════════════════════════════
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ══ 8. FERTIG ══════════════════════════════════════════
pm2 status
curl https://ihre-domain.de
```

---

## Monitoring & Wartung (laufender Betrieb)

```bash
# Live-Dashboard (CPU, RAM, Logs)
pm2 monit

# Festplattenplatz prüfen
df -h

# Arbeitsspeicher prüfen
free -h

# Server-Uptime
uptime

# Nginx-Zugriffslog (letzte Anfragen)
tail -f /var/log/nginx/access.log

# System-Updates einspielen
apt update && apt upgrade -y
```

---

## Checkliste – Deployment abgeschlossen ✓

- [ ] Hetzner Cloud Server (Ubuntu 24.04) erstellt
- [ ] SSH-Verbindung funktioniert
- [ ] Domain zeigt auf Server-IP
- [ ] Node.js 20 installiert
- [ ] Dateien per FileZilla hochgeladen
- [ ] `.env` konfiguriert und Datenbankverbindung getestet
- [ ] `npm install --production` ausgeführt
- [ ] PM2 startet App und überlebt Neustart
- [ ] Nginx konfiguriert und aktiv
- [ ] SSL-Zertifikat ausgestellt (HTTPS)
- [ ] Firewall aktiv
- [ ] Login unter `https://ihre-domain.de` funktioniert
- [ ] Admin-Passwort geändert (`admin@ifdau.de`)

---

*IfDAU – Institut für Digitale Arbeitsunterweisungen*  
*Deployment-Anleitung | Stand: 2026*
