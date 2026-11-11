// PayPal Orders API (server side). Uses the free PayPal sandbox by default.
// The browser only ever sees the order id; the secret never leaves the server.

const BASE =
  process.env.PAYPAL_API_URL ||
  (process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

function isConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

let cached = { token: null, expiresAt: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60000) return cached.token;
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("PayPal auth error:", JSON.stringify(data));
    throw new Error("Could not connect to PayPal. Check your PayPal client ID and secret.");
  }
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function paypalFetch(path, body, requestId) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("PayPal API error:", JSON.stringify(data));
    const err = new Error(data.message || "PayPal could not process this payment.");
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function createOrder({ usdAmount, description, offerId }) {
  return paypalFetch("/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: offerId,
        description: description.slice(0, 120),
        amount: { currency_code: "USD", value: usdAmount.toFixed(2) },
      },
    ],
    application_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
  });
}

async function captureOrder(orderId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, null, `capture-${orderId}`);
}

module.exports = { isConfigured, createOrder, captureOrder };
