// Admin views

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function gradeOptions() {
  const out = [];
  for (let g = 7; g <= 12; g++) out.push({ value: g, label: `Grade ${g}` });
  return out;
}

async function fetchAllSections() {
  const res = await API.get('/sections');
  const list = (res.data && res.data.sections) || [];
  return list.map((s) => ({ value: s.name, label: `Grade ${s.gradeLevel} - Section ${s.name}`, id: s.id }));
}

async function renderAdminDashboard() {
  App.route = 'admin-dashboard';
  const content = document.getElementById('content');
  content.innerHTML = `<div class="page-head"><div><h2>Administrator Dashboard</h2><p class="sub">Overview of school attendance</p></div></div>
    <div id="admin-dashboard-root"></div>`;
  const root = document.getElementById('admin-dashboard-root');
  root.innerHTML = `<div class="grid-2"><div class="card"><div class="card-title">Today's Attendance Status</div><div id="today-chart"></div></div><div class="card"><div class="card-title">Recent Activity</div><div id="recent-activity"></div></div></div>`;
  try {
    const [studentsRes, teachersRes, sectionsRes, daily] = await Promise.all([
      API.get('/students'),
      API.get('/teachers'),
      API.get('/sections'),
      API.get('/reports/daily?date=' + todayStr()),
    ]);
    const today = daily.data;
    const present = today.counts.present || 0;
    const absent = today.counts.absent || 0;
    const late = today.counts.late || 0;
    const excused = today.counts.excused || 0;
    const denom = (present + late) + absent;
    const overallPct = denom > 0 ? ((present + late) / denom) * 100 : null;

    const stats = [
      { label: 'Total Students', value: studentsRes.data.total, icon: 'navy', sub: 'Registered' },
      { label: 'Teachers', value: teachersRes.data.total, icon: 'green', sub: 'Active' },
      { label: 'Sections', value: sectionsRes.data.total, icon: 'gray', sub: 'This School Year' },
      { label: 'Overall Attendance %', value: pct(overallPct), icon: 'blue', sub: 'Today' },
    ];
    const statHtml = stats.map((s) => `
      <div class="stat-card">
        <div class="stat-icon ${s.icon}">${iconSvg(s.icon)}</div>
        <div><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div><div class="small muted">${s.sub}</div></div>
      </div>`).join('');
    root.insertAdjacentHTML('beforeend', `<div class="stat-grid">${statHtml}</div>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-icon green">${iconSvg('green')}</div><div><div class="stat-value">${present}</div><div class="stat-label">Present Today</div></div></div>
        <div class="stat-card"><div class="stat-icon red">${iconSvg('red')}</div><div><div class="stat-value">${absent}</div><div class="stat-label">Absent Today</div></div></div>
        <div class="stat-card"><div class="stat-icon amber">${iconSvg('amber')}</div><div><div class="stat-value">${late}</div><div class="stat-label">Late Today</div></div></div>
        <div class="stat-card"><div class="stat-icon gray">${iconSvg('gray')}</div><div><div class="stat-value">${excused}</div><div class="stat-label">Excused Today</div></div></div>
      </div>
      <div class="grid-2 mt"><div class="card"><div class="card-title">Today's Attendance Status</div><div id="today-chart"></div></div><div class="card"><div class="card-title">Recent Activity</div><div id="recent-activity"></div></div></div>`);

    const chartEl = document.getElementById('today-chart');
    const bars = [
      { label: 'Present', value: present, color: '#16a34a' },
      { label: 'Absent', value: absent, color: '#dc2626' },
      { label: 'Late', value: late, color: '#d97706' },
      { label: 'Excused', value: excused, color: '#64748b' },
    ];
    chartEl.innerHTML = bars.map((b) => `
      <div class="bar-row"><div class="bar-label">${b.label}</div><div class="bar-track"><div class="bar-fill" style="width: ${(b.value / Math.max(1, Math.max(...bars.map(x => x.value)))) * 100}%; background: ${b.color}"></div></div><div class="bar-value">${b.value}</div></div>`).join('');

    const recent = (today.records || []).slice(0, 8);
    const recentEl = document.getElementById('recent-activity');
    if (!recent.length) { recentEl.innerHTML = '<div class="empty-state">No attendance recorded yet today.</div>'; }
    else {
      let html = `<table class="data"><thead><tr><th>Student</th><th>Student ID</th><th>Section</th><th>Date</th><th>Status</th><th>Teacher</th></tr></thead><tbody>`;
      for (const r of recent) {
        html += `<tr><td>${escapeHtml(r.studentName)}</td><td>${escapeHtml(r.studentNo)}</td><td>${escapeHtml(r.section || '-')} (Gr. ${r.gradeLevel})</td><td>${escapeHtml(fmtDate(r.date))}</td><td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td><td>${escapeHtml(r.teacherName)}</td></tr>`;
      }
      html += `</tbody></table>`;
      recentEl.innerHTML = html;
    }
  } catch (e) { root.innerHTML = `<div class="empty-state">Failed to load dashboard: ${escapeHtml(e.message || 'error')}</div>`; }
}

function iconSvg(key) {
  const map = {
    navy: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    green: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><path d="m9 11 3 3L22 4"></path></svg>',
    red: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></path><path d="M12 8v4 M12 16h.01"></path></svg>',
    amber: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></path><path d="M12 8v4l3 3"></path></svg>',
    gray: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></path><path d="M12 16v-4 M12 8h.01"></path></svg>',
    blue: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></path><path d="M12 16v-4 M12 8h.01"></path></svg>',
  };
  return map[key] || map.navy;
}

