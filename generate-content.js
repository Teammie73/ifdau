#!/usr/bin/env node
/**
 * generate-content.js
 * Generiert HTML-Unterweisungsinhalte via Claude API für alle
 * Unterweisungen mit leerem oder NULL content.
 *
 * Verwendung:
 *   ANTHROPIC_API_KEY=sk-... node generate-content.js
 *   oder ANTHROPIC_API_KEY in .env hinterlegen
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const mysql = require('mysql2/promise');

// ── Konfiguration ────────────────────────────────────────────
const DELAY_MS   = 3000;  // Pause zwischen API-Anfragen
const MAX_TOKENS = 2000;
const MODEL      = 'claude-sonnet-4-20250514';

// ── Hilfsfunktionen ──────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPrompt(title) {
  return `Du bist Experte für Arbeitssicherheit in Deutschland.
Erstelle einen professionellen Unterweisungsinhalt auf Deutsch für das Thema: ${title}

Struktur als HTML:
- <h2>Einleitung</h2> mit Zweck der Unterweisung
- <h2>Rechtsgrundlagen</h2> mit relevanten deutschen Gesetzen
- <h2>Hauptinhalt</h2> mit 3-4 Unterkapiteln (<h3>)
- <h2>Wichtige Regeln</h2> als <ul> Liste
- <h2>Zusammenfassung</h2>

Nur HTML ausgeben, kein Markdown, keine Erklärungen.`;
}

// ── Hauptprogramm ────────────────────────────────────────────
async function main() {
  // API-Key prüfen
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Fehler: ANTHROPIC_API_KEY ist nicht gesetzt.');
    console.error('Setze die Variable in .env oder als Umgebungsvariable.');
    process.exit(1);
  }

  // DB-Verbindung aufbauen
  let db;
  try {
    db = await mysql.createConnection({
      host:     process.env.DB_HOST,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    console.log('Datenbankverbindung hergestellt.');
  } catch (err) {
    console.error('Datenbankfehler:', err.message);
    process.exit(1);
  }

  // Unterweisungen ohne Inhalt laden
  const [rows] = await db.query(
    `SELECT id, title FROM trainings
     WHERE content IS NULL OR TRIM(content) = ''
     ORDER BY id ASC`
  );

  if (rows.length === 0) {
    console.log('Alle Unterweisungen haben bereits Inhalt. Nichts zu tun.');
    await db.end();
    return;
  }

  console.log(`${rows.length} Unterweisung(en) ohne Inhalt gefunden.\n`);

  const anthropic = new Anthropic({ apiKey });

  for (let i = 0; i < rows.length; i++) {
    const { id, title } = rows[i];
    console.log(`[${i + 1}/${rows.length}] Generiere: ${title}`);

    try {
      const message = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'user', content: buildPrompt(title) }
        ],
      });

      const html = message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      await db.query(
        'UPDATE trainings SET content = ? WHERE id = ?',
        [html, id]
      );

      console.log(`  ✓ Gespeichert (${html.length} Zeichen)`);

    } catch (err) {
      console.error(`  ✗ Fehler bei "${title}": ${err.message}`);
    }

    // Pause vor der nächsten Anfrage (außer nach dem letzten Element)
    if (i < rows.length - 1) {
      process.stdout.write(`  … warte ${DELAY_MS / 1000}s\n`);
      await sleep(DELAY_MS);
    }
  }

  await db.end();
  console.log('\nFertig! Alle Unterweisungen wurden verarbeitet.');
}

main().catch(err => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
