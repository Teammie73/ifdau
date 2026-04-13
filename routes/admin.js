const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(isAuthenticated, isAdmin);

// ─── DASHBOARD ─────────────────────────────────────────────────────────────

router.get(['/', '/dashboard'], async (req, res) => {
  try {
    const [[{ total_users }]] = await pool.query("SELECT COUNT(*) as total_users FROM users WHERE role='mitarbeiter'");
    const [[{ total_trainings }]] = await pool.query("SELECT COUNT(*) as total_trainings FROM trainings WHERE status='active'");
    const [[{ total_assignments }]] = await pool.query('SELECT COUNT(*) as total_assignments FROM assignments');
    const [[{ completed }]] = await pool.query("SELECT COUNT(*) as completed FROM assignments WHERE status='passed'");
    const [[{ open }]] = await pool.query("SELECT COUNT(*) as open FROM assignments WHERE status='open'");
    const [[{ overdue }]] = await pool.query("SELECT COUNT(*) as overdue FROM assignments WHERE status='overdue'");
    const [recent] = await pool.query(`
      SELECT a.*, u.name as user_name, t.title as training_title
      FROM assignments a JOIN users u ON u.id=a.user_id JOIN trainings t ON t.id=a.training_id
      ORDER BY a.assigned_at DESC LIMIT 5
    `);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { total_users, total_trainings, total_assignments, completed, open, overdue },
      recent
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', { title: 'Admin Dashboard', stats: {}, recent: [] });
  }
});

// ─── TRAININGS ──────────────────────────────────────────────────────────────

router.get('/trainings', async (req, res) => {
  const filter = req.query.filter || 'active';
  try {
    let where = '';
    if (filter === 'active') where = "WHERE t.status='active'";
    else if (filter === 'archived') where = "WHERE t.status='archived'";
    const [trainings] = await pool.query(`
      SELECT t.*, c.name as category_name
      FROM trainings t LEFT JOIN categories c ON c.id=t.category_id
      ${where} ORDER BY t.created_at DESC
    `);
    res.render('admin/trainings', { title: 'Unterweisungen', trainings, filter });
  } catch (err) {
    console.error(err);
    res.render('admin/trainings', { title: 'Unterweisungen', trainings: [], filter });
  }
});

router.get('/trainings/new', async (req, res) => {
  const [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
  res.render('admin/training-form', { title: 'Neue Unterweisung', training: null, categories, questions: [] });
});

router.post('/trainings', async (req, res) => {
  const { title, category_id, content, passing_score, repeat_interval, questionsJson } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tResult] = await conn.query(
      'INSERT INTO trainings (title, category_id, content, passing_score, repeat_interval) VALUES (?, ?, ?, ?, ?)',
      [title, category_id || null, content, passing_score || 80, repeat_interval || 'yearly']
    );
    const trainingId = tResult.insertId;

    if (questionsJson) {
      const questions = JSON.parse(questionsJson);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const [qRes] = await conn.query(
          'INSERT INTO questions (training_id, question_text, type, sort_order) VALUES (?, ?, ?, ?)',
          [trainingId, q.text, q.type, i + 1]
        );
        for (const a of q.answers) {
          await conn.query('INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)',
            [qRes.insertId, a.text, a.is_correct ? 1 : 0]);
        }
      }
    }
    await conn.commit();
    req.session.success = 'Unterweisung erfolgreich erstellt.';
    res.redirect('/admin/trainings');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.session.error = 'Fehler beim Erstellen der Unterweisung.';
    res.redirect('/admin/trainings/new');
  } finally {
    conn.release();
  }
});

router.get('/trainings/:id/edit', async (req, res) => {
  try {
    const [tRows] = await pool.query('SELECT * FROM trainings WHERE id = ?', [req.params.id]);
    if (tRows.length === 0) return res.redirect('/admin/trainings');
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY name');
    const [questions] = await pool.query('SELECT * FROM questions WHERE training_id = ? ORDER BY sort_order, id', [req.params.id]);
    for (const q of questions) {
      const [answers] = await pool.query('SELECT * FROM answers WHERE question_id = ?', [q.id]);
      q.answers = answers;
    }
    res.render('admin/training-form', {
      title: 'Unterweisung bearbeiten',
      training: tRows[0],
      categories,
      questions
    });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/trainings');
  }
});

