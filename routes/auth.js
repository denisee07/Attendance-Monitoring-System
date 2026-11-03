const { db, hashPassword, verifyPassword, hashPin, verifyPin, genPin, genToken, nowStr } = require('../db');
const { json, fail } = require('./respond');

const TOKEN_TTL_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(u) {
  if (!u) return null;
  const o = { ...u };
  delete o.passwordHash;
  delete o.salt;
  delete o.pinHash;
  return o;
}

function createSession(userId) {
  const token = genToken();
  const expires = new Date();
  expires.setDate(expires.getDate() + TOKEN_TTL_DAYS);
  db.prepare(`INSERT INTO sessions (token,userId,createdAt,expiresAt) VALUES (?,?,?,?)`)
    .run(token, userId, nowStr(), expires.toISOString().slice(0, 19).replace('T', ' '));
  return token;
}

function destroySession(token) {
  if (!token) return;
  try { db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token); } catch (e) { /* ignore */ }
}

function findByUsernameOrEmail(usernameOrEmail) {
  const val = String(usernameOrEmail || '').trim().toLowerCase();
  const byUsername = db.prepare(`SELECT * FROM users WHERE username = ?`).get(val);
  if (byUsername) return byUsername;
  const byEmail = db.prepare(`SELECT * FROM users WHERE email = ?`).get(val);
  return byEmail || null;
}

function authenticate(token) {
  if (!token) return null;
  const s = db.prepare(`SELECT * FROM sessions WHERE token = ?`).get(token);
  if (!s) return null;
  const exp = new Date(String(s.expiresAt));
  if (exp < new Date()) {
    destroySession(token);
    return null;
  }
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(s.userId));
  if (!u) return null;
  return u;
}

async function login(req, res) {
  const body = req.body || {};
  const usernameOrEmail = String(body.usernameOrEmail || body.username || body.email || '').trim();
  const password = String(body.password || '');
  const pin = body.pin === null || body.pin === undefined ? '' : String(body.pin).trim();
  if (!usernameOrEmail || !password) {
    return fail(res, 400, 'Please enter both username/email and passcode/password.');
  }
  const user = findByUsernameOrEmail(usernameOrEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return fail(res, 401, 'Invalid credentials. Please check your username/email and password.');
  }
  if (user.pinHash) {
    if (!pin || !verifyPin(pin, user.pinHash)) {
      return fail(res, 401, 'Invalid passcode. Please enter the correct 6-digit passcode to sign in.');
    }
  }
  const token = createSession(Number(user.id));
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(user.id));
  return json(res, 200, { success: true, data: { token, user: publicUser(u) } });
}

async function logout(req, res) {
  destroySession(req.headers['x-auth-token']);
  return json(res, 200, { success: true, data: { ok: true } });
}

async function me(req, res) {
  const u = req.user;
  if (!u) return fail(res, 401, 'Not authenticated.');
  return json(res, 200, { success: true, data: { user: publicUser(u) } });
}

async function changePin(req, res) {
  const u = req.user;
  const body = req.body || {};
  const currentPassword = String(body.currentPassword || '');
  const newPin = String(body.newPin || '').trim();
  if (!u) return fail(res, 401, 'Not authenticated.');
  if (!currentPassword) return fail(res, 400, 'Please enter your current password.');
  if (!/^\d{6}$/.test(newPin)) return fail(res, 400, 'The new passcode must be a 6-digit number.');
  const fresh = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(u.id));
  if (!fresh) return fail(res, 404, 'User not found.');
  if (!verifyPassword(currentPassword, fresh.passwordHash)) return fail(res, 401, 'Current password is incorrect.');
  db.prepare(`UPDATE users SET pinHash = ? WHERE id = ?`).run(hashPin(newPin), Number(u.id));
  const updated = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(u.id));
  return json(res, 200, { success: true, data: { ok: true, user: publicUser(updated) } });
}

async function register(req, res) {
  const body = req.body || {};
  const username = String(body.username || '').trim().toLowerCase();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();
  const gradeLevel = body.gradeLevel === null || body.gradeLevel === undefined || body.gradeLevel === '' ? null : Number(body.gradeLevel);
  const section = String(body.section || '').trim();
  if (!username || !email || !password || !fullName) {
    return fail(res, 400, 'Username, email, password and full name are required.');
  }
  if (!/^[a-z0-9_.-]{3,}$/.test(username)) {
    return fail(res, 400, 'Username must be at least 3 characters (letters, numbers, dots, dashes, underscores).');
  }
  if (!EMAIL_RE.test(email)) {
    return fail(res, 400, 'Please enter a valid email address.');
  }
  if (password.length < 6) {
    return fail(res, 400, 'Password must be at least 6 characters.');
  }
  if (gradeLevel !== null && (gradeLevel < 7 || gradeLevel > 12)) {
    return fail(res, 400, 'Grade level must be between 7 and 12.');
  }
  const exists = db.prepare(`SELECT * FROM users WHERE username = ? OR email = ?`).get(username, email);
  if (exists) {
    return fail(res, 409, 'Username or email already exists.');
  }
  const now = nowStr();
  const pin = String(body.pin || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    return fail(res, 400, 'Please enter a valid 6-digit passcode.');
  }
  const userId = db.prepare(`INSERT INTO users (username,email,passwordHash,salt,role,fullName,studentId,createdAt,pinHash) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(username, email, hashPassword(password), '', 'student', fullName, null, now, hashPin(pin)).lastInsertRowid;
  const studentNo = `STU-${new Date().getFullYear()}-${String(Number(db.prepare(`SELECT COUNT(*) AS c FROM students`).get().c || 0) + 1).padStart(3, '0')}`;
  db.prepare(`INSERT INTO students (studentNo,fullName,gender,gradeLevel,section,schoolYear,contact,userId,createdAt) VALUES (?,?,?,?,?,?,?,NULL,?)`)
    .run(studentNo, fullName, body.gender || null, body.gradeLevel ? Number(body.gradeLevel) : null, body.section || null, '2025-2026', body.contact || null, Number(userId), now);
  const token = createSession(Number(userId));
  const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(userId));
  return json(res, 201, { success: true, data: { token, user: publicUser(u), pin } });
}

module.exports = { login, logout, me, register, changePin, authenticate, publicUser, createSession, destroySession, findByUsernameOrEmail };
