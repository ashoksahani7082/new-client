export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  // Trim accidental whitespace from Vercel's saved value and URL query.
  const configuredKey = (process.env.WEBHOOK_SETUP_SECRET || "").trim();
  const suppliedKey = typeof req.query.key === "string" ? req.query.key.trim() : "";
  if (!configuredKey) {
    console.error("WEBHOOK_SETUP_SECRET is not configured");
    return res.status(500).send("WEBHOOK_SETUP_SECRET is not configured for this deployment");
  }
  if (!suppliedKey || suppliedKey !== configuredKey) {
    return res.status(401).json({ error: "Setup key mismatch", configuredLength: configuredKey.length, suppliedLength: suppliedKey.length, hint: "Compare the saved Production value with the key in the URL. No secret value is returned." });
  }

  // APP_BASE_URL is preferred; fall back to Vercel's production domain when available.
  const vercelDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  const configuredBase = process.env.APP_BASE_URL || (vercelDomain ? `https://${vercelDomain}` : "");
  const base = configuredBase.replace(/\/+$/, "");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!/^https:\/\//i.test(base) || !token || !secret) {
    console.error("Webhook setup configuration missing", JSON.stringify({
      hasBase: Boolean(base),
      hasBotToken: Boolean(token),
      hasTelegramSecret: Boolean(secret)
    }));
    return res.status(500).send("Missing APP_BASE_URL or Telegram bot/webhook configuration");
  }

  try {
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
      console.error("setWebhook failed", JSON.stringify({ description: data.description, error_code: data.error_code }));
      return res.status(502).json({ ok: false, description: data.description || "Telegram webhook setup failed" });
    }
    console.log("Telegram webhook configured", `${base}/api/telegram`);
    return res.status(200).json({ ok: true, description: "Telegram webhook configured", webhook: `${base}/api/telegram` });
  } catch (error) {
    console.error("Webhook setup request failed", error.message);
    return res.status(502).send("Could not contact Telegram. Check Vercel function logs.");
  }
}
