const express = require('express');
const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const router = express.Router();

const MEALS = ['desayuno', 'colacion1', 'comida', 'colacion2', 'cena'];
const DOSES = ['manana', 'noche'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', name), 'utf8'));
}

function validDate(req, res, next) {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: 'Fecha inválida, usa YYYY-MM-DD' });
  }
  next();
}

// ---- Contenido (menú y rutinas) ----
router.get('/content', (req, res) => {
  res.json({ dieta: loadJson('dieta.json'), rutinas: loadJson('rutinas.json') });
});

// ---- Estado de un día ----
router.get('/day/:date', validDate, (req, res) => {
  const { date } = req.params;
  const weight = db.prepare('SELECT kg FROM weights WHERE date = ?').get(date);
  const meals = {};
  for (const row of db.prepare('SELECT meal, checked, alternative FROM meal_checks WHERE date = ?').all(date)) {
    meals[row.meal] = { checked: !!row.checked, alternative: row.alternative };
  }
  const supplements = {};
  for (const row of db.prepare('SELECT dose, checked FROM supplement_checks WHERE date = ?').all(date)) {
    supplements[row.dose] = !!row.checked;
  }
  const gym = db.prepare('SELECT routine_day, completed, notes FROM gym_sessions WHERE date = ?').get(date);
  res.json({
    date,
    weight: weight ? weight.kg : null,
    meals,
    supplements,
    gym: gym ? { routineDay: gym.routine_day, completed: !!gym.completed, notes: gym.notes } : null,
  });
});

router.put('/day/:date/meal', validDate, (req, res) => {
  const { meal, checked, alternative } = req.body || {};
  if (!MEALS.includes(meal)) return res.status(400).json({ error: 'Comida inválida' });
  db.prepare(`
    INSERT INTO meal_checks (date, meal, checked, alternative) VALUES (?, ?, ?, ?)
    ON CONFLICT(date, meal) DO UPDATE SET checked = excluded.checked, alternative = excluded.alternative
  `).run(req.params.date, meal, checked ? 1 : 0, alternative || null);
  res.json({ ok: true });
});

router.put('/day/:date/supplement', validDate, (req, res) => {
  const { dose, checked } = req.body || {};
  if (!DOSES.includes(dose)) return res.status(400).json({ error: 'Toma inválida' });
  db.prepare(`
    INSERT INTO supplement_checks (date, dose, checked) VALUES (?, ?, ?)
    ON CONFLICT(date, dose) DO UPDATE SET checked = excluded.checked
  `).run(req.params.date, dose, checked ? 1 : 0);
  res.json({ ok: true });
});

router.put('/day/:date/weight', validDate, (req, res) => {
  const { kg } = req.body || {};
  if (kg === null || kg === '' || kg === undefined) {
    db.prepare('DELETE FROM weights WHERE date = ?').run(req.params.date);
    return res.json({ ok: true });
  }
  const value = Number(kg);
  if (!Number.isFinite(value) || value < 20 || value > 400) {
    return res.status(400).json({ error: 'Peso inválido' });
  }
  db.prepare(`
    INSERT INTO weights (date, kg) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET kg = excluded.kg
  `).run(req.params.date, value);
  res.json({ ok: true });
});

router.put('/day/:date/gym', validDate, (req, res) => {
  const { routineDay, completed, notes } = req.body || {};
  const day = Number(routineDay);
  if (!Number.isInteger(day) || day < 1 || day > 5) {
    return res.status(400).json({ error: 'Día de rutina inválido (1-5)' });
  }
  if (!completed) {
    db.prepare('DELETE FROM gym_sessions WHERE date = ?').run(req.params.date);
    return res.json({ ok: true });
  }
  db.prepare(`
    INSERT INTO gym_sessions (date, routine_day, completed, notes) VALUES (?, ?, 1, ?)
    ON CONFLICT(date) DO UPDATE SET routine_day = excluded.routine_day, completed = 1, notes = excluded.notes
  `).run(req.params.date, day, notes || null);
  res.json({ ok: true });
});

// ---- Progreso ----
router.get('/progress', (req, res) => {
  const { from, to } = req.query;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
    return res.status(400).json({ error: 'Usa ?from=YYYY-MM-DD&to=YYYY-MM-DD' });
  }
  const weights = db.prepare('SELECT date, kg FROM weights WHERE date BETWEEN ? AND ? ORDER BY date').all(from, to);
  const mealRows = db.prepare(
    'SELECT date, COUNT(*) AS checked FROM meal_checks WHERE checked = 1 AND date BETWEEN ? AND ? GROUP BY date'
  ).all(from, to);
  const suppRows = db.prepare(
    'SELECT date, COUNT(*) AS checked FROM supplement_checks WHERE checked = 1 AND date BETWEEN ? AND ? GROUP BY date'
  ).all(from, to);
  const gymRows = db.prepare(
    'SELECT date, routine_day FROM gym_sessions WHERE completed = 1 AND date BETWEEN ? AND ? ORDER BY date'
  ).all(from, to);

  const days = {};
  for (const r of mealRows) days[r.date] = { ...days[r.date], meals: r.checked };
  for (const r of suppRows) days[r.date] = { ...days[r.date], supplements: r.checked };
  for (const r of gymRows) days[r.date] = { ...days[r.date], gym: r.routine_day };

  res.json({ weights, days, mealsPerDay: MEALS.length, dosesPerDay: DOSES.length });
});

// ---- Ajustes ----
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const allowed = ['targetWeight', 'lastLabDate'];
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const key of allowed) {
    if (key in (req.body || {})) upsert.run(key, String(req.body[key] ?? ''));
  }
  res.json({ ok: true });
});

module.exports = router;
