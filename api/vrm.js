
const API = 'https://vrmapi.victronenergy.com/v2/installations/';

const rules = [
  ['soc', [/battery.*(state of charge|soc)/i, /^soc$/i]],
  ['batteryVoltage', [/battery.*voltage/i]],
  ['batteryCurrent', [/battery.*current/i]],
  ['batteryPower', [/battery.*power/i, /^dc power$/i]],
  ['solarPower', [/^(pv charger|solar charger).*power$/i, /^solar power$/i, /^pv power$/i]],
  ['acInputPower', [/^ac input.*power$/i, /^grid.*power$/i]]
];

function numeric(r) {
  const x = r.rawValue ?? r.formattedValue;
  if (typeof x === 'number') {
    return Number.isFinite(x) ? x : null;
  }
  if (typeof x === 'string') {
    const match = x.trim().match(/^([-+]?\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  }
  return null;
}

function summarize(records) {
  const values = {};
  const latest = {};

  for (const r of records) {
    const name = String(r.description || '');
    const value = numeric(r);
    if (value === null) continue;

    for (const [key, patterns] of rules) {
      if (!patterns.some(p => p.test(name))) continue;

      const ts = Number(r.timestamp) || 0;
      if (latest[key] === undefined || ts > latest[key]) {
        values[key] = value;
        latest[key] = ts;
      }
    }
  }

  // Prevent displaying an unverified SOC or battery voltage.
  delete values.soc;
  delete values.batteryVoltage;
  delete values.batteryCurrent;

  return values;
}

function diagnosticSummary(records) {
  return records
    .filter(r => {
      const name = String(r.description || '');
      const device = String(r.Device || '');
      const service = String(r.dbusServiceType || '');

      return /battery|soc|state of charge|shunt/i.test(
        [name, device, service].join(' ')
      );
    })
    .map(r => ({
      Device: String(r.Device ?? '').slice(0, 80),
      instance: r.instance ?? null,
      code: String(r.code ?? '').slice(0, 40),
      description: String(r.description ?? '').slice(0, 100),
      dbusServiceType: String(r.dbusServiceType ?? '').slice(0, 60),
      dbusPath: String(r.dbusPath ?? '').slice(0, 100),
      value: numeric(r),
      timestamp: r.timestamp ?? null
    }))
    .slice(0, 150);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const token = process.env.VRM_ACCESS_TOKEN;
  const id = process.env.VRM_INSTALLATION_ID;

  if (!token || !id) {
    return res.status(503).json({
      error: 'VRM configuration incomplete'
    });
  }

  try {
    const response = await fetch(
      `${API}${encodeURIComponent(id)}/diagnostics?count=1000`,
      {
        headers: {
          'x-authorization': `Token ${token}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(12000)
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: 'VRM upstream error',
        status: response.status
      });
    }

    const json = await response.json();
    const records = Array.isArray(json.records)
      ? json.records
      : [];

    // Diagnostic information stays in server logs.
    // Enable temporarily in Vercel with VRM_DEBUG=true.
    if (process.env.VRM_DEBUG === 'true') {
      console.log(
        'MY_MARINE_BATTERY_DIAGNOSTICS',
        JSON.stringify(diagnosticSummary(records))
      );
    }

    return res.status(200).json({
      source: 'Victron VRM',
      vessel: 'CANTILLN',
      fetchedAt: new Date().toISOString(),
      values: summarize(records),
      note: 'Battery values are hidden until their source is verified.'
    });

  } catch (e) {
    return res.status(502).json({
      error: 'VRM connection failed'
    });
  }
}
