const API = {
  token: localStorage.getItem('sv_token'),
  user: null,

  async request(method, path, body) {
    const headers = { 'x-auth-token': this.token };
    let payload = null;
    if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${this.base}${path}`, { method, headers, body: payload });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      throw new Error((data && data.error) ? data.error : `Request failed with status ${res.status}`);
    }
    return data;
  },

  async get(path) { return this.request('GET', path); },
  async post(path, body) { return this.request('POST', path, body); },
  async put(path, body) { return this.request('PUT', path, body); },
  async del(path) { return this.request('DELETE', path); },

  async download(path) {
    const headers = { 'x-auth-token': this.token };
    const res = await fetch(`${this.base}${path}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      let msg = `Export failed (${res.status})`;
      try { const j = JSON.parse(text); if (j && j.error) msg = j.error; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    a.download = match && match[1] ? match[1] : 'report';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    const text = await blob.text();
    let jsonData = null;
    try { jsonData = JSON.parse(text); } catch (e) { jsonData = null; }
    return jsonData;
  },

  setToken(token, user) {
    this.token = token;
    this.user = user;
    if (token) localStorage.setItem('sv_token', token); else localStorage.removeItem('sv_token');
  },

  clear() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('sv_token');
  },
};

const API_BASE = '/api';
API.base = API_BASE;