async function renderAdminStudents() {
  App.route = 'admin-students';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Student Management</h2><p class="sub">Manage student records</p></div><div class="row"><button class="btn" id="btn-open-student-modal">Add Student</button><button class="btn btn-secondary" id="btn-import-students">Import Students</button></div></div>
    <div class="toolbar">
      <input class="input search-input" id="stu-search" placeholder="Search by name or ID..." />
      <select class="input" id="stu-grade"><option value="">All Grades</option></select>
      <select class="input" id="stu-section"><option value="">All Sections</option></select>
      <div class="spacer"></div>
      <span class="muted small" id="stu-count"></span>
    </div>
    <div id="stu-table-container"></div>`;
  await loadStudentFilters();
  await renderStudentTable();
  wireStudentToolbar();
}

async function loadStudentFilters() {
  const gradeRes = await API.get('/students?gradeLevel=7');
  void gradeRes;
  const sections = await fetchAllSections();
  const gradeSelect = document.getElementById('stu-grade');
  gradeSelect.innerHTML = `<option value="">All Grades</option>`;
  for (let g = 7; g <= 12; g++) { const o = document.createElement('option'); o.value = g; o.textContent = `Grade ${g}`; gradeSelect.appendChild(o); }
  const sectionSelect = document.getElementById('stu-section');
  sectionSelect.innerHTML = `<option value="">All Sections</option>`;
  const secRes = await API.get('/sections');
  for (const s of (secRes.data.sections || [])) { const o = document.createElement('option'); o.value = s.name; o.textContent = `Grade ${s.gradeLevel} - ${s.name}`; sectionSelect.appendChild(o); }
}

async function renderStudentTable() {
  const container = document.getElementById('stu-table-container');
  const search = document.getElementById('stu-search').value.trim();
  const grade = document.getElementById('stu-grade').value;
  const section = document.getElementById('stu-section').value;
  const res = await API.get(`/students?search=${encodeURIComponent(search)}&gradeLevel=${grade}&section=${section}`);
  const students = res.data.students || [];
  document.getElementById('stu-count').textContent = `${res.data.total} student(s)`;
  if (!students.length) { container.innerHTML = `<div class="card"><div class="empty-state">No students found.</div></div>`; return; }
  let html = `<div class="table-wrap"><table class="data"><thead><tr><th>Student ID</th><th>Full Name</th><th>Gender</th><th>Grade</th><th>Section</th><th>School Year</th><th>Contact</th><th>Actions</th></tr></thead><tbody>`;
  for (const s of students) {
    html += `<tr>
      <td>${escapeHtml(s.studentNo)}</td>
      <td>${escapeHtml(s.fullName)}</td>
      <td>${escapeHtml(s.gender || '-')}</td>
      <td>${s.gradeLevel}</td>
      <td>${escapeHtml(s.section || '-')}</td>
      <td>${escapeHtml(s.schoolYear || '-')}</td>
      <td>${escapeHtml(s.contact || '-')}</td>
      <td>
        <div class="row" style="gap:6px">
          <button class="btn btn-sm btn-secondary" data-action="view" data-id="${s.id}">View</button>
          <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${s.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-action="delete" data-id="${s.id}">Delete</button>
        </div>
      </td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  container.innerHTML = html;
  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;
      if (action === 'view') await openStudentView(id);
      if (action === 'edit') await openStudentEdit(id);
      if (action === 'delete') await deleteStudent(id);
    });
  });
}

