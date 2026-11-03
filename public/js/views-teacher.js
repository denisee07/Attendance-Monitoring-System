// Teacher views

async function getTeacherProfile() {
  const res = await API.get('/teachers');
  const teachers = res.data.teachers || [];
  const t = teachers.find((x) => x.username === App.user.username);
  return t || null;
}

function teacherStatusSelect(student, currentStatus) {
  const options = [
    { value: 'present', label: 'Present' },
    { value: 'absent', label: 'Absent' },
    { value: 'late', label: 'Late' },
    { value: 'excused', label: 'Excused' },
  ];
  let html = `<select class="input status-select" data-student-id="${student.id}">`;
  for (const o of options) {
    html += `<option value="${o.value}" ${currentStatus === o.value ? 'selected' : ''}>${o.label}</option>`;
  }
  html += `</select>`;
  return html;
}

async function renderTeacherAttendance() {
  App.route = 'teacher-attendance';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Take Attendance</h2><p class="sub">Record attendance for your assigned class</p></div></div>
    <div class="card" style="margin-bottom:16px">
      <div class="grid-2-even">
        <div class="field"><label>Class Section</label><select id="att-teacher-section"></select></div>
        <div class="field"><label>Date</label><input id="att-teacher-date" type="date" value="${todayStr()}" /></div>
      </div>
    </div>
    <div id="teacher-attendance-records"></div>`;
  const teacher = await getTeacherProfile();
  const sectionSelect = document.getElementById('att-teacher-section');
  sectionSelect.innerHTML = `<option value="">Select a section...</option>`;
  if (teacher) {
    const sections = (teacher.sections || []).map((s) => String(s));
    const secRes = await API.get('/sections');
    const allSections = secRes.data.sections || [];
    const found = [];
    for (const s of allSections) {
      const gradePart = `${s.gradeLevel}`;
      const secStr = `${gradePart}-${s.name}`;
      if (sections.includes(secStr) || sections.includes(s.name)) found.push(s);
    }
    for (const s of found) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `Grade ${s.gradeLevel} - Section ${s.name}`;
      sectionSelect.appendChild(o);
    }
  }
  document.getElementById('att-teacher-date').addEventListener('change', async () => { await renderTeacherAttendanceRecords(); });
  sectionSelect.addEventListener('change', async () => { await renderTeacherAttendanceRecords(); });
  await renderTeacherAttendanceRecords();
}

async function renderTeacherAttendanceRecords() {
  const container = document.getElementById('teacher-attendance-records');
  const sectionId = document.getElementById('att-teacher-section').value;
  const date = document.getElementById('att-teacher-date').value;
  if (!sectionId) { container.innerHTML = `<div class="card"><div class="empty-state">Select a class section to take attendance.</div></div>`; return; }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { container.innerHTML = `<div class="card"><div class="empty-state">Please select a valid date to take attendance.</div></div>`; return; }
  const res = await API.get(`/attendance?sectionId=${sectionId}&date=${date}&limit=100`);
  const records = res.data.records || [];
  const recMap = new Map();
  for (const r of records) recMap.set(Number(r.studentId), r);
  const secRes = await API.get('/sections');
  const sec = (secRes.data.sections || []).find((s) => Number(s.id) === Number(sectionId));
  const studentsRes = await API.get(`/students?gradeLevel=${sec ? sec.gradeLevel : ''}&section=${sec ? sec.name : ''}&limit=100`);
  const students = studentsRes.data.students || [];
  if (!students.length) { container.innerHTML = `<div class="card"><div class="empty-state">No students enrolled in this section.</div></div>`; return; }
  let html = `<div class="card"><div class="card-title">Class: ${sec ? `Grade ${sec.gradeLevel}` : ''} Section ${sec ? sec.name : ''} - ${escapeHtml(fmtDate(date))}</div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Student ID</th><th>Full Name</th><th>Status</th><th>Recorded</th></tr></thead><tbody>`;
  for (const s of students) {
    const existing = recMap.get(Number(s.id));
    const current = existing ? existing.status : 'present';
    html += `<tr><td>${escapeHtml(s.studentNo)}</td><td>${escapeHtml(s.fullName)}</td><td>${teacherStatusSelect(s, current)}</td><td>${existing ? escapeHtml(fmtDateTime(existing.recordedAt)) : '<span class="muted">Not recorded</span>'}</td></tr>`;
  }
  html += `</tbody></table></div>
    <div class="mt"><button class="btn" id="teacher-save-attendance">Save Attendance</button></div>`;
  container.innerHTML = html;
  container.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', () => { sel.dataset.studentId = sel.dataset.studentId; });
  });
  document.getElementById('teacher-save-attendance').addEventListener('click', async () => {
    const dateVal = document.getElementById('att-teacher-date').value;
    const sectionIdVal = document.getElementById('att-teacher-section').value;
    if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) { toast('Please select a valid date before saving attendance.', 'error'); return; }
    if (!sectionIdVal) { toast('Please select a class section before saving attendance.', 'error'); return; }
    const selects = Array.from(container.querySelectorAll('.status-select'));
    const changed = [];
    for (const sel of selects) {
      const studentId = Number(sel.dataset.studentId);
      const status = sel.value;
      const existing = recMap.get(studentId);
      if (existing && existing.status === status) continue;
      changed.push({ studentId, status });
    }
    if (!changed.length) { toast('No changes to save. All students already have attendance recorded.'); return; }
    const t = await getTeacherProfile();
    const teacherId = t ? Number(t.id) : 0;
    if (!teacherId) { toast('Unable to load your teacher profile. Please try again.', 'error'); return; }
    for (const ch of changed) {
      await API.post('/attendance', { studentId: ch.studentId, sectionId: Number(sectionIdVal), date: dateVal, status: ch.status, teacherId });
    }
    toast('Attendance saved successfully.');
    await renderTeacherAttendanceRecords();
  });
}

async function renderTeacherRecords() {
  App.route = 'teacher-records';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Attendance Records</h2><p class="sub">View your recorded attendance</p></div></div>
    <div class="toolbar"><input class="input search-input" id="tch-rec-search" placeholder="Search by student name or ID..." /><div class="spacer"></div><span class="muted small" id="tch-rec-count"></span></div>
    <div id="tch-rec-table"></div>`;
  await renderTeacherRecordsTable();
  document.getElementById('tch-rec-search').addEventListener('input', async () => { await renderTeacherRecordsTable(); });
}

