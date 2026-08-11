const path = require('path');

// Doble modo: si hay DB_HOST en .env usa MySQL (Hostinger); si no, SQLite local.
const usingMysql = !!process.env.DB_HOST;

let sqlite = null;
let pool = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS weights (
    date VARCHAR(10) PRIMARY KEY,
    kg DOUBLE NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meal_checks (
    date VARCHAR(10) NOT NULL,
    meal VARCHAR(20) NOT NULL,
    checked INT NOT NULL DEFAULT 0,
    alternative TEXT,
    PRIMARY KEY (date, meal)
  )`,
  `CREATE TABLE IF NOT EXISTS supplement_checks (
    date VARCHAR(10) NOT NULL,
    dose VARCHAR(10) NOT NULL,
    checked INT NOT NULL DEFAULT 0,
    PRIMARY KEY (date, dose)
  )`,
  `CREATE TABLE IF NOT EXISTS gym_sessions (
    date VARCHAR(10) PRIMARY KEY,
    routine_day INT NOT NULL,
    completed INT NOT NULL DEFAULT 0,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(50) PRIMARY KEY,
    value TEXT
  )`,
];

async function init() {
  if (usingMysql) {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4',
    });
    for (const sql of SCHEMA) await pool.query(sql);
    console.log(`Base de datos: MySQL (${process.env.DB_NAME} en ${process.env.DB_HOST})`);
  } else {
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch {
      throw new Error('better-sqlite3 no está instalado (es opcional y se usa solo en local). Corre `npm install`, o define DB_HOST en .env para usar MySQL.');
    }
    sqlite = new Database(path.join(__dirname, 'vitacontrol.db'));
    sqlite.pragma('journal_mode = WAL');
    for (const sql of SCHEMA) sqlite.exec(sql);
    console.log('Base de datos: SQLite local (vitacontrol.db)');
  }
}

async function all(sql, params = []) {
  if (usingMysql) {
    const [rows] = await pool.query(sql, params);
    return rows;
  }
  return sqlite.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}

async function run(sql, params = []) {
  if (usingMysql) {
    await pool.query(sql, params);
  } else {
    sqlite.prepare(sql).run(...params);
  }
}

// Inserta o actualiza según la llave primaria, en el dialecto que toque.
async function upsert(table, keys, data) {
  const cols = { ...keys, ...data };
  const names = Object.keys(cols);
  const quoted = names.map((c) => `\`${c}\``);
  const placeholders = names.map(() => '?').join(', ');
  let sql;
  if (usingMysql) {
    const updates = Object.keys(data).map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
    sql = `INSERT INTO ${table} (${quoted.join(', ')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  } else {
    const conflict = Object.keys(keys).map((c) => `\`${c}\``).join(', ');
    const updates = Object.keys(data).map((c) => `\`${c}\` = excluded.\`${c}\``).join(', ');
    sql = `INSERT INTO ${table} (${quoted.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updates}`;
  }
  await run(sql, Object.values(cols));
}

module.exports = { init, all, get, run, upsert };
