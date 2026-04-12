function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).render('403', { title: 'Zugriff verweigert', user: req.session.user || null });
}

module.exports = { isAuthenticated, isAdmin };
