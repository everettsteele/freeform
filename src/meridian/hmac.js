// Meridian Platform Contract HMAC helpers.
//
// Canonical wire format (contract v1.0.0, matches @meridian-hq/metrics,
// Emmett, and Relay):
//
//   x-meridian-timestamp: <unix-milliseconds>    (NOT seconds)
//   x-meridian-signature: <raw-hex-hmac>         (NO "sha256=" prefix)
//
// Signed payload: `${timestamp}:${path}`         (path includes query, no method)
// Secret: MERIDIAN_AGENT_SECRET.
// Timestamp skew: reject if |now - ts| > MAX_SKEW_MS.

'use strict';

const crypto = require('crypto');

const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes

function canonicalPayload(timestampMs, path) {
  return `${timestampMs}:${path}`;
}

function hmacHex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function signRequest({ path, secret, now }) {
  if (!secret) throw new Error('signRequest: secret is required');
  if (!path) throw new Error('signRequest: path is required');

  const ts = String(now == null ? Date.now() : now);
  const sig = hmacHex(secret, canonicalPayload(ts, path));

  return {
    'x-meridian-timestamp': ts,
    'x-meridian-signature': sig,
  };
}

function verifyRequest({ path, headers, secret, now }) {
  if (!secret) return { ok: false, reason: 'no_secret_configured' };
  if (!headers) return { ok: false, reason: 'no_headers' };

  const ts =
    headers['x-meridian-timestamp'] || headers['X-Meridian-Timestamp'];
  const sigHeader =
    headers['x-meridian-signature'] || headers['X-Meridian-Signature'];

  if (!ts || !sigHeader) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) {
    return { ok: false, reason: 'bad_timestamp' };
  }

  const nowMs = now == null ? Date.now() : now;
  if (Math.abs(nowMs - tsNum) > MAX_SKEW_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }

  const expectedHex = hmacHex(secret, canonicalPayload(ts, path));
  const providedHex = String(sigHeader).toLowerCase();

  if (providedHex.length !== expectedHex.length) {
    return { ok: false, reason: 'bad_signature' };
  }
  try {
    const a = Buffer.from(providedHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length) {
      return { ok: false, reason: 'bad_signature' };
    }
    if (!crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad_signature' };
    }
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true };
}

module.exports = {
  signRequest,
  verifyRequest,
  MAX_SKEW_MS,
};
