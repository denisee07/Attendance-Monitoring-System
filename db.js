const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');

const db = new DatabaseSync(path.join(__dirname, 'school_attendance.db'));

// Credential configuration. Real values should be supplied through environment
// variables (e.g. a local .env file - see .env.example). No hardcoded credentials
// are committed to the repository.
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const TEACHER_USERNAME = String(process.env.TEACHER_USERNAME || 'teacher').trim();
const TEACHER_PASSWORD = String(process.env.TEACHER_PASSWORD || '');
const STUDENT_USERNAME = String(process.env.STUDENT_USERNAME || 'student').trim();
const STUDENT_PASSWORD = String(process.env.STUDENT_PASSWORD || '');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  fullName TEXT NOT NULL,
  studentId TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  userId INTEGER NOT NULL REFERENCES users(id),
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentNo TEXT UNIQUE NOT NULL,
  fullName TEXT NOT NULL,
  gender TEXT,
  gradeLevel INTEGER,
  section TEXT,
  schoolYear TEXT,
  contact TEXT,
  userId INTEGER REFERENCES users(id),
  createdAt TEXT NOT NULL,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacherNo TEXT UNIQUE NOT NULL,
  fullName TEXT NOT NULL,
  email TEXT,
  subject TEXT,
  gradeLevels TEXT,
  sections TEXT,
  username TEXT UNIQUE,
  passwordHash TEXT NOT NULL,
  salt TEXT NOT NULL,
  userId INTEGER,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gradeLevel INTEGER NOT NULL,
  schoolYear TEXT NOT NULL,
  adviserTeacherId INTEGER REFERENCES teachers(id),
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  studentId INTEGER NOT NULL,
  sectionId INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),

  teacherId INTEGER NOT NULL,
  recordedAt TEXT NOT NULL,
  UNIQUE (studentId, sectionId, date)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);