async function renderTeacherRecordsTable() {
  const container = document.getElementById('tch-rec-table');
  const search = document.getElementById('tch-rec-search').value.trim();
  const teacher = await getTeacherProfile();
  const res = await API.get(`/attendance?teacherId=${teacher ? teacher.id : ''}&search=${encodeURIComponent(search)}&limit=100`);
  const records = res.data.records || [];
  document.getElementById('tch-rec-count').textContent = `${res.data.total} record(s)`;
  if (!records.length) { container.innerHTML = `<div class="card"><div class="empty-state">No attendance records found.</div></div>`; return; }
  let html = `<div class="table-wrap"><table class="data"><thead><tr><th>Student ID</th><th>Student Name</th><th>Grade</th><th>Section</th><th>Date</th><th>Time</th><th>Status</th><th>Teacher</th></tr></thead><tbody>`;
  for (const r of records) {
    html += `<tr><td>${escapeHtml(r.studentNo)}</td><td>${escapeHtml(r.studentName)}</td><td>${r.gradeLevel}</td><td>${escapeHtml(r.section || '-')}</td><td>${escapeHtml(fmtDate(r.date))}</td><td>${escapeHtml(fmtDateTime(r.recordedAt))}</td><td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td><td>${escapeHtml(r.teacherName || '-')}</td></tr>`;
  }
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

async function renderTeacherReports() {
  App.route = 'teacher-reports';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Teacher Reports</h2><p class="sub">Attendance reports for your classes</p></div></div>
    <div class="toolbar"><button class="btn" id="tch-rep-daily">Daily</button><button class="btn btn-secondary" id="tch-rep-weekly">Weekly</button><button class="btn btn-secondary" id="tch-rep-monthly">Monthly</button><button class="btn btn-secondary" id="tch-rep-section">Section</button></div>
    <div class="row" style="margin-bottom:16px">
      <select class="input" id="tch-rep-section-select" style="max-width:320px"></select>
    </div>
    <div id="tch-report-result"></div>`;
  document.getElementById('tch-rep-daily').addEventListener('click', async () => { await runTeacherDailyReport(); });
  document.getElementById('tch-rep-weekly').addEventListener('click', async () => { await runTeacherWeeklyReport(); });
  document.getElementById('tch-rep-monthly').addEventListener('click', async () => { await runTeacherMonthlyReport(); });
  document.getElementById('tch-rep-section').addEventListener('click', async () => { await runTeacherSectionReport(); });
  const sel = document.getElementById('tch-rep-section-select');
  const teacher = await getTeacherProfile();
  const sections = (teacher && teacher.sections) ? teacher.sections.map((s) => String(s)) : [];
  const secRes = await API.get('/sections');
  const allSections = secRes.data.sections || [];
  const found = [];
  for (const s of allSections) { const secStr = `${s.gradeLevel}-${s.name}`; if (sections.includes(secStr) || sections.includes(s.name)) found.push(s); }
  sel.innerHTML = `<option value="">Select section...</option>`;
  for (const s of found) { const o = document.createElement('option'); o.value = s.id; o.textContent = `Grade ${s.gradeLevel} - Section ${s.name}`; sel.appendChild(o); }
  document.getElementById('tch-rep-section').addEventListener('click', async () => { await runTeacherSectionReport(); });
}

async function runTeacherDailyReport() {
  const teacher = await getTeacherProfile();
  const sections = (teacher && teacher.sections) ? teacher.sections.map((s) => String(s)) : [];
  const secRes = await API.get('/sections');
  const allSections = secRes.data.sections || [];
  const found = [];
  for (const s of allSections) { const secStr = `${s.gradeLevel}-${s.name}`; if (sections.includes(secStr) || sections.includes(s.name)) found.push(s); }
  const date = todayStr();
  let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalExcused = 0;
  for (const s of found) {
    const res = await API.get(`/reports/daily?date=${date}&sectionId=${s.id}`);
    const d = res.data;
    totalPresent += d.counts.present; totalAbsent += d.counts.absent; totalLate += d.counts.late; totalExcused += d.counts.excused;
  }
  document.getElementById('tch-report-result').innerHTML = `
    <div class="card"><div class="card-title">Teacher Daily Report - ${escapeHtml(fmtDate(date))}</div>
      <div class="report-summary">
        <div class="report-kpi"><div class="v">${totalPresent}</div><div class="l">Present</div></div>
        <div class="report-kpi"><div class="v">${totalAbsent}</div><div class="l">Absent</div></div>
        <div class="report-kpi"><div class="v">${totalLate}</div><div class="l">Late</div></div>
        <div class="report-kpi"><div class="v">${totalExcused}</div><div class="l">Excused</div></div>
      </div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="tch-rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="tch-rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('tch-rep-export-pdf').addEventListener('click', async () => { await exportPdf('/api/reports/export?type=daily'); });
  document.getElementById('tch-rep-export-xls').addEventListener('click', async () => { await exportXls('/api/reports/export?type=daily'); });
}

async function runTeacherWeeklyReport() {
  const res = await API.get('/reports/weekly');
  const data = res.data;
  let rows = '';
  for (const d of data.days) rows += `<tr><td>${escapeHtml(fmtDate(d.date))}</td><td>${d.counts.present + d.counts.late}</td><td>${d.counts.absent}</td><td>${d.counts.late}</td><td>${d.counts.excused}</td><td>${d.total}</td></tr>`;
  document.getElementById('tch-report-result').innerHTML = `
    <div class="card"><div class="card-title">Teacher Weekly Report</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Present/Late</th><th>Absent</th><th>Late</th><th>Excused</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="tch-rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="tch-rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('tch-rep-export-pdf').addEventListener('click', async () => { await exportPdf('/api/reports/export?type=weekly'); });
  document.getElementById('tch-rep-export-xls').addEventListener('click', async () => { await exportXls('/api/reports/export?type=weekly'); });
}

async function runTeacherMonthlyReport() {
  const now = new Date();
  const res = await API.get(`/reports/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);
  const data = res.data;
  document.getElementById('tch-report-result').innerHTML = `<div class="card"><div class="card-title">Teacher Monthly Report</div><p class="muted">${data.total} record(s) for the month.</p><div class="mt"><button class="btn btn-secondary btn-sm" id="tch-rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="tch-rep-export-xls">Export Excel</button></div></div>`;
  document.getElementById('tch-rep-export-pdf').addEventListener('click', async () => { await exportPdf('/api/reports/export?type=monthly'); });
  document.getElementById('tch-rep-export-xls').addEventListener('click', async () => { await exportXls('/api/reports/export?type=monthly'); });
}

