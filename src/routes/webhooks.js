const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');
const { getDb } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/', requireAuth, (req, res) => {
  const { form_id, url } = req.body;
  if (!form_id || !url) return res.status(400).json({ error: 'form_id and url required' });
  const db = getDb();
  const form = db.prepare('SELECT id FROM forms WHERE id = ? AND user_id = ?').get(form_id, req.session.userId);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  const id = uuidv4();
  const secret = nanoid(24);
  db.prepare('INSERT INTO webhooks (id, form_id, url, secret) VALUES (?, ?, ?, ?)').run(id, form_id, url, secret);
  res.json({ ok: true, id, secret });
});

router.get('/:formId', requireAuth, (req, res) => {
  const db = getDb();
  const webhooks = db.prepare('SELECT * FROM webhooks WHERE form_id = ?').all(req.params.formId);
  res.json(webhooks);
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