async function openStudentView(id) {
  const res = await API.get(`/students/${id}`);
  const s = res.data.student;
  const history = res.data.history || [];
  const body = `
    <div class="grid-2-even">
      <div>
        <h3>${escapeHtml(s.fullName)}</h3>
        <p><b>Student ID:</b> ${escapeHtml(s.studentNo)}</p>
        <p><b>Gender:</b> ${escapeHtml(s.gender || '-')}</p>
        <p><b>Grade Level:</b> ${s.gradeLevel}</p>
        <p><b>Section:</b> ${escapeHtml(s.section || '-')}</p>
        <p><b>School Year:</b> ${escapeHtml(s.schoolYear || '-')}</p>
        <p><b>Contact:</b> ${escapeHtml(s.contact || '-')}</p>
      </div>
      <div>
        <h3>Recent History</h3>
        ${history.length ? `<table class="data"><thead><tr><th>Date</th><th>Status</th><th>Teacher</th></tr></thead><tbody>${history.map((h) => `<tr><td>${escapeHtml(fmtDate(h.date))}</td><td><span class="badge ${statusBadgeClass(h.status)}">${statusLabel(h.status)}</span></td><td>${escapeHtml(h.teacherName || '-')}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No records.</p>'}
      </div>
    </div>`;
  openModal(`Student Profile - ${s.fullName}`, body, `<button class="btn" id="modal-close-btn2">Close</button>`);
}

async function openStudentEdit(id) {
  const res = await API.get(`/students/${id}`);
  const s = res.data.student;
  const body = `
    <div class="field"><label>Student Number</label><input id="stu-edit-no" value="${escapeHtml(s.studentNo)}" disabled /></div>
    <div class="field"><label>Full Name</label><input id="stu-edit-name" value="${escapeHtml(s.fullName)}" /></div>
    <div class="field"><label>Gender</label><select id="stu-edit-gender"><option value="">Select</option><option value="Male" ${s.gender === 'Male' ? 'selected' : ''}>Male</option><option value="Female" ${s.gender === 'Female' ? 'selected' : ''}>Female</option></select></div>
    <div class="field"><label>Grade Level</label><select id="stu-edit-grade"><option value="">Select</option>${gradeOptions().map((g) => `<option value="${g.value}" ${s.gradeLevel === g.value ? 'selected' : ''}>${g.label}</option>`).join('')}</select></div>
    <div class="field"><label>Section</label><input id="stu-edit-section" value="${escapeHtml(s.section || '')}" /></div>
    <div class="field"><label>School Year</label><input id="stu-edit-sy" value="${escapeHtml(s.schoolYear || '')}" /></div>
    <div class="field"><label>Contact</label><input id="stu-edit-contact" value="${escapeHtml(s.contact || '')}" /></div>`;
  const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="stu-edit-save">Save</button>`;
  const modalBody = openModal(`Edit Student - ${s.fullName}`, body, actions);
  document.getElementById('stu-edit-save').addEventListener('click', async () => {
    const fullName = document.getElementById('stu-edit-name').value.trim();
    const gradeLevel = Number(document.getElementById('stu-edit-grade').value);
    const section = document.getElementById('stu-edit-section').value.trim();
    if (!fullName) { toast('Full name is required.', 'error'); return; }
    if (!gradeLevel || gradeLevel < 7 || gradeLevel > 12) { toast('Please select a valid grade level (7-12).', 'error'); return; }
    if (!section) { toast('Section is required.', 'error'); return; }
    const payload = {
      fullName,
      gender: document.getElementById('stu-edit-gender').value || null,
      gradeLevel,
      section,
      schoolYear: document.getElementById('stu-edit-sy').value.trim(),
      contact: document.getElementById('stu-edit-contact').value.trim(),
    };
    try {
      await API.put(`/students/${id}`, payload);
      closeModal();
      toast('Student updated successfully.');
      renderAdminStudents();
    } catch (e) { toast(e.message || 'Update failed.', 'error'); }
  });
}

async function deleteStudent(id) {
  const res = await API.get(`/students/${id}`);
  const s = res.data.student;
  confirmModal(`Delete Student - ${s.fullName}`, `Are you sure you want to delete ${s.fullName} (${s.studentNo})? This action cannot be undone.`, async () => {
    try { await API.del(`/students/${id}`); toast('Student deleted successfully.'); renderAdminStudents(); }
    catch (e) { toast(e.message || 'Delete failed.', 'error'); }
  });
}

function wireStudentToolbar() {
  document.getElementById('btn-open-student-modal').addEventListener('click', async () => {
    const body = `
      <div class="field"><label>Student Number</label><input id="stu-add-no" placeholder="e.g. STU-2026-100" /></div>
      <div class="field"><label>Full Name</label><input id="stu-add-name" /></div>
      <div class="field"><label>Gender</label><select id="stu-add-gender"><option value="">Select</option><option>Male</option><option>Female</option></select></div>
      <div class="field"><label>Grade Level</label><select id="stu-add-grade">${gradeOptions().map((g) => `<option value="${g.value}">${g.label}</option>`).join('')}</select></div>
      <div class="field"><label>Section</label><input id="stu-add-section" placeholder="e.g. A" /></div>
      <div class="field"><label>School Year</label><input id="stu-add-sy" value="2025-2026" /></div>
      <div class="field"><label>Contact</label><input id="stu-add-contact" /></div>`;
    const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="stu-add-save">Add Student</button>`;
    openModal('Add Student', body, actions);
    document.getElementById('stu-add-save').addEventListener('click', async () => {
      const studentNo = document.getElementById('stu-add-no').value.trim();
      const fullName = document.getElementById('stu-add-name').value.trim();
      const gradeLevel = Number(document.getElementById('stu-add-grade').value);
      const section = document.getElementById('stu-add-section').value.trim();
      if (!studentNo) { toast('Student number is required.', 'error'); return; }
      if (!fullName) { toast('Full name is required.', 'error'); return; }
      if (!gradeLevel || gradeLevel < 7 || gradeLevel > 12) { toast('Please select a valid grade level (7-12).', 'error'); return; }
      if (!section) { toast('Section is required.', 'error'); return; }
      const payload = {
        studentNo,
        fullName,
        gender: document.getElementById('stu-add-gender').value || null,
        gradeLevel,
        section,
        schoolYear: document.getElementById('stu-add-sy').value.trim() || '2025-2026',
        contact: document.getElementById('stu-add-contact').value.trim(),
      };
      try {
        await API.post('/students', payload);
        closeModal();
        toast('Student added successfully.');
        renderAdminStudents();
      } catch (e) { toast(e.message || 'Add failed.', 'error'); }
    });
  });
  document.getElementById('btn-import-students').addEventListener('click', async () => {
    const body = `<p>Paste student rows as JSON array. Format: studentNo, fullName, gender, gradeLevel, section, schoolYear, contact.</p>
      <div class="field"><textarea id="stu-import-rows" rows="8" placeholder='[{"studentNo":"STU-2026-200","fullName":"Juan Dela Cruz","gender":"Male","gradeLevel":7,"section":"A","schoolYear":"2025-2026","contact":"09170000000"}]'></textarea></div>
      <button class="btn" id="stu-import-save">Import</button>`;
    const modalBody = openModal('Import Students', body, `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="stu-import-save">Import</button>`);
    document.getElementById('stu-import-save').addEventListener('click', async () => {
      const text = document.getElementById('stu-import-rows').value.trim();
      let rows = [];
      try { rows = JSON.parse(text); } catch (e) { toast('Invalid JSON array provided.', 'error'); return; }
      try {
        const res = await API.post('/students/import', { rows });
        toast(`Imported ${res.data.created} student(s).`);
        closeModal();
        renderAdminStudents();
      } catch (e) { toast(e.message || 'Import failed.', 'error'); }
    });
  });
}

// ---------- Admin teachers ----------
async function openTeacherAddModal() {
  const body = `
    <div class="field"><label>Teacher Number</label><input id="tch-add-no" placeholder="e.g. T-005" /></div>
    <div class="field"><label>Full Name</label><input id="tch-add-name" /></div>
    <div class="field"><label>Email</label><input id="tch-add-email" /></div>
    <div class="field"><label>Subject</label><input id="tch-add-subject" /></div>
    <div class="field"><label>Assigned Grade Levels (comma separated, e.g. 7,8)</label><input id="tch-add-grades" value="7" /></div>
    <div class="field"><label>Assigned Sections (comma separated, e.g. 7-A, 8-B)</label><input id="tch-add-sections" value="7-A" /></div>
    <div class="field"><label>Username</label><input id="tch-add-username" /></div>
    <div class="field"><label>Temporary Password</label><input id="tch-add-password" type="password" placeholder="Min 8 characters, with upper/lower/number/special" /></div>`;
  const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="tch-add-save">Add Teacher</button>`;
  openModal('Add Teacher', body, actions);
  document.getElementById('tch-add-save').addEventListener('click', async () => {
    const teacherNo = document.getElementById('tch-add-no').value.trim();
    const fullName = document.getElementById('tch-add-name').value.trim();
    const email = document.getElementById('tch-add-email').value.trim();
    const subject = document.getElementById('tch-add-subject').value.trim();
    const gradesRaw = (document.getElementById('tch-add-grades').value || '').split(',').map((x) => x.trim()).filter(Boolean);
    const sectionsRaw = (document.getElementById('tch-add-sections').value || '').split(',').map((x) => x.trim()).filter(Boolean);
    const username = document.getElementById('tch-add-username').value.trim().toLowerCase();
    const password = document.getElementById('tch-add-password').value;
    if (!teacherNo) { toast('Teacher number is required.', 'error'); return; }
    if (!fullName) { toast('Full name is required.', 'error'); return; }
    if (!subject) { toast('Subject is required.', 'error'); return; }
    if (!username || !password) { toast('Username and temporary password are required.', 'error'); return; }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) { toast('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.', 'error'); return; }
    const payload = { teacherNo, fullName, email, subject, gradeLevels: gradesRaw.map(Number), sections: sectionsRaw, username, password };
    try { await API.post('/teachers', payload); closeModal(); toast('Teacher added successfully.'); renderAdminTeachers(); }
    catch (e) { toast(e.message || 'Add failed.', 'error'); }
  });
}

async function renderAdminTeachers() {
  App.route = 'admin-teachers';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Teacher Management</h2><p class="sub">Manage teacher accounts and assignments</p></div><div class="row"><button class="btn" id="btn-open-teacher-modal">Add Teacher</button></div></div>
    <div class="toolbar"><input class="input search-input" id="tch-search" placeholder="Search by name or teacher ID..." /><div class="spacer"></div><span class="muted small" id="tch-count"></span></div>
    <div id="tch-table-container"></div>`;
  await renderTeacherTable();
  document.getElementById('tch-search').addEventListener('input', async () => { await renderTeacherTable(); });
  document.getElementById('btn-open-teacher-modal').addEventListener('click', openTeacherAddModal);
}

