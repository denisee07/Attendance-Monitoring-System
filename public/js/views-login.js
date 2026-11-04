function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearLoginError() { document.getElementById('login-error').classList.add('hidden'); }

function setLoginField(id, val) { document.getElementById(id).value = val; }

function renderLogin() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function renderRegister() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('register-view').classList.remove('hidden');
}

function isStrongPassword(pw) {
  const p = String(pw || '');
  return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
}

function passwordError() {
  return 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
}

function wireLogin() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearLoginError();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username) { showLoginError('Please enter your username or email.'); return; }
    if (!password) { showLoginError('Please enter your password.'); return; }
    if (!isStrongPassword(password)) { showLoginError(passwordError()); return; }
    try {
      const res = await API.post('/auth/login', { usernameOrEmail: username, password });
      const user = res.data.user;
      API.setToken(res.data.token, user);
      setUser(user);
      toast(`Welcome back, ${user.fullName || user.username}!`);
      navigate(defaultRouteFor(user));
    } catch (err) {
      showLoginError(err.message || 'Unable to sign in.');
    }
  });
  document.getElementById('demo-admin').addEventListener('click', () => { setLoginField('login-username', 'admin'); setLoginField('login-password', 'Admin123!'); });
  document.getElementById('demo-teacher').addEventListener('click', () => { setLoginField('login-username', 'teacher'); setLoginField('login-password', 'Teach123!'); });
  document.getElementById('demo-student').addEventListener('click', () => { setLoginField('login-username', 'student'); setLoginField('login-password', 'Student123!'); });
}

function wireRegister() {
  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const fullName = document.getElementById('reg-fullname').value.trim();
    const gradeLevel = document.getElementById('reg-grade').value;
    const section = document.getElementById('reg-section').value.trim();
    const password = document.getElementById('reg-password').value;
    const errEl = document.getElementById('login-error');
    const showRegError = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); };
    if (!username) { showRegError('Username is required.'); return; }
    if (!/^[a-z0-9_.-]{3,}$/.test(username)) { showRegError('Username must be at least 3 characters (letters, numbers, dots, dashes, underscores).'); return; }
    if (!email) { showRegError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showRegError('Please enter a valid email address.'); return; }
    if (!fullName) { showRegError('Full name is required.'); return; }
    if (!password) { showRegError('Password is required.'); return; }
    if (!isStrongPassword(password)) { showRegError(passwordError()); return; }
    const gl = gradeLevel ? Number(gradeLevel) : null;
    if (gl !== null && (gl < 7 || gl > 12)) { showRegError('Grade level must be between 7 and 12.'); return; }
    if (!section) { showRegError('Section is required.'); return; }
    try {
      const res = await API.post('/auth/register', { username, email, password, fullName, gradeLevel: gl, section });
      const user = res.data.user;
      API.setToken(res.data.token, user);
      setUser(user);
      toast('Account created successfully.');
      navigate(defaultRouteFor(user));
    } catch (err) {
      toast(err.message || 'Registration failed.', 'error');
    }
  });
}

// Called from app.js after login state settles
function wireAuthViews() {
  wireLogin();
  wireRegister();
}

// expose for app.js
window.renderLogin = renderLogin;
window.renderRegister = renderRegister;
window.wireAuthViews = wireAuthViews;
