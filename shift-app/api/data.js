// シフトデータの保存・読み込みAPI(Upstash Redisに保存します)
const crypto = require('crypto');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const APP_PASSWORD = process.env.APP_PASSWORD;

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REDIS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const json = await r.json();
  return json.result;
}

function samePassword(sent) {
  let decoded = '';
  try {
    decoded = decodeURIComponent(String(sent || ''));
  } catch (e) {
    return false;
  }
  const a = Buffer.from(decoded);
  const b = Buffer.from(String(APP_PASSWORD));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (!REDIS_URL || !REDIS_TOKEN || !APP_PASSWORD) {
    return res.status(500).json({ error: 'env' });
  }
  if (!samePassword(req.headers['x-app-password'])) {
    return res.status(401).json({ error: 'auth' });
  }

  const key = String((req.query && req.query.key) || '');
  const okKey = key === 'staff' || /^month:\d{4}-\d{2}$/.test(key);
  if (!okKey) return res.status(400).json({ error: 'key' });

  const redisKey = 'shift:' + key;

  try {
    if (req.method === 'GET') {
      const v = await redis(['GET', redisKey]);
      return res.status(200).json({ value: v ? JSON.parse(v) : null });
    }
    if (req.method === 'PUT') {
      const value = req.body && req.body.value;
      if (!value || typeof value !== 'object') {
        return res.status(400).json({ error: 'body' });
      }
      const text = JSON.stringify(value);
      if (text.length > 300000) return res.status(413).json({ error: 'size' });
      await redis(['SET', redisKey, text]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method' });
  } catch (e) {
    return res.status(500).json({ error: 'server' });
  }
};
