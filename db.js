const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'vitacontrol.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weights (
    date TEXT PRIMARY KEY,
    kg REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meal_checks (
    date TEXT NOT NULL,
    meal TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    alternative TEXT,
    PRIMARY KEY (date, meal)
  );

  CREATE TABLE IF NOT EXISTS supplement_checks (
    date TEXT NOT NULL,
    dose TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, dose)
  );

  CREATE TABLE IF NOT EXISTS gym_sessions (
    date TEXT PRIMARY KEY,
    routine_day INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Usuario inicial desde .env, solo si no existe ninguno
function ensureAdminUser() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .run(process.env.ADMIN_EMAIL.toLowerCase().trim(), hash);
    console.log(`Usuario inicial creado: ${process.env.ADMIN_EMAIL}`);
  }
}

module.exports = { db, ensureAdminUser };