async function renderTeacherTable() {
  const container = document.getElementById('tch-table-container');
  const search = document.getElementById('tch-search').value.trim();
  const res = await API.get(`/teachers?search=${encodeURIComponent(search)}`);
  const teachers = res.data.teachers || [];
  document.getElementById('tch-count').textContent = `${res.data.total} teacher(s)`;
  if (!teachers.length) { container.innerHTML = `<div class="card"><div class="empty-state">No teachers found.</div></div>`; return; }
  let html = `<div class="table-wrap"><table class="data"><thead><tr><th>Teacher ID</th><th>Full Name</th><th>Email</th><th>Subject</th><th>Grade Levels</th><th>Sections</th><th>Username</th><th>Actions</th></tr></thead><tbody>`;
  for (const t of teachers) {
    html += `<tr>
      <td>${escapeHtml(t.teacherNo)}</td>
      <td>${escapeHtml(t.fullName)}</td>
      <td>${escapeHtml(t.email || '-')}</td>
      <td>${escapeHtml(t.subject || '-')}</td>
      <td>${(t.gradeLevels || []).join(', ') || '-'}</td>
      <td>${(t.sections || []).join(', ') || '-'}</td>
      <td>${escapeHtml(t.username || '-')}</td>
      <td><div class="row" style="gap:6px"><button class="btn btn-sm btn-secondary" data-action="edit" data-id="${t.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${t.id}">Delete</button></div></td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  container.innerHTML = html;
  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'edit') await openTeacherEdit(id);
      if (btn.dataset.action === 'delete') await deleteTeacher(id);
    });
  });
}

async function openTeacherEdit(id) {
  const res = await API.get(`/teachers`);
  const teachers = res.data.teachers || [];
  const t = teachers.find((x) => Number(x.id) === id);
  if (!t) { toast('Teacher not found.', 'error'); return; }
  const body = `
    <div class="field"><label>Teacher Number</label><input id="tch-edit-no" value="${escapeHtml(t.teacherNo)}" disabled /></div>
    <div class="field"><label>Full Name</label><input id="tch-edit-name" value="${escapeHtml(t.fullName)}" /></div>
    <div class="field"><label>Email</label><input id="tch-edit-email" value="${escapeHtml(t.email || '')}" /></div>
    <div class="field"><label>Subject</label><input id="tch-edit-subject" value="${escapeHtml(t.subject || '')}" /></div>
    <div class="field"><label>Assigned Grade Levels (comma separated, e.g. 7,8)</label><input id="tch-edit-grades" value="${(t.gradeLevels || []).join(',')}" /></div>
    <div class="field"><label>Assigned Sections (comma separated, e.g. 7-A, 8-B)</label><input id="tch-edit-sections" value="${(t.sections || []).join(', ')}" /></div>
    <div class="field"><label>Username</label><input id="tch-edit-username" value="${escapeHtml(t.username || '')}" /></div>
    <div class="field"><label>Password (leave blank to keep current)</label><input id="tch-edit-password" type="password" placeholder="New password" /></div>`;
  const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="tch-edit-save">Save</button>`;
  openModal(`Edit Teacher - ${t.fullName}`, body, actions);
  document.getElementById('tch-edit-save').addEventListener('click', async () => {
    const fullName = document.getElementById('tch-edit-name').value.trim();
    const subject = document.getElementById('tch-edit-subject').value.trim();
    const username = document.getElementById('tch-edit-username').value.trim();
    if (!fullName) { toast('Full name is required.', 'error'); return; }
    if (!subject) { toast('Subject is required.', 'error'); return; }
    if (!username) { toast('Username is required.', 'error'); return; }
    const password = document.getElementById('tch-edit-password').value;
    if (password && (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))) { toast('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.', 'error'); return; }
    const payload = {
      fullName,
      email: document.getElementById('tch-edit-email').value.trim(),
      subject,
      gradeLevels: (document.getElementById('tch-edit-grades').value || '').split(',').map((x) => x.trim()).filter(Boolean).map(Number),
      sections: (document.getElementById('tch-edit-sections').value || '').split(',').map((x) => x.trim()).filter(Boolean),
      username,
      password: password || undefined,
    };
    try {
      await API.put(`/teachers/${id}`, payload);
      closeModal();
      toast('Teacher updated successfully.');
      renderAdminTeachers();
    } catch (e) { toast(e.message || 'Update failed.', 'error'); }
  });
}

async function deleteTeacher(id) {
  confirmModal('Delete Teacher', 'Are you sure you want to delete this teacher? Related attendance records will also be removed.', async () => {
    try { await API.del(`/teachers/${id}`); toast('Teacher deleted successfully.'); renderAdminTeachers(); }
    catch (e) { toast(e.message || 'Delete failed.', 'error'); }
  });
}

