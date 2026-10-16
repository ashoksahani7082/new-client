async function redis(command) {
  const r = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  if (!r.ok) throw new Error(`Redis HTTP ${r.status}`);
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function forwardToOwner(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !ownerChatId) throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_CHAT_ID");
  const r = await fetch("https://api.telegram.org/bot" + token + "/forwardMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ownerChatId, from_chat_id: message.chat.id, message_id: message.message_id })
  });
  const result = await r.json();
  if (!r.ok || !result.ok) throw new Error("Telegram forward failed: " + JSON.stringify(result));
  return result;
}

async function sendSubscribe(attr, eventId) {
  const { META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_API_VERSION } = process.env;
  if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN || !META_API_VERSION) throw new Error("Missing Meta CAPI environment variables");

  const user_data = {};
  if (attr.fbp) user_data.fbp = attr.fbp;
  if (attr.fbc) user_data.fbc = attr.fbc;
  if (attr.userAgent) user_data.client_user_agent = attr.userAgent;
  if (attr.ip) user_data.client_ip_address = attr.ip;

  const event = {
    event_name: "Subscribe",
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "chat",
    user_data,
    custom_data: { channel: "telegram", lead_type: "incoming_private_message" }
  };
  const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(META_CAPI_ACCESS_TOKEN)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: [event] }) });
  const result = await r.json();
  if (!r.ok || result.error) throw new Error(`Meta CAPI: ${JSON.stringify(result.error || result)}`);
  console.log("Meta CAPI Subscribe accepted", JSON.stringify({ eventId, events_received: result.events_received }));
  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers["x-telegram-bot-api-secret-token"] !== secret) return res.status(401).send("Unauthorized");

  try {
    const update = req.body || {};
    const updateId = update.update_id;
    if (Number.isInteger(updateId)) {
      const first = await redis(["SET", `tg_update_seen:${updateId}`, "1", "NX", "EX", 604800]);
      if (first !== "OK") return res.status(200).send("Duplicate update ignored");
    }

    const msg = update.message;
    const from = msg?.from;
    const chat = msg?.chat;
    if (!msg || chat?.type !== "private" || !from || from.is_bot) return res.status(200).send("Ignored");

    const text = typeof msg.text === "string" ? msg.text : "";
    if (/^\/start(?:@\w+)?(?:\s|$)/i.test(text)) {
      const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})/i);
      if (match) {
        const raw = await redis(["GET", `tg_attr:${match[1]}`]);
        if (raw) {
          const attr = typeof raw === "string" ? JSON.parse(raw) : raw;
          await redis(["SET", `tg_user:${from.id}`, JSON.stringify(attr), "EX", 2592000]);
        }
      }
      return res.status(200).send("Start processed");
    }

    // A Subscribe event is sent after the first actual non-command text message after a tracked /start.
    if (!text.trim() || text.trim().startsWith("/")) return res.status(200).send("Not a lead");
    const raw = await redis(["GET", `tg_user:${from.id}`]);
    if (!raw) return res.status(200).send("No tracked attribution");

    const attr = typeof raw === "string" ? JSON.parse(raw) : raw;
    const eventId = `tg_subscribe_${attr.token}_${from.id}`;
    const key = `tg_subscribe_sent:${attr.token}:${from.id}`;
    const claim = await redis(["SET", key, "pending", "NX", "EX", 2592000]);
    if (claim !== "OK") return res.status(200).send("Subscribe already sent");

    try {
      await forwardToOwner(msg);
      const result = await sendSubscribe(attr, eventId);
      await redis(["SET", key, "sent", "EX", 2592000]);
      return res.status(200).json({ ok: true, event_id: eventId, events_received: result.events_received });
    } catch (e) {
      await redis(["DEL", key]);
      throw e;
    }
  } catch (e) {
    console.error("telegram webhook error", e.message);
    return res.status(500).send("Webhook processing failed");
  }
}
