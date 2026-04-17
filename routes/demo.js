const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');
const {
  sendDemoConfirmationEmail,
  sendDemoWelcomeEmail,
  sendDemoNotificationEmail,
  sendDemoInquiryEmail
} = require('../utils/mail');

// Bekannte Freemail-Domains
const FREEMAIL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.de','yahoo.co.uk',
  'hotmail.com','hotmail.de','hotmail.co.uk','outlook.com','outlook.de',
  'live.com','live.de','msn.com','web.de','gmx.de','gmx.net','gmx.at',
  'gmx.ch','t-online.de','freenet.de','aol.com','icloud.com','me.com',
  'mac.com','protonmail.com','proton.me','mail.de','posteo.de',
  'mailbox.org','yandex.com','yandex.ru','mail.ru','qq.com','163.com'
]);

function isFreemail(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase();
  return domain ? FREEMAIL_DOMAINS.has(domain) : true;
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from(crypto.randomBytes(length))
    .map(b => chars[b % chars.length])
    .join('');
}

// ── GET /demo ─────────────────────────────────────────────────────────────────
router.get('/demo', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin/dashboard' : '/dashboard');
  }
  res.render('public/demo', {
    title: 'Demo anfordern – IfDAU',
    error: null,
    success: null,
    showContactForm: false,
    prefill: {}
  });
});