// ---------- Admin sections ----------
async function renderAdminSections() {
  App.route = 'admin-sections';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Section Management</h2><p class="sub">Manage classes and sections</p></div><div class="row"><button class="btn" id="btn-open-section-modal">Add Section</button></div></div>
    <div id="section-cards-container"></div>`;
  const container = document.getElementById('section-cards-container');
  const res = await API.get('/sections');
  const sections = res.data.sections || [];
  let html = '';
  for (const s of sections) {
    html += `<div class="section-card">
      <div class="section-card-head"><div><div class="section-card-title">Section ${s.name}</div><div class="section-card-sub">Grade ${s.gradeLevel} - School Year ${s.schoolYear}</div></div><span class="badge badge-neutral">${s.enrolledCount} enrolled</span></div>
      <div class="section-card-meta"><span>Adviser: <b>${escapeHtml(s.adviserName || 'Unassigned')}</b></span><span>Teacher ID: <b>${escapeHtml(s.adviserTeacherNo || '-')}</b></span></div>
      <div class="section-card-actions"><button class="btn btn-sm btn-secondary" data-action="edit" data-id="${s.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete" data-id="${s.id}">Delete</button></div>
    </div>`;
  }
  container.innerHTML = sections.length ? html : `<div class="card"><div class="empty-state">No sections yet.</div></div>`;
  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => { const id = Number(btn.dataset.id); if (btn.dataset.action === 'edit') await openSectionEdit(id); if (btn.dataset.action === 'delete') await deleteSection(id); });
  });
  document.getElementById('btn-open-section-modal').addEventListener('click', async () => {
    const body = `
      <div class="field"><label>Section Name</label><input id="sec-name" placeholder="e.g. A" /></div>
      <div class="field"><label>Grade Level</label><select id="sec-grade">${gradeOptions().map((g) => `<option value="${g.value}">${g.label}</option>`).join('')}</select></div>
      <div class="field"><label>School Year</label><input id="sec-sy" value="2025-2026" /></div>
      <div class="field"><label>Adviser Teacher</label><select id="sec-adviser"><option value="">None</option>${(await (await API.get('/teachers')).data.teachers || []).map((t) => `<option value="${t.id}">${t.fullName}</option>`).join('')}</select></div>`;
    const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="sec-save">Add Section</button>`;
    openModal('Add Section', body, actions);
    document.getElementById('sec-save').addEventListener('click', async () => {
      const name = document.getElementById('sec-name').value.trim().toUpperCase();
      const gradeLevel = Number(document.getElementById('sec-grade').value);
      const schoolYear = document.getElementById('sec-sy').value.trim();
      if (!name) { toast('Section name is required.', 'error'); return; }
      if (!gradeLevel || gradeLevel < 7 || gradeLevel > 12) { toast('Please select a valid grade level (7-12).', 'error'); return; }
      if (!schoolYear) { toast('School year is required.', 'error'); return; }
      const payload = { name, gradeLevel, schoolYear, adviserTeacherId: document.getElementById('sec-adviser').value ? Number(document.getElementById('sec-adviser').value) : null };
      try { await API.post('/sections', payload); closeModal(); toast('Section created.'); renderAdminSections(); } catch (e) { toast(e.message || 'Failed.', 'error'); }
    });
  });
}

async function openSectionEdit(id) {
  const res = await API.get(`/sections`);
  const s = (res.data.sections || []).find((x) => Number(x.id) === id);
  if (!s) return;
  const body = `
    <div class="field"><label>Section Name</label><input id="sec-edit-name" value="${escapeHtml(s.name)}" /></div>
    <div class="field"><label>Grade Level</label><select id="sec-edit-grade">${gradeOptions().map((g) => `<option value="${g.value}" ${s.gradeLevel === g.value ? 'selected' : ''}>${g.label}</option>`).join('')}</select></div>
    <div class="field"><label>School Year</label><input id="sec-edit-sy" value="${escapeHtml(s.schoolYear)}" /></div>
    <div class="field"><label>Adviser Teacher</label><select id="sec-edit-adviser"><option value="">None</option>${(await (await API.get('/teachers')).data.teachers || []).map((t) => `<option value="${t.id}" ${s.adviserTeacherId === t.id ? 'selected' : ''}>${t.fullName}</option>`).join('')}</select></div>`;
  const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="sec-edit-save">Save</button>`;
  openModal(`Edit Section ${s.name}`, body, actions);
  document.getElementById('sec-edit-save').addEventListener('click', async () => {
    const name = document.getElementById('sec-edit-name').value.trim().toUpperCase();
    const gradeLevel = Number(document.getElementById('sec-edit-grade').value);
    const schoolYear = document.getElementById('sec-edit-sy').value.trim();
    if (!name) { toast('Section name is required.', 'error'); return; }
    if (!gradeLevel || gradeLevel < 7 || gradeLevel > 12) { toast('Please select a valid grade level (7-12).', 'error'); return; }
    if (!schoolYear) { toast('School year is required.', 'error'); return; }
    const payload = { name, gradeLevel, schoolYear, adviserTeacherId: document.getElementById('sec-edit-adviser').value ? Number(document.getElementById('sec-edit-adviser').value) : null };
    try { await API.put(`/sections/${id}`, payload); closeModal(); toast('Section updated.'); renderAdminSections(); } catch (e) { toast(e.message || 'Failed.', 'error'); }
  });
}

async function deleteSection(id) {
  confirmModal('Delete Section', 'Delete this section? Students assigned to it will be unassigned.', async () => {
    try { await API.del(`/sections/${id}`); toast('Section deleted.'); renderAdminSections(); } catch (e) { toast(e.message || 'Failed.', 'error'); }
  });
}

// ---------- Admin records ----------
async function renderAdminRecords() {
  App.route = 'admin-records';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Attendance Records</h2><p class="sub">Search and filter attendance records</p></div></div>
    <div class="toolbar">
      <input class="input search-input" id="att-search" placeholder="Search by student name or ID..." />
      <select class="input" id="att-grade"><option value="">All Grades</option></select>
      <select class="input" id="att-section"><option value="">All Sections</option></select>
      <input class="input" id="att-date" type="date" />
      <select class="input" id="att-status"><option value="">All Statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select>
      <div class="spacer"></div>
      <button class="btn btn-secondary" id="att-reset">Reset</button>
    </div>
    <div id="att-table-container"></div>`;
  await loadAttFilters();
  await renderAttTable();
  wireAttToolbar();
}

