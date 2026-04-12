const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/connection');

// GET /
router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin/dashboard' : '/dashboard');
  }
  res.redirect('/login');
});

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin/dashboard' : '/dashboard');
  }
  res.render('auth/login', { title: 'Anmelden', error: null });
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('auth/login', { title: 'Anmelden', error: 'Bitte E-Mail und Passwort eingeben.' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND status = ?', [email.trim().toLowerCase(), 'active']);
    if (rows.length === 0) {
      return res.render('auth/login', { title: 'Anmelden', error: 'E-Mail oder Passwort falsch.' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('auth/login', { title: 'Anmelden', error: 'E-Mail oder Passwort falsch.' });
    }
    req.session.user = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, abteilung: user.abteilung, position: user.position
    };
    const returnTo = req.session.returnTo || (user.role === 'admin' ? '/admin/dashboard' : '/dashboard');
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('auth/login', { title: 'Anmelden', error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' });
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// GET /forgot-password
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { title: 'Passwort vergessen', message: null, error: null });
});

// POST /forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email?.trim().toLowerCase()]);
    // Always show success to prevent user enumeration
    if (rows.length > 0) {
      // In production: send reset email with token
      // For demo: just show message
      console.log(`Passwort-Reset angefordert für: ${email}`);
    }
    res.render('auth/forgot-password', {
      title: 'Passwort vergessen',
      message: 'Falls ein Konto mit dieser E-Mail existiert, erhalten Sie in Kürze eine E-Mail.',
      error: null
    });
  } catch (err) {
    console.error(err);
    res.render('auth/forgot-password', {
      title: 'Passwort vergessen',
      message: null,
      error: 'Ein Fehler ist aufgetreten.'
    });
  }
});

module.exports = router;
