const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const bcrypt = require('bcryptjs');
const { isAuthenticated } = require('../middleware/auth');
const { generateCertificate } = require('../utils/pdf');
const path = require('path');
const fs = require('fs');

// GET /dashboard
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [assignments] = await pool.query(`
      SELECT a.*, t.title, t.passing_score, c.name as category_name, c.icon as category_icon,
             r.score, r.passed, r.completed_at
      FROM assignments a
      JOIN trainings t ON t.id = a.training_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN results r ON r.assignment_id = a.id AND r.passed = 1
      WHERE a.user_id = ?
      ORDER BY a.due_date ASC
    `, [userId]);

    const total = assignments.length;
    const completed = assignments.filter(a => a.status === 'passed').length;

    res.render('user/dashboard', {
      title: 'Dashboard',
      assignments,
      total,
      completed
    });
  } catch (err) {
    console.error(err);
    res.render('user/dashboard', { title: 'Dashboard', assignments: [], total: 0, completed: 0 });
  }
});

// GET /my-trainings
router.get('/my-trainings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [assignments] = await pool.query(`
      SELECT a.*, t.title, t.passing_score, t.content,
             c.name as category_name, c.icon as category_icon,
             r.score, r.passed, r.completed_at
      FROM assignments a
      JOIN trainings t ON t.id = a.training_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN results r ON r.assignment_id = a.id AND r.passed = 1
      WHERE a.user_id = ?
      ORDER BY FIELD(a.status,'overdue','open','failed','passed'), a.due_date ASC
    `, [userId]);

    res.render('user/trainings', { title: 'Meine Unterweisungen', assignments });
  } catch (err) {
    console.error(err);
    res.render('user/trainings', { title: 'Meine Unterweisungen', assignments: [] });
  }
});

// GET /trainings/:assignmentId/read
router.get('/trainings/:assignmentId/read', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await pool.query(`
      SELECT a.*, t.title, t.content, t.passing_score,
             c.name as category_name, c.icon as category_icon
      FROM assignments a
      JOIN trainings t ON t.id = a.training_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE a.id = ? AND a.user_id = ?
    `, [req.params.assignmentId, userId]);

    if (rows.length === 0) return res.redirect('/my-trainings');

    res.render('user/training-read', { title: rows[0].title, assignment: rows[0] });
  } catch (err) {
    console.error(err);
    res.redirect('/my-trainings');
  }
});

// GET /trainings/:assignmentId/quiz
router.get('/trainings/:assignmentId/quiz', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [aRows] = await pool.query(`
      SELECT a.*, t.title, t.passing_score
      FROM assignments a
      JOIN trainings t ON t.id = a.training_id
      WHERE a.id = ? AND a.user_id = ?
    `, [req.params.assignmentId, userId]);

    if (aRows.length === 0) return res.redirect('/my-trainings');
    const assignment = aRows[0];

    const [questions] = await pool.query(
      'SELECT * FROM questions WHERE training_id = ? ORDER BY sort_order, id',
      [assignment.training_id]
    );

    for (const q of questions) {
      const [answers] = await pool.query(
        'SELECT id, answer_text FROM answers WHERE question_id = ? ORDER BY RAND()',
        [q.id]
      );
      q.answers = answers;
    }

    res.render('user/quiz', {
      title: 'Lernerfolgskontrolle',
      assignment,
      questions: JSON.stringify(questions),
      passingScore: assignment.passing_score
    });
  } catch (err) {
    console.error(err);
    res.redirect('/my-trainings');
  }
});

// POST /trainings/:assignmentId/quiz/submit
router.post('/trainings/:assignmentId/quiz/submit', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { answers } = req.body; // { "questionId": ["answerId", ...] }
    const parsedAnswers = typeof answers === 'string' ? JSON.parse(answers) : answers;

    const [aRows] = await pool.query(`
      SELECT a.*, t.title, t.passing_score
      FROM assignments a
      JOIN trainings t ON t.id = a.training_id
      WHERE a.id = ? AND a.user_id = ?
    `, [req.params.assignmentId, userId]);

    if (aRows.length === 0) return res.redirect('/my-trainings');
    const assignment = aRows[0];

    // Get all questions with correct answers
    const [questions] = await pool.query(
      'SELECT * FROM questions WHERE training_id = ? ORDER BY sort_order, id',
      [assignment.training_id]
    );

    let correct = 0;
    const questionResults = [];

    for (const q of questions) {
      const [allAnswers] = await pool.query('SELECT * FROM answers WHERE question_id = ?', [q.id]);
      const correctIds = allAnswers.filter(a => a.is_correct).map(a => String(a.id));
      const userAnswerIds = (parsedAnswers[String(q.id)] || []).map(String);

      const isCorrect = correctIds.length === userAnswerIds.length &&
        correctIds.every(id => userAnswerIds.includes(id));

      if (isCorrect) correct++;

      questionResults.push({
        question: q.question_text,
        type: q.type,
        answers: allAnswers.map(a => ({
          text: a.answer_text,
          isCorrect: a.is_correct,
          wasSelected: userAnswerIds.includes(String(a.id))
        })),
        isCorrect
      });
    }

    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= assignment.passing_score;
    const newStatus = passed ? 'passed' : 'failed';

    // Save result
    const [rResult] = await pool.query(
      'INSERT INTO results (assignment_id, user_id, score, passed) VALUES (?, ?, ?, ?)',
      [assignment.id, userId, score, passed]
    );
    const resultId = rResult.insertId;

    // Update assignment status
    await pool.query('UPDATE assignments SET status = ? WHERE id = ?', [newStatus, assignment.id]);

    // Generate certificate if passed
    if (passed) {
      try {
        const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
        const [trainRows] = await pool.query('SELECT * FROM trainings WHERE id = ?', [assignment.training_id]);

        const [certInsert] = await pool.query(
          'INSERT INTO certificates (user_id, training_id, result_id, pdf_path) VALUES (?, ?, ?, ?)',
          [userId, assignment.training_id, resultId, '']
        );
        const certId = certInsert.insertId;

        try {
          const certPath = await generateCertificate({
            user: userRows[0],
            training: trainRows[0],
            result: { score },
            certId
          });
          await pool.query('UPDATE certificates SET pdf_path = ? WHERE id = ?', [certPath, certId]);
        } catch (pdfErr) {
          console.error('PDF-Generierung fehlgeschlagen:', pdfErr.message);
        }
      } catch (certErr) {
        console.error('Zertifikat-Erstellung fehlgeschlagen:', certErr.message);
      }
    }

    res.redirect(`/trainings/${assignment.id}/result/${resultId}`);
  } catch (err) {
    console.error(err);
    res.redirect('/my-trainings');
  }
});

// GET /trainings/:assignmentId/result/:resultId
router.get('/trainings/:assignmentId/result/:resultId', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await pool.query(`
      SELECT r.*, a.id as assignment_id, a.training_id, a.due_date, t.title, t.passing_score, t.content,
             cert.id as cert_id, cert.pdf_path
      FROM results r
      JOIN assignments a ON a.id = r.assignment_id
      JOIN trainings t ON t.id = a.training_id
      LEFT JOIN certificates cert ON cert.result_id = r.id
      WHERE r.id = ? AND r.user_id = ? AND a.id = ?
    `, [req.params.resultId, userId, req.params.assignmentId]);

    if (rows.length === 0) return res.redirect('/my-trainings');
    const result = rows[0];

    res.render('user/result', { title: 'Ergebnis', result });
  } catch (err) {
    console.error(err);
    res.redirect('/my-trainings');
  }
});

// GET /certificates
router.get('/certificates', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [certs] = await pool.query(`
      SELECT cert.*, t.title as training_title, c.name as category_name,
             r.score, u.name as user_name
      FROM certificates cert
      JOIN trainings t ON t.id = cert.training_id
      LEFT JOIN categories c ON c.id = t.category_id
      JOIN results r ON r.id = cert.result_id
      JOIN users u ON u.id = cert.user_id
      WHERE cert.user_id = ?
      ORDER BY cert.issued_at DESC
    `, [userId]);

    res.render('user/certificates', { title: 'Meine Zertifikate', certificates: certs });
  } catch (err) {
    console.error(err);
    res.render('user/certificates', { title: 'Meine Zertifikate', certificates: [] });
  }
});

// GET /certificates/:id/download
router.get('/certificates/:id/download', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const [rows] = await pool.query(
      'SELECT * FROM certificates WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    if (rows.length === 0 || !rows[0].pdf_path) {
      return res.status(404).send('Zertifikat nicht gefunden.');
    }
    const cert = rows[0];
    const filePath = path.join(__dirname, '..', 'public', cert.pdf_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('PDF-Datei nicht gefunden.');
    }
    res.download(filePath, `Zertifikat_IFDAU_${cert.id}.pdf`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Fehler beim Download.');
  }
});

// GET /change-password
router.get('/change-password', isAuthenticated, (req, res) => {
  res.render('user/change-password', {
    title: 'Passwort ändern',
    success: req.session.success || null,
    error: req.session.error || null
  });
  delete req.session.success;
  delete req.session.error;
});

// POST /change-password
router.post('/change-password', isAuthenticated, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const userId = req.session.user.id;

  if (!current_password || !new_password || !confirm_password) {
    req.session.error = 'Bitte alle Felder ausfüllen.';
    return res.redirect('/change-password');
  }
  if (new_password.length < 8) {
    req.session.error = 'Das neue Passwort muss mindestens 8 Zeichen lang sein.';
    return res.redirect('/change-password');
  }
  if (new_password !== confirm_password) {
    req.session.error = 'Die neuen Passwörter stimmen nicht überein.';
    return res.redirect('/change-password');
  }

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.redirect('/logout');

    const match = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!match) {
      req.session.error = 'Das aktuelle Passwort ist falsch.';
      return res.redirect('/change-password');
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

    req.session.success = 'Passwort erfolgreich geändert.';
    res.redirect('/change-password');
  } catch (err) {
    console.error(err);
    req.session.error = 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
    res.redirect('/change-password');
  }
});

module.exports = router;