async function loadAttFilters() {
  const gradeSelect = document.getElementById('att-grade');
  gradeSelect.innerHTML = `<option value="">All Grades</option>`;
  for (let g = 7; g <= 12; g++) { const o = document.createElement('option'); o.value = g; o.textContent = `Grade ${g}`; gradeSelect.appendChild(o); }
  const sectionSelect = document.getElementById('att-section');
  sectionSelect.innerHTML = `<option value="">All Sections</option>`;
  const secRes = await API.get('/sections');
  for (const s of (secRes.data.sections || [])) { const o = document.createElement('option'); o.value = s.name; o.textContent = `Grade ${s.gradeLevel} - ${s.name}`; sectionSelect.appendChild(o); }
}

async function renderAttTable() {
  const container = document.getElementById('att-table-container');
  const search = document.getElementById('att-search').value.trim();
  const grade = document.getElementById('att-grade').value;
  const section = document.getElementById('att-section').value;
  const date = document.getElementById('att-date').value;
  const status = document.getElementById('att-status').value;
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (grade) params.set('gradeLevel', grade);
  if (section) params.set('section', section);
  if (date) params.set('date', date);
  if (status) params.set('status', status);
  const qs = params.toString();
  const res = await API.get(`/attendance?${qs}`);
  const records = res.data.records || [];
  if (!records.length) { container.innerHTML = `<div class="card"><div class="empty-state">No attendance records found.</div></div>`; return; }
  let html = `<div class="table-wrap"><table class="data"><thead><tr><th>Student ID</th><th>Student Name</th><th>Grade</th><th>Section</th><th>Date</th><th>Time</th><th>Status</th><th>Teacher</th><th></tr></thead><tbody>`;
  for (const r of records) {
    html += `<tr>
      <td>${escapeHtml(r.studentNo)}</td>
      <td>${escapeHtml(r.studentName)}</td>
      <td>${r.gradeLevel}</td>
      <td>${escapeHtml(r.section || '-')}</td>
      <td>${escapeHtml(fmtDate(r.date))}</td>
      <td>${escapeHtml(fmtDateTime(r.recordedAt))}</td>
      <td><span class="badge ${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span></td>
      <td>${escapeHtml(r.teacherName || '-')}</td>
      <td><button class="btn btn-sm btn-secondary" data-action="history" data-id="${r.studentId}">History</button></td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  container.innerHTML = html;
  container.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => { if (btn.dataset.action === 'history') await openStudentHistory(Number(btn.dataset.id)); });
  });
}

async function openStudentHistory(studentId) {
  const res = await API.get(`/students/${studentId}`);
  const s = res.data.student;
  const history = res.data.history || [];
  let html = `<h3>${escapeHtml(s.fullName)} (${escapeHtml(s.studentNo)})</h3>`;
  if (history.length) {
    html += `<table class="data"><thead><tr><th>Date</th><th>Status</th><th>Teacher</th></tr></thead><tbody>`;
    for (const h of history) html += `<tr><td>${escapeHtml(fmtDate(h.date))}</td><td><span class="badge ${statusBadgeClass(h.status)}">${statusLabel(h.status)}</span></td><td>${escapeHtml(h.teacherName || '-')}</td></tr>`;
    html += `</tbody></table>`;
  } else html += `<p class="muted">No records found.</p>`;
  openModal(`Attendance History - ${s.fullName}`, html, `<button class="btn" id="modal-close-btn2">Close</button>`);
}

function wireAttToolbar() {
  const doSearch = async () => { await renderAttTable(); };
  document.getElementById('att-search').addEventListener('input', doSearch);
  document.getElementById('att-grade').addEventListener('change', doSearch);
  document.getElementById('att-section').addEventListener('change', doSearch);
  document.getElementById('att-status').addEventListener('change', doSearch);
  document.getElementById('att-date').addEventListener('change', doSearch);
  document.getElementById('att-reset').addEventListener('click', async () => {
    document.getElementById('att-search').value = '';
    document.getElementById('att-grade').value = '';
    document.getElementById('att-section').value = '';
    document.getElementById('att-status').value = '';
    document.getElementById('att-date').value = '';
    await renderAttTable();
  });
}

// ---------- Admin reports ----------
async function renderAdminReports() {
  App.route = 'admin-reports';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Attendance Reports</h2><p class="sub">Generate and export attendance reports</p></div></div>
    <div class="toolbar">
      <button class="btn" id="rep-daily">Daily</button>
      <button class="btn btn-secondary" id="rep-weekly">Weekly</button>
      <button class="btn btn-secondary" id="rep-monthly">Monthly</button>
      <button class="btn btn-secondary" id="rep-student">Student</button>
      <button class="btn btn-secondary" id="rep-section">Section</button>
      <button class="btn btn-secondary" id="rep-grade">Grade</button>
    </div>
    <div class="row" style="margin-bottom:16px">
      <select class="input" id="rep-student-select" style="max-width:320px"></select>
      <select class="input" id="rep-section-select" style="max-width:320px"></select>
      <select class="input" id="rep-grade-select" style="max-width:220px"></select>
    </div>
    <div id="report-result"></div>`;
  document.getElementById('rep-daily').addEventListener('click', async () => { await runDailyReport(); });
  document.getElementById('rep-weekly').addEventListener('click', async () => { await runWeeklyReport(); });
  document.getElementById('rep-monthly').addEventListener('click', async () => { await runMonthlyReport(); });
  document.getElementById('rep-student').addEventListener('click', async () => { await runStudentReport(); });
  document.getElementById('rep-section').addEventListener('click', async () => { await runSectionReport(); });
  document.getElementById('rep-grade').addEventListener('click', async () => { await runGradeReport(); });
  await populateReportSelectors();
  document.getElementById('rep-student-select').addEventListener('change', async () => { await runStudentReport(); });
  document.getElementById('rep-section-select').addEventListener('change', async () => { await runSectionReport(); });
  document.getElementById('rep-grade-select').addEventListener('change', async () => { await runGradeReport(); });
}

async function populateReportSelectors() {
  const studentsRes = await API.get('/students');
  const students = studentsRes.data.students || [];
  const sel = document.getElementById('rep-student-select');
  sel.innerHTML = `<option value="">Select student...</option>`;
  for (const s of students) { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.fullName} (${s.studentNo})`; sel.appendChild(o); }
  const secRes = await API.get('/sections');
  const sel2 = document.getElementById('rep-section-select');
  sel2.innerHTML = `<option value="">Select section...</option>`;
  for (const s of secRes.data.sections || []) { const o = document.createElement('option'); o.value = s.id; o.textContent = `Grade ${s.gradeLevel} - Section ${s.name}`; sel2.appendChild(o); }
  const sel3 = document.getElementById('rep-grade-select');
  sel3.innerHTML = `<option value="">Select grade...</option>`;
  for (let g = 7; g <= 12; g++) { const o = document.createElement('option'); o.value = g; o.textContent = `Grade ${g}`; sel3.appendChild(o); }
}

async function runDailyReport() {
  const date = document.getElementById('rep-date')?.value || todayStr();
  const res = await API.get(`/reports/daily?date=${date}`);
  const data = res.data;
  document.getElementById('report-result').innerHTML = `
    <div class="card"><div class="card-title">Daily Report - ${escapeHtml(fmtDate(date))}</div>
      <div class="report-summary">
        <div class="report-kpi"><div class="v">${data.counts.present + data.counts.late}</div><div class="l">Present/Late</div></div>
        <div class="report-kpi"><div class="v">${data.counts.absent}</div><div class="l">Absent</div></div>
        <div class="report-kpi"><div class="v">${data.counts.late}</div><div class="l">Late</div></div>
        <div class="report-kpi"><div class="v">${data.counts.excused}</div><div class="l">Excused</div></div>
      </div>
      <div class="row"><button class="btn btn-secondary btn-sm" id="rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=daily&date=${date}`); });
  document.getElementById('rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=daily&date=${date}`); });
}

async function runWeeklyReport() {
  const res = await API.get('/reports/weekly');
  const data = res.data;
  let rows = '';
  for (const d of data.days) {
    rows += `<tr><td>${escapeHtml(fmtDate(d.date))}</td><td>${d.counts.present + d.counts.late}</td><td>${d.counts.absent}</td><td>${d.counts.late}</td><td>${d.counts.excused}</td><td>${d.total}</td></tr>`;
  }
  document.getElementById('report-result').innerHTML = `
    <div class="card"><div class="card-title">Weekly Report (${escapeHtml(fmtDate(data.start))} - ${escapeHtml(fmtDate(data.end))})</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Present/Late</th><th>Absent</th><th>Late</th><th>Excused</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=weekly&end=${data.end}`); });
  document.getElementById('rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=weekly&end=${data.end}`); });
}

