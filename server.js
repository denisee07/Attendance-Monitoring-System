const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Minimal .env loader (no external dependencies).
function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m) {
          let v = m[2];
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          process.env[m[1]] = v;
        }
      }
    }
  } catch (e) { /* ignore env load errors */ }
}
loadEnvFile();

const { db, ensureSeed } = require('./db');const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const teacherRoutes = require('./routes/teachers');
const sectionRoutes = require('./routes/sections');
const attendanceRoutes = require('./routes/attendance');
const reportRoutes = require('./routes/reports');
const notificationRoutes = require('./routes/notifications');
const { generatePdf } = require('./pdf');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendError(res, status, message) {
  return sendJson(res, status, { success: false, error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 5 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { resolve({ raw: data }); }
    });
    req.on('error', reject);
  });
}

function currentUser(req) {
  const token = req.headers['x-auth-token'];
  return authRoutes.authenticate(token);
}

// Simple route table
const routes = [];

function addRoute(method, pattern, handler) {
  const keys = [];
  const regexStr = pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; });
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ method, regex, keys, handler });
}

addRoute('POST', '/api/auth/login', async (req, res) => {
  const body = req.body || {};
  const result = await authRoutes.login({ body }, res);
  return result;
});
addRoute('POST', '/api/auth/logout', async (req, res) => {
  authRoutes.destroySession(req.headers['x-auth-token']);
  return sendJson(res, 200, { success: true, data: { ok: true } });
});
addRoute('GET', '/api/auth/me', async (req, res) => {
  const user = authRoutes.authenticate(req.headers['x-auth-token']);
  if (!user) return sendError(res, 401, 'Not authenticated.');
  const u = authRoutes.publicUser(user);
  return sendJson(res, 200, { success: true, data: { user: u } });
});
addRoute('POST', '/api/auth/register', async (req, res) => {
  const body = req.body || {};
  const result = await authRoutes.register({ body }, res);
  return result;
});
addRoute('GET', '/api/students', async (req, res) => studentRoutes.list(req, res));
addRoute('POST', '/api/students/import', async (req, res) => studentRoutes.importStudents(req, res));
addRoute('POST', '/api/students', async (req, res) => studentRoutes.create(req, res));
addRoute('GET', '/api/students/:id', async (req, res) => studentRoutes.getById(req, res));
addRoute('PUT', '/api/students/:id', async (req, res) => studentRoutes.update(req, res));
addRoute('DELETE', '/api/students/:id', async (req, res) => studentRoutes.remove(req, res));

addRoute('GET', '/api/teachers', async (req, res) => teacherRoutes.list(req, res));
addRoute('POST', '/api/teachers', async (req, res) => teacherRoutes.create(req, res));
addRoute('PUT', '/api/teachers/:id', async (req, res) => teacherRoutes.update(req, res));
addRoute('DELETE', '/api/teachers/:id', async (req, res) => teacherRoutes.remove(req, res));

addRoute('GET', '/api/sections', async (req, res) => sectionRoutes.list(req, res));
addRoute('POST', '/api/sections', async (req, res) => sectionRoutes.create(req, res));
addRoute('PUT', '/api/sections/:id', async (req, res) => sectionRoutes.update(req, res));
addRoute('DELETE', '/api/sections/:id', async (req, res) => sectionRoutes.remove(req, res));

addRoute('GET', '/api/attendance', async (req, res) => attendanceRoutes.list(req, res));
addRoute('POST', '/api/attendance', async (req, res) => attendanceRoutes.recordAttendance(req, res));
addRoute('PUT', '/api/attendance/:id', async (req, res) => attendanceRoutes.updateAttendance(req, res));
addRoute('DELETE', '/api/attendance/:id', async (req, res) => attendanceRoutes.removeAttendance(req, res));

