#!/usr/bin/env node
/**
 * generate-questions.js
 * Generiert Multiple-Choice-Fragen via Claude API für alle
 * Unterweisungen mit Inhalt aber noch ohne Fragen.
 *
 * Verwendung:
 *   node generate-questions.js
 *   (ANTHROPIC_API_KEY und DB-Variablen müssen in .env stehen)
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const mysql = require('mysql2/promise');

// ── Konfiguration ────────────────────────────────────────────
const DELAY_MS    = 3000;
const MAX_TOKENS  = 4000;
const MODEL       = 'claude-sonnet-4-20250514';
const CONTENT_MAX = 2000; // Zeichen des Inhalts die an die API gesendet werden

// ── Hilfsfunktionen ──────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildPrompt(title, content) {
  const excerpt = content.slice(0, CONTENT_MAX);
  return `Du bist Experte für Arbeitssicherheit in Deutschland.
Erstelle 5 Multiple-Choice-Kontrollfragen auf Deutsch für die Unterweisung: ${title}
Basierend auf diesem Inhalt: ${excerpt}

Antworte NUR als JSON ohne Markdown-Formatierung:
[
  {
    "question": "Fragetext",
    "type": "single",
    "answers": [
      { "text": "Antworttext", "correct": true },
      { "text": "Antworttext", "correct": false },
      { "text": "Antworttext", "correct": false },
      { "text": "Antworttext", "correct": false },
      { "text": "Antworttext", "correct": false },
      { "text": "Antworttext", "correct": false }
    ]
  }
]

Regeln:
- Genau 5 Fragen pro Unterweisung
- Jede Frage hat genau 6 Antworten
- Manche Fragen haben 1 richtige Antwort (type: "single")
- Manche Fragen haben 2 richtige Antworten (type: "multiple")
- Maximal 2 richtige Antworten pro Frage
- Fragen beziehen sich auf den konkreten Inhalt
- Praxisrelevante, realistische Fragen
- Abwechslungsreich: mix aus single und multiple`;
}

function parseJson(raw) {
  // Markdown-Codeblöcke entfernen, falls die API sie trotzdem liefert
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length !== 5) {
    throw new Error(`Erwartet 5 Fragen, erhalten: ${Array.isArray(questions) ? questions.length : typeof questions}`);
  }
  for (const [i, q] of questions.entries()) {
    if (!q.question || !['single', 'multiple'].includes(q.type) || !Array.isArray(q.answers)) {
      throw new Error(`Frage ${i + 1} hat ungültiges Format`);
    }
    if (q.answers.length !== 6) {
      throw new Error(`Frage ${i + 1} hat ${q.answers.length} Antworten (erwartet 6)`);
    }
    const correctCount = q.answers.filter(a => a.correct).length;
    if (correctCount < 1 || correctCount > 2) {
      throw new Error(`Frage ${i + 1} hat ${correctCount} richtige Antworten (erlaubt: 1–2)`);
    }
    if (q.type === 'single' && correctCount !== 1) {
      throw new Error(`Frage ${i + 1}: type "single" aber ${correctCount} richtige Antworten`);
    }
    if (q.type === 'multiple' && correctCount !== 2) {
      throw new Error(`Frage ${i + 1}: type "multiple" aber ${correctCount} richtige Antworten`);
    }
  }
}

// ── Hauptprogramm ────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Fehler: ANTHROPIC_API_KEY ist nicht gesetzt.');
    process.exit(1);
  }

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

  // Unterweisungen mit Inhalt aber ohne Fragen
  const [rows] = await db.query(`
    SELECT t.id, t.title, t.content
    FROM trainings t
    WHERE t.content IS NOT NULL
      AND TRIM(t.content) != ''
      AND NOT EXISTS (
        SELECT 1 FROM questions q WHERE q.training_id = t.id
      )
    ORDER BY t.id ASC
  `);

  if (rows.length === 0) {
    console.log('Alle Unterweisungen haben bereits Fragen. Nichts zu tun.');
    await db.end();
    return;
  }

  console.log(`${rows.length} Unterweisung(en) ohne Fragen gefunden.\n`);

  const anthropic = new Anthropic({ apiKey });

  for (let i = 0; i < rows.length; i++) {
    const { id, title, content } = rows[i];
    console.log(`[${i + 1}/${rows.length}] Generiere Fragen für: ${title}`);

    try {
      const message = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildPrompt(title, content) }],
      });

      const raw = message.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      const questions = parseJson(raw);
      validateQuestions(questions);

      // In DB speichern
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];

        const [qRes] = await db.query(
          'INSERT INTO questions (training_id, question_text, type, sort_order) VALUES (?, ?, ?, ?)',
          [id, q.question, q.type, qi + 1]
        );

        for (const a of q.answers) {
          await db.query(
            'INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)',
            [qRes.insertId, a.text, a.correct ? 1 : 0]
          );
        }
      }

      console.log(`  ✓ ${questions.length} Fragen gespeichert`);

    } catch (err) {
      console.error(`  ✗ Fehler bei "${title}": ${err.message}`);
    }

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