// ── POST /demo ────────────────────────────────────────────────────────────────
router.post('/demo', async (req, res) => {
  const { company_name, contact_name, email, phone } = req.body;

  const renderPage = (opts) => res.render('public/demo', {
    title: 'Demo anfordern – IfDAU',
    error: null, success: null, showContactForm: false, prefill: {},
    ...opts
  });

  if (!company_name?.trim() || !contact_name?.trim() || !email?.trim()) {
    return renderPage({ error: 'Bitte alle Pflichtfelder ausfüllen.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  // Freemail → Kontaktformular
  if (isFreemail(cleanEmail)) {
    return renderPage({
      showContactForm: true,
      prefill: { company_name, contact_name, email: cleanEmail, phone }
    });
  }

  try {
    // Doppelte Anfrage prüfen
    const [existing] = await pool.query(
      'SELECT id, status FROM demo_accounts WHERE email = ?',
      [cleanEmail]
    );
    if (existing.length > 0) {
      const s = existing[0].status;
      if (s === 'pending') {
        return renderPage({ error: 'Für diese E-Mail-Adresse wurde bereits eine Demo-Anfrage gestellt. Bitte prüfen Sie Ihren Posteingang.' });
      }
      if (s === 'active') {
        return renderPage({ error: 'Für diese E-Mail-Adresse existiert bereits ein aktiver Demo-Zugang.' });
      }
      if (s === 'expired' || s === 'deactivated') {
        return renderPage({ error: 'Ein früherer Demo-Zugang für diese E-Mail-Adresse ist abgelaufen. Bitte kontaktieren Sie uns direkt: info@ifdau.de' });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');

    await pool.query(
      'INSERT INTO demo_accounts (company_name, contact_name, email, phone, token, status) VALUES (?, ?, ?, ?, ?, ?)',
      [company_name.trim(), contact_name.trim(), cleanEmail, phone?.trim() || null, token, 'pending']
    );

    const activationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/demo/activate/${token}`;

    await sendDemoConfirmationEmail({
      to: cleanEmail,
      name: contact_name.trim(),
      companyName: company_name.trim(),
      activationUrl
    });

    // IfDAU benachrichtigen (Fehler ignorieren)
    sendDemoNotificationEmail({
      companyName: company_name.trim(),
      contactName: contact_name.trim(),
      contactEmail: cleanEmail,
      phone: phone?.trim()
    }).catch(err => console.error('Admin-Benachrichtigung fehlgeschlagen:', err.message));

    res.render('public/demo-pending', {
      title: 'Bestätigungs-E-Mail gesendet – IfDAU',
      email: cleanEmail
    });
  } catch (err) {
    console.error('Demo-Registrierung Fehler:', err);
    renderPage({ error: 'Ein technischer Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' });
  }
});

// ── POST /demo/contact ────────────────────────────────────────────────────────
router.post('/demo/contact', async (req, res) => {
  const { contact_name, company_name, email, message } = req.body;

  try {
    await sendDemoInquiryEmail({
      name: contact_name?.trim(),
      company: company_name?.trim(),
      email: email?.trim(),
      message: message?.trim()
    });
  } catch (err) {
    console.error('Demo-Kontaktmail Fehler:', err.message);
  }

  res.render('public/demo', {
    title: 'Demo anfordern – IfDAU',
    error: null,
    success: 'Vielen Dank! Ihre Anfrage wurde gesendet. Wir melden uns in Kürze bei Ihnen.',
    showContactForm: false,
    prefill: {}
  });
});

// ── GET /demo/activate/:token ─────────────────────────────────────────────────
router.get('/demo/activate/:token', async (req, res) => {
  const { token } = req.params;

  const renderError = (msg) => res.render('public/demo', {
    title: 'Demo anfordern – IfDAU',
    error: msg,
    success: null,
    showContactForm: false,
    prefill: {}
  });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM demo_accounts WHERE token = ?',
      [token]
    );

    if (rows.length === 0) {
      return renderError('Ungültiger oder abgelaufener Aktivierungslink. Bitte fordern Sie einen neuen Demo-Zugang an.');
    }

    const demo = rows[0];

    if (demo.status === 'active') {
      return res.render('public/demo-success', {
        title: 'Demo bereits aktiviert – IfDAU',
        alreadyActive: true,
        loginUrl: `${process.env.APP_URL || 'http://localhost:3000'}/login`
      });
    }

    if (demo.status === 'expired' || demo.status === 'deactivated') {
      return renderError('Dieser Demo-Zugang ist bereits abgelaufen oder deaktiviert.');
    }

    // Temporäres Passwort generieren
    const tempPassword = generatePassword();
    const hash = await bcrypt.hash(tempPassword, 12);

    // Demo-Ablaufzeit: 14 Tage ab jetzt
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // demo_admin-User anlegen
    const [userResult] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, abteilung, position, status, demo_account_id)
       VALUES (?, ?, ?, 'demo_admin', ?, ?, 'active', ?)`,
      [demo.contact_name, demo.email, hash, demo.company_name, 'Demo-Kontakt', demo.id]
    );
    const userId = userResult.insertId;

    // Demo-Unterweisungen abrufen (is_demo = 1, max. 3)
    const [demoTrainings] = await pool.query(
      "SELECT id FROM trainings WHERE is_demo = 1 AND status = 'active' ORDER BY id ASC LIMIT 3"
    );

    // Zuweisungen erstellen
    const dueDate = new Date(expiresAt);
    for (const t of demoTrainings) {
      await pool.query(
        'INSERT IGNORE INTO assignments (user_id, training_id, due_date, status) VALUES (?, ?, ?, ?)',
        [userId, t.id, dueDate, 'open']
      );
    }

    // demo_accounts aktualisieren
    await pool.query(
      `UPDATE demo_accounts
       SET status='active', demo_user_id=?, expires_at=?, activated_at=NOW(), token=NULL
       WHERE id=?`,
      [userId, expiresAt, demo.id]
    );

    const loginUrl = `${process.env.APP_URL || 'http://localhost:3000'}/login`;

    // Willkommens-E-Mail
    try {
      await sendDemoWelcomeEmail({
        to: demo.email,
        name: demo.contact_name,
        companyName: demo.company_name,
        password: tempPassword,
        loginUrl,
        expiresAt
      });
    } catch (mailErr) {
      console.error('Willkommens-Mail fehlgeschlagen:', mailErr.message);
    }

    res.render('public/demo-success', {
      title: 'Demo aktiviert – IfDAU',
      alreadyActive: false,
      loginUrl,
      name: demo.contact_name,
      email: demo.email,
      password: tempPassword,
      expiresAt,
      trainingCount: demoTrainings.length
    });
  } catch (err) {
    console.error('Demo-Aktivierung Fehler:', err);
    renderError('Ein technischer Fehler ist aufgetreten. Bitte kontaktieren Sie uns: info@ifdau.de');
  }
});

module.exports = router;
