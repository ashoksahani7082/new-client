export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  if (!process.env.WEBHOOK_SETUP_SECRET || req.query.key !== process.env.WEBHOOK_SETUP_SECRET) {
    return res.status(401).send("Unauthorized");
  }
  const base = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!/^https:\/\//i.test(base) || !token || !secret) return res.status(500).send("Missing configuration");

  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${base}/api/telegram`,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: false
    })
  });
  const data = await r.json();
  if (!r.ok || !data.ok) {
    console.error("setWebhook failed", data);
    return res.status(502).json({ ok: false, description: data.description || "Telegram webhook setup failed" });
  }
  return res.status(200).json({ ok: true, description: "Telegram webhook configured" });
}
