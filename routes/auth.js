const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Límite de intentos: 5 fallos → bloqueo de 15 minutos por IP
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map();

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

router.post('/login', (req, res) => {
  const ip = req.ip || 'local';
  const entry = attempts.get(ip) || { fails: 0, until: 0 };
  if (entry.until > Date.now()) {
    const min = Math.ceil((entry.until - Date.now()) / 60000);
    return res.status(429).json({ error: `Demasiados intentos. Espera ${min} min` });
  }

  const { pin } = req.body || {};
  if (!pin || !/^\d{4,8}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN inválido' });
  }
  if (!safeEqual(pin, process.env.PIN)) {
    entry.fails += 1;
    if (entry.fails >= MAX_FAILS) {
      entry.until = Date.now() + LOCK_MS;
      entry.fails = 0;
    }
    attempts.set(ip, entry);
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  attempts.delete(ip);
  const token = jwt.sign({ ok: true }, process.env.JWT_SECRET, { expiresIn: '365d' });
  res.json({ token });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada, vuelve a entrar' });
  }
}

module.exports = { router, requireAuth };
