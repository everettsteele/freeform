// Meridian Platform Contract v1.0.0 — Freeform.
//
// Contract endpoints expose Freeform's shape to the rest of the Meridian
// stack (Emmett for CFO rollups, Beacon for health, etc.). All responses
// follow the envelope { ok, data, meta: {version, generated_at} }.
//
// Routes:
//   GET /api/meridian/metrics   — usage stats (forms, responses)
//   GET /api/meridian/events    — recent submissions (truncated)
//   GET /api/meridian/billing   — stub; Freeform is free-tier internal
//   GET /api/meridian/health    — uptime + db reachability
//
// All require HMAC auth via MERIDIAN_AGENT_SECRET.

'use strict';

const { verifyRequest } = require('./hmac');
const { getDb } = require('../db');

const CONTRACT_VERSION = '1.0.0';
const startTime = Date.now();

function envelope(data) {
  return {
    ok: true,
    data,
    meta: { version: CONTRACT_VERSION, generated_at: new Date().toISOString() },
  };
}

function requireHmac(secret) {
  return function hmacMiddleware(req, res, next) {
    const signedPath = (req.originalUrl || req.url).split('?')[0];
    const result = verifyRequest({
      path: signedPath,
      headers: req.headers,
      secret,
    });
    if (!result.ok) {
      return res.status(403).json({
        ok: false,
        error: { code: 'forbidden', reason: result.reason },
        meta: { version: CONTRACT_VERSION, generated_at: new Date().toISOString() },
      });
    }
    return next();
  };
}

function metricsHandler(req, res) {
  try {
    const db = getDb();
    const forms = db.prepare('SELECT COUNT(*) AS c FROM forms WHERE is_active = 1').get().c;
    const responses30d = db.prepare(
      "SELECT COUNT(*) AS c FROM responses WHERE created_at >= (unixepoch() - 30*86400)"
    ).get().c;
    const responsesTotal = db.prepare('SELECT COUNT(*) AS c FROM responses').get().c;
    res.json(envelope({
      mrr_cents: 0,                   // Freeform is free/internal — no MRR.
      customers_active: forms,        // Active forms ~= "customers" in Freeform's model.
      customers_new_30d: 0,
      customers_churned_30d: 0,
      users_active_30d: 0,
      api_cost_mtd_cents: 0,
      // Freeform-specific counters alongside the contract fields.
      forms_active: forms,
      responses_30d: responses30d,
      responses_total: responsesTotal,
    }));
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'metrics_error', reason: err.message },
      meta: { version: CONTRACT_VERSION, generated_at: new Date().toISOString() },
    });
  }
}

function eventsHandler(req, res) {
  try {
    const db = getDb();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const rows = db.prepare(
      `SELECT r.id, r.form_id, r.created_at, f.slug
         FROM responses r
         JOIN forms f ON f.id = r.form_id
        ORDER BY r.created_at DESC
        LIMIT ?`
    ).all(limit);
    res.json(envelope({
      events: rows.map((r) => ({
        id: r.id,
        type: 'form_response',
        form_slug: r.slug,
        occurred_at: r.created_at,
      })),
    }));
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: { code: 'events_error', reason: err.message },
      meta: { version: CONTRACT_VERSION, generated_at: new Date().toISOString() },
    });
  }
}

function billingHandler(req, res) {
  // Freeform is internal / free-tier. No billing surface; respond with
  // a valid envelope so callers don't 403 on a missing route.
  res.json(envelope({
    mrr_cents: 0,
    plan: 'internal',
    next_invoice_at: null,
  }));
}

function healthHandler(req, res) {
  let dbReachable = true;
  try { getDb().prepare('SELECT 1').get(); } catch { dbReachable = false; }
  res.json(envelope({
    service: 'freeform',
    uptime_s: Math.floor((Date.now() - startTime) / 1000),
    db_reachable: dbReachable,
  }));
}

function register(app, secret) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('register: expected an Express app');
  }
  const hmac = requireHmac(secret);
  app.get('/api/meridian/metrics', hmac, metricsHandler);
  app.get('/api/meridian/events', hmac, eventsHandler);
  app.get('/api/meridian/billing', hmac, billingHandler);
  app.get('/api/meridian/health', hmac, healthHandler);
  // eslint-disable-next-line no-console
  console.log('[meridian/contract] registered /api/meridian/{metrics,events,billing,health}');
}

module.exports = {
  register,
  requireHmac,
  metricsHandler,
  eventsHandler,
  billingHandler,
  healthHandler,
  CONTRACT_VERSION,
};
