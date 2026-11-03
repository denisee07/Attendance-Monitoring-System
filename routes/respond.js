function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function fail(res, status, message) {
  return json(res, status, { success: false, error: message });
}

module.exports = { json, fail };
