// シフトデータの保存・読み込みAPI(Upstash Redisに保存します)
// 環境変数の名前が KV_ / UPSTASH_ / STORAGE_ など何で始まっていても見つけます
function pickEnv(re) {
  const name = Object.keys(process.env).find(
    (k) => re.test(k) && !/READ_ONLY/.test(k) && process.env[k]
  );
  return name ? process.env[name] : undefined;
}
const REDIS_URL = pickEnv(/(REST_API_URL|REST_URL)$/);
const REDIS_TOKEN = pickEnv(/(REST_API_TOKEN|REST_TOKEN)$/);

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const missing = [];
  if (!REDIS_URL || !REDIS_TOKEN) missing.push('データベース(Upstash Redis)の接続');
  if (missing.length) {
    return res.status(500).json({ error: 'env', missing });
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