router.post('/trainings/:id', async (req, res) => {
  if (req.body._method !== 'PUT') return res.redirect('/admin/trainings');
  const { title, category_id, content, passing_score, repeat_interval, questionsJson } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'UPDATE trainings SET title=?, category_id=?, content=?, passing_score=?, repeat_interval=? WHERE id=?',
      [title, category_id || null, content, passing_score || 80, repeat_interval || 'yearly', req.params.id]
    );
    // Delete existing questions
    await conn.query('DELETE FROM questions WHERE training_id = ?', [req.params.id]);
    if (questionsJson) {
      const questions = JSON.parse(questionsJson);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const [qRes] = await conn.query(
          'INSERT INTO questions (training_id, question_text, type, sort_order) VALUES (?, ?, ?, ?)',
          [req.params.id, q.text, q.type, i + 1]
        );
        for (const a of q.answers) {
          await conn.query('INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)',
            [qRes.insertId, a.text, a.is_correct ? 1 : 0]);
        }
      }
    }
    await conn.commit();
    req.session.success = 'Unterweisung erfolgreich aktualisiert.';
    res.redirect('/admin/trainings');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.session.error = 'Fehler beim Aktualisieren.';
    res.redirect(`/admin/trainings/${req.params.id}/edit`);
  } finally {
    conn.release();
  }
});

router.post('/trainings/:id/archive', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT status FROM trainings WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/admin/trainings');
    const newStatus = rows[0].status === 'active' ? 'archived' : 'active';
    await pool.query('UPDATE trainings SET status = ? WHERE id = ?', [newStatus, req.params.id]);
    req.session.success = newStatus === 'archived' ? 'Unterweisung archiviert.' : 'Unterweisung reaktiviert.';
    res.redirect('/admin/trainings');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/trainings');
  }
});

router.post('/trainings/:id/duplicate', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [tRows] = await conn.query('SELECT * FROM trainings WHERE id = ?', [req.params.id]);
    if (tRows.length === 0) { await conn.rollback(); return res.redirect('/admin/trainings'); }
    const t = tRows[0];
    const [newT] = await conn.query(
      'INSERT INTO trainings (title, category_id, content, passing_score, repeat_interval, status) VALUES (?, ?, ?, ?, ?, ?)',
      [`${t.title} (Kopie)`, t.category_id, t.content, t.passing_score, t.repeat_interval, 'active']
    );
    const [questions] = await conn.query('SELECT * FROM questions WHERE training_id = ? ORDER BY sort_order, id', [req.params.id]);
    for (const q of questions) {
      const [newQ] = await conn.query(
        'INSERT INTO questions (training_id, question_text, type, sort_order) VALUES (?, ?, ?, ?)',
        [newT.insertId, q.question_text, q.type, q.sort_order]
      );
      const [answers] = await conn.query('SELECT * FROM answers WHERE question_id = ?', [q.id]);
      for (const a of answers) {
        await conn.query('INSERT INTO answers (question_id, answer_text, is_correct) VALUES (?, ?, ?)',
          [newQ.insertId, a.answer_text, a.is_correct]);
      }
    }
    await conn.commit();
    req.session.success = 'Unterweisung dupliziert.';
    res.redirect('/admin/trainings');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.redirect('/admin/trainings');
  } finally {
    conn.release();
  }
});

// ─── USERS ──────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users ORDER BY name');
    res.render('admin/users', { title: 'Mitarbeiter', users });
  } catch (err) {
    console.error(err);
    res.render('admin/users', { title: 'Mitarbeiter', users: [] });
  }
});

router.get('/users/new', (req, res) => {
  res.render('admin/user-form', { title: 'Neuer Mitarbeiter', user_edit: null });
});

router.post('/users', async (req, res) => {
  const { name, email, password, role, abteilung, position, geburtsdatum, firma, firma_anschrift } = req.body;
  try {
    const hash = await bcrypt.hash(password || 'Passwort123!', 12);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, role, abteilung, position, geburtsdatum, firma, firma_anschrift, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, email.toLowerCase(), hash, role || 'mitarbeiter', abteilung || null, position || null, geburtsdatum || null, firma || null, firma_anschrift || null, 'active']
    );
    req.session.success = 'Mitarbeiter erfolgreich angelegt.';
    res.redirect('/admin/users');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      req.session.error = 'Diese E-Mail-Adresse ist bereits registriert.';
    } else {
      req.session.error = 'Fehler beim Anlegen des Mitarbeiters.';
      console.error(err);
    }
    res.redirect('/admin/users/new');
  }
});