async function runMonthlyReport() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const res = await API.get(`/reports/monthly?year=${year}&month=${month}`);
  const data = res.data;
  let rows = '';
  for (const d of data.dailyRows) {
    rows += `<tr><td>${escapeHtml(fmtDate(d.date))}</td><td>${d.counts.present + d.counts.late}</td><td>${d.counts.absent}</td><td>${d.counts.late}</td><td>${d.counts.excused}</td><td>${d.total}</td></tr>`;
  }
  document.getElementById('report-result').innerHTML = `
    <div class="card"><div class="card-title">Monthly Report - ${year}-${String(month).padStart(2, '0')}</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Present/Late</th><th>Absent</th><th>Late</th><th>Excused</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=monthly&year=${year}&month=${month}`); });
  document.getElementById('rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=monthly&year=${year}&month=${month}`); });
}

async function runStudentReport() {
  const res = await API.get('/students');
  const students = res.data.students || [];
  const select = document.getElementById('rep-student-select');
  if (select) {
    select.innerHTML = `<option value="">Select student...</option>`;
    for (const s of students) { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.fullName} (${s.studentNo})`; select.appendChild(o); }
  }
  const studentId = document.getElementById('rep-student-select')?.value;
  if (!studentId) { document.getElementById('report-result').innerHTML = `<div class="card"><div class="empty-state">Select a student to generate the report.</div></div>`; return; }
  const data = await (await API.get(`/reports/student?studentId=${studentId}`)).data;
  document.getElementById('report-result').innerHTML = `
    <div class="card"><div class="card-title">Student Report - ${escapeHtml(data.student.fullName)} (${escapeHtml(data.student.studentNo)})</div>
      <div class="report-summary">
        <div class="report-kpi"><div class="v">${data.percentage === null ? 'N/A' : data.percentage + '%'}</div><div class="l">Attendance %</div></div>
        <div class="report-kpi"><div class="v">${data.counts.present}</div><div class="l">Present</div></div>
        <div class="report-kpi"><div class="v">${data.counts.absent}</div><div class="l">Absent</div></div>
        <div class="report-kpi"><div class="v">${data.counts.late}</div><div class="l">Late</div></div>
        <div class="report-kpi"><div class="v">${data.counts.excused}</div><div class="l">Excused</div></div>
      </div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=student&studentId=${studentId}`); });
  document.getElementById('rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=student&studentId=${studentId}`); });
}

