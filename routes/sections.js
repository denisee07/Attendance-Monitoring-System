const { db } = require('../db');
const { json, fail } = require('./respond');

function list(req, res) {
  const rows = db.prepare(`SELECT * FROM sections ORDER BY gradeLevel ASC, name ASC`).all();
  const data = rows.map((r) => {
    const id = Number(r.id);
    const students = db.prepare(`SELECT * FROM students WHERE gradeLevel = ? AND section = ?`).all(Number(r.gradeLevel), r.name);
    const adviser = r.adviserTeacherId ? db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(Number(r.adviserTeacherId)) : null;
    return {
      id,
      name: r.name,
      gradeLevel: Number(r.gradeLevel),
      schoolYear: r.schoolYear,
      adviserTeacherId: r.adviserTeacherId === null ? null : Number(r.adviserTeacherId),
      adviserName: adviser ? adviser.fullName : null,
      adviserTeacherNo: adviser ? adviser.teacherNo : null,
      enrolledCount: students.length,
      students,
    };
  });
  return json(res, 200, { success: true, data: { sections: data, total: data.length } });
}

function create(req, res) {
  const b = req.body || {};
  const name = String(b.name || '').trim().toUpperCase();
  const gradeLevel = Number(b.gradeLevel);
  if (!name) return fail(res, 400, 'Section name is required.');
  if (!Number.isFinite(gradeLevel) || gradeLevel < 7 || gradeLevel > 12) return fail(res, 400, 'Valid grade level (7-12) is required.');
  const dup = db.prepare(`SELECT * FROM sections WHERE name = ? AND gradeLevel = ? AND schoolYear = ?`).get(name, gradeLevel, b.schoolYear || '2025-2026');
  if (dup) return fail(res, 409, 'Section already exists for this grade level.');
  const info = db.prepare(`INSERT INTO sections (name,gradeLevel,schoolYear,adviserTeacherId,createdAt) VALUES (?,?,?,?,?)`)
    .run(name, gradeLevel, b.schoolYear || '2025-2026', b.adviserTeacherId ? Number(b.adviserTeacherId) : null, new Date().toISOString().slice(0, 19).replace('T', ' '));
  const section = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(Number(info.lastInsertRowid));
  const rep = { ...section, id: Number(section.id), gradeLevel: Number(section.gradeLevel) };
  rep.enrolledCount = db.prepare(`SELECT COUNT(*) AS c FROM students WHERE gradeLevel = ? AND section = ?`).get(Number(section.gradeLevel), section.name).c;
  return json(res, 201, { success: true, data: { section: rep } });
}

function update(req, res) {
  const id = Number(req.params.id);
  const b = req.body || {};
  const s = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(id);
  if (!s) return fail(res, 404, 'Section not found.');
  const name = String(b.name || s.name).trim().toUpperCase();
  const gradeLevel = b.gradeLevel === null || b.gradeLevel === undefined ? Number(s.gradeLevel) : Number(b.gradeLevel);
  db.prepare(`UPDATE sections SET name = ?, gradeLevel = ?, schoolYear = ?, adviserTeacherId = ? WHERE id = ?`)
    .run(name, gradeLevel, b.schoolYear || s.schoolYear, b.adviserTeacherId ? Number(b.adviserTeacherId) : null, id);
  const updated = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(id);
  const rep = { ...updated, id: Number(updated.id), gradeLevel: Number(updated.gradeLevel) };
  rep.enrolledCount = db.prepare(`SELECT COUNT(*) AS c FROM students WHERE gradeLevel = ? AND section = ?`).get(Number(updated.gradeLevel), updated.name).c;
  return json(res, 200, { success: true, data: { section: rep } });
}

function remove(req, res) {
  const id = Number(req.params.id);
  const s = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(id);
  if (!s) return fail(res, 404, 'Section not found.');
  db.prepare(`DELETE FROM sections WHERE id = ?`).run(id);
  db.prepare(`UPDATE students SET section = NULL, gradeLevel = NULL WHERE section = ?`).run(s.name);
  return json(res, 200, { success: true, data: { ok: true } });
}

module.exports = { list, create, update, remove };