router.get('/users/:id/edit', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/admin/users');
    res.render('admin/user-form', { title: 'Mitarbeiter bearbeiten', user_edit: rows[0] });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

router.post('/users/:id', async (req, res) => {
  if (req.body._method !== 'PUT') return res.redirect('/admin/users');
  const { name, email, password, role, abteilung, position, geburtsdatum, firma, firma_anschrift } = req.body;
  try {
    if (password && password.length >= 6) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        'UPDATE users SET name=?, email=?, password_hash=?, role=?, abteilung=?, position=?, geburtsdatum=?, firma=?, firma_anschrift=? WHERE id=?',
        [name, email.toLowerCase(), hash, role, abteilung || null, position || null, geburtsdatum || null, firma || null, firma_anschrift || null, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE users SET name=?, email=?, role=?, abteilung=?, position=?, geburtsdatum=?, firma=?, firma_anschrift=? WHERE id=?',
        [name, email.toLowerCase(), role, abteilung || null, position || null, geburtsdatum || null, firma || null, firma_anschrift || null, req.params.id]
      );
    }
    req.session.success = 'Mitarbeiter aktualisiert.';
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.error = 'Fehler beim Aktualisieren.';
    res.redirect(`/admin/users/${req.params.id}/edit`);
  }
});

router.post('/users/:id/toggle-status', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT status FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/admin/users');
    const newStatus = rows[0].status === 'active' ? 'inactive' : 'active';
    await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, req.params.id]);
    req.session.success = `Mitarbeiter ${newStatus === 'active' ? 'aktiviert' : 'deaktiviert'}.`;
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

router.post('/users/import/csv', upload.single('csvfile'), async (req, res) => {
  if (!req.file) {
    req.session.error = 'Keine Datei hochgeladen.';
    return res.redirect('/admin/users');
  }
  try {
    const records = parse(req.file.buffer.toString('utf-8'), {
      columns: true, skip_empty_lines: true, trim: true
    });
    let imported = 0;
    for (const row of records) {
      try {
        const hash = await bcrypt.hash(row.password || 'Passwort123!', 12);
        await pool.query(
          'INSERT IGNORE INTO users (name, email, password_hash, role, abteilung, position, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [row.name, row.email?.toLowerCase(), hash, row.role || 'mitarbeiter', row.abteilung || null, row.position || null, 'active']
        );
        imported++;
      } catch (rowErr) { /* skip duplicate */ }
    }
    req.session.success = `${imported} Mitarbeiter importiert.`;
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    req.session.error = 'Fehler beim CSV-Import.';
    res.redirect('/admin/users');
  }
});

// ─── ASSIGNMENTS ─────────────────────────────────────────────────────────────

router.get('/assignments', async (req, res) => {
  try {
    const [assignments] = await pool.query(`
      SELECT a.*, u.name as user_name, u.email as user_email, u.abteilung,
             t.title as training_title
      FROM assignments a
      JOIN users u ON u.id = a.user_id
      JOIN trainings t ON t.id = a.training_id
      ORDER BY a.assigned_at DESC
    `);
    res.render('admin/assignments', { title: 'Zuweisungen', assignments });
  } catch (err) {
    console.error(err);
    res.render('admin/assignments', { title: 'Zuweisungen', assignments: [] });
  }
});

router.get('/assignments/new', async (req, res) => {
  try {
    const [trainings] = await pool.query("SELECT t.*, c.name as category_name FROM trainings t LEFT JOIN categories c ON c.id=t.category_id WHERE t.status='active' ORDER BY t.title");
    const [users] = await pool.query("SELECT * FROM users WHERE status='active' AND role='mitarbeiter' ORDER BY name");
    const [abteilungen] = await pool.query("SELECT DISTINCT abteilung FROM users WHERE abteilung IS NOT NULL AND status='active'");
    const [templates] = await pool.query("SELECT * FROM assignment_templates ORDER BY name").catch(() => [[]]);
    res.render('admin/assignment-form', { title: 'Neue Zuweisung', trainings, users, abteilungen, templates });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/assignments');
  }
});

