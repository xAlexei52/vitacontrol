require('dotenv').config();
const express = require('express');
const path = require('path');
const { ensureAdminUser } = require('./db');
const { router: authRouter, requireAuth } = require('./routes/auth');
const apiRouter = require('./routes/api');

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en .env (copia .env.example a .env)');
  process.exit(1);
}

ensureAdminUser();

const app = express();
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, apiRouter);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VitaControl corriendo en http://localhost:${PORT}`);
});
