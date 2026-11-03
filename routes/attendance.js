const { db, nowStr } = require('../db');
const { json, fail } = require('./respond');

const STATUSES = ['present', 'absent', 'late', 'excused'];

function list(req, res) {
  const q = req.query;
  const studentId = q.studentId ? Number(q.studentId) : null;
  const sectionId = q.sectionId ? Number(q.sectionId) : null;
  const status = q.status || null;
  const date = q.date || null;
  const teacherId = q.teacherId ? Number(q.teacherId) : null;
  const gradeLevel = q.gradeLevel ? Number(q.gradeLevel) : null;
  const section = q.section ? String(q.section) : null;
  const search = q.search ? String(q.search).trim() : null;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));

  const where = [];
  const params = [];
  if (studentId) { where.push('s.id = ?'); params.push(studentId); }
  if (sectionId) { where.push('a.sectionId = ?'); params.push(sectionId); }
  if (status) { where.push('a.status = ?'); params.push(status); }
  if (date) { where.push('a.date = ?'); params.push(date); }
  if (teacherId) { where.push('a.teacherId = ?'); params.push(teacherId); }
  if (gradeLevel) { where.push('s.gradeLevel = ?'); params.push(gradeLevel); }
  if (section) { where.push('s.section = ?'); params.push(section); }
  if (search) {
    where.push('(s.fullName LIKE ? OR s.studentNo LIKE ? OR u.fullName LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM attendance_records a JOIN students s ON s.id = a.studentId ${whereSql}`).get(...params);
  const totalCount = total ? Number(total.c) : 0;

  const rows = db.prepare(`
    SELECT a.*, s.studentNo, s.fullName AS studentName, s.gradeLevel, s.section, s.schoolYear,
           t.fullName AS teacherName, t.teacherNo AS teacherNo
    FROM attendance_records a
    JOIN students s ON s.id = a.studentId
    JOIN teachers t ON t.id = a.teacherId
    ${whereSql}
    ORDER BY a.date DESC, s.fullName ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  const data = rows.map((r) => ({
    id: Number(r.id),
    studentId: Number(r.studentId),
    sectionId: Number(r.sectionId),
    date: r.date,
    status: r.status,
    teacherId: Number(r.teacherId),
    recordedAt: r.recordedAt,
    studentNo: r.studentNo,
    studentName: r.studentName,
    gradeLevel: r.gradeLevel === null ? null : Number(r.gradeLevel),
    section: r.section,
    schoolYear: r.schoolYear,
    teacherName: r.teacherName,
    teacherNo: r.teacherNo,
  }));

  return json(res, 200, { success: true, data: { records: data, total: totalCount, page, limit } });
}

function summaryForSection(sectionId, date) {
  const sec = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(sectionId);
  if (!sec) return null;
  const students = db.prepare(`SELECT * FROM students WHERE gradeLevel = ? AND section = ? ORDER BY fullName`).all(Number(sec.gradeLevel), sec.name);
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  const presentStudentIds = new Set();
  const absentStudentIds = new Set();
  const lateStudentIds = new Set();
  const excusedStudentIds = new Set();
  for (const st of students) {
    const a = db.prepare(`SELECT * FROM attendance_records WHERE studentId = ? AND sectionId = ? AND date = ?`).get(Number(st.id), Number(sec.id), date);
    if (a) {
      counts[a.status] = (counts[a.status] || 0) + 1;
      if (a.status === 'present') presentStudentIds.add(Number(st.id));
      if (a.status === 'absent') absentStudentIds.add(Number(st.id));
      if (a.status === 'late') lateStudentIds.add(Number(st.id));
      if (a.status === 'excused') excusedStudentIds.add(Number(st.id));
    }
  }
  return {
    section: { id: Number(sec.id), name: sec.name, gradeLevel: Number(sec.gradeLevel), schoolYear: sec.schoolYear, adviserTeacherId: sec.adviserTeacherId },
    students,
    counts,
    presentStudentIds,
    absentStudentIds,
    lateStudentIds,
    excusedStudentIds,
    totalEnrolled: students.length,
  };
}

function recordAttendance(req, res) {
  const body = req.body || {};
  const studentId = Number(body.studentId);
  const sectionId = Number(body.sectionId);
  const status = String(body.status || '').toLowerCase();
  const teacherId = Number(body.teacherId);
  const date = String(body.date || '');

  if (!Number.isFinite(studentId) || studentId <= 0) return fail(res, 400, 'Invalid student selected.');
  if (!Number.isFinite(sectionId) || sectionId <= 0) return fail(res, 400, 'Invalid class section.');
  if (!STATUSES.includes(status)) return fail(res, 400, 'Attendance status must be present, absent, late, or excused.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, 'Please select a valid attendance date.');
  const st = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
  if (!st) return fail(res, 404, 'Student not found.');
  const sec = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(sectionId);
  if (!sec) return fail(res, 404, 'Section not found.');
  const teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(teacherId);
  if (!teacher) return fail(res, 404, 'Teacher not found.');
  if (Number(st.gradeLevel) !== Number(sec.gradeLevel) || String(st.section || '').toUpperCase() !== String(sec.name || '').toUpperCase()) {
    return fail(res, 400, 'The selected student does not belong to the selected class section.');
  }

  const dup = db.prepare(`SELECT * FROM attendance_records WHERE studentId = ? AND sectionId = ? AND date = ?`).get(studentId, sectionId, date);
  if (dup) {
    return fail(res, 409, `Attendance for ${st.fullName} on ${date} was already recorded. Use "Update" to correct it.`);
  }

  const ts = nowStr();
  const info = db.prepare(`INSERT INTO attendance_records (studentId,sectionId,date,status,teacherId,recordedAt) VALUES (?,?,?,?,?,?)`)
    .run(studentId, sectionId, date, status, teacherId, ts);
  const record = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(Number(info.lastInsertRowid));

  const adminUser = db.prepare(`SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();
  if (adminUser) {
    db.prepare(`INSERT INTO notifications (userId,type,title,message,read,createdAt) VALUES (?,?,?,?,0,?)`)
      .run(Number(adminUser.id), 'attendance_submitted', 'Attendance Submitted', `Attendance for ${st.fullName} (${st.studentNo}) in ${sec.name} was marked ${status.toUpperCase()} by ${teacher.fullName}.`, ts);
  }
  const teacherUser = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(teacher.username));
  if (teacherUser) {
    db.prepare(`INSERT INTO notifications (userId,type,title,message,read,createdAt) VALUES (?,?,?,?,0,?)`)
      .run(Number(teacherUser.id), 'attendance_update', 'Attendance Recorded', `${teacher.fullName} recorded attendance for ${st.fullName} (${st.studentNo}) as ${status.toUpperCase()}.`, ts);
  }
  const studentUser = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(st.userId || 0));
  if (studentUser) {
    const title = status === 'absent' ? 'Absence Notification' : status === 'late' ? 'Late Arrival Notification' : status === 'excused' ? 'Excused Absence Notification' : 'Attendance Update';
    const msg = status === 'absent'
      ? `${teacher.fullName} marked your attendance as Absent for ${date}. Please contact the school office if there is an emergency.`
      : status === 'late'
        ? `${teacher.fullName} marked your attendance as Late for ${date}. Please ensure you arrive on time.`
        : `${teacher.fullName} marked your attendance as ${status.toUpperCase()} for ${date}.`;
    const finalMsg = msg;
    db.prepare(`INSERT INTO notifications (userId,type,title,message,read,createdAt) VALUES (?,?,?,?,0,?)`)
      .run(Number(studentUser.id), status === 'absent' ? 'absence' : status === 'late' ? 'late_arrival' : status === 'excused' ? 'excused' : 'attendance_update', title, finalMsg, ts);
  }

  return json(res, 201, { success: true, data: { ok: true, record } });
}