`);

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return `${s}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || '').split(':');
    const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(test, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowStr() {
  const d = new Date();
  const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return `${todayStr()} ${t}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  const s = String(iso);
  const d = new Date(s.replace(' ', 'T') + (s.length > 10 ? 'Z' : ''));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function toPlainObject(row) {
  if (!row) return null;
  const o = {};
  for (const k of Object.getOwnPropertyNames(row)) o[k] = (row[k] === undefined ? null : row[k]);
  return o;
}

function hashTeacher(teacherNo, fullName, email, subject, gradeLevels, sections, username, password) {
  const now = nowStr();
  const info = db.prepare(`INSERT INTO teachers (teacherNo,fullName,email,subject,gradeLevels,sections,username,passwordHash,salt,userId,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(teacherNo, fullName, email || null, subject || null, gradeLevels ? JSON.stringify(gradeLevels) : null, sections ? JSON.stringify(sections) : null, username, hashPassword(password), '', null, now);
  const teacherId = Number(info.lastInsertRowid);
  const userInfo = db.prepare(`INSERT INTO users (username,email,passwordHash,salt,role,fullName,studentId,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
    .run(username, email || `${username}@school.edu`, hashPassword(password), '', 'teacher', fullName, null, now);
  const userId = Number(userInfo.lastInsertRowid);
  db.prepare(`UPDATE teachers SET userId = ? WHERE id = ?`).run(userId, teacherId);
  return { id: teacherId, userId, teacherNo: teacherNo, fullName, email, subject, gradeLevels, sections, username, createdAt: now };
}

function seed() {
  const now = nowStr();

  db.prepare(`INSERT INTO users (username,email,passwordHash,salt,role,fullName,studentId,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
    .run(ADMIN_USERNAME, `admin@school.edu`, hashPassword(ADMIN_PASSWORD), '', 'admin', 'System Administrator', null, now);

  const t1 = hashTeacher('T-001', 'Daniel Reyes', 'daniel.reyes@school.edu', 'Mathematics', ['7'], ['7-A'], `${TEACHER_USERNAME}`, TEACHER_PASSWORD);
  const t2 = hashTeacher('T-002', 'Maria Santos', 'maria.santos@school.edu', 'Science', ['8'], ['8-B'], `${TEACHER_USERNAME}2`, TEACHER_PASSWORD);
  const t3 = hashTeacher('T-003', 'Pedro Jimenez', 'pedro.jimenez@school.edu', 'English', ['9'], ['9-A'], `${TEACHER_USERNAME}3`, TEACHER_PASSWORD);
  const t4 = hashTeacher('T-004', 'Angela Gomez', 'angela.gomez@school.edu', 'History', ['10'], ['10-B'], `${TEACHER_USERNAME}4`, TEACHER_PASSWORD);

  const sec7a = db.prepare(`INSERT INTO sections (name,gradeLevel,schoolYear,adviserTeacherId,createdAt) VALUES (?,?,?,?,?)`)
    .run('A', 7, '2025-2026', Number(t1.id), now);
  const sec8b = db.prepare(`INSERT INTO sections (name,gradeLevel,schoolYear,adviserTeacherId,createdAt) VALUES (?,?,?,?,?)`)
    .run('B', 8, '2025-2026', Number(t2.id), now);
  const sec9a = db.prepare(`INSERT INTO sections (name,gradeLevel,schoolYear,adviserTeacherId,createdAt) VALUES (?,?,?,?,?)`)
    .run('A', 9, '2025-2026', Number(t3.id), now);
  const sec10b = db.prepare(`INSERT INTO sections (name,gradeLevel,schoolYear,adviserTeacherId,createdAt) VALUES (?,?,?,?,?)`)
    .run('B', 10, '2025-2026', Number(t4.id), now);

  const studentSeeds = [
    ['STU-2023-014', 'Juan Dela Cruz', 'Male', 7, 'A', '09171234567', 0],
    ['STU-2023-015', 'Maria Clara Santos', 'Female', 7, 'A', '09182345678', 0],
    ['STU-2023-016', 'Angelo Reyes', 'Male', 7, 'A', '09193456789', 0],
    ['STU-2024-021', 'Isabel Flores', 'Female', 8, 'B', '09284567890', 0],
    ['STU-2024-022', 'Miguel Bautista', 'Male', 8, 'B', '09295678901', 0],
    ['STU-2024-023', 'Sofia Navarro', 'Female', 8, 'B', '09306789012', 0],
    ['STU-2025-031', 'Lucas Mendoza', 'Male', 9, 'A', '09317890123', 0],
    ['STU-2025-032', 'Elena Villanueva', 'Female', 9, 'A', '09328901234', 0],
    ['STU-2022-041', 'Daniel Ramos', 'Male', 10, 'B', '09431012345', 0],
    ['STU-2022-042', 'Hannah Castillo', 'Female', 10, 'B', '09442123456', 0],
    ['STU-2021-051', 'Paolo Salazar', 'Male', 11, 'A', '09551234567', 0],
    ['STU-2021-052', 'Trisha Gomez', 'Female', 11, 'A', '09562345678', 0],
    ['STU-2020-061', 'Andre Villanueva', 'Male', 12, 'B', '09673456789', 0],
    ['STU-2020-062', 'Katrina Lopez', 'Female', 12, 'B', '09684567890', 0],
  ];
  const insStudent = db.prepare(`INSERT INTO students (studentNo,fullName,gender,gradeLevel,section,schoolYear,contact,userId,createdAt) VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const s of studentSeeds) {
    const linkedUserId = Number(s[6]) > 0 ? Number(s[6]) : null;
    insStudent.run(s[0], s[1], s[2], s[3], s[4], '2025-2026', s[5], linkedUserId, now);
  }

  const su1 = db.prepare(`INSERT INTO users (username,email,passwordHash,salt,role,fullName,studentId,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
    .run(STUDENT_USERNAME, `student@school.edu`, hashPassword(STUDENT_PASSWORD), '', 'student', 'Juan Dela Cruz', 'STU-2023-014', now);
  const su2 = db.prepare(`INSERT INTO users (username,email,passwordHash,salt,role,fullName,studentId,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
    .run(`${STUDENT_USERNAME}2`, `student2@school.edu`, hashPassword(STUDENT_PASSWORD), '', 'student', 'Isabel Flores', 'STU-2024-021', now);
  db.prepare(`UPDATE students SET userId = ? WHERE studentNo = ?`).run(Number(su1.lastInsertRowid), 'STU-2023-014');
  db.prepare(`UPDATE students SET userId = ? WHERE studentNo = ?`).run(Number(su2.lastInsertRowid), 'STU-2024-021');

  const statuses = ['present', 'present', 'present', 'absent', 'late', 'excused'];
  const rnd = (seedNum) => Math.abs(Math.sin(seedNum * 2654435761) * 10000) % 1;
  const recs = [];
  const sectionsForAttendance = db.prepare(`SELECT * FROM sections ORDER BY id`).all();
  for (const sec of sectionsForAttendance) {
    const studentsIn = db.prepare(`SELECT * FROM students WHERE gradeLevel = ? AND section = ? ORDER BY id`).all(Number(sec.gradeLevel), sec.name);
    const teacherOfSection = db.prepare(`SELECT * FROM teachers WHERE sections LIKE ? ORDER BY id LIMIT 1`).get(`%"${sec.name}"%`);
    const tid = teacherOfSection ? Number(teacherOfSection.id) : Number(t1.id);
    for (const st of studentsIn) {
      const n = 1 + Math.floor(rnd(Number(st.id)) * 8);
      for (let d = n; d >= 0; d--) {
        const date = daysAgo(d);
        if (date > todayStr()) continue;
        const roll = rnd(Number(st.id) * 7 + d * 13);
        const status = statuses[Math.floor(roll * statuses.length)];
        recs.push({ studentId: Number(st.id), sectionId: Number(sec.id), date, status, teacherId: tid });
      }
    }
  }
  const insRec = db.prepare(`INSERT INTO attendance_records (studentId,sectionId,date,status,teacherId,recordedAt) VALUES (?,?,?,?,?,?)`);
  const seen = new Set();
  for (const r of recs) {
    const key = `${r.studentId}-${r.sectionId}-${r.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      insRec.run(r.studentId, r.sectionId, r.date, r.status, r.teacherId, `${r.date} 08:0${1 + (r.studentId % 5)}:00`);
    } catch (e) { /* duplicate prevention */ }
  }
}

function ensureSeed() {
  const count = db.prepare(`SELECT COUNT(*) AS c FROM users`).get();
  const c = count ? Number(count.c) : 0;
  if (c > 0) return;
  seed();
}

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  genToken,
  todayStr,
  nowStr,
  daysAgo,
  fmtDate,
  fmtDateTime,
  uid,
  toPlainObject,
  jsonSafe: toPlainObject,
  ensureSeed,
  hashTeacher,
};
