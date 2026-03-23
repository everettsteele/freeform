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
  const { title, description, fields, settings } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const db = getDb();
  const id = uuidv4();
  const slug = nanoid(10);
  db.prepare('INSERT INTO forms (id, user_id, slug, title, description, fields_json, settings_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id, req.session.userId, slug, title.trim(),
    description || null,
    JSON.stringify(fields || []),
    JSON.stringify(settings || {})
  );
  res.json({ ok: true, id, slug });
});

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const forms = db.prepare('SELECT f.*, (SELECT COUNT(*) FROM responses r WHERE r.form_id = f.id) as response_count FROM forms f WHERE f.user_id = ? ORDER BY f.created_at DESC').all(req.session.userId);
  res.json(forms.map(f => ({ ...f, fields: JSON.parse(f.fields_json), settings: JSON.parse(f.settings_json) })));
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const form = db.prepare('SELECT * FROM forms WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!form) return res.status(404).json({ error: 'Not found' });
  res.json({ ...form, fields: JSON.parse(form.fields_json), settings: JSON.parse(form.settings_json) });
});

router.put('/:id', requireAuth, (req, res) => {
  const { title, description, fields, settings, is_active } = req.body;
  const db = getDb();
  const form = db.prepare('SELECT id FROM forms WHERE id = ? AND user_id = ?').get(req.params.id, req.session.userId);
  if (!form) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE forms SET title=?, description=?, fields_json=?, settings_json=?, is_active=?, updated_at=unixepoch() WHERE id=?').run(
    title, description || null,
    JSON.stringify(fields || []),
    JSON.stringify(settings || {}),
    is_active !== undefined ? (is_active ? 1 : 0) : 1,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM forms WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Public: get form by slug for rendering
router.get('/public/:slug', (req, res) => {
  const db = getDb();
  const form = db.prepare('SELECT * FROM forms WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!form) return res.status(404).json({ error: 'Form not found or inactive' });
  res.json({ ...form, fields: JSON.parse(form.fields_json), settings: JSON.parse(form.settings_json) });
});

module.exports = router;
