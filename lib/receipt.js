// The ticket page (printable, "Save as PDF") and the receipt email, built from a saved booking.
const { checkinInfo } = require("./extras");
const { NAMES } = require("./network");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const naira = (n) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function day(local) {
  const d = new Date(`${String(local).slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const time = (local) => String(local).slice(11, 16);
const place = (code) => `${NAMES[code] || code} (${code})`;

function seatsFor(booking, flightIndex) {
  const s = (booking.seats || {})[flightIndex] || {};
  return booking.passengers.map((p, i) => ({ name: p, seat: s[i] || "" }));
}

function extrasLine(booking) {
  const x = booking.extras || {};
  const bits = [];
  if (x.bags) bits.push(`${x.bags} extra bag${x.bags > 1 ? "s" : ""} per passenger, per flight`);
  (x.assistance || []).forEach((a) => bits.push(a));
  if (x.note) bits.push(`Note: ${x.note}`);
  return bits;
}

function plainReceipt(booking) {
  const lines = [`FlightScout booking ${booking.reference}`, "(Beta: sample fares and PayPal sandbox payment. This is not a real airline ticket.)", ""];
  booking.flights.forEach((f, i) => {
    lines.push(`${f.airline} ${f.flightNumber || ""}: ${place(f.origin)} to ${place(f.destination)}`);
    lines.push(`${day(f.departure)}, departs ${time(f.departure)}, arrives ${time(f.arrival)}`);
    const c = checkinInfo(f);
    lines.push(`Be at the airport by ${c.arriveBy}. Check-in desks usually close about ${c.counterCloses}.`);
    const seats = seatsFor(booking, i).filter((s) => s.seat);
    if (seats.length) lines.push(`Seats: ${seats.map((s) => `${s.name} ${s.seat}`).join(", ")}`);
    lines.push("");
  });
  lines.push(`Passengers: ${booking.passengers.join(", ")}`);
  const ex = extrasLine(booking);
  if (ex.length) lines.push(`Extras: ${ex.join("; ")}`);
  lines.push(`Paid: US$${booking.paid.usd.toFixed(2)} (about ${naira(booking.paid.ngn)}) via PayPal. Transaction ${booking.paid.paypalCaptureId}`);
  return lines.join("\n");
}

function flightBlock(booking, f, i) {
  const c = checkinInfo(f);
  const seats = seatsFor(booking, i).filter((s) => s.seat);
  return `<section class="leg">
    <div class="route"><span>${esc(f.origin)}</span><i>✈</i><span>${esc(f.destination)}</span></div>
    <p class="airline">${esc(f.airline)} ${esc(f.flightNumber || "")} · ${esc((f.cabin || "economy").replace("_", " "))}</p>
    <p class="when"><b>${esc(day(f.departure))}</b> · departs <b>${esc(time(f.departure))}</b> · arrives ${esc(time(f.arrival))}</p>
    <p class="small">${esc(place(f.origin))} to ${esc(place(f.destination))}</p>
    <p class="tip">Be at the airport by <b>${esc(c.arriveBy)}</b> · check-in desk closes about <b>${esc(c.counterCloses)}</b></p>
    ${seats.length ? `<p class="small">Seats: ${seats.map((s) => `${esc(s.name)} <b>${esc(s.seat)}</b>`).join(" · ")}</p>` : ""}
  </section>`;
}

function ticketPage(booking) {
  const ex = extrasLine(booking);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket ${esc(booking.reference)} | FlightScout</title>
<style>
  body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#eef1f8;color:#14213d;margin:0;padding:24px}
  .ticket{max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 30px rgba(20,33,61,.12)}
  .top{background:#2459e0;color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center}
  .top b{font-size:20px} .ref{font-size:22px;letter-spacing:2px;font-weight:700}
  .body{padding:8px 24px 20px}
  .leg{padding:16px 0;border-bottom:1px dashed #c9d2e3}
  .route{display:flex;gap:14px;align-items:center;font-size:34px;font-weight:800} .route i{font-style:normal;font-size:22px;color:#2459e0}
  .airline{margin:4px 0;color:#4a5876} .when{margin:6px 0} .small{color:#6b778c;font-size:13px;margin:4px 0}
  .tip{background:#eaf0ff;border-radius:8px;padding:8px 12px;margin:10px 0 0;font-size:14px}
  .meta{padding:14px 0;font-size:14px;line-height:1.6}
  .beta{background:#fff1cc;color:#7a5a00;padding:10px 24px;font-size:13px}
  .bars{height:46px;margin:6px 0;background:repeating-linear-gradient(90deg,#14213d 0 2px,#fff 2px 5px,#14213d 5px 6px,#fff 6px 10px,#14213d 10px 13px,#fff 13px 16px)}
  button{font:inherit;background:#2459e0;color:#fff;border:0;border-radius:10px;padding:10px 18px;cursor:pointer;margin:18px auto 0;display:block}
  @media print{body{background:#fff;padding:0}.ticket{box-shadow:none}button{display:none}}
</style></head><body>
<div class="ticket">
  <div class="top"><b>FlightScout</b><span class="ref">${esc(booking.reference)}</span></div>
  <div class="beta">Beta ticket: sample fares and a PayPal sandbox payment. This is not a real airline ticket and cannot be used to travel.</div>
  <div class="body">
    ${booking.flights.map((f, i) => flightBlock(booking, f, i)).join("")}
    <div class="meta">
      <div><b>Passengers:</b> ${booking.passengers.map(esc).join(", ")}</div>
      ${ex.length ? `<div><b>Extras:</b> ${ex.map(esc).join("; ")}</div>` : ""}
      <div><b>Paid:</b> US$${booking.paid.usd.toFixed(2)} (about ${esc(naira(booking.paid.ngn))}) via PayPal</div>
      <div class="small">PayPal transaction ${esc(booking.paid.paypalCaptureId)}</div>
    </div>
    <div class="bars" aria-hidden="true"></div>
  </div>
</div>
<button onclick="window.print()">Save as PDF or print</button>
</body></html>`;
}

function receiptEmail(booking, who) {
  const text = `Hi${who ? ` ${who}` : ""},\n\nHere is your FlightScout receipt.\n\n${plainReceipt(booking)}\n\nSafe travels!\nScout`;
  const html = `<div style="font-family:Arial,sans-serif;color:#14213d;max-width:560px"><p>Hi${who ? ` ${esc(who)}` : ""},</p><p>Here is your FlightScout receipt.</p><pre style="font-family:inherit;white-space:pre-wrap;background:#f4f6fb;padding:14px;border-radius:8px">${esc(plainReceipt(booking))}</pre><p>Safe travels!<br>Scout</p></div>`;
  return { subject: `Your FlightScout receipt ${booking.reference}`, text, html };
}

module.exports = { ticketPage, receiptEmail, plainReceipt };
