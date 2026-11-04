// Global app shell: auth state, router, sidebar, topbar, toasts, helpers.

const App = {
  user: null,
  route: 'login',
};

function Toast(msg, type) {
  const t = document.createElement('div');
  t.className = `toast ${type || 'success'}`;
  const kind = type === 'error' ? 'Error' : 'Success';
  t.innerHTML = `<div class="toast-title">${kind}</div><div class="toast-msg">${escapeHtml(msg)}</div>`;
  document.getElementById('toast-root').appendChild(t);
  setTimeout(() => { t.classList.add('hidden'); setTimeout(() => t.remove(), 300); }, 4500);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, type) { Toast(msg, type); }

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).length > 10 ? 'Z' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusLabel(status) {
  const map = { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' };
  return map[status] || status;
}

function statusBadgeClass(status) {
  if (status === 'present') return 'badge-present';
  if (status === 'absent') return 'badge-absent';
  if (status === 'late') return 'badge-late';
  if (status === 'excused') return 'badge-excused';
  return 'badge-neutral';
}

function pct(value) {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  return `${Math.round(value * 100) / 100}%`;
}

function pctNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

function navigate(path) {
  const target = `/${path}`;
  if (location.hash === `#${target}`) { renderRoute(); }
  else { location.hash = target; }
}

function currentRoute() {
  const raw = (location.hash || '').split('?')[0];
  return raw.replace(/^#\/?/, '') || 'admin-dashboard';
}

function setUser(user) {
  App.user = user;
  API.user = user;
}

async function logout() {
  try { await API.post('/auth/logout'); } catch (e) { /* ignore */ }
  API.clear();
  App.user = null;
  API.user = null;
  navigate('login');
}

function defaultRouteFor(user) {
  if (user && user.role === 'admin') return 'admin-dashboard';
  if (user && user.role === 'teacher') return 'teacher-attendance';
  return 'student-portal';
}

// ---------- Router ----------
const ROUTES = {
  'login': { view: 'login', roles: null },
  'register': { view: 'register', roles: null },
  'admin-dashboard': { view: 'admin-dashboard', roles: ['admin'] },
  'admin-students': { view: 'admin-students', roles: ['admin'] },
  'admin-teachers': { view: 'admin-teachers', roles: ['admin'] },
  'admin-sections': { view: 'admin-sections', roles: ['admin'] },
  'admin-records': { view: 'admin-records', roles: ['admin'] },
  'admin-reports': { view: 'admin-reports', roles: ['admin'] },
  'admin-notifications': { view: 'admin-notifications', roles: ['admin'] },
  'teacher-attendance': { view: 'teacher-attendance', roles: ['teacher'] },
  'teacher-records': { view: 'teacher-records', roles: ['teacher'] },
  'teacher-reports': { view: 'teacher-reports', roles: ['teacher'] },
  'teacher-notifications': { view: 'teacher-notifications', roles: ['teacher'] },
  'student-portal': { view: 'student-portal', roles: ['student'] },
  'student-records': { view: 'student-records', roles: ['student'] },
  'student-reports': { view: 'student-reports', roles: ['student'] },
  'student-notifications': { view: 'student-notifications', roles: ['student'] },
};

function resolveRoute() {
  const key = currentRoute();
  if (!ROUTES[key]) {
    if (App.user) return defaultRouteFor(App.user);
    return 'login';
  }
  const def = ROUTES[key];
  if (App.user) {
    const allowed = def.roles ? def.roles.includes(App.user.role) : true;
    if (!allowed) { navigate(defaultRouteFor(App.user)); return null; }
  }
  return key;
}

function renderRoute() {
  const key = resolveRoute();
  if (!key) return;
  App.route = key;
  renderTopbar();
  const def = ROUTES[key];
  if (App.user) {
    if (key === 'login' || key === 'register') { navigate(defaultRouteFor(App.user)); return; }
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
  } else {
    if (key !== 'login' && key !== 'register') { navigate('login'); return; }
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  }
  switch (key) {
    case 'login': renderLogin(); break;
    case 'register': renderRegister(); break;
    case 'admin-dashboard': renderAdminDashboard(); break;
    case 'admin-students': renderAdminStudents(); break;
    case 'admin-teachers': renderAdminTeachers(); break;
    case 'admin-sections': renderAdminSections(); break;
    case 'admin-records': renderAdminRecords(); break;
    case 'admin-reports': renderAdminReports(); break;
    case 'admin-notifications': renderAdminNotifications(); break;
    case 'teacher-attendance': renderTeacherAttendance(); break;
    case 'teacher-records': renderTeacherRecords(); break;
    case 'teacher-reports': renderTeacherReports(); break;
    case 'teacher-notifications': renderTeacherNotifications(); break;
    case 'student-portal': renderStudentPortal(); break;
    case 'student-records': renderStudentRecords(); break;
    case 'student-reports': renderStudentReports(); break;
    case 'student-notifications': renderStudentNotifications(); break;
  }
}

// ---------- Sidebar ----------
function buildSidebar() {
  const navEl = document.getElementById('side-nav');
  navEl.innerHTML = '';
  const user = App.user;
  let links = [];
  if (user.role === 'admin') {
    links = [
      { key: 'admin-dashboard', label: 'Dashboard', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
      { key: 'admin-students', label: 'Students', icon: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
      { key: 'admin-teachers', label: 'Teachers', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
      { key: 'admin-sections', label: 'Sections', icon: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5l2-3h9l2 3h5a2 2 0 0 1 2 2z' },
      { key: 'admin-records', label: 'Attendance Records', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
      { key: 'admin-reports', label: 'Reports', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
      { key: 'admin-notifications', label: 'Notifications', icon: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
    ];
  } else if (user.role === 'teacher') {
    links = [
      { key: 'teacher-attendance', label: 'Take Attendance', icon: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' },
      { key: 'teacher-records', label: 'Attendance Records', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
      { key: 'teacher-reports', label: 'Reports', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
      { key: 'teacher-notifications', label: 'Notifications', icon: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
    ];
  } else {
    links = [
      { key: 'student-portal', label: 'My Attendance', icon: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' },
      { key: 'student-records', label: 'Attendance History', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
      { key: 'student-reports', label: 'My Report', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
      { key: 'student-notifications', label: 'Notifications', icon: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0' },
    ];
  }
  for (const l of links) {
    const a = document.createElement('button');
    a.className = `nav-item ${App.route === l.key ? 'active' : ''}`;
    a.dataset.route = l.key;
    a.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${l.icon}"></path></svg><span>${l.label}</span>`;
    a.addEventListener('click', () => navigate(l.key));
    navEl.appendChild(a);
  }
  const userEl = document.getElementById('side-user');
  userEl.innerHTML = `<b>${escapeHtml(user.fullName || user.username)}</b><span>${escapeHtml(user.role)}</span>`;
}

function topbarTitleFor(key) {
  const map = {
    'admin-dashboard': 'Administrator Dashboard',
    'admin-students': 'Student Management',
    'admin-teachers': 'Teacher Management',
    'admin-sections': 'Section Management',
    'admin-records': 'Attendance Records',
    'admin-reports': 'Attendance Reports',
    'admin-notifications': 'Notifications',
    'teacher-attendance': 'Take Attendance',
    'teacher-records': 'Attendance Records',
    'teacher-reports': 'Attendance Reports',
    'teacher-notifications': 'Notifications',
    'student-portal': 'My Attendance',
    'student-records': 'Attendance History',
    'student-reports': 'My Attendance Report',
    'student-notifications': 'Notifications',
  };
  return map[key] || 'Dashboard';
}

function renderTopbar() {
  document.getElementById('topbar-title').textContent = topbarTitleFor(App.route);
}

// ---------- Bell / notifications ----------
async function refreshBell() {
  try {
    const res = await API.get('/notifications');
    const badge = document.getElementById('bell-badge');
    const listEl = document.getElementById('bell-list');
    const unread = res.data && res.data.unreadCount ? res.data.unreadCount : 0;
    if (unread > 0) { badge.textContent = unread; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); badge.textContent = '0'; }
    listEl.innerHTML = '';
    const items = (res.data && res.data.notifications) || [];
    if (!items.length) { listEl.innerHTML = '<div class="empty-state">No notifications</div>'; return; }
    for (const n of items.slice(0, 8)) {
      const div = document.createElement('div');
      div.className = `bell-item ${n.read ? '' : 'unread'}`;
      div.innerHTML = `<div class="bell-item-title">${escapeHtml(n.title)}</div><div class="bell-item-msg">${escapeHtml(n.message)}</div><div class="bell-item-time">${escapeHtml(fmtDateTime(n.createdAt))}</div>`;
      div.addEventListener('click', () => markNotificationRead(n.id));
      listEl.appendChild(div);
    }
  } catch (e) { /* ignore */ }
}

async function markNotificationRead(id) {
  try { await API.post(`/notifications/read/${id}`); } catch (e) { /* ignore */ }
  await refreshBell();
}

async function markAllNotificationsRead() {
  try { await API.post('/notifications/read-all'); } catch (e) { /* ignore */ }
  await refreshBell();
}

function wireBell() {
  const btn = document.getElementById('bell-btn');
  const dd = document.getElementById('bell-dropdown');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    dd.classList.toggle('hidden');
    await refreshBell();
  });
  document.getElementById('bell-viewall').addEventListener('click', () => { dd.classList.add('hidden'); navigate('notifications'); });
  document.addEventListener('click', (ev) => {
    const dd2 = document.getElementById('bell-dropdown');
    const btn2 = document.getElementById('bell-btn');
    if (dd2 && !dd2.contains(ev.target) && ev.target !== btn2) dd2.classList.add('hidden');
  });
}

// ---------- Auth bootstrap ----------
async function initApp() {
  const token = API.token;
  if (!token) { navigate('login'); return; }
  try {
    const res = await API.get('/auth/me');
    const user = res.data && res.data.user;
    if (!user) { API.clear(); navigate('login'); return; }
    setUser(user);
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    buildSidebar();
    wireBell();
    await refreshBell();
    renderRoute();
  } catch (e) {
    API.clear();
    navigate('login');
  }
}

function startApp() {
  if (API.token) { initApp(); }
  else { navigate('login'); }
}

document.addEventListener('DOMContentLoaded', async () => {
  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) menuBtn.addEventListener('click', () => { document.getElementById('sidebar').classList.toggle('open'); });
  const logoutBtn = document.getElementById('side-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => { await logout(); });
  window.addEventListener('hashchange', () => { document.getElementById('sidebar').classList.remove('open'); });
  window.addEventListener('hashchange', renderRoute);
  if (window.wireAuthViews) { window.wireAuthViews(); }
  await startApp();
});