router.post('/assignments', async (req, res) => {
  const { training_ids, target, user_ids, abteilung, due_date } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Support multiple training_ids (new) or fallback to single training_id (legacy)
    let trainingIds = training_ids
      ? (Array.isArray(training_ids) ? training_ids : [training_ids])
      : (req.body.training_id ? [req.body.training_id] : []);
    trainingIds = trainingIds.filter(Boolean);

    if (trainingIds.length === 0) {
      await conn.rollback();
      req.session.error = 'Bitte mindestens eine Unterweisung auswählen.';
      return res.redirect('/admin/assignments/new');
    }

    let targetUserIds = [];
    if (target === 'all') {
      const [rows] = await conn.query("SELECT id FROM users WHERE status='active' AND role='mitarbeiter'");
      targetUserIds = rows.map(r => r.id);
    } else if (target === 'abteilung' && abteilung) {
      const [rows] = await conn.query("SELECT id FROM users WHERE abteilung=? AND status='active'", [abteilung]);
      targetUserIds = rows.map(r => r.id);
    } else if (target === 'user' && user_ids) {
      targetUserIds = Array.isArray(user_ids) ? user_ids : [user_ids];
    }

    let inserted = 0;
    for (const tid of trainingIds) {
      for (const uid of targetUserIds) {
        const [existing] = await conn.query(
          'SELECT id FROM assignments WHERE training_id=? AND user_id=?',
          [tid, uid]
        );
        if (existing.length === 0) {
          await conn.query(
            'INSERT INTO assignments (training_id, user_id, due_date) VALUES (?, ?, ?)',
            [tid, uid, due_date || null]
          );
          inserted++;
        }
      }
    }
    await conn.commit();
    req.session.success = `${inserted} Zuweisung(en) erstellt.`;
    res.redirect('/admin/assignments');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.session.error = 'Fehler beim Erstellen der Zuweisungen.';
    res.redirect('/admin/assignments/new');
  } finally {
    conn.release();
  }
});

router.post('/assignments/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM assignments WHERE id = ?', [req.params.id]);
    req.session.success = 'Zuweisung gelöscht.';
    res.redirect('/admin/assignments');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/assignments');
  }
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────

router.get('/reports', async (req, res) => {
  const firma = req.query.firma || '';
  const firmaWhere = firma ? 'AND u.firma = ?' : '';
  const firmaParam = firma ? [firma] : [];
  try {
    const [firmenRows] = await pool.query(
      "SELECT DISTINCT firma FROM users WHERE firma IS NOT NULL AND firma != '' ORDER BY firma"
    );
    const firmen = firmenRows.map(r => r.firma);

    const [[{ completed }]] = await pool.query(
      `SELECT COUNT(*) as completed FROM assignments a JOIN users u ON u.id=a.user_id WHERE a.status='passed' ${firmaWhere}`,
      firmaParam
    );
    const [[{ open }]] = await pool.query(
      `SELECT COUNT(*) as open FROM assignments a JOIN users u ON u.id=a.user_id WHERE a.status='open' ${firmaWhere}`,
      firmaParam
    );
    const [[{ overdue }]] = await pool.query(
      `SELECT COUNT(*) as overdue FROM assignments a JOIN users u ON u.id=a.user_id WHERE a.status='overdue' ${firmaWhere}`,
      firmaParam
    );
    const [assignments] = await pool.query(`
      SELECT a.*, u.name as user_name, u.email as user_email, u.abteilung, u.firma,
             t.title as training_title, r.score, r.completed_at
      FROM assignments a
      JOIN users u ON u.id = a.user_id
      JOIN trainings t ON t.id = a.training_id
      LEFT JOIN results r ON r.assignment_id = a.id AND r.passed = 1
      WHERE 1=1 ${firmaWhere}
      ORDER BY u.name, t.title
    `, firmaParam);

    res.render('admin/reports', {
      title: 'Auswertungen',
      stats: { completed, open, overdue },
      assignments,
      firmen,
      selectedFirma: firma,
      success: req.session.success || null,
      error: req.session.error || null
    });
    delete req.session.success; delete req.session.error;
  } catch (err) {
    console.error(err);
    res.render('admin/reports', { title: 'Auswertungen', stats: {}, assignments: [], firmen: [], selectedFirma: '' });
  }
});

