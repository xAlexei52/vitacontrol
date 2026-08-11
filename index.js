require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const { router: authRouter, requireAuth } = require('./routes/auth');
const apiRouter = require('./routes/api');

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en .env (copia .env.example a .env)');
  process.exit(1);
}
if (!process.env.PIN || !/^\d{4,8}$/.test(process.env.PIN)) {
  console.error('Falta PIN en .env (4 a 8 dígitos, ej. PIN=2468)');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // detrás del proxy de Hostinger, req.ip usa X-Forwarded-For
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);

// no-cache = el navegador siempre revalida (304 si no cambió); evita
// quedarse con CSS/JS viejos tras un deploy
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`VitaControl corriendo en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo conectar a la base de datos:', err.message);
    process.exit(1);
  });
