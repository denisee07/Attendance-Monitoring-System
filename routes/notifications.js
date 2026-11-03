const { db } = require('../db');
const { json, fail } = require('./respond');

function list(req, res) {
  const me = req.user;
  let rows;
  if (me.role === 'admin') {
    rows = db.prepare(`SELECT * FROM notifications ORDER BY id DESC LIMIT 50`).all();
  } else {
    rows = db.prepare(`SELECT * FROM notifications WHERE userId = ? ORDER BY id DESC LIMIT 50`).all(Number(me.id));
  }
  const data = rows.map((r) => ({
    id: Number(r.id),
    userId: Number(r.userId),
    type: r.type,
    title: r.title,
    message: r.message,
    read: !!r.read,
    createdAt: r.createdAt,
  }));
  const unreadCount = me.role === 'admin'
    ? db.prepare(`SELECT COUNT(*) AS c FROM notifications`).get()
    : db.prepare(`SELECT COUNT(*) AS c FROM notifications WHERE userId = ?`).get(Number(me.id));
  const unread = unreadCount ? Number(unreadCount.c) : 0;
  return json(res, 200, { success: true, data: { notifications: data, unreadCount: unread } });
}

function create(req, res) {
  const me = req.user;
  const b = req.body || {};
  const type = String(b.type || 'announcement');
  const title = String(b.title || 'Notification').trim();
  const message = String(b.message || '').trim();
  const audience = b.audience || 'all-students';
  if (!title || !message) return fail(res, 400, 'Title and message are required.');
  if (message.length > 1000) return fail(res, 400, 'Message must be at most 1000 characters.');
  if (audience !== 'all-students' && audience !== 'specific') return fail(res, 400, 'Invalid notification audience.');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let targets = [];
  if (audience === 'all-students') {
    targets = db.prepare(`SELECT * FROM users WHERE role = 'student'`).all().map((u) => Number(u.id));
  } else if (b.userId) {
    const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(Number(b.userId));
    if (!u) return fail(res, 404, 'Recipient not found.');
    targets = [Number(u.id)];
  } else {
    targets = [Number(me.id)];
  }
  const created = [];
  for (const t of targets) {
    const info = db.prepare(`INSERT INTO notifications (userId,type,title,message,read,createdAt) VALUES (?,?,?,?,0,?)`).run(t, type, title, message, now);
    created.push(Number(info.lastInsertRowid));
  }
  return json(res, 200, { success: true, data: { ok: true, created: created.length } });
}

function markRead(req, res) {
  const id = Number(req.params.id);
  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(id);
  const updated = db.prepare(`SELECT * FROM notifications WHERE id = ?`).get(id);
  return json(res, 200, { success: true, data: { notification: updated } });
}

function markAllRead(req, res) {
  const me = req.user;
  const where = me.role === 'admin' ? '' : 'WHERE userId = ?';
  const params = me.role === 'admin' ? [] : [Number(me.id)];
  db.prepare(`UPDATE notifications SET read = 1 ${where}`).run(...params);
  return json(res, 200, { success: true, data: { ok: true } });
}

module.exports = { list, create, markRead, markAllRead };