router.get('/reports/export/csv', async (req, res) => {
  const firma = req.query.firma || '';
  const firmaWhere = firma ? 'AND u.firma = ?' : '';
  const firmaParam = firma ? [firma] : [];
  try {
    const [assignments] = await pool.query(`
      SELECT u.name, u.email, u.abteilung, u.firma, t.title as training,
             a.status, a.due_date, r.score, r.completed_at
      FROM assignments a
      JOIN users u ON u.id = a.user_id
      JOIN trainings t ON t.id = a.training_id
      LEFT JOIN results r ON r.assignment_id = a.id AND r.passed = 1
      WHERE 1=1 ${firmaWhere}
      ORDER BY u.name
    `, firmaParam);
    const headers = 'Name,E-Mail,Firma,Abteilung,Unterweisung,Status,Fälligkeitsdatum,Ergebnis (%),Abgeschlossen am\n';
    const rows = assignments.map(a =>
      [
        `"${a.name || ''}"`, `"${a.email || ''}"`, `"${a.firma || ''}"`, `"${a.abteilung || ''}"`,
        `"${a.training || ''}"`, `"${a.status || ''}"`,
        a.due_date ? new Date(a.due_date).toLocaleDateString('de-DE') : '',
        a.score !== null ? Math.round(a.score) : '',
        a.completed_at ? new Date(a.completed_at).toLocaleDateString('de-DE') : ''
      ].join(',')
    ).join('\n');
    const fname = firma ? `ifdau-auswertung-${firma.replace(/[^a-z0-9]/gi,'_')}.csv` : 'ifdau-auswertung.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send('\uFEFF' + headers + rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Export fehlgeschlagen.');
  }
});

// ─── CATEGORIES ──────────────────────────────────────────────────────────────

router.get('/categories', async (req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT c.*, COUNT(t.id) as training_count
      FROM categories c
      LEFT JOIN trainings t ON t.category_id = c.id AND t.status = 'active'
      GROUP BY c.id ORDER BY c.name
    `);
    res.render('admin/categories', { title: 'Kategorien', categories });
  } catch (err) {
    console.error(err);
    res.render('admin/categories', { title: 'Kategorien', categories: [] });
  }
});

router.get('/categories/new', (req, res) => {
  res.render('admin/category-form', { title: 'Neue Kategorie', category: null });
});

router.post('/categories', async (req, res) => {
  const { name, icon, description } = req.body;
  try {
    await pool.query('INSERT INTO categories (name, icon, description) VALUES (?, ?, ?)',
      [name, icon || 'shield', description || null]);
    req.session.success = 'Kategorie erstellt.';
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    req.session.error = 'Fehler beim Erstellen.';
    res.redirect('/admin/categories/new');
  }
});

router.get('/categories/:id/edit', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/admin/categories');
    res.render('admin/category-form', { title: 'Kategorie bearbeiten', category: rows[0] });
  } catch (err) {
    res.redirect('/admin/categories');
  }
});

router.post('/categories/:id', async (req, res) => {
  if (req.body._method !== 'PUT') return res.redirect('/admin/categories');
  const { name, icon, description } = req.body;
  try {
    await pool.query('UPDATE categories SET name=?, icon=?, description=? WHERE id=?',
      [name, icon || 'shield', description || null, req.params.id]);
    req.session.success = 'Kategorie aktualisiert.';
    res.redirect('/admin/categories');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/categories/${req.params.id}/edit`);
  }
});

// ─── STATUS REPORTS ──────────────────────────────────────────────────────────

