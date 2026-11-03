
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.VRM_ACCESS_TOKEN;
  const id = process.env.VRM_INSTALLATION_ID;
  const password = process.env.MY_MARINE_VIEW_PASSWORD;

  if (!token || !id)
    return res.status(503).json({ error: "Server configuration incomplete" });
  }


  try {
    const response = await fetch(
      `https://vrmapi.victronenergy.com/v2/installations/${encodeURIComponent(id)}/diagnostics?count=1000`,
      {
        headers: {
          "x-authorization": `Token ${token}`,
          Accept: "application/json"
        },
        signal: AbortSignal.timeout(12000)
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: "VRM upstream request failed",
        status: response.status
      });
    }

    const data = await response.json();

    return res.status(200).json({
      source: "Victron VRM",
      installation: "CANTILLN",
      fetchedAt: new Date().toISOString(),
      records: data.records ?? []
    });
  } catch (error) {
    return res.status(502).json({
      error: "VRM connection failed"
    });
  }
}

