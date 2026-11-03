// Student views

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

async function getMyStudent() {
  const res = await API.get(`/students?userId=${App.user ? App.user.id : ''}`);
  const list = res.data.students || [];
  return list.length ? list[0] : null;
}

async function getMyStudentProfile() {
  const student = await getMyStudent();
  return student;
}

function renderStudentCalendar(statusByDate) {
  const calEl = document.getElementById('student-calendar');
  const now = new Date(calYear, calMonth, 1);
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push({ date: null, status: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ date: iso, status: statusByDate.get(iso) || null });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, status: null });
  let calHtml = `<div class="calendar-header"><div class="calendar-title"><b>${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b></div><div class="row"><button class="btn btn-sm btn-secondary" id="cal-prev">Prev</button><button class="btn btn-sm btn-secondary" id="cal-next">Next</button></div></div>`;
  calHtml += `<div class="calendar-grid"><div class="calendar-dow">Sun</div><div class="calendar-dow">Mon</div><div class="calendar-dow">Tue</div><div class="calendar-dow">Wed</div><div class="calendar-dow">Thu</div><div class="calendar-dow">Fri</div><div class="calendar-dow">Sat</div>`;
  for (const c of cells) {
    if (!c.date) { calHtml += `<div class="calendar-cell empty"></div>`; continue; }
    const isToday = c.date === todayStr();
    const cls = c.status ? `status-${c.status}` : '';
    calHtml += `<div class="calendar-cell ${cls} ${isToday ? 'today' : ''}"><div class="dnum">${c.date.slice(8)}</div><div class="ds">${c.status ? statusLabel(c.status) : ''}</div></div>`;
  }
  calHtml += `</div>`;
  calEl.innerHTML = calHtml;
  document.getElementById('cal-prev').addEventListener('click', () => {
    const m = (calMonth + 11) % 12;
    calYear = calYear - (calMonth === 0 ? 1 : 0);
    calMonth = m;
    renderStudentCalendar(statusByDate);
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth = (calMonth + 1) % 12;
    if (calMonth === 0) calYear += 1;
    renderStudentCalendar(statusByDate);
  });
}

async function renderStudentPortal() {
  App.route = 'student-portal';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-head"><div><h2>My Attendance</h2><p class="sub">Your personal attendance overview</p></div></div><div id="student-portal-root"></div>`;
  const root = document.getElementById('student-portal-root');
  root.innerHTML = `<div class="stat-grid"></div><div class="grid-2"><div class="card"><div class="card-title">Attendance Calendar</div><div id="student-calendar"></div></div><div class="card"><div class="card-title">Attendance Summary</div><div id="student-summary"></div></div></div><div class="card mt"><div class="card-title">Attendance History</div><div id="student-history"></div></div>`;
  const student = await getMyStudentProfile();
  if (!student) { root.innerHTML = `<div class="card"><div class="empty-state">Student profile not found.</div></div>`; return; }
  const historyRes = await API.get(`/students/${student.id}`);
  const history = historyRes.data.history || [];
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  const statusByDate = new Map();
  for (const h of history) {
    counts[h.status] = (counts[h.status] || 0) + 1;
    const d = new Date(`${h.date}T00:00:00`);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    statusByDate.set(key, h.status);
  }
  const denom = (counts.present + counts.late) + counts.absent;
  const overallPct = denom > 0 ? ((counts.present + counts.late) / denom) * 100 : null;

  root.insertAdjacentHTML('beforeend', `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-icon navy"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg></div><div><div class="stat-value">${history.length}</div><div class="stat-label">Days Recorded</div></div></div>
      <div class="stat-card"><div class="stat-icon green"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><path d="m9 11 3 3L22 4"></path></svg></div><div><div class="stat-value">${counts.present}</div><div class="stat-label">Present</div></div></div>
      <div class="stat-card"><div class="stat-icon red"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4 M12 16h.01"></path></svg></div><div><div class="stat-value">${counts.absent}</div><div class="stat-label">Absent</div></div></div>
      <div class="stat-card"><div class="stat-icon amber"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg></div><div><div class="stat-value">${counts.late}</div><div class="stat-label">Late</div></div></div>
      <div class="stat-card"><div class="stat-icon gray"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4 M12 8h.01"></path></svg></div><div><div class="stat-value">${counts.excused}</div><div class="stat-label">Excused</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4 M12 8h.01"></path></svg></div><div><div class="stat-value">${pct(overallPct)}</div><div class="stat-label">Attendance %</div></div></div>
    </div>`);

  // profile card
  root.insertAdjacentHTML('beforeend', `<div class="card mt"><div class="card-title">My Profile</div>
      <div class="grid-2-even">
        <div><h3>${escapeHtml(student.fullName)}</h3><p><b>Student ID:</b> ${escapeHtml(student.studentNo)}</p><p><b>Grade Level:</b> ${student.gradeLevel}</p><p><b>Section:</b> ${escapeHtml(student.section || '-')}</p><p><b>School Year:</b> ${escapeHtml(student.schoolYear || '-')}</p></div>
        <div><p class="muted">Gender: ${escapeHtml(student.gender || '-')}</p><p class="muted">Contact: ${escapeHtml(student.contact || '-')}</p></div>
      </div></div>`);

  // calendar
  const calEl = document.getElementById('student-calendar');
  renderStudentCalendar(statusByDate);

  // summary
  document.getElementById('student-summary').innerHTML = `
    <div class="report-summary">
      <div class="report-kpi"><div class="v">${history.length}</div><div class="l">Total Days</div></div>
      <div class="report-kpi"><div class="v">${counts.present}</div><div class="l">Present</div></div>
      <div class="report-kpi"><div class="v">${counts.absent}</div><div class="l">Absent</div></div>
      <div class="report-kpi"><div class="v">${counts.late}</div><div class="l">Late</div></div>
      <div class="report-kpi"><div class="v">${counts.excused}</div><div class="l">Excused</div></div>
      <div class="report-kpi"><div class="v">${pct(overallPct)}</div><div class="l">Overall %</div></div>
    </div>`;

  // history
  let histHtml = `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Teacher</th></tr></thead><tbody>`;
  for (const h of history) {
    histHtml += `<tr><td>${escapeHtml(fmtDate(h.date))}</td><td>${escapeHtml(fmtDateTime(h.recordedAt))}</td><td><span class="badge ${statusBadgeClass(h.status)}">${statusLabel(h.status)}</span></td><td>${escapeHtml(h.teacherName || '-')}</td></tr>`;
  }
  histHtml += `</tbody></table></div>`;
  document.getElementById('student-history').innerHTML = histHtml;
}