// Helper: group raw DB rows into user status objects
function buildUserStatusReport(rows) {
  const userMap = new Map();
  const now = new Date();

  for (const row of rows) {
    if (!userMap.has(row.user_id)) {
      userMap.set(row.user_id, { id: row.user_id, name: row.user_name, email: row.user_email, assignments: new Map() });
    }
    if (row.assignment_id) {
      const aMap = userMap.get(row.user_id).assignments;
      if (!aMap.has(row.assignment_id)) {
        aMap.set(row.assignment_id, {
          status: row.a_status, due_date: row.due_date,
          completed_at: row.completed_at, repeat_interval: row.repeat_interval,
          cert_issued_at: row.cert_issued_at
        });
      }
    }
  }

  return Array.from(userMap.values()).map(user => {
    const assignments = Array.from(user.assignments.values());
    if (assignments.length === 0) {
      return { id: user.id, name: user.name, email: user.email, overallStatus: 'gray', totalModules: 0, completedModules: 0, nextDue: null, validUntil: null, lastCertDate: null };
    }

    let hasOverdue = false, hasFailed = false, hasExpired = false;
    let completedCount = 0, nextDue = null, minValidUntil = null, lastCertDate = null;

    for (const a of assignments) {
      if (a.status === 'overdue') hasOverdue = true;
      if (a.status === 'failed')  hasFailed  = true;

      if (a.status === 'passed') {
        completedCount++;
        if (a.completed_at && a.repeat_interval !== 'once') {
          const vu = new Date(a.completed_at);
          if (a.repeat_interval === 'yearly')     vu.setFullYear(vu.getFullYear() + 1);
          else if (a.repeat_interval === 'halfyearly') vu.setMonth(vu.getMonth() + 6);
          if (vu < now) hasExpired = true;
          if (!minValidUntil || vu < minValidUntil) minValidUntil = vu;
        }
        if (a.cert_issued_at) {
          const cd = new Date(a.cert_issued_at);
          if (!lastCertDate || cd > lastCertDate) lastCertDate = cd;
        }
      }

      if ((a.status === 'open' || a.status === 'overdue') && a.due_date) {
        const dd = new Date(a.due_date);
        if (!nextDue || dd < nextDue) nextDue = dd;
      }
    }

    const allCompleted = assignments.every(a => a.status === 'passed');
    return {
      id: user.id, name: user.name, email: user.email,
      overallStatus: (allCompleted && !hasExpired) ? 'green' : 'red',
      totalModules: assignments.length,
      completedModules: completedCount,
      nextDue, validUntil: minValidUntil, lastCertDate
    };
  });
}

async function fetchStatusReportData(firma) {
  const [rows] = await pool.query(`
    SELECT u.id as user_id, u.name as user_name, u.email as user_email,
           a.id as assignment_id, a.status as a_status, a.due_date,
           t.repeat_interval,
           r.completed_at,
           cert.issued_at as cert_issued_at
    FROM users u
    LEFT JOIN assignments a ON a.user_id = u.id
    LEFT JOIN trainings t ON t.id = a.training_id
    LEFT JOIN results r ON r.assignment_id = a.id AND r.passed = 1
    LEFT JOIN certificates cert ON cert.result_id = r.id
    WHERE u.firma = ? AND u.status = 'active'
    ORDER BY u.name, a.due_date
  `, [firma]);
  return buildUserStatusReport(rows);
}

router.get('/status-reports', async (req, res) => {
  const firma = req.query.firma || '';
  try {
    const [firmenRows] = await pool.query(
      "SELECT DISTINCT firma FROM users WHERE firma IS NOT NULL AND firma != '' AND status='active' ORDER BY firma"
    );
    const firmen = firmenRows.map(r => r.firma);
    const users = firma ? await fetchStatusReportData(firma) : [];
    res.render('admin/status-reports', { title: 'Statusberichte', firmen, selectedFirma: firma, users, now: new Date() });
  } catch (err) {
    console.error(err);
    res.render('admin/status-reports', { title: 'Statusberichte', firmen: [], selectedFirma: '', users: [], now: new Date() });
  }
});

router.get('/status-reports/print', async (req, res) => {
  const firma = req.query.firma || '';
  if (!firma) return res.redirect('/admin/status-reports');
  try {
    const users = await fetchStatusReportData(firma);
    res.render('admin/status-reports-print', { title: `Statusbericht – ${firma}`, firma, users, now: new Date() });
  } catch (err) {
    console.error(err);
    res.status(500).send('Druckansicht fehlgeschlagen.');
  }
});

