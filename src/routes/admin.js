// Admin API — lets other Meridian services (Emmett, Gladys, etc.)
// programmatically provision forms without operating a session. Gated
// behind FREEFORM_ADMIN_SECRET sent as the `x-meridian-admin-secret`
// header; compared via timingSafeEqual to avoid byte-by-byte leaks.
//
// All write operations are scoped to the "system" admin user (resolved
// by ADMIN_EMAIL env var, same one the partner-form seed uses). That
// keeps admin-provisioned forms visible in the dashboard UI without
// needing a per-service user.
//
// Idempotent upsert on slug: calling POST /api/admin/form twice with
// the same slug returns the same form row and overwrites title/fields
// in place. Callers should treat slug as the stable identity.

'use strict';

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();

function adminAuth(req, res, next) {
  const expected = process.env.FREEFORM_ADMIN_SECRET;
  if (!expected) {
    return res.status(503).json({ error: 'admin API not configured (FREEFORM_ADMIN_SECRET unset)' });
  }
  const given = req.header('x-meridian-admin-secret') || '';
  // Lengths must match before timingSafeEqual — the fn throws on length mismatch.
  if (given.length !== expected.length) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// Resolve the system/admin user id for admin-provisioned rows. Mirrors
// the seedPartnerForm() convention — looks up by ADMIN_EMAIL; never
// creates one here (the seed path owns user creation).
function getSystemUserId(db) {
  const email = process.env.ADMIN_EMAIL || 'everett@neverstill.llc';
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  return row ? row.id : null;
}

// ── POST /api/admin/form ─────────────────────────────────────────────
// Upsert a form by slug. Body: {slug, title, description?, fields?, settings?}.
// Returns {ok, id, slug, created} where created=true if a new row was inserted.
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

// ── GET /api/admin/form/:slug ─────────────────────────────────────────
// Read a form by slug (admin view — returns everything including id).
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

// ── GET /api/admin/form/:slug/responses ───────────────────────────────
// Read recent responses for a form. Limit via ?limit=N (default 100, max 500).
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