function updateAttendance(req, res) {
  const id = Number(req.params.id);
  const body = req.body || {};
  const status = String(body.status || '').toLowerCase();
  if (!STATUSES.includes(status)) return fail(res, 400, 'Invalid status value.');
  const existing = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(id);
  if (!existing) return fail(res, 404, 'Attendance record not found.');
  db.prepare(`UPDATE attendance_records SET status = ? WHERE id = ?`).run(status, id);
  const updated = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(id);
  const st = db.prepare(`SELECT * FROM students WHERE id = ?`).get(Number(updated.studentId));
  const teacher = db.prepare(`SELECT * FROM teachers WHERE id = ?`).get(Number(updated.teacherId));
  const adminUser = db.prepare(`SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`).get();
  if (adminUser) {
    db.prepare(`INSERT INTO notifications (userId,type,title,message,read,createdAt) VALUES (?,?,?,?,0,?)`)
      .run(Number(adminUser.id), 'attendance_update', 'Attendance Record Updated', `Attendance record for ${st ? st.fullName : 'student'} was corrected to ${status.toUpperCase()}.`, nowStr());
  }
  const teacherUser = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(teacher.username));
  if (teacherUser) {
    db.prepare(`INSERT INTO notifications (userId,type,title,message,read,createdAt) VALUES (?,?,?,?,0,?)`)
      .run(Number(teacherUser.id), 'attendance_update', 'Attendance Record Updated', `${teacher.fullName} corrected attendance for ${st ? st.fullName : 'student'} to ${status.toUpperCase()}.`, nowStr());
  }
  return json(res, 200, { success: true, data: { ok: true, record: updated } });
}

function removeAttendance(req, res) {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(id);
  if (!existing) return fail(res, 404, 'Attendance record not found.');
  db.prepare(`DELETE FROM attendance_records WHERE id = ?`).run(id);
  return json(res, 200, { success: true, data: { ok: true } });
}

module.exports = { list, summaryForSection, recordAttendance, updateAttendance, removeAttendance, STATUSES };
