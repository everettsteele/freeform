const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Public: submit a response
router.post('/submit/:slug', async (req, res) => {
  const db = getDb();
  const form = db.prepare('SELECT * FROM forms WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!form) return res.status(404).json({ error: 'Form not found' });

  const fields = JSON.parse(form.fields_json);
  const data = {};
  const errors = {};

  for (const field of fields) {
    const val = req.body[field.id];
    if (field.required && (!val || (Array.isArray(val) && !val.length))) {
      errors[field.id] = `${field.label} is required`;
    } else {
      data[field.id] = { label: field.label, value: val || null, type: field.type };
    }
  }

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const id = uuidv4();
  const ip = req.ip || req.connection.remoteAddress;
  db.prepare('INSERT INTO responses (id, form_id, data_json, submitter_ip) VALUES (?, ?, ?, ?)').run(
    id, form.id, JSON.stringify(data), ip
  );

  // Fire webhooks (stub — async, don't await)
  fireWebhooks(form.id, data).catch(() => {});

  const settings = JSON.parse(form.settings_json);
  res.json({ ok: true, redirect: settings.redirect_url || null, message: settings.success_message || 'Thanks for your response.' });
});

async function fireWebhooks(formId, data) {
  const db = getDb();
  const webhooks = db.prepare('SELECT * FROM webhooks WHERE form_id = ? AND is_active = 1').all(formId);
  for (const wh of webhooks) {
    try {
      await fetch(wh.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(wh.secret ? { 'X-Freeform-Secret': wh.secret } : {}) },
        body: JSON.stringify({ form_id: formId, data })
      });
    } catch (e) { /* silent fail */ }
  }
}

// Authenticated: get responses for a form
router.get('/:formId', requireAuth, (req, res) => {
  const db = getDb();
  const form = db.prepare('SELECT id FROM forms WHERE id = ? AND user_id = ?').get(req.params.formId, req.session.userId);
  if (!form) return res.status(404).json({ error: 'Not found' });
  const responses = db.prepare('SELECT * FROM responses WHERE form_id = ? ORDER BY created_at DESC').all(req.params.formId);
  res.json(responses.map(r => ({ ...r, data: JSON.parse(r.data_json) })));
});

// Authenticated: export CSV
router.get('/:formId/csv', requireAuth, (req, res) => {
  const db = getDb();
  const form = db.prepare('SELECT * FROM forms WHERE id = ? AND user_id = ?').get(req.params.formId, req.session.userId);
  if (!form) return res.status(404).json({ error: 'Not found' });
  const fields = JSON.parse(form.fields_json);
  const responses = db.prepare('SELECT * FROM responses WHERE form_id = ? ORDER BY created_at ASC').all(req.params.formId);

  const headers = ['Submitted At', ...fields.map(f => f.label)];
  const rows = responses.map(r => {
    const data = JSON.parse(r.data_json);
    return [
      new Date(r.created_at * 1000).toISOString(),
      ...fields.map(f => {
        const v = data[f.id]?.value;
        return Array.isArray(v) ? v.join(', ') : (v || '');
      })
    ];
  });

  const csv = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${form.slug}-responses.csv"`);
  res.send(csv);
});

// Authenticated: delete a response
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM responses WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
