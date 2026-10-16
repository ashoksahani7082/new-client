import { randomBytes } from "node:crypto";

async function redis(command) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN || !process.env.TELEGRAM_BOT_USERNAME) {
    return res.status(500).json({ error: "Server configuration incomplete" });
  }

  try {
    const b = req.body || {};
    const token = randomBytes(18).toString("hex");
    const fbclid = typeof b.fbclid === "string" ? b.fbclid.slice(0, 1000) : null;
    const attr = {
      token,
      fbp: typeof b.fbp === "string" ? b.fbp.slice(0, 500) : null,
      fbc: typeof b.fbc === "string" ? b.fbc.slice(0, 1000) :
        (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null),
      pageUrl: typeof b.pageUrl === "string" ? b.pageUrl.slice(0, 2000) : null,
      userAgent: typeof b.userAgent === "string" ? b.userAgent.slice(0, 1000) : null,
      ip: (req.headers["x-forwarded-for"] || "").split(",")[0].trim().slice(0, 100) || null,
      utm_source: b.utm_source || null,
      utm_campaign: b.utm_campaign || null,
      utm_medium: b.utm_medium || null,
      utm_content: b.utm_content || null,
      utm_term: b.utm_term || null,
      createdAt: Date.now()
    };
    for (const key of ["utm_source","utm_campaign","utm_medium","utm_content","utm_term"]) {
      if (typeof attr[key] !== "string") attr[key] = null;
      else attr[key] = attr[key].slice(0, 300);
    }

    await redis(["SET", `tg_attr:${token}`, JSON.stringify(attr), "EX", 2592000]);
    const username = process.env.TELEGRAM_BOT_USERNAME.replace(/^@/, "");
    return res.status(200).json({ url: `https://t.me/${username}?start=${token}` });
  } catch (e) {
    console.error("telegram-link error", e.message);
    return res.status(500).json({ error: "Could not create Telegram link" });
  }
}
