require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3004;

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'freeform-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function serve(res, name) {
  res.sendFile(path.join(__dirname, '../views', name));
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/responses', require('./routes/responses'));
app.use('/api/webhooks', require('./routes/webhooks'));

app.get('/', (req, res) => res.redirect(req.session.userId ? '/dashboard' : '/login'));
app.get('/login', (req, res) => serve(res, 'login.html'));
app.get('/register', (req, res) => serve(res, 'register.html'));
app.get('/dashboard', requireAuth, (req, res) => serve(res, 'dashboard.html'));
app.get('/forms/new', requireAuth, (req, res) => serve(res, 'builder.html'));
app.get('/forms/:id/edit', requireAuth, (req, res) => serve(res, 'builder.html'));
app.get('/forms/:id/responses', requireAuth, (req, res) => serve(res, 'responses.html'));
app.get('/f/:slug', (req, res) => serve(res, 'form.html'));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'freeform' }));

app.listen(PORT, () => console.log(`FREEFORM running on port ${PORT}`));
