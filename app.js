require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const methodOverride = require('method-override');
const { initDatabase } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── View Engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'ifdau-default-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// ─── Template Locals ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/demo'));
app.use('/', require('./routes/user'));
app.use('/admin', require('./routes/admin'));

// ─── Error pages ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Seite nicht gefunden' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('404', { title: 'Serverfehler' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`\n✓ IfDAU läuft unter: http://localhost:${PORT}`);
      console.log('  Admin-Login: admin@ifdau.de / Admin2026!\n');
    });
    require('./utils/reminders').scheduleReminders();
  } catch (err) {
    console.error('Fehler beim Start:', err);
    process.exit(1);
  }
}

start();
