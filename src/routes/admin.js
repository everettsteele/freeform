// Admin API for Meridian services (Emmett, Gladys, Beacon, etc.).
//
// Gated by the Meridian Platform Contract HMAC — MERIDIAN_AGENT_SECRET,
// x-meridian-{timestamp,signature} headers, verified via
// src/meridian/hmac.js. Same auth surface as /api/meridian/*, so there's
// one signer library for every Freeform consumer.
//
// Scope:
//   POST /api/admin/form                       — idempotent upsert by slug
//   GET  /api/admin/form/:slug                 — read one
//   GET  /api/admin/form/:slug/responses       — recent submissions
//
// Writes scoped to the "system" admin user (ADMIN_EMAIL env var, same
// one the partner-form seed uses) so admin-provisioned forms appear in
// the UI.

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireHmac } = require('../meridian/contract-endpoints');
const { getDb } = require('../db');

const router = express.Router();

function adminAuth(req, res, next) {
  const secret = process.env.MERIDIAN_AGENT_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'admin API not configured (MERIDIAN_AGENT_SECRET unset)' });
  }
  return requireHmac(secret)(req, res, next);
}

function getSystemUserId(db) {
  const email = process.env.ADMIN_EMAIL || 'everett@neverstill.llc';
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return row ? row.id : null;
}

// POST /api/admin/form
// Body: { slug, title, description?, fields?, settings? }
router.post('/form', adminAuth, (req, res) => {
  const { slug, title, description, fields, settings } = req.body || {};
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/i.test(slug)) {
    return res.status(400).json({ error: 'slug must be [a-z0-9-]+' });
  }
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'title required' });
  }

  const db = getDb();
  const userId = getSystemUserId(db);
  if (!userId) {
    return res.status(503).json({ error: 'admin user not seeded — start the server once to trigger seeding' });
  }

  const existing = db.prepare('SELECT id FROM forms WHERE slug = ?').get(slug);
  const fieldsJson = JSON.stringify(Array.isArray(fields) ? fields : []);
  const settingsJson = JSON.stringify(settings && typeof settings === 'object' ? settings : {});

  if (existing) {
    db.prepare(`
      UPDATE forms
         SET title = ?, description = ?, fields_json = ?, settings_json = ?,
             updated_at = unixepoch()
       WHERE slug = ?
    `).run(title.trim(), description || null, fieldsJson, settingsJson, slug);
    return res.json({ ok: true, id: existing.id, slug, created: false });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO forms (id, user_id, slug, title, description, fields_json, settings_json, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, userId, slug, title.trim(), description || null, fieldsJson, settingsJson);
  res.json({ ok: true, id, slug, created: true });
});

router.get('/form/:slug', adminAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM forms WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({
    ...row,
    fields: JSON.parse(row.fields_json),
    settings: JSON.parse(row.settings_json),
  });
});

router.get('/form/:slug/responses', adminAuth, (req, res) => {
  const db = getDb();
  const form = db.prepare('SELECT id FROM forms WHERE slug = ?').get(req.params.slug);
  if (!form) return res.status(404).json({ error: 'form not found' });
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const rows = db.prepare(
    'SELECT id, data_json, submitter_ip, created_at FROM responses WHERE form_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(form.id, limit);
  res.json(rows.map((r) => ({
    id: r.id,
    data: JSON.parse(r.data_json),
    submitter_ip: r.submitter_ip,
    created_at: r.created_at,
  })));
});

module.exports = router;
