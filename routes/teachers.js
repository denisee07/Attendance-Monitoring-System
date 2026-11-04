const { db, hashTeacher, hashPassword } = require('../db');
const { json, fail } = require('./respond');

function list(req, res) {
  const rows = db.prepare(`SELECT * FROM teachers ORDER BY fullName ASC`).all();
  const data = rows.map((r) => ({
    id: Number(r.id),
    teacherNo: r.teacherNo,
    fullName: r.fullName,
    email: r.email,
    subject: r.subject,
    gradeLevels: r.gradeLevels ? JSON.parse(r.gradeLevels) : [],
    sections: r.sections ? JSON.parse(r.sections) : [],
    username: r.username,
    userId: r.userId === null ? null : Number(r.userId),
    createdAt: r.createdAt,
  }));
  return json(res, 200, { success: true, data: { teachers: data, total: data.length } });
}

function create(req, res) {
  const b = req.body || {};
  const teacherNo = String(b.teacherNo || '').trim();
  const fullName = String(b.fullName || '').trim();
  const username = String(b.username || '').trim().toLowerCase();
  const password = String(b.password || '');
  const subject = String(b.subject || '').trim();
  if (!teacherNo || !fullName) return fail(res, 400, 'Teacher number and full name are required.');
  if (!username || !password) return fail(res, 400, 'Username and password are required.');
  if (!/^[a-z0-9_.-]{3,}$/.test(username)) return fail(res, 400, 'Username must be at least 3 characters (letters, numbers, dots, dashes, underscores).');
  if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.');
  if (!subject) return fail(res, 400, 'Subject is required.');
  const dup = db.prepare(`SELECT * FROM teachers WHERE teacherNo = ? OR username = ?`).get(teacherNo, username);
  if (dup) return fail(res, 409, 'Teacher number or username already exists.');
  const teacher = hashTeacher(teacherNo, fullName, b.email, subject, b.gradeLevels ? b.gradeLevels : [], b.sections ? b.sections : [], username, password);
  return json(res, 201, { success: true, data: { teacher } });
}

function update(req, res) {
  const id = Number(req.params.id);
  const b = req.body || {};
  const t = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(id);
  if (!t) return fail(res, 404, 'Teacher not found.');
  const fullName = String(b.fullName || t.fullName).trim();
  const username = String(b.username || t.username || '').trim().toLowerCase();
  if (!fullName) return fail(res, 400, 'Full name is required.');
  const hashed = b.password ? hashPassword(b.password) : (t.passwordHash || '');
  const salt = b.password ? hashPassword(b.password).split(':')[0] : (t.salt || '');
  db.prepare(`UPDATE teachers SET fullName = ?, email = ?, subject = ?, gradeLevels = ?, sections = ?, username = ?, passwordHash = ?, salt = ?, userId = ? WHERE id = ?`)
    .run(fullName, b.email || null, b.subject || null, b.gradeLevels ? JSON.stringify(b.gradeLevels) : (t.gradeLevels || null), b.sections ? JSON.stringify(b.sections) : (t.sections || null), username, hashed, salt, b.password ? null : (t.userId || null), id);
  if (b.password && t.userId) {
    db.prepare(`UPDATE users SET fullName = ?, email = ?, passwordHash = ?, salt = ? WHERE id = ?`).run(fullName, b.email || null, hashed, salt, t.userId);
  }
  const updated = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(id);
  return json(res, 200, { success: true, data: { teacher: updated } });
}

function remove(req, res) {
  const id = Number(req.params.id);
  const t = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(id);
  if (!t) return fail(res, 404, 'Teacher not found.');
  db.prepare(`DELETE FROM attendance_records WHERE teacherId = ?`).run(id);
  db.prepare(`DELETE FROM teachers WHERE id = ?`).run(id);
  db.prepare(`UPDATE students SET userId = NULL WHERE userId IN (SELECT id FROM teachers WHERE id = ?)`).run(id);
  return json(res, 200, { success: true, data: { ok: true } });
}

module.exports = { list, create, update, remove };