async function renderStudentRecords() {
  App.route = 'student-records';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-head"><div><h2>Attendance History</h2><p class="sub">Your attendance records</p></div></div><div id="student-records-table"></div>`;
  const student = await getMyStudentProfile();
  const studentId = student ? student.id : null;
  const res = await API.get(`/attendance?studentId=${studentId}`);
  const records = res.data.records || [];
  let html = '';
  if (!records.length) html = `<div class="card"><div class="empty-state">No attendance records found.</div></div>`;
  else {
    html = `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Teacher</th></tr></thead><tbody>`;
    for (const r of records) {
      html += `<tr><td>${escapeHtml(fmtDate(r.date))}</td><td>${escapeHtml(fmtDateTime(r.recordedAt))}</td><td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td><td>${escapeHtml(r.teacherName || '-')}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  document.getElementById('student-records-table').innerHTML = html;
}

async function renderStudentReports() {
  App.route = 'student-reports';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-head"><div><h2>My Attendance Report</h2><p class="sub">Your personal attendance report</p></div></div><div id="student-report-result"></div>`;
  const student = await getMyStudentProfile();
  const studentId = student ? student.id : null;
  const res = await API.get(`/reports/student?studentId=${studentId}`);
  const data = res.data;
  document.getElementById('student-report-result').innerHTML = `
    <div class="card"><div class="card-title">Student Report - ${escapeHtml(data.student.fullName)} (${escapeHtml(data.student.studentNo)})</div>
      <div class="report-summary">
        <div class="report-kpi"><div class="v">${data.percentage === null ? 'N/A' : data.percentage + '%'}</div><div class="l">Attendance %</div></div>
        <div class="report-kpi"><div class="v">${data.counts.present}</div><div class="l">Present</div></div>
        <div class="report-kpi"><div class="v">${data.counts.absent}</div><div class="l">Absent</div></div>
        <div class="report-kpi"><div class="v">${data.counts.late}</div><div class="l">Late</div></div>
        <div class="report-kpi"><div class="v">${data.counts.excused}</div><div class="l">Excused</div></div>
      </div>
      <div class="row"><button class="btn btn-secondary btn-sm" id="stu-exp-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="stu-exp-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('stu-exp-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=student&studentId=${studentId}`); });
  document.getElementById('stu-exp-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=student&studentId=${studentId}`); });
}

async function renderStudentNotifications() {
  App.route = 'student-notifications';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-head"><div><h2>Notifications</h2><p class="sub">Updates and alerts</p></div></div><div id="stu-notif-list"></div>`;
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
  document.getElementById('stu-notif-list').innerHTML = html;
}

window.renderStudentPortal = renderStudentPortal;
window.renderStudentRecords = renderStudentRecords;
window.renderStudentReports = renderStudentReports;
window.renderStudentNotifications = renderStudentNotifications;
