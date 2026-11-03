// MY MARINE - MSIL Tide Prediction API v3 (Vercel Serverless Function)
const BASE = 'https://api.msil.go.jp/tide-prediction/v3';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.MSIL_API_KEY;
  if (!key) return res.status(503).json({ error: 'MSIL_API_KEY is not configured' });

  const action = String(req.query.action || 'data');
  if (!['data', 'stations'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  const stationCode = String(req.query.stationCode || '');
  const date = String(req.query.date || '');
  if (action === 'data' && (!/^\d{4,8}$/.test(stationCode) || !/^\d{8}$/.test(date))) {
    return res.status(400).json({ error: 'Use ?stationCode=XXXX&date=YYYYMMDD' });
  }
  if (action === 'data') {
    const y = Number(date.slice(0, 4)), m = Number(date.slice(4, 6)), d = Number(date.slice(6, 8));
    const valid = y >= 1 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31 &&
      new Date(Date.UTC(y < 100 ? y + 400 : y, m - 1, d)).getUTCMonth() === m - 1;
    if (!valid) return res.status(400).json({ error: 'Invalid date' });
  }

  const path = action === 'stations' ? '/station' : `/data?stationCode=${encodeURIComponent(stationCode)}&date=${date}`;
  try {
    const upstream = await fetch(BASE + path, {
      headers: { 'Ocp-Apim-Subscription-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'MSIL API request failed', status: upstream.status,
        hint: upstream.status === 401 ? 'Check API key and permissions' : upstream.status === 429 ? 'API rate limit reached' : 'Check parameters or retry later'
      });
    }
    const json = await upstream.json();
    if (action === 'stations') return res.status(200).json(json);
    if (!Array.isArray(json.tide) || !json.time || !Number.isFinite(Number(json.interval)) || Number(json.interval) <= 0) {
      return res.status(502).json({ error: 'Unexpected MSIL response format' });
    }
    // The API returns a start timestamp and a sample interval in seconds.
    const start = Date.parse(json.time);
    if (!Number.isFinite(start)) return res.status(502).json({ error: 'Invalid upstream timestamp' });
    const intervalSeconds = Number(json.interval);
    const hourly = json.tide.map((value, i) => ({
      time: new Date(start + i * intervalSeconds * 1000).toISOString(),
      height: value
    })).filter((_, i) => (i * intervalSeconds) % 3600 === 0);
    return res.status(200).json({ source: 'Japan Coast Guard MSIL tide-prediction v3', stationCode: json.stationCode, date,
      startTime: json.time, intervalSeconds, heightUnit: 'API native unit (verify datum and unit before labeling)',
      hourly, rawCount: json.tide.length });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach MSIL API' });
  }
}