async function runSectionReport() {
  const res = await API.get('/sections');
  const sections = res.data.sections || [];
  const select = document.getElementById('rep-section-select');
  if (select) {
    select.innerHTML = `<option value="">Select section...</option>`;
    for (const s of sections) { const o = document.createElement('option'); o.value = s.id; o.textContent = `Grade ${s.gradeLevel} - Section ${s.name}`; select.appendChild(o); }
  }
  const sectionId = document.getElementById('rep-section-select')?.value;
  if (!sectionId) { document.getElementById('report-result').innerHTML = `<div class="card"><div class="empty-state">Select a section.</div></div>`; return; }
  const data = await (await API.get(`/reports/section?sectionId=${sectionId}`)).data;
  document.getElementById('report-result').innerHTML = `
    <div class="card"><div class="card-title">Section Report - Grade ${data.section.gradeLevel} Section ${data.section.name}</div>
      <div class="report-summary">
        <div class="report-kpi"><div class="v">${data.students.length}</div><div class="l">Enrolled</div></div>
        <div class="report-kpi"><div class="v">${data.counts.present + data.counts.late}</div><div class="l">Present/Late</div></div>
        <div class="report-kpi"><div class="v">${data.counts.absent}</div><div class="l">Absent</div></div>
        <div class="report-kpi"><div class="v">${data.percentage === null ? 'N/A' : data.percentage + '%'}</div><div class="l">Attendance %</div></div>
      </div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=section&sectionId=${sectionId}`); });
  document.getElementById('rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=section&sectionId=${sectionId}`); });
}

async function runGradeReport() {
  const select = document.getElementById('rep-grade-select');
  if (select) {
    select.innerHTML = `<option value="">Select grade...</option>`;
    for (let g = 7; g <= 12; g++) { const o = document.createElement('option'); o.value = g; o.textContent = `Grade ${g}`; select.appendChild(o); }
  }
  const grade = document.getElementById('rep-grade-select')?.value;
  if (!grade) { document.getElementById('report-result').innerHTML = `<div class="card"><div class="empty-state">Select a grade level.</div></div>`; return; }
  const data = await (await API.get(`/reports/grade?gradeLevel=${grade}`)).data;
  document.getElementById('report-result').innerHTML = `
    <div class="card"><div class="card-title">Grade-Level Report - Grade ${grade}</div>
      <div class="report-summary">
        <div class="report-kpi"><div class="v">${data.totalStudents}</div><div class="l">Students</div></div>
        <div class="report-kpi"><div class="v">${data.counts.present + data.counts.late}</div><div class="l">Present/Late</div></div>
        <div class="report-kpi"><div class="v">${data.counts.absent}</div><div class="l">Absent</div></div>
        <div class="report-kpi"><div class="v">${data.percentage === null ? 'N/A' : data.percentage + '%'}</div><div class="l">Attendance %</div></div>
      </div>
      <div class="mt"><button class="btn btn-secondary btn-sm" id="rep-export-pdf">Export PDF</button><button class="btn btn-secondary btn-sm" id="rep-export-xls">Export Excel</button></div>
    </div>`;
  document.getElementById('rep-export-pdf').addEventListener('click', async () => { await exportPdf(`/api/reports/export?type=grade&gradeLevel=${grade}`); });
  document.getElementById('rep-export-xls').addEventListener('click', async () => { await exportXls(`/api/reports/export?type=grade&gradeLevel=${grade}`); });
}

// ---------- Admin notifications ----------
async function renderAdminNotifications() {
  App.route = 'admin-notifications';
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="page-head"><div><h2>Notifications</h2><p class="sub">Attendance notifications and alerts</p></div><div class="row"><button class="btn" id="notif-send">Send Notification</button><button class="btn btn-secondary" id="notif-readall">Mark All Read</button></div></div>
    <div id="notif-list-container"></div>`;
  await renderNotifList();
  document.getElementById('notif-send').addEventListener('click', async () => { await openNotifSend(); });
  document.getElementById('notif-readall').addEventListener('click', async () => { await markAllNotificationsRead(); await renderNotifList(); });
}

async function renderNotifList() {
  const container = document.getElementById('notif-list-container');
  const res = await API.get('/notifications');
  const notifications = res.data.notifications || [];
  let html = '';
  if (!notifications.length) { html = `<div class="card"><div class="empty-state">No notifications yet.</div></div>`; }
  else {
    html = `<div class="table-wrap"><table class="data"><thead><tr><th>Time</th><th>Type</th><th>Title</th><th>Message</th><th>Status</th></tr></thead><tbody>`;
    for (const n of notifications) {
      html += `<tr><td>${escapeHtml(fmtDateTime(n.createdAt))}</td><td><span class="badge badge-neutral">${escapeHtml(n.type)}</span></td><td>${escapeHtml(n.title)}</td><td>${escapeHtml(n.message)}</td><td>${n.read ? '<span class="badge badge-present">Read</span>' : '<span class="badge badge-late">Unread</span>'}</td></tr>`;
    }
    html += `</tbody></table></div>`;
  }
  container.innerHTML = html;
}

async function openNotifSend() {
  const body = `
    <div class="field"><label>Title</label><input id="notif-title" placeholder="Notification title" /></div>
    <div class="field"><label>Message</label><textarea id="notif-message" rows="3" placeholder="Notification message"></textarea></div>
    <div class="field"><label>Audience</label><select id="notif-audience"><option value="all-students">All Students</option><option value="specific">Specific Student</option></select></div>
    <div class="field hidden" id="notif-user-wrap"><label>Student</label><select id="notif-user"><option value="">Select Student</option></select></div>`;
  const actions = `<button class="btn btn-secondary" id="modal-cancel">Cancel</button><button class="btn" id="notif-save">Send</button>`;
  const modalBody = openModal('Send Notification', body, actions);
  document.getElementById('notif-save').addEventListener('click', async () => {
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-message').value.trim();
    const audience = document.getElementById('notif-audience').value;
    if (!title) { toast('Notification title is required.', 'error'); return; }
    if (!message) { toast('Notification message is required.', 'error'); return; }
    const payload = { title, message, type: 'announcement', audience };
    const userId = audience === 'specific' ? Number(document.getElementById('notif-user').value) : null;
    if (audience === 'specific' && !userId) { toast('Please select a student recipient.', 'error'); return; }
    try { await API.post('/notifications', { ...payload, userId }); closeModal(); toast('Notification sent.'); renderNotifList(); } catch (e) { toast(e.message || 'Failed.', 'error'); }
  });
}

// window bindings for router
window.renderAdminDashboard = renderAdminDashboard;
window.renderAdminStudents = renderAdminStudents;
window.renderAdminTeachers = renderAdminTeachers;
window.renderAdminSections = renderAdminSections;
window.renderAdminRecords = renderAdminRecords;
window.renderAdminReports = renderAdminReports;
window.renderAdminNotifications = renderAdminNotifications;
