const { db } = require('../db');
const { json, fail } = require('./respond');

function getRecords(params = {}) {
  const where = [];
  const values = [];
  if (params.studentId) { where.push('a.studentId = ?'); values.push(params.studentId); }
  if (params.sectionId) { where.push('a.sectionId = ?'); values.push(params.sectionId); }
  if (params.date) { where.push('a.date = ?'); values.push(params.date); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT a.*, s.studentNo, s.fullName AS studentName, s.gradeLevel, s.section, s.schoolYear, t.fullName AS teacherName, t.teacherNo AS teacherNo
    FROM attendance_records a
    JOIN students s ON s.id = a.studentId
    JOIN teachers t ON t.id = a.teacherId
    ${whereSql}
    ORDER BY a.date DESC, s.fullName ASC
  `).all(...values);
  return rows.map((r) => ({
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
}

function countByStatus(records) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  return counts;
}

function attendancePercentage(counts) {
  const denom = (counts.present || 0) + (counts.late || 0) + (counts.absent || 0);
  if (denom === 0) return null;
  const score = (counts.present || 0) + (counts.late || 0);
  return Math.round((score / denom) * 10000) / 100;
}

function getDailyData(date) {
  const records = getRecords({ date });
  const counts = countByStatus(records);
  const secIds = [...new Set(records.map((r) => r.sectionId))];
  const sections = secIds.length ? db.prepare(`SELECT * FROM sections WHERE id IN (${secIds.map(() => '?').join(',')})`).all(...secIds) : [];
  const sectionSummary = sections.map((s) => `${s.name} (Gr. ${s.gradeLevel})`).join(', ');
  return { date, counts, total: records.length, records, sectionSummary };
}

function getWeeklyData(endDate) {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const startD = new Date(`${end}T00:00:00`);
  startD.setDate(startD.getDate() - 6);
  const startDate = startD.toISOString().slice(0, 10);
  const all = db.prepare(`SELECT a.*, s.studentNo, s.fullName AS studentName, s.gradeLevel, s.section, s.schoolYear, t.fullName AS teacherName, t.teacherNo AS teacherNo
    FROM attendance_records a
    JOIN students s ON s.id = a.studentId
    JOIN teachers t ON t.id = a.teacherId
    WHERE a.date BETWEEN ? AND ?
    ORDER BY a.date DESC, s.fullName ASC`).all(startDate, end);
  const mapped = all.map((r) => ({ ...r, studentId: Number(r.studentId), sectionId: Number(r.sectionId), gradeLevel: r.gradeLevel === null ? null : Number(r.gradeLevel) }));
  const counts = countByStatus(mapped);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const dayRecords = mapped.filter((r) => r.date === ds);
    days.push({ date: ds, counts: countByStatus(dayRecords), total: dayRecords.length });
  }
  return { start: startDate, end, days, counts, total: mapped.length, records: mapped };
}

function getMonthlyData(year, month) {
  const now = new Date();
  const y = year ? Number(year) : now.getFullYear();
  const m = month ? Number(month) : now.getMonth() + 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const records = getRecords({});
  const monthRecords = records.filter((r) => {
    const d = new Date(`${r.date}T00:00:00`);
    return d.getFullYear() === y && (d.getMonth() + 1) === m;
  });
  const counts = countByStatus(monthRecords);
  const dailyRows = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayRecords = monthRecords.filter((r) => r.date === ds);
    if (dayRecords.length) dailyRows.push({ date: ds, counts: countByStatus(dayRecords), total: dayRecords.length });
  }
  return { year: y, month: m, daysInMonth, counts, total: monthRecords.length, dailyRows, records: monthRecords };
}

function getStudentData(studentId) {
  const st = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
  if (!st) return null;
  const records = getRecords({ studentId });
  const counts = countByStatus(records);
  const byMonth = {};
  for (const r of records) {
    const d = new Date(`${r.date}T00:00:00`);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = { present: 0, absent: 0, late: 0, excused: 0 };
    byMonth[key][r.status] = (byMonth[key][r.status] || 0) + 1;
  }
  return { student: st, records, counts, percentage: attendancePercentage(counts), byMonth };
}

function getSectionData(sectionId) {
  const sec = db.prepare(`SELECT * FROM sections WHERE id = ?`).get(sectionId);
  if (!sec) return null;
  const students = db.prepare(`SELECT * FROM students WHERE gradeLevel = ? AND section = ? ORDER BY fullName`).all(Number(sec.gradeLevel), sec.name);
  const rows = [];
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  const teacherOfSection = db.prepare(`SELECT * FROM teachers WHERE sections LIKE ? ORDER BY id LIMIT 1`).get(`%"${sec.name}"%`);
  const tid = teacherOfSection ? Number(teacherOfSection.id) : null;
  for (const st of students) {
    const r = db.prepare(`SELECT * FROM attendance_records WHERE studentId = ? AND sectionId = ? ORDER BY date DESC LIMIT 1`).get(Number(st.id), Number(sec.id));
    let status = null;
    if (r) {
      status = r.status;
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    rows.push({
      studentId: Number(st.id),
      studentNo: st.studentNo,
      studentName: st.fullName,
      gradeLevel: Number(st.gradeLevel),
      section: st.section,
      status,
      teacherId: tid,
      teacherName: teacherOfSection ? teacherOfSection.fullName : null,
      date: r ? r.date : null,
    });
  }
  return { section: sec, students, rows, counts, teacher: teacherOfSection || null, percentage: attendancePercentage(counts) };
}

function getGradeData(gradeLevel) {
  const sections = db.prepare(`SELECT * FROM sections WHERE gradeLevel = ? ORDER BY name`).all(Number(gradeLevel));
  const rows = [];
  const allCounts = { present: 0, absent: 0, late: 0, excused: 0 };
  let totalStudents = 0;
  for (const sec of sections) {
    const rep = getSectionData(Number(sec.id));
    if (!rep) continue;
    totalStudents += rep.students.length;
    for (const r of rep.rows) {
      if (!r.status) continue;
      allCounts[r.status] = (allCounts[r.status] || 0) + 1;
      rows.push({ ...r, sectionName: `${sec.name} (Gr. ${sec.gradeLevel})` });
    }
  }
  return { gradeLevel: Number(gradeLevel), sections, rows, totalStudents, counts: allCounts, percentage: attendancePercentage(allCounts) };
}

async function dailyReport(req, res) {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const data = getDailyData(date);
  return json(res, 200, { success: true, data });
}

async function weeklyReport(req, res) {
  const end = String(req.query.end || new Date().toISOString().slice(0, 10));
  const data = getWeeklyData(end);
  return json(res, 200, { success: true, data });
}

async function monthlyReport(req, res) {
  const now = new Date();
  const y = req.query.year ? Number(req.query.year) : now.getFullYear();
  const m = req.query.month ? Number(req.query.month) : now.getMonth() + 1;
  const data = getMonthlyData(y, m);
  return json(res, 200, { success: true, data });
}

async function studentReport(req, res) {
  const studentId = Number(req.query.studentId);
  const data = getStudentData(studentId);
  if (!data) return fail(res, 404, 'Student not found.');
  return json(res, 200, { success: true, data });
}

async function sectionReport(req, res) {
  const sectionId = Number(req.query.sectionId);
  const data = getSectionData(sectionId);
  if (!data) return fail(res, 404, 'Section not found.');
  return json(res, 200, { success: true, data });
}

async function gradeReport(req, res) {
  const gradeLevel = Number(req.query.gradeLevel);
  const data = getGradeData(gradeLevel);
  return json(res, 200, { success: true, data });
}

async function exportReport(req, res) {
  const q = req.query;
  const type = String(q.type || 'daily');
  const format = String(q.format || 'pdf');
  const date = String(q.date || new Date().toISOString().slice(0, 10));
  const end = String(q.end || date);
  const year = q.year ? Number(q.year) : undefined;
  const month = q.month ? Number(q.month) : undefined;
  const studentId = q.studentId ? Number(q.studentId) : null;
  const sectionId = q.sectionId ? Number(q.sectionId) : null;
  const gradeLevel = q.gradeLevel ? Number(q.gradeLevel) : null;

  let title = 'Attendance Report';
  let subtitle = 'Attendance Monitoring System';
  let rows = [];

  if (type === 'daily') {
    const data = getDailyData(date);
    title = `Daily Attendance Report - ${data.date}`;
    rows = data.records.map((r) => ({ text: `${r.studentName} (${r.studentNo}) - ${r.section ? r.section + ' ' : ''}Gr. ${r.gradeLevel}: ${r.status.toUpperCase()}`, b: false }));
  } else if (type === 'weekly') {
    const data = getWeeklyData(end);
    title = `Weekly Attendance Report (${data.start} to ${data.end})`;
    rows = [];
    for (const d of data.days) {
      rows.push({ text: `${d.date} - Present: ${d.counts.present}, Absent: ${d.counts.absent}, Late: ${d.counts.late}, Excused: ${d.counts.excused} - Total: ${d.total}`, b: false });
    }
  } else if (type === 'monthly') {
    const data = getMonthlyData(year, month);
    title = `Monthly Attendance Report - ${data.year}-${String(data.month).padStart(2, '0')}`;
    for (const d of data.dailyRows) {
      rows.push({ text: `${d.date} - Present: ${d.counts.present}, Absent: ${d.counts.absent}, Late: ${d.counts.late}, Excused: ${d.counts.excused} - Total: ${d.total}`, b: false });
    }
  } else if (type === 'student') {
    const data = getStudentData(studentId);
    if (!data) return fail(res, 404, 'Student report not found.');
    title = `Student Attendance Report - ${data.student.fullName} (${data.student.studentNo})`;
    subtitle = 'Attendance Monitoring System - School Year 2025-2026';
    rows.push({ text: `Overall Attendance Percentage: ${data.percentage === null ? 'N/A' : data.percentage + '%'}` });
    for (const r of data.records) rows.push({ text: `${r.date} - ${r.status.toUpperCase()}`, b: false });
  } else if (type === 'section') {
    const data = getSectionData(sectionId);
    if (!data) return fail(res, 404, 'Section report not found.');
    title = `Section Attendance Summary - ${data.section.name} (Grade ${data.section.gradeLevel})`;
    rows = data.rows.filter((r) => r.status).map((r) => ({ text: `${r.studentName} (${r.studentNo}): ${r.status.toUpperCase()}`, b: false }));
    rows.push({ text: `Section Percentage: ${data.percentage === null ? 'N/A' : data.percentage + '%'}`, b: true });
  } else if (type === 'grade') {
    const data = getGradeData(gradeLevel);
    if (!data) return fail(res, 404, 'Grade report not found.');
    title = `Grade-Level Attendance Summary - Grade ${data.gradeLevel}`;
    for (const r of data.rows) rows.push({ text: `${r.studentName} (${r.studentNo}) - ${r.sectionName}: ${r.status.toUpperCase()}`, b: false });
  }

  if (format === 'xls') {
    const body = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${rows.map((r) => `<p>${r.text}</p>`).join('')}</body></html>`;
    res.writeHead(200, { 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]+/gi, '_')}.xls"` });
    return res.end(body);
  }

  const lines = [];
  lines.push({ text: title, size: 18, bold: true });
  if (subtitle) lines.push({ text: subtitle, size: 11, bold: false });
  lines.push({ text: '', size: 6, bold: false });
  for (const r of rows) lines.push({ text: r.text, size: 11, bold: !!r.b });
  const pdf = require('../pdf').generatePdf(title, subtitle, lines);
  res.writeHead(200, { 'Content-Type': 'application/pdf; charset=utf-8', 'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]+/gi, '_')}.pdf"` });
  return res.end(pdf);
}

module.exports = { getRecords, countByStatus, attendancePercentage, getDailyData, getWeeklyData, getMonthlyData, getStudentData, getSectionData, getGradeData, dailyReport, weeklyReport, monthlyReport, studentReport, sectionReport, gradeReport, exportReport };
