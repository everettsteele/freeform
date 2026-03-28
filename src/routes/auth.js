const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const db = getDb();
  try {
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(id, email.toLowerCase().trim(), hash, name.trim());
    req.session.userId = id;
    req.session.userName = name;
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.userId = user.id;
  req.session.userName = user.name;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDb();
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.session.userId);
  res.json(user);
});

// Password reset — no email required.
// Set RESET_TOKEN in Railway env vars, then POST to /api/auth/reset-password
// with { token, email, new_password }
router.post('/reset-password', async (req, res) => {
  const resetToken = process.env.RESET_TOKEN;
  if (!resetToken) return res.status(503).json({ error: 'Password reset is not configured. Set RESET_TOKEN env var in Railway.' });

  const { token, email, new_password } = req.body;
  if (!token || !email || !new_password) return res.status(400).json({ error: 'token, email, and new_password are required' });
  if (token !== resetToken) return res.status(401).json({ error: 'Invalid reset token' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'No user found with that email' });

  const hash = await bcrypt.hash(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true, message: 'Password updated. You can now log in.' });
});

module.exports = router;
