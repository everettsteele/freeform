const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/freeform.db');

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    seedPartnerForm(db);
  }
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      fields_json TEXT NOT NULL DEFAULT '[]',
      settings_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS responses (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id),
      data_json TEXT NOT NULL,
      submitter_ip TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL REFERENCES forms(id),
      url TEXT NOT NULL,
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

function seedPartnerForm(db) {
  // Ensure the system user exists
  const SYSTEM_EMAIL = process.env.ADMIN_EMAIL || 'everett@neverstill.llc';
  const SYSTEM_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SESSION_SECRET || 'changeme';
  const PARTNER_SLUG = 'partner-inquiry';

  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(SYSTEM_EMAIL);
  if (!user) {
    const hash = bcrypt.hashSync(SYSTEM_PASSWORD, 10);
    const id = uuidv4();
    db.prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)').run(
      id, SYSTEM_EMAIL, hash, 'Everett Steele'
    );
    user = { id };
    console.log('[freeform] Seeded admin user:', SYSTEM_EMAIL);
  }

  // Ensure the partner inquiry form exists with a fixed slug
  const existing = db.prepare('SELECT id FROM forms WHERE slug = ?').get(PARTNER_SLUG);
  if (!existing) {
    db.prepare(`
      INSERT INTO forms (id, user_id, slug, title, description, fields_json, settings_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      uuidv4(),
      user.id,
      PARTNER_SLUG,
      'Partner Inquiry',
      'Meridian partner program application',
      JSON.stringify([]),
      JSON.stringify({ success_message: 'Application received. Everett will respond within 48 hours.' })
    );
    console.log('[freeform] Seeded partner inquiry form with slug:', PARTNER_SLUG);
  }
}

module.exports = { getDb };