addRoute('GET', '/api/reports/daily', async (req, res) => reportRoutes.dailyReport(req, res));
addRoute('GET', '/api/reports/weekly', async (req, res) => reportRoutes.weeklyReport(req, res));
addRoute('GET', '/api/reports/monthly', async (req, res) => reportRoutes.monthlyReport(req, res));
addRoute('GET', '/api/reports/student', async (req, res) => reportRoutes.studentReport(req, res));
addRoute('GET', '/api/reports/section', async (req, res) => reportRoutes.sectionReport(req, res));
addRoute('GET', '/api/reports/grade', async (req, res) => reportRoutes.gradeReport(req, res));
addRoute('GET', '/api/reports/export', async (req, res) => {
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

  const validTypes = ['daily', 'weekly', 'monthly', 'student', 'section', 'grade'];
  const validFormats = ['pdf', 'xls'];
  if (!validTypes.includes(type)) return sendError(res, 400, 'Invalid report type selected.');
  if (!validFormats.includes(format)) return sendError(res, 400, 'Invalid export format selected.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return sendError(res, 400, 'Please provide a valid report date.');

  let title = 'Attendance Report';
  let subtitle = 'Attendance Monitoring System';
  let rows = [];

  if (type === 'daily') {
    const rep = reportRoutes.getDailyData(date);
    title = `Daily Attendance Report - ${date}`;
    rows = rep.records.map((r) => ({ text: `${r.studentName} (${r.studentNo}) - ${r.section ? r.section + ' ' : ''}Gr. ${r.gradeLevel}: ${r.status.toUpperCase()}`, b: false }));
  } else if (type === 'weekly') {
    const rep = reportRoutes.getWeeklyData(end);
    title = `Weekly Attendance Report (${rep.start} to ${rep.end})`;
    rows = [];
    for (const d of rep.days) {
      rows.push({ text: `${d.date} - Present: ${d.counts.present}, Absent: ${d.counts.absent}, Late: ${d.counts.late}, Excused: ${d.counts.excused} - Total: ${d.total}`, b: false });
    }
  } else if (type === 'monthly') {
    const rep = reportRoutes.getMonthlyData(year, month);
    title = `Monthly Attendance Report - ${rep.year}-${String(rep.month).padStart(2, '0')}`;
    for (const d of rep.dailyRows) {
      rows.push({ text: `${d.date} - Present: ${d.counts.present}, Absent: ${d.counts.absent}, Late: ${d.counts.late}, Excused: ${d.counts.excused} - Total: ${d.total}`, b: false });
    }
  } else if (type === 'student') {
    const rep = reportRoutes.getStudentData(studentId);
    if (!rep) return sendError(res, 404, 'Student report not found.');
    title = `Student Attendance Report - ${rep.student.fullName} (${rep.student.studentNo})`;
    subtitle = 'Attendance Monitoring System - School Year 2025-2026';
    rows.push({ text: `Overall Attendance Percentage: ${rep.percentage === null ? 'N/A' : rep.percentage + '%'}` });
    for (const r of rep.records) rows.push({ text: `${r.date} - ${r.status.toUpperCase()}`, b: false });
  } else if (type === 'section') {
    const rep = reportRoutes.getSectionData(sectionId);
    if (!rep) return sendError(res, 404, 'Section report not found.');
    title = `Section Attendance Summary - ${rep.section.name} (Grade ${rep.section.gradeLevel})`;
    rows = rep.rows.filter((r) => r.status).map((r) => ({ text: `${r.studentName} (${r.studentNo}): ${r.status.toUpperCase()}`, b: false }));
    rows.push({ text: `Section Percentage: ${rep.percentage === null ? 'N/A' : rep.percentage + '%'}`, b: true });
  } else if (type === 'grade') {
    const rep = reportRoutes.getGradeData(gradeLevel);
    if (!rep) return sendError(res, 404, 'Grade report not found.');
    title = `Grade-Level Attendance Summary - Grade ${rep.gradeLevel}`;
    for (const r of rep.rows) rows.push({ text: `${r.studentName} (${r.studentNo}) - ${r.sectionName}: ${r.status.toUpperCase()}`, b: false });
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
  const pdf = generatePdf(title, subtitle, lines);
  res.writeHead(200, { 'Content-Type': 'application/pdf; charset=utf-8', 'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]+/gi, '_')}.pdf"` });
  return res.end(pdf);
});

addRoute('GET', '/api/notifications', async (req, res) => notificationRoutes.list(req, res));
addRoute('POST', '/api/notifications', async (req, res) => notificationRoutes.create(req, res));
addRoute('POST', '/api/notifications/read-all', async (req, res) => notificationRoutes.markAllRead(req, res));
addRoute('POST', '/api/notifications/read/:id', async (req, res) => notificationRoutes.markRead(req, res));

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { handler: r.handler, params };
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (pathname.startsWith('/api/')) {
      const routeMatch = matchRoute(req.method, pathname);
      if (!routeMatch) return sendError(res, 404, 'API endpoint not found.');
      const needsAuth = !pathname.startsWith('/api/auth/');
      if (needsAuth) {
        const user = currentUser(req);
        if (!user) return sendError(res, 401, 'Unauthorized. Please sign in.');
        req.user = user;
      }
      req.query = Object.fromEntries(url.searchParams.entries());
      req.body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
      req.params = routeMatch.params;
      await routeMatch.handler(req, res);
      return;
    }
    let rel = pathname;
    if (rel === '/') rel = '/index.html';
    const relClean = rel.replace(/^([/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, relClean);
    if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, 'Forbidden.');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const data = fs.readFileSync(filePath);
      let contentType = 'application/octet-stream';
      if (filePath.endsWith('.html')) contentType = 'text/html; charset=utf-8';
      else if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
      else if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
      else if (filePath.endsWith('.json')) contentType = 'application/json';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      res.writeHead(200, { 'Content-Type': contentType });
      return res.end(data);
    }
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    const idxData = fs.readFileSync(indexPath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(idxData);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) return sendError(res, 500, 'Internal server error.');
    try { res.end(); } catch (e2) { /* ignore */ }
  }
});

ensureSeed();
server.listen(PORT, () => {
  console.log(`School Attendance System running on http://localhost:${PORT}`);
});
