const { db } = require('../db');
const { json, fail } = require('./respond');

function list(req, res) {
  const q = req.query;
  const search = q.search ? String(q.search).trim() : null;
  const gradeLevel = q.gradeLevel ? Number(q.gradeLevel) : null;
  const section = q.section ? String(q.section) : null;
  const schoolYear = q.schoolYear ? String(q.schoolYear) : null;
  const userId = q.userId ? Number(q.userId) : null;

  const where = [];
  const params = [];
  if (search) {
    where.push('(s.fullName LIKE ? OR s.studentNo LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  if (gradeLevel) { where.push('s.gradeLevel = ?'); params.push(gradeLevel); }
  if (section) { where.push('s.section = ?'); params.push(section); }
  if (schoolYear) { where.push('s.schoolYear = ?'); params.push(schoolYear); }
  if (userId) { where.push('s.userId = ?'); params.push(userId); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT s.*, u.username AS linkedUsername, u.email AS linkedEmail, u.fullName AS linkedUserName
    FROM students s
    LEFT JOIN users u ON u.id = s.userId
    ${whereSql}
    ORDER BY s.gradeLevel ASC, s.section ASC, s.fullName ASC
  `).all(...params);

  const data = rows.map((r) => ({
    id: Number(r.id),
    studentNo: r.studentNo,
    fullName: r.fullName,
    gender: r.gender,
    gradeLevel: r.gradeLevel === null ? null : Number(r.gradeLevel),
    section: r.section,
    schoolYear: r.schoolYear,
    contact: r.contact,
    userId: r.userId === null ? null : Number(r.userId),
    linkedUsername: r.linkedUsername,
    linkedEmail: r.linkedEmail,
    linkedUserName: r.linkedUserName,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  const total = db.prepare(`SELECT COUNT(*) AS c FROM students s ${whereSql}`).get(...params);
  const totalCount = total ? Number(total.c) : 0;

  return json(res, 200, { success: true, data: { students: data, total: totalCount } });
}

function getById(req, res) {
  const id = Number(req.params.id);
  const s = db.prepare(`SELECT s.*, u.username AS linkedUsername, u.email AS linkedEmail, u.fullName AS linkedUserName FROM students s LEFT JOIN users u ON u.id = s.userId WHERE s.id = ?`).get(id);
  if (!s) return fail(res, 404, 'Student not found.');
  const history = db.prepare(`SELECT a.*, t.fullName AS teacherName FROM attendance_records a JOIN teachers t ON t.id = a.teacherId WHERE a.studentId = ? ORDER BY a.date DESC LIMIT 30`).all(id);
  const student = { ...s, id: Number(s.id), gradeLevel: s.gradeLevel === null ? null : Number(s.gradeLevel) };
  return json(res, 200, { success: true, data: { student, history } });
}

function create(req, res) {
  const b = req.body || {};
  const studentNo = String(b.studentNo || '').trim();
  const fullName = String(b.fullName || '').trim();
  const gradeLevel = b.gradeLevel === null || b.gradeLevel === undefined || b.gradeLevel === '' ? null : Number(b.gradeLevel);
  const section = String(b.section || '').trim();
  const schoolYear = String(b.schoolYear || '').trim() || '2025-2026';
  if (!studentNo) return fail(res, 400, 'Student number is required.');
  if (!/^[A-Za-z0-9_-]+$/.test(studentNo)) return fail(res, 400, 'Student number format is invalid.');
  if (!fullName) return fail(res, 400, 'Full name is required.');
  if (gradeLevel === null) return fail(res, 400, 'Grade level is required.');
  if (gradeLevel < 7 || gradeLevel > 12) return fail(res, 400, 'Grade level must be between 7 and 12.');
  if (!section) return fail(res, 400, 'Section is required.');
  const dup = db.prepare(`SELECT * FROM students WHERE studentNo = ?`).get(studentNo);
  if (dup) return fail(res, 409, 'Student number already exists.');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const info = db.prepare(`INSERT INTO students (studentNo,fullName,gender,gradeLevel,section,schoolYear,contact,userId,createdAt) VALUES (?,?,?,?,?,?,?,NULL,?)`)
    .run(studentNo, fullName, b.gender || null, gradeLevel, section, schoolYear, b.contact || null, now);
  const student = db.prepare(`SELECT * FROM students WHERE id = ?`).get(Number(info.lastInsertRowid));
  return json(res, 201, { success: true, data: { student } });
}

function update(req, res) {
  const id = Number(req.params.id);
  const b = req.body || {};
  const s = db.prepare(`SELECT * FROM students WHERE id = ?`).get(id);
  if (!s) return fail(res, 404, 'Student not found.');
  const fullName = String(b.fullName || s.fullName).trim();
  const gradeLevel = b.gradeLevel === null || b.gradeLevel === undefined || b.gradeLevel === '' ? Number(s.gradeLevel) : Number(b.gradeLevel);
  const section = String(b.section === undefined ? s.section : b.section).trim();
  const schoolYear = String(b.schoolYear === undefined || b.schoolYear === null || b.schoolYear === '' ? s.schoolYear : b.schoolYear).trim();
  if (!fullName) return fail(res, 400, 'Full name is required.');
  if (gradeLevel < 7 || gradeLevel > 12) return fail(res, 400, 'Grade level must be between 7 and 12.');
  if (!section) return fail(res, 400, 'Section is required.');
  db.prepare(`UPDATE students SET fullName = ?, gender = ?, gradeLevel = ?, section = ?, schoolYear = ?, contact = ?, updatedAt = ? WHERE id = ?`)
    .run(fullName, b.gender || null, gradeLevel, section, schoolYear, b.contact || null, new Date().toISOString().slice(0, 19).replace('T', ' '), id);
  const updated = db.prepare(`SELECT * FROM students WHERE id = ?`).get(id);
  return json(res, 200, { success: true, data: { student: updated } });
}

function remove(req, res) {
  const id = Number(req.params.id);
  const s = db.prepare(`SELECT * FROM students WHERE id = ?`).get(id);
  if (!s) return fail(res, 404, 'Student not found.');
  db.prepare(`DELETE FROM students WHERE id = ?`).run(id);
  db.prepare(`UPDATE students SET userId = NULL WHERE userId = ?`).run(id);
  return json(res, 200, { success: true, data: { ok: true } });
}

function importStudents(req, res) {
  const b = req.body || {};
  const rows = Array.isArray(b.rows) ? b.rows : (Array.isArray(b.students) ? b.students : []);
  let created = 0;
  const errors = [];
  for (const r of rows) {
    const studentNo = String(r.studentNo || r['Student ID'] || r['Student No'] || '').trim();
    const fullName = String(r.fullName || r['Full Name'] || r.name || '').trim();
    const gender = String(r.gender || r['Gender'] || '').trim() || null;
    const gradeLevel = Number(r.gradeLevel || r['Grade Level'] || r.grade || 0) || null;
    const section = String(r.section || r['Section'] || '').trim();
    const schoolYear = String(r.schoolYear || r['School Year'] || '2025-2026').trim();
    const contact = String(r.contact || r['Contact'] || r['Contact Number'] || '').trim() || null;
    if (!studentNo || !fullName) { errors.push({ row: r, error: 'Missing student number or full name.' }); continue; }
    if (gradeLevel < 7 || gradeLevel > 12) { errors.push({ row: r, error: 'Grade level must be between 7 and 12.' }); continue; }
    if (!section) { errors.push({ row: r, error: 'Section is required.' }); continue; }
    const dup = db.prepare(`SELECT * FROM students WHERE studentNo = ?`).get(studentNo);
    if (dup) { errors.push({ row: r, error: `Student number ${studentNo} already exists.` }); continue; }
    const info = db.prepare(`INSERT INTO students (studentNo,fullName,gender,gradeLevel,section,schoolYear,contact,userId,createdAt) VALUES (?,?,?,?,?,?,?,NULL,?)`)
      .run(studentNo, fullName, gender, gradeLevel, section, schoolYear, contact, new Date().toISOString().slice(0, 19).replace('T', ' '));
    created++;
  }
  return json(res, 200, { success: true, data: { created, total: rows.length, errors } });
}

module.exports = { list, getById, create, update, remove, importStudents };
