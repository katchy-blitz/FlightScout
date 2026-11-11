// Sends the sign-up verification code by email, using a free email service's web API
// (no extra packages). Render's free plan blocks normal SMTP, so an API is used instead.
//
//   Brevo  (free, 300 emails a day): BREVO_API_KEY      + MAIL_FROM (a sender you verified in Brevo)
//   Resend (free, 100 a day):        RESEND_API_KEY     + MAIL_FROM (an address on a domain you verified)
//
//   Gmail via Google Apps Script (free, no new account): GAS_MAIL_URL + GAS_MAIL_SECRET (see GMAIL-SETUP.md)
//
// MAIL_FROM_NAME is the name people see (default "FlightScout").

const gasOn = () => Boolean(process.env.GAS_MAIL_URL && process.env.GAS_MAIL_SECRET);
const configured = () => gasOn() || Boolean(process.env.MAIL_FROM && (process.env.BREVO_API_KEY || process.env.RESEND_API_KEY));

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function post(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Email service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }
}

// Sends one email through whichever service is set up. Throws if the service refuses.
async function deliver({ to, name, subject, text, html }) {
  const fromName = process.env.MAIL_FROM_NAME || "FlightScout";
  if (gasOn()) {
    // Google Apps Script answers with a redirect, which fetch follows; the answer is {"ok":true}.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(process.env.GAS_MAIL_URL, {
        method: "POST", redirect: "follow", signal: controller.signal,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: process.env.GAS_MAIL_SECRET, to, name: fromName, subject, text, html }),
      });
      const answer = await res.text();
      if (!res.ok || !/"ok"\s*:\s*true/.test(answer)) throw new Error(`Gmail relay answered ${res.status}: ${answer.slice(0, 200)}`);
    } finally {
      clearTimeout(timer);
    }
  } else if (process.env.BREVO_API_KEY) {
    await post(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", { "api-key": process.env.BREVO_API_KEY }, {
      sender: { name: fromName, email: process.env.MAIL_FROM }, to: [{ email: to, name }], subject, textContent: text, htmlContent: html,
    });
  } else {
    await post(process.env.RESEND_API_URL || "https://api.resend.com/emails", { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, {
      from: `${fromName} <${process.env.MAIL_FROM}>`, to: [to], subject, text, html,
    });
  }
}

// Returns { sent: true } or { sent: false, configured, error }.
async function sendVerificationCode({ to, name, code }) {
  if (!configured()) {
    console.log(`[mail not set up] Verification code for ${to}: ${code}`);
    return { sent: false, configured: false };
  }
  const subject = `${code} is your FlightScout verification code`;
  const text = `Hi ${name},\n\nYour FlightScout verification code is ${code}. It works for 15 minutes.\n\nIf you didn't sign up, you can ignore this email.`;
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Your FlightScout verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It works for 15 minutes. If you didn't sign up, you can ignore this email.</p>`;
  try {
    await deliver({ to, name, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error("Could not send the verification email:", err.message);
    console.log(`[email failed] Verification code for ${to}: ${code}`);
    return { sent: false, configured: true, error: err.message };
  }
}

// A receipt or any other message. Same answer shape as above.
async function sendMessage({ to, name, subject, text, html }) {
  if (!configured()) return { sent: false, configured: false };
  try {
    await deliver({ to, name, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error("Could not send the email:", err.message);
    return { sent: false, configured: true, error: err.message };
  }
}

module.exports = { sendVerificationCode, sendMessage, configured };