router.get('/status-reports/export/excel', async (req, res) => {
  const firma = req.query.firma || '';
  if (!firma) return res.redirect('/admin/status-reports');
  try {
    const users = await fetchStatusReportData(firma);
    const fmt = d => d ? new Date(d).toLocaleDateString('de-DE') : '';
    const statusLabel = s => s === 'green' ? 'Vollständig' : (s === 'red' ? 'Ausstehend' : 'Keine Zuweisungen');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<style>
  th { background:#f1f5f9; font-weight:bold; }
  td, th { border:1px solid #ccc; padding:4px 8px; }
  .green { color:#166534; } .red { color:#991b1b; }
</style></head><body>
<h2>Statusbericht – ${firma}</h2>
<p>Stand: ${new Date().toLocaleString('de-DE')}</p>
<table>
  <thead><tr>
    <th>Status</th><th>Name</th><th>E-Mail-Adresse</th>
    <th>Ausstellungsdatum</th><th>Fälligkeitsdatum</th>
    <th>Gültig bis</th><th>Module</th>
  </tr></thead>
  <tbody>
    ${users.map(u => `<tr>
      <td class="${u.overallStatus}">${statusLabel(u.overallStatus)}</td>
      <td>${u.name}</td><td>${u.email}</td>
      <td>${fmt(u.lastCertDate)}</td>
      <td>${fmt(u.nextDue)}</td>
      <td>${fmt(u.validUntil)}</td>
      <td>${u.completedModules}/${u.totalModules}</td>
    </tr>`).join('')}
  </tbody>
</table></body></html>`;

    const fname = `statusbericht-${firma.replace(/[^a-z0-9äöüÄÖÜ]/gi,'_')}.xls`;
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send('\uFEFF' + html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Excel-Export fehlgeschlagen.');
  }
});

router.get('/status-reports/export/pdf', async (req, res) => {
  const firma = req.query.firma || '';
  if (!firma) return res.redirect('/admin/status-reports');
  try {
    const users = await fetchStatusReportData(firma);
    const fmt = d => d ? new Date(d).toLocaleDateString('de-DE') : '–';

    const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    const fname = `statusbericht-${firma.replace(/[^a-z0-9]/gi,'_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    doc.pipe(res);

    // Logo
    const logoPath = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 40, 28, { height: 48 });
    }

    // Title & date
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a')
       .text(`Statusbericht – ${firma}`, 40, 88);
    doc.fontSize(9).font('Helvetica').fillColor('#64748b')
       .text(`Stand: ${new Date().toLocaleString('de-DE')}  |  ${users.length} Mitarbeiter`, 40, 108);

    // Table setup
    const cols = [
      { x: 40,  w: 50,  label: 'Status' },
      { x: 95,  w: 175, label: 'Name' },
      { x: 275, w: 170, label: 'E-Mail' },
      { x: 450, w: 82,  label: 'Ausgestellt' },
      { x: 535, w: 82,  label: 'Fällig am' },
      { x: 620, w: 82,  label: 'Gültig bis' },
      { x: 705, w: 62,  label: 'Module' }
    ];
    const tableW = 762;
    let y = 130;
    const rowH = 22;

    // Header
    doc.rect(40, y, tableW, rowH).fill('#1e293b');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
    cols.forEach(c => doc.text(c.label, c.x + 4, y + 7, { width: c.w - 6, lineBreak: false }));
    y += rowH;

    // Rows
    users.forEach((u, idx) => {
      if (y + rowH > 555) {
        doc.addPage({ layout: 'landscape', size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
        y = 40;
        // Repeat header
        doc.rect(40, y, tableW, rowH).fill('#1e293b');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        cols.forEach(c => doc.text(c.label, c.x + 4, y + 7, { width: c.w - 6, lineBreak: false }));
        y += rowH;
      }

      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      doc.rect(40, y, tableW, rowH).fill(bg);
      doc.rect(40, y, tableW, rowH).stroke('#e2e8f0');

      // Status dot
      const dotColor = u.overallStatus === 'green' ? '#22c55e' : (u.overallStatus === 'red' ? '#ef4444' : '#94a3b8');
      doc.circle(cols[0].x + 16, y + rowH / 2, 7).fill(dotColor);

      doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a');
      doc.text(u.name,  cols[1].x + 3, y + 7, { width: cols[1].w - 5, lineBreak: false });
      doc.fillColor('#475569');
      doc.text(u.email, cols[2].x + 3, y + 7, { width: cols[2].w - 5, lineBreak: false });
      doc.text(fmt(u.lastCertDate), cols[3].x + 3, y + 7, { width: cols[3].w - 5, lineBreak: false });
      doc.text(fmt(u.nextDue),      cols[4].x + 3, y + 7, { width: cols[4].w - 5, lineBreak: false });
      doc.text(fmt(u.validUntil),   cols[5].x + 3, y + 7, { width: cols[5].w - 5, lineBreak: false });
      const modColor = u.completedModules === u.totalModules ? '#166534' : '#991b1b';
      doc.fillColor(modColor).font('Helvetica-Bold')
         .text(`${u.completedModules}/${u.totalModules}`, cols[6].x + 3, y + 7, { width: cols[6].w - 5, lineBreak: false });

      y += rowH;
    });

    // Footer
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8')
       .text('IfDAU – Institut für Digitale Arbeitsunterweisungen', 40, 565, { width: tableW, align: 'center' });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).send('PDF-Export fehlgeschlagen.');
  }
});

// ─── ASSIGNMENT TEMPLATES ─────────────────────────────────────────────────────

router.get('/assignment-templates', async (req, res) => {
  try {
    const [templates] = await pool.query('SELECT * FROM assignment_templates ORDER BY name');
    res.render('admin/assignment-templates', {
      title: 'Zuweisungsvorlagen',
      templates,
      success: req.session.success || null,
      error: req.session.error || null
    });
    delete req.session.success; delete req.session.error;
  } catch (err) {
    console.error(err);
    res.render('admin/assignment-templates', { title: 'Zuweisungsvorlagen', templates: [], success: null, error: 'Fehler beim Laden.' });
  }
});

router.get('/assignment-templates/new', async (req, res) => {
  const [trainings] = await pool.query("SELECT t.*, c.name as category_name FROM trainings t LEFT JOIN categories c ON c.id=t.category_id WHERE t.status='active' ORDER BY t.title");
  res.render('admin/assignment-template-form', { title: 'Neue Vorlage', template: null, trainings, error: null });
});

router.post('/assignment-templates', async (req, res) => {
  const { name, description, training_ids } = req.body;
  const ids = training_ids ? (Array.isArray(training_ids) ? training_ids : [training_ids]) : [];
  try {
    await pool.query('INSERT INTO assignment_templates (name, description, training_ids) VALUES (?, ?, ?)',
      [name, description || null, JSON.stringify(ids)]);
    req.session.success = 'Vorlage erstellt.';
    res.redirect('/admin/assignment-templates');
  } catch (err) {
    console.error(err);
    const [trainings] = await pool.query("SELECT t.*, c.name as category_name FROM trainings t LEFT JOIN categories c ON c.id=t.category_id WHERE t.status='active' ORDER BY t.title");
    res.render('admin/assignment-template-form', { title: 'Neue Vorlage', template: null, trainings, error: 'Fehler beim Erstellen.' });
  }
});

router.get('/assignment-templates/:id/edit', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM assignment_templates WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/admin/assignment-templates');
    const [trainings] = await pool.query("SELECT t.*, c.name as category_name FROM trainings t LEFT JOIN categories c ON c.id=t.category_id WHERE t.status='active' ORDER BY t.title");
    const tpl = rows[0];
    tpl.training_ids = typeof tpl.training_ids === 'string' ? JSON.parse(tpl.training_ids) : tpl.training_ids;
    res.render('admin/assignment-template-form', { title: 'Vorlage bearbeiten', template: tpl, trainings, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/assignment-templates');
  }
});

router.post('/assignment-templates/:id', async (req, res) => {
  if (req.body._method !== 'PUT') return res.redirect('/admin/assignment-templates');
  const { name, description, training_ids } = req.body;
  const ids = training_ids ? (Array.isArray(training_ids) ? training_ids : [training_ids]) : [];
  try {
    await pool.query('UPDATE assignment_templates SET name=?, description=?, training_ids=? WHERE id=?',
      [name, description || null, JSON.stringify(ids), req.params.id]);
    req.session.success = 'Vorlage aktualisiert.';
    res.redirect('/admin/assignment-templates');
  } catch (err) {
    console.error(err);
    req.session.error = 'Fehler beim Aktualisieren.';
    res.redirect(`/admin/assignment-templates/${req.params.id}/edit`);
  }
});

router.post('/assignment-templates/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM assignment_templates WHERE id = ?', [req.params.id]);
    req.session.success = 'Vorlage gelöscht.';
    res.redirect('/admin/assignment-templates');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/assignment-templates');
  }
});

// ─── REMINDERS ───────────────────────────────────────────────────────────────

router.get('/reminders', async (req, res) => {
  try {
    const [reminders] = await pool.query(`
      SELECT r.*, u.name as user_name, u.email as user_email, t.title as training_title
      FROM reminders r
      JOIN assignments a ON a.id = r.assignment_id
      JOIN users u ON u.id = a.user_id
      JOIN trainings t ON t.id = a.training_id
      ORDER BY r.sent_at DESC
    `);
    res.render('admin/reminders', { title: 'Erinnerungen', reminders });
  } catch (err) {
    console.error(err);
    res.render('admin/reminders', { title: 'Erinnerungen', reminders: [] });
  }
});

module.exports = router;
