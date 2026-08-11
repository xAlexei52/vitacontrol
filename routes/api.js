const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

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

// Envuelve handlers async para que los errores lleguen al manejador de Express
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ---- Contenido (menú y rutinas) ----
router.get('/content', (req, res) => {
  res.json({ dieta: loadJson('dieta.json'), rutinas: loadJson('rutinas.json') });
});

// ---- Estado de un día ----
router.get('/day/:date', validDate, wrap(async (req, res) => {
  const { date } = req.params;
  const weight = await db.get('SELECT kg FROM weights WHERE date = ?', [date]);
  const meals = {};
  for (const row of await db.all('SELECT meal, checked, alternative FROM meal_checks WHERE date = ?', [date])) {
    meals[row.meal] = { checked: !!row.checked, alternative: row.alternative };
  }
  const supplements = {};
  for (const row of await db.all('SELECT dose, checked FROM supplement_checks WHERE date = ?', [date])) {
    supplements[row.dose] = !!row.checked;
  }
  const gym = await db.get('SELECT routine_day, completed, notes FROM gym_sessions WHERE date = ?', [date]);
  res.json({
    date,
    weight: weight ? weight.kg : null,
    meals,
    supplements,
    gym: gym ? { routineDay: gym.routine_day, completed: !!gym.completed, notes: gym.notes } : null,
  });
}));

router.put('/day/:date/meal', validDate, wrap(async (req, res) => {
  const { meal, checked, alternative } = req.body || {};
  if (!MEALS.includes(meal)) return res.status(400).json({ error: 'Comida inválida' });
  await db.upsert('meal_checks',
    { date: req.params.date, meal },
    { checked: checked ? 1 : 0, alternative: alternative || null });
  res.json({ ok: true });
}));

router.put('/day/:date/supplement', validDate, wrap(async (req, res) => {
  const { dose, checked } = req.body || {};
  if (!DOSES.includes(dose)) return res.status(400).json({ error: 'Toma inválida' });
  await db.upsert('supplement_checks',
    { date: req.params.date, dose },
    { checked: checked ? 1 : 0 });
  res.json({ ok: true });
}));

router.put('/day/:date/weight', validDate, wrap(async (req, res) => {
  const { kg } = req.body || {};
  if (kg === null || kg === '' || kg === undefined) {
    await db.run('DELETE FROM weights WHERE date = ?', [req.params.date]);
    return res.json({ ok: true });
  }
  const value = Number(kg);
  if (!Number.isFinite(value) || value < 20 || value > 400) {
    return res.status(400).json({ error: 'Peso inválido' });
  }
  await db.upsert('weights', { date: req.params.date }, { kg: value });
  res.json({ ok: true });
}));

router.put('/day/:date/gym', validDate, wrap(async (req, res) => {
  const { routineDay, completed, notes } = req.body || {};
  const day = Number(routineDay);
  if (!Number.isInteger(day) || day < 1 || day > 5) {
    return res.status(400).json({ error: 'Día de rutina inválido (1-5)' });
  }
  if (!completed) {
    await db.run('DELETE FROM gym_sessions WHERE date = ?', [req.params.date]);
    return res.json({ ok: true });
  }
  await db.upsert('gym_sessions',
    { date: req.params.date },
    { routine_day: day, completed: 1, notes: notes || null });
  res.json({ ok: true });
}));

// ---- Progreso ----
router.get('/progress', wrap(async (req, res) => {
  const { from, to } = req.query;
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
    return res.status(400).json({ error: 'Usa ?from=YYYY-MM-DD&to=YYYY-MM-DD' });
  }
  const weights = await db.all('SELECT date, kg FROM weights WHERE date BETWEEN ? AND ? ORDER BY date', [from, to]);
  const mealRows = await db.all(
    'SELECT date, COUNT(*) AS checked FROM meal_checks WHERE checked = 1 AND date BETWEEN ? AND ? GROUP BY date', [from, to]);
  const suppRows = await db.all(
    'SELECT date, COUNT(*) AS checked FROM supplement_checks WHERE checked = 1 AND date BETWEEN ? AND ? GROUP BY date', [from, to]);
  const gymRows = await db.all(
    'SELECT date, routine_day FROM gym_sessions WHERE completed = 1 AND date BETWEEN ? AND ? ORDER BY date', [from, to]);

  const days = {};
  for (const r of mealRows) days[r.date] = { ...days[r.date], meals: Number(r.checked) };
  for (const r of suppRows) days[r.date] = { ...days[r.date], supplements: Number(r.checked) };
  for (const r of gymRows) days[r.date] = { ...days[r.date], gym: r.routine_day };

  res.json({ weights, days, mealsPerDay: MEALS.length, dosesPerDay: DOSES.length });
}));

// ---- Ajustes ----
router.get('/settings', wrap(async (req, res) => {
  const rows = await db.all('SELECT `key`, value FROM settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
}));

router.put('/settings', wrap(async (req, res) => {
  const allowed = ['targetWeight', 'lastLabDate'];
  for (const key of allowed) {
    if (key in (req.body || {})) {
      await db.upsert('settings', { key }, { value: String(req.body[key] ?? '') });
    }
  }
  res.json({ ok: true });
}));

module.exports = router;