async function runTeacherSectionReport() {
  const sel = document.getElementById('tch-rep-section-select');
  const sectionId = sel ? sel.value : '';
  if (!sectionId) { document.getElementById('tch-report-result').innerHTML = `<div class="card"><div class="empty-state">Select a section first.</div></div>`; return; }
  const data = await (await API.get(`/reports/section?sectionId=${sectionId}`)).data;
  document.getElementById('tch-report-result').innerHTML = `
    <div class="card"><div class="card-title">Teacher Section Report - Grade ${data.section.gradeLevel} Section ${data.section.name}</div>
      <div class="report-summary"><div class="report-kpi"><div class="v">${data.students.length}</div><div class="l">Enrolled</div></div><div class="report-kpi"><div class="v">${data.percentage === null ? 'N/A' : data.percentage + '%'}</div><div class="l">Attendance %</div></div></div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="tch-rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="tch-rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('tch-rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=section&sectionId=${sectionId}`); });
  document.getElementById('tch-rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=section&sectionId=${sectionId}`); });
}

async function renderTeacherNotifications() {
  App.route = 'teacher-notifications';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-head"><div><h2>Notifications</h2><p class="sub">Updates and alerts</p></div></div><div id="tch-notif-list"></div>`;
  const res = await API.get('/notifications');
  const notifications = res.data.notifications || [];
  let html = '';
  if (!notifications.length) html = `<div class="card"><div class="empty-state">No notifications.</div></div>`;
  else {
    html = `<div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Message</th><th>Status</th></tr></thead><tbody>`;
    for (const n of notifications) {
      html += `<tr><td>${escapeHtml(fmtDateTime(n.createdAt))}</td><td><span class="badge badge-neutral">${escapeHtml(n.type)}</span></td><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.message)}</td><td>${n.read ? '<span class="badge badge-present">Read</span>' : '<span class="badge badge-late">Unread</span>'}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  document.getElementById('tch-notif-list').innerHTML = html;
}

window.renderTeacherAttendance = renderTeacherAttendance;
window.renderTeacherRecords = renderTeacherRecords;
window.renderTeacherReports = renderTeacherReports;
window.renderTeacherNotifications = renderTeacherNotifications;
